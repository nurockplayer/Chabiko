import { describe, expect, it } from 'vitest';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import {
  assertTaiwanTravelProductionLessonSet,
  TAIWAN_TRAVEL_PRODUCTION_LESSON_IDS,
} from '../src/content/taiwanTravelWave1Production';
import type { Lesson } from '../src/types/lesson';

function productionLessons(): Lesson[] {
  return structuredClone(loadAllRenderableLessons()) as Lesson[];
}

describe('Taiwan Travel prelaunch production reconciliation', () => {
  it('allows exactly the 24 canonical lesson IDs in order', () => {
    const lessons = productionLessons();
    assertTaiwanTravelProductionLessonSet(lessons);
    expect(lessons.map((lesson) => lesson.id)).toEqual(
      [...TAIWAN_TRAVEL_PRODUCTION_LESSON_IDS],
    );
  });

  it('fails closed when production contains an extra learner lesson', () => {
    const lessons = productionLessons();
    lessons.push({ ...lessons[0], id: 'lesson-025' });
    expect(() => assertTaiwanTravelProductionLessonSet(lessons)).toThrow(
      /expected exactly 24 learner lessons/,
    );
  });

  it('fails closed when a reconciled candidate record drifts', () => {
    const lessons = productionLessons();
    lessons[10].titleJa = `${lessons[10].titleJa}（変更）`;
    expect(() => assertTaiwanTravelProductionLessonSet(lessons)).toThrow(
      /candidate drift for 'lesson-011'/,
    );
  });

  it('fails closed when a Wave-1 review-pending status is promoted locally', () => {
    const lessons = productionLessons();
    lessons[10].reviewStatus = 'reviewed';
    expect(() => assertTaiwanTravelProductionLessonSet(lessons)).toThrow(
      /lesson-011.*reviewStatus 'draft'/,
    );
  });
});
