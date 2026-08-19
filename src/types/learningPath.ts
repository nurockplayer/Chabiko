/**
 * Repository-controlled learning-path data contract (Issue #229).
 *
 * Paths reference stable content IDs and exact destinations. They never
 * duplicate content and never perform runtime script conversion. The script
 * default is a display preference chosen by each path; the destination is an
 * exact route that must exist for an available path.
 */

import type {
  ContentRef,
  LearningPathContentKind,
} from './learningContent';

/** Path default display script. Taiwan travel and kanji bridge are
 *  Traditional-first; HSK is Simplified-first. */
export type LearningPathScript = 'traditional' | 'simplified';

/** Effective path availability after derivation. `available` paths are shown
 *  as-is; `unavailable` paths stay visibly non-interactive. */
export type LearningPathAvailability = 'available' | 'unavailable';

/** Fixed path availability reason. `available` paths are shown as-is,
 *  `hsk` paths resolve availability from current production HSK data, and
 *  `unavailable` paths stay visibly non-interactive until their production
 *  route and data exist. */
export type LearningPathAvailabilityReason =
  | 'available'
  | 'unavailable'
  | 'hsk';

/** Content reference kinds resolvable against repository data. */
export type LearningPathMemberType = LearningPathContentKind;

/**
 * A single ordered content reference. `type` selects the source collection
 * that owns the referenced ID; the loader resolves every reference against
 * the current production data for that collection.
 */
export type LearningPathMemberRef = ContentRef<LearningPathMemberType>;

/**
 * HSK availability descriptor for the `hsk-vocabulary` path. Availability is
 * derived from current production HSK data: the path is available when every
 * declared level has at least one production-eligible entry (reviewed or
 * published). Levels are ordered ascending and unique.
 */
export interface HskAvailabilityDescriptor {
  readonly levels: readonly number[];
  readonly status: 'available' | 'unavailable';
}

/**
 * A stable learning-path record. `members` are ordered content references;
 * duplicates and stale (unresolvable) references are validation errors.
 * `availabilityReason` is the frozen declared reason; `availability` is the
 * loader-derived effective state (for `hsk` paths this reflects current
 * production HSK data).
 */
export interface LearningPathRecord {
  readonly id: string;
  readonly labelJa: string;
  readonly descriptionJa: string;
  readonly script: LearningPathScript;
  readonly destination: string;
  readonly availabilityReason: LearningPathAvailabilityReason;
  readonly availability: LearningPathAvailability;
  readonly hsk?: HskAvailabilityDescriptor;
  readonly members: readonly LearningPathMemberRef[];
}

/** Document wrapper for the checked-in `data/learning-paths.json` bundle. */
export interface LearningPathsDocument {
  readonly schemaVersion: 1;
  readonly learningPaths: readonly LearningPathRecord[];
}
