import { describe, expect, it } from 'vitest';
import {
  applyWordOrderAction,
  createWordOrderSession,
  deriveNonAnswerOrder,
  tokenizeAnswer,
} from '../src/domain/wordOrderPractice';
import type {
  WordOrderChunk,
  WordOrderItem,
} from '../src/domain/wordOrderPractice';

// ─── Helpers ────────────────────────────────────────────────────────────────

const CANONICAL = ['我', '明天', '去', '台北'];

function chunks(recordId = 'rec-1'): WordOrderChunk[] {
  return tokenizeAnswer(recordId, CANONICAL.join(' ')).chunks;
}

function item(overrides?: Partial<WordOrderItem>): WordOrderItem {
  const base = {
    recordId: 'rec-1',
    promptJa: '正しい語順に並べ替えてください',
    chunks: chunks(),
    separator: ' ' as const,
    canonicalOrder: [0, 1, 2, 3],
    shownOrder: [0, 1, 2, 3],
  };
  return { ...base, ...overrides };
}

function session(items: WordOrderItem[] = [item()]) {
  return createWordOrderSession(items);
}

// ─── Tokenization ───────────────────────────────────────────────────────────

describe('tokenizeAnswer', () => {
  it('splits a whitespace answer into ordered non-empty chunks', () => {
    const result = tokenizeAnswer('rec-1', '我 明天 去 台北');
    expect(result.chunks.map((c) => c.text)).toEqual(['我', '明天', '去', '台北']);
    expect(result.chunks.map((c) => c.id)).toEqual([
      'rec-1-chunk-1',
      'rec-1-chunk-2',
      'rec-1-chunk-3',
      'rec-1-chunk-4',
    ]);
    expect(result.separator).toBe(' ');
  });

  it('splits a space-less CJK answer per code point using the smallest boundary', () => {
    const result = tokenizeAnswer('rec-1', '我明天去台北');
    expect(result.chunks.map((c) => c.text)).toEqual(['我', '明', '天', '去', '台', '北']);
    expect(result.separator).toBe('');
    // Per-character chunks rejoin exactly to the source record.
    expect(result.chunks.map((c) => c.text).join('')).toBe('我明天去台北');
  });

  it('rejects an empty or whitespace-only answer', () => {
    expect(() => tokenizeAnswer('rec-1', '')).toThrow(/no non-empty correctAnswer/);
    expect(() => tokenizeAnswer('rec-1', '   ')).toThrow(/no non-empty correctAnswer/);
  });

  it('rejects an answer that cannot be split into at least two chunks', () => {
    // A single token cannot be reordered, so there is nothing to practice.
    expect(() => tokenizeAnswer('rec-1', '我')).toThrow(/cannot be split unambiguously/);
    expect(() => tokenizeAnswer('rec-1', 'a')).toThrow(/cannot be split unambiguously/);
  });

  it('accepts a two-code-point space-less CJK answer as two atomic chunks', () => {
    const result = tokenizeAnswer('rec-1', '台北');
    expect(result.chunks.map((c) => c.text)).toEqual(['台', '北']);
    expect(result.separator).toBe('');
  });

  it('rejects a whitespace record whose split chunks do not rejoin exactly', () => {
    // Mixed-width whitespace would be lost on rejoin, so the boundary is
    // ambiguous and the record is rejected rather than patched.
    expect(() => tokenizeAnswer('rec-1', '我  明天 去 台北')).toThrow(
      /ambiguous token boundaries/,
    );
  });

  it('normalizes surrounding whitespace on whitespace answers', () => {
    const result = tokenizeAnswer('rec-1', ' 我 明天 去 台北 ');
    expect(result.chunks.map((c) => c.text)).toEqual(['我', '明天', '去', '台北']);
  });

  it('keeps CJK punctuation attached to chunks, not invented as tokens', () => {
    const result = tokenizeAnswer('rec-1', '請問 洗手間 在 哪裡？');
    expect(result.chunks.map((c) => c.text)).toEqual(['請問', '洗手間', '在', '哪裡？']);
  });
});

// ─── Non-answer ordering ────────────────────────────────────────────────────

