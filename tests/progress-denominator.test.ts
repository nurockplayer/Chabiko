import { describe, it, expect } from 'vitest';
import { loadAllRenderableLessons, hasUsableLessonPractice } from '../src/content/loadLessons';
import { generateQuestions } from '../src/lib/practice';
import { computeProgressSnapshot } from '../src/lib/progressSnapshot';

describe('home page progress denominator', () => {
  it('all renderable production lessons have usable practice', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    const completable = lessons.filter((l) => hasUsableLessonPractice(l));
    expect(completable.length).toBe(lessons.length);
  });

  it('completable lessons generate at least one question', () => {
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      if (hasUsableLessonPractice(lesson)) {
        const questions = generateQuestions(lesson);
        expect(questions.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('progress count only includes completable lessons', () => {
    const lessons = loadAllRenderableLessons();
    const completableIds = lessons
      .filter((l) => hasUsableLessonPractice(l))
      .map((l) => l.id);
    const nonCompletable = lessons.filter((l) => !hasUsableLessonPractice(l));
    expect(completableIds.length).toBe(lessons.length);
    expect(nonCompletable.length).toBe(0);
    for (const id of completableIds) {
      const lesson = lessons.find((l) => l.id === id)!;
      expect(hasUsableLessonPractice(lesson)).toBe(true);
    }
  });
});

describe('progressSnapshot — denominator', () => {
  it('mixed completable and non-completable lessons: only completable counted', () => {
    const lessonIds = ['lesson-practice-ready', 'lesson-draft-no-practice'];
    const completedIds: string[] = ['lesson-practice-ready'];

    const snapshot = computeProgressSnapshot(completedIds, lessonIds, ['lesson-practice-ready']);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.totalCount).toBe(1);
    expect(snapshot.completed.has('lesson-practice-ready')).toBe(true);
  });

  it('all lessons completable: denominator equals lesson count', () => {
    const lessonIds = ['l1', 'l2'];
    const completedIds = ['l1'];
    const completableIds = ['l1', 'l2'];

    const snapshot = computeProgressSnapshot(completedIds, lessonIds, completableIds);
    expect(snapshot.totalCount).toBe(2);
    expect(snapshot.completedCount).toBe(1);
  });

  it('non-completable lesson not in denominator', () => {
    const lessonIds = ['draft-only'];
    const completedIds: string[] = [];
    const completableIds: string[] = [];

    const snapshot = computeProgressSnapshot(completedIds, lessonIds, completableIds);
    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.completedCount).toBe(0);
  });

  it('no completable lessons: denominator is 0, progress text is empty', () => {
    const snapshot = computeProgressSnapshot([], ['draft-a', 'draft-b'], []);
    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.completedCount).toBe(0);
  });

  it('complete all completable lessons: reaches 1/1', () => {
    const completableIds = ['lesson-ready'];
    const snapshot = computeProgressSnapshot(['lesson-ready'], ['lesson-ready', 'draft-x'], completableIds);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.totalCount).toBe(1);
  });
});
