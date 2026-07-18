import { ProgressStore, type StorageLike } from './progress';

/**
 * Build a snapshot of the current progress state from a store.
 * Pure function: takes a ProgressStore and lesson IDs, returns derived display data.
 */
export function buildProgressSnapshot(
  store: ProgressStore,
  lessonIds: string[],
): { completedCount: number; totalCount: number; completed: Set<string> } {
  const completed = new Set<string>();
  for (const id of lessonIds) {
    if (store.isComplete(id)) completed.add(id);
  }
  return { completedCount: completed.size, totalCount: lessonIds.length, completed };
}

/**
 * Compute progress counts scoped to completable lessons only.
 * The home page denominator must exclude lessons that have no completion
 * path (e.g. draft content without usable practice).
 *
 * @param completedIds — lesson IDs that have been completed
 * @param completableIds — lesson IDs that have a practice path
 * @returns snapshot with completedCount and totalCount scoped to completableIds
 */
export function computeProgressSnapshot(
  completedIds: string[],
  _allLessonIds: string[],
  completableIds: string[],
): { completedCount: number; totalCount: number; completed: Set<string> } {
  const completed = new Set(completedIds);
  let totalCount = 0;
  let completedCount = 0;
  for (const id of completableIds) {
    totalCount++;
    if (completed.has(id)) completedCount++;
  }
  return { completedCount, totalCount, completed };
}

/**
 * Create a fresh snapshot by constructing a new ProgressStore with the given
 * storage backend. Defaults to the browser localStorage if omitted.
 * Use this on pageshow to read the latest storage state.
 */
export function refreshSnapshot(
  lessonIds: string[],
  storage?: StorageLike | null,
) {
  const store = new ProgressStore(storage);
  return buildProgressSnapshot(store, lessonIds);
}
