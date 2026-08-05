import type { LearnerPartOfSpeech } from '../types/learnerManifest';
import { loadProductionLearnerCorpus } from './loadProductionLearnerCorpus';

/** A single deterministic, production-backed basic-vocabulary catalog item.
 *
 * Fields are copied one-for-one from the canonical #202 production learner
 * corpus (the same truth the existing session route consumes). Only the fields
 * declared here are exposed: opaque `learnerId` values are preserved verbatim,
 * optional fields are copied only when truthfully present, and preview-only
 * surface (source sheet/row, checksums, review evidence, prompt metadata,
 * image state/provenance) is never leaked. */
export interface BasicVocabularyCatalogItem {
  readonly learnerId: string;
  readonly simplified: string;
  readonly traditional?: string;
  readonly pinyin?: string;
  readonly japanese?: string;
  readonly partOfSpeech: LearnerPartOfSpeech;
  readonly difficulty?: string;
  readonly illustration: {
    readonly assetPath: string;
    readonly width: number;
    readonly height: number;
    readonly altJa: string;
  };
}

/**
 * Load the deterministic basic-vocabulary catalog.
 *
 * Consumes only `loadProductionLearnerCorpus()` and maps every production item
 * exactly once in loader order. The count is derived from the loader, never
 * hard-coded. Each call maps fresh item objects that are deeply frozen (the
 * canonical loader already returns independent deep-frozen references per
 * call), so repeated calls return equivalent data and cannot mutate the
 * canonical loader result.
 *
 * Fails closed: the existing production loader validation is allowed to throw;
 * nothing here catches or fabricates rows.
 */
export function loadBasicVocabularyCatalog(): readonly BasicVocabularyCatalogItem[] {
  const corpus = loadProductionLearnerCorpus();
  const items: BasicVocabularyCatalogItem[] = new Array(corpus.length);
  for (let index = 0; index < corpus.length; index++) {
    const source = corpus[index];
    const item: BasicVocabularyCatalogItem = {
      learnerId: source.learnerId,
      simplified: source.simplified,
      traditional: source.traditional,
      pinyin: source.pinyin,
      japanese: source.japanese,
      partOfSpeech: source.partOfSpeech,
      difficulty: source.difficulty,
      illustration: {
        assetPath: source.illustration.assetPath,
        width: source.illustration.width,
        height: source.illustration.height,
        altJa: source.illustration.altJa,
      },
    };
    items[index] = deepFreeze(item) as BasicVocabularyCatalogItem;
  }
  return items;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}
