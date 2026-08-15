import type { CrossTrackProgressSnapshot } from './crossTrackProgress';

// ─── Achievement domain (Issue #373) ──────────────────────────────────────────
//
// A small V1 achievement layer that derives meaningful learner milestones from
// the normalized cross-track progress snapshot (#372). Achievements are
// learning milestones, not an engagement economy: there is no XP, currency,
// streak, leaderboard, loot/random reward, daily-pressure mechanic, or paid
// unlock.
//
// The catalog is pure static data and the evaluator is a pure deterministic
// function of the snapshot: identical evidence always produces identical
// results in the same catalog order. `locked | unlocked` is fully derived;
// there is no independent achievement progress document, no storage key, no
// write path, and no identity handling. Identity lives upstream in the
// snapshot (each track summary is scoped to its own validated scope), so
// switching accounts naturally re-evaluates against the active snapshot with
// no cross-user leakage.
//
// Every unlock condition reads only truthful evidence from the snapshot:
// learned counts (which the #372 adapters already intersect with the
// production corpus and guard with a knownStreak >= 2 requirement) and
// completed lesson practices. Page views, opened-but-unfinished lessons,
// stale ids, corrupt records, unavailable tracks, and incomplete HSK
// publication never unlock anything. HSK milestones are additionally gated on
// the track being available, so a level with no production content can never
// unlock (defense in depth on top of the truthful snapshot counts).

export type AchievementStatus = 'locked' | 'unlocked';

export type AchievementCategory =
  | 'learning'
  | 'vocabulary'
  | 'hsk'
  | 'taiwan-travel';

export type AchievementId =
  | 'first-learning-activity'
  | 'vocabulary-first-word'
  | 'vocabulary-5'
  | 'vocabulary-10'
  | 'vocabulary-25'
  | 'hsk-start'
  | 'hsk-complete'
  | 'taiwan-first-lesson'
  | 'taiwan-lessons-3'
  | 'taiwan-path-complete';

/** Discriminated unlock condition; each definition carries exactly one kind. */
export type AchievementKind =
  | { readonly type: 'first-learning-activity' }
  | { readonly type: 'vocabulary-threshold'; readonly threshold: number }
  | { readonly type: 'hsk-start' }
  | { readonly type: 'hsk-complete' }
  | { readonly type: 'taiwan-threshold'; readonly threshold: number }
  | { readonly type: 'taiwan-path-complete' };

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly category: AchievementCategory;
  /** Learner-facing Japanese title. */
  readonly title: string;
  /** Learner-facing Japanese description. */
  readonly description: string;
  readonly kind: AchievementKind;
}

export interface AchievementEvaluation {
  readonly achievement: AchievementDefinition;
  readonly status: AchievementStatus;
}

// ─── Catalog ───────────────────────────────────────────────────────────────────

const CATALOG: readonly AchievementDefinition[] = [
  {
    id: 'first-learning-activity',
    category: 'learning',
    title: '最初の学習マイルストーン',
    description:
      '1 つ以上の学習アクティビティを完了しました（単語の学習済み、またはレッスンの完了）。',
    kind: { type: 'first-learning-activity' },
  },
  {
    id: 'vocabulary-first-word',
    category: 'vocabulary',
    title: '先生厳選単語を学び始めた',
    description: '先生厳選単語を 1 語学習済みにしました。',
    kind: { type: 'vocabulary-threshold', threshold: 1 },
  },
  {
    id: 'vocabulary-5',
    category: 'vocabulary',
    title: '先生厳選単語 5 語',
    description: '先生厳選単語を 5 語学習済みにしました。',
    kind: { type: 'vocabulary-threshold', threshold: 5 },
  },
  {
    id: 'vocabulary-10',
    category: 'vocabulary',
    title: '先生厳選単語 10 語',
    description: '先生厳選単語を 10 語学習済みにしました。',
    kind: { type: 'vocabulary-threshold', threshold: 10 },
  },
  {
    id: 'vocabulary-25',
    category: 'vocabulary',
    title: '先生厳選単語 25 語',
    description: '先生厳選単語を 25 語学習済みにしました。',
    kind: { type: 'vocabulary-threshold', threshold: 25 },
  },
  {
    id: 'hsk-start',
    category: 'hsk',
    title: 'HSK 単語を学び始めた',
    description: 'HSK の公開単語を 1 語以上学習済みにしました。',
    kind: { type: 'hsk-start' },
  },
  {
    id: 'hsk-complete',
    category: 'hsk',
    title: 'HSK 公開単語をコンプリート',
    description: 'HSK で公開されている単語をすべて学習済みにしました。',
    kind: { type: 'hsk-complete' },
  },
  {
    id: 'taiwan-first-lesson',
    category: 'taiwan-travel',
    title: '台湾旅行レッスンを始めた',
    description: '台湾旅行レッスンを 1 つ完了しました。',
    kind: { type: 'taiwan-threshold', threshold: 1 },
  },
  {
    id: 'taiwan-lessons-3',
    category: 'taiwan-travel',
    title: '台湾旅行レッスン 3 回',
    description: '台湾旅行レッスンを 3 つ完了しました。',
    kind: { type: 'taiwan-threshold', threshold: 3 },
  },
  {
    id: 'taiwan-path-complete',
    category: 'taiwan-travel',
    title: '台湾旅行パスをコンプリート',
    description: '台湾旅行の全レッスンを完了しました。',
    kind: { type: 'taiwan-path-complete' },
  },
];

