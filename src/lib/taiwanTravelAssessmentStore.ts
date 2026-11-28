import type { StorageLike } from './progress';
import {
  applyTaiwanTravelQuizAction,
  createTaiwanTravelQuizSession,
  taiwanTravelQuizRoster,
  TAIWAN_TRAVEL_MAX_SCORE,
  type TaiwanTravelQuestion,
  type TaiwanTravelQuizState,
} from '../domain/taiwanTravelAssessment';

/** The Taiwan-assessment-only isolated storage key. This key is owned by the
 *  Taiwan Travel comprehensive test (#376) and must never become a global
 *  cross-track store/reset API. */
export const TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY =
  'chabiko.taiwan-travel-assessment.v2';

export const TAIWAN_TRAVEL_QUIZ_ATTEMPT_KEY =
  'chabiko.taiwan-travel-quiz-attempt.v1';

/** Retained only as a documented compatibility boundary: V1 evidence is not
 * comparable with the 24-question assessment and is intentionally ignored. */
export const TAIWAN_TRAVEL_ASSESSMENT_LEGACY_STORAGE_KEY =
  'chabiko.taiwan-travel-assessment.v1';

/** Current document version for the isolated assessment evidence. */
export const TAIWAN_TRAVEL_ASSESSMENT_VERSION = 2;

/** Minimal persisted document: version + best score only. */
export interface TaiwanTravelAssessmentDocument {
  readonly version: 2;
  readonly bestScore: number;
}

/** Bounds an arbitrary value to a valid 0–24 integer score. Non-integers and
 *  non-numbers normalize to 0 (safe fallback), never to a fabricated value. */
export function normalizeBestScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  return Math.max(0, Math.min(TAIWAN_TRAVEL_MAX_SCORE, value));
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__chabiko_taiwan_travel_assessment_probe__';
      const previous = localStorage.getItem(probe);
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      if (previous !== null) localStorage.setItem(probe, previous);
      return localStorage;
    }
  } catch {
    /* localStorage unavailable (SSR, private browsing, etc.) */
  }
  return null;
}

/**
 * Isolated Taiwan Travel assessment evidence store.
 *
 * Rules (frozen V2 contract):
 * - the evidence key is written only after a full 24-question attempt;
 * - a completed attempt writes at most once (caller transitions to completed
 *   exactly once and calls {@link recordCompletedAttempt} once);
 * - stored bestScore is max(previousBest, completedScore), bounded 0–24;
 * - V1, malformed, unknown-version, or unavailable storage falls back safely
 *   without touching lesson progress; V1 is never migrated or compared;
 * - active attempts use their own key, and restart only clears that key.
 */
