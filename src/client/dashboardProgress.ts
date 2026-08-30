import { ProgressStore, STORAGE_KEY, type StorageLike } from '../lib/progress';
import { RoleplayProgressStore } from '../lib/roleplayProgress';
import type { BasicVocabularyProgressCoordinator } from './basicVocabularyProgressCoordinator';
import { ensureBasicVocabularyProgressCoordinator } from './basicVocabularyProgressCoordinator';
import { createCrossTrackProgressCoordinator } from './crossTrackProgressCoordinator';
import type { CrossTrackProgressSnapshot } from '../domain/crossTrackProgress';
import type { DashboardProgressPayload } from '../domain/dashboardProgress';
import {
  DASHBOARD_TRACK_ORDER,
  DASHBOARD_TRACK_LABELS,
  deriveContinuation,
  trackCardStatusKey,
  trackCardStatusLabel,
  trackDestinationHref,
  trackSummaryText,
  unlockedAchievements,
  type DashboardContinuation,
} from '../domain/dashboardProgress';

// ─── Dashboard client (Issue #374) ────────────────────────────────────────────
//
// Hydrates the server-rendered Dashboard shell from the #372 cross-track
// snapshot. Owns exactly one cross-track coordinator over explicitly injected
// reference corpora (the build-time payload), subscribes to it, and re-renders
// the continuation, three track cards, and unlocked achievements on every
// snapshot transition. It never writes a persistence key itself; the only write
// is the preserved existing reset control (clears the Taiwan lesson and
// roleplay completion stores covered by its learner-facing "all progress"
// label).

export interface DashboardInitOptions {
  /** Inject the #293 coordinator (tests use a fake). Defaults to the
   *  document-level coordinator, which resolves the active guest/user scope. */
  readonly basicVocabulary?: BasicVocabularyProgressCoordinator;
  /** Inject the storage backend (tests use a recording/seed store). Defaults
   *  to the browser localStorage via {@link safeLocalStorage}. */
  readonly storage?: StorageLike | null;
}

/** Safe localStorage accessor: a SecurityError from the getter (privacy /
 *  sandbox policy) falls back to null, mirroring the progress-store handling. */
export function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Initialize the Dashboard over a root element and the build-time payload.
 * Returns a cleanup that unsubscribes and disposes the cross-track coordinator.
 */
export function initDashboard(
  root: HTMLElement,
  payload: DashboardProgressPayload,
  options: DashboardInitOptions = {},
): () => void {
  const storage =
    options.storage !== undefined ? options.storage : safeLocalStorage();
  const basicVocabulary =
    options.basicVocabulary ?? ensureBasicVocabularyProgressCoordinator();
  const coordinator = createCrossTrackProgressCoordinator({
    storage,
    basicVocabulary,
    basicVocabularyCorpusIds: new Set(payload.basicVocabularyCorpusIds),
    hskLevels: payload.hskLevels,
    taiwanCompletableLessonIds: payload.taiwanCompletableLessonIds,
  });

  const readCompletedLessonIds = (): ReadonlySet<string> =>
    new Set(new ProgressStore(storage).getCompletedIds());

  const render = (snapshot: CrossTrackProgressSnapshot): void => {
    const completedLessonIds = readCompletedLessonIds();
    const continuation = deriveContinuation(
      snapshot,
      payload,
      completedLessonIds,
    );
    renderContinuation(root, continuation);
    renderTracks(root, snapshot, payload, completedLessonIds);
    renderAchievements(root, snapshot);
  };

  // Preserved reset behavior: clears the Taiwan lesson progress store plus the
  // roleplay completion store. The synthetic storage event
  // tells the cross-track coordinator (which listens for exactly this key) to
  // recompute and notify subscribers, exactly like a cross-tab clear.
  const resetBtn = root.querySelector<HTMLButtonElement>('#reset-progress-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (
        window.confirm('学習進捗をすべてリセットしますか？この操作は元に戻せません。')
      ) {
        new ProgressStore(storage).resetAll();
        new RoleplayProgressStore(storage).resetAll();
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
      }
    });
  }

  const unsubscribe = coordinator.subscribe(render);

  return () => {
    unsubscribe();
    coordinator.dispose();
  };
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderContinuation(
  root: HTMLElement,
  continuation: DashboardContinuation,
): void {
  const link = root.querySelector<HTMLAnchorElement>(
    '[data-dashboard-continuation]',
  );
  const empty = root.querySelector<HTMLElement>(
    '[data-dashboard-continuation-empty]',
  );
  if (!link || !empty) return;
  if (continuation.href === null) {
    link.hidden = true;
    empty.hidden = false;
    const title = empty.querySelector<HTMLElement>(
      '[data-continuation-empty-title]',
    );
    if (title) title.textContent = continuation.title;
    return;
  }
  empty.hidden = true;
  link.hidden = false;
  link.href = continuation.href;
  const kicker = link.querySelector<HTMLElement>('[data-continuation-kicker]');
  if (kicker) {
    kicker.textContent = continuation.trackId
      ? DASHBOARD_TRACK_LABELS[continuation.trackId]
      : '';
  }
  const title = link.querySelector<HTMLElement>('[data-continuation-title]');
  if (title) title.textContent = continuation.title;
  const sentence = link.querySelector<HTMLElement>('[data-continuation-sentence]');
  if (sentence) {
    sentence.textContent = continuation.sentence ?? '';
    sentence.hidden = continuation.sentence === null;
  }
  const pinyin = link.querySelector<HTMLElement>('[data-continuation-pinyin]');
  if (pinyin) {
    pinyin.textContent = continuation.pinyin ?? '';
    pinyin.hidden = continuation.pinyin === null;
  }
  const action = link.querySelector<HTMLElement>('[data-continuation-action]');
  if (action) action.textContent = continuation.actionLabel;
}

function renderTracks(
  root: HTMLElement,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
  completedLessonIds: ReadonlySet<string>,
): void {
  for (const trackId of DASHBOARD_TRACK_ORDER) {
    const card = root.querySelector<HTMLElement>(
      `[data-dashboard-track="${trackId}"]`,
    );
    if (!card) continue;
    const summary = card.querySelector<HTMLElement>('[data-track-summary]');
    if (summary) summary.textContent = trackSummaryText(trackId, snapshot, payload);
    const status = card.querySelector<HTMLElement>('[data-track-status]');
    if (status) {
      status.dataset.status = trackCardStatusKey(trackId, snapshot, payload);
      status.textContent = trackCardStatusLabel(trackId, snapshot, payload);
    }
    const link = card instanceof HTMLAnchorElement ? card : null;
    if (link) {
      const href = trackDestinationHref(trackId, snapshot, payload, completedLessonIds);
      if (href !== null) link.href = href;
    }
  }
}

function renderAchievements(
  root: HTMLElement,
  snapshot: CrossTrackProgressSnapshot,
): void {
  const list = root.querySelector<HTMLElement>('[data-achievement-list]');
  const empty = root.querySelector<HTMLElement>('[data-achievement-empty]');
  if (!list || !empty) return;
  const unlocked = unlockedAchievements(snapshot);
  empty.hidden = unlocked.length > 0;
  const unlockedIds = new Set<string>(
    unlocked.map((evaluation) => evaluation.achievement.id),
  );
  for (const item of list.querySelectorAll<HTMLElement>('[data-achievement]')) {
    item.hidden = !unlockedIds.has(item.dataset.achievement ?? '');
  }
}
