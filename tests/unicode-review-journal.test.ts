import { closeSync, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdtempSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  UNICODE_REVIEW_JOURNAL_PROTOCOL,
  appendUnicodeReviewJournalEvent,
  initializeUnicodeReviewJournal,
  inspectUnicodeReviewJournalRecoveryState,
  loadUnicodeReviewJournal,
  recoverStoppedUnicodeReviewJournalWriter,
} from '../scripts/unicode_review_journal';

const temporaryRoots: string[] = [];

function externalRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-unicode-journal-'));
  temporaryRoots.push(root);
  return root;
}

function eventPath(root: string, sequence: number): string {
  return join(root, 'events', `${String(sequence).padStart(16, '0')}.json`);
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

function writeLock(root: string, ownerPid: number, ownerNonce: string): void {
  writeFileSync(
    join(root, '.unicode-review-journal.lock'),
    `{"ownerNonce":"${ownerNonce}","ownerPid":${ownerPid},"protocolVersion":"${UNICODE_REVIEW_JOURNAL_PROTOCOL}"}\n`,
    { flag: 'wx' },
  );
}

function stoppedProcessPid(): number {
  const result = spawnSync(process.execPath, ['-e', '']);
  expect(result.status).toBe(0);
  expect(result.pid).toBeTypeOf('number');
  return result.pid as number;
}

function crashAfterCommit(root: string, expectedTip: unknown): void {
  const journalModule = pathToFileURL(join(process.cwd(), 'scripts', 'unicode_review_journal.ts')).href;
  const source = [
    `import { appendUnicodeReviewJournalEvent } from ${JSON.stringify(journalModule)};`,
    `appendUnicodeReviewJournalEvent(${JSON.stringify(root)}, ${JSON.stringify(expectedTip)}, { opaque: 'committed-before-cleanup' }, { afterCommit() { process.exit(86); } });`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', source]);
  expect(result.status).toBe(86);
}

function runJournalChild(body: string): { readonly status: number | null; readonly output: string } {
  const journalModule = pathToFileURL(join(process.cwd(), 'scripts', 'unicode_review_journal.ts')).href;
  const source = [
    `import fs from 'node:fs';`,
    `import { syncBuiltinESMExports } from 'node:module';`,
    `import { join } from 'node:path';`,
    `const journalModuleUrl = ${JSON.stringify(journalModule)};`,
    body,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', source], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('#477 restart-safe Unicode review journal', () => {
  it('initializes one fresh external root and never overwrites a journal or dirty caller root', () => {
    const parent = externalRoot();
    const journal = join(parent, 'journal');
    const state = initializeUnicodeReviewJournal(journal);
    expect(state.tip).toEqual({ sequence: 0, digest: null });
    const marker = readFileSync(join(journal, '.unicode-review-journal.json'), 'utf8');
    expect(() => initializeUnicodeReviewJournal(journal)).toThrow(/exist|journal/i);
    expect(readFileSync(join(journal, '.unicode-review-journal.json'), 'utf8')).toBe(marker);

    const dirty = join(parent, 'dirty');
    mkdirSync(dirty);
    writeFileSync(join(dirty, 'keep.txt'), 'preserve');
    expect(() => initializeUnicodeReviewJournal(dirty)).toThrow(/exist|EEXIST/i);
    expect(readFileSync(join(dirty, 'keep.txt'), 'utf8')).toBe('preserve');
    for (const kind of ['file', 'symlink'] as const) {
      const foreign = join(parent, `foreign-${kind}`);
      if (kind === 'file') writeFileSync(foreign, 'keep');
      else symlinkSync(marker, foreign);
      expect(() => initializeUnicodeReviewJournal(foreign)).toThrow();
      expect(lstatSync(foreign).isSymbolicLink()).toBe(kind === 'symlink');
    }
  });

  it('cleans its own pre-publication failure, preserves crash staging, and never rolls back a published root', () => {
    const parent = externalRoot();
    const journal = join(parent, 'journal');
    expect(() => initializeUnicodeReviewJournal(journal, { beforePublish: () => { throw new Error('injected pre-publish failure'); } })).toThrow(/injected pre-publish failure/);
    expect(existsSync(journal)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);

    const moduleUrl = pathToFileURL(join(process.cwd(), 'scripts', 'unicode_review_journal.ts')).href;
    const crashBefore = [
      `import { initializeUnicodeReviewJournal } from ${JSON.stringify(moduleUrl)};`,
      `initializeUnicodeReviewJournal(${JSON.stringify(journal)}, { beforePublish() { process.exit(86); } });`,
    ].join('\n');
    expect(spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', crashBefore]).status).toBe(86);
    expect(existsSync(journal)).toBe(false);
    expect(readdirSync(parent)).toHaveLength(1);
    const abandonedStage = readdirSync(parent)[0];
    const abandoned = loadUnicodeReviewJournal(join(parent, abandonedStage));
    expect(abandoned.events).toEqual([]);
    expect(abandoned.tip).toEqual({ sequence: 0, digest: null });

    const crashAfter = [
      `import { initializeUnicodeReviewJournal } from ${JSON.stringify(moduleUrl)};`,
      `initializeUnicodeReviewJournal(${JSON.stringify(journal)}, { afterPublish() { process.exit(87); } });`,
    ].join('\n');
    expect(spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', crashAfter]).status).toBe(87);
    expect(inspectUnicodeReviewJournalRecoveryState(journal)).toBe('unlocked-empty');
    expect(() => initializeUnicodeReviewJournal(journal)).toThrow(/exist|journal/i);
    expect(inspectUnicodeReviewJournalRecoveryState(journal)).toBe('unlocked-empty');
  });

  it('fails closed on directory fsync errors before publication and preserves the canonical root after publication', () => {
    const parent = externalRoot();
    const before = join(parent, 'before');
    let beforeSyncs = 0;
    expect(() => initializeUnicodeReviewJournal(before, { fsyncDirectory: () => { if (++beforeSyncs === 2) throw new Error('injected directory fsync failure'); } })).toThrow(/injected directory fsync failure/);
    expect(existsSync(before)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);

    const after = join(parent, 'after');
    let afterSyncs = 0;
    expect(() => initializeUnicodeReviewJournal(after, { fsyncDirectory: (path) => {
      if (++afterSyncs === 4) throw new Error('injected post-publish parent fsync failure');
      const descriptor = openSync(path, 'r');
      try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    } })).toThrow(/post-publish parent fsync failure/);
    expect(loadUnicodeReviewJournal(after).tip).toEqual({ sequence: 0, digest: null });
  });

  it('preserves foreign replacements, linked markers, and replaced staging roots', () => {
    const parent = externalRoot();
    const replacedMarker = join(parent, 'replaced-marker');
    let markerStage = '';
    expect(() => initializeUnicodeReviewJournal(replacedMarker, { beforePublish: (stage) => {
      markerStage = stage;
      unlinkSync(join(stage, '.unicode-review-journal.json'));
      writeFileSync(join(stage, '.unicode-review-journal.json'), 'foreign marker');
    } })).toThrow(/changed ownership|inventory changed/);
    expect(readFileSync(join(markerStage, '.unicode-review-journal.json'), 'utf8')).toBe('foreign marker');
    expect(existsSync(replacedMarker)).toBe(false);

    const linkedMarker = join(parent, 'linked-marker');
    let linkedStage = '';
    expect(() => initializeUnicodeReviewJournal(linkedMarker, { beforePublish: (stage) => {
      linkedStage = stage;
      linkSync(join(stage, '.unicode-review-journal.json'), join(parent, 'foreign-marker-link'));
    } })).toThrow(/singly linked|publication failed|changed ownership/);
    expect(existsSync(join(parent, 'foreign-marker-link'))).toBe(true);
    expect(existsSync(join(linkedStage, '.unicode-review-journal.json'))).toBe(true);
    expect(existsSync(linkedMarker)).toBe(false);

    const replacedRoot = join(parent, 'replaced-root');
    let abandonedStage = '';
    let foreignStage = '';
    expect(() => initializeUnicodeReviewJournal(replacedRoot, { beforePublish: (stage) => {
      abandonedStage = `${stage}-owned-away`;
      foreignStage = stage;
      renameSync(stage, abandonedStage);
      mkdirSync(foreignStage);
      writeFileSync(join(foreignStage, 'foreign.txt'), 'preserve');
    } })).toThrow(/changed ownership/);
    expect(readFileSync(join(foreignStage, 'foreign.txt'), 'utf8')).toBe('preserve');
    expect(existsSync(join(abandonedStage, '.unicode-review-journal.json'))).toBe(true);
    expect(existsSync(replacedRoot)).toBe(false);
  });

  it('allows exactly one concurrent initializer to publish without replacing the winner', async () => {
    const parent = externalRoot();
    const journal = join(parent, 'journal');
    const moduleUrl = pathToFileURL(join(process.cwd(), 'scripts', 'unicode_review_journal.ts')).href;
    const source = `import { initializeUnicodeReviewJournal } from ${JSON.stringify(moduleUrl)}; try { initializeUnicodeReviewJournal(${JSON.stringify(journal)}); process.exit(0); } catch (error) { if (error && error.code === 'EEXIST') process.exit(73); throw error; }`;
    const launch = () => new Promise<number>((resolveExit, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', source], { stdio: 'ignore' });
      child.once('error', reject);
      child.once('exit', (code) => resolveExit(code ?? -1));
    });
    const codes = await Promise.all([launch(), launch()]);
    expect(codes.sort()).toEqual([0, 73]);
    expect(loadUnicodeReviewJournal(journal).tip).toEqual({ sequence: 0, digest: null });
  });

  it('appends opaque JSON records and reloads the authoritative sequence and digest chain', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const first = appendUnicodeReviewJournalEvent(journal, initial.tip, { pairRef: 'opaque-pair', received: [null, true, 7] });
    const second = appendUnicodeReviewJournalEvent(journal, first.tip, { alreadyValid: true, priorWaves: 999 });
    const loaded = loadUnicodeReviewJournal(journal);

    expect(loaded.tip).toEqual(second.tip);
    expect(loaded.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(loaded.events[1].previousDigest).toBe(loaded.events[0].digest);
    expect(loaded.events[1].payload).toEqual({ alreadyValid: true, priorWaves: 999 });
    expect(Object.keys(loaded)).toEqual(['root', 'events', 'tip']);
  });

  it('releases owned descriptors across repeated successful appends', () => {
    if (process.platform === 'win32') return;
    const journal = join(externalRoot(), 'journal');
    const journalModule = pathToFileURL(join(process.cwd(), 'scripts', 'unicode_review_journal.ts')).href;
    const fdDirectory = process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd';
    const source = [
      `import { readdirSync } from 'node:fs';`,
      `import { appendUnicodeReviewJournalEvent, initializeUnicodeReviewJournal } from ${JSON.stringify(journalModule)};`,
      `const count = () => readdirSync(${JSON.stringify(fdDirectory)}).length;`,
      `let tip = initializeUnicodeReviewJournal(${JSON.stringify(journal)}).tip;`,
      `const before = count();`,
      `for (let index = 0; index < 100; index += 1) tip = appendUnicodeReviewJournalEvent(${JSON.stringify(journal)}, tip, { index }).tip;`,
      `console.log(JSON.stringify({ before, after: count() }));`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', source], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const counts = JSON.parse(result.stdout.trim()) as { before: number; after: number };
    expect(counts.after - counts.before).toBeLessThanOrEqual(2);
  });

  it('rejects a stale caller tip and preserves the current event history', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 1 });
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 2 })).toThrow(/stale/i);
    expect(loadUnicodeReviewJournal(journal).events).toHaveLength(1);
  });

  it('refuses a second writer while an exclusive lock exists', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    writeLock(journal, process.pid, '11111111-1111-4111-8111-111111111111');
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'second' })).toThrow(/writer lock/i);
    expect(() => loadUnicodeReviewJournal(journal)).toThrow(/lock/i);
  });

  it('fails closed on tampering, sequence gaps, and unknown event files', () => {
    const tamperedJournal = join(externalRoot(), 'journal');
    const tamperedInitial = initializeUnicodeReviewJournal(tamperedJournal);
    const first = appendUnicodeReviewJournalEvent(tamperedJournal, tamperedInitial.tip, { opaque: 'one' });
    appendUnicodeReviewJournalEvent(tamperedJournal, first.tip, { opaque: 'two' });
    writeFileSync(eventPath(tamperedJournal, 1), readFileSync(eventPath(tamperedJournal, 1), 'utf8').replace('"one"', '"changed"'));
    expect(() => loadUnicodeReviewJournal(tamperedJournal)).toThrow(/checksum/i);

    const gappedJournal = join(externalRoot(), 'journal');
    const gappedInitial = initializeUnicodeReviewJournal(gappedJournal);
    appendUnicodeReviewJournalEvent(gappedJournal, gappedInitial.tip, { opaque: 'one' });
    renameSync(eventPath(gappedJournal, 1), eventPath(gappedJournal, 2));
    expect(() => loadUnicodeReviewJournal(gappedJournal)).toThrow(/gap|sequence/i);

    const unknownJournal = join(externalRoot(), 'journal');
    initializeUnicodeReviewJournal(unknownJournal);
    writeFileSync(join(unknownJournal, 'events', 'unrelated.txt'), 'preserve');
    expect(() => loadUnicodeReviewJournal(unknownJournal)).toThrow(/unknown event entry/i);
  });

  it('preserves the prior history when a write fails before its atomic commit', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'not committed' }, {
      beforeCommit() {
        throw new Error('injected write failure');
      },
    })).toThrow(/injected write failure/);
    expect(loadUnicodeReviewJournal(journal).tip).toEqual(initial.tip);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);
    expect(readdirSync(join(journal, 'events'))).toEqual([]);
  });

  it.each(['partial write', 'temporary-file fsync'] as const)('cleans a real %s failure and permits an unchanged-history retry', (failure) => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const prior = appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'committed before failure' });
    const failureSetup = failure === 'partial write'
      ? [
        `const originalWriteFileSync = fs.writeFileSync.bind(fs);`,
        `const originalWriteSync = fs.writeSync.bind(fs);`,
        `let descriptorWrites = 0;`,
        `fs.writeFileSync = (file, data, ...args) => {`,
        `  if (typeof file === 'number' && ++descriptorWrites === 2) {`,
        `    const intended = Buffer.from(data);`,
        `    originalWriteSync(file, intended, 0, Math.min(7, intended.length), 0);`,
        `    throw new Error('injected event temporary partial-write failure');`,
        `  }`,
        `  return originalWriteFileSync(file, data, ...args);`,
        `};`,
      ].join('\n')
      : [
        `const originalFsyncSync = fs.fsyncSync.bind(fs);`,
        `let regularFileSyncs = 0;`,
        `fs.fsyncSync = (fd) => {`,
        `  if (fs.fstatSync(fd).isFile() && ++regularFileSyncs === 2) throw new Error('injected event temporary fsync failure');`,
        `  return originalFsyncSync(fd);`,
        `};`,
      ].join('\n');
    const result = runJournalChild([
      failureSetup,
      `syncBuiltinESMExports();`,
      `const journal = await import(journalModuleUrl);`,
      `try { journal.appendUnicodeReviewJournalEvent(${JSON.stringify(journal)}, ${JSON.stringify(prior.tip)}, { opaque: 'retry after failed write' }); throw new Error('append unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected event temporary')) throw error; }`,
    ].join('\n'));
    expect(result.status, result.output).toBe(0);
    expect(loadUnicodeReviewJournal(journal).tip).toEqual(prior.tip);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);
    expect(readdirSync(join(journal, 'events'))).toEqual(['0000000000000001.json']);

    const retried = appendUnicodeReviewJournalEvent(journal, prior.tip, { opaque: 'retry after failed write' });
    expect(retried.events).toHaveLength(2);
  });

  it('cleans a partially written initialization marker and a failed initial lock write', () => {
    const parent = externalRoot();
    const journal = join(parent, 'journal');
    const partialMarker = runJournalChild([
      `const originalWriteFileSync = fs.writeFileSync.bind(fs);`,
      `const originalWriteSync = fs.writeSync.bind(fs);`,
      `fs.writeFileSync = (file, data, ...args) => {`,
      `  if (typeof file === 'number') { const intended = Buffer.from(data); originalWriteSync(file, intended, 0, Math.min(5, intended.length), 0); throw new Error('injected marker partial-write failure'); }`,
      `  return originalWriteFileSync(file, data, ...args);`,
      `};`,
      `syncBuiltinESMExports();`,
      `const journal = await import(journalModuleUrl);`,
      `try { journal.initializeUnicodeReviewJournal(${JSON.stringify(journal)}); throw new Error('initialization unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected marker partial-write')) throw error; }`,
    ].join('\n'));
    expect(partialMarker.status, partialMarker.output).toBe(0);
    expect(readdirSync(parent)).toEqual([]);
    expect(initializeUnicodeReviewJournal(journal).tip).toEqual({ sequence: 0, digest: null });

    const initial = loadUnicodeReviewJournal(journal);
    const lockFailure = runJournalChild([
      `const originalFsyncSync = fs.fsyncSync.bind(fs);`,
      `let regularFileSyncs = 0;`,
      `fs.fsyncSync = (fd) => { if (fs.fstatSync(fd).isFile() && ++regularFileSyncs === 1) throw new Error('injected lock fsync failure'); return originalFsyncSync(fd); };`,
      `syncBuiltinESMExports();`,
      `const journal = await import(journalModuleUrl);`,
      `try { journal.appendUnicodeReviewJournalEvent(${JSON.stringify(journal)}, ${JSON.stringify(initial.tip)}, { opaque: 'retry after failed lock' }); throw new Error('append unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected lock fsync')) throw error; }`,
    ].join('\n'));
    expect(lockFailure.status, lockFailure.output).toBe(0);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);
    expect(loadUnicodeReviewJournal(journal).events).toEqual([]);
    expect(appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'retry after failed lock' }).events).toHaveLength(1);
  });

  it.each(['same-inode overwrite', 'hard link', 'mode change', 'symlink replacement'] as const)('preserves a failed temporary after a foreign %s', (mutation) => {
    const parent = externalRoot();
    const journal = join(parent, 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const events = join(journal, 'events');
    const foreignLink = join(parent, 'foreign-link');
    const foreignTarget = join(parent, 'foreign-target');
    writeFileSync(foreignTarget, 'preserve target');
    const mutate = mutation === 'same-inode overwrite'
      ? `originalWriteSync(file, Buffer.alloc(intended.length, 0x5a), 0, intended.length, 0);`
      : mutation === 'hard link'
        ? `fs.linkSync(temporaryPath, ${JSON.stringify(foreignLink)});`
        : mutation === 'mode change'
          ? `fs.fchmodSync(file, 0o640);`
          : `fs.unlinkSync(temporaryPath); fs.symlinkSync(${JSON.stringify(foreignTarget)}, temporaryPath);`;
    const result = runJournalChild([
      `const originalWriteFileSync = fs.writeFileSync.bind(fs);`,
      `const originalWriteSync = fs.writeSync.bind(fs);`,
      `let descriptorWrites = 0;`,
      `fs.writeFileSync = (file, data, ...args) => {`,
      `  if (typeof file === 'number' && ++descriptorWrites === 2) {`,
      `    const intended = Buffer.from(data);`,
      `    originalWriteSync(file, intended, 0, Math.min(5, intended.length), 0);`,
      `    const temporaryName = fs.readdirSync(${JSON.stringify(events)}).find((entry) => entry.startsWith('.0000000000000001.json.partial-'));`,
      `    if (typeof temporaryName !== 'string') throw new Error('missing temporary under test');`,
      `    const temporaryPath = join(${JSON.stringify(events)}, temporaryName);`,
      `    ${mutate}`,
      `    throw new Error('injected partial-write failure after foreign mutation');`,
      `  }`,
      `  return originalWriteFileSync(file, data, ...args);`,
      `};`,
      `syncBuiltinESMExports();`,
      `const journal = await import(journalModuleUrl);`,
      `try { journal.appendUnicodeReviewJournalEvent(${JSON.stringify(journal)}, ${JSON.stringify(initial.tip)}, { opaque: 'foreign mutation' }); throw new Error('append unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected partial-write')) throw error; }`,
    ].join('\n'));
    expect(result.status, result.output).toBe(0);
    expect(existsSync(eventPath(journal, 1))).toBe(false);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);
    const temporaryName = readdirSync(events).find((entry) => entry.startsWith('.0000000000000001.json.partial-'));
    expect(temporaryName).toBeTypeOf('string');
    const temporary = join(events, temporaryName as string);
    if (mutation === 'same-inode overwrite') expect(readFileSync(temporary)).toEqual(Buffer.alloc(readFileSync(temporary).length, 0x5a));
    if (mutation === 'hard link') {
      expect(existsSync(foreignLink)).toBe(true);
      expect(lstatSync(temporary).nlink).toBe(2);
    }
    if (mutation === 'mode change') expect(lstatSync(temporary).mode & 0o777).toBe(0o640);
    if (mutation === 'symlink replacement') {
      expect(lstatSync(temporary).isSymbolicLink()).toBe(true);
      expect(readFileSync(foreignTarget, 'utf8')).toBe('preserve target');
    }
  });

  it('preserves truncation after a completed write and mutation during failed-write verification', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const truncated = runJournalChild([
      `const originalFsyncSync = fs.fsyncSync.bind(fs);`,
      `let regularFileSyncs = 0;`,
      `fs.fsyncSync = (fd) => { if (fs.fstatSync(fd).isFile() && ++regularFileSyncs === 2) { fs.ftruncateSync(fd, 1); throw new Error('injected fsync after completed write'); } return originalFsyncSync(fd); };`,
      `syncBuiltinESMExports();`,
      `const journal = await import(journalModuleUrl);`,
      `try { journal.appendUnicodeReviewJournalEvent(${JSON.stringify(journal)}, ${JSON.stringify(initial.tip)}, { opaque: 'must not truncate' }); throw new Error('append unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected fsync after completed write')) throw error; }`,
    ].join('\n'));
    expect(truncated.status, truncated.output).toBe(0);
    expect(existsSync(eventPath(journal, 1))).toBe(false);
    const truncatedTemporary = readdirSync(join(journal, 'events')).find((entry) => entry.startsWith('.0000000000000001.json.partial-'));
    expect(truncatedTemporary).toBeTypeOf('string');
    expect(readFileSync(join(journal, 'events', truncatedTemporary as string))).toHaveLength(1);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);

    const changedJournal = join(externalRoot(), 'journal');
    const changedInitial = initializeUnicodeReviewJournal(changedJournal);
    const changedEvents = join(changedJournal, 'events');
    const mutated = runJournalChild([
      `const originalWriteFileSync = fs.writeFileSync.bind(fs);`,
      `const originalWriteSync = fs.writeSync.bind(fs);`,
      `const originalReadSync = fs.readSync.bind(fs);`,
      `let descriptorWrites = 0;`,
      `let verificationRead = false;`,
      `let verificationArmed = false;`,
      `fs.writeFileSync = (file, data, ...args) => { if (typeof file === 'number' && ++descriptorWrites === 2) { const bytes = Buffer.from(data); originalWriteSync(file, bytes, 0, Math.min(5, bytes.length), 0); verificationArmed = true; throw new Error('injected partial-write before verification mutation'); } return originalWriteFileSync(file, data, ...args); };`,
      `fs.readSync = (fd, ...args) => { if (verificationArmed && !verificationRead) { verificationRead = true; originalWriteSync(fd, Buffer.from([0x58]), 0, 1, 0); } return originalReadSync(fd, ...args); };`,
      `const journal = await import(journalModuleUrl);`,
      `syncBuiltinESMExports();`,
      `try { journal.appendUnicodeReviewJournalEvent(${JSON.stringify(changedJournal)}, ${JSON.stringify(changedInitial.tip)}, { opaque: 'verification mutation' }); throw new Error('append unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected partial-write before verification mutation')) throw error; }`,
    ].join('\n'));
    expect(mutated.status, mutated.output).toBe(0);
    const changedTemporary = readdirSync(changedEvents).find((entry) => entry.startsWith('.0000000000000001.json.partial-'));
    expect(changedTemporary).toBeTypeOf('string');
    expect(readFileSync(join(changedEvents, changedTemporary as string))[0]).toBe(0x58);
    expect(existsSync(eventPath(changedJournal, 1))).toBe(false);
  });

  it('preserves a committed event when the first post-link events-directory fsync fails', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const result = runJournalChild([
      `const originalFsyncSync = fs.fsyncSync.bind(fs);`,
      `let directorySyncs = 0;`,
      `fs.fsyncSync = (fd) => { if (!fs.fstatSync(fd).isFile() && ++directorySyncs === 2) throw new Error('injected post-link directory fsync failure'); return originalFsyncSync(fd); };`,
      `syncBuiltinESMExports();`,
      `const journal = await import(journalModuleUrl);`,
      `try { journal.appendUnicodeReviewJournalEvent(${JSON.stringify(journal)}, ${JSON.stringify(initial.tip)}, { opaque: 'committed before directory fsync failure' }); throw new Error('append unexpectedly succeeded'); }`,
      `catch (error) { if (!String(error).includes('injected post-link directory fsync')) throw error; }`,
    ].join('\n'));
    expect(result.status, result.output).toBe(0);
    expect(loadUnicodeReviewJournal(journal).events.map((event) => event.payload)).toEqual([{ opaque: 'committed before directory fsync failure' }]);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);
    expect(readdirSync(join(journal, 'events'))).toEqual(['0000000000000001.json']);
  });

  it('preserves a replacement of the owned temporary artifact during failed cleanup', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    let temporary = '';
    let replacement = false;
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'replacement' }, {
      beforeCommit() {
        const temporaryName = readdirSync(join(journal, 'events')).find((entry) => entry.startsWith('.0000000000000001.json.partial-'));
        expect(temporaryName).toBeTypeOf('string');
        temporary = join(journal, 'events', temporaryName as string);
        unlinkSync(temporary);
        writeFileSync(temporary, 'replacement', { flag: 'wx' });
        replacement = true;
      },
    })).toThrow(/changed ownership/);
    expect(replacement).toBe(true);
    expect(readFileSync(temporary, 'utf8')).toBe('replacement');
    expect(() => loadUnicodeReviewJournal(journal)).toThrow(/unowned temporary artifact/);
  });

  it('retains the owned temporary descriptor while preserving a replacement', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    let temporary = '';
    let originalDevice = -1;
    let originalInode = -1;
    let replacementInode = -1;
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'inode reuse' }, {
      beforeCommit() {
        const temporaryName = readdirSync(join(journal, 'events')).find((entry) => entry.startsWith('.0000000000000001.json.partial-'));
        expect(temporaryName).toBeTypeOf('string');
        temporary = join(journal, 'events', temporaryName as string);
        const original = lstatSync(temporary);
        originalDevice = original.dev;
        originalInode = original.ino;
        unlinkSync(temporary);
        writeFileSync(temporary, 'replacement', { flag: 'wx' });
        replacementInode = lstatSync(temporary).ino;
        expect(hasRetainedUnlinkedDescriptor(originalDevice, originalInode)).toBe(true);
      },
    })).toThrow(/changed ownership/);
    expect(readFileSync(temporary, 'utf8')).toBe('replacement');
    // The in-flight temporary remains open until cleanup, so Linux cannot
    // recycle its unlinked inode for the foreign replacement.
    if (process.platform === 'linux') expect(replacementInode).not.toBe(originalInode);
  });

  it('preserves a replacement of the owned lock during post-commit cleanup', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const lockPath = join(journal, '.unicode-review-journal.lock');
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'lock replacement' }, {
      afterCommit() {
        unlinkSync(lockPath);
        writeFileSync(lockPath, 'replacement lock', { flag: 'wx' });
      },
    })).toThrow(/changed ownership|journal lock/i);
    expect(readFileSync(lockPath, 'utf8')).toBe('replacement lock');
    expect(existsSync(eventPath(journal, 1))).toBe(true);
  });

  it('retains the owned lock descriptor while preserving a replacement', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const lockPath = join(journal, '.unicode-review-journal.lock');
    let originalDevice = -1;
    let originalInode = -1;
    let replacementInode = -1;
    expect(() => appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'lock inode reuse' }, {
      afterCommit() {
        const original = lstatSync(lockPath);
        originalDevice = original.dev;
        originalInode = original.ino;
        unlinkSync(lockPath);
        writeFileSync(lockPath, 'replacement lock', { flag: 'wx' });
        replacementInode = lstatSync(lockPath).ino;
        expect(hasRetainedUnlinkedDescriptor(originalDevice, originalInode)).toBe(true);
      },
    })).toThrow(/changed ownership|journal lock/i);
    expect(readFileSync(lockPath, 'utf8')).toBe('replacement lock');
    // The writer holds the lock descriptor through post-commit cleanup, which
    // prevents Linux from recycling its unlinked inode for this replacement.
    if (process.platform === 'linux') expect(replacementInode).not.toBe(originalInode);
  });

  it('recovers only a provably stopped owner after validating the journal and its own temporary artifact', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    const appended = appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'committed' });
    const nonce = '22222222-2222-4222-8222-222222222222';
    writeLock(journal, stoppedProcessPid(), nonce);
    const temporary = join(journal, 'events', `.0000000000000002.json.partial-${nonce}`);
    writeFileSync(temporary, 'incomplete', { flag: 'wx' });

    expect(() => loadUnicodeReviewJournal(journal)).toThrow(/lock/i);
    expect(recoverStoppedUnicodeReviewJournalWriter(journal).tip).toEqual(appended.tip);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);
    expect(existsSync(temporary)).toBe(false);
  });

  it('preserves owned stopped-writer artifacts when pre-cleanup recovery validation rejects the journal', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'committed' });
    const nonce = '25252525-2525-4252-8252-252525252525';
    writeLock(journal, stoppedProcessPid(), nonce);
    const temporary = join(journal, 'events', `.0000000000000002.json.partial-${nonce}`);
    writeFileSync(temporary, 'incomplete', { flag: 'wx' });
    const lock = join(journal, '.unicode-review-journal.lock');
    const lockBytes = readFileSync(lock, 'utf8');
    const temporaryBytes = readFileSync(temporary, 'utf8');

    expect(() => recoverStoppedUnicodeReviewJournalWriter(journal, {
      beforeCleanup: (state) => {
        expect(state.events).toHaveLength(1);
        throw new Error('semantic recovery rejected');
      },
    })).toThrow(/semantic recovery rejected/);
    expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
    expect(readFileSync(temporary, 'utf8')).toBe(temporaryBytes);
  });

  it('preserves an event committed before process exit and removes its matching last-event temporary artifact', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    crashAfterCommit(journal, initial.tip);
    expect(existsSync(eventPath(journal, 1))).toBe(true);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(true);

    const recovered = recoverStoppedUnicodeReviewJournalWriter(journal);
    expect(recovered.events).toHaveLength(1);
    expect(recovered.events[0].payload).toEqual({ opaque: 'committed-before-cleanup' });
    expect(recovered.tip.sequence).toBe(1);
    expect(readdirSync(join(journal, 'events'))).toEqual(['0000000000000001.json']);
  });

  it('rejects a same-sequence temporary artifact that conflicts with the committed event', () => {
    const journal = join(externalRoot(), 'journal');
    const initial = initializeUnicodeReviewJournal(journal);
    appendUnicodeReviewJournalEvent(journal, initial.tip, { opaque: 'committed' });
    const nonce = '44444444-4444-4444-8444-444444444444';
    writeLock(journal, stoppedProcessPid(), nonce);
    const temporary = join(journal, 'events', `.0000000000000001.json.partial-${nonce}`);
    writeFileSync(temporary, 'conflicting bytes', { flag: 'wx' });

    expect(() => recoverStoppedUnicodeReviewJournalWriter(journal)).toThrow(/conflicts with the last committed event/);
    expect(existsSync(temporary)).toBe(true);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(true);
  });

  it('refuses recovery while the original lock owner is still alive', () => {
    const journal = join(externalRoot(), 'journal');
    initializeUnicodeReviewJournal(journal);
    writeLock(journal, process.pid, '33333333-3333-4333-8333-333333333333');
    expect(() => recoverStoppedUnicodeReviewJournalWriter(journal)).toThrow(/still running|proven gone/i);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(true);
  });
});
