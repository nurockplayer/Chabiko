// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../src/lib/progress';
import { STORAGE_KEY, ProgressStore } from '../src/lib/progress';
import { VOCABULARY_PROGRESS_KEY, VocabularyProgressStore } from '../src/domain/vocabularyProgress';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
} from '../src/domain/basicVocabularyProgress';
import { getBasicVocabularyProgressStorageKey } from '../src/domain/basicVocabularyProgressScope';
import type { BasicVocabularySyncRuntimeSnapshot } from '../src/client/basicVocabularySyncRuntime';
import type { BasicVocabularyProgressCoordinator } from '../src/client/basicVocabularyProgressCoordinator';
import type { VocabularyProgressEntry } from '../src/domain/vocabularyProgress';
import {
  buildBasicVocabularyTrackSummary,
  buildCrossTrackProgressSnapshot,
  buildHskTrackSummary,
  buildTaiwanTravelTrackSummary,
  type BasicVocabularyTrackInput,
  type BasicVocabularyTrackScope,
  type HskLevelCorpus,
  type HskTrackInput,
} from '../src/domain/crossTrackProgress';
import {
  createCrossTrackProgressCoordinator,
  type CrossTrackProgressCoordinator,
  type CrossTrackProgressDependencies,
} from '../src/client/crossTrackProgressCoordinator';

// ─── Test helpers ──────────────────────────────────────────────────────────────

/** In-memory storage that records every write for the zero-writes assertion. */
function createRecordingStorage(initial?: Record<string, string>) {
  const data: Record<string, string> = { ...(initial ?? {}) };
  const writes: { op: 'setItem' | 'removeItem'; key: string }[] = [];
  const storage: StorageLike & {
    _data: Record<string, string>;
    _writes: typeof writes;
  } = {
    getItem: (key: string): string | null => data[key] ?? null,
    setItem: (key: string, value: string): void => {
      data[key] = value;
      writes.push({ op: 'setItem', key });
    },
    removeItem: (key: string): void => {
      delete data[key];
      writes.push({ op: 'removeItem', key });
    },
    _data: data,
    _writes: writes,
  };
  return storage;
}

function guestProgress(entries: Record<string, VocabularyProgressEntry>): string {
  return JSON.stringify({ version: 1, items: entries });
}

function hskProgress(entries: Record<string, VocabularyProgressEntry>): string {
  return JSON.stringify({ version: 1, entries });
}

/**
 * A minimal fake of the merged account/progress coordinator (#293) that owns a
 * real scoped store and switches scope on request, so the cross-track boundary
 * reads the exact same shape as production.
 */
function createFakeBasicVocabularyCoordinator(storage: StorageLike | null) {
  let store = new BasicVocabularyProgressStore(storage);
  let scopeSnap: BasicVocabularySyncRuntimeSnapshot = {
    scope: 'guest',
    userId: null,
    status: 'guest',
  };
  const listeners = new Set<(snapshot: BasicVocabularySyncRuntimeSnapshot) => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener(scopeSnap);
  };
  const coordinator: BasicVocabularyProgressCoordinator = {
    getSnapshot: () => scopeSnap,
    getStore: () => store,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(scopeSnap);
      return () => {
        listeners.delete(listener);
      };
    },
    applyRating: vi.fn((itemId: string, rating: 'again' | 'unsure' | 'known') => {
      store.applyRating(itemId, rating);
    }),
    resetAll: vi.fn(() => {
      store.resetAll();
    }),
    acceptSignedIn: vi.fn((userId: string) => {
      store = new BasicVocabularyProgressStore(
        storage,
        getBasicVocabularyProgressStorageKey({ kind: 'user', userId }),
      );
      scopeSnap = { scope: 'user', userId, status: 'idle' };
      notify();
    }),
    acceptSignedOut: vi.fn(() => {
      store = new BasicVocabularyProgressStore(storage);
      scopeSnap = { scope: 'guest', userId: null, status: 'guest' };
      notify();
    }),
    dispose: () => undefined,
  };
  return coordinator;
}

