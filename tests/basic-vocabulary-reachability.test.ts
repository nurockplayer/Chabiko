// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  BasicVocabularyProgressStore,
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import { selectSessionItems } from '../src/domain/vocabularyProgress';
import type { StorageLike } from '../src/lib/progress';

// ─── Fake storage ───────────────────────────────────────────────────────────────

function fakeStorage(initial?: Record<string, string>): StorageLike {
  const data: Record<string, string> = { ...initial };
  return {
    getItem(key: string): string | null {
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      data[key] = value;
    },
    removeItem(key: string): void {
      delete data[key];
    },
  };
}

function idsOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `id-${i + 1}`);
}

function entry(status: 'new' | 'learning' | 'learned', knownStreak: number) {
  return { status, knownStreak };
}

function progressDoc(
  items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }>,
): string {
  return JSON.stringify({ version: 1, items });
}

/** Feed a 25-item corpus through completed sessions of size 10: each session
 * rates every selected item 'known' and then "restarts" with the updated
 * progress. Returns the set of item IDs ever shown across sessions. */
function completedSessions(
  corpusSize: number,
  sessionSize: number,
  sessionCount: number,
): { seen: Set<string>; store: BasicVocabularyProgressStore; firstSession: string[] } {
  const store = new BasicVocabularyProgressStore(fakeStorage());
  const ids = idsOf(corpusSize);
  const seen = new Set<string>();
  let firstSession: string[] = [];

  for (let s = 0; s < sessionCount; s++) {
    const sessionIds = store.selectSession(ids, sessionSize);
    if (s === 0) firstSession = sessionIds;
    for (const id of sessionIds) {
      seen.add(id);
      store.applyRating(id, 'known');
    }
  }
  return { seen, store, firstSession };
}

