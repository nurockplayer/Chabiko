import type {
  CrossTrackProgressSnapshot,
  CrossTrackStatus,
} from './crossTrackProgress';
import {
  evaluateAchievements,
  type AchievementEvaluation,
} from './achievements';

// ─── Dashboard presentation domain (Issue #374) ───────────────────────────────
//
// Pure, build-safe derivation for the learner Dashboard at `/`. The Dashboard
// is a read-only projection over the #372 cross-track snapshot plus the #373
// achievement evaluator: every count comes from the snapshot, every destination
// is a real repository route, and the continuation action is derived truthfully
// from current availability/progress evidence — never fabricated.
//
// SSR renders the fresh-learner state (zero progress) from these same pure
// functions; the client re-derives from real storage. Keeping the derivation
// in one build-safe module guarantees the SSR zero-state and the hydrated state
// share identical markup and copy.

export type DashboardTrackId = 'basic-vocabulary' | 'hsk' | 'taiwan-travel';

/** The three first-class tracks, in canonical Dashboard order. */
export const DASHBOARD_TRACK_ORDER: readonly DashboardTrackId[] = [
  'basic-vocabulary',
  'hsk',
  'taiwan-travel',
];

export const DASHBOARD_TRACK_LABELS: Record<DashboardTrackId, string> = {
  'basic-vocabulary': '先生厳選単語',
  hsk: 'HSK',
  'taiwan-travel': '台湾旅行',
};

export const DASHBOARD_TRACK_DESCRIPTIONS: Record<DashboardTrackId, string> = {
  'basic-vocabulary':
    '中国語の先生が選んだ単語を、イラスト付きの短いセッションで練習します。',
  hsk: 'HSK 1級の単語をフラッシュカードで学びます。',
  'taiwan-travel':
    '台湾旅行で使える中国語を、レッスンで順番に学びます。',
};

/** One Taiwan lesson's display data, enough to render the continuation/track
 *  destination truthfully (title + core sentence + pinyin). */
export interface DashboardTrackLesson {
  readonly id: string;
  readonly titleJa: string;
  readonly coreSentence: string;
  readonly pinyin: string;
}

/** Serializable reference corpora + destination metadata injected at build
 *  time. Mirrors the `/paths/` payload pattern: the coordinator only counts
 *  ids that exist in these production corpora. */
export interface DashboardProgressPayload {
  readonly basicVocabularyCorpusIds: readonly string[];
  readonly hskLevels: readonly { readonly level: number; readonly ids: readonly string[] }[];
  readonly taiwanCompletableLessonIds: readonly string[];
  readonly taiwanLessons: readonly DashboardTrackLesson[];
}

/** The single continuation action on the Dashboard. `completed`/`unavailable`
 *  carry no destination (there is nothing truthful to continue into). */
export interface DashboardContinuation {
  readonly kind: 'continue' | 'start' | 'completed' | 'unavailable';
  readonly trackId: DashboardTrackId | null;
  readonly href: string | null;
  readonly actionLabel: string;
  readonly title: string;
  readonly sentence: string | null;
  readonly pinyin: string | null;
}

// ─── Destinations ─────────────────────────────────────────────────────────────

/** Whether a track's real destination is available. Availability of the
 *  underlying content is not enough: the HSK course links only to the published
 *  level-1 route, so partial/incomplete HSK publication keeps the card
 *  preparing even when another level has ids. */
export function trackDestinationAvailable(
  trackId: DashboardTrackId,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
): boolean {
  const track = snapshot.tracks[trackId];
  if (track.availability === 'unavailable') return false;
  if (trackId === 'hsk') {
    return payload.hskLevels.some(
      (level) => level.level === 1 && level.ids.length > 0,
    );
  }
  return true;
}

/** The first not-yet-completed Taiwan lesson (the truthful "next lesson"). */
export function currentTaiwanLesson(
  taiwanLessons: readonly DashboardTrackLesson[],
  completedLessonIds: ReadonlySet<string>,
): DashboardTrackLesson | null {
  return (
    taiwanLessons.find((lesson) => !completedLessonIds.has(lesson.id)) ?? null
  );
}

/** The card's real destination, or null when the track is preparing. For
 *  Taiwan the destination follows the current lesson (SSR falls back to the
 *  first lesson, which is the same destination a fresh learner needs). */
export function trackDestinationHref(
  trackId: DashboardTrackId,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
  completedLessonIds: ReadonlySet<string>,
): string | null {
  if (!trackDestinationAvailable(trackId, snapshot, payload)) return null;
  if (trackId === 'basic-vocabulary') return '/vocabulary/basic/';
  if (trackId === 'hsk') return '/vocabulary/hsk/1/';
  const current = currentTaiwanLesson(payload.taiwanLessons, completedLessonIds);
  if (current) return `/lessons/${current.id}/`;
  const first = payload.taiwanLessons[0];
  return first ? `/lessons/${first.id}/` : null;
}

// ─── Track card presentation ──────────────────────────────────────────────────

export function trackStatusLabel(status: CrossTrackStatus): string {
  switch (status) {
    case 'completed':
      return '完了';
    case 'in-progress':
      return '学習中';
    case 'not-started':
      return '未開始';
  }
}

