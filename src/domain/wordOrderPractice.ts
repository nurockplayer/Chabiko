/**
 * Pure, deterministic word-order practice domain.
 *
 * This module has no DOM, storage, timer, random, date, or network dependency.
 * Identical input/action sequences always produce deeply equal states.
 */

// ─── Tokenization ───────────────────────────────────────────────────────────

export type WordOrderChunk = {
  readonly id: string;
  readonly text: string;
};

export interface TokenizedAnswer {
  readonly chunks: WordOrderChunk[];
  /** The separator the source record used between its chunks. */
  readonly separator: ' ' | '';
}

/**
 * Split a canonical answer into ordered non-empty chunks using the smallest
 * deterministic boundary the source record itself supports:
 *
 * - When the record contains whitespace, the whitespace runs are the token
 *   boundaries.
 * - When the record has no whitespace (space-less CJK), each Unicode code
 *   point is the smallest unambiguous boundary — every character is an
 *   atomic Chinese writing unit, so no token is invented.
 *
 * Determinism rule: a single tokenizer and a single normalization rule. Any
 * record whose canonical answer cannot be split unambiguously back into its
 * exact source form is rejected rather than patched with invented tokens.
 */
export function tokenizeAnswer(
  recordId: string,
  correctAnswer: string,
): TokenizedAnswer {
  if (typeof correctAnswer !== 'string' || correctAnswer.trim() === '') {
    throw new Error(`word-order record '${recordId}' has no non-empty correctAnswer`);
  }

  const trimmed = correctAnswer.trim();
  // U+3000 (ideographic full-width space) is also treated as a boundary.
  const hasWhitespace = /[\s\u3000]/.test(trimmed);

  if (hasWhitespace) {
    const parts = trimmed.split(/[\s\u3000]+/).filter((part) => part.length > 0);
    if (parts.length < 2) {
      throw new Error(
        `word-order record '${recordId}' cannot be split unambiguously: "${correctAnswer}"`,
      );
    }

    const chunks: WordOrderChunk[] = parts.map((text, index) => ({
      id: `${recordId}-chunk-${index + 1}`,
      text,
    }));

    // Rejection instead of invention: chunks must rejoin to the exact
    // canonical answer, otherwise the token boundary is ambiguous.
    if (chunks.map((c) => c.text).join(' ') !== trimmed) {
      throw new Error(
        `word-order record '${recordId}' has ambiguous token boundaries: "${correctAnswer}"`,
      );
    }

    return { chunks, separator: ' ' };
  }

  // Space-less CJK: the smallest unambiguous boundary is one code point.
  const chars = Array.from(trimmed);
  if (chars.length < 2) {
    throw new Error(
      `word-order record '${recordId}' cannot be split unambiguously: "${correctAnswer}"`,
    );
  }

  const chunks: WordOrderChunk[] = chars.map((text, index) => ({
    id: `${recordId}-chunk-${index + 1}`,
    text,
  }));

  // Characters always rejoin exactly; nothing is invented.
  return { chunks, separator: '' };
}

// ─── Non-answer ordering ─────────────────────────────────────────────────────

/**
 * Deterministically derive a non-answer chunk order without any randomness.
 *
 * The result depends only on the record id and the chunk texts, so it is
 * stable across generations, pages, and reloads. When the derived order
 * equals the canonical order (index order), it is inverted so the learner is
 * never shown the pre-solved answer.
 */
export function deriveNonAnswerOrder(
  recordId: string,
  chunks: readonly WordOrderChunk[],
): number[] {
  const base = chunks.map((chunk) => stableHash(`${recordId}|${chunk.text}`));

  let order = chunks
    .map((_, index) => index)
    .sort((a, b) => base[a] - base[b] || a - b);

  if (isCanonicalOrder(order)) {
    order = [...order].reverse();
  }
  if (isCanonicalOrder(order)) {
    // Practically unreachable (would need a constant hash), but the contract
    // must never present the pre-solved order.
    order = chunks.map((_, index) => chunks.length - 1 - index);
  }

  return order;
}

function isCanonicalOrder(order: readonly number[]): boolean {
  return order.every((value, index) => value === index);
}

// FNV-1a 32-bit. Pure, deterministic, collision-resistant enough for ordering.
function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ─── Session state machine ───────────────────────────────────────────────────

export type WordOrderPhase = 'initial' | 'composing' | 'submitted' | 'completed';

export interface WordOrderItem {
  readonly recordId: string;
  readonly promptJa: string;
  readonly chunks: readonly WordOrderChunk[];
  /** Separator between chunks in the canonical answer (source-derived). */
  readonly separator: ' ' | '';
  /** Canonical order of the chunks (target). */
  readonly canonicalOrder: readonly number[];
  /** Deterministic non-answer order shown to the learner. */
  readonly shownOrder: readonly number[];
}

