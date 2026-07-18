import { describe, it, expect } from 'vitest';
import { ProgressStore } from '../src/lib/progress';

function mockStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    _map: map,
  };
}

describe('ProgressStore concurrent completion merge', () => {
  it('two instances from empty storage both persist', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    const b = new ProgressStore(storage);

    a.markComplete('lesson-001');
    b.markComplete('lesson-002');

    const c = new ProgressStore(storage);
    expect(c.isComplete('lesson-001')).toBe(true);
    expect(c.isComplete('lesson-002')).toBe(true);
  });

  it('stale instance does not resurrect reset progress', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    a.markComplete('lesson-001');

    // b reads after a wrote
    const b = new ProgressStore(storage);
    expect(b.isComplete('lesson-001')).toBe(true);

    // reset
    a.resetAll();

    // b calls markComplete — should NOT resurrect lesson-001
    b.markComplete('lesson-002');

    const c = new ProgressStore(storage);
    expect(c.isComplete('lesson-001')).toBe(false);
    expect(c.isComplete('lesson-002')).toBe(true);
  });

  it('repeated completion does not duplicate', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    a.markComplete('lesson-001');
    a.markComplete('lesson-001');
    a.markComplete('lesson-001');
    expect(a.getCompletedIds()).toEqual(['lesson-001']);
  });

  it('malformed storage keeps in-memory fallback', () => {
    const storage = mockStorage({
      chabiko_completed_lessons: '{broken',
    });
    const store = new ProgressStore(storage);
    expect(() => store.markComplete('lesson-001')).not.toThrow();
    expect(store.isComplete('lesson-001')).toBe(true);
  });

  it('null storage (unavailable) does not crash', () => {
    const store = new ProgressStore(null);
    expect(() => store.markComplete('lesson-001')).not.toThrow();
    expect(store.isComplete('lesson-001')).toBe(true);
  });

  it('resetAll clears storage for other instances', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    a.markComplete('lesson-001');
    a.resetAll();

    const b = new ProgressStore(storage);
    expect(b.isComplete('lesson-001')).toBe(false);
  });
});
