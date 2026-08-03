/**
 * Travel Quest readiness contract types.
 *
 * This module only declares the repository-controlled readiness target contract
 * and the pure readiness calculation inputs. It performs no storage, network,
 * date, or randomness access.
 */

/**
 * Evidence that counts toward readiness when complete.
 *
 * Passive view or open never counts. Each evidence item is either a completed
 * lesson practice, a completed phrase practice, a completed roleplay rehearsal,
 * or an explicitly mapped existing vocabulary session action.
 *
 * `lessonId` and `vocabularyId` are validated against the canonical source IDs
 * on main before any code change, and the data contract is verified by tests.
 */
export type TravelQuestEvidenceType =
  | 'completed-lesson-practice'
  | 'completed-phrase-practice'
  | 'completed-roleplay-rehearsal'
  | 'completed-vocabulary-session';

export interface TravelQuestEvidenceSpec {
  readonly type: TravelQuestEvidenceType;
  /** Reference ID resolved against the matching source collection. */
  readonly id: string;
  readonly labelJa: string;
}

export interface TravelQuestTargetSpec {
  readonly id: string;
  readonly labelJa: string;
  readonly goalJa: string;
  /** Every declared required evidence must be complete for `ready`. */
  readonly evidence: readonly TravelQuestEvidenceSpec[];
}

export interface TravelQuestReadinessDocument {
  readonly schemaVersion: 1;
  readonly targets: readonly TravelQuestTargetSpec[];
}

/** Stability status returned by the readiness calculation. */
export type TravelQuestReadinessStatus =
  | 'not-started'
  | 'in-progress'
  | 'ready';

/**
 * Outcome of evaluating one target.
 *
 * - numerator: number of required evidence items that are complete
 * - denominator: the fixed, repository-controlled required-evidence count
 * - percentage: 0–100 rounded to the nearest integer
 * - unavailableEvidence: required evidence with no matching completion signal
 *   from the caller-provided inputs (cannot count toward readiness)
 * - status: `ready` only when every declared required evidence item is complete
 */
export interface TravelQuestTargetReadiness {
  readonly targetId: string;
  readonly numerator: number;
  readonly denominator: number;
  readonly percentage: number;
  readonly unavailableEvidence: readonly string[];
  readonly status: TravelQuestReadinessStatus;
}

/**
 * Caller-derived completion signals for every declared evidence item.
 *
 * Missing, duplicate, stale, malformed, or unavailable evidence is treated as
 * incomplete. The domain never reads storage directly: the caller derives these
 * signals from existing progress/readiness inputs only.
 */
export interface TravelQuestReadinessInput {
  /** Evidence keys known to be complete (format `type:id`). */
  readonly completed: ReadonlySet<string>;
  /** Evidence keys the caller could not resolve against existing progress. */
  readonly unavailable: ReadonlySet<string>;
}
