import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyDocument,
  applyRatingToProgress,
  prioritizeVocabularyIds,
  VOCABULARY_PROGRESS_KEY,
  VocabularyProgressStore,
} from '../src/domain/vocabularyProgress';
import type { VocabularyProgressEntry } from '../src/domain/vocabularyProgress';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockStorage(backing?: Map<string, string>) {
  const map = backing ?? new Map<string, string>();
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
    _map: map,
  };
}

function entry(entries: Record<string, VocabularyProgressEntry>): string {
  return JSON.stringify({ version: 1, entries });
}

// ─── Empty document ───────────────────────────────────────────────────────────

describe('emptyDocument', () => {
  it('returns version 1 with empty entries', () => {
    expect(emptyDocument()).toEqual({ version: 1, entries: {} });
  });
});

// ─── applyRatingToProgress ────────────────────────────────────────────────────

describe('applyRatingToProgress', () => {
  it('again from new resets streak to 0 and sets learning', () => {
    const result = applyRatingToProgress(undefined, 'again');
    expect(result).toEqual({ status: 'learning', knownStreak: 0 });
  });

  it('unsure from new resets streak to 0 and sets learning', () => {
    const result = applyRatingToProgress(undefined, 'unsure');
    expect(result).toEqual({ status: 'learning', knownStreak: 0 });
  });

  it('again from learning resets streak', () => {
    const current: VocabularyProgressEntry = { status: 'learning', knownStreak: 1 };
    const result = applyRatingToProgress(current, 'again');
    expect(result).toEqual({ status: 'learning', knownStreak: 0 });
  });

  it('again from learned resets to learning with streak 0', () => {
    const current: VocabularyProgressEntry = { status: 'learned', knownStreak: 3 };
    const result = applyRatingToProgress(current, 'again');
    expect(result).toEqual({ status: 'learning', knownStreak: 0 });
  });

  it('known from new increments streak to 1, stays learning', () => {
    const result = applyRatingToProgress(undefined, 'known');
    expect(result).toEqual({ status: 'learning', knownStreak: 1 });
  });

  it('known from streak 1 elevates to learned', () => {
    const current: VocabularyProgressEntry = { status: 'learning', knownStreak: 1 };
    const result = applyRatingToProgress(current, 'known');
    expect(result).toEqual({ status: 'learned', knownStreak: 2 });
  });

  it('known from streak 2 stays learned', () => {
    const current: VocabularyProgressEntry = { status: 'learned', knownStreak: 2 };
    const result = applyRatingToProgress(current, 'known');
    expect(result).toEqual({ status: 'learned', knownStreak: 3 });
  });

  it('unsure from learned resets to learning', () => {
    const current: VocabularyProgressEntry = { status: 'learned', knownStreak: 4 };
    const result = applyRatingToProgress(current, 'unsure');
    expect(result).toEqual({ status: 'learning', knownStreak: 0 });
  });
});

// ─── prioritizeVocabularyIds ──────────────────────────────────────────────────

describe('prioritizeVocabularyIds', () => {
  const entries: Record<string, VocabularyProgressEntry> = {
    a: { status: 'learning', knownStreak: 0 },
    b: { status: 'new', knownStreak: 0 },
    c: { status: 'learned', knownStreak: 3 },
    d: { status: 'learning', knownStreak: 1 },
    e: { status: 'new', knownStreak: 0 },
    f: { status: 'learned', knownStreak: 2 },
  };

  it('orders learning → new → learned with stable source order', () => {
    const result = prioritizeVocabularyIds(['a', 'b', 'c', 'd', 'e', 'f'], entries);
    expect(result).toEqual(['a', 'd', 'b', 'e', 'c', 'f']);
  });

  it('unknown IDs default to new priority', () => {
    const result = prioritizeVocabularyIds(['x', 'a', 'y'], entries);
    // a is learning → first; x, y are new → source order
    expect(result).toEqual(['a', 'x', 'y']);
  });

  it('returns empty array for empty input', () => {
    expect(prioritizeVocabularyIds([], entries)).toEqual([]);
  });

  it('is deterministic', () => {
    const ids = ['f', 'e', 'd', 'c', 'b', 'a'];
    const a = prioritizeVocabularyIds(ids, entries);
    const b = prioritizeVocabularyIds(ids, entries);
    expect(a).toEqual(b);
  });
});

// ─── VocabularyProgressStore — constructor and parsing ───────────────────────

