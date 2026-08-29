import type { RoleplayCardRecord } from '../types/roleplayCard';

/** The learner-facing rehearsal phases. */
export type RoleplayPhase = 'selection' | 'guidance' | 'active' | 'completed';

export interface RoleplayRehearsalState {
  readonly phase: RoleplayPhase;
  readonly cards: readonly RoleplayCardRecord[];
  readonly selectedCardId: string | null;
  /** Index of the learner line currently waiting to be revealed. */
  readonly currentLearnerLineIndex: number | null;
  /** Learner line indexes explicitly revealed by the learner. */
  readonly revealedLearnerLineIndexes: readonly number[];
}

export type RoleplayRehearsalAction =
  | { readonly kind: 'select-card'; readonly cardId: string }
  | { readonly kind: 'start' }
  | { readonly kind: 'reveal' }
  | { readonly kind: 'next' }
  | { readonly kind: 'restart' };

export type RoleplayRehearsalEffect =
  | 'noop'
  | 'selected'
  | 'started'
  | 'revealed'
  | 'advanced'
  | 'completed'
  | 'restarted';

export interface RoleplayRehearsalResult {
  readonly state: RoleplayRehearsalState;
  readonly effect: RoleplayRehearsalEffect;
  readonly message: string | null;
}

function learnerLineIndexes(card: RoleplayCardRecord): number[] {
  return card.lines.reduce<number[]>((indexes, line, index) => {
    if (line.speaker === 'learner') indexes.push(index);
    return indexes;
  }, []);
}

function selectedCard(state: RoleplayRehearsalState): RoleplayCardRecord | null {
  return state.cards.find((card) => card.id === state.selectedCardId) ?? null;
}

export function createRoleplayRehearsal(
  cards: readonly RoleplayCardRecord[],
): RoleplayRehearsalState {
  if (cards.length === 0) throw new RangeError('roleplay rehearsal requires cards');
  return {
    phase: 'selection',
    cards,
    selectedCardId: null,
    currentLearnerLineIndex: null,
    revealedLearnerLineIndexes: [],
  };
}

/**
 * Apply one deterministic rehearsal action. This module owns no DOM or
 * storage; the client records completion only after the `completed` effect.
 */
export function applyRoleplayRehearsalAction(
  state: RoleplayRehearsalState,
  action: RoleplayRehearsalAction,
): RoleplayRehearsalResult {
  if (action.kind === 'restart') {
    return {
      state: createRoleplayRehearsal(state.cards),
      effect: 'restarted',
      message: null,
    };
  }

  if (state.phase === 'completed') {
    return { state, effect: 'noop', message: 'rehearsal is already completed' };
  }

  if (action.kind === 'select-card') {
    if (state.phase !== 'selection') {
      return { state, effect: 'noop', message: 'card selection is not available' };
    }
    const card = state.cards.find((candidate) => candidate.id === action.cardId);
    if (card === undefined) {
      return { state, effect: 'noop', message: 'unknown roleplay card' };
    }
    return {
      state: {
        ...state,
        phase: 'guidance',
        selectedCardId: card.id,
        currentLearnerLineIndex: null,
        revealedLearnerLineIndexes: [],
      },
      effect: 'selected',
      message: null,
    };
  }

  const card = selectedCard(state);
  if (card === null) {
    return { state, effect: 'noop', message: 'select a roleplay card first' };
  }
  const learnerIndexes = learnerLineIndexes(card);

  if (action.kind === 'start') {
    if (state.phase !== 'guidance') {
      return { state, effect: 'noop', message: 'guidance must be shown first' };
    }
    return {
      state: { ...state, phase: 'active', currentLearnerLineIndex: learnerIndexes[0] },
      effect: 'started',
      message: null,
    };
  }

  if (action.kind === 'reveal') {
    if (state.phase !== 'active' || state.currentLearnerLineIndex === null) {
      return { state, effect: 'noop', message: 'no learner line is waiting' };
    }
    if (state.revealedLearnerLineIndexes.includes(state.currentLearnerLineIndex)) {
      return { state, effect: 'noop', message: 'learner line already revealed' };
    }
    return {
      state: {
        ...state,
        revealedLearnerLineIndexes: [
          ...state.revealedLearnerLineIndexes,
          state.currentLearnerLineIndex,
        ],
      },
      effect: 'revealed',
      message: null,
    };
  }

  if (action.kind === 'next') {
    if (state.phase !== 'active' || state.currentLearnerLineIndex === null) {
      return { state, effect: 'noop', message: 'no active learner line' };
    }
    if (!state.revealedLearnerLineIndexes.includes(state.currentLearnerLineIndex)) {
      return { state, effect: 'noop', message: 'reveal the learner line first' };
    }
    const currentPosition = learnerIndexes.indexOf(state.currentLearnerLineIndex);
    const nextIndex = learnerIndexes[currentPosition + 1];
    if (nextIndex !== undefined) {
      return {
        state: { ...state, currentLearnerLineIndex: nextIndex },
        effect: 'advanced',
        message: null,
      };
    }
    return {
      state: { ...state, phase: 'completed', currentLearnerLineIndex: null },
      effect: 'completed',
      message: null,
    };
  }

  return { state, effect: 'noop', message: 'unsupported rehearsal action' };
}

export function cardLearnerLineIndexes(card: RoleplayCardRecord): readonly number[] {
  return learnerLineIndexes(card);
}
