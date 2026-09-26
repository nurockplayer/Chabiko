import { existsSync, fstatSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ExternalJsonContentError,
  readStrictExternalJson,
  readStrictExternalBytes,
  resolveUnicodeReviewRepositoryRoot,
  writeExclusiveExternalFile,
  writeExclusiveExternalDirectory,
  writeExclusiveExternalJson,
  writeExclusiveExternalOutputs,
} from '../scripts/unicode_review_external_io';

const temporaryRoots: string[] = [];

function externalRoot(prefix = 'chabiko-external-io-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function hasRetainedUnlinkedDescriptor(device: number, inode: number): boolean {
  if (process.platform !== 'linux') return true;
  for (const entry of readdirSync('/proc/self/fd')) {
    try {
      const descriptor = Number(entry);
      const stat = fstatSync(descriptor);
      if (stat.dev === device && stat.ino === inode && stat.nlink === 0) return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EBADF') continue;
      throw error;
    }
  }
  return false;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('#477 external Unicode review I/O', () => {
  it('reads only strict absolute external JSON and rejects worktree aliases', () => {
    const root = externalRoot();
    const jsonPath = join(root, 'sealed-key.json');
    writeFileSync(jsonPath, '{"version":1}\n', 'utf8');
    expect(readStrictExternalJson(jsonPath)).toEqual({ version: 1 });
    expect(readStrictExternalBytes(jsonPath)).toEqual(new Uint8Array(Buffer.from('{"version":1}\n')));
    expect(() => readStrictExternalJson('sealed-key.json')).toThrow(/absolute/i);
    expect(() => readStrictExternalJson(root)).toThrow(/regular file/i);
    writeFileSync(join(root, 'invalid.json'), '{not-json}', 'utf8');
    expect(() => readStrictExternalJson(join(root, 'invalid.json'))).toThrow(/strict JSON/i);

    const repositoryRoot = resolveUnicodeReviewRepositoryRoot();
    const alias = join(root, 'worktree-alias');
    symlinkSync(repositoryRoot, alias, 'dir');
    expect(() => readStrictExternalJson(join(alias, 'package.json'))).toThrow(/worktree|repository/i);

    const sharedWorktree = join(root, 'shared-worktree');
    mkdirSync(sharedWorktree);
    const repositoryGitPath = join(repositoryRoot, '.git');
    const gitPointer = lstatSync(repositoryGitPath).isDirectory()
      ? `gitdir: ${realpathSync(repositoryGitPath)}\n`
      : readFileSync(repositoryGitPath, 'utf8');
    writeFileSync(join(sharedWorktree, '.git'), gitPointer, 'utf8');
    writeFileSync(join(sharedWorktree, 'receipt.json'), '{"shared":true}', 'utf8');
    expect(() => readStrictExternalJson(join(sharedWorktree, 'receipt.json'))).toThrow(/every worktree/i);
  });

  it('preserves valid JSON values and rejects duplicate decoded member names at every nesting level', () => {
    const root = externalRoot();
    const prettyPath = join(root, 'pretty.json');
    writeFileSync(prettyPath, '{\n  "top": {"same": 1, "nested": [{"same": 2}]},\n  "array": [true, null]\n}\n', 'utf8');
    expect(readStrictExternalJson(prettyPath)).toEqual({ top: { same: 1, nested: [{ same: 2 }] }, array: [true, null] });

    for (const [name, contents] of [
      ['root duplicate', '{"pairRef":"first","pairRef":"second"}'],
      ['escaped-equivalent duplicate', '{"controllerControlId":"first","controller\\u0043ontrolId":"second"}'],
      ['nested duplicate in object', '{"outer":{"key":1,"key":2}}'],
      ['duplicate inside array object', '[{"outer":[{"pairRef":"first","pairRef":"second"}]}]'],
    ] as const) {
      const path = join(root, `${name.replaceAll(' ', '-')}.json`);
      writeFileSync(path, contents, 'utf8');
      expect(() => readStrictExternalJson(path), name).toThrow(ExternalJsonContentError);
      expect(() => readStrictExternalJson(path), name).toThrow(/duplicate object member/i);
    }
  });

  it('types only strict JSON content failures and leaves file-read errors unchanged', () => {
    const root = externalRoot();
    const malformed = join(root, 'malformed.json');
    writeFileSync(malformed, '{"items":[}', 'utf8');
    expect(() => readStrictExternalJson(malformed)).toThrow(ExternalJsonContentError);

    const invalidUtf8 = join(root, 'invalid-utf8.json');
    writeFileSync(invalidUtf8, Uint8Array.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xc3, 0x28, 0x7d]));
    expect(() => readStrictExternalJson(invalidUtf8)).toThrow(ExternalJsonContentError);

    try {
      readStrictExternalJson(join(root, 'missing.json'));
      throw new Error('missing external file unexpectedly read');
    } catch (error) {
      expect(error).not.toBeInstanceOf(ExternalJsonContentError);
      expect(error).toMatchObject({ message: expect.stringMatching(/external regular file/i) });
    }
  });

  it('reads and writes standalone external PNG, receipt, and checkpoint artifacts exclusively', () => {
    const root = externalRoot();
    const pngPath = writeExclusiveExternalFile(join(root, 'pinned.png'), new Uint8Array([137, 80, 78, 71]));
    expect(readStrictExternalBytes(pngPath)).toEqual(new Uint8Array([137, 80, 78, 71]));
    const checkpointPath = writeExclusiveExternalJson(join(root, 'checkpoint-0001.json'), { status: 'pending', receipt: null });
    expect(readStrictExternalJson(checkpointPath)).toEqual({ status: 'pending', receipt: null });
    expect(() => writeExclusiveExternalFile(pngPath, new Uint8Array([0]))).toThrow(/must not already exist/i);
    expect(() => writeExclusiveExternalJson(join(resolveUnicodeReviewRepositoryRoot(), 'checkpoint.json'), {})).toThrow(/worktree|repository/i);
  });

  it('derives repository safety from module location when the caller changes cwd', () => {
    const root = externalRoot();
    const alternateCwd = join(root, 'caller-cwd');
    mkdirSync(alternateCwd);
    const jsonPath = join(root, 'receipt.json');
    writeFileSync(jsonPath, '{"receipt":"external"}', 'utf8');
    const originalCwd = process.cwd();
    try {
      process.chdir(alternateCwd);
      expect(readStrictExternalJson(jsonPath)).toEqual({ receipt: 'external' });
      const result = writeExclusiveExternalOutputs({
        reviewer: { directory: join(root, 'reviewer'), files: [{ relativePath: 'pixels/pair.png', contents: new Uint8Array([137, 80, 78, 71]) }] },
        controller: { directory: join(root, 'controller'), files: [{ relativePath: 'receipt.json', contents: '{"ok":true}\n' }] },
      });
      expect(result.reviewerFiles).toEqual([join(realpathSync(root), 'reviewer', 'pixels', 'pair.png')]);
      expect(readFileSync(result.controllerFiles[0], 'utf8')).toBe('{"ok":true}\n');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('does not confuse a path-prefix sibling with the repository and preserves dirty neighbours', () => {
    const repositoryRoot = resolveUnicodeReviewRepositoryRoot();
    const siblingRoot = mkdtempSync(join(dirname(repositoryRoot), `${basename(repositoryRoot)}-external-`));
    temporaryRoots.push(siblingRoot);
    const neighbour = join(siblingRoot, 'keep.txt');
    writeFileSync(neighbour, 'keep', 'utf8');
    const result = writeExclusiveExternalOutputs({
      reviewer: { directory: join(siblingRoot, 'reviewer'), files: [{ relativePath: 'bundle.json', contents: '{}' }] },
      controller: { directory: join(siblingRoot, 'controller'), files: [{ relativePath: 'sidecar.json', contents: '{}' }] },
    });
    expect(existsSync(result.reviewerFiles[0])).toBe(true);
    expect(readFileSync(neighbour, 'utf8')).toBe('keep');
  });

  it('rejects nested, aliased, pre-existing, duplicate, and traversal output destinations before writing', () => {
    const root = externalRoot();
    const reviewer = join(root, 'reviewer');
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: reviewer, files: [] },
      controller: { directory: join(reviewer, 'controller'), files: [] },
    })).toThrow(/non-nested/i);

    const realParent = join(root, 'real-parent');
    mkdirSync(realParent);
    const aliasParent = join(root, 'alias-parent');
    symlinkSync(realParent, aliasParent, 'dir');
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: join(realParent, 'reviewer'), files: [] },
      controller: { directory: join(aliasParent, 'reviewer'), files: [] },
    })).toThrow(/distinct|non-nested/i);

    mkdirSync(reviewer);
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: reviewer, files: [] },
      controller: { directory: join(root, 'controller'), files: [] },
    })).toThrow(/must not already exist/i);
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: join(root, 'fresh-reviewer'), files: [{ relativePath: 'bundle.json', contents: '{}' }] },
      controller: { directory: join(root, 'fresh-controller'), files: [{ relativePath: 'bundle.json', contents: '{}' }] },
    })).toThrow(/duplicate/i);
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: join(root, 'traversal-reviewer'), files: [{ relativePath: '../bundle.json', contents: '{}' }] },
      controller: { directory: join(root, 'traversal-controller'), files: [] },
    })).toThrow(/traverse/i);
  });

  it('rolls back only paths it created and preserves collision or replacement files', () => {
    const root = externalRoot();
    const neighbour = join(root, 'unrelated.txt');
    writeFileSync(neighbour, 'preserve', 'utf8');
    let writes = 0;
    expect(() => writeExclusiveExternalOutputs({
      reviewer: {
        directory: join(root, 'reviewer'),
        files: [
          { relativePath: 'first.json', contents: '{"first":true}' },
          { relativePath: 'second.json', contents: '{"second":true}' },
        ],
      },
      controller: { directory: join(root, 'controller'), files: [] },
    }, {
      writeFile(path, contents) {
        writes += 1;
        if (writes === 2) throw new Error('injected partial write failure');
        writeFileSync(path, contents, { flag: 'wx' });
      },
    })).toThrow(/partial write failure/);
    expect(existsSync(join(root, 'reviewer'))).toBe(false);
    expect(existsSync(join(root, 'controller'))).toBe(false);
    expect(readFileSync(neighbour, 'utf8')).toBe('preserve');

    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: join(root, 'race-reviewer'), files: [{ relativePath: 'bundle.json', contents: '{}' }] },
      controller: { directory: join(root, 'race-controller'), files: [] },
    }, {
      writeFile(path, contents) {
        writeFileSync(path, contents, { flag: 'wx' });
        writeFileSync(join(dirname(path), 'bundle.json'), 'racer', { flag: 'wx' });
      },
    })).toThrow();
    expect(readFileSync(join(root, 'race-reviewer', 'bundle.json'), 'utf8')).toBe('racer');

    let failedTemporaryPath = '';
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: join(root, 'failure-reviewer'), files: [{ relativePath: 'bundle.json', contents: '{}' }] },
      controller: { directory: join(root, 'failure-controller'), files: [] },
    }, {
      writeFile(path, contents) {
        failedTemporaryPath = path;
        writeFileSync(path, 'unowned collision', { flag: 'wx' });
        writeFileSync(path, contents, { flag: 'wx' });
      },
    })).toThrow(/EEXIST/);
    expect(readFileSync(failedTemporaryPath, 'utf8')).toBe('unowned collision');

    let firstDestination = '';
    let replacementWrites = 0;
    expect(() => writeExclusiveExternalOutputs({
      reviewer: {
        directory: join(root, 'replacement-reviewer'),
        files: [
          { relativePath: 'first.json', contents: '{"first":true}' },
          { relativePath: 'second.json', contents: '{"second":true}' },
        ],
      },
      controller: { directory: join(root, 'replacement-controller'), files: [] },
    }, {
      writeFile(path, contents) {
        replacementWrites += 1;
        if (replacementWrites === 1) {
          firstDestination = join(dirname(path), 'first.json');
          writeFileSync(path, contents, { flag: 'wx' });
          return;
        }
        unlinkSync(firstDestination);
        writeFileSync(firstDestination, 'replacement', { flag: 'wx' });
        throw new Error('writer replaced an earlier output');
      },
    })).toThrow(/replaced an earlier output/);
    expect(readFileSync(firstDestination, 'utf8')).toBe('replacement');
  });

  it('retains the owned output descriptor while preserving a replacement', () => {
    const root = externalRoot();
    let firstDestination = '';
    let originalDevice = -1;
    let originalInode = -1;
    let replacementInode = -1;
    expect(() => writeExclusiveExternalOutputs({
      reviewer: {
        directory: join(root, 'inode-reviewer'),
        files: [
          { relativePath: 'first.json', contents: '{"first":true}' },
          { relativePath: 'second.json', contents: '{"second":true}' },
        ],
      },
      controller: { directory: join(root, 'inode-controller'), files: [] },
    }, {
      writeFile(path, contents) {
        if (firstDestination === '') {
          firstDestination = join(dirname(path), 'first.json');
          writeFileSync(path, contents, { flag: 'wx' });
          return;
        }
        const original = lstatSync(firstDestination);
        originalDevice = original.dev;
        originalInode = original.ino;
        unlinkSync(firstDestination);
        writeFileSync(firstDestination, 'replacement', { flag: 'wx' });
        replacementInode = lstatSync(firstDestination).ino;
        expect(hasRetainedUnlinkedDescriptor(originalDevice, originalInode)).toBe(true);
        throw new Error('writer replaced an earlier output');
      },
    })).toThrow(/replaced an earlier output/);
    expect(readFileSync(firstDestination, 'utf8')).toBe('replacement');
    // The writer retains an FD for the owned output through rollback. On Linux,
    // that makes the unlinked inode ineligible for reuse by the replacement.
    if (process.platform === 'linux') expect(replacementInode).not.toBe(originalInode);
  });

  it('preserves registered outputs after same-inode content, truncation, binary, or mode edits', () => {
    for (const mutation of ['same-length', 'truncate', 'binary', 'mode'] as const) {
      if (mutation === 'mode' && process.platform === 'win32') continue;
      const root = externalRoot(`chabiko-external-${mutation}-`);
      const first = join(root, 'reviewer', 'first.bin');
      let writes = 0;
      let changedMode = -1;
      let caught = false;
      try {
        writeExclusiveExternalOutputs({
          reviewer: { directory: join(root, 'reviewer'), files: [
            { relativePath: 'first.bin', contents: new Uint8Array([1, 2, 3, 4]) },
            { relativePath: 'second.bin', contents: new Uint8Array([5]) },
          ] },
          controller: { directory: join(root, 'controller'), files: [] },
        }, {
          writeFile(path, contents) {
            writes += 1;
            if (writes === 2) {
              if (mutation === 'same-length') writeFileSync(first, new Uint8Array([9, 8, 7, 6]));
              else if (mutation === 'truncate') writeFileSync(first, new Uint8Array([1, 2]));
              else if (mutation === 'binary') writeFileSync(first, new Uint8Array([1, 2, 3, 9]));
              else {
                changedMode = (lstatSync(first).mode & 0o777) ^ 0o040;
                fs.chmodSync(first, changedMode);
              }
              throw new Error(`foreign ${mutation} mutation`);
            }
            writeFileSync(path, contents, { flag: 'wx' });
          },
        });
      } catch (error) {
        caught = error instanceof Error && error.message === `foreign ${mutation} mutation`;
      }
      expect(caught, mutation).toBe(true);
      expect(existsSync(first), mutation).toBe(true);
      if (mutation === 'same-length') expect([...readFileSync(first)]).toEqual([9, 8, 7, 6]);
      if (mutation === 'truncate') expect([...readFileSync(first)]).toEqual([1, 2]);
      if (mutation === 'binary') expect([...readFileSync(first)]).toEqual([1, 2, 3, 9]);
      if (mutation === 'mode') expect(lstatSync(first).mode & 0o777).toBe(changedMode);
    }
  });

  it('keeps the supplied single-output post-link mutation and clean alias-failure cases fail closed', () => {
    const root = externalRoot();
    const destination = join(root, 'single.json');
    const originalUnlink = fs.unlinkSync;
    let tempPath = '';
    let injected = false;
    try {
      fs.unlinkSync = ((path: fs.PathLike) => {
        if (!injected && String(path).includes('.single.json.partial-')) {
          injected = true;
          writeFileSync(destination, 'foreign-in-place-edit');
          throw new Error('injected temporary alias removal failure');
        }
        return originalUnlink(path);
      }) as typeof fs.unlinkSync;
      syncBuiltinESMExports();
      expect(() => writeExclusiveExternalJson(destination, { intended: true })).toThrow(/temporary alias removal failure/);
      expect(readFileSync(destination, 'utf8')).toBe('foreign-in-place-edit');
      tempPath = readdirSync(root).find((name) => name.includes('.single.json.partial-')) ?? '';
      expect(tempPath).not.toBe('');
      expect(existsSync(join(root, tempPath))).toBe(true);
    } finally {
      fs.unlinkSync = originalUnlink;
      syncBuiltinESMExports();
    }

    const cleanRoot = externalRoot();
    const cleanDestination = join(cleanRoot, 'clean.json');
    const cleanOriginalUnlink = fs.unlinkSync;
    let failOnce = true;
    try {
      fs.unlinkSync = ((path: fs.PathLike) => {
        if (failOnce && String(path).includes('.clean.json.partial-')) {
          failOnce = false;
          throw new Error('injected clean alias removal failure');
        }
        return cleanOriginalUnlink(path);
      }) as typeof fs.unlinkSync;
      syncBuiltinESMExports();
      expect(() => writeExclusiveExternalJson(cleanDestination, { intended: true })).toThrow(/clean alias removal failure/);
      expect(existsSync(cleanDestination)).toBe(false);
      expect(readdirSync(cleanRoot)).toEqual([]);
    } finally {
      fs.unlinkSync = cleanOriginalUnlink;
      syncBuiltinESMExports();
    }
  });

  it('copies mutable byte input and rejects hard-linked or symlink staging before registration', () => {
    const root = externalRoot();
    const callerBytes = new Uint8Array([4, 5, 6]);
    const copyResult = writeExclusiveExternalDirectory({
      directory: join(root, 'copy-dir'),
      files: [{ relativePath: 'copied.bin', contents: callerBytes }],
    }, {
      writeFile(path, contents) {
        writeFileSync(path, contents, { flag: 'wx' });
        (contents as Uint8Array)[0] = 99;
      },
    });
    const copiedPath = copyResult.files[0];
    expect(callerBytes).toEqual(new Uint8Array([4, 5, 6]));
    expect([...readFileSync(copiedPath)]).toEqual([4, 5, 6]);

    const hardlinkRoot = join(root, 'hardlink-stage');
    let hardlinkTemp = '';
    const foreignAlias = join(root, 'foreign-link.bin');
    expect(() => writeExclusiveExternalDirectory({
      directory: hardlinkRoot,
      files: [{ relativePath: 'artifact.bin', contents: new Uint8Array([1, 2]) }],
    }, {
      writeFile(path, contents) {
        hardlinkTemp = path;
        writeFileSync(path, contents, { flag: 'wx' });
        fs.linkSync(path, foreignAlias);
      },
    })).toThrow(/singly-linked/i);
    expect(existsSync(hardlinkTemp)).toBe(true);
    expect(existsSync(foreignAlias)).toBe(true);

    const symlinkRoot = join(root, 'symlink-stage');
    const foreignTarget = join(root, 'foreign-target.txt');
    writeFileSync(foreignTarget, 'keep');
    let symlinkTemp = '';
    expect(() => writeExclusiveExternalDirectory({
      directory: symlinkRoot,
      files: [{ relativePath: 'artifact.bin', contents: 'intended' }],
    }, {
      writeFile(path) {
        symlinkTemp = path;
        symlinkSync(foreignTarget, path);
      },
    })).toThrow(/singly-linked/i);
    expect(lstatSync(symlinkTemp).isSymbolicLink()).toBe(true);
    expect(readFileSync(foreignTarget, 'utf8')).toBe('keep');
  });

  it('preserves a newly-added foreign hard link instead of rolling back a published file', () => {
    const root = externalRoot();
    const destination = join(root, 'reviewer', 'first.bin');
    const foreignAlias = join(root, 'foreign-alias.bin');
    let writes = 0;
    expect(() => writeExclusiveExternalOutputs({
      reviewer: { directory: join(root, 'reviewer'), files: [
        { relativePath: 'first.bin', contents: new Uint8Array([1, 2]) },
        { relativePath: 'second.bin', contents: new Uint8Array([3]) },
      ] },
      controller: { directory: join(root, 'controller'), files: [] },
    }, {
      writeFile(path, contents) {
        writes += 1;
        if (writes === 2) {
          fs.linkSync(destination, foreignAlias);
          throw new Error('later write failed');
        }
        writeFileSync(path, contents, { flag: 'wx' });
      },
    })).toThrow(/later write failed/);
    expect([...readFileSync(destination)]).toEqual([1, 2]);
    expect([...readFileSync(foreignAlias)]).toEqual([1, 2]);
  });

  it('preserves an unexpected hard link added during publication', () => {
    const root = externalRoot();
    const destination = join(root, 'reviewer', 'artifact.bin');
    const foreignAlias = join(root, 'foreign-transition-alias.bin');
    const originalLink = fs.linkSync;
    let injected = false;
    try {
      fs.linkSync = ((source: fs.PathLike, target: fs.PathLike) => {
        if (!injected && String(source).includes('.artifact.bin.partial-')) {
          injected = true;
          originalLink(source, foreignAlias);
        }
        return originalLink(source, target);
      }) as typeof fs.linkSync;
      syncBuiltinESMExports();
      expect(() => writeExclusiveExternalDirectory({
        directory: join(root, 'reviewer'),
        files: [{ relativePath: 'artifact.bin', contents: new Uint8Array([7, 8]) }],
      })).toThrow(/changed during publication/);
      expect([...readFileSync(destination)]).toEqual([7, 8]);
      expect([...readFileSync(foreignAlias)]).toEqual([7, 8]);
    } finally {
      fs.linkSync = originalLink;
      syncBuiltinESMExports();
    }
  });

  it('preserves a destination symlink collision and its foreign target before publication', () => {
    const root = externalRoot();
    const reviewer = join(root, 'reviewer');
    const target = join(root, 'foreign-target.txt');
    const destination = join(reviewer, 'artifact.bin');
    writeFileSync(target, 'foreign target');
    expect(() => writeExclusiveExternalDirectory({
      directory: reviewer,
      files: [{ relativePath: 'artifact.bin', contents: 'intended' }],
    }, {
      writeFile(path, contents) {
        writeFileSync(path, contents, { flag: 'wx' });
        symlinkSync(target, destination);
      },
    })).toThrow(/EEXIST/);
    expect(lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('foreign target');
  });
});
