import { readFileSync } from 'node:fs';
import type { LearnerManifest, LearnerManifestRow } from '../types/learnerManifest';
import type { ProductionLearnerItem, ProductionTeacherPhrase } from '../types/learnerCorpus';
import {
  assertOptionalFieldsAreNotFabricated,
  validateLearnerManifest,
} from './validateLearnerManifest';
import { validateTeacherPhraseProjection } from './validateTeacherPhraseProjection';
import { parseWebpDimensions } from './webpDimensions';
import manifestData from '../../data/teacher-vocabulary-preview/learner-manifest.json' assert { type: 'json' };
import productionIllustrationData from '../../data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json' assert { type: 'json' };
import promotedProjectionData from '../../data/teacher-vocabulary-preview/teacher-phrase-promoted.json' assert { type: 'json' };

/** Frozen #202 accessible fallback for corpus images without authored Japanese
 * alt text: the illustration is decorative and the card's simplified Chinese
 * text is the accessible content (same treatment as the preview browser). */
export const DECORATIVE_ALT_JA = '';

export interface LoadProductionLearnerCorpusOptions {
  /** Git-tracked-asset probe, forwarded to validateLearnerManifest. */
  assetTracked?: (assetPath: string) => boolean;
  /** Read the deployed asset bytes. Defaults to `public${assetPath}` on disk. */
  readAssetBytes?: (assetPath: string) => Uint8Array;
  /** Test/validation injection point. Production uses the committed promoted
   * projection and never imports the draft sidecar or mutable review artifact. */
  promotedProjection?: unknown;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}

const manifest = manifestData as LearnerManifest;

/** vocabularyId -> authored Japanese alt text, from the immutable production
 * illustration records. Only the 19 image-bearing production IDs appear here. */
const productionAltJa = new Map<string, string>();
for (const illustration of (productionIllustrationData as { illustrations: { vocabularyId: string; altJa: string }[] }).illustrations) {
  productionAltJa.set(illustration.vocabularyId, illustration.altJa);
}

function toLearnerItem(
  row: LearnerManifestRow,
  dimensions: { width: number; height: number },
  altJa: string,
  teacherPhrases: readonly ProductionTeacherPhrase[] | undefined,
): ProductionLearnerItem {
  const item: ProductionLearnerItem = {
    learnerId: row.learnerId,
    simplified: row.simplified,
    partOfSpeech: row.partOfSpeech,
    traditional: row.traditional,
    pinyin: row.pinyin,
    japanese: row.japanese,
    difficulty: row.difficulty,
    example: row.example,
    ...(teacherPhrases === undefined ? {} : { teacherPhrases }),
    illustration: {
      assetPath: row.image.assetPath,
      width: dimensions.width,
      height: dimensions.height,
      altJa,
      state: row.image.state,
      provenance: row.image.provenance,
    },
  };
  return deepFreeze(item) as ProductionLearnerItem;
}

/**
 * Canonical production learner corpus over the #201 generated manifest.
 *
 * Every eligible manifest row is returned, in manifest order, with an
 * illustration whose dimensions are parsed from the deployed WebP asset and
 * whose alt text is either the authored Japanese text (production 19) or the
 * frozen decorative fallback. Fails closed on any invalid manifest contract,
 * missing/untracked asset, invalid dimensions, or contradictory metadata.
 * The returned collection, items, and nested illustration values are deeply
 * frozen; each call produces independent references.
 */
export function loadProductionLearnerCorpus(
  options: LoadProductionLearnerCorpusOptions = {},
): readonly ProductionLearnerItem[] {
  const readAssetBytes = options.readAssetBytes
    ?? ((assetPath: string) => readFileSync(`public${assetPath}`));

  validateLearnerManifest(manifest, { assetTracked: options.assetTracked });
  assertOptionalFieldsAreNotFabricated(manifest.rows);
  const promotedByLearnerId = validateTeacherPhraseProjection(
    options.promotedProjection ?? promotedProjectionData,
    manifest,
  );

  const items: ProductionLearnerItem[] = [];
  for (const row of manifest.rows) {
    const dimensions = parseWebpDimensions(readAssetBytes(row.image.assetPath));
    let altJa: string;
    if (row.learnerId.startsWith('teacher-star-')) {
      const authored = productionAltJa.get(row.learnerId);
      if (authored === undefined) {
        throw new Error(`production learner '${row.learnerId}' has no authored Japanese alt text`);
      }
      altJa = authored;
    } else {
      altJa = DECORATIVE_ALT_JA;
    }
    items.push(toLearnerItem(row, dimensions, altJa, promotedByLearnerId.get(row.learnerId)));
  }

  return deepFreeze(items) as readonly ProductionLearnerItem[];
}
