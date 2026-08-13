import { describe, expect, it } from 'vitest';
import {
  VOCABULARY_QUIZ_LENGTH,
  VOCABULARY_QUIZ_OPTION_COUNT,
  applyVocabularyQuizAction,
  buildVocabularyQuizQuestions,
  createVocabularyQuizSession,
  isEligibleVocabularyQuizEntry,
} from '../src/domain/vocabularyQuiz';
import type {
  VocabularyQuizEntry,
  VocabularyQuizQuestion,
} from '../src/domain/vocabularyQuiz';

// ─── Helpers ────────────────────────────────────────────────────────────────

function entry(overrides?: Partial<VocabularyQuizEntry>): VocabularyQuizEntry {
  const base: VocabularyQuizEntry = {
    learnerId: 'id-1',
    simplified: '看',
    japanese: '(もの)を見る',
    pinyin: 'kàn',
    traditional: '看',
  };
  return { ...base, ...overrides };
}

/** A small deterministic corpus with clearly distinct Japanese meanings. */
function corpus(n: number): VocabularyQuizEntry[] {
  return Array.from({ length: n }, (_, i) =>
    entry({
      learnerId: `id-${i + 1}`,
      simplified: `単${i + 1}`,
      japanese: `意味${i + 1}`,
      pinyin: `p${i + 1}`,
      traditional: `繁${i + 1}`,
    }),
  );
}

function session(questions: VocabularyQuizQuestion[] = [question()]) {
  return createVocabularyQuizSession(questions);
}

function question(overrides?: Partial<VocabularyQuizQuestion>): VocabularyQuizQuestion {
  const base: VocabularyQuizQuestion = {
    learnerId: 'id-1',
    simplified: '看',
    options: ['(もの)を見る', '大きい', 'みんな', '行く'],
    correctIndex: 0,
    pinyin: 'kàn',
    traditional: '看',
  };
  return { ...base, ...overrides };
}

// ─── Eligibility ────────────────────────────────────────────────────────────

describe('eligibility', () => {
  it('accepts entries with a non-empty simplified and japanese', () => {
    expect(isEligibleVocabularyQuizEntry(entry())).toBe(true);
  });

  it('rejects entries with an empty japanese', () => {
    expect(isEligibleVocabularyQuizEntry(entry({ japanese: '' }))).toBe(false);
    expect(isEligibleVocabularyQuizEntry(entry({ japanese: '   ' }))).toBe(false);
  });

  it('rejects entries with an empty simplified', () => {
    expect(isEligibleVocabularyQuizEntry(entry({ simplified: '' }))).toBe(false);
    expect(isEligibleVocabularyQuizEntry(entry({ simplified: '   ' }))).toBe(false);
  });
});

// ─── Question construction ──────────────────────────────────────────────────

