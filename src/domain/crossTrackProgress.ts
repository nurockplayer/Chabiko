import type { VocabularyProgressEntry } from './vocabularyProgress';

// ─── Normalized cross-track progress contract (Issue #372) ─────────────────────
//
// A read-only, normalized progress boundary across the three authoritative
// learning tracks: 先生厳選単語 (basic vocabulary), HSK, and 台湾旅行. The
// existing per-track stores remain the source of truth with their current
// keys, transitions, and sync behavior; this module only summarizes them.
//
// The adapters are pure and deterministic: identical inputs always produce
// deeply equal, frozen outputs. No adapter reads storage, the network, or any
// authoritative store — a caller (the lifecycle coordinator or a future
// Dashboard route) passes the store-derived signals plus the repository
// reference corpora. Missing, duplicate, stale, malformed, or unavailable
// evidence never inflates a count, and no equivalence is invented between
// different learning models (an HSK `learned` item is only counted by the HSK
// adapter, a lesson practice only by the Taiwan adapter, and so on).

export type CrossTrackStatus = 'not-started' | 'in-progress' | 'completed';
export type TrackAvailability = 'available' | 'unavailable';

/** The exact identity scope a basic-vocabulary summary was read from. A user
 *  scope is pinned to a validated Supabase user id; `unavailable` means no
 *  trustworthy identity (never a fallback to another scope). */
export type BasicVocabularyTrackScope =
  | { readonly kind: 'guest' }
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'unavailable' };

export interface BasicVocabularyTrackSummary {
  readonly trackId: 'basic-vocabulary';
  readonly availability: TrackAvailability;
  readonly scope: BasicVocabularyTrackScope;
  readonly learnedCount: number;
  readonly learningCount: number;
  readonly totalCount: number;
  readonly status: CrossTrackStatus;
}

export interface HskLevelSummary {
  readonly level: number;
  readonly availability: TrackAvailability;
  readonly learnedCount: number;
  readonly learningCount: number;
  readonly totalCount: number;
  readonly status: CrossTrackStatus;
}

export interface HskTrackSummary {
  readonly trackId: 'hsk';
  readonly availability: TrackAvailability;
  readonly learnedCount: number;
  readonly learningCount: number;
  readonly totalCount: number;
  readonly status: CrossTrackStatus;
  readonly levels: readonly HskLevelSummary[];
}

export interface TaiwanTravelTrackSummary {
  readonly trackId: 'taiwan-travel';
  readonly availability: TrackAvailability;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly status: CrossTrackStatus;
}

export interface CrossTrackProgressSnapshot {
  readonly schemaVersion: 1;
  readonly tracks: {
    readonly 'basic-vocabulary': BasicVocabularyTrackSummary;
    readonly hsk: HskTrackSummary;
    readonly 'taiwan-travel': TaiwanTravelTrackSummary;
  };
}