const DEFAULT_CORPUS = ['teacher-star-1-bdc7865a507e'];
const DEFAULT_HSK_LEVELS: HskLevelCorpus[] = [
  { level: 1, ids: ['hsk-001', 'hsk-002', 'hsk-003', 'hsk-004', 'hsk-005'] },
];
const DEFAULT_TAIWAN_LESSONS = [
  'lesson-001',
  'lesson-002',
  'lesson-003',
  'lesson-004',
  'lesson-005',
  'lesson-006',
  'lesson-007',
  'lesson-008',
  'lesson-009',
  'lesson-010',
];

function makeCoordinator(options: {
  storage: StorageLike | null;
  corpusIds?: readonly string[];
  hskLevels?: readonly HskLevelCorpus[];
  taiwanLessons?: readonly string[];
}): {
  coordinator: CrossTrackProgressCoordinator;
  basic: BasicVocabularyProgressCoordinator;
} {
  const basic = createFakeBasicVocabularyCoordinator(options.storage);
  const deps: CrossTrackProgressDependencies = {
    storage: options.storage,
    basicVocabulary: basic,
    basicVocabularyCorpusIds: new Set(options.corpusIds ?? DEFAULT_CORPUS),
    hskLevels: [...(options.hskLevels ?? DEFAULT_HSK_LEVELS)],
    taiwanCompletableLessonIds: [...(options.taiwanLessons ?? DEFAULT_TAIWAN_LESSONS)],
  };
  const coordinator = createCrossTrackProgressCoordinator(deps);
  return { coordinator, basic };
}

const cleanups = new Set<() => void>();

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
});

// ─── 先生厳選単語 adapter ───────────────────────────────────────────────────────

