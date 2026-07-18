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
