import { describe, it, expect } from 'vitest';
import {
  createVocabularySession,
  applyVocabularySessionAction,
} from '../src/domain/vocabularySession';
import type {
  VocabularySessionDirection,
  VocabularySessionSize,
  ActiveVocabularySession,
} from '../src/domain/vocabularySession';

// ─── Factory helpers ─────────────────────────────────────────────────────────

function active(
  ids: string[],
  size: VocabularySessionSize = 10,
  direction: VocabularySessionDirection = 'zh-to-ja',
): ActiveVocabularySession {
  return createVocabularySession(ids, size, direction);
}

function reveal(state: ActiveVocabularySession) {
  return applyVocabularySessionAction(state, { kind: 'reveal' });
}

function rate(state: ActiveVocabularySession, rating: 'again' | 'unsure' | 'known') {
  // Must reveal before rating per the domain contract
  const revealed = reveal(state);
  if (revealed.kind === 'rejected') return revealed;
  return applyVocabularySessionAction(revealed.state, { kind: 'rate', rating });
}

// ─── Constructor ────────────────────────────────────────────────────────────

describe('createVocabularySession', () => {
  it('selects the first 10 IDs when sessionSize is 10 and input is >=10', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `id-${String(i + 1).padStart(2, '0')}`);
    const s = createVocabularySession(ids, 10, 'zh-to-ja');
    expect(s.status).toBe('active');
    expect(s.selectedItemIds).toEqual(ids.slice(0, 10));
    expect(s.activeItemId).toBe('id-01');
    expect(s.remainingQueue).toEqual(ids.slice(1, 10));
    expect(s.sessionSize).toBe(10);
    expect(s.direction).toBe('zh-to-ja');
  });

  it('selects the first 20 IDs when sessionSize is 20', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `v-${i + 1}`);
    const s = createVocabularySession(ids, 20, 'ja-to-zh');
    expect(s.selectedItemIds).toHaveLength(20);
    expect(s.direction).toBe('ja-to-zh');
  });

  it('uses all input IDs when input is shorter than requested size', () => {
    const ids = ['a', 'b', 'c'];
    const s = createVocabularySession(ids, 20, 'zh-to-ja');
    expect(s.selectedItemIds).toEqual(['a', 'b', 'c']);
    expect(s.activeItemId).toBe('a');
    expect(s.remainingQueue).toEqual(['b', 'c']);
    expect(s.completedUniqueCount).toBe(0);
  });

  it('rejects empty input with RangeError', () => {
    expect(() => createVocabularySession([], 10, 'zh-to-ja')).toThrow(RangeError);
  });

  it('rejects whitespace-only ID with TypeError', () => {
    expect(() => createVocabularySession(['  ', 'b'], 10, 'zh-to-ja')).toThrow(TypeError);
  });

  it('rejects empty-string ID with TypeError', () => {
    expect(() => createVocabularySession(['a', ''], 10, 'zh-to-ja')).toThrow(TypeError);
  });

  it('rejects duplicate ID with TypeError identifying the duplicate', () => {
    expect(() => createVocabularySession(['a', 'b', 'a'], 10, 'zh-to-ja')).toThrow(
      'Duplicate vocabulary ID: a',
    );
  });

  it('does not mutate the input array', () => {
    const ids = ['x', 'y', 'z'];
    const frozen = Object.freeze([...ids]);
    const s = createVocabularySession(frozen, 10, 'zh-to-ja');
    expect(s.selectedItemIds).toEqual(['x', 'y', 'z']);
  });

  it('initialises attempt counts to zero for every selected item', () => {
    const ids = ['a', 'b', 'c'];
    const s = createVocabularySession(ids, 10, 'zh-to-ja');
    expect(s.attempts).toEqual([
      { itemId: 'a', count: 0 },
      { itemId: 'b', count: 0 },
      { itemId: 'c', count: 0 },
    ]);
  });

  it('is deterministic: same input produces same state', () => {
    const ids = ['apple', 'banana', 'cherry'];
    const a = createVocabularySession(ids, 10, 'zh-to-ja');
    const b = createVocabularySession(ids, 10, 'zh-to-ja');
    expect(a).toEqual(b);
  });
});