describe('buildVocabularyQuizQuestions', () => {
  it('returns at most the requested length', () => {
    const questions = buildVocabularyQuizQuestions(corpus(20));
    expect(questions.length).toBe(VOCABULARY_QUIZ_LENGTH);
  });

  it('returns fewer than length when the corpus is smaller', () => {
    const questions = buildVocabularyQuizQuestions(corpus(4), 10);
    expect(questions.length).toBe(4);
  });

  it('builds exactly four distinct options with exactly one correct index', () => {
    const questions = buildVocabularyQuizQuestions(corpus(10), 3);
    for (const q of questions) {
      expect(q.options).toHaveLength(VOCABULARY_QUIZ_OPTION_COUNT);
      expect(new Set(q.options).size).toBe(VOCABULARY_QUIZ_OPTION_COUNT);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      // The correct answer is the entry's Japanese meaning.
      expect(q.options[q.correctIndex]).toMatch(/^意味/);
    }
  });

  it('uses distinct Japanese meanings as distractors, never the correct value', () => {
    const questions = buildVocabularyQuizQuestions(corpus(10), 3);
    for (const q of questions) {
      const correct = q.options[q.correctIndex];
      const distractors = q.options.filter((_, i) => i !== q.correctIndex);
      expect(distractors).toHaveLength(3);
      expect(distractors).not.toContain(correct);
      expect(new Set(distractors).size).toBe(3);
    }
  });

  it('is deterministic: identical input yields identical question lists', () => {
    const input = corpus(30);
    expect(buildVocabularyQuizQuestions(input)).toEqual(buildVocabularyQuizQuestions(input));
  });

  it('does not mutate its input', () => {
    const input = corpus(10);
    const before = JSON.stringify(input);
    buildVocabularyQuizQuestions(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('skips questions (never fabricates) when fewer than four distinct meanings exist', () => {
    // Three entries sharing three distinct meanings among them can never form
    // four unique options, so every question is skipped and the list is empty.
    const shared = [
      entry({ learnerId: 'a', simplified: '一', japanese: '意味1' }),
      entry({ learnerId: 'b', simplified: '二', japanese: '意味2' }),
      entry({ learnerId: 'c', simplified: '三', japanese: '意味3' }),
    ];
    expect(buildVocabularyQuizQuestions(shared)).toEqual([]);
  });

  it('still builds questions when some entries are ineligible', () => {
    const mixed = [
      entry({ learnerId: 'a', simplified: '一', japanese: '意味1' }),
      entry({ learnerId: 'b', simplified: '', japanese: '意味2' }),
      entry({ learnerId: 'c', simplified: '三', japanese: '' }),
      ...corpus(8),
    ];
    const questions = buildVocabularyQuizQuestions(mixed, 4);
    expect(questions.length).toBe(4);
    // Ineligible entries never appear as prompts.
    for (const q of questions) {
      expect(q.simplified).not.toBe('');
      expect(q.options).toHaveLength(4);
    }
  });

  it('carries pinyin and traditional through for post-commit reveal', () => {
    const full = buildVocabularyQuizQuestions(
      [
        entry({ learnerId: 'a', simplified: '看', japanese: '見る', pinyin: 'kàn', traditional: '看' }),
        ...corpus(8),
      ],
      1,
    );
    expect(full[0].pinyin).toBe('kàn');
    expect(full[0].traditional).toBe('看');
  });
});

// ─── Session creation ───────────────────────────────────────────────────────

describe('createVocabularyQuizSession', () => {
  it('starts answering the first question with no selection and zero score', () => {
    const s = session();
    expect(s.status).toBe('answering');
    expect(s.currentIndex).toBe(0);
    expect(s.selected).toBeNull();
    expect(s.correctCount).toBe(0);
    expect(s.answeredCount).toBe(0);
    expect(s.lastCorrect).toBeNull();
  });

  it('rejects an empty question list', () => {
    expect(() => createVocabularyQuizSession([])).toThrow(/at least one question/);
  });
});

// ─── Transition table ───────────────────────────────────────────────────────

describe('transition table', () => {
  it('answering + select → accepted with selection stored', () => {
    const result = applyVocabularyQuizAction(session(), { kind: 'select', index: 1 });
    expect(result.effect).toBe('accepted');
    expect(result.state.selected).toBe(1);
    expect(result.state.status).toBe('answering');
  });

  it('answering + submit → noop without a selection', () => {
    const result = applyVocabularyQuizAction(session(), { kind: 'submit' });
    expect(result.effect).toBe('noop');
    expect(result.message).toMatch(/no option selected/);
  });

  it('answering + next → noop', () => {
    const result = applyVocabularyQuizAction(session(), { kind: 'next' });
    expect(result.effect).toBe('noop');
  });

  it('select rejects unknown and out-of-range indices', () => {
    expect(applyVocabularyQuizAction(session(), { kind: 'select', index: 4 }).effect).toBe('noop');
    expect(applyVocabularyQuizAction(session(), { kind: 'select', index: -1 }).effect).toBe('noop');
    expect(applyVocabularyQuizAction(session(), { kind: 'select', index: 1.5 }).effect).toBe('noop');
  });

  it('selecting the same option twice is a noop', () => {
    let s = session();
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 2 }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'select', index: 2 });
    expect(result.effect).toBe('noop');
  });

  it('selecting another option replaces the selection', () => {
    let s = session();
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 2 }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'select', index: 3 });
    expect(result.effect).toBe('accepted');
    expect(result.state.selected).toBe(3);
  });

  it('selected + submit correct → revealed/correct, score advances', () => {
    let s = session([question({ correctIndex: 0 })]);
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'submit' });
    expect(result.effect).toBe('correct');
    expect(result.state.status).toBe('revealed');
    expect(result.state.lastCorrect).toBe(true);
    expect(result.state.correctCount).toBe(1);
    expect(result.state.answeredCount).toBe(1);
  });

  it('selected + submit incorrect → revealed/incorrect, score unchanged', () => {
    let s = session([question({ correctIndex: 0 })]);
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 1 }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'submit' });
    expect(result.effect).toBe('incorrect');
    expect(result.state.status).toBe('revealed');
    expect(result.state.lastCorrect).toBe(false);
    expect(result.state.correctCount).toBe(0);
    expect(result.state.answeredCount).toBe(1);
  });

  it('revealed + select → noop (locked)', () => {
    let s = session();
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'select', index: 1 });
    expect(result.effect).toBe('noop');
    expect(result.state.selected).toBe(0);
  });

  it('revealed + submit → noop (duplicate)', () => {
    let s = session();
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'submit' });
    expect(result.effect).toBe('noop');
  });

  it('revealed + next → advances and clears selection/feedback', () => {
    const a = question({ learnerId: 'q1' });
    const b = question({ learnerId: 'q2' });
    let s = session([a, b]);
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'next' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('answering');
    expect(result.state.currentIndex).toBe(1);
    expect(result.state.selected).toBeNull();
    expect(result.state.lastCorrect).toBeNull();
  });

  it('revealed + next on the last question → completed', () => {
    let s = session([question({ learnerId: 'q1' })]);
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'next' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('completed');
    expect(result.message).toMatch(/テスト完了/);
  });

  it('completed + select/submit/next → noop', () => {
    let s = session([question()]);
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
    s = applyVocabularyQuizAction(s, { kind: 'next' }).state;
    expect(s.status).toBe('completed');
    expect(applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).effect).toBe('noop');
    expect(applyVocabularyQuizAction(s, { kind: 'submit' }).effect).toBe('noop');
    expect(applyVocabularyQuizAction(s, { kind: 'next' }).effect).toBe('noop');
  });

  it('restart is accepted from any phase and resets score', () => {
    let s = session();
    s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
    s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
    const result = applyVocabularyQuizAction(s, { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('answering');
    expect(result.state.currentIndex).toBe(0);
    expect(result.state.correctCount).toBe(0);
    expect(result.state.answeredCount).toBe(0);
    expect(result.state.selected).toBeNull();
  });
});