describe('deriveNonAnswerOrder', () => {
  it('is deterministic across repeated generation', () => {
    const first = deriveNonAnswerOrder('rec-1', chunks());
    for (let run = 0; run < 10; run++) {
      expect(deriveNonAnswerOrder('rec-1', chunks())).toEqual(first);
    }
  });

  it('derives an order that is not the canonical order', () => {
    const order = deriveNonAnswerOrder('rec-1', chunks());
    expect(order).not.toEqual([0, 1, 2, 3]);
  });

  it('is a permutation of every chunk index exactly once', () => {
    const order = deriveNonAnswerOrder('rec-1', chunks());
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('depends only on the record id and chunk texts', () => {
    const a = deriveNonAnswerOrder('rec-1', chunks());
    const b = deriveNonAnswerOrder('rec-1', chunks());
    const c = deriveNonAnswerOrder('rec-2', chunks());
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

// ─── Session lifecycle ───────────────────────────────────────────────────────

describe('createWordOrderSession', () => {
  it('starts in the initial phase on the first item with no selection', () => {
    const s = session();
    expect(s.status).toBe('initial');
    expect(s.currentIndex).toBe(0);
    expect(s.selected).toEqual([]);
    expect(s.attemptCount).toBe(0);
    expect(s.lastCorrect).toBeNull();
  });

  it('rejects an empty item list', () => {
    expect(() => createWordOrderSession([])).toThrow(/at least one item/);
  });
});

describe('toggle', () => {
  it('activates chunks in activation order', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 2 }).state;
    s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
    expect(s.status).toBe('composing');
    expect(s.selected).toEqual([2, 0]);
  });

  it('removes a selected chunk at its activation position (reverse allowed)', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 2 }).state;
    s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
    // Remove the second-activated chunk (position 0) first.
    s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
    expect(s.selected).toEqual([2]);
  });

  it('rejects out-of-range positions as no-ops', () => {
    const s = session();
    expect(applyWordOrderAction(s, { kind: 'toggle', position: -1 }).effect).toBe('noop');
    expect(applyWordOrderAction(s, { kind: 'toggle', position: 4 }).effect).toBe('noop');
    expect(applyWordOrderAction(s, { kind: 'toggle', position: 1.5 }).effect).toBe('noop');
  });

  it('removes a selected chunk when it is toggled again', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 1 }).state;
    expect(s.selected).toEqual([1]);
    const result = applyWordOrderAction(s, { kind: 'toggle', position: 1 });
    expect(result.effect).toBe('accepted');
    expect(result.state.selected).toEqual([]);
    expect(result.state.status).toBe('initial');
  });

  it('returns to initial when the last selection is removed', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 3 }).state;
    expect(s.status).toBe('composing');
    s = applyWordOrderAction(s, { kind: 'toggle', position: 3 }).state;
    expect(s.status).toBe('initial');
    expect(s.selected).toEqual([]);
  });

  it('locks chunk activation while submitted', () => {
    let s = session();
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    expect(s.status).toBe('submitted');
    const result = applyWordOrderAction(s, { kind: 'toggle', position: 2 });
    expect(result.effect).toBe('noop');
  });
});

