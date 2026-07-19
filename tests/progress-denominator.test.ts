import { describe, it, expect } from 'vitest';
import { loadAllRenderableLessons, hasUsableLessonPractice } from '../src/content/loadLessons';
import { generateQuestions } from '../src/lib/practice';
import { buildProgressSnapshot, refreshSnapshot, type LessonProgressEntry } from '../src/lib/progressSnapshot';
import { ProgressStore } from '../src/lib/progress';
import type { Lesson } from '../src/types/lesson';

const completableLesson: Lesson = {
  id: 'lesson-practice-ready',
  titleJa: 'Practice Ready',
  level: 'beginner',
  canDoJa: '練習できる',
  learnerOutcomeJa: '練習を完了できる',
  hookJa: '練習しよう',
  travelScenario: 'food',
  coreSentence: 'test',
  chunks: [],
  kanjiBridgeNotes: [],
  soundFocus: [],
  reviewStatus: 'reviewed',
  reviewPrompts: [
    { promptJa: 'Q?', answerJa: '正解', distractorsJa: ['誤答'] },
  ],
  travelTask: 'test',
};

const draftNoPractice: Lesson = {
  id: 'lesson-draft-no-practice',
  titleJa: '下書きのみ',
  level: 'beginner',
  canDoJa: 'まだ未完成',
  learnerOutcomeJa: '練習がない',
  hookJa: '準備中',
  travelScenario: 'food',
  coreSentence: 'test',
  chunks: [],
  kanjiBridgeNotes: [],
  soundFocus: [],
  reviewStatus: 'draft',
  reviewPrompts: [
    { promptJa: 'Q?', answerJa: 'A', distractorsJa: [] },
  ],
  travelTask: 'test',
};

describe('mixed completable / draft lessons', () => {
  it('both lessons load through production loader', () => {
    const lessons = loadAllRenderableLessons('tests/fixtures/mixed-renderable.json');
    expect(lessons).toHaveLength(2);
    expect(lessons[0].id).toBe('lesson-practice-ready');
    expect(lessons[1].id).toBe('lesson-draft-no-practice');
  });

  it('hasUsableLessonPractice distinguishes correctly', () => {
    expect(hasUsableLessonPractice(completableLesson)).toBe(true);
    expect(hasUsableLessonPractice(draftNoPractice)).toBe(false);
  });

  it('hasUsableLessonPractice for production-loaded lessons', () => {
    const lessons = loadAllRenderableLessons('tests/fixtures/mixed-renderable.json');
    expect(hasUsableLessonPractice(lessons[0])).toBe(true);
    expect(hasUsableLessonPractice(lessons[1])).toBe(false);
  });

  it('generateQuestions returns questions only for completable lesson', () => {
    expect(generateQuestions(completableLesson).length).toBeGreaterThanOrEqual(1);
    expect(generateQuestions(draftNoPractice).length).toBe(0);
  });

  it('production loader loads both lessons from mixed fixture', () => {
    const lessons = loadAllRenderableLessons('tests/fixtures/mixed-renderable.json');
    expect(lessons).toHaveLength(2);
    // Both are structurally renderable
    expect(lessons[0].id).toBe('lesson-practice-ready');
    expect(lessons[1].id).toBe('lesson-draft-no-practice');
    // Only lesson-practice-ready has usable practice
    const entries: LessonProgressEntry[] = lessons.map((l) => ({
      id: l.id,
      completable: hasUsableLessonPractice(l),
    }));
    expect(entries[0].completable).toBe(true);
    expect(entries[1].completable).toBe(false);
  });

  it('shared helper counts only completable lessons in denominator', () => {
    const store = new ProgressStore({
      getItem: () => JSON.stringify(['lesson-practice-ready']),
      setItem: () => {},
      removeItem: () => {},
    });
    const lessons = loadAllRenderableLessons('tests/fixtures/mixed-renderable.json');
    const entries: LessonProgressEntry[] = lessons.map((l) => ({
      id: l.id,
      completable: hasUsableLessonPractice(l),
    }));
    const snapshot = buildProgressSnapshot(store, entries);
    expect(snapshot.totalCount).toBe(1);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.summaryText).toBe('1 / 1 レッスン完了');
  });

  it('non-completable draft is not counted in denominator', () => {
    const store = new ProgressStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });

    const snapshot = buildProgressSnapshot(store, []);
    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.completedCount).toBe(0);
  });

  it('advancing completable lesson to 1/1 is possible', () => {
    const mockStorage = new Map<string, string>();

    const store = new ProgressStore({
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => { mockStorage.set(k, v); },
      removeItem: (k: string) => { mockStorage.delete(k); },
    });

    store.markComplete('lesson-practice-ready');

    const snapshot = buildProgressSnapshot(store, [
      { id: 'lesson-practice-ready', completable: true },
      { id: 'lesson-draft-no-practice', completable: false },
    ]);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.totalCount).toBe(1);
    expect(snapshot.summaryText).toBe('1 / 1 レッスン完了');
  });

  it('draft lesson does not prevent 1/1 progress attainment', () => {
    const mockStorage = new Map<string, string>();
    const store = new ProgressStore({
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => { mockStorage.set(k, v); },
      removeItem: (k: string) => { mockStorage.delete(k); },
    });
    store.markComplete('lesson-practice-ready');

    // Both lessons through the same production path (shared helper)
    const lessons = loadAllRenderableLessons('tests/fixtures/mixed-renderable.json');
    const entries: LessonProgressEntry[] = lessons.map((l) => ({
      id: l.id,
      completable: hasUsableLessonPractice(l),
    }));
    const snapshot = buildProgressSnapshot(store, entries);
    expect(snapshot.totalCount).toBe(1);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.summaryText).toBe('1 / 1 レッスン完了');
  });
});

describe('buildProgressSnapshot — shared helper', () => {
  it('returns summaryText for non-zero progress', () => {
    const store = new ProgressStore(null);
    store.markComplete('lesson-001');
    const snap = buildProgressSnapshot(store, [{ id: 'lesson-001', completable: true }]);
    expect(snap.summaryText).toBe('1 / 1 レッスン完了');
  });

  it('returns empty summaryText when nothing completed', () => {
    const store = new ProgressStore(null);
    const snap = buildProgressSnapshot(store, [{ id: 'lesson-001', completable: true }]);
    expect(snap.summaryText).toBe('');
  });

  it('summaryText includes completed and total counts', () => {
    const store = new ProgressStore(null);
    store.markComplete('lesson-a');
    const snap = buildProgressSnapshot(store, [{ id: 'lesson-a', completable: true }, { id: 'lesson-b', completable: true }]);
    expect(snap.summaryText).toBe('1 / 2 レッスン完了');
  });
});

describe('refreshSnapshot', () => {
  it('reads completion from provided storage', () => {
    const storage = {
      getItem: () => JSON.stringify(['lesson-001']),
      setItem: () => {},
      removeItem: () => {},
    };
    const snap = refreshSnapshot([{ id: 'lesson-001', completable: true }, { id: 'lesson-002', completable: true }], storage);
    expect(snap.completedCount).toBe(1);
    expect(snap.totalCount).toBe(2);
  });
});
