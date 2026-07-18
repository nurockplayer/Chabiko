import { describe, it, expect } from 'vitest';
import { ProgressStore } from '../src/lib/progress';
import { refreshSnapshot } from '../src/lib/progressSnapshot';

/** Create a mock StorageLike from an in-memory Map. */
function mockStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    _map: map,
  };
}

describe('ProgressStore multi-tab merge', () => {
  it('merges concurrent completions from separate instances', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    const b = new ProgressStore(storage);

    a.markComplete('lesson-001');
    b.markComplete('lesson-002');

    // A new instance reading from storage should see both
    const c = new ProgressStore(storage);
    expect(c.isComplete('lesson-001')).toBe(true);
    expect(c.isComplete('lesson-002')).toBe(true);
  });

  it('does not duplicate when completing the same lesson multiple times', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    a.markComplete('lesson-001');
    a.markComplete('lesson-001');
    a.markComplete('lesson-001');

    expect(a.getCompletedIds()).toEqual(['lesson-001']);

    const b = new ProgressStore(storage);
    expect(b.getCompletedIds()).toEqual(['lesson-001']);
  });

  it('merges with existing data in storage', () => {
    const storage = mockStorage({
      chabiko_completed_lessons: JSON.stringify(['lesson-001']),
    });
    const store = new ProgressStore(storage);
    store.markComplete('lesson-002');

    expect(store.isComplete('lesson-001')).toBe(true);
    expect(store.isComplete('lesson-002')).toBe(true);
  });

  it('handles malformed storage gracefully during merge', () => {
    const storage = mockStorage({
      chabiko_completed_lessons: '{broken',
    });
    const store = new ProgressStore(storage);
    // Should not throw
    store.markComplete('lesson-001');
    expect(store.isComplete('lesson-001')).toBe(true);
  });
});

describe('refreshSnapshot', () => {
  it('reads current completed state', () => {
    const storage = mockStorage({
      chabiko_completed_lessons: JSON.stringify(['lesson-001']),
    });
    const snapshot = refreshSnapshot(['lesson-001', 'lesson-002'], storage);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.completed.has('lesson-001')).toBe(true);
  });

  it('returns empty after reset', () => {
    const storage = mockStorage();
    const writer = new ProgressStore(storage);
    writer.markComplete('lesson-001');

    writer.resetAll();

    const snapshot = refreshSnapshot(['lesson-001', 'lesson-002'], storage);
    expect(snapshot.completedCount).toBe(0);
  });

  it('repeated calls return consistent results', () => {
    const storage = mockStorage({
      chabiko_completed_lessons: JSON.stringify(['lesson-001', 'lesson-003']),
    });
    const first = refreshSnapshot(['lesson-001', 'lesson-002', 'lesson-003'], storage);
    const second = refreshSnapshot(['lesson-001', 'lesson-002', 'lesson-003'], storage);
    expect(first).toEqual(second);
  });

  it('deduplicates completed IDs', () => {
    const storage = mockStorage({
      chabiko_completed_lessons: JSON.stringify(['lesson-001', 'lesson-001', 'lesson-002']),
    });
    const snapshot = refreshSnapshot(['lesson-001', 'lesson-002'], storage);
    expect(snapshot.completedCount).toBe(2);
  });
});
