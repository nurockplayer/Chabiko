import type { LearningPathMemberRef } from '../types/learningPath';
import type {
  TravelQuestEvidenceSpec,
  TravelQuestReadinessInput,
  TravelQuestReadinessStatus,
  TravelQuestTargetSpec,
} from '../types/travelQuestReadiness';
import { evidenceKey } from './travelQuestReadiness';

/**
 * Learner progress signals derived from existing local progress stores.
 *
 * Read-only view over the existing progress keys (Issue #233). Only
 * completion-grade signals are exposed here: a completed lesson practice, or
 * a vocabulary item whose status is `learned`. Missing, duplicate, stale,
 * malformed, or unavailable evidence is never represented here, so it can
 * never inflate readiness or shrink a fixed denominator.
 */
export interface ProgressSignals {
  /** IDs of completed lesson practices (`chabiko_completed_lessons`). */
  readonly completedLessons: ReadonlySet<string>;
  /** IDs of vocabulary items currently at `learned` status, across the HSK and
   *  basic vocabulary stores (used for per-path progress summaries). */
  readonly learnedVocabulary: ReadonlySet<string>;
  /** IDs of learned basic-vocabulary items only. Readiness vocabulary-session
   *  evidence must be scored against this source-specific set so a stale
   *  cross-source `learned` entry in the HSK store can never satisfy a
   *  basic-vocabulary evidence key. */
  readonly learnedBasicVocabulary: ReadonlySet<string>;
  /** IDs of completed launch roleplay cards from
   *  `chabiko.roleplay-progress.v1`. */
  readonly completedRoleplayCards: ReadonlySet<string>;
}

/** Evidence types with no production completion source in v1. These can never
 *  count toward readiness and are reported as unavailable rather than
 *  shrinking the fixed denominator. */
const UNAVAILABLE_EVIDENCE_TYPES: ReadonlySet<TravelQuestEvidenceSpec['type']> =
  new Set(['completed-phrase-practice']);

/** Explicit projection from the exact launch roleplay card IDs to the
 * pre-existing Travel Quest evidence IDs. Airport and shopping have no
 * readiness evidence in the current contract and intentionally map nowhere. */
const ROLEPLAY_CARD_EVIDENCE_IDS: Readonly<Record<string, string>> = {
  'roleplay-transport-001': 'roleplay-transport-guide',
  'roleplay-food-001': 'roleplay-order-food',
  'roleplay-hotel-001': 'roleplay-hotel-checkin',
  'roleplay-emergency-001': 'roleplay-recover-help',
};

/**
 * Derive the readiness input for the canonical targets from progress signals.
 *
 * - `completed` contains only evidence keys resolved complete by a real
 *   production signal (a completed lesson practice, or a `learned`
 *   vocabulary item). Duplicate, stale, malformed, and missing keys are
 *   ignored.
 * - `unavailable` contains phrase-practice evidence keys, which have no
 *   production completion source in v1 and can never count toward readiness.
 *   Roleplay evidence is resolved through the exact launch-card mapping.
 * - A lesson/vocabulary evidence item that is not yet complete is neither
 *   completed nor unavailable; it stays incomplete.
 *
 * Pure and deterministic: identical targets and signals always produce
 * identical output.
 */
export function buildReadinessInput(
  targets: readonly TravelQuestTargetSpec[],
  signals: ProgressSignals,
): TravelQuestReadinessInput {
  const completed = new Set<string>();
  const unavailable = new Set<string>();
  const completedRoleplayEvidence = new Set(
    [...signals.completedRoleplayCards]
      .map((cardId) => ROLEPLAY_CARD_EVIDENCE_IDS[cardId])
      .filter((id): id is string => id !== undefined),
  );
  for (const target of targets) {
    for (const spec of target.evidence) {
      const key = evidenceKey(spec);
      const isComplete =
        (spec.type === 'completed-lesson-practice' &&
          signals.completedLessons.has(spec.id)) ||
        (spec.type === 'completed-vocabulary-session' &&
          signals.learnedBasicVocabulary.has(spec.id)) ||
        (spec.type === 'completed-roleplay-rehearsal' &&
          completedRoleplayEvidence.has(spec.id));
      if (isComplete) {
        completed.add(key);
      } else if (UNAVAILABLE_EVIDENCE_TYPES.has(spec.type)) {
        unavailable.add(key);
      }
    }
  }
  return { completed, unavailable };
}

export type LearningPathProgressState = 'empty' | 'partial' | 'complete';

export interface LearningPathProgressSummary {
  readonly completedCount: number;
  readonly totalCount: number;
  readonly state: LearningPathProgressState;
}

/** Japanese status label for the readiness domain states. */
export function readinessStatusLabel(
  status: TravelQuestReadinessStatus,
): string {
  switch (status) {
    case 'ready':
      return '準備OK';
    case 'in-progress':
      return '進行中';
    default:
      return '未開始';
  }
}

/** Japanese progress-state label for a learning path summary. */
export function pathProgressStateLabel(
  state: LearningPathProgressState,
): string {
  switch (state) {
    case 'complete':
      return '完了';
    case 'partial':
      return '進行中';
    default:
      return '未開始';
  }
}

/**
 * Summarize a learning path's member progress from the stable #229 members.
 *
 * A member is complete only when a real production signal exists: a completed
 * lesson practice, or a `learned` vocabulary item. Phrase members have no
 * production completion signal in v1 and never count as complete. Unavailable
 * and missing members keep the fixed total and never inflate progress.
 *
 * Pure and deterministic: identical members and signals always produce
 * identical output.
 */
export function summarizePathProgress(
  members: readonly LearningPathMemberRef[],
  signals: ProgressSignals,
): LearningPathProgressSummary {
  let completedCount = 0;
  for (const member of members) {
    if (member.type === 'lesson' && signals.completedLessons.has(member.id)) {
      completedCount += 1;
    } else if (
      member.type === 'vocabulary' &&
      signals.learnedVocabulary.has(member.id)
    ) {
      completedCount += 1;
    }
  }
  const totalCount = members.length;
  const state: LearningPathProgressState =
    totalCount > 0 && completedCount === totalCount
      ? 'complete'
      : completedCount > 0
        ? 'partial'
        : 'empty';
  return { completedCount, totalCount, state };
}

/**
 * IDs a basic-vocabulary path or readiness target can reference on this route:
 * the vocabulary members of every non-HSK path plus the
 * `completed-vocabulary-session` readiness evidence ids. Used by the route to
 * intersect against the production writer corpus before serializing the
 * route-local projection payload, so stale `voc-*`/`hsk-*`/unknown ids can
 * never be accepted from BasicVocabularyProgressStore.
 *
 * Pure and deterministic: identical paths and targets always produce identical
 * output.
 */
export function basicVocabularyRelevantIds(
  paths: readonly { readonly id: string; readonly members: readonly LearningPathMemberRef[] }[],
  targets: readonly TravelQuestTargetSpec[],
): string[] {
  const ids = new Set<string>();
  for (const path of paths) {
    if (path.id === 'hsk-vocabulary') continue;
    for (const member of path.members) {
      if (member.type === 'vocabulary') ids.add(member.id);
    }
  }
  for (const target of targets) {
    for (const spec of target.evidence) {
      if (spec.type === 'completed-vocabulary-session') ids.add(spec.id);
    }
  }
  return [...ids];
}
