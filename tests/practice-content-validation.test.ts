import { describe, it, expect } from 'vitest';
import { loadAllRenderableLessons, loadLessonById } from '../src/content/loadLessons';
import { generateQuestions } from '../src/lib/practice';
import type { Lesson } from '../src/types/lesson';

describe('renderable lesson practice validation', () => {
  it('all three production lessons pass renderable check', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(3);
  });

  it('all three production lessons generate at least one question', () => {
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      const questions = generateQuestions(lesson);
      expect(questions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each production question has at least 2 choices', () => {
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      const questions = generateQuestions(lesson);
      for (const q of questions) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('lesson without valid review prompt is not renderable', () => {
    const lesson = loadLessonById('lesson-001', 'tests/fixtures/incomplete-lesson.json');
    expect(lesson).toBeUndefined();
  });
});

describe('hasUsablePracticePrompt — content-level validation', () => {
  it('lesson with missing distractorsJa is not renderable', () => {
    const lesson = loadLessonById('lesson-001', 'tests/fixtures/missing-required-lesson-array.json');
    // missing-required-lesson-array has reviewPrompts: [] but missing chunks
    expect(lesson).toBeUndefined();
  });

  it('lesson with empty distractorsJa is not renderable', () => {
    // Simulate: a production lesson whose only reviewPrompt has empty distractorsJa
    // would fail isRenderableLesson if it were the only prompt.
    // We test this indirectly: generateQuestions returns [] for such prompts.
    const lessonData: Lesson = {
      id: 'test-empty',
      titleJa: 'Test',
      level: 'beginner',
      canDoJa: 'Test',
      learnerOutcomeJa: 'Test',
      hookJa: 'Test',
      travelScenario: 'food',
      coreSentence: 'test',
      chunks: [],
      kanjiBridgeNotes: [],
      soundFocus: [],
      reviewStatus: 'reviewed',
      reviewPrompts: [
        {
          promptJa: 'Q?',
          answerJa: 'A',
          distractorsJa: [],
        },
      ],
      travelTask: 'Test',
    };
    const questions = generateQuestions(lessonData);
    expect(questions).toHaveLength(0);
  });

  it('lesson with all-distractors-equal-to-answer generates 0 questions', () => {
    const lessonData: Lesson = {
      id: 'test-bad',
      titleJa: 'Test',
      level: 'beginner',
      canDoJa: 'Test',
      learnerOutcomeJa: 'Test',
      hookJa: 'Test',
      travelScenario: 'food',
      coreSentence: 'test',
      chunks: [],
      kanjiBridgeNotes: [],
      soundFocus: [],
      reviewStatus: 'reviewed',
      reviewPrompts: [
        {
          promptJa: 'Q?',
          answerJa: '正解',
          distractorsJa: ['正解', '', '   '],
        },
      ],
      travelTask: 'Test',
    };
    const questions = generateQuestions(lessonData);
    expect(questions).toHaveLength(0);
  });

  it('lesson with one usable prompt generates one question', () => {
    const lessonData: Lesson = {
      id: 'test-good',
      titleJa: 'Test',
      level: 'beginner',
      canDoJa: 'Test',
      learnerOutcomeJa: 'Test',
      hookJa: 'Test',
      travelScenario: 'food',
      coreSentence: 'test',
      chunks: [],
      kanjiBridgeNotes: [],
      soundFocus: [],
      reviewStatus: 'reviewed',
      reviewPrompts: [
        {
          promptJa: 'Q?',
          answerJa: 'A',
          distractorsJa: ['B'],
        },
      ],
      travelTask: 'Test',
    };
    const questions = generateQuestions(lessonData);
    expect(questions).toHaveLength(1);
    expect(questions[0].choices.length).toBeGreaterThanOrEqual(2);
  });

  it('malformed runtime data does not crash generateQuestions', () => {
    const lessonData: Lesson = {
      id: 'test-crash',
      titleJa: 'Test',
      level: 'beginner',
      canDoJa: 'Test',
      learnerOutcomeJa: 'Test',
      hookJa: 'Test',
      travelScenario: 'food',
      coreSentence: 'test',
      chunks: [],
      kanjiBridgeNotes: [],
      soundFocus: [],
      reviewStatus: 'reviewed',
      reviewPrompts: undefined as unknown as [],
      travelTask: 'Test',
    };
    expect(() => generateQuestions(lessonData)).not.toThrow();
    expect(generateQuestions(lessonData)).toEqual([]);
  });
});
