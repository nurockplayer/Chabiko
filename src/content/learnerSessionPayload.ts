import type { ProductionLearnerItem } from '../types/learnerCorpus';
import { loadProductionLearnerCorpus } from './loadProductionLearnerCorpus';

/** Learner-facing illustration render data. The image is answer feedback shown
 * only after 「答えを見る」 (#356), never a pre-reveal hint, so its metadata is
 * non-secret: the asset URL / dimensions / alt text alone cannot reveal the
 * answer (pinyin / japanese / traditional) that the learner must recall.
 * pinyin/japanese/traditional are deliberately excluded so the serialized
 * payload never leaks hidden answers into initial HTML. */
export interface LearnerRenderIllustration {
  readonly assetPath: string;
  readonly width: number;
  readonly height: number;
  readonly altJa: string;
}

/** Serializable session payload built once at build time from the canonical
 * #202 production learner corpus. `ids` is the full manifest-ordered opaque
 * learner ID list (the same opaque-ID/data contract the route already used);
 * `render` maps each learnerId to the image metadata the client needs to draw
 * the revealed illustration. Answers live in the client bundle (manifest
 * import), never here. */
export interface LearnerSessionPayload {
  readonly totalCount: number;
  readonly ids: readonly string[];
  readonly render: Readonly<Record<string, LearnerRenderIllustration>>;
  /** First corpus item for the server-rendered opening card (front only:
   * simplified; the image is added client-side together with the answer on
   * reveal, and answer fields are never serialized). */
  readonly first: {
    readonly learnerId: string;
    readonly simplified: string;
  } | null;
}

/** The non-secret subset of the payload serialized to the client. Deliberately
 * excludes `ids` (they live in the root data attribute) and `first` (SSR-only),
 * and never carries answer fields. `replace(/</g, '\\u003c')` prevents an
 * attacker-influenced value from breaking out of the inline script element. */
export function serializeLearnerSessionPayload(payload: LearnerSessionPayload): string {
  return JSON.stringify({
    totalCount: payload.totalCount,
    render: payload.render,
  }).replace(/</g, '\\u003c');
}

/** Full-corpus payload over the generated manifest. Fails closed on any
 * invalid manifest contract, missing/untracked asset, or bad dimensions. */
export function buildLearnerSessionPayload(): LearnerSessionPayload {
  return buildLearnerSessionPayloadFromItems(loadProductionLearnerCorpus());
}

/** Pure payload construction over an arbitrary learner corpus, so route counts
 * and render metadata are provably derived from the input corpus rather than a
 * hard-coded total. Production wires the canonical #202 loader; a synthetic
 * corpus exercises the same derivation the route uses at build time. */
export function buildLearnerSessionPayloadFromItems(
  items: readonly ProductionLearnerItem[],
): LearnerSessionPayload {
  const ids: string[] = [];
  const render: Record<string, LearnerRenderIllustration> = {};
  for (const item of items) {
    ids.push(item.learnerId);
    render[item.learnerId] = {
      assetPath: item.illustration.assetPath,
      width: item.illustration.width,
      height: item.illustration.height,
      altJa: item.illustration.altJa,
    };
  }
  const firstItem = items[0];
  const first = firstItem
    ? { learnerId: firstItem.learnerId, simplified: firstItem.simplified }
    : null;
  return { totalCount: ids.length, ids, render, first };
}
