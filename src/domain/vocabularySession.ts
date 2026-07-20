/**
 * Pure, deterministic vocabulary-session state machine.
 *
 * This module has no DOM, storage, timer, random, date, or network dependency.
 * Identical input/action sequences always produce deeply equal states.
 */

// ─── Domain types ───────────────────────────────────────────────────────────

export type VocabularySessionDirection = 'zh-to-ja' | 'ja-to-zh';
export type VocabularySessionSize = 10 | 20;
export type VocabularySessionRating = 'again' | 'unsure' | 'known';

export type VocabularySessionAction =
  | { readonly kind: 'reveal' }
  | { readonly kind: 'rate'; readonly rating: VocabularySessionRating };

export interface VocabularySessionAttempt {
  readonly itemId: string;
  readonly count: number;
}

export interface VocabularySessionSummary {
  readonly selectedItemIds: readonly string[];
  readonly direction: VocabularySessionDirection;
  readonly completedUniqueCount: number;
  readonly totalAttempts: number;
  readonly attempts: ReadonlyArray<VocabularySessionAttempt>;
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface ActiveVocabularySession {
  readonly status: 'active';
  readonly sessionSize: VocabularySessionSize;
  readonly direction: VocabularySessionDirection;
  readonly selectedItemIds: readonly string[];
  readonly activeItemId: string;
  readonly answerRevealed: boolean;
  readonly completedUniqueCount: number;
  readonly remainingQueue: readonly string[];
  readonly attempts: ReadonlyArray<VocabularySessionAttempt>;
  readonly completionSummary: null;
}

export interface CompletedVocabularySession {
  readonly status: 'completed';
  readonly sessionSize: VocabularySessionSize;
  readonly direction: VocabularySessionDirection;
  readonly selectedItemIds: readonly string[];
  readonly activeItemId: null;
  readonly answerRevealed: false;
  readonly completedUniqueCount: number;
  readonly remainingQueue: readonly [];
  readonly attempts: ReadonlyArray<VocabularySessionAttempt>;
  readonly completionSummary: VocabularySessionSummary;
}

export type VocabularySessionState =
  | ActiveVocabularySession
  | CompletedVocabularySession;

// ─── Transition results ─────────────────────────────────────────────────────

export interface AcceptedTransition {
  readonly kind: 'accepted';
  readonly state: VocabularySessionState;
}

export interface RejectedTransition {
  readonly kind: 'rejected';
  readonly reason: 'answer-not-revealed' | 'session-completed';
  readonly state: VocabularySessionState;
}

export type VocabularySessionTransition = AcceptedTransition | RejectedTransition;

// ─── Constructor ────────────────────────────────────────────────────────────

export function createVocabularySession(
  ids: readonly string[],
  sessionSize: VocabularySessionSize,
  direction: VocabularySessionDirection,
): ActiveVocabularySession {
  if (ids.length === 0) {
    throw new RangeError('Vocabulary ID list must not be empty');
  }

  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id.trim() === '') {
      throw new TypeError(`Vocabulary ID must not be empty or whitespace-only, got "${id}"`);
    }
    if (seen.has(id)) {
      throw new TypeError(`Duplicate vocabulary ID: ${id}`);
    }
    seen.add(id);
  }

  const selectedCount = Math.min(sessionSize, ids.length);
  const selectedItemIds = ids.slice(0, selectedCount);

  return {
    status: 'active',
    sessionSize,
    direction,
    selectedItemIds,
    activeItemId: selectedItemIds[0],
    answerRevealed: false,
    completedUniqueCount: 0,
    remainingQueue: selectedItemIds.slice(1),
    attempts: selectedItemIds.map(id => ({ itemId: id, count: 0 })),
    completionSummary: null,
  };
}

// ─── Transition ─────────────────────────────────────────────────────────────

