/**
 * Shared phrasebook content contract.
 *
 * The loader owns parsing and eligibility rules; these types are kept in the
 * domain layer so other content graph consumers can reference phrases without
 * depending on a route-specific loader module.
 */

/** Controlled phrasebook scenario order. */
export const PHRASEBOOK_SCENARIOS = [
  'airport',
  'transport',
  'food',
  'shopping',
  'hotel',
  'emergency',
] as const;

export type PhrasebookScenario = (typeof PHRASEBOOK_SCENARIOS)[number];

/** Per-form provenance. */
export type PhrasebookFormStatus = 'authored' | 'verified' | 'generated';

export type PhrasebookReviewStatus = 'draft' | 'reviewed' | 'published';

export type PhrasebookSpeaker = 'learner' | 'partner';

/** Truthful source metadata for phrasebook records. */
export interface PhrasebookSource {
  type: string;
  note?: string;
}

/**
 * Reusable phrasebook phrase record. `relatedVocabulary` contains typed IDs
 * into the shared vocabulary collection; it does not duplicate vocabulary
 * content or perform script conversion.
 */
export interface PhrasebookPhrase {
  id: string;
  scenario: PhrasebookScenario;
  traditional: string;
  traditionalStatus: PhrasebookFormStatus;
  simplified?: string;
  simplifiedStatus?: PhrasebookFormStatus;
  pinyin: string;
  japanese: string;
  usageNotesJa: string;
  painPointTags?: string[];
  relatedVocabulary?: string[];
  reviewStatus: PhrasebookReviewStatus;
  source?: PhrasebookSource;
}

/** One conversation turn inside a phrasebook dialog. */
export interface PhrasebookDialogTurn {
  speaker: PhrasebookSpeaker;
  traditional: string;
  traditionalStatus: PhrasebookFormStatus;
  simplified?: string;
  simplifiedStatus?: PhrasebookFormStatus;
  pinyin: string;
  japanese: string;
}

/** The learner-surface shape for one phrasebook dialog. */
export interface PhrasebookDialog {
  id: string;
  scenario: PhrasebookScenario;
  turns: readonly PhrasebookDialogTurn[];
  relatedPhraseIds: readonly string[];
  reviewStatus: PhrasebookReviewStatus;
  source?: PhrasebookSource;
}

export interface PhrasebookData {
  phrases: readonly PhrasebookPhrase[];
  dialogs: readonly PhrasebookDialog[];
}

/** One controlled scenario rendered by the surface, in controlled order. */
export interface PhrasebookScenarioGroup {
  scenario: PhrasebookScenario;
  phrases: readonly PhrasebookPhrase[];
  dialog: PhrasebookDialog | null;
}
