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
    { chunk: '我要', meaning: '私は〜が欲しい', notesJa: '中国語では「要」が意思を表す' },
    { chunk: '這個', meaning: 'これ', notesJa: '指差しで使う' },
  ],
  kanjiBridgeNotes: [
    { kanji: '要', jpReading: 'よう', noteJa: '日本語の「要る」に近い' },
  ],
  soundFocus: [
    { item: '要 yào', noteJa: '第四声' },
  ],
  reviewStatus: 'reviewed',
  reviewPrompts: [
    { promptJa: '「我要這個」はどういう意味？', answerJa: 'これをください' },
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

  it('generates at least 1 choice (the correct answer)', () => {
    const questions = generateQuestions(baseLesson);
    expect(questions[0].choices.length).toBeGreaterThanOrEqual(1);
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
        { promptJa: '値段を聞くときの決まり文句は？', answerJa: '「這個多少錢？」' },
        { promptJa: '「多少」の意味は？', answerJa: 'どれくらい（数量を尋ねる）' },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions).toHaveLength(2);
  });

  it('pulls distractors from chunks when review pool is small', () => {
    const lesson: Lesson = {
      ...baseLesson,
      coreSentence: '核心文',
      chunks: [
        { chunk: '我', meaning: '私' },
        { chunk: '你', meaning: 'あなた' },
      ],
    };
    const questions = generateQuestions(lesson);
    expect(questions[0].choices.length).toBeGreaterThanOrEqual(2);
  });
});