// ─── Reveal ─────────────────────────────────────────────────────────────────

describe('reveal', () => {
  it('sets answerRevealed to true on an unrevealed active item', () => {
    const s = active(['a', 'b', 'c']);
    expect(s.answerRevealed).toBe(false);
    const result = reveal(s);
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.state.answerRevealed).toBe(true);
    }
  });

  it('reveal on already revealed active item is an accepted idempotent transition', () => {
    const s = active(['a', 'b']);
    const r1 = reveal(s);
    expect(r1.kind).toBe('accepted');
    if (r1.kind !== 'accepted') return;
    expect(r1.state.answerRevealed).toBe(true);
    const r2 = reveal(r1.state as ActiveVocabularySession);
    expect(r2.kind).toBe('accepted');
  });
});

// ─── Rating gating ──────────────────────────────────────────────────────────

describe('rate before reveal', () => {
  it('is rejected with answer-not-revealed', () => {
    const s = active(['a', 'b']);
    const result = applyVocabularySessionAction(s, { kind: 'rate', rating: 'known' });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('answer-not-revealed');
    }
  });

  it('returns the original state object unchanged', () => {
    const s = active(['a', 'b']);
    const result = applyVocabularySessionAction(s, { kind: 'rate', rating: 'known' });
    if (result.kind === 'rejected') {
      expect(result.state).toBe(s);
    }
  });
});

// ─── Completion gating ──────────────────────────────────────────────────────

