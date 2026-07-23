/**
 * Mount the basic-vocabulary preview flashcard session.
 * Uses the production vocabularySession domain for deterministic
 * queue semantics, requeue, and completion logic.
 */

import {
  createVocabularySession,
  applyVocabularySessionAction,
} from '../domain/vocabularySession';
import type { VocabularySessionState } from '../domain/vocabularySession';

export interface PreviewWord {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  japanese: string;
}

export function mountPreviewSession(data: { words: PreviewWord[] }): void {
  const WORDS = data.words;
  const ids = WORDS.map((w) => w.id);
  const entryMap = new Map(WORDS.map((w) => [w.id, w]));

  const $ = <T extends HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null;

  const frontZh          = $<HTMLElement>('frontZh')!;
  const backPinyin       = $<HTMLElement>('backPinyin');
  const backJa           = $<HTMLElement>('backJa');
  const backTraditional  = $<HTMLElement>('backTraditional');
  const mockImage        = $<HTMLImageElement>('mockImage')!;
  const imgFallback      = $<HTMLElement>('imgFallback')!;
  const flashcardInner   = $<HTMLElement>('flashcardInner')!;
  const flashcardBack    = $<HTMLElement>('flashcardBack');
  const tapHint          = $<HTMLElement>('tapHint');
  const progressFill     = $<HTMLElement>('progressFill');
  const progressCount    = $<HTMLElement>('progressCount');
  const assessmentGroup  = $<HTMLElement>('assessmentGroup');
  const assessmentStrip  = $<HTMLElement>('assessmentStrip');
  const completionScreen = $<HTMLElement>('completionScreen');
  const statKnew  = $<HTMLElement>('statKnew');
  const statShaky = $<HTMLElement>('statShaky');
  const statRetry = $<HTMLElement>('statRetry');

  if (!frontZh || !mockImage || !flashcardInner) return;

  // ── Domain state ──────────────────────────────────────────────
  let state: VocabularySessionState = createVocabularySession(ids, 10, 'zh-to-ja');
  const allAttempts: string[] = [];

  // ── Image loading ─────────────────────────────────────────────
  function loadImage(word: PreviewWord): void {
    const url = 'https://picsum.photos/seed/' + word.id + '/960/720';
    mockImage.src = url;
    mockImage.alt = 'MOCK IMAGE — ' + word.simplified;
    if (imgFallback) imgFallback.style.display = 'flex';
    mockImage.style.display = 'none';
    mockImage.onload = function () {
      if (imgFallback) imgFallback.style.display = 'none';
      mockImage.style.display = 'block';
    };
    mockImage.onerror = function () {
      if (imgFallback) imgFallback.style.display = 'flex';
      mockImage.style.display = 'none';
    };
  }

  // ── Render ────────────────────────────────────────────────────
  function renderCard(): void {
    if (state.status !== 'active') return;
    const entry = entryMap.get(state.activeItemId);
    if (!entry) return;

    frontZh.textContent = entry.simplified;
    if (backPinyin) backPinyin.textContent = entry.pinyin;
    if (backJa) backJa.textContent = entry.japanese;
    if (backTraditional) backTraditional.textContent = entry.traditional;
    loadImage(entry);

    if (flashcardBack) {
      flashcardBack.classList.remove('flashcard-back--visible');
      flashcardBack.removeAttribute('tabindex');
    }
    if (tapHint) tapHint.classList.remove('flashcard__hint--hidden');
    if (assessmentGroup) assessmentGroup.classList.add('assessment-group--hidden');
    flashcardInner.setAttribute('role', 'button');
    flashcardInner.setAttribute('tabindex', '0');
    flashcardInner.setAttribute('aria-labelledby', 'frontZh');
    flashcardInner.setAttribute('aria-describedby', 'tapHint');

    updateProgress();
  }

  // ── Reveal ────────────────────────────────────────────────────
  function revealCard(): void {
    if (state.status !== 'active' || state.answerRevealed) return;
    const result = applyVocabularySessionAction(state, { kind: 'reveal' });
    if (result.kind !== 'accepted') return;
    state = result.state;

    if (assessmentStrip) {
      assessmentStrip.className = 'assessment-strip assessment-strip--empty';
      assessmentStrip.textContent = '';
    }
    if (flashcardBack) flashcardBack.classList.add('flashcard-back--visible');
    tapHint?.classList.add('flashcard__hint--hidden');
    if (assessmentGroup) assessmentGroup.classList.remove('assessment-group--hidden');
    flashcardInner.removeAttribute('role');
    flashcardInner.removeAttribute('tabindex');
    flashcardInner.setAttribute('aria-labelledby', 'backPinyin backJa backTraditional');
    flashcardInner.removeAttribute('aria-describedby');
    if (flashcardBack) {
      flashcardBack.setAttribute('tabindex', '-1');
      flashcardBack.focus();
    }
  }

  // ── Assessment ────────────────────────────────────────────────
  function assess(
    rating: 'again' | 'unsure' | 'known',
    labelKey: 'retry' | 'shaky' | 'knew',
  ): void {
    if (state.status !== 'active' || !state.answerRevealed) return;
    const activeId = state.activeItemId;
    const result = applyVocabularySessionAction(state, { kind: 'rate', rating });
    if (result.kind !== 'accepted') return;
    allAttempts.push(activeId);

    const labels: Record<string, string> = {
      retry: 'もう一度 — 忘れた',
      shaky: 'まだ曖昧 — もう少し',
      knew: '覚えた — 大丈夫',
    };
    const classes: Record<string, string> = {
      retry: 'assessment-strip assessment-strip--retry',
      shaky: 'assessment-strip assessment-strip--shaky',
      knew: 'assessment-strip assessment-strip--knew',
    };
    if (assessmentStrip) {
      assessmentStrip.className = classes[labelKey];
      assessmentStrip.textContent = labels[labelKey];
    }

    state = result.state;

    if (state.status === 'completed') {
      showCompletion();
    } else {
      renderCard();
      flashcardInner.focus();
    }
  }

  // ── Progress (unique cards completed / total) ─────────────────
  function updateProgress(): void {
    const completed = state.status === 'active' ? state.completedUniqueCount
      : state.completedUniqueCount;
    const total = state.selectedItemIds.length;
    const pct = (completed / total) * 100;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressCount) progressCount.textContent = completed + ' / ' + total;
  }

  // ── Completion ────────────────────────────────────────────────
  function showCompletion(): void {
    const flashcard = document.querySelector('.flashcard') as HTMLElement | null;
    if (flashcard) flashcard.style.display = 'none';
    tapHint?.classList.add('flashcard__hint--hidden');
    if (assessmentGroup) assessmentGroup.classList.add('assessment-group--hidden');
    if (assessmentStrip) {
      assessmentStrip.className = 'assessment-strip assessment-strip--empty';
      assessmentStrip.textContent = '';
    }
    if (completionScreen) completionScreen.classList.add('completion--visible');

    // Completion stats from state's attempt records
    if (statRetry) statRetry.textContent = '—';
    if (statShaky) statShaky.textContent = '—';
    if (statKnew) statKnew.textContent = String(state.completedUniqueCount);

    updateProgress();
    if (progressFill) progressFill.style.width = '100%';
    if (progressCount) progressCount.textContent =
      state.selectedItemIds.length + ' / ' + state.selectedItemIds.length;

    const completionTitle = $<HTMLElement>('completionTitle');
    if (completionTitle) completionTitle.focus();
  }

  // ── Restart ───────────────────────────────────────────────────
  function restart(): void {
    state = createVocabularySession(ids, 10, 'zh-to-ja');
    allAttempts.length = 0;
    if (completionScreen) completionScreen.classList.remove('completion--visible');
    const flashcard = document.querySelector('.flashcard') as HTMLElement | null;
    if (flashcard) flashcard.style.display = 'flex';
    if (assessmentStrip) {
      assessmentStrip.className = 'assessment-strip assessment-strip--empty';
      assessmentStrip.textContent = '';
    }
    renderCard();
    flashcardInner.focus();
  }

  // ── Events ────────────────────────────────────────────────────
  flashcardInner.addEventListener('click', function () {
    if (state.status === 'completed') return;
    revealCard();
  });
  flashcardInner.addEventListener('keydown', function (e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (state.status === 'completed') return;
      revealCard();
    }
  });

  $<HTMLButtonElement>('btnRetry')?.addEventListener('click', function () { assess('again', 'retry'); });
  $<HTMLButtonElement>('btnShaky')?.addEventListener('click', function () { assess('unsure', 'shaky'); });
  $<HTMLButtonElement>('btnKnew')?.addEventListener('click', function () { assess('known', 'knew'); });
  $<HTMLButtonElement>('btnRestart')?.addEventListener('click', restart);

  renderCard();
}