export interface WordOrderState {
  readonly status: WordOrderPhase;
  readonly items: readonly WordOrderItem[];
  readonly currentIndex: number;
  /** Chunk indices (into shownOrder) the learner has activated so far. */
  readonly selected: readonly number[];
  readonly attemptCount: number;
  readonly lastCorrect: boolean | null;
}

export type WordOrderAction =
  | { readonly kind: 'toggle'; readonly position: number }
  | { readonly kind: 'submit' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'next' }
  | { readonly kind: 'restart' };

export interface WordOrderResult {
  readonly state: WordOrderState;
  /** 'noop' for rejected or no-op transitions. */
  readonly effect: 'noop' | 'accepted' | 'correct' | 'incorrect';
  readonly message: string | null;
}

// ─── Constructor ────────────────────────────────────────────────────────────

export function createWordOrderSession(items: readonly WordOrderItem[]): WordOrderState {
  if (items.length === 0) {
    throw new RangeError('word-order session requires at least one item');
  }
  return {
    status: 'initial',
    items,
    currentIndex: 0,
    selected: [],
    attemptCount: 0,
    lastCorrect: null,
  };
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export function applyWordOrderAction(
  state: WordOrderState,
  action: WordOrderAction,
): WordOrderResult {
  if (state.status === 'completed') {
    if (action.kind === 'restart') {
      const fresh = createWordOrderSession(state.items);
      return { state: fresh, effect: 'accepted', message: null };
    }
    return { state, effect: 'noop', message: 'session already completed' };
  }

  const item = state.items[state.currentIndex];

  switch (action.kind) {
    case 'toggle':
      return applyToggle(state, item, action.position);

    case 'submit':
      return applySubmit(state, item);

    case 'retry':
      return applyRetry(state);

    case 'next':
      return applyNext(state);

    case 'restart':
      return {
        state: createWordOrderSession(state.items),
        effect: 'accepted',
        message: null,
      };
  }
}

function applyToggle(
  state: WordOrderState,
  item: WordOrderItem,
  position: number,
): WordOrderResult {
  if (!Number.isInteger(position) || position < 0 || position >= item.chunks.length) {
    return { state, effect: 'noop', message: 'chunk position out of range' };
  }
  // After submit, chunk activation is locked until retry.
  if (state.status === 'submitted') {
    return { state, effect: 'noop', message: 'submit answers before retrying' };
  }

  const selected = state.selected;
  const index = selected.indexOf(position);
  const isAlreadySelected = index !== -1;

  if (isAlreadySelected) {
    // Remove at its activation position (reverse order removal allowed).
    const nextSelected = [
      ...selected.slice(0, index),
      ...selected.slice(index + 1),
    ];
    return {
      state: {
        ...state,
        selected: nextSelected,
        status: nextSelected.length > 0 ? 'composing' : 'initial',
      },
      effect: 'accepted',
      message: null,
    };
  }

  const nextSelected = [...selected, position];
  return {
    state: {
      ...state,
      selected: nextSelected,
      status: nextSelected.length > 0 ? 'composing' : 'initial',
    },
    effect: 'accepted',
    message: null,
  };
}

function applySubmit(state: WordOrderState, item: WordOrderItem): WordOrderResult {
  if (state.selected.length === 0) {
    return { state, effect: 'noop', message: 'no chunks selected to submit' };
  }
  // Submit is unavailable until every chunk is used exactly once.
  if (state.selected.length !== item.chunks.length) {
    return { state, effect: 'noop', message: 'submit is unavailable until every chunk is used' };
  }

  const given = state.selected.map((shownPosition) => item.shownOrder[shownPosition]);
  const isCorrect = given.every((value, index) => value === item.canonicalOrder[index]);

  return {
    state: {
      ...state,
      status: 'submitted',
      attemptCount: state.attemptCount + 1,
      lastCorrect: isCorrect,
    },
    effect: isCorrect ? 'correct' : 'incorrect',
    message: isCorrect ? '正解です' : '並べ替えが違います',
  };
}

function applyRetry(state: WordOrderState): WordOrderResult {
  if (state.status !== 'submitted') {
    return { state, effect: 'noop', message: 'nothing to retry' };
  }
  // Retry resets only the current item's selection; order and other items
  // are untouched.
  return {
    state: { ...state, status: 'composing', selected: [], lastCorrect: null },
    effect: 'accepted',
    message: null,
  };
}

function applyNext(state: WordOrderState): WordOrderResult {
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
        selected: [],
        lastCorrect: null,
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
      selected: [],
      lastCorrect: null,
    },
    effect: 'accepted',
    message: null,
  };
}
