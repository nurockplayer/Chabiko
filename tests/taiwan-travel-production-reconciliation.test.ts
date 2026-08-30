import * as fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
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

  it('fails closed when a candidate record is promoted', () => {
    const lessons = productionLessons();
    const readFileSpy = vi.mocked(fs.readFileSync);
    const originalReadFileSync = readFileSpy.getMockImplementation();
    if (!originalReadFileSync) throw new Error('expected mocked readFileSync');
    readFileSpy.mockImplementation((path, options) => {
      const result = originalReadFileSync(path, options);
      if (!String(path).endsWith('data/content-pilots/taiwan-travel-wave-1/lessons.json')) {
        return result;
      }
      const candidateBundle = JSON.parse(String(result)) as { lessons: Lesson[] };
      candidateBundle.lessons[0].reviewStatus = 'reviewed';
      return JSON.stringify(candidateBundle);
    });

    try {
      expect(() => assertTaiwanTravelProductionLessonSet(lessons)).toThrow(
        /candidate 'lesson-011' must remain reviewStatus 'draft'/,
      );
    } finally {
      readFileSpy.mockImplementation(originalReadFileSync);
    }
  });
});
