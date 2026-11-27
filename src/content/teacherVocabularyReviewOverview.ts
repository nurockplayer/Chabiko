import manifestData from '../../data/teacher-vocabulary-preview/learner-manifest.json';
import type { LearnerManifest } from '../types/learnerManifest';

/** A deliberately narrow, teacher-readable projection of the production
 * vocabulary corpus. It is read-only: decision authority remains exclusively
 * in the campaign-specific #363 API and is not represented here. */
export interface TeacherVocabularyReviewItem {
  readonly learnerId: string;
  readonly simplified: string;
  readonly traditional?: string;
  readonly pinyin?: string;
  readonly japanese?: string;
  readonly partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb';
  readonly sourceSheet: string;
  readonly sourceRow: number;
}

const manifest = manifestData as LearnerManifest;

/**
 * Returns production vocabulary in its existing learner/manifest order.
 * Source sheet and row are projected only as a human-readable review locator;
 * workbook fingerprints, image provenance, reviewStatus, and all other
 * engineering metadata remain private to their respective contracts.
 */
export function loadTeacherVocabularyReviewOverview(): readonly TeacherVocabularyReviewItem[] {
  if (manifest.rows.length === 0) throw new Error('teacher vocabulary review overview is empty');
  return Object.freeze(manifest.rows.map((row) => Object.freeze({
    learnerId: row.learnerId,
    simplified: row.simplified,
    traditional: row.traditional,
    pinyin: row.pinyin,
    japanese: row.japanese,
    partOfSpeech: row.partOfSpeech,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
  })));
}