describe('canonical bounded session selection — reachability and fairness', () => {
  it('selects exactly sessionSize items when the corpus is larger than the session', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    const selected = store.selectSession(idsOf(25), 10);
    expect(selected).toHaveLength(10);
    expect(new Set(selected).size).toBe(10);
  });

  it('is deterministic for identical corpus and progress state', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'id-3': entry('learning', 0),
        'id-7': entry('learned', 2),
      }),
    );
    const store1 = new BasicVocabularyProgressStore(storage);
    const store2 = new BasicVocabularyProgressStore(storage);
    const ids = idsOf(25);
    expect(store1.selectSession(ids, 10)).toEqual(store2.selectSession(ids, 10));
    expect(store1.selectSession(ids, 10)).toEqual(store1.selectSession(ids, 10));
  });

  it('25-item corpus, session size 10: completed sessions eventually reach items 11-20 and 21-25', () => {
    const { seen, firstSession } = completedSessions(25, 10, 6);
    const idSet = new Set(idsOf(25));

    // First session is the first 10 unseen items in source order.
    expect(firstSession).toEqual(idsOf(10));

    // Items 11-20 and 21-25 are all reachable through completed sessions.
    for (const id of ['id-11', 'id-15', 'id-20']) expect(seen.has(id)).toBe(true);
    for (const id of ['id-21', 'id-23', 'id-25']) expect(seen.has(id)).toBe(true);
    expect(seen.size).toBeGreaterThan(10);
    expect([...seen].every((id) => idSet.has(id))).toBe(true);
  });

  it('never introduces duplicates within a single window and never introduces unknown IDs', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    const ids = idsOf(25);
    for (let s = 0; s < 4; s++) {
      const session = store.selectSession(ids, 10);
      expect(new Set(session).size).toBe(10);
      for (const id of session) {
        expect(ids).toContain(id);
        store.applyRating(id, 'known');
      }
    }
    // Across 6 completed sessions every corpus item is reachable.
    const { seen } = completedSessions(25, 10, 6);
    expect(seen.size).toBe(25);
  });

  it('keeps an item in learning from starving unseen items: one difficult item only ever fills one slot', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'id-1': entry('learning', 0),
        'id-2': entry('learning', 0),
        'id-3': entry('learning', 0),
        'id-4': entry('learning', 0),
        'id-5': entry('learning', 0),
        'id-6': entry('learning', 0),
        'id-7': entry('learning', 0),
        'id-8': entry('learning', 0),
        'id-9': entry('learning', 0),
        'id-10': entry('learning', 0),
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    const ids = idsOf(25);

    // 10 learning items (all difficult), session size 10 → 5 review slots,
    // remaining 5 slots go to unseen items 11-15.
    const first = store.selectSession(ids, 10);
    expect(first.filter((id) => ids.indexOf(id) < 10)).toHaveLength(5);
    expect(first.filter((id) => ids.indexOf(id) >= 10)).toEqual(['id-11', 'id-12', 'id-13', 'id-14', 'id-15']);

    // Completing all sessions still reaches items beyond the original head.
    const { seen } = completedSessions(25, 10, 6);
    expect(seen.has('id-21')).toBe(true);
    expect(seen.has('id-25')).toBe(true);
  });

  it('never hard-codes a corpus count: session size and corpus size are independent', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    const ids = idsOf(3);
    const selected = store.selectSession(ids, 20);
    expect(selected).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('keeps the selection source-ordered within each status group', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'id-2': entry('learning', 0),
        'id-4': entry('learning', 0),
        'id-8': entry('learned', 2),
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    // Learning review slots first (id-2, id-4), then unseen (id-1, id-3, id-5, ...),
    // then learned fills remaining slots.
    const selected = store.selectSession(idsOf(10), 5);
    expect(selected[0]).toBe('id-2');
    expect(selected[1]).toBe('id-4');
    expect(selected.slice(2)).toEqual(['id-1', 'id-3', 'id-5']);
  });

  it('learned items only fill slots when unseen and learning do not fill the window', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'id-1': entry('learned', 2),
        'id-2': entry('learned', 2),
        'id-3': entry('learning', 0),
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    const ids = ['id-1', 'id-2', 'id-3'];
    const selected = store.selectSession(ids, 10);
    expect(selected).toEqual(['id-3', 'id-1', 'id-2']);
  });

  it('selectSessionItems is a pure function usable without a store', () => {
    const entries: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {
      'a': entry('learning', 0),
    };
    const selected = selectSessionItems(['a', 'b', 'c', 'd', 'e'], entries, 4);
    expect(selected).toHaveLength(4);
    expect(selected[0]).toBe('a');
    expect(selected).toContain('b');
  });
});

