import type { ProductionLearnerItem } from '../types/learnerCorpus';
import { loadProductionLearnerCorpus } from './loadProductionLearnerCorpus';

/** Serializable quiz payload built once at build time from the canonical #202
 * production learner corpus. Carries only opaque learner IDs — no simplified,
 * pinyin, Japanese, or illustration data — so the correct answers stay in the
 * client bundle (manifest import) and are never leaked into the serialized
 * HTML. */
export interface VocabularyQuizPayload {
  /** Opaque learner IDs eligible for the quiz (non-empty `japanese` meaning). */
  readonly eligibleIds: readonly string[];
}

/**
 * The non-secret subset serialized to the client: just the eligible opaque
 * IDs. `replace(/</g, '\\u003c')` prevents an attacker-influenced value from
 * breaking out of the inline script element.
 */
export function serializeVocabularyQuizPayload(payload: VocabularyQuizPayload): string {
  return JSON.stringify({ eligibleIds: payload.eligibleIds }).replace(/</g, '\\u003c');
}

/** Full-corpus quiz payload over the generated manifest. Fails closed on any
 * invalid manifest contract, missing/untracked asset, or bad dimensions. */
export function buildVocabularyQuizPayload(): VocabularyQuizPayload {
  return buildVocabularyQuizPayloadFromItems(loadProductionLearnerCorpus());
}

/** Pure payload construction over an arbitrary learner corpus, so the eligible
 * ID set is provably derived from the input rather than a hard-coded list.
 * Production wires the canonical #202 loader; a synthetic corpus exercises the
 * same derivation the route uses at build time. */
export function buildVocabularyQuizPayloadFromItems(
  items: readonly ProductionLearnerItem[],
): VocabularyQuizPayload {
  const eligibleIds: string[] = [];
  for (const item of items) {
    if (item.simplified.trim().length > 0 && (item.japanese?.trim().length ?? 0) > 0) {
      eligibleIds.push(item.learnerId);
    }
  }
  return { eligibleIds };
}
