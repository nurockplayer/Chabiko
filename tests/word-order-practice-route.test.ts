// @vitest-environment happy-dom

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWordOrderPractice } from '../src/content/loadWordOrderPractice';
import { mountWordOrderPractice } from '../src/client/wordOrderPractice';

const VALID_WORD_ORDER = {
  id: 'practice-word-001',
  type: 'word-order',
  promptJa: '正しい語順に並べ替えてください',
  correctAnswerTraditional: '我明天去台北',
  distractorsTraditional: ['我去台北明天'],
  painPointTags: ['word-order'],
  reviewStatus: 'reviewed',
};

const VALID_WORD_ORDER_2 = {
  id: 'practice-word-002',
  type: 'word-order',
  promptJa: '正しい語順に並べ替えてください',
  correctAnswerTraditional: '請坐這裡',
  distractorsTraditional: ['請這裡坐'],
  painPointTags: ['word-order'],
  reviewStatus: 'reviewed',
};

function writeBundle(records: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'chabiko-word-order-'));
  const file = join(dir, 'practice.json');
  writeFileSync(file, JSON.stringify({ practice: records }), 'utf8');
  return file;
}

let tempDirs: string[] = [];

function tempBundle(records: unknown[]): string {
  const file = writeBundle(records);
  tempDirs.push(dirname(file));
  return file;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  document.body.replaceChildren();
});

// ─── Loader: source order and validity ─────────────────────────────────────

describe('loadWordOrderPractice — source order and validity', () => {
  it('normalizes Traditional answer fields into the existing domain shape', () => {
    const file = tempBundle([{
      ...VALID_WORD_ORDER,
    }]);
    const items = loadWordOrderPractice(file);

    expect(items).toHaveLength(1);
    expect(items[0].chunks.map((chunk) => chunk.text).join(items[0].separator)).toBe(
      '我明天去台北',
    );
  });

  it('loads only word-order records in source order', () => {
    const file = tempBundle([
      { ...VALID_WORD_ORDER, id: 'practice-word-001' },
      { id: 'practice-tone', type: 'tone-discrimination', promptJa: 'x', correctAnswer: 'y' },
      { ...VALID_WORD_ORDER_2, id: 'practice-word-002' },
    ]);
    const items = loadWordOrderPractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-word-001', 'practice-word-002']);
  });

  it('rejects generic, Japanese, or mixed answer fields for a word-order record', () => {
    const { correctAnswerTraditional, distractorsTraditional, ...base } = VALID_WORD_ORDER;
    const file = tempBundle([
      {
        ...base,
        id: 'generic',
        correctAnswer: correctAnswerTraditional,
        distractors: distractorsTraditional,
      },
      {
        ...base,
        id: 'japanese',
        correctAnswerJa: correctAnswerTraditional,
        distractorsJa: distractorsTraditional,
      },
      {
        ...VALID_WORD_ORDER,
        id: 'mixed',
        correctAnswer: correctAnswerTraditional,
        distractors: distractorsTraditional,
      },
      { ...VALID_WORD_ORDER, id: 'valid' },
    ]);

    expect(loadWordOrderPractice(file).map((item) => item.recordId)).toEqual(['valid']);
  });

  it('rejects records that cannot be tokenized unambiguously instead of inventing tokens', () => {
    const file = tempBundle([
      { ...VALID_WORD_ORDER, id: 'practice-word-001' },
      { ...VALID_WORD_ORDER, id: 'practice-word-bad', correctAnswerTraditional: '台' },
      { ...VALID_WORD_ORDER_2, id: 'practice-word-002' },
    ]);
    // The single-code-point record is rejected; surrounding valid records survive.
    const items = loadWordOrderPractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-word-001', 'practice-word-002']);
  });

  it('returns an empty array when no word-order records exist', () => {
    const file = tempBundle([
      { id: 'practice-tone', type: 'tone-discrimination', promptJa: 'x', correctAnswer: 'y' },
    ]);
    expect(loadWordOrderPractice(file)).toEqual([]);
  });

  it('returns an empty array for an empty bundle', () => {
    expect(loadWordOrderPractice(tempBundle([]))).toEqual([]);
  });

  it('skips malformed records (missing or non-string fields)', () => {
    const file = tempBundle([
      { ...VALID_WORD_ORDER, id: 'practice-good' },
      { id: 'practice-no-answer', type: 'word-order', promptJa: 'x' },
      { id: 'practice-null', type: 'word-order', promptJa: 'x', correctAnswerTraditional: null },
      { id: 42, type: 'word-order', promptJa: 'x', correctAnswerTraditional: 'a b' },
      null,
      'not-an-object',
    ]);
    const items = loadWordOrderPractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-good']);
  });

  it('preserves the exact canonical order in chunk order', () => {
    const file = tempBundle([VALID_WORD_ORDER]);
    const items = loadWordOrderPractice(file);
    // Space-less CJK uses the smallest boundary: one code point per chunk.
    expect(items[0].chunks.map((c) => c.text)).toEqual(['我', '明', '天', '去', '台', '北']);
    expect(items[0].canonicalOrder).toEqual([0, 1, 2, 3, 4, 5]);
    expect(items[0].shownOrder).not.toEqual([0, 1, 2, 3, 4, 5]);
    expect(items[0].shownOrder).toHaveLength(6);
    // Chunks rejoin exactly to the source correctAnswer.
    expect(items[0].chunks.map((c) => c.text).join(items[0].separator)).toBe('我明天去台北');
  });

  it('is deterministic across repeated loads', () => {
    const file = tempBundle([VALID_WORD_ORDER, VALID_WORD_ORDER_2]);
    const a = loadWordOrderPractice(file);
    const b = loadWordOrderPractice(file);
    expect(a).toEqual(b);
  });
});

