/**
 * Production learner manifest contract for Issue #201.
 *
 * Machine-readable freeze of every preview row with a deployed, usable image.
 * Generated deterministically by scripts/build-teacher-learner-manifest.py;
 * never hand-edited. This ticket only freezes the contract — no learner route,
 * loader, session, or progress consumes it yet (that is #202).
 */
export type LearnerImageState = 'teacher-mapped' | 'ai-generated';

export type LearnerImageProvenance = 'teacher-provided' | 'ai-generated';

export type LearnerPartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb';

export interface LearnerManifestRow {
  learnerId: string;
  simplified: string;
  partOfSpeech: LearnerPartOfSpeech;
  sourceSheet: string;
  sourceRow: number;
  traditional?: string;
  pinyin?: string;
  japanese?: string;
  difficulty?: string;
  image: {
    state: LearnerImageState;
    assetPath: string;
    provenance: LearnerImageProvenance;
  };
}

export interface LearnerManifest {
  schemaVersion: 1;
  source: {
    previewCorpusPath: string;
    previewCorpusSchemaVersion: number;
    workbookSha256: string;
    teacherImagePackageFingerprintSha256: string;
  };
  productionContract: {
    count: number;
    preserved: number;
    excluded: number;
    ids: readonly string[];
    excludedIds: readonly string[];
  };
  totals: {
    eligible: number;
    excluded: number;
    teacher: number;
    ai: number;
    originalProductionIds: number;
    preservedProductionIds: number;
  };
  rows: readonly LearnerManifestRow[];
}
