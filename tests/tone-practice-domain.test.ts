import { describe, expect, it } from 'vitest';
import {
  CONTOUR_BY_TONE,
  TONE_BY_CONTOUR,
  applyTonePracticeAction,
  createTonePracticeSession,
  isToneChoice,
  isToneContourId,
} from '../src/domain/tonePractice';
import type {
  ToneChoice,
  TonePracticeItem,
} from '../src/domain/tonePractice';

// ─── Helpers ────────────────────────────────────────────────────────────────

function item(overrides?: Partial<TonePracticeItem>): TonePracticeItem {
  const base: TonePracticeItem = {
    recordId: 'rec-1',
    promptJa: '声調の形を見て、「媽 mā」に合うものを選んでください。',
    correctAnswer: '第一声',
    distractors: ['第二声', '第三声', '第四声'],
    contrastId: 'tone-t1-vs-t2-t3-t4',
    toneContourId: 't1-high-flat',
    toneContourHintJa: '第一声は高く平らに保ちます。',
    interferenceJa: '日本語話者は声の高さを平らに伸ばしやすいので、音の高さを意識しましょう。',
  };
  return { ...base, ...overrides };
}

function session(items: TonePracticeItem[] = [item()]) {
  return createTonePracticeSession(items);
}

function advanceCorrect(s: ReturnType<typeof session>) {
  let state = s;
  state = applyTonePracticeAction(state, { kind: 'select', choice: '第一声' }).state;
  state = applyTonePracticeAction(state, { kind: 'submit' }).state;
  expect(state.lastCorrect).toBe(true);
  return applyTonePracticeAction(state, { kind: 'next' }).state;
}

// ─── Choice and contour contracts ───────────────────────────────────────────

describe('tone choice and contour contracts', () => {
  it('exposes exactly the four named tone choices', () => {
    const expected: readonly ToneChoice[] = ['第一声', '第二声', '第三声', '第四声'];
    expect(isToneChoice('第一声')).toBe(true);
    expect(isToneChoice('第二声')).toBe(true);
    expect(isToneChoice('第三声')).toBe(true);
    expect(isToneChoice('第四声')).toBe(true);
    expect(isToneChoice('軽声')).toBe(false);
    expect(isToneChoice('')).toBe(false);
    expect(isToneChoice(null)).toBe(false);
    // Ordering is fixed so choice order never depends on data or time.
    expect(expected).toEqual(['第一声', '第二声', '第三声', '第四声']);
  });

  it('maps the four controlled contours to exactly one tone each', () => {
    expect(TONE_BY_CONTOUR).toEqual({
      't1-high-flat': '第一声',
      't2-rising': '第二声',
      't3-dip-rise': '第三声',
      't4-falling': '第四声',
    });
    expect(CONTOUR_BY_TONE).toEqual({
      第一声: 't1-high-flat',
      第二声: 't2-rising',
      第三声: 't3-dip-rise',
      第四声: 't4-falling',
    });
  });

  it('recognizes the four controlled contour ids and rejects unknown ones', () => {
    for (const id of ['t1-high-flat', 't2-rising', 't3-dip-rise', 't4-falling']) {
      expect(isToneContourId(id)).toBe(true);
    }
    expect(isToneContourId('t5-mystery')).toBe(false);
    expect(isToneContourId('')).toBe(false);
    expect(isToneContourId(null)).toBe(false);
  });
});

// ─── Session creation ───────────────────────────────────────────────────────

describe('createTonePracticeSession', () => {
  it('starts in the initial phase on the first item with no selection', () => {
    const s = session();
    expect(s.status).toBe('initial');
    expect(s.currentIndex).toBe(0);
    expect(s.selected).toBeNull();
    expect(s.lastCorrect).toBeNull();
    expect(s.pendingCorrect).toBe(false);
  });

  it('rejects an empty item list', () => {
    expect(() => createTonePracticeSession([])).toThrow(/at least one item/);
  });
});

// ─── Complete transition table ──────────────────────────────────────────────