describe('VocabularyProgressStore', () => {
  let store: VocabularyProgressStore;
  let mock: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mock = createMockStorage();
    store = new VocabularyProgressStore(mock);
  });

  it('starts with all IDs as new', () => {
    expect(store.getStatus('any-id')).toBe('new');
    expect(store.getKnownStreak('any-id')).toBe(0);
  });

  it('loads persisted progress from storage', () => {
    mock._map.set(
      VOCABULARY_PROGRESS_KEY,
      entry({ 'id-1': { status: 'learned', knownStreak: 2 } }),
    );
    const newStore = new VocabularyProgressStore(mock);
    expect(newStore.getStatus('id-1')).toBe('learned');
    expect(newStore.getKnownStreak('id-1')).toBe(2);
  });

  it('handles malformed JSON gracefully', () => {
    mock._map.set(VOCABULARY_PROGRESS_KEY, 'not json');
    const newStore = new VocabularyProgressStore(mock);
    expect(newStore.getStatus('id-1')).toBe('new');
  });

  it('handles wrong schema version gracefully', () => {
    mock._map.set(
      VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 2, entries: {} }),
    );
    const newStore = new VocabularyProgressStore(mock);
    expect(newStore.getStatus('id-1')).toBe('new');
  });

  it('handles non-object entries gracefully', () => {
    mock._map.set(
      VOCABULARY_PROGRESS_KEY,
      JSON.stringify({ version: 1, entries: 'not-an-object' }),
    );
    const newStore = new VocabularyProgressStore(mock);
    expect(newStore.getStatus('id-1')).toBe('new');
  });

  it('handles invalid entry values gracefully', () => {
    mock._map.set(
      VOCABULARY_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        entries: { 'id-1': 'bad', 'id-2': { status: 'learned', knownStreak: 2 } },
      }),
    );
    const newStore = new VocabularyProgressStore(mock);
    expect(newStore.getStatus('id-1')).toBe('new');
    expect(newStore.getStatus('id-2')).toBe('learned');
  });

  it('handles storage getItem throwing gracefully', () => {
    const flakyStorage = {
      getItem: (): null => {
        throw new Error('storage unavailable');
      },
      setItem: (): void => {},
      removeItem: (): void => {},
    };
    const flakyStore = new VocabularyProgressStore(flakyStorage);
    expect(flakyStore.getStatus('id-1')).toBe('new');
  });

  it('falls back to in-memory state when storage is null', () => {
    const nullStore = new VocabularyProgressStore(null);
    nullStore.applyRating('id-1', 'known');
    expect(nullStore.getStatus('id-1')).toBe('learning');
    expect(nullStore.getKnownStreak('id-1')).toBe(1);
  });

  // ── applyRating ────────────────────────────────────────────────────────────

  describe('applyRating', () => {
    it('known streak 1 → learning with streak 1', () => {
      store.applyRating('a', 'known');
      expect(store.getStatus('a')).toBe('learning');
      expect(store.getKnownStreak('a')).toBe(1);
    });

    it('known streak 2 → learned', () => {
      store.applyRating('a', 'known');
      store.applyRating('a', 'known');
      expect(store.getStatus('a')).toBe('learned');
      expect(store.getKnownStreak('a')).toBe(2);
    });

    it('again → learning streak 0', () => {
      store.applyRating('a', 'known');
      store.applyRating('a', 'again');
      expect(store.getStatus('a')).toBe('learning');
      expect(store.getKnownStreak('a')).toBe(0);
    });

    it('unsure → learning streak 0', () => {
      store.applyRating('a', 'known');
      store.applyRating('a', 'unsure');
      expect(store.getStatus('a')).toBe('learning');
      expect(store.getKnownStreak('a')).toBe(0);
    });

    it('persists to storage', () => {
      store.applyRating('a', 'known');
      const raw = mock._map.get(VOCABULARY_PROGRESS_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.version).toBe(1);
      expect(parsed.entries.a).toEqual({ status: 'learning', knownStreak: 1 });
    });

    it('handles setItem throwing gracefully (quota error)', () => {
      const flakyStorage = {
        getItem: () => JSON.stringify({ version: 1, entries: {} }),
        setItem: (): void => {
          throw new Error('quota exceeded');
        },
        removeItem: (): void => {},
      };
      const flakyStore = new VocabularyProgressStore(flakyStorage);
      expect(() => flakyStore.applyRating('a', 'known')).not.toThrow();
      expect(flakyStore.getStatus('a')).toBe('learning');
    });
  });

  // ── prioritize ─────────────────────────────────────────────────────────────

  describe('prioritize', () => {
    it('returns learning → new → learned order', () => {
      store.applyRating('c', 'known');
      store.applyRating('c', 'known'); // learned
      store.applyRating('a', 'again'); // learning
      // b is new (not rated)
      const result = store.prioritize(['a', 'b', 'c']);
      expect(result).toEqual(['a', 'b', 'c']); // learning, new, learned
    });

    it('uses stored state after reload', () => {
      store.applyRating('a', 'known');
      store.applyRating('a', 'known'); // learned
      const newStore = new VocabularyProgressStore(mock);
      const result = newStore.prioritize(['b', 'a', 'c']);
      // a = learned, b = new, c = new → b, c, a
      expect(result).toEqual(['b', 'c', 'a']);
    });
  });

  // ── refresh (pageshow) ─────────────────────────────────────────────────────

  describe('refresh', () => {
    it('re-reads progress from storage', () => {
      store.applyRating('x', 'known');
      store.applyRating('x', 'known'); // learned
      // Simulate another tab writing progress
      mock._map.set(
        VOCABULARY_PROGRESS_KEY,
        entry({ x: { status: 'new', knownStreak: 0 } }),
      );
      store.refresh();
      expect(store.getStatus('x')).toBe('new');
    });

    it('is safe when storage unavailable', () => {
      const nullStore = new VocabularyProgressStore(null);
      nullStore.applyRating('a', 'known');
      expect(() => nullStore.refresh()).not.toThrow();
      // In-memory progress is preserved when storage is null (no reload)
      expect(nullStore.getStatus('a')).toBe('learning');
    });
  });

  // ── resetAll ───────────────────────────────────────────────────────────────

  describe('resetAll', () => {
    it('clears all progress in memory and storage', () => {
      store.applyRating('a', 'known');
      store.applyRating('a', 'known');
      expect(store.getStatus('a')).toBe('learned');
      store.resetAll();
      expect(store.getStatus('a')).toBe('new');
      expect(mock._map.has(VOCABULARY_PROGRESS_KEY)).toBe(false);
    });

    it('clears only the HSK vocabulary key', () => {
      mock._map.set('chabiko_completed_lessons', JSON.stringify(['lesson-001']));
      store.applyRating('a', 'known');
      store.resetAll();
      expect(store.getStatus('a')).toBe('new');
      expect(mock._map.get('chabiko_completed_lessons')).toBe(
        JSON.stringify(['lesson-001']),
      );
    });

    it('is safe when storage is null', () => {
      const nullStore = new VocabularyProgressStore(null);
      nullStore.applyRating('a', 'known');
      expect(() => nullStore.resetAll()).not.toThrow();
      expect(nullStore.getStatus('a')).toBe('new');
    });

    it('is safe when storage removeItem throws', () => {
      const flakyStorage = {
        getItem: () => JSON.stringify({ version: 1, entries: {} }),
        setItem: (): void => {},
        removeItem: (): void => {
          throw new Error('storage gone');
        },
      };
      const flakyStore = new VocabularyProgressStore(flakyStorage);
      flakyStore.applyRating('a', 'known');
      expect(() => flakyStore.resetAll()).not.toThrow();
      expect(flakyStore.getStatus('a')).toBe('new');
    });
  });

  // ── getAllEntries ──────────────────────────────────────────────────────────

  describe('getAllEntries', () => {
    it('returns all entries', () => {
      store.applyRating('a', 'known');
      store.applyRating('b', 'again');
      const all = store.getAllEntries();
      expect(all.a).toEqual({ status: 'learning', knownStreak: 1 });
      expect(all.b).toEqual({ status: 'learning', knownStreak: 0 });
    });
  });

  // ── Cross-tab merge ────────────────────────────────────────────────────────

  describe('cross-tab safety', () => {
    it('merges concurrent writes from other tabs', () => {
      store.applyRating('a', 'known');
      // Another tab writes progress for 'b'
      mock._map.set(
        VOCABULARY_PROGRESS_KEY,
        entry({ a: { status: 'learning', knownStreak: 1 }, b: { status: 'learned', knownStreak: 2 } }),
      );
      // Current tab applies rating for 'a' — syncFromStorage should merge in b
      store.applyRating('a', 'known'); // a: learning streak 1 → learned streak 2
      expect(store.getStatus('a')).toBe('learned');
      expect(store.getStatus('b')).toBe('learned');
    });

    it('handles cleared storage on next write', () => {
      store.applyRating('a', 'known');
      mock._map.delete(VOCABULARY_PROGRESS_KEY);
      store.applyRating('a', 'known');
      // syncFromStorage saw null → empty doc, so previous 'a' is gone
      expect(store.getStatus('a')).toBe('learning');
    });

    it('handles malformed storage on next write gracefully', () => {
      store.applyRating('a', 'known');
      mock._map.set(VOCABULARY_PROGRESS_KEY, '{broken');
      expect(() => store.applyRating('b', 'known')).not.toThrow();
      // Malformed storage -> syncFromStorage keeps existing in-memory state
      // So 'a' progress survives in memory
      expect(store.getStatus('a')).toBe('learning');
      // 'b' was just rated known → learning in memory
      expect(store.getStatus('b')).toBe('learning');
      expect(store.getKnownStreak('b')).toBe(1);
    });
  });
});
