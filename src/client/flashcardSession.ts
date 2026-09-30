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
import {
  FALLBACK_ANNOTATION,
  selectScript,
  type ScriptStatus,
} from '../domain/scriptSelection';
import type { ScriptPreference } from '../lib/scriptPreference';
import { VocabularyProgressStore } from '../domain/vocabularyProgress';
import { SCRIPT_PREFERENCE_EVENT } from './scriptPreferenceControl';

const sessionCleanups = new WeakMap<HTMLElement, () => void>();

export interface SessionEntry {
  id: string;
  simplified: string;
  simplifiedStatus: 'authored' | 'verified';
  pinyin: string;
  japanese: string;
  traditional?: string;
  traditionalStatus?: ScriptStatus;
}

export interface SessionData {
  ids: string[];
  entries: SessionEntry[];
  newPoolIds?: string[];
}

export interface RemoteSessionData {
  ids: string[];
  newPoolIds: string[];
  answerSource: string;
}

interface AnswerPayload {
  version: 1;
  entries: SessionEntry[];
}

const SCRIPT_STATUSES: readonly ScriptStatus[] = [
  'authored', 'verified', 'generated', 'unavailable', 'absent',
];

function isScriptStatus(value: unknown): value is ScriptStatus {
  return SCRIPT_STATUSES.includes(value as ScriptStatus);
}

function isDirectScriptStatus(value: unknown): value is 'authored' | 'verified' {
  return value === 'authored' || value === 'verified';
}

function currentScriptPreference(): ScriptPreference {
  const value = document.documentElement.dataset.scriptPreference;
  return value === 'traditional' || value === 'simplified' || value === 'path-default'
    ? value
    : 'path-default';
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
      !isDirectScriptStatus(entry.simplifiedStatus) ||
      !isNonEmptyString(entry.pinyin) ||
      !isNonEmptyString(entry.japanese) ||
      (entry.traditional !== undefined && !isNonEmptyString(entry.traditional)) ||
      (entry.traditionalStatus !== undefined && !isScriptStatus(entry.traditionalStatus)) ||
      (isDirectScriptStatus(entry.traditionalStatus) && !isNonEmptyString(entry.traditional))
    ) {
      return null;
    }

    seen.add(entry.id);
    entries.push({
      id: entry.id,
      simplified: entry.simplified,
      simplifiedStatus: entry.simplifiedStatus,
      pinyin: entry.pinyin,
      japanese: entry.japanese,
      traditional: entry.traditional as string | undefined,
      traditionalStatus: entry.traditionalStatus as ScriptStatus | undefined,
    });
  }

  return { version: 1, entries };
}