describe('complete transition table', () => {
  it('initial + select → selected (accepted)', () => {
    const result = applyTonePracticeAction(session(), { kind: 'select', choice: '第二声' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toBe('第二声');
  });

  it('initial + submit → noop (no choice selected)', () => {
    const result = applyTonePracticeAction(session(), { kind: 'submit' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/no choice selected/);
    expect(result.state.selected).toBeNull();
  });

  it('initial + retry → noop (nothing to retry)', () => {
    const result = applyTonePracticeAction(session(), { kind: 'retry' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/nothing to retry/);
  });

  it('initial + next → noop (requires correct submit first)', () => {
    const result = applyTonePracticeAction(session(), { kind: 'next' });
    expect(result.effect).toBe('noop');
  });

  it('initial + restart → fresh initial session', () => {
    const result = applyTonePracticeAction(session(), { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toBeNull();
    expect(result.state.currentIndex).toBe(0);
  });

  it('selected + select same choice → noop (duplicate rejected)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    const result = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/already selected/);
    expect(result.state.selected).toBe('第一声');
  });

  it('selected + select another choice → accepted (selection replaced)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    const result = applyTonePracticeAction(s, { kind: 'select', choice: '第三声' });
    expect(result.effect).toBe('accepted');
    expect(result.state.selected).toBe('第三声');
  });

  it('selected + submit correct → submitted/correct', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    const result = applyTonePracticeAction(s, { kind: 'submit' });
    expect(result.effect).toBe('correct');
    expect(result.state.status).toBe('submitted');
    expect(result.state.lastCorrect).toBe(true);
    expect(result.state.pendingCorrect).toBe(true);
  });

  it('selected + submit incorrect → submitted/incorrect', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' }).state;
    const result = applyTonePracticeAction(s, { kind: 'submit' });
    expect(result.effect).toBe('incorrect');
    expect(result.state.status).toBe('submitted');
    expect(result.state.lastCorrect).toBe(false);
    expect(result.state.pendingCorrect).toBe(false);
  });

  it('submitted + select → noop (locked until retry)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    const result = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' });
    expect(result.effect).toBe('noop');
    expect(result.state.selected).toBe('第一声');
  });

  it('submitted + submit again → noop (duplicate submit rejected)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    const result = applyTonePracticeAction(s, { kind: 'submit' });
    expect(result.effect).toBe('noop');
    expect(result.state.status).toBe('submitted');
  });

  it('submitted/incorrect + retry → same item with no selection', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    expect(s.lastCorrect).toBe(false);

    const result = applyTonePracticeAction(s, { kind: 'retry' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toBeNull();
    expect(result.state.lastCorrect).toBeNull();
    expect(result.state.pendingCorrect).toBe(false);
    expect(result.state.currentIndex).toBe(0);
    // Same item, same guidance, same prompt.
    expect(result.state.items).toBe(s.items);
    expect(result.state.items[0].toneContourHintJa).toBe(item().toneContourHintJa);
    expect(result.state.items[0].interferenceJa).toBe(item().interferenceJa);
  });

  it('submitted/incorrect + next → noop (correct answer required)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    const result = applyTonePracticeAction(s, { kind: 'next' });
    expect(result.effect).toBe('noop');
    expect(result.state.currentIndex).toBe(0);
  });

  it('submitted/correct + next → next item (accepted)', () => {
    const a = item({ recordId: 'rec-1' });
    const b = item({ recordId: 'rec-2' });
    let s = session([a, b]);
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    const result = applyTonePracticeAction(s, { kind: 'next' });
    expect(result.effect).toBe('accepted');
    expect(result.state.currentIndex).toBe(1);
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toBeNull();
    expect(result.state.lastCorrect).toBeNull();
    expect(result.state.pendingCorrect).toBe(false);
  });

  it('submitted/correct + retry → noop (no replay on the correct path)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    const result = applyTonePracticeAction(s, { kind: 'retry' });
    expect(result.effect).toBe('noop');
  });

  it('submitted/correct + select → noop (selection locked while submitted)', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    const result = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' });
    expect(result.effect).toBe('noop');
  });

  it('completed + next/submit/select/retry → noop (only restart is accepted)', () => {
    const s = advanceCorrect(session([item()]));
    expect(s.status).toBe('completed');
    expect(applyTonePracticeAction(s, { kind: 'next' }).effect).toBe('noop');
    expect(applyTonePracticeAction(s, { kind: 'submit' }).effect).toBe('noop');
    expect(applyTonePracticeAction(s, { kind: 'retry' }).effect).toBe('noop');
    expect(applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).effect).toBe('noop');
  });

  it('completed + restart → fresh session on item 1 with no selection', () => {
    const s = advanceCorrect(session([item()]));
    const result = applyTonePracticeAction(s, { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.currentIndex).toBe(0);
    expect(result.state.selected).toBeNull();
    expect(result.state.lastCorrect).toBeNull();
  });

  it('rejects unknown/out-of-range select actions as no-ops', () => {
    const s = session();
    // The action type forbids unknown choices, so this exercises the guard
    // against malformed runtime input.
    const result = applyTonePracticeAction(s, {
      kind: 'select',
      choice: '軽声' as ToneChoice,
    });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/unknown tone choice/);
    expect(result.state.selected).toBeNull();
  });

  it('accepts restart from any active phase', () => {
    let s = session();
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' }).state;
    const result = applyTonePracticeAction(s, { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('initial');
    expect(result.state.selected).toBeNull();
  });
});

// ─── Exact correctness of the four choices ─────────────────────────────────

