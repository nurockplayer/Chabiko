import { buildLearnerSessionPayload } from '../../src/content/learnerSessionPayload';

/** The full SSR render payload exactly as the route emits it: every corpus
 * item's learnerId maps to its resolved WebP dimensions and alt text. */
const fullRenderPayload = buildLearnerSessionPayload();

/** Production image-bearing IDs used by session-lifecycle tests. The original
 * batch-01 test fixture included the text-only 小姐/女士 row; that row is
 * excluded from the production learner manifest (Issue #205), so tests now use
 * three image-bearing production IDs. */
export const SESSION_IDS = [
  'teacher-star-1-37e0eb213f0f', // 大家
  'teacher-star-1-a66948a76fda', // 人
  'teacher-star-1-bdc7865a507e', // 朋友
] as const;

/** Restrict the render payload to exactly the given IDs, reusing the SSR
 * payload's resolved dimensions so tests stay in sync with production. */
export function renderPayloadFor(
  ids: readonly string[],
): { totalCount: number; render: Record<string, unknown> } {
  const render: Record<string, unknown> = {};
  for (const id of ids) {
    const illustration = fullRenderPayload.render[id];
    if (illustration) {
      render[id] = { ...illustration };
    }
  }
  return { totalCount: fullRenderPayload.totalCount, render };
}

/** Create a session root with the opaque IDs data attribute and the inline
 * render payload, mirroring what the route/component emit at build time. */
export function createSessionRoot(
  ids: readonly string[],
  sizeAttr = '10',
): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyIds = JSON.stringify([...ids]);
  root.dataset.basicVocabularySessionSize = sizeAttr;
  const payload = renderPayloadFor(ids);
  root.innerHTML =
    '<p data-total></p><p data-summary></p><p data-progress aria-live="polite"></p><div data-card></div><button data-action="reset">reset</button>' +
    `<script type="application/json" id="basic-vocabulary-data">${JSON.stringify(payload)}</script>`;
  document.body.append(root);
  return root;
}
