import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { resolveStrictExternalPath } from './unicode_review_external_io.ts';

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

/** Focused test hook; production callers do not need to provide it. */
export interface UnicodeReviewJournalAppendOptions {
  readonly beforeCommit?: () => void;
  readonly afterCommit?: () => void;
}

interface OwnedPath {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
  readonly type: 'file' | 'directory';
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

function recordOwnedPath(path: string, type: OwnedPath['type']): OwnedPath {
  const stat = lstatSync(path);
  assert(type === 'file' ? stat.isFile() : stat.isDirectory(), `expected journal ${type}: ${path}`);
  return { path, device: stat.dev, inode: stat.ino, type };
}

function isStillOwned(path: OwnedPath): boolean {
  try {
    const stat = lstatSync(path.path);
    return (path.type === 'file' ? stat.isFile() : stat.isDirectory()) && stat.dev === path.device && stat.ino === path.inode;
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
  const owned = recordOwnedPath(join(root, LOCK_NAME), 'file');
  const { value } = decodeStrictJson(new Uint8Array(readFileSync(owned.path)), 'journal lock');
  assert(isPlainObject(value), 'journal lock must be an object');
  assertExactKeys(value, ['ownerNonce', 'ownerPid', 'protocolVersion'], 'journal lock');
  assert(typeof value.ownerNonce === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.ownerNonce), 'journal lock owner nonce is invalid');
  assert(Number.isSafeInteger(value.ownerPid) && value.ownerPid > 0, 'journal lock owner PID is invalid');
  assert(value.protocolVersion === UNICODE_REVIEW_JOURNAL_PROTOCOL, 'journal lock has an unsupported protocol');
  return { owned, record: value as LockRecord };
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
    temporary = recordOwnedPath(join(eventsDirectory, entry), 'file');
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
}

function writeExclusiveFile(path: string, contents: string): OwnedPath {
  let descriptor: number | null = null;
  let owned: OwnedPath | null = null;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    owned = recordOwnedPath(path, 'file');
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    return owned;
  } catch (error) {
    if (descriptor !== null) {
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
    throw error;
  }
}

function acquireLock(root: string): { readonly owned: OwnedPath; readonly record: LockRecord } {
  const record: LockRecord = { ownerNonce: randomUUID(), ownerPid: process.pid, protocolVersion: UNICODE_REVIEW_JOURNAL_PROTOCOL };
  const path = join(root, LOCK_NAME);
  try {
    const owned = writeExclusiveFile(path, `${canonicalJson(record)}\n`);
    fsyncDirectory(root);
    return { owned, record };
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

/** Initializes one new external journal root; any pre-existing or dirty root is rejected. */
export function initializeUnicodeReviewJournal(path: string): UnicodeReviewJournalState {
  const root = resolveJournalRoot(path);
  let rootOwnership: OwnedPath | null = null;
  let markerOwnership: OwnedPath | null = null;
  let eventsOwnership: OwnedPath | null = null;
  try {
    mkdirSync(root);
    rootOwnership = recordOwnedPath(root, 'directory');
    markerOwnership = writeExclusiveFile(join(root, MARKER_NAME), `${canonicalJson({ protocolVersion: UNICODE_REVIEW_JOURNAL_PROTOCOL })}\n`);
    mkdirSync(join(root, EVENTS_DIRECTORY_NAME));
    eventsOwnership = recordOwnedPath(join(root, EVENTS_DIRECTORY_NAME), 'directory');
    fsyncDirectory(root);
    return inspectJournal(root, null, null);
  } catch (error) {
    if (eventsOwnership !== null && isStillOwned(eventsOwnership)) rmdirSync(eventsOwnership.path);
    if (markerOwnership !== null && isStillOwned(markerOwnership)) removeOwnedFile(markerOwnership, 'journal protocol marker');
    if (rootOwnership !== null && isStillOwned(rootOwnership)) rmdirSync(rootOwnership.path);
    throw error;
  }
}

/** Loads the authoritative ordered event files and rejects any lock, drift, or unknown artifact. */
export function loadUnicodeReviewJournal(path: string): UnicodeReviewJournalState {
  const root = resolveJournalRoot(path);
  const inspection = inspectJournal(root, null, null);
  return { root: inspection.root, events: inspection.events, tip: inspection.tip };
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
    linkSync(temporary.path, destination);
    fsyncDirectory(join(root, EVENTS_DIRECTORY_NAME));
    options.afterCommit?.();
    removeOwnedFile(temporary, 'journal temporary artifact');
    temporary = null;
    fsyncDirectory(join(root, EVENTS_DIRECTORY_NAME));
    const committed = inspectJournal(root, lock.owned, lock.record.ownerNonce);
    return { root: committed.root, events: committed.events, tip: committed.tip };
  } finally {
    if (temporary !== null && isStillOwned(temporary)) removeOwnedFile(temporary, 'journal temporary artifact');
    removeOwnedFile(lock.owned, 'journal lock');
    fsyncDirectory(root);
  }
}

/** Removes a stopped owner's validated lock and one matching temporary artifact after a full journal replay. */
export function recoverStoppedUnicodeReviewJournalWriter(path: string): UnicodeReviewJournalState {
  const root = resolveJournalRoot(path);
  const lock = readLock(root);
  assert(ownerIsProvablyGone(lock.record.ownerPid), 'journal lock owner is still running or cannot be proven gone');
  const inspection = inspectJournal(root, lock.owned, lock.record.ownerNonce);
  if (inspection.temporary !== null) {
    removeOwnedFile(inspection.temporary, 'journal temporary artifact');
    fsyncDirectory(join(root, EVENTS_DIRECTORY_NAME));
  }
  removeOwnedFile(lock.owned, 'journal lock');
  fsyncDirectory(root);
  return loadUnicodeReviewJournal(root);
}