describe('canonical bounded session selection — capacity and rotation regressions', () => {
  function storageWith(items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }>): StorageLike {
    const s = fakeStorage();
    s.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc(items));
    return s;
  }

  it('returns exactly sessionSize unique IDs when learning items would otherwise underfill the window', () => {
    // 10 learning + 2 unseen, session size 10 → a full window of 10 unique IDs.
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 10; i++) items[`l${i}`] = entry('learning', 0);
    items['u1'] = entry('new', 0);
    items['u2'] = entry('new', 0);
    const store = new BasicVocabularyProgressStore(storageWith(items));
    const ids = [...Array.from({ length: 10 }, (_, i) => `l${i + 1}`), 'u1', 'u2'];

    const selected = store.selectSession(ids, 10);
    expect(selected).toHaveLength(10);
    expect(new Set(selected).size).toBe(10);
  });

  it('guarantees the unseen quota is never eroded by learning items', () => {
    // 15 learning + 2 unseen, session size 10 → both unseen items must be kept
    // even though learning far exceeds the review budget.
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 15; i++) items[`l${i}`] = entry('learning', 0);
    items['u1'] = entry('new', 0);
    items['u2'] = entry('new', 0);
    const store = new BasicVocabularyProgressStore(storageWith(items));
    const ids = [...Array.from({ length: 15 }, (_, i) => `l${i + 1}`), 'u1', 'u2'];

    const selected = store.selectSession(ids, 10);
    expect(selected).toHaveLength(10);
    expect(selected).toContain('u1');
    expect(selected).toContain('u2');
    expect(new Set(selected).size).toBe(10);
  });

  it('rotates learning review across sessions instead of fixing a source-order prefix', () => {
    // 12 learning items, session size 10. Session 1 rates the first 10 'again'
    // (they stay learning); rating moves them to the end of the items object,
    // so the next selection surfaces the two never-reviewed tail items (l11,
    // l12) rather than re-selecting the same source prefix.
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 12; i++) items[`l${i}`] = entry('learning', 0);
    const store = new BasicVocabularyProgressStore(storageWith(items));
    const ids = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);

    const first = store.selectSession(ids, 10);
    expect(first).toEqual(Array.from({ length: 10 }, (_, i) => `l${i + 1}`));

    for (const id of first) store.applyRating(id, 'again'); // stay learning, move to end

    const second = store.selectSession(ids, 10);
    expect(second).toContain('l11');
    expect(second).toContain('l12');
    expect(new Set(second).size).toBe(10);
  });

  it('is deterministic for the same persisted progress across reloads', () => {
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 8; i++) items[`l${i}`] = entry('learning', 0);
    for (let i = 1; i <= 4; i++) items[`u${i}`] = entry('new', 0);
    const doc = progressDoc(items);

    const s1 = fakeStorage();
    s1.setItem(BASIC_VOCABULARY_PROGRESS_KEY, doc);
    const store1 = new BasicVocabularyProgressStore(s1);

    const s2 = fakeStorage();
    s2.setItem(BASIC_VOCABULARY_PROGRESS_KEY, doc);
    const store2 = new BasicVocabularyProgressStore(s2);

    const ids = [...Array.from({ length: 8 }, (_, i) => `l${i + 1}`), 'u1', 'u2', 'u3', 'u4'];
    expect(store1.selectSession(ids, 10)).toEqual(store2.selectSession(ids, 10));
  });

  it('keeps a persisted rotation sequence across rating and selection', () => {
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 12; i++) items[`l${i}`] = entry('learning', 0);
    const store = new BasicVocabularyProgressStore(storageWith(items));
    const ids = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);

    store.applyRating('l5', 'again');
    // l5 was just reviewed → the never-reviewed items are more urgent and must
    // be picked before l5. With 12 learning items and a 10-slot window, l5 is
    // pushed out of the window entirely (rotation, not permanent blocking:
    // it will be picked again once the older items are themselves reviewed).
    const second = store.selectSession(ids, 10);
    expect(second).not.toContain('l5');
    expect(new Set(second).size).toBe(10);
    // The window is filled by the ten oldest items in source order.
    expect(second).toEqual(['l1', 'l2', 'l3', 'l4', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11']);
  });

  it('persist-failed merge preserves pending LRU order instead of rewinding it', () => {
    // 12 learning items, session size 10. Rating l1 moves it to the end, but
    // the write fails; the next rating (l2) restores writes. The merge must
    // keep the local pending order (l1 reviewed most recently) rather than
    // rewinding l1 to the front from the stale storage order.
    const base = storageWith(
      Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`l${i + 1}`, entry('learning', 0)]),
      ),
    );
    const data = new Map<string, string>();
    const snapshot = base.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;
    data.set(BASIC_VOCABULARY_PROGRESS_KEY, snapshot);
    let failWrites = true;
    const storage: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (failWrites) throw new Error('quota');
        data.set(k, v);
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
    const store = new BasicVocabularyProgressStore(storage);
    const ids = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);

    // l1 rating fails to persist; l1 stays pending in memory at the end.
    store.applyRating('l1', 'again');
    expect(store.getAllItems()['l1']).toEqual(entry('learning', 0));

    // l2 rating now succeeds: syncFromStorage merges storage with pending.
    failWrites = false;
    store.applyRating('l2', 'again');

    // Reload the persisted document and verify LRU order: l1, l2 were both
    // reviewed most recently and must sit at the end.
    const reloaded = JSON.parse(data.get(BASIC_VOCABULARY_PROGRESS_KEY)!);
    expect(Object.keys(reloaded.items)).toEqual([
      'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11', 'l12', 'l1', 'l2',
    ]);

    // The next session must not re-review l1 or l2 (both recently reviewed).
    const fresh = new BasicVocabularyProgressStore(storage);
    const next = fresh.selectSession(ids, 10);
    expect(next).not.toContain('l1');
    expect(next).not.toContain('l2');
    expect(new Set(next).size).toBe(10);
  });
});

