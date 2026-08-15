import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../src/lib/progress';
import {
  TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY,
  TAIWAN_TRAVEL_ASSESSMENT_VERSION,
  TaiwanTravelAssessmentStore,
  normalizeBestScore,
  readTaiwanTravelAssessmentEvidence,
} from '../src/lib/taiwanTravelAssessmentStore';

/** The lesson-progress key that the assessment must never touch. */
const LESSON_PROGRESS_KEY = 'chabiko_completed_lessons';

function createMemoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}

describe('normalizeBestScore', () => {
  it('bounds a completed score to 0–10', () => {
    expect(normalizeBestScore(0)).toBe(0);
    expect(normalizeBestScore(10)).toBe(10);
    expect(normalizeBestScore(11)).toBe(10);
    expect(normalizeBestScore(-1)).toBe(0);
  });

  it('normalizes non-integer or non-number values safely to 0', () => {
    expect(normalizeBestScore(3.5)).toBe(0);
    expect(normalizeBestScore(NaN)).toBe(0);
    expect(normalizeBestScore(Infinity)).toBe(0);
    expect(normalizeBestScore('7')).toBe(0);
    expect(normalizeBestScore(null)).toBe(0);
    expect(normalizeBestScore(undefined)).toBe(0);
  });
});

describe('TaiwanTravelAssessmentStore', () => {
  it('reads 0 and no completed attempt when nothing was stored', () => {
    const store = new TaiwanTravelAssessmentStore(createMemoryStorage());
    expect(store.readBestScore()).toBe(0);
    expect(store.hasCompletedAttempt()).toBe(false);
  });

  it('records a completed attempt once and keeps the max best score', () => {
    const storage = createMemoryStorage();
    const store = new TaiwanTravelAssessmentStore(storage);

    expect(store.recordCompletedAttempt(7).bestScore).toBe(7);
    expect(store.readBestScore()).toBe(7);
    expect(store.hasCompletedAttempt()).toBe(true);

    // A later attempt with a lower score must not lower the best score.
    expect(store.recordCompletedAttempt(5).bestScore).toBe(7);
    expect(store.readBestScore()).toBe(7);

    // A later attempt with a higher score raises it.
    expect(store.recordCompletedAttempt(9).bestScore).toBe(9);
    expect(store.readBestScore()).toBe(9);
  });

  it('bounds the recorded score to 0–10', () => {
    const store = new TaiwanTravelAssessmentStore(createMemoryStorage());
    expect(store.recordCompletedAttempt(42).bestScore).toBe(10);
    expect(store.readBestScore()).toBe(10);
    expect(store.recordCompletedAttempt(-5).bestScore).toBe(10);
  });

  it('persists the isolated document under the assessment-only key', () => {
    const storage = createMemoryStorage();
    const store = new TaiwanTravelAssessmentStore(storage);
    store.recordCompletedAttempt(6);
    expect(JSON.parse(storage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)!)).toEqual({
      version: TAIWAN_TRAVEL_ASSESSMENT_VERSION,
      bestScore: 6,
    });
  });

  it('never writes or reads the lesson-progress key', () => {
    const storage = createMemoryStorage({ [LESSON_PROGRESS_KEY]: '["lesson-001"]' });
    const store = new TaiwanTravelAssessmentStore(storage);
    expect(store.readBestScore()).toBe(0);
    store.recordCompletedAttempt(8);
    // Lesson progress is untouched by the isolated assessment store.
    expect(storage.getItem(LESSON_PROGRESS_KEY)).toBe('["lesson-001"]');
  });

  it('fails safe on malformed stored JSON', () => {
    const storage = createMemoryStorage({ [TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY]: '{not json' });
    const store = new TaiwanTravelAssessmentStore(storage);
    expect(store.readBestScore()).toBe(0);
    expect(store.hasCompletedAttempt()).toBe(false);
    expect(store.recordCompletedAttempt(4).bestScore).toBe(4);
  });

  it('fails safe on an unknown-version document', () => {
    const storage = createMemoryStorage({
      [TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY]: JSON.stringify({ version: 2, bestScore: 9 }),
    });
    const store = new TaiwanTravelAssessmentStore(storage);
    expect(store.readBestScore()).toBe(0);
    expect(store.hasCompletedAttempt()).toBe(false);
  });

  it('fails safe on a structurally invalid document', () => {
    for (const raw of [
      JSON.stringify({ version: 1 }),
      JSON.stringify({ version: 1, bestScore: '9' }),
      JSON.stringify({ version: 1, bestScore: null }),
      JSON.stringify('not an object'),
    ]) {
      const storage = createMemoryStorage({ [TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY]: raw });
      const store = new TaiwanTravelAssessmentStore(storage);
      expect(store.readBestScore(), raw).toBe(0);
      expect(store.hasCompletedAttempt(), raw).toBe(false);
    }
  });

  it('fails safe when storage is unavailable (null)', () => {
    const store = new TaiwanTravelAssessmentStore(null);
    expect(store.readBestScore()).toBe(0);
    expect(store.hasCompletedAttempt()).toBe(false);
    expect(store.recordCompletedAttempt(7)).toEqual({ bestScore: 7, wrote: false });
  });

  it('fails safe when storage throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('quota');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    const store = new TaiwanTravelAssessmentStore(throwing);
    expect(store.readBestScore()).toBe(0);
    expect(store.hasCompletedAttempt()).toBe(false);
    expect(store.recordCompletedAttempt(5).wrote).toBe(false);
    expect(store.recordCompletedAttempt(5).bestScore).toBe(5);
  });
});

describe('readTaiwanTravelAssessmentEvidence — read-only adapter', () => {
  it('reports not attempted with zero best score when nothing exists', () => {
    expect(readTaiwanTravelAssessmentEvidence(createMemoryStorage())).toEqual({
      attempted: false,
      bestScore: 0,
    });
  });

  it('reports attempted and the validated best score after a completed attempt', () => {
    const storage = createMemoryStorage();
    new TaiwanTravelAssessmentStore(storage).recordCompletedAttempt(8);
    expect(readTaiwanTravelAssessmentEvidence(storage)).toEqual({
      attempted: true,
      bestScore: 8,
    });
  });

  it('is read-only: it never writes to storage or lesson progress', () => {
    const storage = createMemoryStorage();
    readTaiwanTravelAssessmentEvidence(storage);
    expect(storage.dump()).toEqual({});
  });

  it('fails safe on malformed/unknown-version evidence', () => {
    const storage = createMemoryStorage({
      [TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY]: JSON.stringify({ version: 99, bestScore: 5 }),
    });
    expect(readTaiwanTravelAssessmentEvidence(storage)).toEqual({
      attempted: false,
      bestScore: 0,
    });
  });
});
