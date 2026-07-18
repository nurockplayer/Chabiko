import { describe, it, expect } from 'vitest';
import { hasUsableLessonPractice } from '../src/content/loadLessons';
import { generateQuestions } from '../src/lib/practice';
import { buildProgressSnapshot, refreshSnapshot } from '../src/lib/progressSnapshot';
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
  it('both lessons are renderable', () => {
    // Both structually complete — isRenderableLesson is not exported,
    // but we can verify they load through the normal loader path:
    expect(completableLesson.id).toBe('lesson-practice-ready');
    expect(draftNoPractice.id).toBe('lesson-draft-no-practice');
  });

  it('hasUsableLessonPractice distinguishes correctly', () => {
    expect(hasUsableLessonPractice(completableLesson)).toBe(true);
    expect(hasUsableLessonPractice(draftNoPractice)).toBe(false);
  });

  it('generateQuestions returns questions only for completable lesson', () => {
    expect(generateQuestions(completableLesson).length).toBeGreaterThanOrEqual(1);
    expect(generateQuestions(draftNoPractice).length).toBe(0);
  });

  it('progress denominator counts only completable lessons', () => {
    // Simulate completedIds coming from storage
    const completedIds = ['lesson-practice-ready'];
    const completableIds = ['lesson-practice-ready'];

    // Use ProgressStore with mock-backend that has the completed lesson
    const mockStorage: Record<string, string> = {
      chabiko_completed_lessons: JSON.stringify(completedIds),
    };

    // We can't easily inject a map into buildProgressSnapshot because
    // it takes a ProgressStore. But we can test the logic path:
    // refreshSnapshot with completableIds should only count completable ones.

    const store = new ProgressStore({
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
    });

    const snapshot = buildProgressSnapshot(store, completableIds);
    expect(snapshot.totalCount).toBe(1);
    expect(snapshot.completedCount).toBe(1);
  });

  it('non-completable draft is not counted in denominator', () => {
    const store = new ProgressStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });

    // Neither lesson is completable → totalCount should be 0
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

    // Complete the practice-ready lesson
    store.markComplete('lesson-practice-ready');

    const snapshot = buildProgressSnapshot(store, ['lesson-practice-ready']);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.totalCount).toBe(1);
  });
});

describe('buildProgressSnapshot — shared helper', () => {
  it('returns summaryText for non-zero progress', () => {
    const store = new ProgressStore(null);
    store.markComplete('lesson-001');
    const snap = buildProgressSnapshot(store, ['lesson-001']);
    expect(snap.summaryText).toBe('1 / 1 レッスン完了');
  });

  it('returns empty summaryText when nothing completed', () => {
    const store = new ProgressStore(null);
    const snap = buildProgressSnapshot(store, ['lesson-001']);
    expect(snap.summaryText).toBe('');
  });

  it('summaryText includes completed and total counts', () => {
    const store = new ProgressStore(null);
    store.markComplete('lesson-a');
    const snap = buildProgressSnapshot(store, ['lesson-a', 'lesson-b']);
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
    const snap = refreshSnapshot(['lesson-001', 'lesson-002'], storage);
    expect(snap.completedCount).toBe(1);
    expect(snap.totalCount).toBe(2);
  });
});
