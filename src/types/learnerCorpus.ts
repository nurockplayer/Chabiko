import type {
  LearnerImageProvenance,
  LearnerImageState,
  LearnerPartOfSpeech,
} from './learnerManifest';

/** Learner-facing illustration metadata resolved from the deployed WebP asset.
 * `altJa` is the truthful Japanese alt text for the 19 production images and
 * the frozen #202 decorative fallback (`''`) for every other corpus image;
 * the card already renders the simplified Chinese text as the accessible
 * content, matching the preview browser's decorative `alt=""` treatment. */
export interface ProductionLearnerIllustration {
  readonly assetPath: string;
  readonly width: number;
  readonly height: number;
  readonly altJa: string;
  readonly state: LearnerImageState;
  readonly provenance: LearnerImageProvenance;
}

/** Complete, human-promoted phrase-level learner content for one source cell. */
export interface ProductionTeacherPhrase {
  readonly phraseId: string;
  readonly simplified: string;
  readonly traditional?: string;
  readonly pinyin: string;
  readonly japanese: string;
}

/** A narrow learner-facing record exposing exactly what the manifest can
 * truthfully provide. Intentionally excludes preview-only surface
 * (sourceSheet/sourceRow/reviewStatus/reconciliation evidence/missingFields/
 * prompt digest/reference set IDs) and never fabricates curriculum/source. */
export interface ProductionLearnerItem {
  readonly learnerId: string;
  readonly simplified: string;
  readonly partOfSpeech: LearnerPartOfSpeech;
  readonly traditional?: string;
  readonly pinyin?: string;
  readonly japanese?: string;
  readonly difficulty?: string;
  /** Teacher-authored example sentence (Simplified Chinese), preserved
   * verbatim from the workbook `造词/造句` column. Absent when the source
   * cell is empty — a deliberate missing-example state. */
  readonly example?: string;
  /** Present only when the entire source cell passed the exact #479 human
   * review and maintainer promotion gate. The raw `example` remains present. */
  readonly teacherPhrases?: readonly ProductionTeacherPhrase[];
  readonly illustration: ProductionLearnerIllustration;
}