describe('buildBasicVocabularyTrackSummary', () => {
  const guest: BasicVocabularyTrackScope = { kind: 'guest' };

  it('counts learned and learning only among corpus ids', () => {
    const summary = buildBasicVocabularyTrackSummary({
      progress: {
        'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 2 },
        'teacher-star-1-other': { status: 'learning', knownStreak: 1 },
      },
      corpusIds: new Set(['teacher-star-1-bdc7865a507e', 'teacher-star-1-empty']),
      scope: guest,
    });
    expect(summary).toEqual({
      trackId: 'basic-vocabulary',
      availability: 'available',
      scope: guest,
      learnedCount: 1,
      learningCount: 0,
      totalCount: 2,
      status: 'in-progress',
    });
  });

  it('never counts a stale/manual id outside the corpus', () => {
    const summary = buildBasicVocabularyTrackSummary({
      progress: {
        'not-in-corpus': { status: 'learned', knownStreak: 3 },
        'hsk-001': { status: 'learned', knownStreak: 2 },
      },
      corpusIds: new Set(['teacher-star-1-bdc7865a507e']),
      scope: guest,
    });
    expect(summary.learnedCount).toBe(0);
    expect(summary.learningCount).toBe(0);
    expect(summary.status).toBe('not-started');
  });

  it('never counts a corrupt learned record with a zero or non-integer streak', () => {
    const summary = buildBasicVocabularyTrackSummary({
      progress: {
        'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 0 },
        'teacher-star-1-other': { status: 'learned', knownStreak: 2.5 },
      },
      corpusIds: new Set(['teacher-star-1-bdc7865a507e', 'teacher-star-1-other']),
      scope: guest,
    });
    expect(summary.learnedCount).toBe(0);
    expect(summary.status).toBe('not-started');
  });

  it('passes the identity scope through unchanged', () => {
    const user: BasicVocabularyTrackScope = {
      kind: 'user',
      userId: 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e',
    };
    const summary = buildBasicVocabularyTrackSummary({
      progress: {},
      corpusIds: new Set(['teacher-star-1-bdc7865a507e']),
      scope: user,
    });
    expect(summary.scope).toEqual(user);
    expect(summary.scope.kind).toBe('user');
  });

  it('reports unavailable with a zero denominator when the corpus is empty', () => {
    const summary = buildBasicVocabularyTrackSummary({
      progress: {},
      corpusIds: new Set(),
      scope: guest,
    });
    expect(summary.availability).toBe('unavailable');
    expect(summary.totalCount).toBe(0);
    expect(summary.status).toBe('not-started');
  });

  it('is completed only when every corpus id is learned', () => {
    const summary = buildBasicVocabularyTrackSummary({
      progress: {
        a: { status: 'learned', knownStreak: 2 },
        b: { status: 'learned', knownStreak: 3 },
      },
      corpusIds: new Set(['a', 'b']),
      scope: guest,
    });
    expect(summary.status).toBe('completed');
    expect(summary.learnedCount).toBe(2);
  });

  it('is deterministic and returns an immutable summary', () => {
    const input: BasicVocabularyTrackInput = {
      progress: { a: { status: 'learned', knownStreak: 2 } },
      corpusIds: new Set(['a']),
      scope: guest,
    };
    const first = buildBasicVocabularyTrackSummary(input);
    const second = buildBasicVocabularyTrackSummary(input);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});

// ─── HSK adapter ───────────────────────────────────────────────────────────────

describe('buildHskTrackSummary', () => {
  it('counts learned/learning per level from the production corpus only', () => {
    const summary = buildHskTrackSummary({
      progress: {
        'hsk-001': { status: 'learned', knownStreak: 2 },
        'hsk-002': { status: 'learning', knownStreak: 1 },
        'hsk-999': { status: 'learned', knownStreak: 3 },
      },
      levels: [{ level: 1, ids: ['hsk-001', 'hsk-002', 'hsk-003', 'hsk-004', 'hsk-005'] }],
    });
    expect(summary.learnedCount).toBe(1);
    expect(summary.learningCount).toBe(1);
    expect(summary.totalCount).toBe(5);
    expect(summary.levels[0]).toEqual({
      level: 1,
      availability: 'available',
      learnedCount: 1,
      learningCount: 1,
      totalCount: 5,
      status: 'in-progress',
    });
  });

  it('never lets a stale id or a corrupt learned record inflate a level', () => {
    const summary = buildHskTrackSummary({
      progress: {
        'voc-001': { status: 'learned', knownStreak: 2 },
        'hsk-001': { status: 'learned', knownStreak: 0 },
        'hsk-002': { status: 'learned', knownStreak: 2.5 },
      },
      levels: [{ level: 1, ids: ['hsk-001', 'hsk-002', 'hsk-003'] }],
    });
    expect(summary.learnedCount).toBe(0);
    expect(summary.levels[0].status).toBe('not-started');
  });

  it('surfaces partial availability truthfully across levels', () => {
    const summary = buildHskTrackSummary({
      progress: {},
      levels: [
        { level: 1, ids: ['hsk-001', 'hsk-002'] },
        { level: 2, ids: [] },
        { level: 3, ids: ['hsk-003'] },
      ],
    });
    expect(summary.levels.map((l) => l.availability)).toEqual([
      'available',
      'unavailable',
      'available',
    ]);
    expect(summary.levels[1].totalCount).toBe(0);
    expect(summary.levels[1].status).toBe('not-started');
    // The overall track is available because at least one level has content;
    // per-level availability carries the partial truth.
    expect(summary.availability).toBe('available');
    expect(summary.totalCount).toBe(3);
  });

  it('is completed only when every production id is learned', () => {
    const summary = buildHskTrackSummary({
      progress: {
        'hsk-001': { status: 'learned', knownStreak: 2 },
        'hsk-002': { status: 'learned', knownStreak: 3 },
      },
      levels: [{ level: 1, ids: ['hsk-001', 'hsk-002'] }],
    });
    expect(summary.status).toBe('completed');
  });

  it('is unavailable when no level has production content', () => {
    const summary = buildHskTrackSummary({
      progress: { 'hsk-001': { status: 'learned', knownStreak: 2 } },
      levels: [],
    });
    expect(summary.availability).toBe('unavailable');
    expect(summary.totalCount).toBe(0);
    expect(summary.status).toBe('not-started');
  });

  it('is deterministic and returns an immutable summary', () => {
    const input: HskTrackInput = {
      progress: { 'hsk-001': { status: 'learned', knownStreak: 2 } },
      levels: [{ level: 1, ids: ['hsk-001', 'hsk-002'] }],
    };
    const first = buildHskTrackSummary(input);
    const second = buildHskTrackSummary(input);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.levels[0])).toBe(true);
  });
});

