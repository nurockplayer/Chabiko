/**
 * Pure, deterministic Taiwan Travel comprehensive test domain (#376).
 *
 * The 台湾旅行 総合テスト is a frozen 10-question track-level assessment: exactly
 * one question per production lesson lesson-001 … lesson-010, in lesson order.
 * Each question is derived ONLY from that lesson's existing production
 * `reviewPrompts` — no parallel question bank and no invented curriculum. The
 * module has no DOM, storage, timer, random, date, or network dependency:
 * identical inputs always produce deeply equal questions and states.
 *
 * Question-selection rule: the first usable review prompt in source order is
 * chosen per lesson. "Usable" reuses the lesson practice contract (non-empty
 * prompt/answer plus at least one effective, distinct distractor). If a lesson
 * is missing or has no usable prompt, the builder fails closed by throwing
 * rather than substituting invented content.
 *
 * Choice ordering is deterministic and is only changeable through an injectable
 * `ChoiceOrdering` seam, so tests can reproduce any order without randomness.
 *
 * State machine: answering → revealed (correct/incorrect) → next → … →
 * completed → restart. Restart creates a fresh session and never touches
 * lesson/practice completion.
 */

import type { Lesson, ReviewPrompt } from '../types/lesson';

// ─── Frozen coverage contract ───────────────────────────────────────────────

/** The frozen number of questions in one assessment run. */
export const TAIWAN_TRAVEL_QUIZ_LENGTH = 10;

/** The ten production lesson ids, in delivery order (lesson-001 … lesson-010). */
export const TAIWAN_TRAVEL_LESSON_IDS: readonly string[] = Array.from(
  { length: TAIWAN_TRAVEL_QUIZ_LENGTH },
  (_, index) => `lesson-${String(index + 1).padStart(3, '0')}`,
);

/** A completed score is bounded to the quiz length (0–10). */
export const TAIWAN_TRAVEL_MAX_SCORE = TAIWAN_TRAVEL_QUIZ_LENGTH;

// ─── Question types ─────────────────────────────────────────────────────────

export interface TaiwanTravelQuestion {
  readonly lessonId: string;
  readonly promptJa: string;
  /** The source reviewPrompt's answer; revealed only after commitment. */
  readonly answerJa: string;
  /** The source answer plus that prompt's existing distinct distractors, in
   *  deterministic order. Never fabricated to force a fixed option count. */
  readonly options: readonly string[];
  /** Index into `options` of the correct answer. */
  readonly correctIndex: number;
  /** Index of the selected source reviewPrompt within the lesson, so the
   *  question is provably source-traceable back to production content. */
  readonly sourcePromptIndex: number;
}

/** Injectable deterministic option-ordering seam. */
export type ChoiceOrdering = (
  values: readonly string[],
  seed: string,
) => readonly string[];

// ─── Usability / deterministic selection ────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** A review prompt is usable when it has a non-empty prompt and answer and at
 *  least one effective distinct distractor (the lesson practice contract). */
export function isUsableReviewPrompt(prompt: unknown): prompt is ReviewPrompt {
  if (!prompt || typeof prompt !== 'object') return false;
  const candidate = prompt as Record<string, unknown>;
  if (!isNonEmptyString(candidate.promptJa) || !isNonEmptyString(candidate.answerJa)) {
    return false;
  }
  if (!Array.isArray(candidate.distractorsJa)) return false;
  const answer = (candidate.answerJa as string).trim();
  return candidate.distractorsJa.some(
    (distractor) =>
      isNonEmptyString(distractor) && (distractor as string).trim() !== answer,
  );
}

/** The first usable review prompt in source order, or null. */
export function firstUsableReviewPrompt(lesson: Lesson): ReviewPrompt | null {
  return (
    lesson.reviewPrompts.find(isUsableReviewPrompt) ?? null
  );
}

// ─── Deterministic shuffle (FNV-1a, matching src/lib/practice.ts) ───────────

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Content-derived deterministic reorder: identical values + seed always yield
 *  the same order, with a source-order tie-break. Never random. */