/** Production HSK corpus reference for one declared delivery level. */
export interface HskLevelCorpus {
  readonly level: number;
  /** Production-eligible vocabulary ids introduced at this level. An empty
   *  list means the level has no production content yet and is reported
   *  unavailable. */
  readonly ids: readonly string[];
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * A trustworthy `learned` vocabulary entry requires a finite integer
 * knownStreak >= 2. The HSK store parser is deliberately lenient (it accepts
 * any string status + number streak), so a corrupt record claiming
 * `status: learned` with a zero or non-integer streak must never count
 * (mirrors the /paths/ projection guard, Issue #233).
 */
function isTrustworthyLearned(
  entry: VocabularyProgressEntry | undefined,
): boolean {
  return (
    entry !== undefined &&
    entry.status === 'learned' &&
    Number.isInteger(entry.knownStreak) &&
    entry.knownStreak >= 2
  );
}

function deriveStatus(
  completedCount: number,
  totalCount: number,
): CrossTrackStatus {
  if (totalCount > 0 && completedCount === totalCount) return 'completed';
  if (completedCount > 0) return 'in-progress';
  return 'not-started';
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}

// ─── 先生厳選単語 adapter ──────────────────────────────────────────────────────

export interface BasicVocabularyTrackInput {
  /** Progress items from the active scoped basic-vocabulary store. */
  readonly progress: Readonly<Record<string, VocabularyProgressEntry>>;
  /** The production learner corpus ids the basic-vocabulary writer can
   *  produce. Only these may count; a stale/manual id never inflates. */
  readonly corpusIds: ReadonlySet<string>;
  /** The exact active identity scope the progress was read from. */
  readonly scope: BasicVocabularyTrackScope;
}

/**
 * Summarize the active-scope 先生厳選単語 progress.
 *
 * Counts are intersected with the production learner corpus, so an unknown or
 * stale id in the store never inflates `learnedCount`/`learningCount`. A
 * `new` entry or an absent entry stays uncounted (it is not yet learned). The
 * scope is passed through unchanged: guest and user progress are never mixed,
 * and a user summary only ever reflects its own validated identity.
 *
 * Pure and deterministic: identical inputs always produce identical output.
 */
export function buildBasicVocabularyTrackSummary(
  input: BasicVocabularyTrackInput,
): BasicVocabularyTrackSummary {
  let learnedCount = 0;
  let learningCount = 0;
  for (const id of input.corpusIds) {
    const entry = input.progress[id];
    if (isTrustworthyLearned(entry)) {
      learnedCount += 1;
    } else if (entry !== undefined && entry.status === 'learning') {
      learningCount += 1;
    }
  }
  const totalCount = input.corpusIds.size;
  return Object.freeze({
    trackId: 'basic-vocabulary',
    availability: totalCount > 0 ? 'available' : 'unavailable',
    scope: input.scope,
    learnedCount,
    learningCount,
    totalCount,
    status: deriveStatus(learnedCount, totalCount),
  });
}

// ─── HSK adapter ──────────────────────────────────────────────────────────────

export interface HskTrackInput {
  /** Entries from the HSK vocabulary progress store. */
  readonly progress: Readonly<Record<string, VocabularyProgressEntry>>;
  /** Declared HSK delivery levels with their production ids. */
  readonly levels: readonly HskLevelCorpus[];
}

/**
 * Summarize HSK progress and availability.
 *
 * Each declared level counts only ids present in its production corpus, so an
 * unknown or stale `hsk-*`/`voc-*`/manual id in the store never inflates the
 * level. A level with no production ids is reported unavailable with a zero
 * denominator (partial availability is surfaced per level and in the overall
 * track availability). A corrupt `learned` record (streak < 2) never counts.
 *
 * Pure and deterministic: identical inputs always produce identical output.
 */
export function buildHskTrackSummary(input: HskTrackInput): HskTrackSummary {
  const levels: HskLevelSummary[] = input.levels.map((corpus) => {
    let learnedCount = 0;
    let learningCount = 0;
    for (const id of corpus.ids) {
      const entry = input.progress[id];
      if (isTrustworthyLearned(entry)) {
        learnedCount += 1;
      } else if (entry !== undefined && entry.status === 'learning') {
        learningCount += 1;
      }
    }
    const totalCount = corpus.ids.length;
    return Object.freeze({
      level: corpus.level,
      availability: totalCount > 0 ? 'available' : 'unavailable',
      learnedCount,
      learningCount,
      totalCount,
      status: deriveStatus(learnedCount, totalCount),
    });
  });
  const learnedCount = levels.reduce((sum, level) => sum + level.learnedCount, 0);
  const learningCount = levels.reduce((sum, level) => sum + level.learningCount, 0);
  const totalCount = levels.reduce((sum, level) => sum + level.totalCount, 0);
  return Object.freeze({
    trackId: 'hsk',
    availability: totalCount > 0 ? 'available' : 'unavailable',
    learnedCount,
    learningCount,
    totalCount,
    status: deriveStatus(learnedCount, totalCount),
    levels,
  });
}

// ─── 台湾旅行 adapter ──────────────────────────────────────────────────────────

export interface TaiwanTravelTrackInput {
  /** Completed lesson practice ids (`chabiko_completed_lessons`). */
  readonly completedLessonIds: ReadonlySet<string>;
  /** Lesson ids with a usable practice path (the fixed denominator). */
  readonly completableLessonIds: readonly string[];
}

/**
 * Summarize 台湾旅行 lesson progress.
 *
 * Only lesson ids with a usable practice path count toward the denominator,
 * and only real completion evidence (a completed lesson practice) advances the
 * numerator. A completed non-completable or stale id never counts, and passive
 * viewing (a `viewed`/`opened` signal or a lesson merely opened) is never
 * represented here.
 *
 * Pure and deterministic: identical inputs always produce identical output.
 */
export function buildTaiwanTravelTrackSummary(
  input: TaiwanTravelTrackInput,
): TaiwanTravelTrackSummary {
  let completedLessons = 0;
  for (const id of input.completableLessonIds) {
    if (input.completedLessonIds.has(id)) completedLessons += 1;
  }
  const totalLessons = input.completableLessonIds.length;
  return Object.freeze({
    trackId: 'taiwan-travel',
    availability: totalLessons > 0 ? 'available' : 'unavailable',
    completedLessons,
    totalLessons,
    status: deriveStatus(completedLessons, totalLessons),
  });
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

export interface CrossTrackProgressInput {
  readonly basicVocabulary: BasicVocabularyTrackSummary;
  readonly hsk: HskTrackSummary;
  readonly taiwanTravel: TaiwanTravelTrackSummary;
}

/**
 * Build the single immutable cross-track snapshot.
 *
 * The returned snapshot (and every nested summary) is deeply frozen, so a
 * consumer can never mutate it. There is no write API: this is the entire
 * read-only progress boundary. Repeated calls with identical inputs produce
 * deeply equal snapshots.
 */
export function buildCrossTrackProgressSnapshot(
  input: CrossTrackProgressInput,
): CrossTrackProgressSnapshot {
  return deepFreeze({
    schemaVersion: 1,
    tracks: {
      'basic-vocabulary': input.basicVocabulary,
      hsk: input.hsk,
      'taiwan-travel': input.taiwanTravel,
    },
  });
}