// ─── 台湾旅行 adapter ──────────────────────────────────────────────────────────

describe('buildTaiwanTravelTrackSummary', () => {
  it('counts only completable lessons with real completion evidence', () => {
    const summary = buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(['lesson-001', 'lesson-999']),
      completableLessonIds: ['lesson-001', 'lesson-002', 'lesson-003'],
    });
    // lesson-999 is stale (not completable) and never counts.
    expect(summary).toEqual({
      trackId: 'taiwan-travel',
      availability: 'available',
      completedLessons: 1,
      totalLessons: 3,
      status: 'in-progress',
    });
  });

  it('never counts passive viewing as completion', () => {
    // Only completed lesson practice ids count; a viewed/opened or merely
    // non-completed lesson stays incomplete.
    const summary = buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(['lesson-001']),
      completableLessonIds: ['lesson-001', 'lesson-002'],
    });
    expect(summary.completedLessons).toBe(1);
    expect(summary.status).toBe('in-progress');
  });

  it('is completed only when every completable lesson is done', () => {
    const summary = buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(['lesson-001', 'lesson-002']),
      completableLessonIds: ['lesson-001', 'lesson-002'],
    });
    expect(summary.status).toBe('completed');
    expect(summary.completedLessons).toBe(2);
  });

  it('is unavailable when there are no completable lessons', () => {
    const summary = buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(['lesson-001']),
      completableLessonIds: [],
    });
    expect(summary.availability).toBe('unavailable');
    expect(summary.totalLessons).toBe(0);
    expect(summary.status).toBe('not-started');
  });

  it('is deterministic and returns an immutable summary', () => {
    const input = {
      completedLessonIds: new Set(['lesson-001']),
      completableLessonIds: ['lesson-001', 'lesson-002'],
    };
    expect(buildTaiwanTravelTrackSummary(input)).toEqual(
      buildTaiwanTravelTrackSummary(input),
    );
    expect(Object.isFrozen(buildTaiwanTravelTrackSummary(input))).toBe(true);
  });
});

// ─── Snapshot builder ──────────────────────────────────────────────────────────

describe('buildCrossTrackProgressSnapshot', () => {
  it('builds one deeply frozen, deterministic snapshot with all three tracks', () => {
    const guest: BasicVocabularyTrackScope = { kind: 'guest' };
    const input = {
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {},
        corpusIds: new Set(['teacher-star-1-bdc7865a507e']),
        scope: guest,
      }),
      hsk: buildHskTrackSummary({
        progress: {},
        levels: DEFAULT_HSK_LEVELS,
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(['lesson-001']),
        completableLessonIds: DEFAULT_TAIWAN_LESSONS,
      }),
    };
    const snapshot = buildCrossTrackProgressSnapshot(input);
    expect(snapshot).toEqual(buildCrossTrackProgressSnapshot(input));
    expect(snapshot.schemaVersion).toBe(1);
    expect(Object.keys(snapshot.tracks).sort()).toEqual([
      'basic-vocabulary',
      'hsk',
      'taiwan-travel',
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tracks)).toBe(true);
    expect(Object.isFrozen(snapshot.tracks['basic-vocabulary'])).toBe(true);
    // Nested containers must also be frozen, not just the wrappers.
    expect(Object.isFrozen(snapshot.tracks['basic-vocabulary'].scope)).toBe(true);
    expect(Object.isFrozen(snapshot.tracks.hsk.levels)).toBe(true);
    expect(Object.isFrozen(snapshot.tracks.hsk.levels[0])).toBe(true);
    // No mutation surface: consumers can only read.
    const record = snapshot as unknown as Record<string, unknown>;
    expect('applyRating' in record).toBe(false);
    expect('resetAll' in record).toBe(false);
  });
});

