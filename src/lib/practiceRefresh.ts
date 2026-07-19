import { ProgressStore } from './progress';
import { createSession } from './practiceSession';
import type { PracticeQuestion } from './practice';
import type { PracticeSession } from './practiceSession';

export type RefreshKind = 'completed' | 'reset' | 'active';

export interface RefreshOutcome {
  session: PracticeSession;
  kind: RefreshKind;
}

/**
 * Compute the session state after a refresh (pageshow or storage event).
 *
 * - `completed`: storage shows the lesson is done → show completion UI
 * - `reset`:   session was completed but storage was cleared → start fresh
 * - `active`:  session was active and storage doesn't show completion → preserve position
 *
 * The caller is responsible for clearing any pending timer, rebuilding the
 * ProgressStore, and rendering the returned outcome.
 */
export function computeRefresh(
  store: ProgressStore,
  session: PracticeSession,
  questions: PracticeQuestion[],
): RefreshOutcome {
  if (store.isComplete(session.lessonId)) {
    return { session, kind: 'completed' };
  }
  if (session.status === 'completed') {
    return { session: createSession(questions), kind: 'reset' };
  }
  return { session, kind: 'active' };
}
