import type { BasicVocabularySyncStatus } from './basicVocabularySyncRuntime';
import type { BasicVocabularyProgressCoordinator } from './basicVocabularyProgressCoordinator';

// ─── Exact learner-facing strings (Issue #293) ─────────────────────────────────

/** Signed-in user runtime: nothing dirty/queued and no reset pending. */
export const SYNC_STATUS_SAVED = '端末に保存済み';
/** Signed-in user runtime: a sync is actively in flight. */
export const SYNC_STATUS_SYNCING = '同期中…';
/** Signed-in user runtime: the last sync completed successfully. */
export const SYNC_STATUS_SYNCED = '同期済み';
/** Signed-in user runtime: no repository or currently offline. */
export const SYNC_STATUS_OFFLINE = 'オフラインで保存中';
/** Signed-in user runtime: a sync attempt failed. */
export const SYNC_STATUS_ERROR = '同期できませんでした。端末には保存されています';

const STATUS_TEXT: Readonly<Record<BasicVocabularySyncStatus, string>> = {
  guest: '',
  idle: SYNC_STATUS_SAVED,
  syncing: SYNC_STATUS_SYNCING,
  synced: SYNC_STATUS_SYNCED,
  offline: SYNC_STATUS_OFFLINE,
  error: SYNC_STATUS_ERROR,
};

/** True only for statuses that have a visible signed-in sync text. */
function hasSyncText(status: BasicVocabularySyncStatus): boolean {
  return status !== 'guest';
}

/**
 * The sync-status adapter (Issue #293).
 *
 * Maps the coordinator runtime's controlled snapshot to the exact learner-facing
 * sync strings and writes them into the account component's single polite
 * status region. Only a signed-in user scope ever writes: guest/loading states
 * leave the account's own status text untouched (no clobbering). Repeated
 * identical states never re-announce (the live region is only touched when the
 * text actually changes). No UUID, raw error, token, or session data is ever
 * written to the DOM. The adapter owns no listeners: the account component
 * re-renders on auth-state changes and the coordinator drives the runtime
 * snapshots.
 *
 * @param coordinator the document-level progress coordinator.
 * @param statusElement the account component's `[data-basic-vocabulary-account-status]`.
 * @returns a cleanup that unsubscribes from the coordinator.
 */
export function bindBasicVocabularySyncStatus(
  coordinator: BasicVocabularyProgressCoordinator,
  statusElement: HTMLElement,
): () => void {
  let lastWritten: string | null = null;

  function render(): void {
    const snapshot = coordinator.getSnapshot();
    // Signed-in user scope only. Guest/loading/unavailable keep the account's
    // own status text, so the polite region always shows exactly one truthful
    // message at a time. Leaving the user scope resets the write cache so a
    // later re-entry re-renders once (the account has since rewritten the
    // region with its own label).
    if (snapshot.scope !== 'user' || !hasSyncText(snapshot.status)) {
      lastWritten = null;
      return;
    }
    const text = STATUS_TEXT[snapshot.status];
    // Repeated identical states never re-announce.
    if (text === lastWritten) return;
    lastWritten = text;
    statusElement.textContent = text;
  }

  render();
  const unsubscribe = coordinator.subscribe(render);
  return () => {
    unsubscribe();
  };
}