describe('canonical bounded session selection — v1 compatibility', () => {
  it('loads an original-20 v1 progress document with all ratings preserved', () => {
    const originalIds = idsOf(20);
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 0; i < originalIds.length; i++) {
      const id = originalIds[i];
      if (i % 3 === 0) items[id] = entry('learned', 2 + (i % 4));
      else if (i % 3 === 1) items[id] = entry('learning', 1);
      else items[id] = entry('new', 0);
    }
    const storage = fakeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc(items));

    const store = new BasicVocabularyProgressStore(storage);
    for (const id of originalIds) {
      expect(store.getStatus(id)).toBe(items[id].status);
      expect(store.getKnownStreak(id)).toBe(items[id].knownStreak);
    }
    expect(store.getAllItems()).toEqual(items);
  });

  it('never rewrites or deletes stored progress when the corpus grows', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'id-1': entry('learned', 3),
        'id-2': entry('learning', 1),
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    // Select a session over a larger corpus — must not modify storage.
    const largeIds = idsOf(50);
    const before = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    store.selectSession(largeIds, 10);
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(before);
    expect(store.getStatus('id-1')).toBe('learned');
  });

  it('preserves stored unknown IDs through selection and later ratings', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'orphan-x': entry('learned', 2),
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    store.selectSession(idsOf(10), 5);
    expect(store.getAllItems()).toHaveProperty('orphan-x');
    store.applyRating('id-1', 'known');
    expect(store.getAllItems()).toHaveProperty('orphan-x');
  });

  it('loads a legacy v1 document losslessly (entries keep exactly two fields)', () => {
    // A legacy 20-item v1 document has exactly {status, knownStreak} per entry.
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 20; i++) {
      items[`id-${i}`] = i % 2 === 0 ? entry('learning', 0) : entry('new', 0);
    }
    const storage = fakeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc(items));
    const store = new BasicVocabularyProgressStore(storage);

    expect(store.getAllItems()).toEqual(items);

    const selected = store.selectSession(idsOf(20), 10);
    expect(new Set(selected).size).toBe(10);
    expect(selected.filter((id) => items[id]?.status === 'learning')).toHaveLength(5);
  });

  it('cross-version: a new writer emits a document a legacy reader parses losslessly', () => {
    // A legacy reader rejects any item with a third field (old strict parser).
    // The new writer must therefore never add a field to the item shape; the
    // LRU rotation state lives in the items key order, which legacy parsers
    // preserve verbatim.
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {
      'id-1': entry('learning', 0),
      'id-2': entry('learning', 0),
      'id-3': entry('new', 0),
    };
    const storage = fakeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc(items));
    const store = new BasicVocabularyProgressStore(storage);

    store.applyRating('id-1', 'again');
    const serialized = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;

    // Every item retains exactly the two v1 fields — a legacy reader cannot
    // reject the document or overwrite it as malformed.
    const doc = JSON.parse(serialized);
    for (const entry of Object.values(doc.items)) {
      expect(Object.keys(entry as object).sort()).toEqual(['knownStreak', 'status']);
    }
    // The document root is unchanged too (version + items only).
    expect(Object.keys(doc).sort()).toEqual(['items', 'version']);
  });

  it('cross-version: rotation state persists in item key order across reloads', () => {
    // The LRU rotation lives in the items insertion order: reviewing an item
    // moves it to the end, so the front-of-object learning items are the
    // least recently reviewed. Re-loading the same serialized document must
    // reproduce the same ordering.
    const items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }> = {};
    for (let i = 1; i <= 12; i++) items[`l${i}`] = entry('learning', 0);
    const storage = fakeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc(items));
    const store = new BasicVocabularyProgressStore(storage);
    const ids = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);

    // Review l1..l10 → they move to the end of the items object.
    for (const id of Array.from({ length: 10 }, (_, i) => `l${i + 1}`)) {
      store.applyRating(id, 'again');
    }

    // Serialize and reload into a fresh store (simulates a reload / new tab).
    const serialized = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;
    const freshStorage = fakeStorage();
    freshStorage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, serialized);
    const freshStore = new BasicVocabularyProgressStore(freshStorage);

    // The two never-reviewed tail items (l11, l12) are now at the front of the
    // learning order and are picked first.
    const next = freshStore.selectSession(ids, 10);
    expect(next).toContain('l11');
    expect(next).toContain('l12');
    expect(new Set(next).size).toBe(10);
  });

  it('clean storage regression: empty store selects a full unseen window', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    const selected = store.selectSession(idsOf(25), 10);
    expect(selected).toEqual(idsOf(10));
  });

  it('dirty storage regression: ratings advance the unseen front across sessions', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      progressDoc({
        'id-1': entry('learning', 0),
        'id-2': entry('learned', 2),
        'id-3': entry('new', 0),
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    const ids = idsOf(25);
    // Session 1: learning review slot (id-1) + unseen from front (id-3, id-4, ...).
    const first = store.selectSession(ids, 10);
    expect(first[0]).toBe('id-1');
    expect(first.slice(1)).toEqual(['id-3', 'id-4', 'id-5', 'id-6', 'id-7', 'id-8', 'id-9', 'id-10', 'id-11']);
    // Complete id-1 and id-3..id-11. id-1 stays learning (streak 1) and keeps
    // a near-term review slot, but the unseen front still advances: session 2
    // shows id-12, which was never selected before.
    for (const id of first) store.applyRating(id, 'known');
    const second = store.selectSession(ids, 10);
    expect(second).toContain('id-12');
  });
});

