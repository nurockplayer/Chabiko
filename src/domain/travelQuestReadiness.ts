import type {
  TravelQuestEvidenceSpec,
  TravelQuestReadinessDocument,
  TravelQuestReadinessInput,
  TravelQuestTargetReadiness,
} from '../types/travelQuestReadiness';

import readinessData from '../../data/travel-quest-readiness.json';

/** Canonical evidence key format: `${type}:${id}`. */
export function evidenceKey(spec: TravelQuestEvidenceSpec): string {
  return `${spec.type}:${spec.id}`;
}

/** Round 0–100 to the nearest integer; clamps out-of-range percentages. */
export function percent(
  numerator: number,
  denominator: number,
): number {
  if (denominator <= 0) return 0;
  const value = Math.round((numerator / denominator) * 100);
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Evaluate a single readiness target.
 *
 * The denominator is the fixed, repository-controlled required-evidence count
 * declared in `data/travel-quest-readiness.json`; it never shrinks. Missing,
 * duplicate, stale, malformed, or unavailable evidence counts as incomplete
 * and cannot inflate readiness. `ready` requires every declared required
 * evidence item to be present in `input.completed`.
 *
 * Pure and deterministic: identical document and input produce deeply equal
 * results, and repeated calls return equal results.
 */
export function evaluateTargetReadiness(
  target: { readonly id: string; readonly evidence: readonly TravelQuestEvidenceSpec[] },
  input: TravelQuestReadinessInput,
): TravelQuestTargetReadiness {
  const denominator = target.evidence.length;

  let numerator = 0;
  const unavailableEvidence: string[] = [];
  const unavailableSeen = new Set<string>();

  for (const spec of target.evidence) {
    const key = evidenceKey(spec);
    if (input.completed.has(key)) {
      numerator += 1;
      continue;
    }
    if (input.unavailable.has(key) && !unavailableSeen.has(key)) {
      unavailableSeen.add(key);
      unavailableEvidence.push(key);
    }
  }

  const status =
    numerator === denominator && denominator > 0
      ? ('ready' as const)
      : numerator > 0
        ? ('in-progress' as const)
        : ('not-started' as const);

  return {
    targetId: target.id,
    numerator,
    denominator,
    percentage: percent(numerator, denominator),
    unavailableEvidence,
    status,
  };
}

/**
 * Evaluate every target in the canonical readiness document.
 *
 * Results are ordered exactly as declared in
 * `data/travel-quest-readiness.json`. Pure and deterministic: identical
 * input always produces identical results.
 */
export function evaluateTravelQuestReadiness(
  input: TravelQuestReadinessInput,
): readonly TravelQuestTargetReadiness[] {
  const document = readinessData as TravelQuestReadinessDocument;
  return document.targets.map((target) =>
    evaluateTargetReadiness(target, input),
  );
}