export async function mountRemoteFlashcardSession(data: RemoteSessionData): Promise<() => void> {
  const root = document.querySelector('.flashcard-session-root') as HTMLElement | null;
  const startButton = document.getElementById('btn-start') as HTMLButtonElement | null;
  const errorMessage = document.getElementById('session-load-error') as HTMLElement | null;
  if (!root || !startButton || !errorMessage) return () => undefined;

  try {
    if (
      !Array.isArray(data.ids) ||
      data.ids.length === 0 ||
      data.ids.some((id) => !isNonEmptyString(id)) ||
      new Set(data.ids).size !== data.ids.length ||
      !Array.isArray(data.newPoolIds) ||
      data.newPoolIds.some((id) => !isNonEmptyString(id) || !data.ids.includes(id)) ||
      new Set(data.newPoolIds).size !== data.newPoolIds.length ||
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

    const cleanup = mountFlashcardSession({ ids: data.ids, newPoolIds: data.newPoolIds, entries: payload.entries });
    startButton.disabled = false;
    startButton.removeAttribute('aria-busy');
    return cleanup;
  } catch {
    startButton.disabled = true;
    startButton.removeAttribute('aria-busy');
    errorMessage.textContent = LOAD_ERROR_MESSAGE;
    errorMessage.hidden = false;
    return () => undefined;
  }
}

export function mountFlashcardSession(data: SessionData): () => void {
  const root = document.querySelector('.flashcard-session-root') as HTMLElement | null;
  if (!root) return () => undefined;
  sessionCleanups.get(root)?.();

  const allIds = data.ids;
  const newPoolIds = data.newPoolIds ?? [];
  const rawEntries = data.entries;

  const entryMap = new Map(rawEntries.map((e) => [e.id, e]));

  function getEntry(id: string) {
    return entryMap.get(id);
  }

  // ── Page-memory preferences (not persisted) ───────────────────────────
  let sessionSize: 10 | 20 = 10;
  let direction: 'zh-to-ja' | 'ja-to-zh' = 'zh-to-ja';
  let pool: 'full' | 'new' = 'full';

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

  if (!setupPanel || !sessionArea || !completionTemplate) return () => undefined;
  const listeners = new AbortController();
  const listenerOptions: AddEventListenerOptions = { signal: listeners.signal };

  // ── Setup controls ────────────────────────────────────────────────────
  const sizeButtons = setupPanel.querySelectorAll('[data-size]');
  const dirButtons = setupPanel.querySelectorAll('[data-dir]');
  const poolInputs = setupPanel.querySelectorAll<HTMLInputElement>('[data-pool]');
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;

  // ── Refs rebuilt on each bindRefs ─────────────────────────────────────
  let progressEl: HTMLElement;
  let frontEl: HTMLElement;
  let backEl: HTMLElement;
  let pinyinEl: HTMLElement;
  let japaneseEl: HTMLElement;
  let promptFallbackEl: HTMLElement;
  let answerFallbackEl: HTMLElement;
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
    promptFallbackEl = document.querySelector('[data-prompt-fallback]') as HTMLElement;
    answerFallbackEl = document.querySelector('[data-answer-fallback]') as HTMLElement;
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
    const selectedIds = pool === 'new' ? newPoolIds : allIds;
    const prioritized = store.prioritize(selectedIds);
    return createVocabularySession(prioritized, sessionSize, direction);
  }

  // ── Setup UI ──────────────────────────────────────────────────────────
  function updateSetupCount() {
    const availableCount = (pool === 'new' ? newPoolIds : allIds).length;
    const count = Math.min(sessionSize, availableCount);
    setupCount.textContent = `利用可能な単語: ${availableCount}語（セッション: ${count}語）`;
  }

  function lockSetupControls(locked: boolean) {
    setupPanel.querySelectorAll<HTMLButtonElement>('[data-size], [data-dir]')
      .forEach((button) => {
        button.disabled = locked;
      });
    poolInputs.forEach((input) => {
      input.disabled = locked || (input.value === 'new' && newPoolIds.length === 0);
    });
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

  function selectPool(nextPool: 'full' | 'new') {
    if (state?.status === 'active' || (nextPool === 'new' && newPoolIds.length === 0)) {
      poolInputs.forEach((input) => { input.checked = input.value === pool; });
      return;
    }
    pool = nextPool;
    poolInputs.forEach((input) => {
      const isActive = input.value === nextPool;
      input.checked = isActive;
      input.closest('label')?.classList.toggle('setup-option--active', isActive);
    });
    updateSetupCount();
  }

  function showSetup() {
    setupPanel.classList.remove('hidden');
    sessionArea.classList.add('hidden');
    lockSetupControls(false);
    updateSetupCount();
  }

  function restorePoolSelectionFromControls() {
    const selectedInput = Array.from(poolInputs).find((input) => input.checked);
    pool = selectedInput?.value === 'new' && newPoolIds.length > 0 ? 'new' : 'full';
    poolInputs.forEach((input) => {
      const isActive = input.value === pool;
      input.checked = isActive;
      input.closest('label')?.classList.toggle('setup-option--active', isActive);
    });
  }

  function startSession() {
    state = buildSession();
    lockSetupControls(true);
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
      promptFallbackEl.textContent = '';
      promptFallbackEl.hidden = true;
    } else {
      renderChinese(frontEl, promptFallbackEl, entry);
    }
    pinyinEl.textContent = '';
    japaneseEl.textContent = '';
    japaneseEl.removeAttribute('lang');
    answerFallbackEl.textContent = '';
    answerFallbackEl.hidden = true;
    showProgressHint();
  }

  function renderChinese(target: HTMLElement, fallback: HTMLElement, entry: SessionEntry) {
    const preference = currentScriptPreference();
    const selection = selectScript(entry.simplified, entry.simplifiedStatus, preference, {
      simplified: entry.simplified,
      simplifiedStatus: entry.simplifiedStatus,
      traditional: entry.traditional,
      traditionalStatus: entry.traditionalStatus,
    });
    if (selection.status === 'unavailable') {
      target.textContent = '';
      target.removeAttribute('lang');
      fallback.textContent = '';
      fallback.hidden = true;
      return;
    }
    const usesTraditional = preference === 'traditional' &&
      typeof entry.traditional === 'string' &&
      isDirectScriptStatus(entry.traditionalStatus);
    target.textContent = selection.script;
    target.lang = usesTraditional ? 'zh-Hant' : 'zh-Hans';
    fallback.textContent = selection.isFallback
      ? selection.fallbackReason ?? FALLBACK_ANNOTATION
      : '';
    fallback.hidden = !selection.isFallback;
  }

  function renderAnswer(entry: SessionEntry) {
    if (direction === 'ja-to-zh') {
      renderChinese(japaneseEl, answerFallbackEl, entry);
    } else {
      japaneseEl.textContent = entry.japanese;
      japaneseEl.lang = 'ja';
      answerFallbackEl.textContent = '';
      answerFallbackEl.hidden = true;
    }
    pinyinEl.textContent = entry.pinyin;
  }

  function handleScriptPreferenceChange() {
    if (state?.status !== 'active') return;
    const entry = getEntry(state.activeItemId);
    if (!entry) return;
    if (direction === 'zh-to-ja') {
      renderChinese(frontEl, promptFallbackEl, entry);
      return;
    }
    if (!backEl.classList.contains('hidden')) {
      renderChinese(japaneseEl, answerFallbackEl, entry);
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
        restartBtn.addEventListener('click', restartToSetup, listenerOptions);
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
    btnReveal?.addEventListener('click', revealAnswer, listenerOptions);
    btnAgain?.addEventListener('click', () => applyRating('again'), listenerOptions);
    btnUnsure?.addEventListener('click', () => applyRating('unsure'), listenerOptions);
    btnKnown?.addEventListener('click', () => applyRating('known'), listenerOptions);
  }

  // btnReset lives in sessionArea (outside container), so its listener is
  // bound once at init to avoid accumulation on repeated startSession calls.
  document.getElementById('btn-reset-progress')?.addEventListener('click', handleReset, listenerOptions);

  // ── Global listeners ──────────────────────────────────────────────────
  window.addEventListener('pageshow', () => {
    if (progressStore) {
      progressStore.refresh();
      updateResetButton();
    }
  }, listenerOptions);

  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'chabiko:hsk-vocabulary-progress:v1') {
      if (progressStore) {
        progressStore.refresh();
        updateResetButton();
      }
    }
  }, listenerOptions);

  document.addEventListener(SCRIPT_PREFERENCE_EVENT, handleScriptPreferenceChange, listenerOptions);

  // ── Setup control bindings ────────────────────────────────────────────
  sizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state?.status === 'active') return;
      const sz = Number(btn.getAttribute('data-size')) as 10 | 20;
      selectSize(sz);
    }, listenerOptions);
  });

  dirButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state?.status === 'active') return;
      const d = btn.getAttribute('data-dir') as 'zh-to-ja' | 'ja-to-zh';
      selectDirection(d);
    }, listenerOptions);
  });

  poolInputs.forEach((input) => {
    input.addEventListener('change', () => {
      selectPool(input.value as 'full' | 'new');
    }, listenerOptions);
  });

  btnStart.addEventListener('click', startSession, listenerOptions);

  // ── Initial state ─────────────────────────────────────────────────────
  bindRefs();
  bindEvents();
  restorePoolSelectionFromControls();
  lockSetupControls(false);
  updateResetButton();
  showSetup();

  const cleanup = () => {
    listeners.abort();
    if (sessionCleanups.get(root) === cleanup) sessionCleanups.delete(root);
  };
  sessionCleanups.set(root, cleanup);
  return cleanup;
}
