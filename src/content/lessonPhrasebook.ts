import {
  groupPhrasebookByScenario,
  loadEligiblePhrasebook,
  type PhrasebookScenario,
} from './loadPhrasebook';

/**
 * The set of phrasebook scenarios that currently have learner-visible eligible
 * content — determined exactly as the `/phrasebook/` route does (Issue #236):
 * `loadEligiblePhrasebook()` (record-level `reviewed`/`published` review status
 * AND authored/verified script forms) grouped by scenario, keeping only
 * scenarios with eligible phrases or an eligible dialog.
 *
 * This is the production-eligibility contract behind the lesson → phrasebook
 * related link (Issue #239): a lesson is linked ONLY to a scenario that has
 * real learner-visible phrasebook content. A scenario whose content is only
 * draft/pending is never linked. Fail-closed: the underlying loader throws on
 * a missing/invalid corpus rather than silently producing an empty set.
 */
export function loadProductionPhrasebookScenarios(
  phraseFilePath?: string,
  dialogFilePath?: string,
): ReadonlySet<string> {
  return new Set<string>(
    groupPhrasebookByScenario(
      loadEligiblePhrasebook(phraseFilePath, dialogFilePath),
    )
      .filter((group) => group.phrases.length > 0 || group.dialog !== null)
      .map((group) => group.scenario),
  );
}

/**
 * The single related-phrasebook destination for a lesson, or `null` when the
 * lesson has no `travelScenario`, an unknown value, or a scenario without
 * production-eligible phrasebook content. Deterministic and fail-closed: never
 * fabricates a destination and never links to draft/pending-only content.
 */
export function lessonPhrasebookDestination(
  travelScenario: string | undefined,
  productionScenarios: ReadonlySet<string>,
): PhrasebookScenario | null {
  if (
    typeof travelScenario !== 'string' ||
    !productionScenarios.has(travelScenario)
  ) {
    return null;
  }
  return travelScenario as PhrasebookScenario;
}