// ─── Lifecycle coordinator ─────────────────────────────────────────────────────

describe('cross-track progress coordinator', () => {
  it('produces a deterministic, immutable snapshot that reads every track', () => {
    const storage = createRecordingStorage();
    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001', 'lesson-002']);
    storage._data[VOCABULARY_PROGRESS_KEY] = hskProgress({
      'hsk-001': { status: 'learned', knownStreak: 2 },
    });
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = guestProgress({
      'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 2 },
    });
    const { coordinator } = makeCoordinator({ storage });

    const snapshot = coordinator.getSnapshot();
    expect(snapshot.tracks['taiwan-travel']).toMatchObject({
      trackId: 'taiwan-travel',
      completedLessons: 2,
      totalLessons: 10,
      status: 'in-progress',
    });
    expect(snapshot.tracks.hsk).toMatchObject({
      trackId: 'hsk',
      learnedCount: 1,
      totalCount: 5,
      status: 'in-progress',
    });
    expect(snapshot.tracks['basic-vocabulary']).toMatchObject({
      trackId: 'basic-vocabulary',
      scope: { kind: 'guest' },
      learnedCount: 1,
      totalCount: 1,
      status: 'completed',
    });
    expect(Object.isFrozen(snapshot)).toBe(true);

    // No change → the same immutable object is returned (deterministic).
    const before = coordinator.getSnapshot();
    window.dispatchEvent(new Event('pageshow'));
    expect(coordinator.getSnapshot()).toBe(before);
  });

  it('preserves guest/signed-in identity isolation for basic vocabulary', () => {
    const userA = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const userB = 'aa0e8c7d-3b5f-4e8a-9a2c-7d6f5e4b3a2c';
    const storage = createRecordingStorage();
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = guestProgress({
      'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 2 },
    });
    const { coordinator, basic } = makeCoordinator({ storage });

    // Guest scope reads the guest store.
    expect(coordinator.getSnapshot().tracks['basic-vocabulary'].scope).toEqual({
      kind: 'guest',
    });
    expect(coordinator.getSnapshot().tracks['basic-vocabulary'].learnedCount).toBe(1);

    // Signed-in as A: A's scoped store is read; guest progress never leaks.
    storage._data[getBasicVocabularyProgressStorageKey({ kind: 'user', userId: userA })] =
      guestProgress({});
    basic.acceptSignedIn(userA);
    expect(coordinator.getSnapshot().tracks['basic-vocabulary']).toMatchObject({
      scope: { kind: 'user', userId: userA },
      learnedCount: 0,
    });

    // A learns one word; B has their own empty store — isolation is per-user.
    const storeA = new BasicVocabularyProgressStore(
      storage,
      getBasicVocabularyProgressStorageKey({ kind: 'user', userId: userA }),
    );
    storeA.applyRating('teacher-star-1-bdc7865a507e', 'known');
    storeA.applyRating('teacher-star-1-bdc7865a507e', 'known');
    basic.acceptSignedIn(userB);
    expect(coordinator.getSnapshot().tracks['basic-vocabulary']).toMatchObject({
      scope: { kind: 'user', userId: userB },
      learnedCount: 0,
    });
    basic.acceptSignedIn(userA);
    expect(coordinator.getSnapshot().tracks['basic-vocabulary'].learnedCount).toBe(1);

    // Logout returns to the guest scope and its own progress.
    basic.acceptSignedOut();
    expect(coordinator.getSnapshot().tracks['basic-vocabulary']).toMatchObject({
      scope: { kind: 'guest' },
      learnedCount: 1,
    });
  });

  it('refreshes on the exact lesson, HSK, and basic-vocabulary storage keys', () => {
    const storage = createRecordingStorage();
    const { coordinator } = makeCoordinator({ storage });

    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001']);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(coordinator.getSnapshot().tracks['taiwan-travel'].completedLessons).toBe(1);

    storage._data[VOCABULARY_PROGRESS_KEY] = hskProgress({
      'hsk-001': { status: 'learned', knownStreak: 2 },
    });
    window.dispatchEvent(new StorageEvent('storage', { key: VOCABULARY_PROGRESS_KEY }));
    expect(coordinator.getSnapshot().tracks.hsk.learnedCount).toBe(1);

    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = guestProgress({
      'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 2 },
    });
    window.dispatchEvent(
      new StorageEvent('storage', { key: BASIC_VOCABULARY_PROGRESS_KEY }),
    );
    expect(coordinator.getSnapshot().tracks['basic-vocabulary'].learnedCount).toBe(1);

    // A storage-wide clear is relevant to every track.
    storage._data[STORAGE_KEY] = JSON.stringify([]);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(coordinator.getSnapshot().tracks['taiwan-travel'].completedLessons).toBe(0);
  });

  it('ignores unrelated storage keys', () => {
    const storage = createRecordingStorage();
    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001']);
    const { coordinator } = makeCoordinator({ storage });
    const before = coordinator.getSnapshot();
    window.dispatchEvent(new StorageEvent('storage', { key: 'chabiko:unrelated' }));
    expect(coordinator.getSnapshot()).toBe(before);
  });

  it('refreshes on the user-scoped basic-vocabulary storage key', () => {
    const userA = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const storage = createRecordingStorage();
    const { coordinator, basic } = makeCoordinator({ storage });
    basic.acceptSignedIn(userA);

    const userKey = getBasicVocabularyProgressStorageKey({ kind: 'user', userId: userA });
    storage._data[userKey] = guestProgress({
      'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 2 },
    });
    window.dispatchEvent(new StorageEvent('storage', { key: userKey }));
    expect(coordinator.getSnapshot().tracks['basic-vocabulary'].learnedCount).toBe(1);
  });

  it('is safe and truthful when storage is malformed or unavailable', () => {
    const storage = createRecordingStorage();
    storage._data[STORAGE_KEY] = '{ not json';
    storage._data[VOCABULARY_PROGRESS_KEY] = 'garbage';
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = '[[[';

    const { coordinator } = makeCoordinator({ storage });
    const snapshot = coordinator.getSnapshot();
    // Zero-as-unstarted fallback: totals stay, completed/learned are zero, and
    // nothing throws.
    expect(snapshot.tracks['taiwan-travel'].completedLessons).toBe(0);
    expect(snapshot.tracks['taiwan-travel'].totalLessons).toBe(10);
    expect(snapshot.tracks['taiwan-travel'].status).toBe('not-started');
    expect(snapshot.tracks.hsk.learnedCount).toBe(0);
    expect(snapshot.tracks.hsk.totalCount).toBe(5);
    expect(snapshot.tracks['basic-vocabulary'].learnedCount).toBe(0);

    // Null storage (SSR / privacy) also builds without throwing.
    const { coordinator: nullCoordinator } = makeCoordinator({ storage: null });
    expect(nullCoordinator.getSnapshot().tracks['taiwan-travel'].totalLessons).toBe(10);
    expect(nullCoordinator.getSnapshot().tracks.hsk.totalCount).toBe(5);
  });

  it('introduces zero writes and zero mutation calls from snapshot reads', () => {
    const storage = createRecordingStorage();
    const { coordinator, basic } = makeCoordinator({ storage });

    // Seed all three stores like another tab would (direct writes, not through
    // the coordinator).
    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001']);
    storage._data[VOCABULARY_PROGRESS_KEY] = hskProgress({
      'hsk-001': { status: 'learned', knownStreak: 2 },
    });
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = guestProgress({
      'teacher-star-1-bdc7865a507e': { status: 'learned', knownStreak: 2 },
    });

    // Drive reads and refresh events.
    coordinator.getSnapshot();
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: VOCABULARY_PROGRESS_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: BASIC_VOCABULARY_PROGRESS_KEY }));

    expect(storage._writes).toEqual([]);
    expect(basic.applyRating).not.toHaveBeenCalled();
    expect(basic.resetAll).not.toHaveBeenCalled();
    expect(basic.acceptSignedIn).not.toHaveBeenCalled();
    expect(basic.acceptSignedOut).not.toHaveBeenCalled();
  });

  it('cleanup removes listeners and subscriptions; events after dispose are no-ops', () => {
    const storage = createRecordingStorage();
    const { coordinator } = makeCoordinator({ storage });
    let transitions = 0;
    coordinator.subscribe(() => {
      transitions += 1;
    });
    transitions = 0; // ignore the immediate delivery

    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001']);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(transitions).toBe(1);

    coordinator.dispose();
    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001', 'lesson-002']);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    window.dispatchEvent(new Event('pageshow'));
    expect(transitions).toBe(1); // no stale updates after dispose
  });

  it('repeated initialize/cleanup creates no duplicate listeners or stale updates', () => {
    const storage = createRecordingStorage();
    const first = makeCoordinator({ storage });
    let firstTransitions = 0;
    first.coordinator.subscribe(() => {
      firstTransitions += 1;
    });
    firstTransitions = 0;

    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001']);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(firstTransitions).toBe(1);
    first.coordinator.dispose();

    // A fresh coordinator reflects current storage and reacts once per event.
    const second = makeCoordinator({ storage });
    let secondTransitions = 0;
    second.coordinator.subscribe(() => {
      secondTransitions += 1;
    });
    secondTransitions = 0;
    expect(second.coordinator.getSnapshot().tracks['taiwan-travel'].completedLessons).toBe(1);

    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001', 'lesson-002']);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(secondTransitions).toBe(1);
    expect(second.coordinator.getSnapshot().tracks['taiwan-travel'].completedLessons).toBe(2);
    // The disposed first coordinator never updates.
    expect(firstTransitions).toBe(1);
  });

  it('exposes no mutation API on the coordinator', () => {
    const storage = createRecordingStorage();
    const { coordinator } = makeCoordinator({ storage });
    const asRecord = coordinator as unknown as Record<string, unknown>;
    expect(asRecord.applyRating).toBeUndefined();
    expect(asRecord.resetAll).toBeUndefined();
    expect(asRecord.acceptSignedIn).toBeUndefined();
    expect(asRecord.acceptSignedOut).toBeUndefined();
    expect(asRecord.syncNow).toBeUndefined();
  });
});

