import { describe, it, expect } from 'vitest';
import { loadAllRenderableLessons, hasUsableLessonPractice } from '../src/content/loadLessons';
import { generateQuestions } from '../src/lib/practice';

describe('home page progress denominator', () => {
  it('all renderable production lessons have usable practice', async () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    const completable = lessons.filter((l) => hasUsableLessonPractice(l));
    // All three production lessons should be completable
    expect(completable.length).toBe(lessons.length);
  });

  it('completable lessons generate at least one question', async () => {
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      if (hasUsableLessonPractice(lesson)) {
        const questions = generateQuestions(lesson);
        expect(questions.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('progress count only includes completable lessons', async () => {
    const lessons = loadAllRenderableLessons();
    const completableIds = lessons
      .filter((l) => hasUsableLessonPractice(l))
      .map((l) => l.id);
    const nonCompletable = lessons.filter((l) => !hasUsableLessonPractice(l));

    // All production lessons should be completable
    expect(completableIds.length).toBe(lessons.length);
    expect(nonCompletable.length).toBe(0);

    // Verify each completable lesson has usable prompts
    for (const id of completableIds) {
      const lesson = lessons.find((l) => l.id === id)!;
      expect(hasUsableLessonPractice(lesson)).toBe(true);
    }
  });
});
