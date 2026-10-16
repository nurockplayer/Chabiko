import { describe, expect, it } from 'vitest';
import { loadHskPublication } from '../src/content/loadHskVocabulary';
import { buildHskQuizQuestions, parseHskQuizAnswers, scoreHskQuiz, type HskQuizEntry } from '../src/domain/hskQuiz';
import { formatHskQuizBest, HSK_QUIZ_BEST_KEY, readHskQuizBest, saveHskQuizBest, type HskQuizBestScore } from '../src/domain/hskQuizBestScore';

export function seededRandom(seed = 42) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const corpus = (count: number): HskQuizEntry[] => Array.from({ length: count }, (_, i) => ({
  id: `word-${i}`, simplified: `字${i}`, japanese: `意味${i}`, pinyin: `p${i}`,
}));

describe('HSK quiz generation', () => {
  for (const direction of ['zh-to-ja', 'ja-to-zh'] as const) {
    it(`creates deterministic, distinct questions and choices: ${direction}`, () => {
      const entries = corpus(30);
      const before = JSON.stringify(entries);
      const questions = buildHskQuizQuestions(entries, 20, direction, seededRandom());
      expect(questions).toHaveLength(20);
      expect(questions).toEqual(buildHskQuizQuestions(entries, 20, direction, seededRandom()));
      expect(questions).not.toEqual(buildHskQuizQuestions(entries, 20, direction, seededRandom(3)));
      expect(new Set(questions.map((q) => q.entry.id)).size).toBe(20);
      expect(new Set(questions.map((q) => q.prompt)).size).toBe(20);
      for (const q of questions) {
        expect(new Set(q.options).size).toBe(4);
        expect(q.options[q.correctIndex]).toBe(direction === 'zh-to-ja' ? q.entry.japanese : q.entry.simplified);
        expect(q.prompt).toBe(direction === 'zh-to-ja' ? q.entry.simplified : q.entry.japanese);
        expect(q.options.every((option) => entries.some((entry) => (direction === 'zh-to-ja' ? entry.japanese : entry.simplified) === option))).toBe(true);
      }
      expect(JSON.stringify(entries)).toBe(before);
    });

    it(`rejects duplicate headwords and overlapping normalized senses: ${direction}`, () => {
      const entries = corpus(15).flatMap((entry, i) => [
        entry,
        { ...entry, id: `${entry.id}-same-head`, japanese: `別の意味${i}` },
        { ...entry, id: `${entry.id}-same-gloss`, simplified: `別字${i}`, japanese: `意味${i}（補足）` },
        { ...entry, id: `${entry.id}-overlap`, simplified: `他字${i}`, japanese: `追加${i}、意味${i}` },
        { ...entry, id: `${entry.id}-sentences`, simplified: `文${i}`, japanese: `意味${i}。説明${i}。` },
      ]);
      const normalize = (s: string) => s.normalize('NFKC').replace(/\([^)]*\)/g, '').split(/[。、]/).filter(Boolean);
      const questions = buildHskQuizQuestions(entries, 20, direction, seededRandom());
      expect(questions).toHaveLength(20);
      for (const q of questions) {
        const alternatives = entries.filter((e) => q.options.includes(direction === 'zh-to-ja' ? e.japanese : e.simplified));
        for (const label of q.options.filter((_, i) => i !== q.correctIndex)) {
          const candidates = alternatives.filter((e) => (direction === 'zh-to-ja' ? e.japanese : e.simplified) === label);
          expect(candidates.some((e) => e.simplified !== q.entry.simplified && !normalize(e.japanese).some((sense) => normalize(q.entry.japanese).includes(sense)))).toBe(true);
        }
      }
    });

    it(`supports every published cumulative level: ${direction}`, () => {
      for (const pool of loadHskPublication().pools) {
        for (const length of [10, 20] as const) {
          const questions = buildHskQuizQuestions(pool.fullRange, length, direction, seededRandom());
          expect(questions).toHaveLength(length);
          expect(questions.every((q) => pool.fullRange.some((entry) => entry.id === q.entry.id))).toBe(true);
        }
      }
    });
  }

  it('fails closed for short, empty, or ambiguous pools', () => {
    for (const entries of [[], corpus(9), corpus(20).map((e) => ({ ...e, japanese: '同じ' })), corpus(20).map((e) => ({ ...e, simplified: '同' }))]) {
      expect(buildHskQuizQuestions(entries, 10, 'zh-to-ja')).toEqual([]);
    }
    expect(buildHskQuizQuestions(corpus(19), 20, 'ja-to-zh')).toEqual([]);
  });

  it('excludes empty answers, duplicate IDs, and duplicate prompts', () => {
    const entries = corpus(20);
    expect(buildHskQuizQuestions([...entries.slice(0, 9), entries[0], { ...entries[9], japanese: ' ' }], 10, 'zh-to-ja')).toEqual([]);
    expect(buildHskQuizQuestions(entries.map((e) => ({ ...e, japanese: '同じ' })), 10, 'ja-to-zh')).toEqual([]);
  });
});

