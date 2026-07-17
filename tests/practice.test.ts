import { describe, it, expect } from 'vitest';
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

describe('generateQuestions', () => {
  it('generates one question per review prompt', () => {
    const questions = generateQuestions(baseLesson);
    expect(questions).toHaveLength(1);
    expect(questions[0].promptJa).toBe('「我要這個」はどういう意味？');
    expect(questions[0].correctAnswer).toBe('これをください');
    expect(questions[0].lessonId).toBe('lesson-001');
  });

  it('includes the correct answer in choices', () => {
    const questions = generateQuestions(baseLesson);
    expect(questions[0].choices).toContain('これをください');
  });

  it('includes distractors in choices', () => {
    const questions = generateQuestions(baseLesson);
    expect(questions[0].choices).toContain('私は〜が欲しい');
    expect(questions[0].choices).toContain('これはいくらですか');
  });

  it('does not produce duplicate choices', () => {
    const questions = generateQuestions(baseLesson);
    const choices = questions[0].choices;
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('correct answer appears exactly once', () => {
    const questions = generateQuestions(baseLesson);
    const matches = questions[0].choices.filter(
      (c) => c === questions[0].correctAnswer,
    );
    expect(matches).toHaveLength(1);
  });

  it('no distractor equals the correct answer', () => {
    const questions = generateQuestions(baseLesson);
    for (const c of questions[0].choices) {
      if (c !== questions[0].correctAnswer) {
        expect(c).not.toBe(questions[0].correctAnswer);
      }
    }
  });

  it('returns empty array when lesson has no review prompts', () => {
    const lesson: Lesson = { ...baseLesson, reviewPrompts: [] };
    expect(generateQuestions(lesson)).toEqual([]);
  });

  it('returns empty array when review prompts have empty strings', () => {
    const lesson: Lesson = {
      ...baseLesson,
      reviewPrompts: [{ promptJa: '', answerJa: '' }],
    };
    expect(generateQuestions(lesson)).toEqual([]);
  });

  it('generates questions for multiple review prompts', () => {
    const lesson: Lesson = {
      ...baseLesson,
      id: 'lesson-002',
      reviewPrompts: [
        {
          promptJa: '値段を聞くときの決まり文句は？',
          answerJa: '「這個多少錢？」',
          distractorsJa: ['「廁所在哪裡？」', '「我要這個」'],
        },
        {
          promptJa: '「多少」の意味は？',
          answerJa: 'どれくらい（数量を尋ねる）',
          distractorsJa: ['お金', 'どこ'],
        },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions).toHaveLength(2);
  });

  it('handles missing distractorsJa gracefully (single-question skipped)', () => {
    const lesson: Lesson = {
      ...baseLesson,
      reviewPrompts: [
        { promptJa: 'test?', answerJa: '正解' },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions).toHaveLength(0);
  });

  it('strips empty distractor strings from choices', () => {
    const lesson: Lesson = {
      ...baseLesson,
      reviewPrompts: [
        {
          promptJa: 'test?',
          answerJa: '正解',
          distractorsJa: ['', '   ', '誤答'],
        },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions[0].choices).not.toContain('');
    expect(questions[0].choices).not.toContain('   ');
    expect(questions[0].choices).toContain('誤答');
  });
});

describe('regression: known distractor bugs', () => {
  it('"多少" prompt does not include chunk meaning "どれくらい" as a distractor', () => {
    const lesson: Lesson = {
      ...baseLesson,
      id: 'lesson-002',
      coreSentence: '這個多少錢？',
      chunks: [
        { chunk: '這個', meaning: 'これ' },
        { chunk: '多少', meaning: 'どれくらい' },
        { chunk: '錢', meaning: 'お金' },
      ],
      reviewPrompts: [
        {
          promptJa: '「多少」の意味は？',
          answerJa: 'どれくらい（数量を尋ねる）',
          distractorsJa: ['お金', 'どこ'],
        },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions).toHaveLength(1);
    for (const c of questions[0].choices) {
      if (c !== questions[0].correctAnswer) {
        expect(c).not.toBe('どれくらい');
      }
    }
  });

  it('"在" prompt does not include chunk meaning "〜にある・いる" as a distractor', () => {
    const lesson: Lesson = {
      ...baseLesson,
      id: 'lesson-003',
      coreSentence: '捷運站在哪裡？',
      chunks: [
        { chunk: '捷運站', meaning: 'MRTの駅' },
        { chunk: '在', meaning: '〜にある・いる' },
        { chunk: '哪裡', meaning: 'どこ' },
      ],
      reviewPrompts: [
        {
          promptJa: '「在」の意味は？',
          answerJa: '〜にある・いる（存在・位置）',
          distractorsJa: ['どこ', 'いくら'],
        },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions).toHaveLength(1);
    for (const c of questions[0].choices) {
      if (c !== questions[0].correctAnswer) {
        expect(c).not.toBe('〜にある・いる');
      }
    }
  });
});

describe('production lesson content', () => {
  it('all three lessons produce usable questions', async () => {
    const { loadAllRenderableLessons } = await import('../src/content/loadLessons');
    const lessons = loadAllRenderableLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    for (const lesson of lessons) {
      const questions = generateQuestions(lesson);
      expect(questions.length).toBeGreaterThanOrEqual(1);
      for (const q of questions) {
        expect(q.choices.length).toBeGreaterThanOrEqual(1);
        expect(q.choices).toContain(q.correctAnswer);
        expect(new Set(q.choices).size).toBe(q.choices.length);
        for (const c of q.choices) {
          if (c !== q.correctAnswer) {
            expect(c).not.toBe(q.correctAnswer);
          }
        }
      }
    }
  });
});