export class TaiwanTravelAssessmentStore {
  private readonly storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.storage = storage !== undefined ? storage : getDefaultStorage();
  }

  saveAttempt(state: TaiwanTravelQuizState): void {
    try {
      this.storage?.setItem(TAIWAN_TRAVEL_QUIZ_ATTEMPT_KEY, JSON.stringify({
        roster: taiwanTravelQuizRoster(state.questions),
        answers: state.answers,
        status: state.status,
        selected: state.selected,
      }));
    } catch {
      /* Continue the attempt in memory when storage is unavailable. */
    }
  }

  restoreAttempt(questions: readonly TaiwanTravelQuestion[]): TaiwanTravelQuizState | null {
    let raw: string | null | undefined;
    try {
      raw = this.storage?.getItem(TAIWAN_TRAVEL_QUIZ_ATTEMPT_KEY);
    } catch {
      return null;
    }
    if (raw == null) return null;

    let saved: unknown;
    try {
      saved = JSON.parse(raw);
    } catch {
      this.clearAttempt();
      return null;
    }
    const state = restoreAttempt(saved, questions);
    if (state === null) this.clearAttempt();
    return state;
  }

  clearAttempt(): void {
    try {
      this.storage?.removeItem(TAIWAN_TRAVEL_QUIZ_ATTEMPT_KEY);
    } catch {
      /* Storage is unavailable. */
    }
  }

  /** The validated best score (0 when absent, malformed, or unavailable). */
  readBestScore(): number {
    const document = this.readDocument();
    return document === null ? 0 : normalizeBestScore(document.bestScore);
  }

  /** Whether at least one completed attempt has been recorded. */
  hasCompletedAttempt(): boolean {
    return this.readDocument() !== null;
  }

  /**
   * Record a completed attempt's score. `bestScore` is max(previousBest,
   * score) bounded to 0–24 and persisted once. Returns the new best score and
   * whether a write actually happened (a write can fail when storage is full
   * or unavailable, which is a safe no-op).
   */
  recordCompletedAttempt(
    score: number,
  ): { readonly bestScore: number; readonly wrote: boolean } {
    const bestScore = Math.max(this.readBestScore(), normalizeBestScore(score));
    if (this.storage === null) {
      // Unavailable storage: keep the in-memory best score, no write possible.
      return { bestScore, wrote: false };
    }
    const document: TaiwanTravelAssessmentDocument = {
      version: TAIWAN_TRAVEL_ASSESSMENT_VERSION,
      bestScore,
    };
    try {
      this.storage.setItem(
        TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY,
        JSON.stringify(document),
      );
      return { bestScore, wrote: true };
    } catch {
      return { bestScore, wrote: false };
    }
  }

  private readDocument(): TaiwanTravelAssessmentDocument | null {
    try {
      const raw = this.storage?.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY);
      if (typeof raw !== 'string') return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        (parsed as Record<string, unknown>).version !== TAIWAN_TRAVEL_ASSESSMENT_VERSION
      ) {
        // Malformed or unknown version → safe fallback.
        return null;
      }
      const bestScore = (parsed as Record<string, unknown>).bestScore;
      if (
        typeof bestScore !== 'number' ||
        !Number.isFinite(bestScore) ||
        !Number.isInteger(bestScore) ||
        bestScore < 0 ||
        bestScore > TAIWAN_TRAVEL_MAX_SCORE
      ) {
        return null;
      }
      return { version: TAIWAN_TRAVEL_ASSESSMENT_VERSION, bestScore };
    } catch {
      return null;
    }
  }
}

function restoreAttempt(
  saved: unknown,
  questions: readonly TaiwanTravelQuestion[],
): TaiwanTravelQuizState | null {
  if (saved === null || typeof saved !== 'object') return null;
  const { roster, answers, status, selected } = saved as Record<string, unknown>;
  if (
    roster !== taiwanTravelQuizRoster(questions) ||
    !Array.isArray(answers) ||
    answers.length > questions.length ||
    (status !== 'answering' && status !== 'revealed') ||
    (status === 'revealed' && (answers.length === 0 || selected !== answers.at(-1)))
  ) return null;

  let state = createTaiwanTravelQuizSession(questions);
  for (let index = 0; index < answers.length; index++) {
    const pick: unknown = answers[index];
    if (typeof pick !== 'number') return null;
    const selection = applyTaiwanTravelQuizAction(state, { kind: 'select', index: pick });
    if (selection.effect !== 'accepted') return null;
    state = applyTaiwanTravelQuizAction(selection.state, { kind: 'submit' }).state;
    if (status === 'revealed' && index === answers.length - 1) return state;
    state = applyTaiwanTravelQuizAction(state, { kind: 'next' }).state;
  }

  if (state.status === 'completed') return null;
  if (selected === null) return state;
  if (typeof selected !== 'number') return null;
  const selection = applyTaiwanTravelQuizAction(state, { kind: 'select', index: selected });
  return selection.effect === 'accepted' ? selection.state : null;
}

/** Read-only result-evidence adapter for #372/#373-compatible follow-up. It
 *  consumes `attempted + bestScore` without rewriting lesson progress. */
export interface TaiwanTravelAssessmentEvidence {
  readonly attempted: boolean;
  readonly bestScore: number;
}

/** Read-only projection over the isolated evidence document. Never writes and
 *  never touches lesson progress. */
export function readTaiwanTravelAssessmentEvidence(
  storage?: StorageLike | null,
): TaiwanTravelAssessmentEvidence {
  const store = new TaiwanTravelAssessmentStore(storage);
  return {
    attempted: store.hasCompletedAttempt(),
    bestScore: store.readBestScore(),
  };
}