describe('HSK scoring and answer loading', () => {
  it('scores only valid answers and reports missed words in question order', () => {
    const questions = buildHskQuizQuestions(corpus(10), 10, 'zh-to-ja', seededRandom());
    const answers = questions.map((q, i) => i % 2 ? (q.correctIndex + 1) % 4 : q.correctIndex);
    expect(scoreHskQuiz(questions, answers)).toEqual({ correct: 5, answered: 10, total: 10, complete: true, missed: questions.filter((_, i) => i % 2).map((q) => q.entry) });
    expect(scoreHskQuiz(questions, [NaN, -1, 4, 0.5])).toMatchObject({ correct: 0, answered: 0, complete: false });
    expect(scoreHskQuiz(questions, []).complete).toBe(false);
    expect(scoreHskQuiz([], []).complete).toBe(false);
  });
  it('requires a matching admitted answer artifact with direct Simplified forms', () => {
    const entries = corpus(10).map((e) => ({ ...e, simplifiedStatus: 'authored' }));
    const ids = entries.map((e) => e.id);
    expect(parseHskQuizAnswers({ version: 1, entries }, ids)).toEqual(corpus(10));
    for (const payload of [null, {}, { version: 2, entries }, { version: 1, entries: entries.slice(1) },
      { version: 1, entries: entries.toReversed() }, { version: 1, entries: entries.map((e) => ({ ...e, pinyin: '' })) },
      { version: 1, entries: entries.map((e) => ({ ...e, simplifiedStatus: 'unavailable' })) }]) {
      expect(parseHskQuizAnswers(payload, ids)).toBeNull();
    }
    expect(parseHskQuizAnswers({ version: 1, entries }, ids.map(() => ids[0]))).toBeNull();
  });
});

describe('HSK best scores', () => {
  const score = (correct = 8, total: 10 | 20 = 10): HskQuizBestScore => ({ version: 1, correct, total, direction: 'zh-to-ja' });
  function storage() {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  }
  it('isolates levels, compares percentages, and prefers longer tests on a tie', () => {
    const store = storage();
    expect(readHskQuizBest(1, store)).toBeNull();
    expect(saveHskQuizBest(1, score(), store)).toBe(true);
    saveHskQuizBest(1, score(14, 20), store);
    expect(readHskQuizBest(1, store)).toEqual(score());
    saveHskQuizBest(1, score(16, 20), store);
    expect(readHskQuizBest(1, store)).toEqual(score(16, 20));
    saveHskQuizBest(1, score(9), store);
    expect(readHskQuizBest(1, store)).toEqual(score(9));
    expect(readHskQuizBest(2, store)).toBeNull();
    expect(formatHskQuizBest(score())).toBe('テスト最高 80%（8/10）');
  });
  it('tolerates corrupt values and denied storage without claiming a saved score', () => {
    const store = storage();
    for (const raw of ['{', 'null', '[]', '7', JSON.stringify({ ...score(), total: 0 }), JSON.stringify({ ...score(), correct: 11 }), JSON.stringify({ ...score(), version: 2 }), JSON.stringify({ ...score(), direction: 'bad' }), JSON.stringify({ ...score(), correct: 1.5 })]) {
      store.setItem(`${HSK_QUIZ_BEST_KEY}:1`, raw);
      expect(readHskQuizBest(1, store)).toBeNull();
      expect(saveHskQuizBest(1, score(0), store)).toBe(true);
      expect(readHskQuizBest(1, store)).toEqual(score(0));
    }
    const denied = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
    expect(readHskQuizBest(1, denied)).toBeNull();
    expect(saveHskQuizBest(1, score(), denied)).toBe(false);
    expect(saveHskQuizBest(5, score(), store)).toBe(false);
    expect(saveHskQuizBest(1, { ...score(), correct: -1 }, store)).toBe(false);
  });
});
