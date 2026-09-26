import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveStrictExternalPath, resolveUnicodeReviewRepositoryRoot } from './unicode_review_external_io.ts';

export const UNICODE_REVIEW_JOURNAL_PROTOCOL = 'unicode-review-journal-v1';

const MARKER_NAME = '.unicode-review-journal.json';
const EVENTS_DIRECTORY_NAME = 'events';
const LOCK_NAME = '.unicode-review-journal.lock';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EVENT_NAME_PATTERN = /^(\d{16})\.json$/;
const TEMPORARY_NAME_PATTERN = /^\.(\d{16})\.json\.partial-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export interface UnicodeReviewJournalTip {
  readonly sequence: number;
  readonly digest: string | null;
}

export interface UnicodeReviewJournalEvent {
  readonly sequence: number;
  readonly previousDigest: string | null;
  readonly contentChecksumSha256: string;
  readonly payload: unknown;
  readonly digest: string;
}

export interface UnicodeReviewJournalState {
  readonly root: string;
  readonly events: readonly UnicodeReviewJournalEvent[];
  readonly tip: UnicodeReviewJournalTip;
}

export type UnicodeReviewJournalRecoveryState = 'absent' | 'unlocked-empty' | 'locked-or-populated';

/** Focused test hook; production callers do not need to provide it. */
export interface UnicodeReviewJournalAppendOptions {
  readonly beforeCommit?: () => void;
  readonly afterCommit?: () => void;
}

/** Narrow initialization hooks for crash and filesystem-failure tests. */
export interface UnicodeReviewJournalInitializationOptions {
  readonly beforePublish?: (stagingRoot: string) => void;
  readonly afterPublish?: (canonicalRoot: string) => void;
  readonly fsyncDirectory?: (path: string) => void;
}

/** Runs semantic recovery checks against an owned, structurally valid stopped journal before cleanup. */
export interface UnicodeReviewJournalRecoveryOptions {
  readonly beforeCleanup?: (state: UnicodeReviewJournalState) => void;
}

interface OwnedPath {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
  ctimeMs: number;
  nlink: number;
  size: number;
  mode: number;
  readonly type: 'file' | 'directory';
  descriptor: number | null;
}

interface LockRecord {
  readonly ownerNonce: string;
  readonly ownerPid: number;
  readonly protocolVersion: typeof UNICODE_REVIEW_JOURNAL_PROTOCOL;
}

interface JournalRecord {
  readonly contentChecksumSha256: string;
  readonly payload: unknown;
  readonly previousDigest: string | null;
  readonly sequence: number;
}

interface JournalInspection extends UnicodeReviewJournalState {
  readonly temporary: OwnedPath | null;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJson(value: unknown, active = new Set<object>()): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'journal payload must contain only JSON numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    assert(!active.has(value), 'journal payload must not contain cycles');
    active.add(value);
    const encoded = `[${value.map((item) => canonicalJson(item, active)).join(',')}]`;
    active.delete(value);
    return encoded;
  }
  assert(isPlainObject(value), 'journal payload must contain only JSON values');
  assert(!active.has(value), 'journal payload must not contain cycles');
  active.add(value);
  const encoded = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], active)}`).join(',')}}`;
  active.delete(value);
  return encoded;
}