describe('exact correctness of the four choices', () => {
  it('marks a submit correct if and only if the choice equals correctAnswer', () => {
    const choices: ToneChoice[] = ['第一声', '第二声', '第三声', '第四声'];
    for (const choice of choices) {
      let s = session([item({ correctAnswer: choice })]);
      s = applyTonePracticeAction(s, { kind: 'select', choice }).state;
      const result = applyTonePracticeAction(s, { kind: 'submit' });
      expect(result.effect).toBe('correct');
      expect(result.state.lastCorrect).toBe(true);
    }
  });

  it('marks a submit incorrect for every non-answer choice', () => {
    const choices: ToneChoice[] = ['第一声', '第二声', '第三声', '第四声'];
    for (const answer of choices) {
      for (const picked of choices) {
        if (picked === answer) continue;
        let s = session([item({ correctAnswer: answer })]);
        s = applyTonePracticeAction(s, { kind: 'select', choice: picked }).state;
        const result = applyTonePracticeAction(s, { kind: 'submit' });
        expect(result.effect).toBe('incorrect');
        expect(result.state.lastCorrect).toBe(false);
      }
    }
  });

  it('shows exactly four named choices including the correct one', () => {
    const t = item();
    const shown = [t.correctAnswer, ...t.distractors];
    expect(shown).toHaveLength(4);
    expect(new Set(shown).size).toBe(4);
    expect(shown).toContain('第一声');
  });

  it('requires an explicit next action to advance after a correct submit', () => {
    let s = session([item({ recordId: 'rec-1' }), item({ recordId: 'rec-2' })]);
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    // Still on item 1 until next is pressed.
    expect(s.currentIndex).toBe(0);
    s = applyTonePracticeAction(s, { kind: 'next' }).state;
    expect(s.currentIndex).toBe(1);
    expect(s.status).toBe('initial');
  });
});

// ─── Completion and restart over multiple items ─────────────────────────────

describe('completion and restart', () => {
  it('completes after the last item is answered correctly and next is pressed', () => {
    let s = advanceCorrect(session([item({ recordId: 'rec-1' }), item({ recordId: 'rec-2' })]));
    expect(s.currentIndex).toBe(1);
    s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    s = applyTonePracticeAction(s, { kind: 'submit' }).state;
    expect(s.status).toBe('submitted');
    expect(s.lastCorrect).toBe(true);
    const result = applyTonePracticeAction(s, { kind: 'next' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('completed');
    expect(result.message).toMatch(/セッション完了/);
  });

  it('does not complete while any earlier item is unanswered', () => {
    const s = session([item({ recordId: 'rec-1' }), item({ recordId: 'rec-2' })]);
    expect(s.status).toBe('initial');
    // A correct submit on item 1 leaves the session on item 2, not completed.
    let state = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
    state = applyTonePracticeAction(state, { kind: 'submit' }).state;
    state = applyTonePracticeAction(state, { kind: 'next' }).state;
    expect(state.status).toBe('initial');
    expect(state.currentIndex).toBe(1);
  });

  it('restarts the whole session from completion', () => {
    const s = advanceCorrect(session([item({ recordId: 'rec-1' })]));
    expect(s.status).toBe('completed');
    const result = applyTonePracticeAction(s, { kind: 'restart' });
    expect(result.state.status).toBe('initial');
    expect(result.state.currentIndex).toBe(0);
    expect(result.state.selected).toBeNull();
    expect(result.state.lastCorrect).toBeNull();
    // The item set is preserved on restart.
    expect(result.state.items.map((i) => i.recordId)).toEqual(['rec-1']);
  });
});

// ─── Frozen determinism ─────────────────────────────────────────────────────

describe('frozen determinism', () => {
  it('repeated identical action sequences produce deeply equal states', () => {
    function run() {
      let s = session([item({ recordId: 'rec-1' }), item({ recordId: 'rec-2' })]);
      s = applyTonePracticeAction(s, { kind: 'select', choice: '第二声' }).state;
      s = applyTonePracticeAction(s, { kind: 'submit' }).state;
      s = applyTonePracticeAction(s, { kind: 'retry' }).state;
      s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
      s = applyTonePracticeAction(s, { kind: 'submit' }).state;
      s = applyTonePracticeAction(s, { kind: 'next' }).state;
      s = applyTonePracticeAction(s, { kind: 'select', choice: '第一声' }).state;
      s = applyTonePracticeAction(s, { kind: 'submit' }).state;
      s = applyTonePracticeAction(s, { kind: 'next' }).state;
      return s;
    }
    expect(run()).toEqual(run());
    expect(run()).toEqual(run());
  });

  it('has no scoring, timer, randomness, or persistence in the domain', () => {
    // Attempt/score counters and time/random sources are intentionally absent:
    // the state only tracks status, current item, selection, and correctness.
    const s = session();
    const stateKeys = Object.keys(s).sort();
    expect(stateKeys).toEqual([
      'currentIndex',
      'items',
      'lastCorrect',
      'pendingCorrect',
      'selected',
      'status',
    ]);
  });
});