/** The stable milestone catalog in canonical display order. Deeply frozen. */
export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] =
  deepFreeze(CATALOG);

const CATALOG_BY_ID = new Map<AchievementId, AchievementDefinition>(
  ACHIEVEMENT_CATALOG.map((achievement) => [achievement.id, achievement]),
);

/**
 * Look up a catalog definition by its stable id.
 *
 * Throws on an unknown id (fail closed) so a caller can never silently
 * evaluate an achievement that does not exist in the catalog.
 */
export function getAchievement(id: AchievementId): AchievementDefinition {
  const achievement = CATALOG_BY_ID.get(id);
  if (achievement === undefined) {
    throw new Error(`Unknown achievement id: "${id}"`);
  }
  return achievement;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluate one achievement's unlock condition against the snapshot.
 *
 * Pure and deterministic: the same snapshot always yields the same status.
 */
function isUnlocked(
  kind: AchievementKind,
  snapshot: CrossTrackProgressSnapshot,
): boolean {
  const { tracks } = snapshot;
  switch (kind.type) {
    case 'first-learning-activity':
      return (
        tracks['basic-vocabulary'].learnedCount >= 1 ||
        tracks.hsk.learnedCount >= 1 ||
        tracks['taiwan-travel'].completedLessons >= 1
      );
    case 'vocabulary-threshold':
      // A truthful learned count can never exist when the corpus is empty, so
      // no separate availability guard is needed here.
      return tracks['basic-vocabulary'].learnedCount >= kind.threshold;
    case 'hsk-start':
      // Availability is required on top of the truthful count: a level with no
      // production content (incomplete HSK publication) must never unlock.
      return (
        tracks.hsk.availability === 'available' &&
        tracks.hsk.learnedCount >= 1
      );
    case 'hsk-complete':
      return (
        tracks.hsk.availability === 'available' &&
        tracks.hsk.status === 'completed'
      );
    case 'taiwan-threshold':
      return tracks['taiwan-travel'].completedLessons >= kind.threshold;
    case 'taiwan-path-complete':
      return (
        tracks['taiwan-travel'].availability === 'available' &&
        tracks['taiwan-travel'].status === 'completed'
      );
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled achievement kind: ${JSON.stringify(value)}`);
}

/**
 * Evaluate a single catalog achievement.
 *
 * Returns a frozen `AchievementEvaluation`. Throws on an unknown id.
 */
export function evaluateAchievement(
  id: AchievementId,
  snapshot: CrossTrackProgressSnapshot,
): AchievementEvaluation {
  const achievement = getAchievement(id);
  return Object.freeze({
    achievement,
    status: isUnlocked(achievement.kind, snapshot) ? 'unlocked' : 'locked',
  });
}

/**
 * Evaluate every achievement in the catalog against the snapshot.
 *
 * Results are returned in canonical catalog order and deeply frozen. Pure and
 * deterministic: re-evaluating identical evidence returns identical results
 * and identical ordering.
 */
export function evaluateAchievements(
  snapshot: CrossTrackProgressSnapshot,
): readonly AchievementEvaluation[] {
  return deepFreeze(
    ACHIEVEMENT_CATALOG.map((achievement) => ({
      achievement,
      status: isUnlocked(achievement.kind, snapshot) ? 'unlocked' : 'locked',
    })),
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}
