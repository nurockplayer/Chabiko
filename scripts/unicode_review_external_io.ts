import { randomUUID } from 'node:crypto';
import {
  linkSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ExternalOutputFile {
  readonly relativePath: string;
  readonly contents: string | Uint8Array;
}

export interface ExternalOutputDirectory {
  readonly directory: string;
  readonly files: readonly ExternalOutputFile[];
}

export interface ExternalOutputTransaction {
  readonly reviewer: ExternalOutputDirectory;
  readonly controller: ExternalOutputDirectory;
}

export interface ExternalOutputResult {
  readonly reviewerDirectory: string;
  readonly controllerDirectory: string;
  readonly reviewerFiles: readonly string[];
  readonly controllerFiles: readonly string[];
}

/** Allows a focused caller test to inject a write failure before data is written. */
export interface ExternalOutputWriteOptions {
  readonly writeFile?: (path: string, contents: string | Uint8Array) => void;
}

interface ResolvedExternalPath {
  readonly canonical: string;
  readonly exists: boolean;
}

interface OwnedPath {
  readonly path: string;
  readonly device: number;
  readonly descriptor: number;
  readonly inode: number;
  readonly type: 'directory';
}

interface FileSnapshot {
  readonly device: number;
  readonly inode: number;
  readonly mode: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly nlink: number;
}

interface OwnedFile {
  readonly aliases: string[];
  readonly intendedBytes: Uint8Array;
  readonly descriptor: number;
  snapshot: FileSnapshot;
}

interface CreatedPaths {
  readonly files: OwnedFile[];
  readonly directories: OwnedPath[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function lstatOrNull(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function isSameOrNested(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..' && !isAbsolute(pathFromParent));
}

function canonicalizeAbsolutePath(path: string, label: string): ResolvedExternalPath {
  assert(typeof path === 'string' && isAbsolute(path), `${label} must be an absolute path`);
  const lexical = resolve(path);
  const missingSegments: string[] = [];
  let existingPath = lexical;

  while (lstatOrNull(existingPath) === null) {
    const parent = dirname(existingPath);
    assert(parent !== existingPath, `${label} has no existing parent`);
    missingSegments.unshift(basename(existingPath));
    existingPath = parent;
  }

  let canonicalExistingPath: string;
  try {
    canonicalExistingPath = realpathSync(existingPath);
  } catch (error) {
    throw new Error(`${label} cannot be resolved through a symlink: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    canonical: missingSegments.reduce((current, segment) => join(current, segment), canonicalExistingPath),
    exists: missingSegments.length === 0,
  };
}

/** Resolves the repository root from this module location, never from process.cwd(). */
export function resolveUnicodeReviewRepositoryRoot(moduleUrl = import.meta.url): string {
  let current = realpathSync(dirname(fileURLToPath(moduleUrl)));
  while (true) {
    if (lstatOrNull(join(current, '.git')) !== null) return current;
    const parent = dirname(current);
    assert(parent !== current, 'Unable to locate the Unicode review repository root from the module location');
    current = parent;
  }
}

function gitCommonDirectory(repositoryRoot: string): string | null {
  const gitEntry = join(repositoryRoot, '.git');
  const stat = lstatOrNull(gitEntry);
  if (stat === null) return null;

  let gitDirectory = gitEntry;
  if (stat.isFile()) {
    const pointer = readFileSync(gitEntry, 'utf8').trim();
    const match = /^gitdir:\s*(.+)$/i.exec(pointer);
    if (match === null) return null;
    gitDirectory = resolve(repositoryRoot, match[1]);
  } else if (!stat.isDirectory()) {
    return null;
  }

  try {
    gitDirectory = realpathSync(gitDirectory);
  } catch {
    return null;
  }

  const commonDirectoryFile = join(gitDirectory, 'commondir');
  if (lstatOrNull(commonDirectoryFile) === null) return gitDirectory;
  const commonDirectory = readFileSync(commonDirectoryFile, 'utf8').trim();
  if (commonDirectory.length === 0) return null;
  try {
    return realpathSync(resolve(gitDirectory, commonDirectory));
  } catch {
    return null;
  }
}

function belongsToCurrentRepository(path: string, currentCommonDirectory: string | null): boolean {
  if (currentCommonDirectory === null) return false;
  let current = path;
  while (true) {
    const commonDirectory = gitCommonDirectory(current);
    if (commonDirectory === currentCommonDirectory) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function assertExternalPath(path: string, label: string): ResolvedExternalPath {
  const resolved = canonicalizeAbsolutePath(path, label);
  const repositoryRoot = resolveUnicodeReviewRepositoryRoot();
  assert(!isSameOrNested(repositoryRoot, resolved.canonical), `${label} must remain outside this worktree`);
  assert(
    !belongsToCurrentRepository(resolved.canonical, gitCommonDirectory(repositoryRoot)),
    `${label} must remain outside every worktree for this repository`,
  );
  return resolved;
}

/** Resolves an absolute repository-external path without creating or reading it. */
export function resolveStrictExternalPath(path: string, label = 'external path'): string {
  return assertExternalPath(path, label).canonical;
}

function assertFreshExternalDirectory(path: string, label: string): string {
  const resolved = assertExternalPath(path, label);
  assert(!resolved.exists, `${label} must not already exist`);
  return resolved.canonical;
}

function assertExternalDirectoryParent(path: string, label: string): void {
  assert(statSync(dirname(path)).isDirectory(), `${label} parent must be an external directory`);
}

function assertFreshExternalFile(path: string, label: string): string {
  const resolved = assertExternalPath(path, label);
  assert(!resolved.exists, `${label} must not already exist`);
  assertExternalDirectoryParent(resolved.canonical, label);
  return resolved.canonical;
}

function normalizeOutputName(value: string, label: string): string {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty relative path`);
  assert(!isAbsolute(value) && !value.includes('\\'), `${label} must be a portable relative path`);
  const segments = value.split('/');
  assert(segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'), `${label} must not traverse directories`);
  const normalized = segments.join('/');
  assert(resolve('/external-output-root', normalized) === join('/external-output-root', normalized), `${label} must not traverse directories`);
  return normalized;
}

function validateFiles(transaction: ExternalOutputTransaction): { reviewer: readonly ExternalOutputFile[]; controller: readonly ExternalOutputFile[] } {
  const names = new Set<string>();
  const normalize = (files: readonly ExternalOutputFile[], group: string): readonly ExternalOutputFile[] => files.map((file, index) => {
    const relativePath = normalizeOutputName(file.relativePath, `${group} output ${index + 1}`);
    assert(!names.has(relativePath), `output names contain duplicate path: ${relativePath}`);
    names.add(relativePath);
    return { ...file, relativePath };
  });
  return { reviewer: normalize(transaction.reviewer.files, 'reviewer'), controller: normalize(transaction.controller.files, 'controller') };
}

function createDirectory(path: string, created: CreatedPaths): void {
  mkdirSync(path);
  created.directories.push(recordOwnedPath(path));
}

function createParents(root: string, relativePath: string, created: CreatedPaths, createdSet: Set<string>): string {
  const segments = relativePath.split('/');
  segments.pop();
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    if (!createdSet.has(current)) {
      createDirectory(current, created);
      createdSet.add(current);
    }
  }
  return join(root, relativePath);
}

function writeExclusiveFile(
  destination: string,
  contents: string | Uint8Array,
  created: CreatedPaths,
  writeFile: (path: string, contents: string | Uint8Array) => void,
): void {
  const temporary = join(dirname(destination), `.${basename(destination)}.partial-${randomUUID()}`);
  const intendedBytes = typeof contents === 'string' ? new TextEncoder().encode(contents) : new Uint8Array(contents);
  const writerContents = typeof contents === 'string' ? contents : new Uint8Array(intendedBytes);
  writeFile(temporary, writerContents);
  const temporaryOwnership = recordOwnedFile(temporary, intendedBytes);
  created.files.push(temporaryOwnership);
  assert(verifyOwnedFile(temporaryOwnership, 1, false), `created output changed before publication: ${temporary}`);
  linkSync(temporary, destination);
  temporaryOwnership.aliases.push(destination);
  assert(verifyOwnedFile(temporaryOwnership, 2, true), `created output changed during publication: ${destination}`);
  assert(verifyOwnedFile(temporaryOwnership, 2, false), `created output changed before staging cleanup: ${destination}`);
  unlinkSync(temporary);
  temporaryOwnership.aliases.splice(temporaryOwnership.aliases.indexOf(temporary), 1);
  assert(verifyOwnedFile(temporaryOwnership, 1, true), `created output changed during staging cleanup: ${destination}`);
}

function fileSnapshot(stat: Stats): FileSnapshot {
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
    nlink: stat.nlink,
  };
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return left.device === right.device && left.inode === right.inode && left.mode === right.mode
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
    && left.nlink === right.nlink;
}

function recordOwnedFile(path: string, intendedBytes: Uint8Array): OwnedFile {
  const pathStat = lstatSync(path);
  assert(pathStat.isFile() && !pathStat.isSymbolicLink() && pathStat.nlink === 1, `expected singly-linked created file: ${path}`);
  const descriptor = openSync(path, 'r');
  try {
    const stat = fstatSync(descriptor);
    assert(stat.isFile() && pathStat.dev === stat.dev && pathStat.ino === stat.ino, `created file identity changed: ${path}`);
    const file: OwnedFile = { aliases: [path], intendedBytes, descriptor, snapshot: fileSnapshot(stat) };
    assert(verifyOwnedFile(file, 1, false), `created file contents or metadata changed: ${path}`);
    return file;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function readDescriptorBytes(descriptor: number, expected: Uint8Array): boolean {
  const buffer = Buffer.alloc(Math.max(1, Math.min(64 * 1024, expected.length + 1)));
  let position = 0;
  while (position < expected.length) {
    const count = Math.min(buffer.length, expected.length - position);
    const read = readSync(descriptor, buffer, 0, count, position);
    if (read === 0) return false;
    for (let index = 0; index < read; index += 1) if (buffer[index] !== expected[position + index]) return false;
    position += read;
  }
  return readSync(descriptor, buffer, 0, 1, expected.length) === 0;
}

/** Validates every alias and the retained original descriptor before adopting an owned link transition. */
function verifyOwnedFile(file: OwnedFile, expectedLinks: number, allowOwnTransition: boolean): boolean {
  if (file.aliases.length !== expectedLinks) return false;
  let before: Stats;
  try {
    before = fstatSync(file.descriptor);
  } catch {
    return false;
  }
  if (!before.isFile()) return false;
  const current = fileSnapshot(before);
  const frozen = file.snapshot;
  if (current.device !== frozen.device || current.inode !== frozen.inode || current.mode !== frozen.mode
    || current.size !== frozen.size || current.mtimeMs !== frozen.mtimeMs || current.nlink !== expectedLinks) return false;
  if (allowOwnTransition) {
    if (Math.abs(current.nlink - frozen.nlink) !== 1) return false;
  } else if (!sameSnapshot(current, frozen)) return false;

  for (const alias of file.aliases) {
    const stat = lstatOrNull(alias);
    if (stat === null || !stat.isFile() || stat.isSymbolicLink()) return false;
    if (!sameSnapshot(fileSnapshot(stat), current)) return false;
  }

  try {
    if (!readDescriptorBytes(file.descriptor, file.intendedBytes)) return false;
    const after = fstatSync(file.descriptor);
    if (!sameSnapshot(fileSnapshot(after), current)) return false;
    for (const alias of file.aliases) {
      const stat = lstatOrNull(alias);
      if (stat === null || !stat.isFile() || !sameSnapshot(fileSnapshot(stat), current)) return false;
    }
  } catch {
    return false;
  }
  if (allowOwnTransition) file.snapshot = current;
  return true;
}

function recordOwnedPath(path: string): OwnedPath {
  const descriptor = openSync(path, 'r');
  try {
    const stat = fstatSync(descriptor);
    assert(stat.isDirectory(), `expected created directory: ${path}`);
    return { path, device: stat.dev, descriptor, inode: stat.ino, type: 'directory' };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function sameLiveIdentity(left: Stats, right: Stats): boolean {
  if (left.dev !== right.dev || left.ino !== right.ino || left.nlink !== right.nlink) return false;
  // ctime moves whenever the inode is unlinked or relinked, so a reused inode
  // (Linux may recycle inode numbers) cannot pass as the descriptor's inode.
  if (left.ctimeMs !== right.ctimeMs) return false;
  return left.size === right.size && left.mode === right.mode;
}

function isStillOwned(path: OwnedPath): boolean {
  const stat = lstatOrNull(path.path);
  if (stat === null) return false;
  if (!stat.isDirectory()) return false;
  let descriptorStat: Stats;
  try {
    descriptorStat = fstatSync(path.descriptor);
  } catch {
    return false;
  }
  if (!descriptorStat.isDirectory()) return false;
  if (descriptorStat.dev !== path.device || descriptorStat.ino !== path.inode) return false;
  // Ownership is decided by comparing the live path entry with the open
  // descriptor, never by device+inode alone: a reused inode has a different
  // link count (the held descriptor sees zero links) and a newer ctime.
  return sameLiveIdentity(stat, descriptorStat);
}

function cleanupCreated(created: CreatedPaths): void {
  for (const file of [...created.files].reverse()) {
    try {
      while (file.aliases.length > 0) {
        const alias = file.aliases[0];
        const expectedLinks = file.aliases.length;
        if (!verifyOwnedFile(file, expectedLinks, false)) break;
        unlinkSync(alias);
        file.aliases.shift();
        if (file.aliases.length > 0 && !verifyOwnedFile(file, file.aliases.length, true)) break;
      }
    } catch {
      // Unknown unlink outcomes and changed files are preserved.
    } finally {
      closeSync(file.descriptor);
    }
  }
  for (const directory of [...created.directories].reverse()) {
    try {
      if (isStillOwned(directory)) rmdirSync(directory.path);
    } catch {
      // A concurrent or unrelated file is preserved rather than removed recursively.
    } finally {
      closeSync(directory.descriptor);
    }
  }
}

function closeCreatedDescriptors(created: CreatedPaths): void {
  for (const file of created.files) {
    try {
      closeSync(file.descriptor);
    } catch {
      // Descriptor cleanup is best effort after the transaction has completed.
    }
  }
  for (const path of created.directories) {
    try {
      closeSync(path.descriptor);
    } catch {
      // Descriptor cleanup is best effort after the transaction has completed.
    }
  }
}

function readExternalRegularBytes(path: string, label: string): Uint8Array {
  const resolved = assertExternalPath(path, label);
  assert(resolved.exists && statSync(resolved.canonical).isFile(), `${label} must be an external regular file`);
  return new Uint8Array(readFileSync(resolved.canonical));
}

/** A strict external JSON artifact could not be decoded or is not unambiguous JSON content. */
export class ExternalJsonContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalJsonContentError';
  }
}

type JsonScanFrame =
  | { readonly kind: 'object'; readonly keys: Set<string>; state: 'key-or-end' | 'colon' | 'value' | 'comma-or-end' }
  | { readonly kind: 'array'; state: 'value-or-end' | 'value' | 'comma-or-end' };

function skipJsonWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t' || text[index] === '\n' || text[index] === '\r')) index += 1;
  return index;
}

function jsonStringEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '"') return index + 1;
    index += 1;
  }
  return text.length;
}

/** Scans already-syntax-validated tokens so duplicate object keys cannot be normalized away. */
function assertNoDuplicateJsonObjectKeys(text: string): void {
  const frames: JsonScanFrame[] = [];
  let index = skipJsonWhitespace(text, 0);
  let rootComplete = false;

  const completeValue = (): void => {
    const parent = frames.at(-1);
    if (parent === undefined) rootComplete = true;
    else parent.state = 'comma-or-end';
  };

  const beginValue = (): void => {
    index = skipJsonWhitespace(text, index);
    const token = text[index];
    if (token === '{') {
      index += 1;
      frames.push({ kind: 'object', keys: new Set(), state: 'key-or-end' });
    } else if (token === '[') {
      index += 1;
      frames.push({ kind: 'array', state: 'value-or-end' });
    } else if (token === '"') {
      index = jsonStringEnd(text, index);
      completeValue();
    } else {
      while (index < text.length && text[index] !== ',' && text[index] !== ']' && text[index] !== '}'
        && text[index] !== ' ' && text[index] !== '\t' && text[index] !== '\n' && text[index] !== '\r') index += 1;
      completeValue();
    }
  };

  while (!rootComplete || frames.length > 0) {
    index = skipJsonWhitespace(text, index);
    const frame = frames.at(-1);
    if (frame === undefined) {
      beginValue();
      continue;
    }

    if (frame.kind === 'object') {
      if (frame.state === 'key-or-end') {
        if (text[index] === '}') {
          index += 1;
          frames.pop();
          completeValue();
          continue;
        }
        const keyStart = index;
        index = jsonStringEnd(text, index);
        const key = JSON.parse(text.slice(keyStart, index)) as string;
        if (frame.keys.has(key)) throw new ExternalJsonContentError(`JSON input contains duplicate object member '${key}'`);
        frame.keys.add(key);
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        index += 1;
        frame.state = 'value';
      } else if (frame.state === 'value') {
        beginValue();
      } else if (text[index] === ',') {
        index += 1;
        frame.state = 'key-or-end';
      } else {
        index += 1;
        frames.pop();
        completeValue();
      }
      continue;
    }

    if (frame.state === 'value-or-end' && text[index] === ']') {
      index += 1;
      frames.pop();
      completeValue();
    } else if (frame.state === 'value-or-end' || frame.state === 'value') {
      beginValue();
    } else if (text[index] === ',') {
      index += 1;
      frame.state = 'value';
    } else {
      index += 1;
      frames.pop();
      completeValue();
    }
  }
}

/** Reads only an absolute, external, regular file, including pinned PNG bytes. */
export function readStrictExternalBytes(path: string): Uint8Array {
  return readExternalRegularBytes(path, 'external bytes input');
}

/** Reads only an absolute, external, regular JSON file. */
export function readStrictExternalJson(path: string): unknown {
  const bytes = readExternalRegularBytes(path, 'JSON input');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new ExternalJsonContentError(`JSON input must contain strict UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ExternalJsonContentError(`JSON input must contain strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertNoDuplicateJsonObjectKeys(text);
  return parsed;
}

/** Writes one fresh external artifact without creating reviewer/controller directories. */
export function writeExclusiveExternalFile(path: string, contents: string | Uint8Array): string {
  const destination = assertFreshExternalFile(path, 'external output file');
  const created: CreatedPaths = { files: [], directories: [] };
  try {
    writeExclusiveFile(destination, contents, created, (temporary, value) => writeFileSync(temporary, value, { flag: 'wx' }));
    closeCreatedDescriptors(created);
    return destination;
  } catch (error) {
    cleanupCreated(created);
    throw error;
  }
}

/** Writes one fresh external JSON artifact, suitable for immutable receipt or checkpoint paths. */
export function writeExclusiveExternalJson(path: string, value: unknown): string {
  const encoded = JSON.stringify(value, null, 2);
  assert(encoded !== undefined, 'external JSON output must be serializable');
  return writeExclusiveExternalFile(path, `${encoded}\n`);
}

/** Writes a single fresh external directory and its files exclusively. */
export function writeExclusiveExternalDirectory(
  transaction: ExternalOutputDirectory,
  options: ExternalOutputWriteOptions = {},
): { readonly directory: string; readonly files: readonly string[] } {
  const directory = assertFreshExternalDirectory(transaction.directory, 'external output directory');
  assertExternalDirectoryParent(directory, 'external output directory');
  const files = validateFiles({ reviewer: transaction, controller: { directory: join(dirname(directory), `.unused-${randomUUID()}`), files: [] } }).reviewer;
  const created: CreatedPaths = { files: [], directories: [] };
  const createdDirectories = new Set<string>();
  const writer = options.writeFile ?? ((path: string, contents: string | Uint8Array) => writeFileSync(path, contents, { flag: 'wx' }));
  try {
    createDirectory(directory, created);
    createdDirectories.add(directory);
    const outputFiles = files.map((file) => {
      const destination = createParents(directory, file.relativePath, created, createdDirectories);
      writeExclusiveFile(destination, file.contents, created, writer);
      return destination;
    });
    closeCreatedDescriptors(created);
    return { directory, files: outputFiles };
  } catch (error) {
    cleanupCreated(created);
    throw error;
  }
}

/**
 * Creates two fresh, non-overlapping external output directories. Every file is
 * staged and linked into place exclusively, so existing files are never overwritten.
 */
export function writeExclusiveExternalOutputs(
  transaction: ExternalOutputTransaction,
  options: ExternalOutputWriteOptions = {},
): ExternalOutputResult {
  const reviewerDirectory = assertFreshExternalDirectory(transaction.reviewer.directory, 'reviewer output directory');
  const controllerDirectory = assertFreshExternalDirectory(transaction.controller.directory, 'controller output directory');
  assert(
    !isSameOrNested(reviewerDirectory, controllerDirectory) && !isSameOrNested(controllerDirectory, reviewerDirectory),
    'reviewer and controller output directories must be distinct and non-nested',
  );
  assertExternalDirectoryParent(reviewerDirectory, 'reviewer output directory');
  assertExternalDirectoryParent(controllerDirectory, 'controller output directory');
  const files = validateFiles(transaction);
  const created: CreatedPaths = { files: [], directories: [] };
  const createdDirectories = new Set<string>();
  const writer = options.writeFile ?? ((path: string, contents: string | Uint8Array) => writeFileSync(path, contents, { flag: 'wx' }));

  try {
    createDirectory(reviewerDirectory, created);
    createdDirectories.add(reviewerDirectory);
    createDirectory(controllerDirectory, created);
    createdDirectories.add(controllerDirectory);

    const writeGroup = (root: string, groupFiles: readonly ExternalOutputFile[]): readonly string[] => groupFiles.map((file) => {
      const destination = createParents(root, file.relativePath, created, createdDirectories);
      writeExclusiveFile(destination, file.contents, created, writer);
      return destination;
    });

    const result = {
      reviewerDirectory,
      controllerDirectory,
      reviewerFiles: writeGroup(reviewerDirectory, files.reviewer),
      controllerFiles: writeGroup(controllerDirectory, files.controller),
    };
    closeCreatedDescriptors(created);
    return result;
  } catch (error) {
    cleanupCreated(created);
    throw error;
  }
}