describe('action after completion', () => {
  it('reveal is rejected with session-completed', () => {
    const s = active(['a']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    expect(r.state.status).toBe('completed');
    const next = applyVocabularySessionAction(r.state, { kind: 'reveal' });
    expect(next.kind).toBe('rejected');
    if (next.kind === 'rejected') {
      expect(next.reason).toBe('session-completed');
    }
  });

  it('rating is rejected with session-completed and returns original state', () => {
    const s = active(['a']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    const next = applyVocabularySessionAction(r.state, { kind: 'rate', rating: 'again' });
    expect(next.kind).toBe('rejected');
    if (next.kind === 'rejected') {
      expect(next.reason).toBe('session-completed');
      expect(next.state).toBe(r.state);
    }
  });
});

// ─── Attempt counting ───────────────────────────────────────────────────────

describe('attempt counting', () => {
  it('each accepted rating increments the active item attempt count exactly once', () => {
    let s = active(['a', 'b', 'c']);
    s = (reveal(s) as { kind: 'accepted'; state: ActiveVocabularySession }).state;
    const r1 = applyVocabularySessionAction(s, { kind: 'rate', rating: 'again' });
    expect(r1.kind).toBe('accepted');
    if (r1.kind !== 'accepted') return;
    const s1 = r1.state as ActiveVocabularySession;
    expect(s1.attempts.find(a => a.itemId === 'a')?.count).toBe(1);
    expect(s1.attempts.find(a => a.itemId === 'b')?.count).toBe(0);
  });

  it('multiple weak ratings accumulate attempts', () => {
    let s = active(['a', 'b']);
    // first round: rate 'a' as again → queued
    const r1 = rate(s, 'again');
    expect(r1.kind).toBe('accepted');
    if (r1.kind !== 'accepted') return;
    s = r1.state as ActiveVocabularySession;
    // round 2: active is 'b', rate 'b' as known → 'a' back
    const r2 = rate(s, 'known');
    expect(r2.kind).toBe('accepted');
    if (r2.kind !== 'accepted') return;
    s = r2.state as ActiveVocabularySession;
    // round 3: active is 'a' again, rate 'a' as again
    const r3 = rate(s, 'again');
    expect(r3.kind).toBe('accepted');
    if (r3.kind !== 'accepted') return;
    s = r3.state as ActiveVocabularySession;
    expect(s.attempts.find(a => a.itemId === 'a')?.count).toBe(2);
    expect(s.attempts.find(a => a.itemId === 'b')?.count).toBe(1);
  });
});

// ─── Queue placement: known ────────────────────────────────────────────────

describe('known rating', () => {
  it('removes the active item from future turns and increments completedUniqueCount', () => {
    let s = active(['a', 'b', 'c']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.completedUniqueCount).toBe(1);
    expect(s.remainingQueue).not.toContain('a');
    expect(s.activeItemId).toBe('b');
  });

  it('completes session when no items remain in queue', () => {
    const s = active(['x']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    expect(r.state.status).toBe('completed');
    if (r.state.status !== 'completed') return;
    expect(r.state.activeItemId).toBeNull();
    expect(r.state.answerRevealed).toBe(false);
    expect(r.state.remainingQueue).toEqual([]);
    expect(r.state.completedUniqueCount).toBe(1);
    expect(r.state.completionSummary).not.toBeNull();
  });

  it('completionSummary contains correct fields', () => {
    const s = active(['a', 'b']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    // 'a' known → 'b' active
    const s2 = r.state as ActiveVocabularySession;
    const r2 = rate(s2, 'known');
    expect(r2.kind).toBe('accepted');
    if (r2.kind !== 'accepted') return;
    expect(r2.state.status).toBe('completed');
    if (r2.state.status !== 'completed') return;
    const summary = r2.state.completionSummary;
    expect(summary.selectedItemIds).toEqual(['a', 'b']);
    expect(summary.direction).toBe('zh-to-ja');
    expect(summary.completedUniqueCount).toBe(2);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.attempts).toEqual([
      { itemId: 'a', count: 1 },
      { itemId: 'b', count: 1 },
    ]);
  });
});

// ─── Queue placement: again ────────────────────────────────────────────────

describe('again rating — concrete queue placement', () => {
  it('active A, remaining [B, C, D] → queued order [B, C, A, D]', () => {
    let s = active(['A', 'B', 'C', 'D']);
    const r = rate(s, 'again');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.activeItemId).toBe('B');
    expect(s.remainingQueue).toEqual(['C', 'A', 'D']);
  });

  it('active A, remaining [B] → queued order [B, A]', () => {
    let s = active(['A', 'B']);
    const r = rate(s, 'again');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.activeItemId).toBe('B');
    expect(s.remainingQueue).toEqual(['A']);
  });

  it('active A, remaining [] → queued order [A]', () => {
    let s = active(['A']);
    const r = rate(s, 'again');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.activeItemId).toBe('A');
    expect(s.remainingQueue).toEqual([]);
    // 'A' comes back as active, nothing in remaining queue
    expect(s.completedUniqueCount).toBe(0);
  });

  it('active A, remaining [B, C] → queued order [B, C, A]', () => {
    let s = active(['A', 'B', 'C']);
    const r = rate(s, 'again');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.activeItemId).toBe('B');
    expect(s.remainingQueue).toEqual(['C', 'A']);
  });
});

// ─── Queue placement: unsure ───────────────────────────────────────────────

describe('unsure rating', () => {
  it('appends the active item at the end of the remaining queue', () => {
    let s = active(['A', 'B', 'C', 'D']);
    const r = rate(s, 'unsure');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.activeItemId).toBe('B');
    expect(s.remainingQueue).toEqual(['C', 'D', 'A']);
  });

  it('single item: active A, remaining [] → queued [A]', () => {
    let s = active(['A']);
    const r = rate(s, 'unsure');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    s = r.state as ActiveVocabularySession;
    expect(s.activeItemId).toBe('A');
    expect(s.remainingQueue).toEqual([]);
  });
});

// ─── Duplicate prevention ──────────────────────────────────────────────────

