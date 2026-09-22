import manifestData from '../../data/teacher-vocabulary-preview/learner-manifest.json' assert { type: 'json' };
import { loadProductionLearnerCorpus } from './loadProductionLearnerCorpus';
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

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.getOwnPropertyNames(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Returns production vocabulary in its existing learner/manifest order.
 * Source sheet and row are projected only as a human-readable review locator;
 * workbook fingerprints, image provenance, reviewStatus, and all other
 * engineering metadata remain private to their respective contracts.
 */
export function loadTeacherVocabularyReviewOverview(): readonly TeacherVocabularyReviewItem[] {
  const production = loadProductionLearnerCorpus();
  if (production.length !== manifest.rows.length) {
    throw new Error('teacher vocabulary review overview does not match production manifest length');
  }

  const items = production.map((item, index) => {
    const source = manifest.rows[index];
    if (source === undefined || source.learnerId !== item.learnerId) {
      throw new Error('teacher vocabulary review overview lost production ordering');
    }
    return deepFreeze({
      learnerId: item.learnerId,
      simplified: item.simplified,
      traditional: item.traditional,
      pinyin: item.pinyin,
      japanese: item.japanese,
      partOfSpeech: item.partOfSpeech,
      sourceSheet: source.sourceSheet,
      sourceRow: source.sourceRow,
    });
  });
  return deepFreeze(items) as readonly TeacherVocabularyReviewItem[];
}