// ─── Production store reads are unchanged (negative-drift guard) ───────────────

describe('existing stores remain authoritative', () => {
  it('reads the same physical keys the existing stores read and write', () => {
    const storage = createRecordingStorage();
    // The three stores' canonical keys are untouched by the new boundary.
    expect(STORAGE_KEY).toBe('chabiko_completed_lessons');
    expect(VOCABULARY_PROGRESS_KEY).toBe('chabiko:hsk-vocabulary-progress:v1');
    expect(BASIC_VOCABULARY_PROGRESS_KEY).toBe('chabiko:basic-vocabulary-progress:v1');

    const lessonStore = new ProgressStore(storage);
    lessonStore.markComplete('lesson-001');
    const hskStore = new VocabularyProgressStore(storage);
    hskStore.applyRating('hsk-001', 'known');
    expect(storage._writes.map((w) => w.key)).toEqual([
      STORAGE_KEY,
      VOCABULARY_PROGRESS_KEY,
    ]);

    // A fresh cross-track coordinator over the same storage sees those writes.
    const { coordinator } = makeCoordinator({ storage });
    expect(coordinator.getSnapshot().tracks['taiwan-travel'].completedLessons).toBe(1);
    expect(coordinator.getSnapshot().tracks.hsk.learningCount).toBe(1);
  });
});
