import type { Illustration } from '../types/illustration';
import type { TeacherVocabularyType } from '../types/vocabulary';

// Legacy batch-01 compatibility adapter: preserves the original 20-item
// teacher-vocabulary contract for callers not yet migrated by #205. The
// canonical full learner corpus is loadProductionLearnerCorpus (Issue #202);
// this module is no longer a complete production corpus source of truth.
// Static imports for production data
import vocabData from '../../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json' assert { type: 'json' };
import illData from '../../data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json' assert { type: 'json' };

export interface TeacherVocabularyLearningItem {
  readonly vocabulary: TeacherVocabularyType;
  readonly illustration: Illustration | null;
}

type VocabRow = Record<string, unknown>;

// ─── Deep freezing helpers ──────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}

// ─── Private validation ─────────────────────────────────────────────────────

function validateTeacherVocabData(
  rows: VocabRow[],
  rawIllustrations: VocabRow[],
): void {
  // Duplicate vocabulary IDs
  const vocabIds = new Set<string>();
  for (const row of rows) {
    const id = row.id as string;
    if (vocabIds.has(id)) throw new Error(`Duplicate vocabulary id '${id}'`);
    vocabIds.add(id);
  }

  // Duplicate illustration IDs and vocabularyId links
  const illIds = new Set<string>();
  const illVocabIds = new Set<string>();
  for (const ill of rawIllustrations) {
    const iid = ill.id as string;
    if (illIds.has(iid)) throw new Error(`Duplicate illustration id '${iid}'`);
    illIds.add(iid);
    const vid = ill.vocabularyId as string;
    if (illVocabIds.has(vid)) throw new Error(`Duplicate illustration vocabularyId '${vid}' (illustration '${iid}')`);
    illVocabIds.add(vid);
  }

  const usedVocabIds = new Set<string>();

  for (const row of rows) {
    // source
    const src = row.source as { type: string } | undefined;
    if (!src || src.type !== 'teacher-workbook') {
      throw new Error(`Vocabulary '${row.id}' source.type must be 'teacher-workbook'`);
    }
    // reviewStatus
    if (row.reviewStatus !== 'draft') {
      throw new Error(`Vocabulary '${row.id}' reviewStatus must be 'draft', got '${row.reviewStatus}'`);
    }
    // simplifiedStatus
    if (row.simplifiedStatus !== 'authored') {
      throw new Error(`Vocabulary '${row.id}' simplifiedStatus must be 'authored'`);
    }
    // Traditional invariant
    if (row.traditional !== undefined) {
      if (row.traditionalStatus !== 'authored') {
        throw new Error(`Vocabulary '${row.id}' traditionalStatus must be 'authored' when traditional present`);
      }
    } else {
      if (row.traditionalStatus !== 'unavailable') {
        throw new Error(`Vocabulary '${row.id}' traditionalStatus must be 'unavailable' when traditional absent`);
      }
    }

    // illustrationRef resolution
    const ref = row.illustrationRef as string | undefined;
    if (ref !== undefined) {
      const matched = rawIllustrations.find(i => i.id === ref);
      if (!matched) {
        throw new Error(`illustrationRef '${ref}' on vocabulary '${row.id}' does not match any illustration id`);
      }
      if (matched.vocabularyId !== row.id) {
        throw new Error(`illustrationRef '${ref}' targets vocabularyId '${matched.vocabularyId}', expected '${row.id}'`);
      }
      // Validate illustration metadata
      if (matched.reviewStatus !== 'draft') {
        throw new Error(`Illustration '${matched.id}' reviewStatus must be 'draft'`);
      }
      const rights = matched.rights as { status: string; source: string; note: string };
      // Teacher-provided rights may be pending or approved (approved references
      // the canonical package rights record / product-owner attestation).
      if (rights.source !== 'teacher-provided' || (rights.status !== 'pending' && rights.status !== 'approved')) {
        throw new Error(`Illustration '${matched.id}' rights must be pending/approved with source teacher-provided`);
      }
      if (typeof rights.note !== 'string' || rights.note.trim() === '') {
        throw new Error(`Illustration '${matched.id}' rights.note must be a non-empty string`);
      }
      usedVocabIds.add(matched.vocabularyId as string);
    }
  }

  // Orphan check
  for (const ill of rawIllustrations) {
    if (!usedVocabIds.has(ill.vocabularyId as string)) {
      throw new Error(`Orphan illustration '${ill.id}': vocabularyId '${ill.vocabularyId}' has no matching vocabulary illustrationRef`);
    }
  }
}

// ─── Production export ──────────────────────────────────────────────────────

export function loadTeacherVocabulary(): readonly TeacherVocabularyLearningItem[] {
  const rows = (vocabData as { vocabulary: VocabRow[] }).vocabulary;
  const rawIllustrations = (illData as { illustrations: VocabRow[] }).illustrations;

  validateTeacherVocabData(rows, rawIllustrations);

  const illById = new Map<string, VocabRow>();
  for (const ill of rawIllustrations) illById.set(ill.id as string, ill);

  const items: TeacherVocabularyLearningItem[] = [];

  for (const row of rows) {
    const ref = row.illustrationRef as string | undefined;
    let illustration: Illustration | null = null;

    if (ref !== undefined) {
      const matched = illById.get(ref)!;
      illustration = structuredClone(matched) as unknown as Illustration;
    }

    items.push(deepFreeze({
      vocabulary: deepFreeze(structuredClone(row)) as unknown as TeacherVocabularyType,
      illustration,
    }) as TeacherVocabularyLearningItem);
  }

  return deepFreeze(items);
}
