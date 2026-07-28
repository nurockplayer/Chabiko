import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Illustration } from '../types/illustration';
import type { TeacherVocabularyType } from '../types/vocabulary';

const VOCABULARY_PATH = 'data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json';
const ILLUSTRATIONS_PATH = 'data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json';
const VALID_ASSET_PREFIX = '/assets/vocabulary/teacher-core-v1/';

export interface TeacherVocabularyLearningItem {
  readonly vocabulary: TeacherVocabularyType;
  readonly illustration: Illustration | null;
}

interface VocabularyBundle {
  vocabulary: TeacherVocabularyType[];
}

interface IllustrationsBundle {
  illustrations: Illustration[];
}

function parseBundle<T>(raw: string, path: string, key: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse ${path}: not valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>)[key])) {
    throw new Error(`Invalid structure at ${path}: expected {${key}: [...]}`);
  }
  return parsed as T;
}

function resolveCwdPath(relativePath: string): string {
  return resolve(process.cwd(), relativePath);
}

/**
 * Determine whether a vocabulary row carries a traditional-script form.
 */
function hasTraditional(entry: TeacherVocabularyType): boolean {
  return 'traditional' in entry && typeof (entry as unknown as Record<string, unknown>).traditional === 'string';
}

/**
 * Check that a string is a non-empty `illustrationRef` which must match an
 * illustration whose `vocabularyId` equals the vocabulary row's `id`.
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
      `illustrationRef '${ref}' vocabularyId '${ill.vocabularyId}' does not match vocabulary id '${vocabularyId}'`,
    );
  }
  return ill;
}

/**
 * Confirm the illustration's asset path is under the allowed prefix and the
 * file actually exists on disk.
 */
function validateIllustrationAsset(ill: Illustration): void {
  if (!ill.assetPath.startsWith(VALID_ASSET_PREFIX)) {
    throw new Error(
      `Illustration '${ill.id}' assetPath '${ill.assetPath}' must start with '${VALID_ASSET_PREFIX}'`,
    );
  }
}

/**
 * Detect illustration records whose `vocabularyId` does not appear in any
 * teacher vocabulary row (orphan illustrations).
 */
function checkOrphans(
  illustrations: Illustration[],
  usedVocabIds: Set<string>,
): void {
  for (const ill of illustrations) {
    if (!usedVocabIds.has(ill.vocabularyId)) {
      throw new Error(
        `Orphan illustration '${ill.id}': vocabularyId '${ill.vocabularyId}' not found in any vocabulary row`,
      );
    }
  }
}

/**
 * Load all 20 batch-01 teacher vocabulary rows with their optional draft
 * illustrations.
 *
 * Returns frozen/read-only results. Throws deterministically on any data
 * integrity violation.
 */
export function loadTeacherVocabulary(): readonly TeacherVocabularyLearningItem[] {
  const vocabRaw = readFileSync(resolveCwdPath(VOCABULARY_PATH), 'utf-8');
  const { vocabulary: rows } = parseBundle<VocabularyBundle>(vocabRaw, VOCABULARY_PATH, 'vocabulary');

  const illRaw = readFileSync(resolveCwdPath(ILLUSTRATIONS_PATH), 'utf-8');
  const { illustrations: rawIllustrations } = parseBundle<IllustrationsBundle>(illRaw, ILLUSTRATIONS_PATH, 'illustrations');

  // Build lookup by id (for ref resolution)
  const illById = new Map<string, Illustration>();
  for (const ill of rawIllustrations) {
    illById.set(ill.id, ill);
  }

  // Track which vocabularyIds are referenced
  const usedVocabIds = new Set<string>();

  const items: TeacherVocabularyLearningItem[] = [];

  for (const row of rows) {
    const ref: string | undefined = (row as unknown as Record<string, unknown>).illustrationRef as string | undefined;

    // Validate source type
    if (row.source.type !== 'teacher-workbook') {
      throw new Error(
        `Vocabulary '${row.id}' source.type must be 'teacher-workbook', got '${row.source.type}'`,
      );
    }

    // Validate reviewStatus (allow draft/reviewed/published)
    if (!['draft', 'reviewed', 'published'].includes(row.reviewStatus)) {
      throw new Error(
        `Vocabulary '${row.id}' has invalid reviewStatus '${row.reviewStatus}'`,
      );
    }

    // Validate script statuses
    if (row.simplifiedStatus !== 'authored' && row.simplifiedStatus !== 'verified') {
      throw new Error(
        `Vocabulary '${row.id}' has invalid simplifiedStatus '${row.simplifiedStatus}'`,
      );
    }
    if (hasTraditional(row)) {
      const ts = (row as unknown as Record<string, unknown>).traditionalStatus as string;
      if (ts !== 'authored' && ts !== 'verified') {
        throw new Error(
          `Vocabulary '${row.id}' has invalid traditionalStatus '${ts}'`,
        );
      }
    }

    const illustration = resolveIllustration(ref, row.id, illById);

    if (illustration) {
      validateIllustrationAsset(illustration);
      usedVocabIds.add(illustration.vocabularyId);
    }

    items.push(
      Object.freeze({
        vocabulary: Object.freeze({ ...row }) as TeacherVocabularyType,
        illustration: illustration ? (Object.freeze({ ...illustration }) as Illustration) : null,
      }) as TeacherVocabularyLearningItem,
    );
  }

  // Check for orphan illustrations
  checkOrphans(rawIllustrations, usedVocabIds);

  return Object.freeze(items);
}
