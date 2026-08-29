import type { StorageLike } from './progress';
import {
  TAIWAN_TRAVEL_MAX_SCORE,
} from '../domain/taiwanTravelAssessment';

/** The Taiwan-assessment-only isolated storage key. This key is owned by the
 *  Taiwan Travel comprehensive test (#376) and must never become a global
 *  cross-track store/reset API. */
export const TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY =
  'chabiko.taiwan-travel-assessment.v2';

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
 * - nothing is written before a full 24-question attempt completes;
 * - a completed attempt writes at most once (caller transitions to completed
 *   exactly once and calls {@link recordCompletedAttempt} once);
 * - stored bestScore is max(previousBest, completedScore), bounded 0–24;
 * - V1, malformed, unknown-version, or unavailable storage falls back safely
 *   without touching lesson progress; V1 is never migrated or compared;
 * - restart does not erase the best score (restart never calls the store).
 */
export class TaiwanTravelAssessmentStore {
  private readonly storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.storage = storage !== undefined ? storage : getDefaultStorage();
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
