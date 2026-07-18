import { describe, it, expect } from 'vitest';
import {
  createSession,
  answer,
  getCurrentQuestion,
} from '../src/lib/practiceSession';
import { generateQuestions } from '../src/lib/practice';
import type { Lesson } from '../src/types/lesson';

const baseLesson: Lesson = {
  id: 'lesson-001',
  titleJa: '夜市で注文してみよう',
  level: 'beginner',
  canDoJa: '台湾の夜市で簡単に食べ物を注文できる',
  learnerOutcomeJa: '指差し注文と基本表現「我要〜」が使える',
  hookJa: '台湾の夜市と言えば…臭豆腐？それともタピオカ？',
  travelScenario: 'food',
  coreSentence: '我要這個',
  chunks: [
    { chunk: '我要', meaning: '私は〜が欲しい' },
    { chunk: '這個', meaning: 'これ' },
  ],
  kanjiBridgeNotes: [
    { kanji: '要', jpReading: 'よう', noteJa: '日本語の「要る」に近い' },
  ],
  soundFocus: [
    { item: '要 yào', noteJa: '第四声' },
  ],
  reviewStatus: 'reviewed',
  reviewPrompts: [
    {
      promptJa: '「我要這個」はどういう意味？',
      answerJa: 'これをください',
      distractorsJa: ['私は〜が欲しい', 'これはいくらですか'],
    },
  ],
  travelTask: '夜市で指を差して「我要這個」と言ってみよう',
};

function makeSession(overrides?: Partial<Lesson>) {
  const lesson: Lesson = { ...baseLesson, ...overrides };
  return createSession(generateQuestions(lesson));
}

describe('practiceSession', () => {
  describe('initial state', () => {
    it('is active and not completed', () => {
      const session = makeSession();
      expect(session.status).toBe('active');
    });

    it('does not reveal expected answer', () => {
      const session = makeSession();
      const q = getCurrentQuestion(session);
      expect(q).not.toBeNull();
      expect(q!.correctAnswer).toBe('これをください');
      // No feedback has been produced yet
    });
  });

  describe('correct answer', () => {
    it('single-question session completes after one correct answer', () => {
      const session = makeSession();
      const q = getCurrentQuestion(session)!;
      const result = answer(session, q.correctAnswer);
      expect(result.feedback.kind).toBe('correct');
      expect(result.session.status).toBe('completed');
    });
  });

  describe('incorrect answer', () => {
    it('reveals the expected answer in feedback', () => {
      const session = makeSession();
      const result = answer(session, 'wrong');
      expect(result.feedback.kind).toBe('incorrect');
      expect(result.feedback.correctAnswer).toBe('これをください');
    });

    it('does not advance and stays active', () => {
      const session = makeSession();
      answer(session, 'wrong');
      expect(session.currentIndex).toBe(0);
      expect(session.status).toBe('active');
    });

    it('allows retry on the same question', () => {
      const lessonData: Lesson = {
        ...baseLesson,
        id: 'lesson-retry',
        reviewPrompts: [
          { promptJa: 'Q?', answerJa: '正解', distractorsJa: ['誤答'] },
        ],
      };
    const session = makeSession(lessonData);
      expect(session.status).toBe('active');

      // Retry same question - correct
      const q = getCurrentQuestion(session)!;
      expect(q.correctAnswer).toBe('正解');
      const r2 = answer(session, q.correctAnswer);
      expect(r2.feedback.kind).toBe('correct');
      expect(r2.session.status).toBe('completed');
    });
  });

  describe('completion contract', () => {
    it('single-question session completes after one correct answer', () => {
      const session = makeSession();
      const q = getCurrentQuestion(session)!;
      const result = answer(session, q.correctAnswer);
      expect(result.feedback.kind).toBe('correct');
      expect(result.session.status).toBe('completed');
    });

    it('multi-question session completes only after last correct answer', () => {
      const lessonData: Lesson = {
        ...baseLesson,
        id: 'lesson-multi',
        reviewPrompts: [
          { promptJa: 'Q1?', answerJa: 'A1', distractorsJa: ['W1', 'W2'] },
          { promptJa: 'Q2?', answerJa: 'A2', distractorsJa: ['W3', 'W4'] },
        ],
      };
      let session: import('../src/lib/practiceSession').PracticeSession = makeSession(lessonData);

      // First correct
      const r1 = answer(session, 'A1');
      expect(r1.feedback.kind).toBe('correct');
      expect(r1.session.status).toBe('active');

      // Second correct - completes
      session = r1.session;
      const r2 = answer(session, 'A2');
      expect(r2.feedback.kind).toBe('correct');
      expect(r2.session.status).toBe('completed');
    });

    it('completed session returns null from getCurrentQuestion', () => {
      const session = makeSession();
      const q = getCurrentQuestion(session)!;
      const result = answer(session, q.correctAnswer);
      expect(result.session.status).toBe('completed');
      expect(getCurrentQuestion(result.session)).toBeNull();
    });

    it('answer on completed session is a safe no-op', () => {
      const session = makeSession();
      const q = getCurrentQuestion(session)!;
      const completed = answer(session, q.correctAnswer);
      expect(completed.session.status).toBe('completed');

      // Answer again
      const again = answer(completed.session, 'anything');
      expect(again.session.status).toBe('completed');
      expect(again.feedback.kind).toBe('correct');
    });
  });
});