export function applyVocabularySessionAction(
  state: VocabularySessionState,
  action: VocabularySessionAction,
): VocabularySessionTransition {
  if (state.status === 'completed') {
    return { kind: 'rejected', reason: 'session-completed', state };
  }

  // Reveal
  if (action.kind === 'reveal') {
    if (state.answerRevealed) {
      return { kind: 'accepted', state };
    }
    return {
      kind: 'accepted',
      state: { ...state, answerRevealed: true },
    };
  }

  // Rate — must be after reveal
  if (!state.answerRevealed) {
    return { kind: 'rejected', reason: 'answer-not-revealed', state };
  }

  const activeId = state.activeItemId;
  const rating = action.rating;

  // Increment attempt count for the active item (immutably)
  const nextAttempts: VocabularySessionAttempt[] = state.attempts.map(a =>
    a.itemId === activeId
      ? { itemId: a.itemId, count: a.count + 1 }
      : a,
  );

  switch (rating) {
    case 'known':
      return applyKnown(state, nextAttempts);
    case 'again':
      return applyAgain(state, nextAttempts, activeId);
    case 'unsure':
      return applyUnsure(state, nextAttempts, activeId);
  }
}

// ─── Rating handlers ────────────────────────────────────────────────────────

function applyKnown(
  state: ActiveVocabularySession,
  attempts: VocabularySessionAttempt[],
): AcceptedTransition {
  const nextCompletedCount = state.completedUniqueCount + 1;

  if (state.remainingQueue.length === 0) {
    const totalAttempts = attempts.reduce((sum, a) => sum + a.count, 0);
    return {
      kind: 'accepted',
      state: {
        status: 'completed',
        sessionSize: state.sessionSize,
        direction: state.direction,
        selectedItemIds: state.selectedItemIds,
        activeItemId: null,
        answerRevealed: false,
        completedUniqueCount: nextCompletedCount,
        remainingQueue: [],
        attempts,
        completionSummary: {
          selectedItemIds: state.selectedItemIds,
          direction: state.direction,
          completedUniqueCount: nextCompletedCount,
          totalAttempts,
          attempts,
        },
      },
    };
  }

  return {
    kind: 'accepted',
    state: {
      ...state,
      activeItemId: state.remainingQueue[0],
      answerRevealed: false,
      completedUniqueCount: nextCompletedCount,
      remainingQueue: state.remainingQueue.slice(1),
      attempts,
    },
  };
}

function applyAgain(
  state: ActiveVocabularySession,
  attempts: VocabularySessionAttempt[],
  activeId: string,
): AcceptedTransition {
  const requeued = requeueAfterAgain(state.remainingQueue, activeId);
  return {
    kind: 'accepted',
    state: {
      ...state,
      activeItemId: requeued[0],
      answerRevealed: false,
      remainingQueue: requeued.slice(1),
      attempts,
    },
  };
}

function applyUnsure(
  state: ActiveVocabularySession,
  attempts: VocabularySessionAttempt[],
  activeId: string,
): AcceptedTransition {
  const requeued = requeueAfterUnsure(state.remainingQueue, activeId);
  return {
    kind: 'accepted',
    state: {
      ...state,
      activeItemId: requeued[0],
      answerRevealed: false,
      remainingQueue: requeued.slice(1),
      attempts,
    },
  };
}

// ─── Queue helpers ──────────────────────────────────────────────────────────

/**
 * Re-queue the active item at index 2 in `remainingQueue`.
 * When fewer than two IDs remain, append at the end.
 * Never creates a duplicate entry.
 */
function requeueAfterAgain(
  remainingQueue: readonly string[],
  activeId: string,
): string[] {
  if (remainingQueue.includes(activeId)) {
    return [...remainingQueue];
  }
  const result = [...remainingQueue];
  if (result.length < 2) {
    result.push(activeId);
  } else {
    result.splice(2, 0, activeId);
  }
  return result;
}

/**
 * Append the active item at the end of `remainingQueue`.
 * Never creates a duplicate entry.
 */
function requeueAfterUnsure(
  remainingQueue: readonly string[],
  activeId: string,
): string[] {
  if (remainingQueue.includes(activeId)) {
    return [...remainingQueue];
  }
  return [...remainingQueue, activeId];
}