// ─── Score accumulation across questions ────────────────────────────────────

describe('score accumulation', () => {
  function answerAll(
    questions: VocabularyQuizQuestion[],
    picks: number[],
  ) {
    let s = createVocabularyQuizSession(questions);
    for (let i = 0; i < picks.length; i++) {
      s = applyVocabularyQuizAction(s, { kind: 'select', index: picks[i] }).state;
      s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
      if (i < picks.length - 1) {
        s = applyVocabularyQuizAction(s, { kind: 'next' }).state;
      }
    }
    return s;
  }

  it('tallies correct submissions across all questions', () => {
    const questions = [
      question({ learnerId: 'q1', correctIndex: 0 }),
      question({ learnerId: 'q2', correctIndex: 1 }),
      question({ learnerId: 'q3', correctIndex: 2 }),
    ];
    const s = answerAll(questions, [0, 1, 3]);
    expect(s.correctCount).toBe(2);
    expect(s.answeredCount).toBe(3);
    expect(s.status).toBe('revealed');
  });

  it('progress (answeredCount) reaches the total after the last submit', () => {
    const questions = [question({ learnerId: 'q1' }), question({ learnerId: 'q2' })];
    const s = answerAll(questions, [0, 0]);
    expect(s.answeredCount).toBe(2);
    expect(s.answeredCount).toBe(questions.length);
  });
});

// ─── Frozen determinism and no hidden side-effects ──────────────────────────

describe('frozen determinism', () => {
  it('repeated identical action sequences produce deeply equal states', () => {
    function run() {
      const qs = [question({ learnerId: 'q1', correctIndex: 1 }), question({ learnerId: 'q2', correctIndex: 2 })];
      let s = createVocabularyQuizSession(qs);
      s = applyVocabularyQuizAction(s, { kind: 'select', index: 1 }).state;
      s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
      s = applyVocabularyQuizAction(s, { kind: 'next' }).state;
      s = applyVocabularyQuizAction(s, { kind: 'select', index: 0 }).state;
      s = applyVocabularyQuizAction(s, { kind: 'submit' }).state;
      return s;
    }
    expect(run()).toEqual(run());
  });

  it('state keys are exactly the seven quiz fields (score tracked, no hidden state)', () => {
    const s = session();
    expect(Object.keys(s).sort()).toEqual([
      'answeredCount',
      'correctCount',
      'currentIndex',
      'lastCorrect',
      'questions',
      'selected',
      'status',
    ]);
  });

  it('question construction and the session expose no randomness or time', () => {
    // The domain has no Date/Math.random imports; question order is content-derived.
    expect(buildVocabularyQuizQuestions(corpus(20))).toEqual(buildVocabularyQuizQuestions(corpus(20)));
  });
});