function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
  return [...values]
    .map((value, index) => ({
      value,
      index,
      rank: hashString(`${seed}\u0000${String(value)}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ value }) => value);
}

/** The default ordering seam used in production. */
export function defaultTaiwanTravelChoiceOrdering(
  values: readonly string[],
  seed: string,
): readonly string[] {
  return deterministicShuffle(values, seed);
}

// ─── Question construction ──────────────────────────────────────────────────

function distinctSourceDistractors(prompt: ReviewPrompt, answer: string): string[] {
  const raw = Array.isArray(prompt.distractorsJa) ? prompt.distractorsJa : [];
  const distinct: string[] = [];
  for (const distractor of raw) {
    if (!isNonEmptyString(distractor)) continue;
    const trimmed = distractor.trim();
    if (trimmed === answer) continue;
    if (distinct.includes(trimmed)) continue;
    distinct.push(trimmed);
  }
  return distinct;
}

/** Build one source-traceable question from a lesson's selected prompt. The
 *  options are exactly the source answer plus that prompt's existing distinct
 *  distractors, reordered through the injectable seam. */
export function buildTaiwanTravelQuestion(
  lesson: Lesson,
  promptIndex: number,
  ordering: ChoiceOrdering = defaultTaiwanTravelChoiceOrdering,
): TaiwanTravelQuestion {
  const prompt = lesson.reviewPrompts[promptIndex];
  const answer = prompt.answerJa.trim();
  const distractors = distinctSourceDistractors(prompt, answer);
  const options = ordering(
    [answer, ...distractors],
    `${lesson.id}\u0000${prompt.promptJa.trim()}`,
  );
  return {
    lessonId: lesson.id,
    promptJa: prompt.promptJa.trim(),
    answerJa: answer,
    options,
    correctIndex: options.indexOf(answer),
    sourcePromptIndex: promptIndex,
  };
}

/**
 * Build the frozen 10-question assessment in lesson order. Fails closed when a
 * required lesson is missing or lacks a usable review prompt: it throws instead
 * of silently substituting invented content.
 */
export function buildTaiwanTravelQuestions(
  lessons: readonly Lesson[],
  ordering: ChoiceOrdering = defaultTaiwanTravelChoiceOrdering,
): TaiwanTravelQuestion[] {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const questions: TaiwanTravelQuestion[] = [];
  for (const lessonId of TAIWAN_TRAVEL_LESSON_IDS) {
    const lesson = byId.get(lessonId);
    if (!lesson) {
      throw new RangeError(
        `Taiwan Travel assessment requires lesson '${lessonId}' but it is missing from the source`,
      );
    }
    const promptIndex = lesson.reviewPrompts.findIndex(isUsableReviewPrompt);
    if (promptIndex === -1) {
      throw new RangeError(
        `Taiwan Travel assessment requires a usable review prompt in lesson '${lessonId}' but none exists`,
      );
    }
    questions.push(buildTaiwanTravelQuestion(lesson, promptIndex, ordering));
  }
  return questions;
}

// ─── Session state machine ──────────────────────────────────────────────────

export type TaiwanTravelQuizPhase = 'answering' | 'revealed' | 'completed';

export interface TaiwanTravelQuizState {
  readonly status: TaiwanTravelQuizPhase;
  readonly questions: readonly TaiwanTravelQuestion[];
  readonly currentIndex: number;
  /** Selected option index, or null when nothing is selected. */
  readonly selected: number | null;
  /** Running count of correct submissions (the score). */
  readonly correctCount: number;
  /** Running count of submitted questions (the progress denominator). */
  readonly answeredCount: number;
  /** True after a correct submit, false after an incorrect one, null between. */
  readonly lastCorrect: boolean | null;
}

export type TaiwanTravelQuizAction =
  | { readonly kind: 'select'; readonly index: number }
  | { readonly kind: 'submit' }
  | { readonly kind: 'next' }
  | { readonly kind: 'restart' };

export interface TaiwanTravelQuizResult {
  readonly state: TaiwanTravelQuizState;
  /** 'noop' for rejected, duplicate, or out-of-order actions. */
  readonly effect: 'noop' | 'accepted' | 'correct' | 'incorrect';
  readonly message: string | null;
}

export function createTaiwanTravelQuizSession(
  questions: readonly TaiwanTravelQuestion[],
): TaiwanTravelQuizState {
  if (questions.length === 0) {
    throw new RangeError('Taiwan Travel assessment requires at least one question');
  }
  return {
    status: 'answering',
    questions,
    currentIndex: 0,
    selected: null,
    correctCount: 0,
    answeredCount: 0,
    lastCorrect: null,
  };
}

/** The bounded 0–10 score of a completed attempt, or null while incomplete. */
export function scoreOfCompletedAttempt(
  state: TaiwanTravelQuizState,
): number | null {
  return state.status === 'completed' ? state.correctCount : null;
}

export function applyTaiwanTravelQuizAction(
  state: TaiwanTravelQuizState,
  action: TaiwanTravelQuizAction,
): TaiwanTravelQuizResult {
  if (state.status === 'completed') {
    if (action.kind === 'restart') {
      return {
        state: createTaiwanTravelQuizSession(state.questions),
        effect: 'accepted',
        message: null,
      };
    }
    return { state, effect: 'noop', message: 'assessment already completed' };
  }

  switch (action.kind) {
    case 'select':
      return applySelect(state, action.index);
    case 'submit':
      return applySubmit(state);
    case 'next':
      return applyNext(state);
    case 'restart':
      return {
        state: createTaiwanTravelQuizSession(state.questions),
        effect: 'accepted',
        message: null,
      };
  }
}

function applySelect(
  state: TaiwanTravelQuizState,
  index: number,
): TaiwanTravelQuizResult {
  // Selection is locked after submit until the next question.
  if (state.status === 'revealed') {
    return { state, effect: 'noop', message: 'selection locked after submit' };
  }
  const optionCount = state.questions[state.currentIndex].options.length;
  if (!Number.isInteger(index) || index < 0 || index >= optionCount) {
    return { state, effect: 'noop', message: 'unknown option index' };
  }
  if (state.selected === index) {
    return { state, effect: 'noop', message: 'option already selected' };
  }
  return {
    state: { ...state, selected: index },
    effect: 'accepted',
    message: null,
  };
}

function applySubmit(state: TaiwanTravelQuizState): TaiwanTravelQuizResult {
  if (state.status === 'revealed') {
    return { state, effect: 'noop', message: 'already submitted' };
  }
  if (state.selected === null) {
    return { state, effect: 'noop', message: 'no option selected to submit' };
  }
  const question = state.questions[state.currentIndex];
  const isCorrect = state.selected === question.correctIndex;
  return {
    state: {
      ...state,
      status: 'revealed',
      lastCorrect: isCorrect,
      correctCount: state.correctCount + (isCorrect ? 1 : 0),
      answeredCount: state.answeredCount + 1,
    },
    effect: isCorrect ? 'correct' : 'incorrect',
    message: isCorrect ? '正解です' : '不正解です',
  };
}

function applyNext(state: TaiwanTravelQuizState): TaiwanTravelQuizResult {
  if (state.status !== 'revealed') {
    return { state, effect: 'noop', message: 'next requires a submitted answer' };
  }
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.questions.length) {
    return {
      state: {
        ...state,
        status: 'completed',
        currentIndex: nextIndex,
        selected: null,
        lastCorrect: null,
      },
      effect: 'accepted',
      message: 'テスト完了',
    };
  }
  return {
    state: {
      ...state,
      status: 'answering',
      currentIndex: nextIndex,
      selected: null,
      lastCorrect: null,
    },
    effect: 'accepted',
    message: null,
  };
}
