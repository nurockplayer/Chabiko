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

describe('ProgressStore null storage fallback', () => {
  it('accumulates completions with null storage', () => {
    const store = new ProgressStore(null);
    store.markComplete('lesson-001');
    store.markComplete('lesson-002');
    expect(store.isComplete('lesson-001')).toBe(true);
    expect(store.isComplete('lesson-002')).toBe(true);
  });

  it('does not merge non-existent storage', () => {
    const store = new ProgressStore(null);
    store.markComplete('lesson-001');
    store.markComplete('lesson-002');
    const ids = store.getCompletedIds();
    expect(ids).toContain('lesson-001');
    expect(ids).toContain('lesson-002');
  });
});

describe('ProgressStore getItem throws on markComplete', () => {
  it('accumulates in memory when getItem throws', () => {
    const flaky = {
      getItem: () => { throw new Error('fail'); },
      setItem: () => {},
      removeItem: () => {},
    };
    const store = new ProgressStore(flaky);
    store.markComplete('lesson-001');
    store.markComplete('lesson-002');
    expect(store.isComplete('lesson-001')).toBe(true);
    expect(store.isComplete('lesson-002')).toBe(true);
  });
});

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
    const b = new ProgressStore(storage);
    expect(b.isComplete('lesson-001')).toBe(true);
    a.resetAll();
    b.markComplete('lesson-002');
    const c = new ProgressStore(storage);
    expect(c.isComplete('lesson-001')).toBe(false);
    expect(c.isComplete('lesson-002')).toBe(true);
  });

  it('duplicate lesson does not repeat', () => {
    const storage = mockStorage();
    const a = new ProgressStore(storage);
    a.markComplete('lesson-001');
    a.markComplete('lesson-001');
    expect(a.getCompletedIds()).toEqual(['lesson-001']);
  });
});
