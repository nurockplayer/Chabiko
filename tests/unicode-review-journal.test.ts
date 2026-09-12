import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  UNICODE_REVIEW_JOURNAL_PROTOCOL,
  appendUnicodeReviewJournalEvent,
  initializeUnicodeReviewJournal,
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
