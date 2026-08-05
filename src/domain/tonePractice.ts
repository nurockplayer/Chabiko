/**
 * Pure, deterministic visual tone-discrimination practice domain.
 *
 * The learner sees a controlled tone contour (represented only as text/CSS
 * geometry, never as generated media) and must pick the correct tone name.
 * This module has no DOM, storage, timer, random, date, or network
 * dependency. Identical input/action sequences always produce deeply equal
 * states.
 *
 * State machine: initial → selected → submitted (correct/incorrect) → retry
 * or next → completed → restart.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TonePracticePhase = 'initial' | 'submitted' | 'completed';

/** The four named tone choices shown for every item. */
export type ToneChoice = '第一声' | '第二声' | '第三声' | '第四声';

/** The four controlled tone contour identifiers (display is out of domain). */
export type ToneContourId = 't1-high-flat' | 't2-rising' | 't3-dip-rise' | 't4-falling';

export interface TonePracticeItem {
  readonly recordId: string;
  readonly promptJa: string;
  readonly correctAnswer: ToneChoice;
  readonly distractors: readonly [ToneChoice, ToneChoice, ToneChoice];
  readonly contrastId: string;
  readonly toneContourId: ToneContourId;
  /** Existing hint guidance for the controlled contour (display only). */
  readonly toneContourHintJa: string;
  /** Existing interference guidance for Japanese learners (display only). */
  readonly interferenceJa: string;
}

export interface TonePracticeState {
  readonly status: TonePracticePhase;
  readonly items: readonly TonePracticeItem[];
  readonly currentIndex: number;
  /** Selected choice label, or null when nothing is selected. */
  readonly selected: ToneChoice | null;
  /** True after an incorrect submit, reset by retry/next. */
  readonly lastCorrect: boolean | null;
  /** True when the last correct answer has not yet been advanced. */
  readonly pendingCorrect: boolean;
}

export type TonePracticeAction =
  | { readonly kind: 'select'; readonly choice: ToneChoice }
  | { readonly kind: 'submit' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'next' }
  | { readonly kind: 'restart' };

export interface TonePracticeResult {
  readonly state: TonePracticeState;
  /** 'noop' for rejected, duplicate, or out-of-order actions. */
  readonly effect: 'noop' | 'accepted' | 'correct' | 'incorrect';
  readonly message: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const TONE_CHOICES: readonly ToneChoice[] = [
  '第一声',
  '第二声',
  '第三声',
  '第四声',
];

const TONE_CONTOUR_IDS: readonly ToneContourId[] = [
  't1-high-flat',
  't2-rising',
  't3-dip-rise',
  't4-falling',
];

export const TONE_BY_CONTOUR: Readonly<Record<ToneContourId, ToneChoice>> = {
  't1-high-flat': '第一声',
  't2-rising': '第二声',
  't3-dip-rise': '第三声',
  't4-falling': '第四声',
};

export const CONTOUR_BY_TONE: Readonly<Record<ToneChoice, ToneContourId>> = {
  第一声: 't1-high-flat',
  第二声: 't2-rising',
  第三声: 't3-dip-rise',
  第四声: 't4-falling',
};

// ─── Guards ─────────────────────────────────────────────────────────────────

export function isToneChoice(value: unknown): value is ToneChoice {
  return TONE_CHOICES.includes(value as ToneChoice);
}

export function isToneContourId(value: unknown): value is ToneContourId {
  return TONE_CONTOUR_IDS.includes(value as ToneContourId);
}

// ─── Constructor ────────────────────────────────────────────────────────────

export function createTonePracticeSession(
  items: readonly TonePracticeItem[],
): TonePracticeState {
  if (items.length === 0) {
    throw new RangeError('tone practice session requires at least one item');
  }
  return {
    status: 'initial',
    items,
    currentIndex: 0,
    selected: null,
    lastCorrect: null,
    pendingCorrect: false,
  };
}

// ─── Transitions ────────────────────────────────────────────────────────────

export function applyTonePracticeAction(
  state: TonePracticeState,
  action: TonePracticeAction,
): TonePracticeResult {
  if (state.status === 'completed') {
    if (action.kind === 'restart') {
      return {
        state: createTonePracticeSession(state.items),
        effect: 'accepted',
        message: null,
      };
    }
    return { state, effect: 'noop', message: 'session already completed' };
  }

  const item = state.items[state.currentIndex];

  switch (action.kind) {
    case 'select':
      return applySelect(state, action.choice);
    case 'submit':
      return applySubmit(state, item);
    case 'retry':
      return applyRetry(state);
    case 'next':
      return applyNext(state);
    case 'restart':
      return {
        state: createTonePracticeSession(state.items),
        effect: 'accepted',
        message: null,
      };
  }
}

function applySelect(
  state: TonePracticeState,
  choice: ToneChoice,
): TonePracticeResult {
  // Out-of-range or non-choice selections are rejected, never stored.
  if (!isToneChoice(choice)) {
    return { state, effect: 'noop', message: 'unknown tone choice' };
  }
  // After submit, selection is locked until retry.
  if (state.status === 'submitted') {
    return { state, effect: 'noop', message: 'submit answers before retrying' };
  }
  // Re-selecting the already selected choice is a no-op (duplicate action).
  if (state.selected === choice) {
    return { state, effect: 'noop', message: 'choice already selected' };
  }
  return {
    state: { ...state, selected: choice },
    effect: 'accepted',
    message: null,
  };
}

function applySubmit(state: TonePracticeState, item: TonePracticeItem): TonePracticeResult {
  // A second submit after an answer is a duplicate action and is rejected.
  if (state.status === 'submitted') {
    return { state, effect: 'noop', message: 'already submitted' };
  }
  // Submit is unavailable until exactly one choice is selected.
  if (state.selected === null) {
    return { state, effect: 'noop', message: 'no choice selected to submit' };
  }
  const isCorrect = state.selected === item.correctAnswer;

  return {
    state: {
      ...state,
      status: 'submitted',
      lastCorrect: isCorrect,
      pendingCorrect: isCorrect,
    },
    effect: isCorrect ? 'correct' : 'incorrect',
    message: isCorrect ? '正解です' : '違います。もう一度チャレンジできます',
  };
}

function applyRetry(state: TonePracticeState): TonePracticeResult {
  // Retry belongs to the incorrect path only: after a correct submit the
  // learner advances via next, so a retry there is out of order.
  if (state.status !== 'submitted' || state.lastCorrect !== false) {
    return { state, effect: 'noop', message: 'nothing to retry' };
  }
  // Retry returns to the same item with no selection; the hint and
  // interference guidance remain visible while an answer is pending.
  return {
    state: {
      ...state,
      status: 'initial',
      selected: null,
      lastCorrect: null,
      pendingCorrect: false,
    },
    effect: 'accepted',
    message: null,
  };
}

function applyNext(state: TonePracticeState): TonePracticeResult {
  if (state.status !== 'submitted' || state.lastCorrect !== true) {
    return { state, effect: 'noop', message: 'next requires a correct submit' };
  }
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.items.length) {
    return {
      state: {
        ...state,
        status: 'completed',
        currentIndex: nextIndex,
        selected: null,
        lastCorrect: null,
        pendingCorrect: false,
      },
      effect: 'accepted',
      message: 'セッション完了',
    };
  }
  return {
    state: {
      ...state,
      currentIndex: nextIndex,
      status: 'initial',
      selected: null,
      lastCorrect: null,
      pendingCorrect: false,
    },
    effect: 'accepted',
    message: null,
  };
}
