/**
 * Dev-only teacher-preview flashcard entry.
 * Fetches the local session JSON at runtime.
 * Empty state is pre-rendered in the Astro markup; this script
 * only toggles visibility classes.
 */
import { mountPreviewSession } from '../client/previewSession';

(async function () {
  const sourceSha = document.getElementById('sourceSha');
  const sourceStatus = document.getElementById('sourceStatus');
  const flashcard = document.getElementById('flashcard');
  const emptyState = document.getElementById('emptyState');
  const assessmentStrip = document.getElementById('assessmentStrip');
  const assessmentGroup = document.getElementById('assessmentGroup');
  const tapHint = document.getElementById('tapHint');

  function showEmptyState(): void {
    if (flashcard) flashcard.classList.add('flashcard--hidden');
    if (emptyState) emptyState.classList.add('source-not-generated--visible');
    if (assessmentStrip) assessmentStrip.classList.add('assessment-strip--empty');
    if (assessmentGroup) assessmentGroup.classList.add('assessment-group--hidden');
    if (tapHint) tapHint.classList.add('flashcard__hint--hidden');
    if (sourceSha) sourceSha.textContent = '—';
    if (sourceStatus) {
      sourceStatus.textContent = 'LOCAL SOURCE NOT GENERATED';
      sourceStatus.style.background = '#fee2e2';
      sourceStatus.style.color = '#991b1b';
    }
  }

  try {
    const res = await fetch('/assets/dev/teacher-vocabulary-preview/teacher-vocabulary-preview.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data.items || []).slice(0, 10);

    if (items.length < 10) throw new Error('fewer than 10 items');

    if (sourceSha) sourceSha.textContent = (data.sourceWorkbookSha256 || '').slice(0, 16) + '…';
    if (sourceStatus) sourceStatus.textContent = data.status || 'unknown';

    const sessionItems = items.map((item: Record<string, unknown>) => ({
      id: item.id,
      simplified: item.simplified,
      traditional: '',
      pinyin: item.pinyin,
      japanese: item.japanese,
      localImagePath: item.imagePath || undefined,
      localImageAlt: item.imagePath ? item.simplified : undefined,
    }));

    // Hide empty state, show flashcard
    if (flashcard) flashcard.classList.remove('flashcard--hidden');
    if (emptyState) emptyState.classList.remove('source-not-generated--visible');

    mountPreviewSession({ words: sessionItems }, 'placeholder');
  } catch {
    showEmptyState();
  }
})();
