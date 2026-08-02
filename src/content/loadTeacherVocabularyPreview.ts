import corpusData from '../../data/teacher-vocabulary-preview/preview-corpus.json' assert { type: 'json' };
import reconciliationData from '../../data/teacher-vocabulary-preview/teacher-image-reconciliation.json' assert { type: 'json' };
import type {
  PreviewImageState,
  PreviewMissingField,
  PreviewPartOfSpeech,
  TeacherImageReconciliationRecord,
  TeacherVocabularyPreviewCorpus,
  TeacherVocabularyPreviewRow,
} from '../types/teacherVocabularyPreview';

export interface TeacherVocabularyPreviewFilters {
  sourceSheet?: string;
  partOfSpeech?: PreviewPartOfSpeech;
  difficulty?: string;
  imageState?: PreviewImageState;
  missingField?: PreviewMissingField;
}

const corpus = corpusData as TeacherVocabularyPreviewCorpus;
const reconciliation = reconciliationData as { images: TeacherImageReconciliationRecord[] };

function immutableCopy<T>(value: T): T {
  return Object.freeze(structuredClone(value));
}

function assertPreviewIntegrity(): void {
  const ids = new Set<string>();
  for (const row of corpus.rows) {
    if (ids.has(row.id)) throw new Error(`Duplicate preview row id '${row.id}'`);
    ids.add(row.id);
    if (!row.simplified.trim()) throw new Error(`Preview row '${row.id}' is missing its source Chinese value`);
    if (row.image.provenance === 'ai-generated' && row.image.state !== 'ai-generated') {
      throw new Error(`Preview row '${row.id}' has inconsistent AI image provenance`);
    }
    if (
      row.image.provenance === 'teacher-provided'
      && row.image.state !== 'teacher-mapped'
      && row.image.state !== 'teacher-mapped-local'
    ) {
      throw new Error(`Preview row '${row.id}' has inconsistent teacher image provenance`);
    }
  }
  if (ids.size !== corpus.totals.usableRows) {
    throw new Error(`Preview row total mismatch: ${ids.size} rows, expected ${corpus.totals.usableRows}`);
  }
  const sourcePaths = new Set<string>();
  for (const image of reconciliation.images) {
    if (sourcePaths.has(image.relativePath)) throw new Error(`Duplicate teacher source image '${image.relativePath}'`);
    sourcePaths.add(image.relativePath);
  }
  if (sourcePaths.size !== corpus.teacherImagePackage.readableImages) {
    throw new Error(`Teacher source image total mismatch: ${sourcePaths.size}`);
  }
}

assertPreviewIntegrity();

export function loadTeacherVocabularyPreview(): Readonly<TeacherVocabularyPreviewCorpus> {
  return immutableCopy(corpus);
}

export function loadTeacherImageReconciliation(): readonly TeacherImageReconciliationRecord[] {
  return immutableCopy(reconciliation.images);
}

export function filterTeacherVocabularyPreview(
  rows: readonly TeacherVocabularyPreviewRow[],
  filters: TeacherVocabularyPreviewFilters,
): TeacherVocabularyPreviewRow[] {
  return rows.filter((row) => {
    if (filters.sourceSheet && row.sourceSheet !== filters.sourceSheet) return false;
    if (filters.partOfSpeech && row.partOfSpeech !== filters.partOfSpeech) return false;
    if (filters.difficulty && row.difficulty !== filters.difficulty) return false;
    if (filters.imageState && row.image.state !== filters.imageState) return false;
    if (filters.missingField && !row.missingFields.includes(filters.missingField)) return false;
    return true;
  });
}
