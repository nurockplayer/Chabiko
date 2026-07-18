import { ProgressStore, type StorageLike } from './progress';

export interface ProgressSnapshot {
  completedCount: number;
  totalCount: number;
  /** Human-readable summary string, Japanese-first. Empty string when nothing completed. */
  summaryText: string;
}

/**
 * Build a progress snapshot for the home page, scoped to completable lessons only.
 *
 * The denominator excludes lessons that have no completion path
 * (e.g. draft content without usable practice), so the progress
 * bar can always reach 100 %.
 *
 * @param store — ProgressStore instance (real or mock-backed)
 * @param completableLessonIds — lesson IDs that have a usable practice path
 */
export function buildProgressSnapshot(
  store: ProgressStore,
  completableLessonIds: string[],
): ProgressSnapshot {
  let completedCount = 0;
  for (const id of completableLessonIds) {
    if (store.isComplete(id)) completedCount++;
  }
  const totalCount = completableLessonIds.length;
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
  completableLessonIds: string[],
  storage?: StorageLike | null,
): ProgressSnapshot {
  const store = new ProgressStore(storage);
  return buildProgressSnapshot(store, completableLessonIds);
}