describe('generateQuestions – minimum distractor rule', () => {
  it('skips prompts without distractorsJa', () => {
    const lesson: Lesson = {
      ...baseLesson,
      reviewPrompts: [{ promptJa: 'Q?', answerJa: 'A', distractorsJa: [] }],
    };
    const qs = generateQuestions(lesson);
    expect(qs).toHaveLength(0);
  });

  it('skips prompts where all distractors equal the correct answer', () => {
    const lesson: Lesson = {
      ...baseLesson,
      reviewPrompts: [
        {
          promptJa: 'Q?',
          answerJa: '正解',
          distractorsJa: ['正解', ' 正解 ', ''],
        },
      ],
    };
    expect(generateQuestions(lesson)).toHaveLength(0);
  });

  it('deduplicates whitespace-variant distractors', () => {
    const lesson: Lesson = {
      ...baseLesson,
      id: 'lesson-dedup',
      reviewPrompts: [
        {
          promptJa: 'Q?',
          answerJa: '正解',
          distractorsJa: ['誤答', ' 誤答 ', 'other wrong'],
        },
      ],
    };
    const qs = generateQuestions(lesson);
    expect(qs).toHaveLength(1);
    const correctCount = qs[0].choices.filter((c) => c === '正解').length;
    expect(correctCount).toBe(1);
    const wrongCount = qs[0].choices.filter((c) => c === '誤答').length;
    expect(wrongCount).toBe(1);
    expect(new Set(qs[0].choices).size).toBe(qs[0].choices.length);
  });

  it('every production question has at least 2 choices', async () => {
    const { loadAllRenderableLessons } = await import('../src/content/loadLessons');
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      const qs = generateQuestions(lesson);
      expect(qs.length).toBeGreaterThanOrEqual(1);
      for (const q of qs) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('deterministic ordering is preserved', () => {
    const lesson: Lesson = {
      ...baseLesson,
      id: 'lesson-deter',
      reviewPrompts: [
        {
          promptJa: 'Q?',
          answerJa: 'A',
          distractorsJa: ['D1', 'D2', 'D3'],
        },
      ],
    };
    const first = generateQuestions(lesson);
    for (let i = 0; i < 10; i++) {
      expect(generateQuestions(lesson)).toEqual(first);
    }
  });
});

describe('ProgressStore probe', () => {
  it('does not overwrite existing data under probe key', { timeout: 5000 }, async () => {
    const storage = new Map<string, string>();
    storage.set('__chabiko_probe__', 'existing-value');
    const mock = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    };
    const mod = await import('../src/lib/progress');
    new mod.ProgressStore(mock);
    expect(storage.get('__chabiko_probe__')).toBe('existing-value');
  });
});