describe('loadWordOrderPractice — default source', () => {
  it('loads the repository seed bundle without throwing', () => {
    expect(() => loadWordOrderPractice()).not.toThrow();
  });
});

// ─── Route wiring: component, client, page ────────────────────────────────

describe('word-order route wiring', () => {
  it('mounts the client on the component root and renders chunks', () => {
    const file = tempBundle([VALID_WORD_ORDER]);
    const items = loadWordOrderPractice(file);
    const root = document.createElement('div');
    root.setAttribute('data-word-order-practice', '');
    root.setAttribute('data-word-order-session', JSON.stringify({
      items: items.map((i) => ({
        recordId: i.recordId,
        promptJa: i.promptJa,
        separator: i.separator,
        chunks: i.chunks.map((c) => ({ id: c.id, text: c.text })),
        canonicalOrder: i.canonicalOrder,
        shownOrder: i.shownOrder,
      })),
    }));
    root.innerHTML =
      '<div class="word-order-header">' +
      '<p class="word-order-progress" data-word-order-progress></p>' +
      '<p class="word-order-prompt" data-word-order-prompt></p></div>' +
      '<div class="word-order-answer-well" role="region" aria-label="組み立て中の答え">' +
      '<p class="word-order-answer-empty" aria-hidden="true">hint</p>' +
      '<div class="word-order-answer" data-word-order-answer></div></div>' +
      '<div class="word-order-feedback" data-word-order-feedback role="status" aria-live="polite" aria-atomic="true"></div>' +
      '<div class="word-order-pool" data-word-order-pool role="group" aria-label="チャンクを選ぶ"></div>' +
      '<div class="word-order-actions" data-word-order-actions></div>';
    document.body.append(root);

    mountWordOrderPractice(root);

    expect(root.textContent).toContain(VALID_WORD_ORDER.promptJa);
    // The answer well starts empty; the pool holds every chunk exactly once.
    expect(root.querySelectorAll('.word-order-chunk--pool')).toHaveLength(6);
    expect(root.querySelectorAll('.word-order-chunk--answer')).toHaveLength(0);
    const texts = [...root.querySelectorAll('.word-order-chunk--pool')].map(
      (el) => el.textContent,
    );
    expect([...texts].sort()).toEqual(['北', '去', '台', '天', '我', '明']);
  });

  it('rejects mounting with no items', () => {
    const root = document.createElement('div');
    root.setAttribute('data-word-order-practice', '');
    root.setAttribute('data-word-order-session', JSON.stringify({ items: [] }));
    document.body.append(root);
    expect(() => mountWordOrderPractice(root)).toThrow(/no items/);
  });

  it('keeps answer chunks out of the initial markup (no pre-solved answer)', () => {
    const file = tempBundle([VALID_WORD_ORDER]);
    const items = loadWordOrderPractice(file);
    const root = document.createElement('div');
    root.setAttribute('data-word-order-session', JSON.stringify({
      items: items.map((i) => ({
        recordId: i.recordId,
        promptJa: i.promptJa,
        separator: i.separator,
        chunks: i.chunks.map((c) => ({ id: c.id, text: c.text })),
        canonicalOrder: i.canonicalOrder,
        shownOrder: i.shownOrder,
      })),
    }));
    root.innerHTML =
      '<p data-word-order-progress></p><p data-word-order-prompt></p>' +
      '<div data-word-order-answer></div><div data-word-order-feedback></div>' +
      '<div data-word-order-pool></div><div data-word-order-actions></div>';
    document.body.append(root);

    mountWordOrderPractice(root);

    const answer = root.querySelector<HTMLElement>('[data-word-order-answer]')!;
    expect(answer.children.length).toBe(0);
  });
});
