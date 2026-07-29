// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  BasicVocabularyProgressStore,
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
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

describe('BasicVocabularyProgressStore', () => {
  // ── Valid empty / all statuses / consistency boundaries ────────────────────

  it('returns new/0 for unknown IDs in an empty store', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    expect(store.getStatus('x')).toBe('new');
    expect(store.getKnownStreak('x')).toBe(0);
    expect(store.getAllItems()).toEqual({});
  });

  it('loads a document with items in all statuses', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        items: {
          a: { status: 'new', knownStreak: 0 },
          b: { status: 'learning', knownStreak: 1 },
          c: { status: 'learned', knownStreak: 2 },
        },
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('a')).toBe('new');
    expect(store.getStatus('b')).toBe('learning');
    expect(store.getStatus('c')).toBe('learned');
    expect(store.getKnownStreak('c')).toBe(2);
  });

  it('enforces consistency: new requires streak 0', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'new', knownStreak: 1 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('enforces consistency: learned requires streak >= 2', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'learned', knownStreak: 0 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  // ── Malformed / invalid documents fall back empty ──────────────────────────

  it('falls back empty on malformed JSON', () => {
    const storage = fakeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, 'not-json');
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('x')).toBe('new');
  });

  it('falls back empty on wrong version', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 2, items: {} }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('x')).toBe('new');
  });

  it('falls back empty on array root', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify([]),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('x')).toBe('new');
  });

  it('falls back empty on null root', () => {
    const storage = fakeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, 'null');
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('x')).toBe('new');
  });

  it('falls back empty on boolean version', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: true, items: {} }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('x')).toBe('new');
  });

  it('falls back empty on items as array', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: [] }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('x')).toBe('new');
  });

  it('falls back empty on empty string ID', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { '': { status: 'new', knownStreak: 0 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('falls back empty on boolean knownStreak', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'new', knownStreak: true } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('falls back empty on negative knownStreak', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'learning', knownStreak: -1 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('falls back empty on fraction knownStreak', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'learning', knownStreak: 0.5 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('falls back empty on unknown status string', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'unknown', knownStreak: 0 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('falls back empty when item has extra fields', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'new', knownStreak: 0, extra: true } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  it('falls back empty when root has unknown fields', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: {}, extra: true }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getAllItems()).toEqual({});
  });

  // ── Rating transitions ─────────────────────────────────────────────────────

  it('transitions again → learning streak 0', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    store.applyRating('a', 'again');
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getKnownStreak('a')).toBe(0);
  });

  it('transitions unsure → learning streak 0', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    store.applyRating('a', 'unsure');
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getKnownStreak('a')).toBe(0);
  });

  it('transitions first known → learning streak 1', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getKnownStreak('a')).toBe(1);
  });

  it('transitions second-known → learned streak 2', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    store.applyRating('a', 'known');
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(2);
  });

  it('transitions third-known → learned streak 3', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    store.applyRating('a', 'known');
    store.applyRating('a', 'known');
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(3);
  });

  it('resets to streak 0 after again on learned item', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    store.applyRating('a', 'known');
    store.applyRating('a', 'known');
    store.applyRating('a', 'again');
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getKnownStreak('a')).toBe(0);
  });

  // ── Priority ordering ──────────────────────────────────────────────────────

  it('orders: learning → new → learned, stable source order within groups', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        items: {
          a: { status: 'learned', knownStreak: 2 },
          b: { status: 'new', knownStreak: 0 },
          c: { status: 'learning', knownStreak: 1 },
          d: { status: 'new', knownStreak: 0 },
          e: { status: 'learned', knownStreak: 3 },
        },
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    const result = store.prioritize(['a', 'b', 'c', 'd', 'e']);
    // learning (c) → new (b, d in source order) → learned (a, e in source order)
    expect(result).toEqual(['c', 'b', 'd', 'a', 'e']);
  });

  it('preserves input immutability', () => {
    const store = new BasicVocabularyProgressStore(fakeStorage());
    const input = ['a', 'b'];
    const result = store.prioritize(input);
    expect(input).toEqual(['a', 'b']);
    expect(result).toEqual(['a', 'b']);
    expect(result).not.toBe(input);
  });

  it('unknown stored IDs are ignored for priority position but preserved in storage', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        items: {
          z: { status: 'learned', knownStreak: 2 }, // not in input
        },
      }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    const result = store.prioritize(['a', 'b']);
    // z is not in input, so not in result
    expect(result).toEqual(['a', 'b']);
    // z remains in storage
    expect(store.getAllItems()).toHaveProperty('z');
  });

  // ── Storage reliability ────────────────────────────────────────────────────

  it('handles read errors gracefully', () => {
    const badStorage: StorageLike = {
      getItem() { throw new Error('fail'); },
      setItem() {},
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(badStorage);
    expect(store.getStatus('x')).toBe('new');
    store.applyRating('x', 'known');
    expect(store.getStatus('x')).toBe('learning');
  });

  it('handles write errors gracefully', () => {
    const badStorage: StorageLike = {
      getItem() { return null; },
      setItem() { throw new Error('quota'); },
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(badStorage);
    store.applyRating('x', 'known');
    expect(store.getStatus('x')).toBe('learning');
  });

  it('handles probe errors gracefully', () => {
    // Simulate localStorage available but probe fails
    const errStorage: StorageLike = {
      getItem() { throw new Error('fail'); },
      setItem() {},
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(errStorage);
    // In-memory only — no crash
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learning');
  });

  it('removes only the basic vocabulary key on resetAll', () => {
    const storage = fakeStorage();
    storage.setItem(
      'other-key',
      'value',
    );
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'learned', knownStreak: 2 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    store.resetAll();
    expect(store.getStatus('a')).toBe('new');
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();
    expect(storage.getItem('other-key')).toBe('value');
  });

  it('stale-instance merge reads latest storage before write', () => {
    const storage = fakeStorage();
    const store1 = new BasicVocabularyProgressStore(storage);
    const store2 = new BasicVocabularyProgressStore(storage);

    // store1 writes
    store1.applyRating('a', 'known');
    expect(store1.getStatus('a')).toBe('learning');
    expect(store1.getKnownStreak('a')).toBe(1);

    // store2 writes — should see store1's write via syncFromStorage
    store2.applyRating('b', 'known');
    expect(store2.getStatus('a')).toBe('learning');
    expect(store2.getStatus('b')).toBe('learning');
  });

  it('absent key after resetAll resets in-memory document on next write', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    store.applyRating('a', 'known');
    // Manually clear storage to simulate cross-tab resetAll
    storage.removeItem(BASIC_VOCABULARY_PROGRESS_KEY);
    store.applyRating('b', 'known');
    // 'a' should be gone since storage was cleared
    expect(store.getStatus('a')).toBe('new');
    expect(store.getStatus('b')).toBe('learning');
  });

  it('malformed storage keeps current in-memory state', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    store.applyRating('a', 'known');
    // Corrupt storage
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, 'corrupt');
    store.applyRating('b', 'known');
    // 'a' should still be in memory
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getStatus('b')).toBe('learning');
  });

  // ── Deterministic serialization ────────────────────────────────────────────

  it('produces deterministic JSON with insertion-preserving items order', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    store.applyRating('b', 'known');
    store.applyRating('a', 'known');

    const stored = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;
    const parsed = JSON.parse(stored);
    expect(Object.keys(parsed.items)).toEqual(['b', 'a']);
  });

  // ── Write failure regression ──────────────────────────────────────────────

  it('survives write failure: consecutive known reaches learned despite quota error', () => {
    let failWrites = true;
    const quotaStorage: StorageLike = {
      getItem() { return null; },
      setItem() { if (failWrites) throw new Error('quota'); },
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(quotaStorage);

    // First known → learning streak 1
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getKnownStreak('a')).toBe(1);

    // Second known → should still reach learned even though persist failed
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(2);

    // Now "recover" storage — later writes succeed
    failWrites = false;
    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(3);
  });

  it('write failure followed by successful write does not lose accumulated memory', () => {
    const storage = fakeStorage();
    // First write fails
    let failOnce = true;
    const flakyStorage: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (failOnce) { failOnce = false; throw new Error('quota'); }
        storage.setItem(k, v);
      },
      removeItem: (k) => storage.removeItem(k),
    };
    const store = new BasicVocabularyProgressStore(flakyStorage);

    // Two consecutive known with write failure
    store.applyRating('a', 'known');
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(2);

    // Third write succeeds — must not lose memory
    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(3);

    // Storage eventually has the correct value
    const stored = JSON.parse(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!);
    expect(stored.items.a.knownStreak).toBe(3);
  });

  it('refresh preserves memory after failed write when storage key is absent', () => {
    const quotaStorage: StorageLike = {
      getItem() { return null; },
      setItem() { throw new Error('quota'); },
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(quotaStorage);

    // First known → learning streak 1 (write failed)
    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(1);

    // refresh() — should NOT clear memory since persistFailed
    store.refresh();
    expect(store.getKnownStreak('a')).toBe(1);

    // Second known → learned streak 2
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(2);
  });

  // ── Finding 1: pending local state vs. old valid storage ──────────────

  it('write failure with old valid storage: two known still reaches learned', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: {} }),
    );
    const wrap: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem() { throw new Error('quota'); },
      removeItem: (k) => storage.removeItem(k),
    };
    const store = new BasicVocabularyProgressStore(wrap);

    // First known → learning streak 1 (persist fails, storage still empty)
    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(1);

    // Second known → learned streak 2 (syncFromStorage sees empty doc,
    // but pendingChanges prevents storage from overwriting 'a')
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(2);
  });

  it('write failure merges cross-tab IDs while keeping pending local state', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { b: { status: 'learned', knownStreak: 2 } } }),
    );
    const wrap: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem() { throw new Error('quota'); },
      removeItem: (k) => storage.removeItem(k),
    };
    const store = new BasicVocabularyProgressStore(wrap);

    // Local change to 'a' — persist fails
    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(1);

    // add a cross-tab ID 'c' to storage
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: {
        b: { status: 'learned', knownStreak: 2 },
        c: { status: 'learning', knownStreak: 1 },
      }}),
    );

    // Next applyRating syncs from storage and should:
    // - keep 'a' at streak 1 (pending local)
    // - pick up 'c' from storage (cross-tab merge)
    // - keep 'b' from storage
    expect(store.getKnownStreak('b')).toBe(2);
    store.applyRating('a', 'known'); // also persists with new data on next attempt
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getKnownStreak('a')).toBe(2);
    // cross-tab IDs are visible (merged into memory)
    expect(store.getStatus('c')).toBe('learning');
    expect(store.getKnownStreak('c')).toBe(1);
  });

  // ── Finding 2: failed removeItem resurrection ─────────────────────────

  it('failed resetAll is never resurrected by refresh or rating', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: {
        a: { status: 'learned', knownStreak: 2 },
        b: { status: 'learning', knownStreak: 1 },
      }}),
    );
    let failRemove = true;
    const flakyStorage: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => { storage.setItem(k, v); },
      removeItem() { if (failRemove) throw new Error('denied'); },
    };
    const store = new BasicVocabularyProgressStore(flakyStorage);

    // Verify loaded
    expect(store.getStatus('a')).toBe('learned');

    // resetAll fails removeItem
    store.resetAll();
    expect(store.getStatus('a')).toBe('new');
    expect(store.getStatus('b')).toBe('new');

    // refresh() — must NOT resurrect old IDs
    store.refresh();
    expect(store.getStatus('a')).toBe('new');
    expect(store.getStatus('b')).toBe('new');

    // applyRating — must NOT resurrect old IDs
    store.applyRating('c', 'known');
    expect(store.getStatus('a')).toBe('new');
    expect(store.getStatus('c')).toBe('learning');

    // When storage becomes writable again, persist succeeds
    // Next write should only contain reset+new state
    failRemove = false;
    store.applyRating('c', 'known');
    expect(store.getStatus('c')).toBe('learned');

    const stored = JSON.parse(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!);
    expect(stored.items).not.toHaveProperty('a');
    expect(stored.items).not.toHaveProperty('b');
    expect(stored.items.c.knownStreak).toBe(2);
  });

  // ── Finding 1: old non-pending IDs not resurrected in merge ───────────

  it('non-pending local IDs are not resurrected during persistFailed merge', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: {} }),
    );
    const wrap: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem() { throw new Error('quota'); },
      removeItem: (k) => storage.removeItem(k),
    };
    const store = new BasicVocabularyProgressStore(wrap);

    // Apply to 'a' first — this is a pending change
    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(1);

    // Now 'b' exists in local memory only (via the applyRating flow inside store.document)
    // directly set local memory to have both 'a' (pending) and 'b' (non-pending)
    // Storage is REPLACED by another tab — only contains 'c'
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { c: { status: 'learned', knownStreak: 2 } } }),
    );

    // Next rating triggers syncFromStorage. Merge should keep:
    // - 'a' from pendingChanges
    // - 'c' from storage
    // - NOT 'b' since it was never persisted and is not in pendingChanges
    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learned');
    expect(store.getStatus('c')).toBe('learned');
    expect(store.getAllItems()).not.toHaveProperty('b');
  });

  // ── Finding 2: successful reset allows cross-tab reads ────────────────

  it('successful resetAll allows cross-tab progress to be loaded via refresh', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'learned', knownStreak: 2 } } }),
    );
    const store = new BasicVocabularyProgressStore(storage);
    expect(store.getStatus('a')).toBe('learned');

    // Successful reset
    store.resetAll();
    expect(store.getStatus('a')).toBe('new');

    // Another tab writes new progress
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { b: { status: 'learned', knownStreak: 2 } } }),
    );

    // refresh must load the cross-tab progress
    store.refresh();
    expect(store.getStatus('b')).toBe('learned');
    expect(store.getStatus('a')).toBe('new');
  });

  // ── Failed reset combined ────────────────────────────────────────────

  it('failed reset prevents storage resurrection even when valid doc appears later', () => {
    const storage = fakeStorage();
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { a: { status: 'learned', knownStreak: 2 } } }),
    );
    let failRemove = true;
    const flakyStorage: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => { storage.setItem(k, v); },
      removeItem() { if (failRemove) throw new Error('denied'); },
    };
    const store = new BasicVocabularyProgressStore(flakyStorage);
    store.resetAll();

    // Another tab replaces storage with a different valid document
    storage.setItem(
      BASIC_VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, items: { b: { status: 'learning', knownStreak: 1 } } }),
    );

    // Must NOT resurrect 'b'
    store.refresh();
    expect(store.getStatus('a')).toBe('new');
    expect(store.getStatus('b')).toBe('new');

    // After storage recovers, write succeeds
    failRemove = false;
    store.applyRating('c', 'known');
    expect(store.getStatus('c')).toBe('learning');

    // Only reset+new state in storage
    const stored = JSON.parse(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!);
    expect(stored.items).not.toHaveProperty('a');
    expect(stored.items).not.toHaveProperty('b');
    expect(stored.items.c.knownStreak).toBe(1);
  });
});
