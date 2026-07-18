import { describe, it, expect } from 'vitest';
import { ProgressStore } from '../src/lib/progress';
import { buildProgressSnapshot } from '../src/lib/progressSnapshot';

function createMockStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    _map: map,
  };
}

describe('progressSnapshot', () => {
  it('reads current completed set from store', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);
    store.markComplete('lesson-001');

    const snapshot = buildProgressSnapshot(store, ['lesson-001', 'lesson-002', 'lesson-003']);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.completed.has('lesson-001')).toBe(true);
    expect(snapshot.totalCount).toBe(3);
  });

  it('returns empty when nothing completed', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);

    const snapshot = buildProgressSnapshot(store, ['lesson-001', 'lesson-002']);
    expect(snapshot.completedCount).toBe(0);
    expect(snapshot.completed.size).toBe(0);
  });
});

describe('ProgressStore refresh (simulating pageshow)', () => {
  it('new ProgressStore reads latest localStorage state', () => {
    const mock = createMockStorage();

    // Simulate lesson page marking complete
    const writer = new ProgressStore(mock);
    writer.markComplete('lesson-001');

    // Simulate returning to home — new ProgressStore should see it
    const reader = new ProgressStore(mock);
    expect(reader.isComplete('lesson-001')).toBe(true);
  });

  it('reset is reflected by a new ProgressStore', () => {
    const mock = createMockStorage();
    mock._map.set('chabiko_completed_lessons', JSON.stringify(['lesson-001']));

    // Reset
    const reseter = new ProgressStore(mock);
    reseter.resetAll();

    // Fresh store should see empty
    const reader = new ProgressStore(mock);
    expect(reader.isComplete('lesson-001')).toBe(false);
  });
});

describe('LessonPractice bfcache sync behavior', () => {
  it('completed → reset → active transitions are consistent from storage perspective', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);

    // Complete lesson
    store.markComplete('lesson-001');
    expect(store.isComplete('lesson-001')).toBe(true);

    // Reset
    store.resetAll();
    expect(store.isComplete('lesson-001')).toBe(false);

    // Fresh store also sees reset
    const fresh = new ProgressStore(mock);
    expect(fresh.isComplete('lesson-001')).toBe(false);
  });

  it('multiple ProgressStore instances share underlying storage', () => {
    const mock = createMockStorage();
    const a = new ProgressStore(mock);

    a.markComplete('lesson-001');

    // A new store reading from the same mock should see the persisted value
    const b = new ProgressStore(mock);
    expect(b.isComplete('lesson-001')).toBe(true);

    b.markComplete('lesson-002');

    const c = new ProgressStore(mock);
    expect(c.isComplete('lesson-002')).toBe(true);
  });

  it('repeated pageshow does not duplicate completion', () => {
    const mock = createMockStorage();
    const store = new ProgressStore(mock);

    // Simulate multiple pageshow events calling markComplete
    store.markComplete('lesson-001');
    store.markComplete('lesson-001');
    store.markComplete('lesson-001');

    expect(store.getCompletedIds()).toEqual(['lesson-001']);
  });
});
