import { describe, expect, it } from 'vitest';
import { generateQuestions } from '../src/lib/practice';
import type { Lesson } from '../src/types/lesson';

describe('practice generation safety and determinism', () => {
  it('ignores null, primitive, and non-string review prompt entries', () => {
    const lesson = {
      id: 'lesson-malformed',
      reviewPrompts: [
        null,
        42,
        { promptJa: 123, answerJa: 'answer' },
        { promptJa: 'question', answerJa: false },
        {
          promptJa: ' valid question? ',
          answerJa: ' valid answer ',
          distractorsJa: ['wrong answer'],
        },
      ],
    } as unknown as Lesson;

    expect(generateQuestions(lesson)).toEqual([
      {
        promptJa: 'valid question?',
        correctAnswer: 'valid answer',
        choices: expect.arrayContaining(['valid answer', 'wrong answer']),
        lessonId: 'lesson-malformed',
      },
    ]);
  });

  it('treats malformed distractor data as an empty list', () => {
    const lesson = {
      id: 'lesson-bad-distractors',
      reviewPrompts: [
        {
          promptJa: 'question?',
          answerJa: 'answer',
          distractorsJa: { wrong: 'shape' },
        },
      ],
    } as unknown as Lesson;

    expect(generateQuestions(lesson)[0].choices).toEqual(['answer']);
  });

  it('produces the same choice order for repeated generation', () => {
    const lesson = {
      id: 'lesson-deterministic',
      reviewPrompts: [
        {
          promptJa: 'question?',
          answerJa: 'answer',
          distractorsJa: ['wrong one', 'wrong two', 'wrong three'],
        },
      ],
    } as unknown as Lesson;

    const first = generateQuestions(lesson);
    for (let run = 0; run < 10; run++) {
      expect(generateQuestions(lesson)).toEqual(first);
    }
  });
});
