/**
 * Mount the HSK flashcard session controller on the current page.
 *
 * Reads session data from a JSON-serialized attribute on the root element.
 * Contains all DOM lifecycle logic: session setup, card rendering, reveal,
 * rating, completion, and restart.
 *
 * Extracted from FlashcardSession.astro for testability. The Astro
 * component's <script> imports this function and calls it with the
 * server-rendered session data.
 */

import {
  createVocabularySession,
  applyVocabularySessionAction,
} from '../domain/vocabularySession';
import type { VocabularySessionState } from '../domain/vocabularySession';
import { VocabularyProgressStore } from '../domain/vocabularyProgress';

export interface SessionEntry {
  id: string;
  simplified: string;
  pinyin: string;
  japanese: string;
  traditional?: string;
}

export interface SessionData {
  ids: string[];
  entries: SessionEntry[];
}

export interface RemoteSessionData {
  ids: string[];
  answerSource: string;
}

interface AnswerPayload {
  version: 1;
  entries: SessionEntry[];
}

const LOAD_ERROR_MESSAGE =
  '単語データを読み込めませんでした。ページを再読み込みしてください。';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseAnswerPayload(payload: unknown, expectedIds: string[]): AnswerPayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) return null;
  if (candidate.entries.length !== expectedIds.length) return null;

  const seen = new Set<string>();
  const entries: SessionEntry[] = [];

  for (let index = 0; index < candidate.entries.length; index += 1) {
    const rawEntry = candidate.entries[index];
    if (!rawEntry || typeof rawEntry !== 'object') return null;

    const entry = rawEntry as Record<string, unknown>;
    if (
      !isNonEmptyString(entry.id) ||
      entry.id !== expectedIds[index] ||
      seen.has(entry.id) ||
      !isNonEmptyString(entry.simplified) ||
      !isNonEmptyString(entry.pinyin) ||
      !isNonEmptyString(entry.japanese) ||
      (entry.traditional !== undefined && !isNonEmptyString(entry.traditional))
    ) {
      return null;
    }

    seen.add(entry.id);
    entries.push({
      id: entry.id,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      japanese: entry.japanese,
      traditional: entry.traditional as string | undefined,
    });
  }

  return { version: 1, entries };
}

