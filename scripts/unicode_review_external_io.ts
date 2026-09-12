import { randomUUID } from 'node:crypto';
import {
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
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
  readonly inode: number;
  readonly type: 'file' | 'directory';
}

interface CreatedPaths {
  readonly files: OwnedPath[];
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
  created.directories.push(recordOwnedPath(path, 'directory'));
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
  writeFile(temporary, contents);
  const temporaryOwnership = recordOwnedPath(temporary, 'file');
  created.files.push(temporaryOwnership);
  linkSync(temporary, destination);
  created.files.push(recordOwnedPath(destination, 'file'));
  unlinkSync(temporary);
  created.files.splice(created.files.indexOf(temporaryOwnership), 1);
}

function recordOwnedPath(path: string, type: OwnedPath['type']): OwnedPath {
  const stat = lstatSync(path);
  assert(type === 'file' ? stat.isFile() : stat.isDirectory(), `expected created ${type}: ${path}`);
  return { path, device: stat.dev, inode: stat.ino, type };
}

function isStillOwned(path: OwnedPath): boolean {
  const stat = lstatOrNull(path.path);
  if (stat === null) return false;
  const expectedType = path.type === 'file' ? stat.isFile() : stat.isDirectory();
  return expectedType && stat.dev === path.device && stat.ino === path.inode;
}

function cleanupCreated(created: CreatedPaths): void {
  for (const file of [...created.files].reverse()) {
    if (!isStillOwned(file)) continue;
    try {
      unlinkSync(file.path);
    } catch (error) {
      if (!isMissing(error)) continue;
    }
  }
  for (const directory of [...created.directories].reverse()) {
    if (!isStillOwned(directory)) continue;
    try {
      rmdirSync(directory.path);
    } catch {
      // A concurrent or unrelated file is preserved rather than removed recursively.
    }
  }
}

function readExternalRegularBytes(path: string, label: string): Uint8Array {
  const resolved = assertExternalPath(path, label);
  assert(resolved.exists && statSync(resolved.canonical).isFile(), `${label} must be an external regular file`);
  return new Uint8Array(readFileSync(resolved.canonical));
}

/** Reads only an absolute, external, regular file, including pinned PNG bytes. */
export function readStrictExternalBytes(path: string): Uint8Array {
  return readExternalRegularBytes(path, 'external bytes input');
}

/** Reads only an absolute, external, regular JSON file. */
export function readStrictExternalJson(path: string): unknown {
  const bytes = readExternalRegularBytes(path, 'JSON input');
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch (error) {
    throw new Error(`JSON input must contain strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Writes one fresh external artifact without creating reviewer/controller directories. */
export function writeExclusiveExternalFile(path: string, contents: string | Uint8Array): string {
  const destination = assertFreshExternalFile(path, 'external output file');
  const created: CreatedPaths = { files: [], directories: [] };
  try {
    writeExclusiveFile(destination, contents, created, (temporary, value) => writeFileSync(temporary, value, { flag: 'wx' }));
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

    return {
      reviewerDirectory,
      controllerDirectory,
      reviewerFiles: writeGroup(reviewerDirectory, files.reviewer),
      controllerFiles: writeGroup(controllerDirectory, files.controller),
    };
  } catch (error) {
    cleanupCreated(created);
    throw error;
  }
}
