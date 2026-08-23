import {
  V2_REFERENCE_EVIDENCE_STORAGE_KEY,
  parseV2ReferenceEvidence,
  summarizeV2ReferenceEvidence,
  type V2ReferenceEvidence,
} from '../domain/v2ReferenceFlow';

export function mountV2ReferenceResult(root: HTMLElement): void {
  if (root.dataset.v2ResultMounted === 'true') return;
  root.dataset.v2ResultMounted = 'true';

  const evidenceRoot = root.querySelector<HTMLElement>('[data-v2-evidence]');
  const summary = root.querySelector<HTMLElement>('[data-v2-evidence-summary]');
  const method = root.querySelector<HTMLElement>('[data-v2-evidence-method]');
  const empty = root.querySelector<HTMLElement>('[data-v2-evidence-empty]');
  if (!evidenceRoot || !summary || !method || !empty) return;

  let evidence: V2ReferenceEvidence | undefined;
  try {
    const raw = sessionStorage.getItem(V2_REFERENCE_EVIDENCE_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      evidence = parseV2ReferenceEvidence(parsed);
    }
  } catch {
    // An unavailable or malformed store stays in the honest empty state.
  }

  if (!evidence) return;

  summary.textContent = summarizeV2ReferenceEvidence(evidence);
  method.textContent = evidence.usedReveal
    ? `答えを確認 → ${evidence.attempt}回目に自分で再構成`
    : evidence.usedHint
      ? `ヒントを使用 → ${evidence.attempt}回目に自分で再構成`
      : `${evidence.attempt}回目に答えを見ずに再構成`;
  evidenceRoot.hidden = false;
  empty.hidden = true;
}
