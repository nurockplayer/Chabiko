import vocabData from '../../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json' assert { type: 'json' };
import illData from '../../data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json' assert { type: 'json' };
import type { Illustration } from '../types/illustration';
import type { TeacherVocabularyType } from '../types/vocabulary';

const VALID_ASSET_PREFIX = '/assets/vocabulary/teacher-core-v1/';

export interface TeacherVocabularyLearningItem {
  readonly vocabulary: TeacherVocabularyType;
  readonly illustration: Illustration | null;
}

/**
 * Deep-freeze a value and all its nested objects/arrays.
 * Returns the same value (frozen in place).
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) {
    deepFreeze(obj[key]);
  }
  return Object.freeze(value);
}

/**
 * Build an index of illustrations by id.
 * Throws on duplicate illustration id.
 */
function indexById(illustrations: Illustration[]): Map<string, Illustration> {
  const index = new Map<string, Illustration>();
  for (const ill of illustrations) {
    if (index.has(ill.id)) {
      throw new Error(
        `Duplicate illustration id '${ill.id}'`,
      );
    }
    index.set(ill.id, ill);
  }
  return index;
}

/**
 * Resolve an illustrationRef to its matching illustration.
 * Returns null when ref is absent. Throws on missing/mismatched reference.
 */
function resolveIllustration(
  ref: string | undefined,
  vocabularyId: string,
  illById: Map<string, Illustration>,
): Illustration | null {
  if (ref === undefined) return null;

  const ill = illById.get(ref);
  if (!ill) {
    throw new Error(
      `illustrationRef '${ref}' on vocabulary '${vocabularyId}' does not match any illustration id`,
    );
  }
  if (ill.vocabularyId !== vocabularyId) {
    throw new Error(
      `illustrationRef '${ref}' targets illustration with vocabularyId '${ill.vocabularyId}', expected '${vocabularyId}'`,
    );
  }
  return ill;
}

/**
 * Validate illustration metadata integrity.
 */
function validateIllustration(ill: Illustration): void {
  if (!ill.assetPath.startsWith(VALID_ASSET_PREFIX)) {
    throw new Error(
      `Illustration '${ill.id}' assetPath '${ill.assetPath}' must start with '${VALID_ASSET_PREFIX}'`,
    );
  }
  if (ill.reviewStatus !== 'draft') {
    throw new Error(
      `Illustration '${ill.id}' reviewStatus must be 'draft', got '${ill.reviewStatus}'`,
    );
  }
  if (ill.rights.status !== 'pending' || ill.rights.source !== 'teacher-provided') {
    throw new Error(
      `Illustration '${ill.id}' rights must be pending/teacher-provided, got status='${ill.rights.status}' source='${ill.rights.source}'`,
    );
  }
}

/**
 * Validate a vocabulary row's source and status fields.
 */
function validateVocabularyRow(row: TeacherVocabularyType): void {
  // ── Source ──
  if (!row.source || row.source.type !== 'teacher-workbook') {
    throw new Error(
      `Vocabulary '${row.id}' source.type must be 'teacher-workbook', got '${row.source?.type}'`,
    );
  }

  // ── reviewStatus ──
  if (row.reviewStatus !== 'draft') {
    throw new Error(
      `Vocabulary '${row.id}' reviewStatus must be 'draft', got '${row.reviewStatus}'`,
    );
  }

  // ── simplifiedStatus ──
  if (row.simplifiedStatus !== 'authored') {
    throw new Error(
      `Vocabulary '${row.id}' simplifiedStatus must be 'authored', got '${row.simplifiedStatus}'`,
    );
  }

  // ── Traditional invariant ──
  const record = row as unknown as Record<string, unknown>;
  const hasTraditional = record.traditional !== undefined;
  if (hasTraditional) {
    if (typeof record.traditional !== 'string' || (record.traditional as string).trim() === '') {
      throw new Error(
        `Vocabulary '${row.id}' traditional must be a non-empty string when present`,
      );
    }
    if (record.traditionalStatus !== 'authored') {
      throw new Error(
        `Vocabulary '${row.id}' traditionalStatus must be 'authored' when traditional is present, got '${record.traditionalStatus}'`,
      );
    }
  } else {
    if (record.traditionalStatus !== 'unavailable') {
      throw new Error(
        `Vocabulary '${row.id}' traditionalStatus must be 'unavailable' when traditional is absent, got '${record.traditionalStatus}'`,
      );
    }
  }
}

/**
 * Check every illustration is referenced by exactly one vocabulary row.
 */
function checkAllIllustrationsReferenced(
  illustrations: Illustration[],
  usedVocabIds: Set<string>,
): void {
  for (const ill of illustrations) {
    if (!usedVocabIds.has(ill.vocabularyId)) {
      throw new Error(
        `Orphan illustration '${ill.id}': vocabularyId '${ill.vocabularyId}' has no matching vocabulary illustrationRef`,
      );
    }
  }
}

/**
 * Check no duplicate vocabulary IDs exist.
 */
function checkDuplicateVocabIds(rows: TeacherVocabularyType[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) {
      throw new Error(`Duplicate vocabulary id '${row.id}'`);
    }
    seen.add(row.id);
  }
}

/**
 * Load all 20 batch-01 teacher vocabulary rows with their optional draft
 * illustrations.
 *
 * Reads from static JSON imports — no runtime file I/O.
 * Returns deeply-frozen, read-only results.
 * Throws deterministically on any data integrity violation.
 */
export function loadTeacherVocabulary(): readonly TeacherVocabularyLearningItem[] {
  const rows = vocabData.vocabulary as TeacherVocabularyType[];
  const rawIllustrations = illData.illustrations as Illustration[];

  // Validate no duplicate vocabulary IDs
  checkDuplicateVocabIds(rows);

  // Build index by id
  const illById = indexById(rawIllustrations);

  // Track which vocabularyIds are actually linked via illustrationRef
  const usedVocabIds = new Set<string>();
  const items: TeacherVocabularyLearningItem[] = [];

  for (const row of rows) {
    validateVocabularyRow(row);

    const ref = (row as unknown as Record<string, unknown>).illustrationRef as string | undefined;
    const illustration = resolveIllustration(ref, row.id, illById);

    if (illustration) {
      validateIllustration(illustration);
      usedVocabIds.add(illustration.vocabularyId);
    }

    items.push(deepFreeze({
      vocabulary: deepFreeze({ ...row }),
      illustration: illustration ? deepFreeze({ ...illustration }) : null,
    }) as TeacherVocabularyLearningItem);
  }

  // Every illustration must be referenced exactly once
  checkAllIllustrationsReferenced(rawIllustrations, usedVocabIds);

  return deepFreeze(items);
}
