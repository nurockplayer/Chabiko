import { ProgressStore, STORAGE_KEY, type StorageLike } from './progress';
import { isRelevantStorageEvent } from './storage';

/**
 * Handle a Window storage event for cross-tab progress synchronisation.
 * Calls `onProgressChange` when the event targets the Chabiko progress key
 * or when all storage is cleared (key === null).
 */
export function handleProgressStorageEvent(
  event: StorageEvent,
  onProgressChange: () => void,
): void {
  if (isRelevantStorageEvent(event, STORAGE_KEY)) {
    onProgressChange();
  }
}

export interface ProgressSnapshot {
  completedCount: number;
  totalCount: number;
  /** Human-readable summary string, Japanese-first. Empty string when nothing completed. */
  summaryText: string;
}

export interface LessonProgressEntry {
  id: string;
  completable: boolean;
}

/**
 * Build a progress snapshot for the home page.
 *
 * Only completable lessons (those with a usable practice path) are counted
 * in the denominator, so the progress bar can always reach 100 %.
 *
 * @param store — ProgressStore instance (real or mock-backed)
 * @param lessons — all renderable lessons with their completable status
 */
export function buildProgressSnapshot(
  store: ProgressStore,
  lessons: LessonProgressEntry[],
): ProgressSnapshot {
  let completedCount = 0;
  let totalCount = 0;
  for (const { id, completable } of lessons) {
    if (!completable) continue;
    totalCount++;
    if (store.isComplete(id)) completedCount++;
  }
  const summaryText =
    completedCount > 0
      ? `${completedCount} / ${totalCount} レッスン完了`
      : '';
  return { completedCount, totalCount, summaryText };
}

/**
 * Refresh snapshot by constructing a new ProgressStore with the given
 * storage backend. Defaults to browser localStorage if omitted.
 */
export function refreshSnapshot(
  lessons: LessonProgressEntry[],
  storage?: StorageLike | null,
): ProgressSnapshot {
  const store = new ProgressStore(storage);
  return buildProgressSnapshot(store, lessons);
}
