// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProgressStore, STORAGE_KEY } from '../src/lib/progress';

const PROBE_KEY = '__chabiko_probe__';

describe('ProgressStore default storage (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the global localStorage when no storage is provided', () => {
    const store = new ProgressStore();
    store.markComplete('lesson-001');

    expect(store.isComplete('lesson-001')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['lesson-001']));

    // A fresh default-storage instance reads back the persisted state.
    const reloaded = new ProgressStore();
    expect(reloaded.isComplete('lesson-001')).toBe(true);
  });

  it('does not clobber a pre-existing probe key value during availability check', () => {
    localStorage.setItem(PROBE_KEY, 'preserve-me');

    // Constructing the store runs the localStorage availability probe.
    const store = new ProgressStore();
    store.markComplete('lesson-xyz');

    expect(localStorage.getItem(PROBE_KEY)).toBe('preserve-me');
  });

  it('leaves no probe key behind when none existed beforehand', () => {
    new ProgressStore();
    expect(localStorage.getItem(PROBE_KEY)).toBeNull();
  });

  it('falls back to in-memory state when localStorage access throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    // The availability probe throws → store treats storage as unavailable.
    const store = new ProgressStore();
    store.markComplete('lesson-001');

    expect(store.isComplete('lesson-001')).toBe(true);

    spy.mockRestore();
    // Nothing was persisted to the real localStorage.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('ProgressStore markComplete storage sync edge cases', () => {
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

  it('discards non-array stored data during markComplete sync', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);
    store.markComplete('lesson-001');

    // Another tab overwrites storage with a non-array value.
    mock._map.set(STORAGE_KEY, JSON.stringify({ lesson: true }));

    store.markComplete('lesson-002');

    // The stale non-array state is dropped; only the newly-added id remains.
    expect(store.getCompletedIds()).toEqual(['lesson-002']);
    expect(store.isComplete('lesson-001')).toBe(false);
  });

  it('merges concurrent completions written by another tab', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);
    store.markComplete('lesson-001');

    // Another tab appends its own completion directly to storage.
    mock._map.set(STORAGE_KEY, JSON.stringify(['lesson-001', 'other-tab']));

    store.markComplete('lesson-002');

    expect(store.getCompletedIds().sort()).toEqual(
      ['lesson-001', 'lesson-002', 'other-tab'],
    );
  });

  it('keeps in-memory state when stored data is malformed during sync', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);
    store.markComplete('lesson-001');

    mock._map.set(STORAGE_KEY, '{not json');

    store.markComplete('lesson-002');

    expect(store.isComplete('lesson-001')).toBe(true);
    expect(store.isComplete('lesson-002')).toBe(true);
  });

  it('resets to empty when storage was cleared before markComplete', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);
    store.markComplete('lesson-001');

    // Simulate resetAll from another instance/tab (key removed).
    mock._map.delete(STORAGE_KEY);

    store.markComplete('lesson-002');

    expect(store.getCompletedIds()).toEqual(['lesson-002']);
  });
});

describe('ProgressStore resetAll resilience', () => {
  it('does not throw when removeItem fails', () => {
    const flakyStorage = {
      getItem: (): string | null => null,
      setItem: (): void => {},
      removeItem: (): void => {
        throw new Error('storage unavailable');
      },
    };
    const store = new ProgressStore(flakyStorage);
    store.markComplete('lesson-001');

    expect(() => store.resetAll()).not.toThrow();
    // In-memory state is still cleared even if persistence fails.
    expect(store.isComplete('lesson-001')).toBe(false);
    expect(store.getCompletedIds()).toEqual([]);
  });
});