export async function mountRemoteFlashcardSession(data: RemoteSessionData): Promise<void> {
  const root = document.querySelector('.flashcard-session-root') as HTMLElement | null;
  const startButton = document.getElementById('btn-start') as HTMLButtonElement | null;
  const errorMessage = document.getElementById('session-load-error') as HTMLElement | null;
  if (!root || !startButton || !errorMessage) return;

  try {
    if (
      !Array.isArray(data.ids) ||
      data.ids.length === 0 ||
      data.ids.some((id) => !isNonEmptyString(id)) ||
      new Set(data.ids).size !== data.ids.length ||
      !isNonEmptyString(data.answerSource)
    ) {
      throw new Error('Invalid HSK session bootstrap data');
    }

    const answerUrl = new URL(data.answerSource, window.location.origin);
    if (answerUrl.origin !== window.location.origin) {
      throw new Error('HSK answer source must be same-origin');
    }

    const response = await fetch(answerUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HSK answer request failed: ${response.status}`);

    const payload = parseAnswerPayload(await response.json(), data.ids);
    if (!payload) throw new Error('Invalid HSK answer payload');

    mountFlashcardSession({ ids: data.ids, entries: payload.entries });
    startButton.disabled = false;
    startButton.removeAttribute('aria-busy');
  } catch {
    startButton.disabled = true;
    startButton.removeAttribute('aria-busy');
    errorMessage.textContent = LOAD_ERROR_MESSAGE;
    errorMessage.hidden = false;
  }
}

export function mountFlashcardSession(data: SessionData): void {
  const root = document.querySelector('.flashcard-session-root') as HTMLElement | null;
  if (!root) return;

  const allIds = data.ids;
  const rawEntries = data.entries;

  const entryMap = new Map(rawEntries.map((e) => [e.id, e]));

  function getEntry(id: string) {
    return entryMap.get(id);
  }

  // ── Page-memory preferences (not persisted) ───────────────────────────
  let sessionSize: 10 | 20 = 10;
  let direction: 'zh-to-ja' | 'ja-to-zh' = 'zh-to-ja';

  // ── Progress store ────────────────────────────────────────────────────
  let progressStore: InstanceType<typeof VocabularyProgressStore> | null = null;

  function getProgressStore(): InstanceType<typeof VocabularyProgressStore> {
    if (!progressStore) {
      progressStore = new VocabularyProgressStore();
    }
    return progressStore;
  }

  // ── Static DOM refs that don't change ─────────────────────────────────
  const setupPanel = document.getElementById('setup-panel') as HTMLElement;
  const sessionArea = document.getElementById('session-area') as HTMLElement;
  const setupCount = document.getElementById('setup-count') as HTMLElement;
  const completionTemplate = document.getElementById('completion-template') as HTMLTemplateElement;

  if (!setupPanel || !sessionArea || !completionTemplate) return;

  // ── Setup controls ────────────────────────────────────────────────────
  const sizeButtons = setupPanel.querySelectorAll('[data-size]');
  const dirButtons = setupPanel.querySelectorAll('[data-dir]');
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;

  // ── Refs rebuilt on each bindRefs ─────────────────────────────────────
  let progressEl: HTMLElement;
  let frontEl: HTMLElement;
  let backEl: HTMLElement;
  let pinyinEl: HTMLElement;
  let japaneseEl: HTMLElement;
  let traditionalEl: HTMLElement;
  let progressHintEl: HTMLElement;
  let btnReveal: HTMLButtonElement;
  let ratingActions: HTMLElement;
  let btnAgain: HTMLButtonElement;
  let btnUnsure: HTMLButtonElement;
  let btnKnown: HTMLButtonElement;
  let btnReset: HTMLButtonElement;
  let container: HTMLElement;

  function bindRefs() {
    progressEl = document.querySelector('[data-progress-text]') as HTMLElement;
    frontEl = document.querySelector('[data-front]') as HTMLElement;
    backEl = document.querySelector('[data-back]') as HTMLElement;
    pinyinEl = document.querySelector('[data-pinyin]') as HTMLElement;
    japaneseEl = document.querySelector('[data-japanese]') as HTMLElement;
    traditionalEl = document.querySelector('[data-traditional]') as HTMLElement;
    progressHintEl = document.querySelector('[data-progress-hint]') as HTMLElement;
    btnReveal = document.getElementById('btn-reveal') as HTMLButtonElement;
    ratingActions = document.getElementById('rating-actions') as HTMLElement;
    btnAgain = document.getElementById('btn-again') as HTMLButtonElement;
    btnUnsure = document.getElementById('btn-unsure') as HTMLButtonElement;
    btnKnown = document.getElementById('btn-known') as HTMLButtonElement;
    btnReset = document.getElementById('btn-reset-progress') as HTMLButtonElement;
    container = (root as HTMLElement).querySelector('.flashcard-container') as HTMLElement;
  }

  // ── Session state ─────────────────────────────────────────────────────
  let state: VocabularySessionState | null = null;

  function buildSession(): VocabularySessionState {
    const store = getProgressStore();
    const prioritized = store.prioritize(allIds);
    return createVocabularySession(prioritized, sessionSize, direction);
  }

  // ── Setup UI ──────────────────────────────────────────────────────────
  function updateSetupCount() {
    const count = Math.min(sessionSize, allIds.length);
    setupCount.textContent = `利用可能な単語: ${allIds.length}語（セッション: ${count}語）`;
  }

  function selectSize(size: 10 | 20) {
    sessionSize = size;
    sizeButtons.forEach((btn) => {
      const el = btn as HTMLButtonElement;
      const isActive = el.getAttribute('data-size') === String(size);
      el.classList.toggle('setup-option--active', isActive);
      el.setAttribute('aria-checked', String(isActive));
    });
    updateSetupCount();
  }

  function selectDirection(dir: 'zh-to-ja' | 'ja-to-zh') {
    direction = dir;
    dirButtons.forEach((btn) => {
      const el = btn as HTMLButtonElement;
      const isActive = el.getAttribute('data-dir') === dir;
      el.classList.toggle('setup-option--active', isActive);
      el.setAttribute('aria-checked', String(isActive));
    });
  }

  function showSetup() {
    setupPanel.classList.remove('hidden');
    sessionArea.classList.add('hidden');
    updateSetupCount();
  }

  function startSession() {
    state = buildSession();
    // When restarting after completion, restore card visibility that was
    // hidden by renderCompleted. The card DOM still exists (we only hide
    // it, not innerHTML = ''), so bindRefs() finds all elements.
    container.querySelector('.flashcard-card')?.classList.remove('hidden');
    container.querySelector('.flashcard-actions')?.classList.remove('hidden');
    const completionEl = container.querySelector('.flashcard-completion');
    if (completionEl) completionEl.remove();
    // Reset card to unrevealed state (restart after completion leaves
    // back/reveal/ratings in their last-completion visibility).
    backEl.classList.add('hidden');
    btnReveal.classList.remove('hidden');
    ratingActions.classList.add('hidden');
    setupPanel.classList.add('hidden');
    sessionArea.classList.remove('hidden');
    bindRefs();
    renderCard();
    updateProgress();
    updateResetButton();
    btnReveal?.focus();
  }

  // ── Card rendering ────────────────────────────────────────────────────
  function showProgressHint() {
    if (!progressHintEl) return;
    const activeId = state?.status === 'active' ? state.activeItemId : null;
    if (!activeId) { progressHintEl.classList.add('hidden'); return; }
    const st = getProgressStore().getStatus(activeId);
    const streak = getProgressStore().getKnownStreak(activeId);
    if (st === 'new' && streak === 0) {
      progressHintEl.classList.add('hidden');
    } else {
      progressHintEl.classList.remove('hidden');
      if (st === 'learned') {
        progressHintEl.textContent = '習得済み';
      } else if (streak > 0) {
        progressHintEl.textContent = `正解ストリーク: ${streak}`;
      } else {
        progressHintEl.textContent = '学習中';
      }
    }
  }

  function updateProgress() {
    if (state?.status === 'active' && progressEl) {
      progressEl.textContent = `${state.completedUniqueCount} / ${state.selectedItemIds.length}`;
    }
  }

  function renderCard() {
    if (!state || state.status !== 'active') return;
    const entry = getEntry(state.activeItemId);
    if (!entry) return;

    if (direction === 'ja-to-zh') {
      frontEl.textContent = entry.japanese;
      frontEl.lang = 'ja';
    } else {
      frontEl.textContent = entry.simplified;
      frontEl.lang = 'zh-Hans';
    }
    pinyinEl.textContent = '';
    japaneseEl.textContent = '';
    traditionalEl.textContent = '';
    traditionalEl.style.display = 'none';
    showProgressHint();
  }

  function renderAnswer(entry: SessionEntry) {
    pinyinEl.textContent = entry.pinyin;
    japaneseEl.textContent = direction === 'ja-to-zh' ? entry.simplified : entry.japanese;
    if (entry.traditional) {
      traditionalEl.textContent = entry.traditional;
      traditionalEl.style.display = '';
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────
  function revealAnswer() {
    const activeId = state?.status === 'active' ? state.activeItemId : null;
    if (!state || !activeId) return;
    const entry = getEntry(activeId);
    if (!entry) return;
    const result = applyVocabularySessionAction(state, { kind: 'reveal' });
    if (result.kind === 'accepted') {
      state = result.state;
      renderAnswer(entry);
      backEl.classList.remove('hidden');
      btnReveal.classList.add('hidden');
      ratingActions.classList.remove('hidden');
      progressHintEl.classList.add('hidden');
      btnAgain.focus();
    }
  }

  function applyRating(rating: 'again' | 'unsure' | 'known') {
    const activeId = state?.status === 'active' ? state.activeItemId : null;
    if (!state) return;
    const result = applyVocabularySessionAction(state, { kind: 'rate', rating });
    if (result.kind === 'accepted') {
      state = result.state;
    }

    if (activeId) {
      getProgressStore().applyRating(activeId, rating);
      updateResetButton();
    }

    if (state.status === 'completed') {
      renderCompleted();
      return;
    }

    backEl.classList.add('hidden');
    btnReveal.classList.remove('hidden');
    ratingActions.classList.add('hidden');
    renderCard();
    updateProgress();
  }

  function renderCompleted() {
    const clone = completionTemplate.content.cloneNode(true) as DocumentFragment;
    const completionRoot = clone.firstElementChild as HTMLElement | null;
    if (completionRoot) {
      const restartBtn = completionRoot.querySelector('#btn-restart') as HTMLButtonElement | null;
      if (restartBtn) {
        restartBtn.addEventListener('click', restartToSetup);
      }
    }
    // Hide card elements instead of destroying them, so restart can
    // restore card DOM without a full page reload.
    const card = container.querySelector('.flashcard-card');
    if (card) card.classList.add('hidden');
    const actions = container.querySelector('.flashcard-actions');
    if (actions) actions.classList.add('hidden');
    container.appendChild(clone);
    if (state?.status === 'completed' && progressEl) {
      progressEl.textContent = `${state.completedUniqueCount} / ${state.selectedItemIds.length}`;
    }
  }

  function restartToSetup() {
    state = null;
    showSetup();
  }

  // ── Reset ─────────────────────────────────────────────────────────────
  function updateResetButton() {
    if (!btnReset) return;
    const all = getProgressStore().getAllEntries();
    btnReset.hidden = Object.keys(all).length === 0;
  }

  function handleReset() {
    if (!confirm('HSKの学習進捗をリセットしますか？この操作は元に戻せません。')) return;
    getProgressStore().resetAll();
    updateResetButton();
  }

  // ── Event binding (called once at init; card elements persist across
  // restarts since renderCompleted now hides rather than destroys them) ──
  function bindEvents() {
    btnReveal?.addEventListener('click', revealAnswer);
    btnAgain?.addEventListener('click', () => applyRating('again'));
    btnUnsure?.addEventListener('click', () => applyRating('unsure'));
    btnKnown?.addEventListener('click', () => applyRating('known'));
  }

  // btnReset lives in sessionArea (outside container), so its listener is
  // bound once at init to avoid accumulation on repeated startSession calls.
  document.getElementById('btn-reset-progress')?.addEventListener('click', handleReset);

  // ── Global listeners ──────────────────────────────────────────────────
  window.addEventListener('pageshow', () => {
    if (progressStore) {
      progressStore.refresh();
      updateResetButton();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'chabiko:hsk-vocabulary-progress:v1') {
      if (progressStore) {
        progressStore.refresh();
        updateResetButton();
      }
    }
  });

  // ── Setup control bindings ────────────────────────────────────────────
  sizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const sz = Number(btn.getAttribute('data-size')) as 10 | 20;
      selectSize(sz);
    });
  });

  dirButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.getAttribute('data-dir') as 'zh-to-ja' | 'ja-to-zh';
      selectDirection(d);
    });
  });

  btnStart.addEventListener('click', startSession);

  // ── Initial state ─────────────────────────────────────────────────────
  bindRefs();
  bindEvents();
  updateResetButton();
  showSetup();
}
