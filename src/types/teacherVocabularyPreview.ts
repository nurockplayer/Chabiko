/**
 * Preview-only teacher workbook contract for Issue #185.
 *
 * This deliberately does not reuse TeacherVocabularyType: rows in this corpus
 * can be missing source metadata and must never enter the learner loader.
 */
export type PreviewImageState =
  | 'teacher-mapped'
  | 'teacher-mapped-local'
  | 'ai-generated'
  | 'ai-pending'
  | 'text-only'
  | 'ambiguous'
  | 'unsuitable'
  | 'skipped';

export type PreviewImageProvenance = 'teacher-provided' | 'ai-generated' | null;

export type PreviewMissingField = 'pinyin' | 'japanese' | 'traditional' | 'difficulty';

export type PreviewPartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb';

export interface TeacherVocabularyPreviewImage {
  state: PreviewImageState;
  provenance: PreviewImageProvenance;
  reviewStatus: 'draft' | 'not-applicable';
  assetPath?: string;
  assetChecksumSha256?: string;
  width?: number;
  height?: number;
  promptDigest?: string;
  sourceImageRelativePath?: string;
  sourceChecksumSha256?: string;
  reconciliationEvidence?: string;
  note?: string;
}

export interface TeacherVocabularyPreviewRow {
  id: string;
  productionVocabularyId?: string;
  simplified: string;
  traditional?: string;
  pinyin?: string;
  japanese?: string;
  difficulty?: string;
  partOfSpeech: PreviewPartOfSpeech;
  sourceSheet: string;
  sourceRow: number;
  missingFields: readonly PreviewMissingField[];
  reviewStatus: 'draft';
  image: TeacherVocabularyPreviewImage;
}

export interface TeacherVocabularyPreviewTotals {
  usableRows: number;
  missingFields: Record<PreviewMissingField, number>;
  bySourceSheet: Record<string, number>;
  byPartOfSpeech: Record<PreviewPartOfSpeech, number>;
  byImageState: Record<PreviewImageState, number>;
}

export interface TeacherVocabularyPreviewCorpus {
  schemaVersion: 1;
  workbook: {
    basename: string;
    sha256: string;
    candidateRows: number;
  };
  teacherImagePackage: {
    readableImages: number;
    pathSensitiveFingerprintSha256: string;
  };
  totals: TeacherVocabularyPreviewTotals;
  rows: TeacherVocabularyPreviewRow[];
}

export interface TeacherImageReconciliationRecord {
  id: string;
  relativePath: string;
  sourceChecksumSha256: string;
  width: number;
  height: number;
  format: 'PNG';
  state: 'already-committed' | 'mapped' | 'ambiguous' | 'unmatched' | 'unsuitable' | 'duplicate';
  evidence: string;
  previewIds: string[];
  duplicateGroupChecksumSha256?: string;
  duplicateOfRelativePath?: string;
  note?: string;
}