describe('canonical bounded session selection — production-shaped corpus', () => {
  // 19 image-bearing teacher-star IDs in a shuffled-but-deterministic order
  // plus derived learner IDs beyond the original 20.
  const PRODUCTION_IDS = [
    'teacher-star-1-37e0eb213f0f', 'teacher-star-1-a66948a76fda',
    'teacher-star-1-86f5cdb6e25c', 'teacher-star-1-bdc7865a507e',
    'teacher-star-1-86367b2d53f6', 'teacher-star-1-8b957a100bd4',
    'teacher-star-1-2cfcacc0503e', 'teacher-star-1-e7bc12c4f23a',
    'teacher-star-1-e64490a207eb', 'teacher-star-1-bada4e11125d',
    'teacher-star-1-d903f490725f', 'teacher-star-1-7420330fee5c',
    'teacher-star-1-ed096023b3be', 'teacher-star-1-cb42fb8775e5',
    'teacher-star-1-c39a19585434', 'teacher-star-1-3e6fabf09358',
    'teacher-star-1-1c0cdf0b2b9c', 'teacher-star-1-8fea4ac29b4c',
    'teacher-star-1-94757170c2b0', 'teacher-star-1-0cc5799cdbbc',
  ];
  const DERIVED = Array.from({ length: 30 }, (_, i) => `teacher-learner-${String(i + 1).padStart(3, '0')}`);

  it('a production-shaped corpus reaches an item beyond the original first 20', () => {
    const corpus = [...PRODUCTION_IDS, ...DERIVED];
    const store = new BasicVocabularyProgressStore(fakeStorage());
    const seen = new Set<string>();

    for (let s = 0; s < 4; s++) {
      const session = store.selectSession(corpus, 10);
      for (const id of session) {
        seen.add(id);
        store.applyRating(id, 'known');
      }
    }

    // The derived IDs sit after the original 20 in corpus order; a session
    // with size 10 must eventually reach them. Forward progress is bounded by
    // the review budget (5 unseen slots per session), so 4 sessions reach
    // 10 + 5*3 = 25 unique items including derived learner IDs.
    expect([...seen].some((id) => id.startsWith('teacher-learner-'))).toBe(true);
    expect(seen.size).toBe(25);
    expect(seen.size).toBeLessThanOrEqual(50);
  });
});