describe('submit', () => {
  it('is unavailable with no selection', () => {
    const s = session();
    const result = applyWordOrderAction(s, { kind: 'submit' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/no chunks selected/);
  });

  it('is unavailable until every chunk is used exactly once', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
    s = applyWordOrderAction(s, { kind: 'toggle', position: 1 }).state;
    s = applyWordOrderAction(s, { kind: 'toggle', position: 2 }).state;
    const result = applyWordOrderAction(s, { kind: 'submit' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/every chunk/);
  });

  it('rejects a partial selection (not a full permutation)', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
    s = applyWordOrderAction(s, { kind: 'toggle', position: 1 }).state;
    // Only 2 of 4 chunks selected — submit is a no-op.
    const result = applyWordOrderAction(s, { kind: 'submit' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/every chunk/);
  });

  it('marks correct when the activation order matches canonical', () => {
    const t = item({ shownOrder: [0, 1, 2, 3], canonicalOrder: [0, 1, 2, 3] });
    let s = session([t]);
    // shownOrder is canonical, so activating in shown order is correct.
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    const result = applyWordOrderAction(s, { kind: 'submit' });
    expect(result.effect).toBe('correct');
    expect(result.state.status).toBe('submitted');
    expect(result.state.lastCorrect).toBe(true);
    expect(result.state.attemptCount).toBe(1);
  });

  it('marks incorrect when the activation order differs from canonical', () => {
    const t = item({
      shownOrder: [0, 1, 2, 3],
      canonicalOrder: [0, 1, 3, 2],
    });
    let s = session([t]);
    // Activating in shown order yields [0,1,2,3], which is wrong for canonical [0,1,3,2].
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    const result = applyWordOrderAction(s, { kind: 'submit' });
    expect(result.effect).toBe('incorrect');
    expect(result.state.status).toBe('submitted');
    expect(result.state.lastCorrect).toBe(false);
  });
});

describe('retry', () => {
  it('is a no-op outside the submitted phase', () => {
    const s = session();
    expect(applyWordOrderAction(s, { kind: 'retry' }).effect).toBe('noop');
  });

  it('resets only the current item selection', () => {
    const t = item({ shownOrder: [0, 1, 2, 3], canonicalOrder: [0, 1, 3, 2] });
    let s = session([t]);
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    expect(s.lastCorrect).toBe(false);

    const result = applyWordOrderAction(s, { kind: 'retry' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('composing');
    expect(result.state.selected).toEqual([]);
    expect(result.state.lastCorrect).toBeNull();
    expect(result.state.currentIndex).toBe(0);
    // The item order and prompt are untouched.
    expect(result.state.items).toBe(s.items);
  });
});

describe('next', () => {
  it('is a no-op without a correct submit', () => {
    const s = session();
    expect(applyWordOrderAction(s, { kind: 'next' }).effect).toBe('noop');
  });

  it('is a no-op after an incorrect submit', () => {
    const t = item({ shownOrder: [0, 1, 2, 3], canonicalOrder: [0, 1, 3, 2] });
    let s = session([t]);
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    expect(s.lastCorrect).toBe(false);
    expect(applyWordOrderAction(s, { kind: 'next' }).effect).toBe('noop');
  });

  it('advances to the next item only after a correct submit', () => {
    const a = item({ recordId: 'rec-1' });
    const b = item({ recordId: 'rec-2' });
    let s = session([a, b]);
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    // Use canonical order directly so the submit is correct regardless of shown order.
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    expect(s.lastCorrect).toBe(true);
    const result = applyWordOrderAction(s, { kind: 'next' });
    expect(result.effect).toBe('accepted');
    expect(result.state.currentIndex).toBe(1);
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toEqual([]);
    expect(result.state.items[1].recordId).toBe('rec-2');
  });
});

describe('completion and restart', () => {
  it('completes after the last item is answered correctly and next is pressed', () => {
    const a = item({ recordId: 'rec-1' });
    const b = item({ recordId: 'rec-2' });
    let s = session([a, b]);

    // Item 1: activate in canonical order and submit correctly.
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    s = applyWordOrderAction(s, { kind: 'next' }).state;

    // Item 2: correct.
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    expect(s.status).toBe('submitted');
    expect(s.lastCorrect).toBe(true);

    const result = applyWordOrderAction(s, { kind: 'next' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('completed');
    expect(result.message).toMatch(/セッション完了/);
  });

  it('treats actions on a completed session as no-ops except restart', () => {
    const a = item({ recordId: 'rec-1' });
    let s = session([a]);
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    s = applyWordOrderAction(s, { kind: 'next' }).state;
    expect(s.status).toBe('completed');

    expect(applyWordOrderAction(s, { kind: 'toggle', position: 0 }).effect).toBe('noop');
    expect(applyWordOrderAction(s, { kind: 'submit' }).effect).toBe('noop');
    expect(applyWordOrderAction(s, { kind: 'retry' }).effect).toBe('noop');
    expect(applyWordOrderAction(s, { kind: 'next' }).effect).toBe('noop');
  });

  it('restarts from the completed phase', () => {
    const a = item({ recordId: 'rec-1' });
    let s = session([a]);
    for (let i = 0; i < 4; i++) s = applyWordOrderAction(s, { kind: 'toggle', position: i }).state;
    s = applyWordOrderAction(s, { kind: 'submit' }).state;
    s = applyWordOrderAction(s, { kind: 'next' }).state;
    expect(s.status).toBe('completed');

    const result = applyWordOrderAction(s, { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.currentIndex).toBe(0);
    expect(result.state.selected).toEqual([]);
    expect(result.state.attemptCount).toBe(0);
  });

  it('restarts from an active phase', () => {
    let s = session();
    s = applyWordOrderAction(s, { kind: 'toggle', position: 1 }).state;
    const result = applyWordOrderAction(s, { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toEqual([]);
  });
});

describe('frozen determinism', () => {
  it('repeated identical action sequences produce deeply equal states', () => {
    function run() {
      const t = item({ shownOrder: [0, 1, 2, 3], canonicalOrder: [0, 1, 3, 2] });
      let s = session([t]);
      s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 1 }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 2 }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 3 }).state;
      s = applyWordOrderAction(s, { kind: 'submit' }).state;
      s = applyWordOrderAction(s, { kind: 'retry' }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 3 }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 2 }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 1 }).state;
      s = applyWordOrderAction(s, { kind: 'toggle', position: 0 }).state;
      s = applyWordOrderAction(s, { kind: 'submit' }).state;
      s = applyWordOrderAction(s, { kind: 'next' }).state;
      return s;
    }
    expect(run()).toEqual(run());
    expect(run()).toEqual(run());
  });
});