/** The card status key: `preparing` whenever the destination is unavailable,
 *  otherwise the truthful cross-track status. */
export function trackCardStatusKey(
  trackId: DashboardTrackId,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
): 'preparing' | CrossTrackStatus {
  return trackDestinationAvailable(trackId, snapshot, payload)
    ? snapshot.tracks[trackId].status
    : 'preparing';
}

/** The card status chip label derived from {@link trackCardStatusKey}. */
export function trackCardStatusLabel(
  trackId: DashboardTrackId,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
): string {
  const key = trackCardStatusKey(trackId, snapshot, payload);
  return key === 'preparing' ? '準備中' : trackStatusLabel(key);
}

/** The compact #372 summary line for a track card. Empty for preparing tracks. */
export function trackSummaryText(
  trackId: DashboardTrackId,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
): string {
  if (!trackDestinationAvailable(trackId, snapshot, payload)) return '';
  if (trackId === 'taiwan-travel') {
    const track = snapshot.tracks[trackId];
    return `${track.completedLessons} / ${track.totalLessons} レッスン完了`;
  }
  const track = snapshot.tracks[trackId];
  return `${track.learnedCount} / ${track.totalCount} 語学習済み`;
}

// ─── Continuation ─────────────────────────────────────────────────────────────

/** Build the continuation for one track, or null when it has no usable
 *  destination or is already completed. */
function continuationForTrack(
  trackId: DashboardTrackId,
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
  completedLessonIds: ReadonlySet<string>,
): DashboardContinuation | null {
  if (!trackDestinationAvailable(trackId, snapshot, payload)) return null;
  const track = snapshot.tracks[trackId];
  if (track.status === 'completed') return null;
  const started = track.status === 'in-progress';
  if (trackId === 'basic-vocabulary') {
    return {
      kind: started ? 'continue' : 'start',
      trackId,
      href: '/vocabulary/basic/',
      actionLabel: started ? '単語学習を続ける' : '単語学習を始める',
      title: DASHBOARD_TRACK_LABELS['basic-vocabulary'],
      sentence: null,
      pinyin: null,
    };
  }
  if (trackId === 'hsk') {
    return {
      kind: started ? 'continue' : 'start',
      trackId,
      href: '/vocabulary/hsk/1/',
      actionLabel: started ? 'HSK 単語を続ける' : 'HSK 単語を始める',
      title: 'HSK 単語フラッシュカード',
      sentence: null,
      pinyin: null,
    };
  }
  // taiwan-travel: the truthful destination is the current (next) lesson.
  const current = currentTaiwanLesson(payload.taiwanLessons, completedLessonIds);
  if (current) {
    return {
      kind: started ? 'continue' : 'start',
      trackId,
      href: `/lessons/${current.id}/`,
      actionLabel: started ? 'レッスンを続ける' : 'レッスンを始める',
      title: current.titleJa,
      sentence: current.coreSentence,
      pinyin: current.pinyin,
    };
  }
  // All lessons completed but the track status is not `completed`
  // (inconsistent evidence): no continuation here.
  return null;
}

/**
 * Derive the single truthful continuation action from current evidence.
 *
 * Prefers the first in-progress track (continue what the learner started),
 * then falls back to the first not-started track (start the next available
 * course). When every available track is completed the result is `completed`;
 * when no track has a usable destination the result is `unavailable`. Never
 * fabricates a destination and never invents progress.
 */
export function deriveContinuation(
  snapshot: CrossTrackProgressSnapshot,
  payload: DashboardProgressPayload,
  completedLessonIds: ReadonlySet<string>,
): DashboardContinuation {
  const order = DASHBOARD_TRACK_ORDER;
  for (const trackId of order) {
    if (snapshot.tracks[trackId].status === 'in-progress') {
      const continuation = continuationForTrack(
        trackId,
        snapshot,
        payload,
        completedLessonIds,
      );
      if (continuation) return continuation;
    }
  }
  for (const trackId of order) {
    if (snapshot.tracks[trackId].status === 'not-started') {
      const continuation = continuationForTrack(
        trackId,
        snapshot,
        payload,
        completedLessonIds,
      );
      if (continuation) return continuation;
    }
  }
  const anyAvailable = order.some((trackId) =>
    trackDestinationAvailable(trackId, snapshot, payload),
  );
  if (anyAvailable) {
    return {
      kind: 'completed',
      trackId: null,
      href: null,
      actionLabel: 'すべてのコースを完了しました',
      title: 'すべてのコースを完了しました',
      sentence: null,
      pinyin: null,
    };
  }
  return {
    kind: 'unavailable',
    trackId: null,
    href: null,
    actionLabel: '',
    title: '利用できるコースは準備中です',
    sentence: null,
    pinyin: null,
  };
}

// ─── Achievements ─────────────────────────────────────────────────────────────

/** The currently unlocked #373 milestones, in canonical catalog order. */
export function unlockedAchievements(
  snapshot: CrossTrackProgressSnapshot,
): readonly AchievementEvaluation[] {
  return evaluateAchievements(snapshot).filter(
    (evaluation) => evaluation.status === 'unlocked',
  );
}