describe('duplicate prevention', () => {
  it('no item appears more than once across the active+remaining plan after again cycles', () => {
    const ids = ['a', 'b'];
    let s = active(ids);
    // Cycle through again ratings multiple times
    for (let i = 0; i < 6; i++) {
      const r = rate(s, 'again');
      expect(r.kind).toBe('accepted');
      if (r.kind !== 'accepted') return;
      s = r.state as ActiveVocabularySession;
      const allIds = [s.activeItemId, ...s.remainingQueue];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    }
  });

  it('no item appears more than once across the active+remaining plan after unsure cycles', () => {
    const ids = ['a', 'b', 'c'];
    let s = active(ids);
    // Cycle through unsure ratings
    for (let i = 0; i < 6; i++) {
      const r = rate(s, 'unsure');
      expect(r.kind).toBe('accepted');
      if (r.kind !== 'accepted') return;
      s = r.state as ActiveVocabularySession;
      const allIds = [s.activeItemId, ...s.remainingQueue];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    }
  });
});

// ─── Completion model ──────────────────────────────────────────────────────

describe('completion semantics', () => {
  it('completes only after every selected item is most recently rated known', () => {
    const ids = ['a', 'b', 'c'];
    let s = active(ids);

    // Round 1: a → again
    s = (rate(s, 'again') as { kind: 'accepted'; state: ActiveVocabularySession }).state;
    expect(s.status).toBe('active');
    // Queue: [b, c, a] (after again with remaining [b,c]: insert after 2 → [b, c, a])

    // Round 2: b → known (remove b), active: c
    s = (rate(s, 'known') as { kind: 'accepted'; state: ActiveVocabularySession }).state;
    expect(s.status).toBe('active');
    // Queue: [a], active: c

    // Round 3: c → known (remove c), active: a
    s = (rate(s, 'known') as { kind: 'accepted'; state: ActiveVocabularySession }).state;
    expect(s.status).toBe('active');
    // Queue: [], active: a

    // Round 4: a → known → complete!
    const last = rate(s, 'known');
    expect(last.kind).toBe('accepted');
    if (last.kind !== 'accepted') return;
    expect(last.state.status).toBe('completed');
  });

  it('completed state has correct shape', () => {
    const s = active(['x']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    const c = r.state;
    if (c.status !== 'completed') return;
    expect(c.activeItemId).toBeNull();
    expect(c.answerRevealed).toBe(false);
    expect(c.remainingQueue).toEqual([]);
    expect(c.completedUniqueCount).toBe(1);
    expect(c.completionSummary).not.toBeNull();
  });
});

// ─── After rating, next item starts unrevealed ─────────────────────────────

describe('next item starts unrevealed after rating', () => {
  it('after an accepted rating, the new active item has answerRevealed false', () => {
    let s = active(['a', 'b']);
    s = (rate(s, 'known') as { kind: 'accepted'; state: ActiveVocabularySession }).state;
    expect(s.status).toBe('active');
    if (s.status !== 'active') return;
    expect(s.activeItemId).toBe('b');
    expect(s.answerRevealed).toBe(false);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────

describe('determinism', () => {
  it('identical input/action sequences produce deeply equal states', () => {
    function runSequence() {
      let s = createVocabularySession(['a', 'b', 'c', 'd'], 10, 'zh-to-ja');
      s = (reveal(s) as { kind: 'accepted'; state: ActiveVocabularySession }).state;
      s = (applyVocabularySessionAction(s, { kind: 'rate', rating: 'again' }) as {
        kind: 'accepted'; state: ActiveVocabularySession;
      }).state;
      s = (reveal(s) as { kind: 'accepted'; state: ActiveVocabularySession }).state;
      s = (applyVocabularySessionAction(s, { kind: 'rate', rating: 'known' }) as {
        kind: 'accepted'; state: ActiveVocabularySession;
      }).state;
      return s;
    }
    const a = runSequence();
    const b = runSequence();
    expect(a).toEqual(b);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('rejected transitions do not mutate attempts or nested arrays', () => {
    const s = active(['a', 'b']);
    const r = applyVocabularySessionAction(s, { kind: 'rate', rating: 'known' });
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') {
      expect(r.state).toBe(s);
      expect(r.state.attempts).toEqual(s.attempts);
    }
  });

  it('revealing then known on a single-item session completes immediately', () => {
    const s = active(['only']);
    const r = rate(s, 'known');
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    expect(r.state.status).toBe('completed');
    expect(r.state.completedUniqueCount).toBe(1);
  });
});
