import { describe, expect, it } from 'vitest';
import { loadHskPublication } from '../src/content/loadHskVocabulary';
import nearSynonyms from '../data/hsk-quiz/near-synonym-groups.json';
import { hskQuizNearSynonymGroupOf } from '../src/content/hskQuizNearSynonyms';
import { buildHskQuizQuestions, parseHskQuizAnswers, scoreHskQuiz, type HskQuizEntry } from '../src/domain/hskQuiz';
import { formatHskQuizBest, HSK_QUIZ_BEST_KEY, readHskQuizBest, saveHskQuizBest, type HskQuizBestScore } from '../src/domain/hskQuizBestScore';

export function seededRandom(seed = 42) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
// Distinct single-character headwords and kana glosses, so fixtures never collide by kanji.
const han = (i: number) => String.fromCodePoint(0x4e00 + i * 3);
const corpus = (count: number): HskQuizEntry[] => Array.from({ length: count }, (_, i) => ({
  id: `word-${i}`, simplified: han(i), japanese: `いみ${i}`, pinyin: `p${i}`,
}));

describe('HSK quiz generation', () => {
  it('excludes group zero and conflicts between distractors while keeping ungrouped choices', () => {
    const entries = corpus(30);
    const groupOf = (id: string) => Number(id.slice(5)) < 15 ? 0 : undefined;
    let sawGroupedAnswer = false;
    let sawUngroupedAnswer = false;
    let sawGroupedDistractor = false;
    for (const direction of ['zh-to-ja', 'ja-to-zh'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const questions = buildHskQuizQuestions(entries, 20, direction, seededRandom(seed), groupOf);
        expect(questions).toHaveLength(20);
        for (const question of questions) {
          const choices = entries.filter((entry) => question.options.includes(direction === 'zh-to-ja' ? entry.japanese : entry.simplified));
          expect(choices).toHaveLength(4);
          expect(choices.filter((entry) => groupOf(entry.id) === 0).length).toBeLessThanOrEqual(1);
          if (groupOf(question.entry.id) === 0) sawGroupedAnswer = true;
          else {
            sawUngroupedAnswer = true;
            if (choices.some((entry) => groupOf(entry.id) === 0)) sawGroupedDistractor = true;
          }
        }
      }
    }
    expect([sawGroupedAnswer, sawUngroupedAnswer, sawGroupedDistractor]).toEqual([true, true, true]);
  });

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
        { ...entry, id: `${entry.id}-same-head`, japanese: `べつのいみ${i}` },
        { ...entry, id: `${entry.id}-same-gloss`, simplified: han(100 + i), japanese: `いみ${i}（ほそく）` },
        { ...entry, id: `${entry.id}-overlap`, simplified: han(200 + i), japanese: `ついか${i}、いみ${i}` },
        { ...entry, id: `${entry.id}-sentences`, simplified: han(300 + i), japanese: `いみ${i}。せつめい${i}。` },
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

  it('never offers near-synonym glosses as competing choices (お母さん／母)', () => {
    const fillers = ['ここ', 'そこ', 'あそこ', 'どこ', 'これ', 'それ', 'あれ', 'どれ', 'いつ', 'だれ', 'なに', 'すこし']
      .map((japanese, i) => ({ id: `f${i}`, simplified: han(400 + i), pinyin: 'x', japanese: `${japanese}。` }));
    const entries = [
      { id: 'mama', simplified: '妈妈', pinyin: 'māma', japanese: 'お母さん。' },
      { id: 'muqin', simplified: '母亲', pinyin: 'mǔqīn', japanese: '母。' },
      ...fillers,
    ];
    for (let seed = 1; seed <= 200; seed++) {
      for (const direction of ['zh-to-ja', 'ja-to-zh'] as const) {
        for (const q of buildHskQuizQuestions(entries, 10, direction, seededRandom(seed))) {
          const labels = direction === 'zh-to-ja' ? ['お母さん。', '母。'] : ['妈妈', '母亲'];
          expect(labels.filter((label) => q.options.includes(label)).length).toBeLessThan(2);
        }
      }
    }
  });

  it('keeps published-pool choices free of shared gloss kanji (HSK 4, seed 5108)', () => {
    const kanji = (text: string) => new Set(text.match(/\p{Script=Han}/gu) ?? []);
    const pool = loadHskPublication().pools.at(-1)!.fullRange;
    const byLabel = new Map(pool.map((e) => [e.japanese, e]));
    for (const seed of [5108, 1, 2, 3]) {
      for (const q of buildHskQuizQuestions(pool, 20, 'zh-to-ja', seededRandom(seed))) {
        const sets = q.options.map((label) => kanji(byLabel.get(label)?.japanese ?? label));
        for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
          expect([...sets[a]].some((c) => sets[b].has(c)), `${q.entry.simplified}: ${q.options.join(' | ')}`).toBe(false);
        }
      }
    }
  });

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

describe('published HSK near-synonym exclusions', () => {
  const pools = loadHskPublication().pools;
  const entries = pools.at(-1)!.fullRange;

  it('contains only existing IDs, with at least two members and one group per ID', () => {
    expect(nearSynonyms.version).toBe(1);
    expect(nearSynonyms.purpose).toBe('quiz distractor exclusion only; not learner-facing; AI-authored');
    expect(nearSynonyms.groups.length).toBeGreaterThan(0);
    const existing = new Set(entries.map((entry) => entry.id));
    const seen = new Set<string>();
    nearSynonyms.groups.forEach((group, index) => {
      expect(group.length).toBeGreaterThanOrEqual(2);
      for (const id of group) {
        expect(existing.has(id), id).toBe(true);
        expect(seen.has(id), `duplicate: ${id}`).toBe(false);
        expect(hskQuizNearSynonymGroupOf(id)).toBe(index);
        seen.add(id);
      }
    });
    expect(hskQuizNearSynonymGroupOf('synthetic-unlisted-id')).toBeUndefined();
  });

  it.each([
    ['漂亮', '好看', '美丽'], ['妈妈', '母亲'], ['爸爸', '父亲'],
    ['高兴', '快乐', '开心'], ['认识', '知道'], ['一起', '一块儿'], ['刚', '刚才'],
    ['干净', '漂亮'], ['也许', '大概'], ['方法', '办法'], ['美丽', '美'],
  ])('groups overlapping meanings: %s / %s', (...words) => {
    const groups = words.map((word) => hskQuizNearSynonymGroupOf(entries.find((entry) => entry.simplified === word)!.id));
    expect(groups.every((group) => group !== undefined && group === groups[0])).toBe(true);
  });

  for (const direction of ['zh-to-ja', 'ja-to-zh'] as const) {
    it(`regresses 漂亮/好看 in HSK 1 with seed 638: ${direction}`, () => {
      const questions = buildHskQuizQuestions(pools[0].fullRange, 20, direction, seededRandom(638), hskQuizNearSynonymGroupOf);
      const pair = pools[0].fullRange.filter((entry) => ['漂亮', '好看'].includes(entry.simplified));
      expect(pair).toHaveLength(2);
      expect(questions).toHaveLength(20);
      // Exercise the pair even if the stricter exclusions change which prompts are drawn.
      expect(questions.some((question) => pair.some((entry) => question.options.includes(direction === 'zh-to-ja' ? entry.japanese : entry.simplified)))).toBe(true);
      for (const question of questions) {
        expect(pair.filter((entry) => question.options.includes(direction === 'zh-to-ja' ? entry.japanese : entry.simplified)).length).toBeLessThan(2);
      }
    });

    it(`keeps published 妈妈/母亲 apart as answers and distractors: ${direction}`, () => {
      const pair = entries.filter((entry) => ['妈妈', '母亲'].includes(entry.simplified));
      const fillers = corpus(25);
      expect(pair).toHaveLength(2);
      const covered = new Set<string>();
      for (let seed = 1; seed <= 30; seed++) {
        const questions = buildHskQuizQuestions([...pair, ...fillers], 20, direction, seededRandom(seed), hskQuizNearSynonymGroupOf);
        expect(questions).toHaveLength(20);
        for (const question of questions) {
          if (pair.some((entry) => entry.id === question.entry.id)) covered.add(question.entry.id);
          expect(pair.filter((entry) => question.options.includes(direction === 'zh-to-ja' ? entry.japanese : entry.simplified)).length).toBeLessThan(2);
        }
      }
      expect(covered).toEqual(new Set(pair.map((entry) => entry.id)));
    });

    for (const pool of pools) {
      for (const length of [10, 20] as const) {
        it(`fills ${length} questions without grouped options: HSK ${pool.level}, ${direction}, seeds 1..300`, () => {
          const field = direction === 'zh-to-ja' ? 'japanese' : 'simplified';
          const groupsByLabel = new Map<string, Set<number>>();
          for (const entry of pool.fullRange) {
            const group = hskQuizNearSynonymGroupOf(entry.id);
            const groups = groupsByLabel.get(entry[field]) ?? new Set<number>();
            if (group !== undefined) groups.add(group);
            groupsByLabel.set(entry[field], groups);
          }
          for (let seed = 1; seed <= 300; seed++) {
            const questions = buildHskQuizQuestions(pool.fullRange, length, direction, seededRandom(seed), hskQuizNearSynonymGroupOf);
            expect(questions, `seed ${seed}`).toHaveLength(length);
            for (const question of questions) {
              expect(question.options).toHaveLength(4);
              const seen = new Set<number>();
              for (const label of question.options) {
                expect(groupsByLabel.has(label)).toBe(true);
                for (const group of groupsByLabel.get(label)!) {
                  expect(seen.has(group), `seed ${seed}: ${question.options.join(' | ')}`).toBe(false);
                  seen.add(group);
                }
              }
            }
          }
        }, 60_000);
      }
    }
  }
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
