/**
 * Repository-controlled Taiwan travel roleplay-card contract (Issue #243).
 *
 * Each card is a deterministic 4–8 line alternating learner/partner exchange
 * for a single controlled travel scenario. Cards only reference existing
 * same-scenario content (lessons and phrasebook phrases); they never duplicate
 * content. One production card file per scenario lives under `data/roleplay/`
 * and is the authoritative parallelization boundary for the six downstream
 * cards (parent #19). This module only declares the contract types; the
 * executable validation lives in `scripts/validate-content-schema.py`.
 */

import type { ReviewStatus } from './vocabulary';

/** Controlled Taiwan travel scenario for a roleplay card. */
export type RoleplayScenario =
  | 'food'
  | 'transport'
  | 'hotel'
  | 'shopping'
  | 'emergency'
  | 'airport';

/** Speaker of one roleplay line. */
export type RoleplaySpeaker = 'learner' | 'partner';

/** Per-form script provenance, mirroring the #24 per-form rules. */
export type RoleplayScriptStatus = 'authored' | 'verified' | 'generated';

/**
 * A single learner or partner line with dual-script text, tone-marked pinyin,
 * and natural Japanese. Script provenance rules follow the #24 contract and
 * mirror the repository's `VocabularyExample` pattern: the simplified presence
 * and its status form exactly three combinations — no simplified, simplified
 * unavailable, or simplified with an authored/verified/generated status. Any
 * other combination is rejected by the executable validator.
 */
export type RoleplayLine = {
  readonly speaker: RoleplaySpeaker;
  readonly traditional: string;
  readonly traditionalStatus: RoleplayScriptStatus;
  readonly pinyin: string;
  readonly japanese: string;
} & (
  | { simplified?: never; simplifiedStatus?: never }
  | { simplified?: never; simplifiedStatus: 'unavailable' }
  | { simplified: string; simplifiedStatus: 'authored' | 'verified' | 'generated' }
);

/** Truthful source for a reviewed/published card. */
export interface RoleplaySourceInfo {
  readonly type: string;
  readonly note?: string;
}

/**
 * A stable roleplay card record.
 *
 * - `phraseRefs` — non-empty list of unique same-scenario phrasebook ids.
 * - `lessonRefs` — optional list of unique same-scenario lesson ids.
 * - `allLearnerTurnsRehearsed` — fixed contract invariant, must be exactly
 *   `true`: every card is a rehearsed exchange where the learner performs all
 *   learner turns.
 *
 * Missing (stale), duplicate, and cross-scenario references are validation
 * errors, as are malformed/non-alternating lines and line counts outside 4–8.
 */
export interface RoleplayCardRecord {
  readonly id: string;
  readonly scenario: RoleplayScenario;
  readonly titleJa: string;
  readonly goalJa: string;
  readonly guidanceJa: string;
  readonly lessonRefs?: readonly string[];
  readonly phraseRefs: readonly string[];
  readonly allLearnerTurnsRehearsed: true;
  readonly lines: readonly RoleplayLine[];
  readonly reviewStatus: ReviewStatus;
  readonly source?: RoleplaySourceInfo;
}

/** Document wrapper for a roleplay-cards bundle fixture. */
export interface RoleplayCardsDocument {
  readonly schemaVersion: 1;
  readonly roleplayCards: readonly RoleplayCardRecord[];
}
