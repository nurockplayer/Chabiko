import type { PracticeQuestion } from './practice';
import { ProgressStore } from './progress';

export interface SessionSnapshot {
  completed: Set<string>;
  currentQuestion: PracticeQuestion | null;
  questionCount: number;
  progressText: string;
}

/**
 * Build a snapshot of the current progress state from storage.
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
 * Create a fresh snapshot by constructing a new ProgressStore.
 * Use this on pageshow to read the latest localStorage state.
 */
export function refreshSnapshot(lessonIds: string[]) {
  const store = new ProgressStore();
  return buildProgressSnapshot(store, lessonIds);
}