function decodeStrictJson(bytes: Uint8Array, label: string): { readonly value: unknown; readonly raw: string } {
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} must contain JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(`${canonicalJson(value)}\n` === raw, `${label} must use canonical JSON with one trailing newline`);
  return { value, raw };
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has an unsupported schema`);
}

function recordOwnedPath(path: string, type: OwnedPath['type'], descriptorOrKeepOpen: number | null | boolean = null): OwnedPath {
  const descriptor = typeof descriptorOrKeepOpen === 'boolean' && descriptorOrKeepOpen ? openSync(path, 'r') : typeof descriptorOrKeepOpen === 'number' ? descriptorOrKeepOpen : null;
  try {
    const stat = descriptor === null ? lstatSync(path) : undefined;
    const descriptorStat = descriptor === null ? null : fstatSync(descriptor);
    const typeStat = descriptorStat ?? stat;
    assert(typeStat !== undefined && (type === 'file' ? typeStat.isFile() : typeStat.isDirectory()), `expected journal ${type}: ${path}`);
    return { path, device: typeStat.dev, inode: typeStat.ino, ctimeMs: typeStat.ctimeMs, nlink: typeStat.nlink, size: typeStat.size, mode: typeStat.mode, type, descriptor };
  } catch (error) {
    if (descriptorOrKeepOpen === true && descriptor !== null) closeSync(descriptor);
    throw error;
  }
}

function sameLiveIdentity(left: Stats, right: Stats, type: OwnedPath['type']): boolean {
  if (left.dev !== right.dev || left.ino !== right.ino || left.nlink !== right.nlink) return false;
  // ctime moves whenever the inode is unlinked or relinked, so a reused inode
  // (Linux may recycle inode numbers) cannot pass as the descriptor's inode.
  // Directory ctime changes as the initializer creates and removes its own
  // children, so directory ownership is fenced by the retained inode instead.
  if (type === 'file' && left.ctimeMs !== right.ctimeMs) return false;
  return type === 'directory' || (left.size === right.size && left.mode === right.mode);
}

function isStillOwned(path: OwnedPath): boolean {
  try {
    const stat = lstatSync(path.path);
    if (!(path.type === 'file' ? stat.isFile() : stat.isDirectory()) || stat.dev !== path.device || stat.ino !== path.inode) return false;
    if (path.descriptor === null) {
      // Without a descriptor only the recorded snapshot is available; require it
      // to match as well instead of trusting device+inode alone.
      return stat.nlink === path.nlink
        && (path.type === 'directory' || (stat.ctimeMs === path.ctimeMs && stat.size === path.size && stat.mode === path.mode));
    }
    const descriptorStat = fstatSync(path.descriptor);
    if (!(path.type === 'file' ? descriptorStat.isFile() : descriptorStat.isDirectory())
      || descriptorStat.dev !== path.device || descriptorStat.ino !== path.inode) {
      return false;
    }
    if (path.type === 'file'
      && (stat.nlink !== path.nlink || stat.ctimeMs !== path.ctimeMs || stat.size !== path.size || stat.mode !== path.mode)) return false;
    return sameLiveIdentity(stat, descriptorStat, path.type);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function removeOwnedFile(path: OwnedPath, label: string): void {
  assert(path.type === 'file', `${label} must be a file`);
  assert(isStillOwned(path), `${label} changed ownership and is preserved`);
  unlinkSync(path.path);
}

function releaseOwnedPath(path: OwnedPath | null): void {
  if (path === null || path.descriptor === null) return;
  const descriptor = path.descriptor;
  path.descriptor = null;
  closeSync(descriptor);
}

function refreshOwnedFileSnapshot(path: OwnedPath): void {
  assert(path.type === 'file' && path.descriptor !== null, 'only an open owned file can refresh its identity snapshot');
  const current = fstatSync(path.descriptor);
  assert(current.isFile() && current.dev === path.device && current.ino === path.inode, 'owned file identity changed while writing');
  path.ctimeMs = current.ctimeMs;
  path.nlink = current.nlink;
  path.size = current.size;
  path.mode = current.mode;
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function eventName(sequence: number): string {
  assert(Number.isSafeInteger(sequence) && sequence > 0, 'journal sequence is out of range');
  return `${String(sequence).padStart(16, '0')}.json`;
}

function eventCore(sequence: number, previousDigest: string | null, payload: unknown): string {
  return canonicalJson({ payload, previousDigest, sequence });
}

function encodeJournalRecord(sequence: number, previousDigest: string | null, payload: unknown): { readonly raw: string; readonly digest: string } {
  const core = eventCore(sequence, previousDigest, payload);
  const record: JournalRecord = {
    contentChecksumSha256: sha256(core),
    payload,
    previousDigest,
    sequence,
  };
  const body = canonicalJson(record);
  return { raw: `${body}\n`, digest: sha256(body) };
}

function tipFor(events: readonly UnicodeReviewJournalEvent[]): UnicodeReviewJournalTip {
  const last = events.at(-1);
  return last === undefined ? { sequence: 0, digest: null } : { sequence: last.sequence, digest: last.digest };
}

function resolveJournalRoot(path: string): string {
  return resolveStrictExternalPath(path, 'Unicode review journal root');
}

function assertMarker(root: string): void {
  const marker = join(root, MARKER_NAME);
  const markerPath = recordOwnedPath(marker, 'file');
  const { value } = decodeStrictJson(new Uint8Array(readFileSync(markerPath.path)), 'journal protocol marker');
  assert(isPlainObject(value), 'journal protocol marker must be an object');
  assertExactKeys(value, ['protocolVersion'], 'journal protocol marker');
  assert(value.protocolVersion === UNICODE_REVIEW_JOURNAL_PROTOCOL, 'journal protocol marker has an unsupported protocol');
}

function readLock(root: string): { readonly owned: OwnedPath; readonly record: LockRecord } {
  const owned = recordOwnedPath(join(root, LOCK_NAME), 'file', true);
  try {
    const { value } = decodeStrictJson(new Uint8Array(readFileSync(owned.path)), 'journal lock');
    assert(isPlainObject(value), 'journal lock must be an object');
    assertExactKeys(value, ['ownerNonce', 'ownerPid', 'protocolVersion'], 'journal lock');
    assert(typeof value.ownerNonce === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.ownerNonce), 'journal lock owner nonce is invalid');
    assert(Number.isSafeInteger(value.ownerPid) && value.ownerPid > 0, 'journal lock owner PID is invalid');
    assert(value.protocolVersion === UNICODE_REVIEW_JOURNAL_PROTOCOL, 'journal lock has an unsupported protocol');
    return { owned, record: value as LockRecord };
  } catch (error) {
    releaseOwnedPath(owned);
    throw error;
  }
}

function inspectJournal(root: string, allowedLock: OwnedPath | null, allowedTemporaryNonce: string | null): JournalInspection {
  recordOwnedPath(root, 'directory');
  const rootEntries = readdirSync(root).sort();
  const allowedRootEntries = new Set([MARKER_NAME, EVENTS_DIRECTORY_NAME, LOCK_NAME]);
  for (const entry of rootEntries) {
    assert(allowedRootEntries.has(entry), `journal contains an unknown root entry: ${entry}`);
    if (entry === LOCK_NAME) {
      assert(allowedLock !== null && isStillOwned(allowedLock), 'journal has an in-flight or abandoned lock; explicit recovery is required');
    }
  }
  assert(rootEntries.includes(MARKER_NAME) && rootEntries.includes(EVENTS_DIRECTORY_NAME), 'journal is missing its required layout');
  assertMarker(root);

  const eventsDirectory = join(root, EVENTS_DIRECTORY_NAME);
  recordOwnedPath(eventsDirectory, 'directory');
  const eventNames: string[] = [];
  let temporary: OwnedPath | null = null;
  try {
    for (const entry of readdirSync(eventsDirectory).sort()) {
    const eventMatch = EVENT_NAME_PATTERN.exec(entry);
    if (eventMatch !== null) {
      eventNames.push(entry);
      continue;
    }
    const temporaryMatch = TEMPORARY_NAME_PATTERN.exec(entry);
    assert(temporaryMatch !== null, `journal contains an unknown event entry: ${entry}`);
    assert(allowedTemporaryNonce !== null && temporaryMatch[2] === allowedTemporaryNonce, `journal contains an unowned temporary artifact: ${entry}`);
    assert(temporary === null, 'journal contains multiple in-flight temporary artifacts');
    temporary = recordOwnedPath(join(eventsDirectory, entry), 'file', allowedTemporaryNonce !== null);
    }

    const events: UnicodeReviewJournalEvent[] = [];
    let previousDigest: string | null = null;
    for (let index = 0; index < eventNames.length; index += 1) {
    const name = eventNames[index];
    const sequence = index + 1;
    assert(name === eventName(sequence), `journal event sequence gap or duplicate at ${name}`);
    const path = join(eventsDirectory, name);
    recordOwnedPath(path, 'file');
    const { value } = decodeStrictJson(new Uint8Array(readFileSync(path)), `journal event ${name}`);
    assert(isPlainObject(value), `journal event ${name} must be an object`);
    assertExactKeys(value, ['contentChecksumSha256', 'payload', 'previousDigest', 'sequence'], `journal event ${name}`);
    assert(value.sequence === sequence, `journal event ${name} sequence does not match its filename`);
    assert(value.previousDigest === previousDigest, `journal event ${name} previous digest does not match`);
    assert(typeof value.contentChecksumSha256 === 'string' && SHA256_PATTERN.test(value.contentChecksumSha256), `journal event ${name} content checksum is invalid`);
    const core = eventCore(sequence, previousDigest, value.payload);
    assert(sha256(core) === value.contentChecksumSha256, `journal event ${name} content checksum does not match`);
    const body = canonicalJson(value);
    const digest = sha256(body);
    events.push({
      sequence,
      previousDigest,
      contentChecksumSha256: value.contentChecksumSha256,
      payload: value.payload,
      digest,
    });
    previousDigest = digest;
    }

    if (temporary !== null) {
    const match = TEMPORARY_NAME_PATTERN.exec(basename(temporary.path));
    assert(match !== null, 'journal temporary artifact has an invalid name');
    const temporarySequence = Number(match[1]);
    if (temporarySequence === events.length + 1) {
      // A pre-commit crash leaves only the owned temporary artifact for the next sequence.
    } else if (temporarySequence === events.length && events.length > 0) {
      const committedPath = join(eventsDirectory, eventName(temporarySequence));
      const temporaryBytes = readFileSync(temporary.path);
      const committedBytes = readFileSync(committedPath);
      assert(temporaryBytes.equals(committedBytes), 'journal temporary artifact conflicts with the last committed event');
    } else {
      throw new Error('journal temporary artifact does not match the next or last committed sequence');
    }
    }
    return { root, events, tip: tipFor(events), temporary };
  } catch (error) {
    releaseOwnedPath(temporary);
    throw error;
  }
}

function writeExclusiveFile(path: string, contents: string): OwnedPath {
  let descriptor: number | null = null;
  let owned: OwnedPath | null = null;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    owned = recordOwnedPath(path, 'file', descriptor);
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
    refreshOwnedFileSnapshot(owned);
    descriptor = null;
    return owned;
  } catch (error) {
    if (descriptor !== null && owned === null) {
      try {
        closeSync(descriptor);
      } catch {
        // The original write failure remains authoritative; cleanup stays inode-gated.
      }
    }
    if (owned !== null && isStillOwned(owned)) {
      try {
        removeOwnedFile(owned, 'journal exclusive file');
      } catch {
        // Preserve any replacement or cleanup failure rather than deleting by path.
      }
    }
    releaseOwnedPath(owned);
    throw error;
  }
}

function acquireLock(root: string): { readonly owned: OwnedPath; readonly record: LockRecord } {
  const record: LockRecord = { ownerNonce: randomUUID(), ownerPid: process.pid, protocolVersion: UNICODE_REVIEW_JOURNAL_PROTOCOL };
  const path = join(root, LOCK_NAME);
  try {
    const owned = writeExclusiveFile(path, `${canonicalJson(record)}\n`);
    try {
      fsyncDirectory(root);
      return { owned, record };
    } catch (error) {
      releaseOwnedPath(owned);
      throw error;
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      throw new Error('journal already has an in-flight or abandoned writer lock');
    }
    throw error;
  }
}

function assertExpectedTip(expected: UnicodeReviewJournalTip, actual: UnicodeReviewJournalTip): void {
  assert(isPlainObject(expected), 'expected journal tip is required');
  assert(Number.isSafeInteger(expected.sequence) && expected.sequence >= 0, 'expected journal tip sequence is invalid');
  assert(expected.digest === null || (typeof expected.digest === 'string' && SHA256_PATTERN.test(expected.digest)), 'expected journal tip digest is invalid');
  assert((expected.sequence === 0) === (expected.digest === null), 'expected journal tip must use null digest only for sequence zero');
  assert(expected.sequence === actual.sequence && expected.digest === actual.digest, 'journal expected tip is stale');
}

function ownerIsProvablyGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') return true;
    throw new Error('journal lock owner cannot be proven gone');
  }
}

function assertAbsentJournalDestination(root: string): void {
  try {
    lstatSync(root);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  const error = new Error('journal destination already exists') as Error & { code: string };
  error.code = 'EEXIST';
  throw error;
}

function journalIdentity(path: OwnedPath): { readonly device: number; readonly inode: number } {
  return { device: path.device, inode: path.inode };
}

function invokeExclusiveJournalPublisher(stagingRoot: string, canonicalRoot: string, expected: Record<string, unknown>): void {
  const repositoryRoot = resolveUnicodeReviewRepositoryRoot();
  const helper = join(repositoryRoot, 'scripts', 'publish_unicode_review_journal.py');
  const result = spawnSync('uv', [
    'run', '--locked', '--no-sync', '--project', repositoryRoot,
    'python', helper, stagingRoot, canonicalRoot, JSON.stringify(expected),
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) return;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const error = new Error(`exclusive journal publication failed${output ? `: ${output}` : ''}`) as Error & { code?: string };
  if (result.status === 73 && output.includes('DESTINATION_EXISTS')) error.code = 'EEXIST';
  throw error;
}

function cleanupOwnedDirectory(path: OwnedPath | null): void {
  if (path === null || path.type !== 'directory' || !isStillOwned(path)) return;
  try {
    if (readdirSync(path.path).length === 0) rmdirSync(path.path);
  } catch {
    // A non-empty, replaced, or otherwise changed directory is preserved.
  }
}

/** Initializes one external journal by atomically publishing a complete empty sibling stage. */
export function initializeUnicodeReviewJournal(
  path: string,
  options: UnicodeReviewJournalInitializationOptions = {},
): UnicodeReviewJournalState {
  const root = resolveJournalRoot(path);
  assertAbsentJournalDestination(root);
  const parent = dirname(root);
  const stagingRoot = mkdtempSync(join(parent, `.unicode-review-journal-init-${randomUUID()}-`));
  let stagingOwnership: OwnedPath | null = null;
  let markerOwnership: OwnedPath | null = null;
  let eventsOwnership: OwnedPath | null = null;
  try {
    // Retain the invocation's directory inode before creating any children so
    // all later path-based work can be checked against this exact staging root.
    stagingOwnership = recordOwnedPath(stagingRoot, 'directory', true);
    markerOwnership = writeExclusiveFile(join(stagingRoot, MARKER_NAME), `${canonicalJson({ protocolVersion: UNICODE_REVIEW_JOURNAL_PROTOCOL })}\n`);
    mkdirSync(join(stagingRoot, EVENTS_DIRECTORY_NAME), { mode: 0o700 });
    eventsOwnership = recordOwnedPath(join(stagingRoot, EVENTS_DIRECTORY_NAME), 'directory', true);
    const staged = inspectJournal(stagingRoot, null, null);
    assert(staged.events.length === 0 && staged.tip.sequence === 0 && staged.tip.digest === null, 'journal staging root must be empty');
    (options.fsyncDirectory ?? fsyncDirectory)(join(stagingRoot, EVENTS_DIRECTORY_NAME));
    (options.fsyncDirectory ?? fsyncDirectory)(stagingRoot);
    (options.fsyncDirectory ?? fsyncDirectory)(parent);
    options.beforePublish?.(stagingRoot);
    // The native helper rechecks the retained identities and exact inventory immediately before its no-replace syscall.
    assert(isStillOwned(stagingOwnership), 'journal staging root changed ownership before publication');
    assert(isStillOwned(markerOwnership), 'journal staging marker changed ownership before publication');
    assert(isStillOwned(eventsOwnership), 'journal staging events directory changed ownership before publication');
    assert(JSON.stringify(readdirSync(stagingRoot).sort()) === JSON.stringify([EVENTS_DIRECTORY_NAME, MARKER_NAME].sort()), 'journal staging root inventory changed before publication');
    assert(readdirSync(join(stagingRoot, EVENTS_DIRECTORY_NAME)).length === 0, 'journal staging events directory is not empty');
    invokeExclusiveJournalPublisher(stagingRoot, root, {
      root: journalIdentity(stagingOwnership),
      marker: journalIdentity(markerOwnership),
      events: journalIdentity(eventsOwnership),
    });
    const publishedOwnership = { ...stagingOwnership, path: root };
    assert(isStillOwned(publishedOwnership), 'published journal root identity changed');
    (options.fsyncDirectory ?? fsyncDirectory)(parent);
    options.afterPublish?.(root);
    const state = inspectJournal(root, null, null);
    releaseOwnedPath(eventsOwnership);
    releaseOwnedPath(markerOwnership);
    releaseOwnedPath(stagingOwnership);
    eventsOwnership = null;
    markerOwnership = null;
    stagingOwnership = null;
    return state;
  } catch (error) {
    try {
      cleanupOwnedDirectory(eventsOwnership);
      if (markerOwnership !== null && isStillOwned(markerOwnership)) {
        try {
          removeOwnedFile(markerOwnership, 'journal protocol marker');
        } catch {
          // A replaced or linked marker remains untouched.
        }
      }
      cleanupOwnedDirectory(stagingOwnership);
    } finally {
      releaseOwnedPath(eventsOwnership);
      releaseOwnedPath(markerOwnership);
      releaseOwnedPath(stagingOwnership);
    }
    throw error;
  }
}

/** Loads the authoritative ordered event files and rejects any lock, drift, or unknown artifact. */
export function loadUnicodeReviewJournal(path: string): UnicodeReviewJournalState {
  const root = resolveJournalRoot(path);
  const inspection = inspectJournal(root, null, null);
  return { root: inspection.root, events: inspection.events, tip: inspection.tip };
}

/** Classifies only the safe calibration-first recovery cases without mutating journal state. */
export function inspectUnicodeReviewJournalRecoveryState(path: string): UnicodeReviewJournalRecoveryState {
  const root = resolveJournalRoot(path);
  try {
    const rootStat = lstatSync(root);
    assert(rootStat.isDirectory(), 'journal root must be a real directory');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return 'absent';
    throw error;
  }
  try {
    lstatSync(join(root, LOCK_NAME));
    return 'locked-or-populated';
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const journal = loadUnicodeReviewJournal(root);
  return journal.events.length === 0 && journal.tip.sequence === 0 && journal.tip.digest === null
    ? 'unlocked-empty'
    : 'locked-or-populated';
}

/** Appends exactly one opaque JSON event after checking the caller's current on-disk tip under an exclusive lock. */
export function appendUnicodeReviewJournalEvent(
  path: string,
  expectedTip: UnicodeReviewJournalTip,
  payload: unknown,
  options: UnicodeReviewJournalAppendOptions = {},
): UnicodeReviewJournalState {
  canonicalJson(payload);
  const root = resolveJournalRoot(path);
  const lock = acquireLock(root);
  let temporary: OwnedPath | null = null;
  try {
    const state = inspectJournal(root, lock.owned, lock.record.ownerNonce);
    assertExpectedTip(expectedTip, state.tip);
    const sequence = state.tip.sequence + 1;
    const encoded = encodeJournalRecord(sequence, state.tip.digest, payload);
    const destination = join(root, EVENTS_DIRECTORY_NAME, eventName(sequence));
    const temporaryPath = join(root, EVENTS_DIRECTORY_NAME, `.${eventName(sequence)}.partial-${lock.record.ownerNonce}`);
    temporary = writeExclusiveFile(temporaryPath, encoded.raw);
    options.beforeCommit?.();
    assert(isStillOwned(temporary), 'journal temporary artifact changed ownership and is preserved');
    linkSync(temporary.path, destination);
    // The extra link is the journal commit point and is intentionally removed
    // from the temporary path after the directory entry is durable.
    refreshOwnedFileSnapshot(temporary);
    fsyncDirectory(join(root, EVENTS_DIRECTORY_NAME));
    options.afterCommit?.();
    removeOwnedFile(temporary, 'journal temporary artifact');
    releaseOwnedPath(temporary);
    temporary = null;
    fsyncDirectory(join(root, EVENTS_DIRECTORY_NAME));
    const committed = inspectJournal(root, lock.owned, lock.record.ownerNonce);
    return { root: committed.root, events: committed.events, tip: committed.tip };
  } finally {
    try {
      if (temporary !== null && isStillOwned(temporary)) removeOwnedFile(temporary, 'journal temporary artifact');
      removeOwnedFile(lock.owned, 'journal lock');
      fsyncDirectory(root);
    } finally {
      releaseOwnedPath(temporary);
      releaseOwnedPath(lock.owned);
    }
  }
}

/** Removes a stopped owner's validated lock and one matching temporary artifact after a full journal replay. */
export function recoverStoppedUnicodeReviewJournalWriter(path: string, options: UnicodeReviewJournalRecoveryOptions = {}): UnicodeReviewJournalState {
  const root = resolveJournalRoot(path);
  const lock = readLock(root);
  let inspection: JournalInspection | null = null;
  try {
    assert(ownerIsProvablyGone(lock.record.ownerPid), 'journal lock owner is still running or cannot be proven gone');
    inspection = inspectJournal(root, lock.owned, lock.record.ownerNonce);
    options.beforeCleanup?.({ root: inspection.root, events: inspection.events, tip: inspection.tip });
    if (inspection.temporary !== null) {
      removeOwnedFile(inspection.temporary, 'journal temporary artifact');
      fsyncDirectory(join(root, EVENTS_DIRECTORY_NAME));
    }
    removeOwnedFile(lock.owned, 'journal lock');
    fsyncDirectory(root);
    return { root: inspection.root, events: inspection.events, tip: inspection.tip };
  } finally {
    releaseOwnedPath(inspection?.temporary ?? null);
    releaseOwnedPath(lock.owned);
  }
}
