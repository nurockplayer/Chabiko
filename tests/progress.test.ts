import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressStore } from '../src/lib/progress';

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

describe('ProgressStore', () => {
  let store: ProgressStore;
  let mock: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mock = createMockStorage();
    store = new ProgressStore(mock);
  });

  it('starts with no lessons completed', () => {
    expect(store.isComplete('lesson-001')).toBe(false);
  });

  it('marks a lesson complete', () => {
    store.markComplete('lesson-001');
    expect(store.isComplete('lesson-001')).toBe(true);
  });

  it('persists completion to storage', () => {
    store.markComplete('lesson-001');
    expect(mock._map.get('chabiko_completed_lessons')).toBe(
      JSON.stringify(['lesson-001']),
    );
  });

  it('loads persisted completion from storage', () => {
    mock._map.set(
      'chabiko_completed_lessons',
      JSON.stringify(['lesson-001']),
    );
    const newStore = new ProgressStore(mock);
    expect(newStore.isComplete('lesson-001')).toBe(true);
    expect(newStore.isComplete('lesson-002')).toBe(false);
  });

  it('filters out non-string items from persisted data', () => {
    mock._map.set(
      'chabiko_completed_lessons',
      JSON.stringify(['lesson-001', 123, null, 'lesson-002']),
    );
    const newStore = new ProgressStore(mock);
    expect(newStore.isComplete('lesson-001')).toBe(true);
    expect(newStore.isComplete('lesson-002')).toBe(true);
    expect(newStore.getCompletedIds()).toEqual(['lesson-001', 'lesson-002']);
  });

  it('handles malformed JSON gracefully', () => {
    mock._map.set('chabiko_completed_lessons', 'not json');
    const newStore = new ProgressStore(mock);
    expect(newStore.isComplete('lesson-001')).toBe(false);
    expect(newStore.getCompletedIds()).toEqual([]);
  });

  it('handles unparseable data gracefully', () => {
    mock._map.set('chabiko_completed_lessons', '{broken');
    const newStore = new ProgressStore(mock);
    expect(newStore.isComplete('lesson-001')).toBe(false);
  });

  it('handles non-array persisted data gracefully', () => {
    mock._map.set('chabiko_completed_lessons', '{"lesson-001": true}');
    const newStore = new ProgressStore(mock);
    expect(newStore.isComplete('lesson-001')).toBe(false);
  });

  it('resets all progress', () => {
    store.markComplete('lesson-001');
    store.markComplete('lesson-002');
    store.resetAll();
    expect(store.isComplete('lesson-001')).toBe(false);
    expect(store.isComplete('lesson-002')).toBe(false);
    expect(mock._map.has('chabiko_completed_lessons')).toBe(false);
  });

  it('returns completed ids as an array', () => {
    store.markComplete('lesson-001');
    store.markComplete('lesson-003');
    expect(store.getCompletedIds()).toEqual(['lesson-001', 'lesson-003']);
  });

  it('handles storage setItem throwing gracefully', () => {
    const flakyStorage = {
      getItem: (): string | null => null,
      setItem: (): void => {
        throw new Error('quota exceeded');
      },
      removeItem: (): void => {},
    };
    const flakyStore = new ProgressStore(flakyStorage);
    expect(() => flakyStore.markComplete('lesson-001')).not.toThrow();
    expect(flakyStore.isComplete('lesson-001')).toBe(true);
  });

  it('handles storage getItem throwing gracefully', () => {
    const flakyStorage = {
      getItem: (): string | null => {
        throw new Error('storage unavailable');
      },
      setItem: (): void => {},
      removeItem: (): void => {},
    };
    const flakyStore = new ProgressStore(flakyStorage);
    expect(flakyStore.isComplete('lesson-001')).toBe(false);
  });

  it('falls back to in-memory state when storage is null', () => {
    const nullStore = new ProgressStore(null);
    nullStore.markComplete('lesson-001');
    expect(nullStore.isComplete('lesson-001')).toBe(true);
    expect(nullStore.getCompletedIds()).toEqual(['lesson-001']);
  });

  it('handles null storage reset gracefully', () => {
    const nullStore = new ProgressStore(null);
    nullStore.markComplete('lesson-001');
    expect(() => nullStore.resetAll()).not.toThrow();
    expect(nullStore.isComplete('lesson-001')).toBe(false);
  });
});
