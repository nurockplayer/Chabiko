import type { LearnerPartOfSpeech } from '../types/learnerManifest';
import type { ProductionLearnerItem } from '../types/learnerCorpus';
import { loadProductionLearnerCorpus } from './loadProductionLearnerCorpus';

/** A single learner-facing vocabulary detail record, exposing the full approved
 * learner data including the teacher-authored example sentence (#340). The
 * `example` is the only example-sentence field the approved source provides —
 * no Japanese translation or sentence pinyin is fabricated here. */
export interface BasicVocabularyDetailItem {
  readonly learnerId: string;
  readonly simplified: string;
  readonly traditional?: string;
  readonly pinyin?: string;
  readonly japanese?: string;
  readonly partOfSpeech: LearnerPartOfSpeech;
  readonly difficulty?: string;
  readonly example?: string;
}

/** Pure mapping from a corpus item to its learner-facing detail record. The
 * `example` field passes through verbatim — `undefined` is a supported
 * missing-example state, never fabricated. */
export function toBasicVocabularyDetailItem(
  item: ProductionLearnerItem,
): BasicVocabularyDetailItem {
  return {
    learnerId: item.learnerId,
    simplified: item.simplified,
    traditional: item.traditional,
    pinyin: item.pinyin,
    japanese: item.japanese,
    partOfSpeech: item.partOfSpeech,
    difficulty: item.difficulty,
    example: item.example,
  };
}

/**
 * Look up one learner vocabulary item by its stable opaque learner ID from the
 * canonical production learner corpus. Returns `null` when the ID is unknown,
 * so the detail route can render a deliberate not-found state.
 */
export function loadBasicVocabularyDetail(learnerId: string): BasicVocabularyDetailItem | null {
  const item = loadProductionLearnerCorpus().find((entry) => entry.learnerId === learnerId);
  return item ? toBasicVocabularyDetailItem(item) : null;
}
