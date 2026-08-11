import { ProgressStore, STORAGE_KEY } from '../lib/progress';
import { VocabularyProgressStore } from '../domain/vocabularyProgress';
import {
  ensureBasicVocabularyProgressCoordinator,
  getBasicVocabularyProgressCoordinator,
} from './basicVocabularyProgressCoordinator';
import type { LearningPathMemberRef } from '../types/learningPath';
import type {
  TravelQuestReadinessDocument,
  TravelQuestTargetReadiness,
} from '../types/travelQuestReadiness';
import {
  buildReadinessInput,
  pathProgressStateLabel,
  readinessStatusLabel,
  summarizePathProgress,
  type ProgressSignals,
} from '../domain/pathsProgress';
import { evaluateTravelQuestReadiness } from '../domain/travelQuestReadiness';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../domain/basicVocabularyProgress';
import { VOCABULARY_PROGRESS_KEY } from '../domain/vocabularyProgress';
import readinessData from '../../data/travel-quest-readiness.json';

/**
 * Serialized per-path member references for the `/paths/` route. The route
 * emits this from the frozen #229 loader so the client never reads the data
 * file directly and always reflects the repository-controlled contract.
 */
export interface PathsProgressPayload {
  readonly paths: readonly { readonly id: string; readonly members: readonly LearningPathMemberRef[] }[];
}

const cleanups = new WeakMap<HTMLElement, () => void>();

/**
 * Read-only browser controller for the learner-facing `/paths/` route (Issue
 * #233). Reads existing lesson, HSK, and basic-vocabulary progress stores and
 * re-renders every card's path summary plus the four Travel Quest readiness
 * targets.
 *
 * - Reads existing progress only; never writes, migrates, resets, or adds a
 *   new storage key.
 * - Missing, unavailable, duplicate, stale, or malformed evidence never
 *   inflates readiness or shrinks the fixed denominator.
 * - Refreshes on `pageshow` and relevant `storage` events; cleanup removes
 *   every listener and a fresh init tears down the prior instance, so no
 *   duplicate listeners or stale callbacks accumulate.
 * - Passive viewing never counts: only completed lesson practices and
 *   `learned` vocabulary items produce progress signals.
 */
export function initPathsReadiness(
  root: HTMLElement,
  payload: PathsProgressPayload,
): () => void {
  cleanups.get(root)?.();

  const targets = (readinessData as TravelQuestReadinessDocument).targets;

  function readSignals(): ProgressSignals {
    const lessonStore = new ProgressStore();
    const completedLessons = new Set(lessonStore.getCompletedIds());
    const hskStore = new VocabularyProgressStore();
    // Ensure the document-level auth-aware coordinator exists before reading
    // (Issue #293), so a signed-in user's user-scoped basic-vocabulary progress
    // is available on direct /paths/ load. If it was already created elsewhere
    // this is a no-op. Read-only: the coordinator store is consumed, never
    // written, migrated, or reset.
    const coordinator = ensureBasicVocabularyProgressCoordinator();
    const basicStore = coordinator.getStore();
    const learnedVocabulary = new Set<string>();
    for (const [id, entry] of [
      ...Object.entries(hskStore.getAllEntries()),
      ...Object.entries(basicStore.getAllItems()),
    ]) {
      if (entry.status === 'learned') learnedVocabulary.add(id);
    }
    return { completedLessons, learnedVocabulary };
  }

  function renderAll(): void {
    const signals = readSignals();
    const results = evaluateTravelQuestReadiness(
      buildReadinessInput(targets, signals),
    );
    for (const path of payload.paths) {
      const card = root.querySelector<HTMLElement>(
        `[data-path-id="${path.id}"]`,
      );
      const progress = card?.querySelector<HTMLElement>('[data-path-progress]');
      if (!progress) continue;
      const summary = summarizePathProgress(path.members, signals);
      progress.textContent =
        summary.totalCount > 0
          ? `${summary.completedCount} / ${summary.totalCount} ${pathProgressStateLabel(summary.state)}`
          : '';
    }
    renderReadiness(results);
  }

  function renderReadiness(
    results: readonly TravelQuestTargetReadiness[],
  ): void {
    const section = root.querySelector<HTMLElement>('[data-readiness-section]');
    if (!section) return;
    for (const result of results) {
      const item = section.querySelector<HTMLElement>(
        `[data-readiness-target="${result.targetId}"]`,
      );
      if (!item) continue;
      const count = item.querySelector<HTMLElement>('[data-readiness-count]');
      if (count) count.textContent = `${result.numerator} / ${result.denominator}`;
      const percent = item.querySelector<HTMLElement>(
        '[data-readiness-percent]',
      );
      if (percent) percent.textContent = `${result.percentage}%`;
      const status = item.querySelector<HTMLElement>('[data-readiness-status]');
      if (status) {
        status.textContent = readinessStatusLabel(result.status);
        status.dataset.status = result.status;
      }
      const note = item.querySelector<HTMLElement>('[data-readiness-note]');
      if (note) note.hidden = result.unavailableEvidence.length === 0;
    }
  }

  renderAll();

  function onPageShow(): void {
    renderAll();
  }

  function onStorage(event: StorageEvent): void {
    const coordinator = getBasicVocabularyProgressCoordinator();
    const basicKey =
      coordinator !== null
        ? coordinator.getStore().getStorageKey()
        : BASIC_VOCABULARY_PROGRESS_KEY;
    if (
      event.key === null ||
      event.key === STORAGE_KEY ||
      event.key === basicKey ||
      event.key === VOCABULARY_PROGRESS_KEY
    ) {
      renderAll();
    }
  }

  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);

  const cleanup = (): void => {
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
