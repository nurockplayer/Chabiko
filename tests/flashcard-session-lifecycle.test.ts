// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mountFlashcardSession,
} from '../src/client/flashcardSession';
import type { SessionData } from '../src/client/flashcardSession';
import { SCRIPT_PREFERENCE_EVENT } from '../src/client/scriptPreferenceControl';
import { initScriptPreferenceControl } from '../src/client/scriptPreferenceControl';
import { SCRIPT_PREFERENCE_STORAGE_KEY } from '../src/lib/scriptPreference';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_ENTRIES: SessionData = {
  ids: ['hsk-001', 'hsk-002'],
  newPoolIds: ['hsk-002'],
  entries: [
    { id: 'hsk-001', simplified: '你好', simplifiedStatus: 'verified', pinyin: 'nǐ hǎo', japanese: 'こんにちは', traditional: '妳好', traditionalStatus: 'authored' },
    { id: 'hsk-002', simplified: '再见', simplifiedStatus: 'authored', pinyin: 'zàijiàn', japanese: 'さようなら', traditionalStatus: 'unavailable' },
  ],
};

function createSyntheticEntries(count: number): SessionData {
  const entries = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: `synthetic-${number}`,
      simplified: `简体甲${number}`,
      simplifiedStatus: 'verified' as const,
      pinyin: `jiǎ${number}`,
      japanese: `項目${number}`,
    };
  });
  return {
    ids: entries.map((entry) => entry.id),
    newPoolIds: entries.slice(0, count - 1).map((entry) => entry.id),
    entries,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createFlashcardHTML(data: SessionData): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flashcard-session-root';
  root.setAttribute('data-session', JSON.stringify({ ids: data.ids, newPoolIds: data.newPoolIds ?? [] }));
  root.innerHTML = `
    <div id="setup-panel" class="setup-panel">
      <fieldset class="setup-group setup-pool-group">
        <legend class="setup-label">単語プール</legend>
        <div class="setup-options">
          <label class="setup-option setup-option--active" for="pool-full"><input id="pool-full" type="radio" name="pool" value="full" data-pool="full" checked />HSK 3 全範囲</label>
          <label class="setup-option" for="pool-new"><input id="pool-new" type="radio" name="pool" value="new" data-pool="new" />HSK 3 新出単語</label>
        </div>
      </fieldset>
      <div class="setup-group">
        <span class="setup-label">セッションサイズ</span>
        <div class="setup-options" role="radiogroup" aria-label="セッションサイズ">
          <button id="size-10" class="setup-option setup-option--active" type="button" role="radio" aria-checked="true" data-size="10">10語</button>
          <button id="size-20" class="setup-option" type="button" role="radio" aria-checked="false" data-size="20">20語</button>
        </div>
      </div>
      <div class="setup-group">
        <span class="setup-label">学習方向</span>
        <div class="setup-options" role="radiogroup" aria-label="学習方向">
          <button id="dir-zh-ja" class="setup-option setup-option--active" type="button" role="radio" aria-checked="true" data-dir="zh-to-ja">中国語 → 日本語</button>
          <button id="dir-ja-zh" class="setup-option" type="button" role="radio" aria-checked="false" data-dir="ja-to-zh">日本語 → 中国語</button>
        </div>
      </div>
      <p id="setup-count" class="setup-count"></p>
      <button id="btn-start" class="flashcard-btn flashcard-btn--reveal" type="button">スタート</button>
    </div>
    <div id="session-area" class="hidden">
      <div class="flashcard-footer">
        <div id="flashcard-progress" class="flashcard-progress" aria-live="polite">
          <span data-progress-text></span>
        </div>
        <button id="btn-reset-progress" class="flashcard-reset-btn" type="button" hidden>学習記録をリセット</button>
      </div>
      <div class="flashcard-container">
        <div class="flashcard-card" id="flashcard-card">
          <p data-front class="flashcard-front" lang="zh-Hans"></p>
          <p data-prompt-fallback class="flashcard-script-fallback" hidden></p>
          <div data-back class="flashcard-back hidden">
            <p data-pinyin class="flashcard-pinyin" lang="zh-Latn"></p>
            <p data-japanese class="flashcard-japanese"></p>
            <p data-answer-fallback class="flashcard-script-fallback" hidden></p>
            <p data-progress-hint class="flashcard-progress-hint hidden"></p>
          </div>
        </div>
        <div class="flashcard-actions">
          <button id="btn-reveal" class="flashcard-btn flashcard-btn--reveal" type="button">答えを見る</button>
          <div id="rating-actions" class="flashcard-ratings hidden">
            <button id="btn-again" class="flashcard-btn flashcard-btn--again" type="button">もう一度</button>
            <button id="btn-unsure" class="flashcard-btn flashcard-btn--unsure" type="button">まだ曖昧</button>
            <button id="btn-known" class="flashcard-btn flashcard-btn--known" type="button">覚えた</button>
          </div>
        </div>
      </div>
    </div>
    <template id="completion-template">
      <div class="flashcard-completion" role="status">
        <p class="flashcard-completion-icon">&#x2714;</p>
        <p class="flashcard-completion-text">セッション完了！</p>
        <button id="btn-restart" class="flashcard-btn flashcard-btn--restart" type="button">もう一度</button>
      </div>
    </template>
  `;
  return root;
}

function getCardElements(root: HTMLElement) {
  return {
    front: root.querySelector('[data-front]') as HTMLElement,
    back: root.querySelector('[data-back]') as HTMLElement,
    pinyin: root.querySelector('[data-pinyin]') as HTMLElement,
    japanese: root.querySelector('[data-japanese]') as HTMLElement,
    revealBtn: root.querySelector('#btn-reveal') as HTMLButtonElement,
    ratingActions: root.querySelector('#rating-actions') as HTMLElement,
    againBtn: root.querySelector('#btn-again') as HTMLButtonElement,
    unsureBtn: root.querySelector('#btn-unsure') as HTMLButtonElement,
    knownBtn: root.querySelector('#btn-known') as HTMLButtonElement,
    startBtn: root.querySelector('#btn-start') as HTMLButtonElement,
    progressEl: root.querySelector('[data-progress-text]') as HTMLElement,
    flashcardCard: root.querySelector('.flashcard-card') as HTMLElement,
    flashcardActions: root.querySelector('.flashcard-actions') as HTMLElement,
  };
}

function changeScriptPreference(preference: 'path-default' | 'simplified' | 'traditional') {
  document.documentElement.dataset.scriptPreference = preference;
  document.dispatchEvent(new Event(SCRIPT_PREFERENCE_EVENT));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlashcardSession DOM lifecycle', () => {
  let root: HTMLElement;
  let cleanupSession: (() => void) | null = null;
  let cleanupPreferenceControl: (() => void) | null = null;

  function mountSession(data: SessionData = SAMPLE_ENTRIES): () => void {
    cleanupSession = mountFlashcardSession(data);
    return cleanupSession;
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.scriptPreference = 'path-default';
    root = createFlashcardHTML(SAMPLE_ENTRIES);
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupPreferenceControl?.();
    cleanupPreferenceControl = null;
    cleanupSession?.();
    cleanupSession = null;
    delete document.documentElement.dataset.scriptPreference;
    document.body.innerHTML = '';
  });

  it('mounts without error', () => {
    expect(() => mountSession()).not.toThrow();
  });

  it('starts session and renders first card', () => {
    mountSession();
    const el = getCardElements(root);

    // Click start button to begin session
    el.startBtn.click();

    // Setup panel hidden, session area visible
    expect(root.querySelector('#setup-panel')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('#session-area')?.classList.contains('hidden')).toBe(false);

    // Card front shows first entry
    expect(el.front.textContent).toBe('你好');
    // Back is hidden before reveal
    expect(el.back.classList.contains('hidden')).toBe(true);
    // Reveal button visible, ratings hidden
    expect(el.revealBtn.classList.contains('hidden')).toBe(false);
    expect(el.ratingActions.classList.contains('hidden')).toBe(true);
    expect((root.querySelector('[data-pool="full"]') as HTMLInputElement).disabled).toBe(true);
    expect((root.querySelector('[data-size="20"]') as HTMLButtonElement).disabled).toBe(true);
    expect((root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses the ordered new-word pool, locks setup during play, and retains it on restart', () => {
    mountSession();
    const el = getCardElements(root);
    const count = root.querySelector('#setup-count') as HTMLElement;
    const newPool = root.querySelector('[data-pool="new"]') as HTMLInputElement;

    expect(count.textContent).toContain('利用可能な単語: 2語');
    expect((root.querySelector('[data-pool="full"]') as HTMLInputElement).checked).toBe(true);
    newPool.click();
    expect(newPool.checked).toBe(true);
    expect(count.textContent).toContain('利用可能な単語: 1語（セッション: 1語）');
    expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toBeNull();

    el.startBtn.click();
    expect(el.front.textContent).toBe('再见');
    expect(newPool.disabled).toBe(true);
    newPool.click();
    expect(el.front.textContent).toBe('再见');

    el.revealBtn.click();
    el.knownBtn.click();
    (root.querySelector('#btn-restart') as HTMLButtonElement).click();
    expect(count.textContent).toContain('利用可能な単語: 1語（セッション: 1語）');
    expect(newPool.checked).toBe(true);
    el.startBtn.click();
    expect(el.front.textContent).toBe('再见');
  });

  it('restores the checked pool and count on a same-root remount', () => {
    mountSession();
    const el = getCardElements(root);
    const fullPool = root.querySelector('[data-pool="full"]') as HTMLInputElement;
    const newPool = root.querySelector('[data-pool="new"]') as HTMLInputElement;

    newPool.click();
    expect((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 1語（セッション: 1語）');

    cleanupSession = mountFlashcardSession(SAMPLE_ENTRIES);

    expect(newPool.checked).toBe(true);
    expect(fullPool.checked).toBe(false);
    expect(newPool.closest('label')?.classList.contains('setup-option--active')).toBe(true);
    expect(fullPool.closest('label')?.classList.contains('setup-option--active')).toBe(false);
    expect((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 1語（セッション: 1語）');
    el.startBtn.click();
    expect(el.front.textContent).toBe('再见');
  });

  it('restores the selected size and direction on remount and builds that session', () => {
    const data = createSyntheticEntries(22);
    mountSession(data);
    const size20 = root.querySelector('[data-size="20"]') as HTMLButtonElement;
    const reverse = root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement;
    const newPool = root.querySelector('[data-pool="new"]') as HTMLInputElement;

    size20.click();
    reverse.click();
    newPool.click();
    expect((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 21語（セッション: 20語）');

    cleanupSession = mountFlashcardSession(data);

    expect.soft(size20.getAttribute('aria-checked')).toBe('true');
    expect.soft((root.querySelector('[data-size="10"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');
    expect.soft(reverse.getAttribute('aria-checked')).toBe('true');
    expect.soft((root.querySelector('[data-dir="zh-to-ja"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');
    expect(newPool.checked).toBe(true);
    expect.soft((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 21語（セッション: 20語）');

    const el = getCardElements(root);
    el.startBtn.click();
    expect.soft(el.progressEl.textContent).toBe('0 / 20');
    expect.soft(el.front.textContent).toBe('項目01');
    expect(el.pinyin.textContent).toBe('');
    expect(el.japanese.textContent).toBe('');
    expect.soft(root.outerHTML).not.toContain('简体甲01');
    expect.soft(root.outerHTML).not.toContain('jiǎ01');

    el.revealBtn.click();
    expect.soft(el.japanese.textContent).toBe('简体甲01');
    expect.soft(el.pinyin.textContent).toBe('jiǎ01');

    el.knownBtn.click();
    expect.soft(el.front.textContent).toBe('項目02');
    expect.soft(el.progressEl.textContent).toBe('1 / 20');
    expect(root.querySelector('.flashcard-completion')).toBeNull();
  });

  it('normalizes missing or invalid size and direction selections to defaults', () => {
    const data = createSyntheticEntries(12);
    root.remove();
    root = createFlashcardHTML(data);
    const size10 = root.querySelector('[data-size="10"]') as HTMLButtonElement;
    const size20 = root.querySelector('[data-size="20"]') as HTMLButtonElement;
    const forward = root.querySelector('[data-dir="zh-to-ja"]') as HTMLButtonElement;
    const reverse = root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement;
    size10.setAttribute('aria-checked', 'false');
    size20.setAttribute('aria-checked', 'true');
    size20.dataset.size = '30';
    forward.setAttribute('aria-checked', 'false');
    reverse.setAttribute('aria-checked', 'true');
    reverse.dataset.dir = 'ja-to-zh-invalid';
    document.body.appendChild(root);

    mountSession(data);

    expect(size10.getAttribute('aria-checked')).toBe('true');
    expect(size10.classList.contains('setup-option--active')).toBe(true);
    expect(size20.getAttribute('aria-checked')).toBe('false');
    expect(forward.getAttribute('aria-checked')).toBe('true');
    expect(forward.classList.contains('setup-option--active')).toBe(true);
    expect(reverse.getAttribute('aria-checked')).toBe('false');
    expect((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 12語（セッション: 10語）');
  });

  it('retains valid size and direction through completion and restart', () => {
    mountSession();
    const size20 = root.querySelector('[data-size="20"]') as HTMLButtonElement;
    const reverse = root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement;
    const el = getCardElements(root);

    size20.click();
    reverse.click();
    el.startBtn.click();
    expect(el.progressEl.textContent).toBe('0 / 2');
    el.revealBtn.click();
    el.knownBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();
    expect(root.querySelector('.flashcard-completion')).not.toBeNull();

    (root.querySelector('#btn-restart') as HTMLButtonElement).click();
    expect(size20.getAttribute('aria-checked')).toBe('true');
    expect(reverse.getAttribute('aria-checked')).toBe('true');
    expect((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 2語（セッション: 2語）');
    el.startBtn.click();
    expect(el.progressEl.textContent).toBe('0 / 2');
    expect(['こんにちは', 'さようなら']).toContain(el.front.textContent);
    expect(el.japanese.textContent).toBe('');
    expect(el.pinyin.textContent).toBe('');
  });

  it('keeps the active session and setup options when progress reset is cancelled or confirmed', () => {
    mountSession();
    const size20 = root.querySelector('[data-size="20"]') as HTMLButtonElement;
    const reverse = root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement;
    const el = getCardElements(root);
    size20.click();
    reverse.click();
    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();

    const resetButton = root.querySelector('#btn-reset-progress') as HTMLButtonElement;
    expect(resetButton.hidden).toBe(false);
    expect(el.progressEl.textContent).toBe('1 / 2');
    const savedProgress = localStorage.getItem('chabiko:hsk-vocabulary-progress:v1');
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValue(false);
    resetButton.click();
    expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toBe(savedProgress);
    expect(el.progressEl.textContent).toBe('1 / 2');
    expect(el.front.textContent).toBe('さようなら');
    expect(size20.disabled).toBe(true);
    expect(reverse.disabled).toBe(true);

    confirm.mockReturnValue(true);
    resetButton.click();
    expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toBeNull();
    expect(resetButton.hidden).toBe(true);
    expect(el.progressEl.textContent).toBe('1 / 2');
    expect(el.front.textContent).toBe('さようなら');
    expect(size20.disabled).toBe(true);
    expect(reverse.disabled).toBe(true);
  });

  it('keeps an empty new-word pool non-interactive', () => {
    const data = { ...SAMPLE_ENTRIES, newPoolIds: [] };
    mountSession(data);
    const newPool = root.querySelector('[data-pool="new"]') as HTMLInputElement;

    expect(newPool.disabled).toBe(true);
    newPool.click();
    expect(newPool.checked).toBe(false);
    expect((root.querySelector('#setup-count') as HTMLElement).textContent).toContain('利用可能な単語: 2語');

    // Guard against stale or externally manipulated native state on remount.
    newPool.checked = true;
    cleanupSession = mountFlashcardSession(data);
    expect(newPool.checked).toBe(false);
    expect((root.querySelector('[data-pool="full"]') as HTMLInputElement).checked).toBe(true);
    expect(newPool.disabled).toBe(true);
    expect((root.querySelector('#setup-count') as HTMLElement).textContent).toContain('利用可能な単語: 2語');
  });

  it('exposes the pool as associated, focusable native radio controls', () => {
    mountSession();
    const fullPool = root.querySelector('#pool-full') as HTMLInputElement;
    const newPool = root.querySelector('#pool-new') as HTMLInputElement;

    expect(fullPool.type).toBe('radio');
    expect(newPool.type).toBe('radio');
    expect(fullPool.name).toBe(newPool.name);
    expect(root.querySelector('label[for="pool-full"]')?.textContent).toContain('HSK 3 全範囲');
    expect(root.querySelector('label[for="pool-new"]')?.textContent).toContain('HSK 3 新出単語');
    newPool.focus();
    expect(document.activeElement).toBe(newPool);
  });

  it('reveals answer on reveal button click', () => {
    mountSession();
    const el = getCardElements(root);

    // Start session first
    el.startBtn.click();
    expect(el.pinyin.textContent).toBe('');
    expect(el.japanese.textContent).toBe('');
    el.revealBtn.click();

    // Back visible, reveal hidden, ratings visible
    expect(el.back.classList.contains('hidden')).toBe(false);
    expect(el.revealBtn.classList.contains('hidden')).toBe(true);
    expect(el.ratingActions.classList.contains('hidden')).toBe(false);
    expect(el.pinyin.textContent).toBe('nǐ hǎo');
    expect(el.japanese.textContent).toBe('こんにちは');
  });

  it('keeps reverse-direction answers empty until reveal', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);

    (root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement).click();
    el.startBtn.click();

    expect(el.front.textContent).toBe('こんにちは');
    expect(el.pinyin.textContent).toBe('');
    expect(el.japanese.textContent).toBe('');

    el.revealBtn.click();
    expect(el.pinyin.textContent).toBe('nǐ hǎo');
    expect(el.japanese.textContent).toBe('你好');
    expect(el.japanese.textContent).toBe('你好');
    expect(el.japanese.lang).toBe('zh-Hans');
  });

  it('updates the visible prompt script without changing focus, state, or HSK progress', () => {
    mountSession();
    const el = getCardElements(root);
    el.startBtn.click();

    expect(el.front.textContent).toBe('你好');
    const focused = document.activeElement;
    const progress = el.progressEl.textContent;
    changeScriptPreference('traditional');

    expect(el.front.textContent).toBe('妳好');
    expect(el.front.lang).toBe('zh-Hant');
    expect(document.activeElement).toBe(focused);
    expect(el.progressEl.textContent).toBe(progress);
    expect(el.back.classList.contains('hidden')).toBe(true);
    expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toBeNull();
  });

  it('applies the global preference event emitted by storage and pageshow refreshes', () => {
    mountSession();
    const el = getCardElements(root);
    el.startBtn.click();
    const select = document.createElement('select');
    select.id = 'script-preference-select';
    select.innerHTML = '<option value="path-default">コース標準</option><option value="traditional">繁体字</option><option value="simplified">簡体字</option>';
    document.body.appendChild(select);
    cleanupPreferenceControl = initScriptPreferenceControl(document.documentElement, select);
    const focused = document.activeElement;

    localStorage.setItem(SCRIPT_PREFERENCE_STORAGE_KEY, JSON.stringify({ version: 1, preference: 'traditional' }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: SCRIPT_PREFERENCE_STORAGE_KEY,
      newValue: localStorage.getItem(SCRIPT_PREFERENCE_STORAGE_KEY),
      storageArea: localStorage,
    }));
    expect(el.front.textContent).toBe('妳好');
    expect(document.activeElement).toBe(focused);

    localStorage.setItem(SCRIPT_PREFERENCE_STORAGE_KEY, JSON.stringify({ version: 1, preference: 'simplified' }));
    window.dispatchEvent(new Event('pageshow'));
    expect(el.front.textContent).toBe('你好');
    expect(document.activeElement).toBe(focused);
    expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toBeNull();
  });

  it('removes the script-preference listener when the session is disposed', () => {
    const cleanup = mountSession();
    const el = getCardElements(root);
    el.startBtn.click();
    cleanup();
    cleanupSession = null;

    changeScriptPreference('traditional');

    expect(el.front.textContent).toBe('你好');
    expect(el.front.lang).toBe('zh-Hans');
  });

  it('keeps reverse-direction answer data absent before reveal and updates only the revealed answer', () => {
    mountSession();
    const el = getCardElements(root);
    (root.querySelector('[data-dir="ja-to-zh"]') as HTMLButtonElement).click();
    el.startBtn.click();

    expect(el.front.textContent).toBe('こんにちは');
    expect(el.pinyin.textContent).toBe('');
    expect(el.japanese.textContent).toBe('');
    expect(root.outerHTML).not.toContain('你好');
    expect(root.outerHTML).not.toContain('妳好');
    expect(root.outerHTML).not.toContain('nǐ hǎo');
    expect(root.outerHTML).not.toContain('未収録');

    const focused = document.activeElement;
    changeScriptPreference('traditional');
    expect(root.outerHTML).not.toContain('妳好');
    expect(document.activeElement).toBe(focused);

    el.revealBtn.click();
    expect(el.japanese.textContent).toBe('妳好');
    expect(el.japanese.lang).toBe('zh-Hant');
    const ratingFocus = document.activeElement;
    const progress = el.progressEl.textContent;
    changeScriptPreference('simplified');
    expect(el.japanese.textContent).toBe('你好');
    expect(el.japanese.lang).toBe('zh-Hans');
    expect(document.activeElement).toBe(ratingFocus);
    expect(el.progressEl.textContent).toBe(progress);
    expect(el.ratingActions.classList.contains('hidden')).toBe(false);
    expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toBeNull();
  });

  it('does not promote Traditional text when its status is missing or generated', () => {
    const data: SessionData = {
      ids: ['synthetic-missing', 'synthetic-generated'],
      entries: [
        { id: 'synthetic-missing', simplified: '简体甲', simplifiedStatus: 'verified', traditional: '繁體甲', pinyin: 'jiǎ', japanese: '甲' },
        { id: 'synthetic-generated', simplified: '简体乙', simplifiedStatus: 'authored', traditional: '繁體乙', traditionalStatus: 'generated', pinyin: 'yǐ', japanese: '乙' },
      ],
    };
    mountSession(data);
    const el = getCardElements(root);
    el.startBtn.click();
    changeScriptPreference('traditional');

    expect(el.front.textContent).toBe('简体甲');
    expect(root.querySelector('[data-prompt-fallback]')?.textContent).toBe('この表記は未収録のため、コース標準を表示しています。');
    expect(el.front.lang).toBe('zh-Hans');
  });

  it('completes session and shows completion view', () => {
    mountSession();
    const el = getCardElements(root);

    // Start session first
    el.startBtn.click();

    // Card 1: reveal + known
    el.revealBtn.click();
    el.knownBtn.click();

    // Card 2: reveal + known → session completes
    el.revealBtn.click();
    el.knownBtn.click();

    const completion = root.querySelector('.flashcard-completion') as HTMLElement;
    expect(completion).not.toBeNull();
    expect(completion?.textContent).toContain('セッション完了');

    // Card and actions are hidden
    expect(el.flashcardCard.classList.contains('hidden')).toBe(true);
    expect(el.flashcardActions.classList.contains('hidden')).toBe(true);
  });

  it('restart after completion does not crash and shows unrevealed card', () => {
    mountSession();
    const el = getCardElements(root);

    // Start and complete session
    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();

    // Click restart button in completion view
    const restartBtn = root.querySelector('#btn-restart') as HTMLButtonElement;
    expect(restartBtn).not.toBeNull();
    restartBtn.click();

    // Setup panel visible again
    expect(root.querySelector('#setup-panel')?.classList.contains('hidden')).toBe(false);

    // Start a new session
    el.startBtn.click();

    // Card restored, unrevealed state
    expect(el.flashcardCard.classList.contains('hidden')).toBe(false);
    expect(el.flashcardActions.classList.contains('hidden')).toBe(false);
    expect(el.back.classList.contains('hidden')).toBe(true);
    expect(el.revealBtn.classList.contains('hidden')).toBe(false);
    expect(el.ratingActions.classList.contains('hidden')).toBe(true);
    // Front content is set
    expect(el.front.textContent).toBeTruthy();
  });

  it('repeated restarts do not throw and preserve card state', () => {
    mountSession();
    const el = getCardElements(root);

    const runFullCycle = () => {
      el.startBtn.click();
      el.revealBtn.click();
      el.knownBtn.click();
      el.revealBtn.click();
      el.knownBtn.click();
      const restartBtn = root.querySelector('#btn-restart') as HTMLButtonElement;
      restartBtn.click();
      el.startBtn.click();
    };

    // Run the cycle 3 times
    runFullCycle();
    runFullCycle();
    runFullCycle();

    // After 3 restarts, card is in correct initial state
    expect(el.back.classList.contains('hidden')).toBe(true);
    expect(el.revealBtn.classList.contains('hidden')).toBe(false);
    expect(el.ratingActions.classList.contains('hidden')).toBe(true);
  });

  it('repeated restarts do not accumulate event listeners', () => {
    mountSession();
    const el = getCardElements(root);

    // Run 3 full cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      el.startBtn.click();
      el.revealBtn.click();
      el.knownBtn.click();
      el.revealBtn.click();
      el.knownBtn.click();
      const restartBtn = root.querySelector('#btn-restart') as HTMLButtonElement;
      restartBtn.click();
      if (cycle < 2) {
        el.startBtn.click(); // don't start after last cycle, we'll inspect
      }
    }

    // Start a fresh session
    el.startBtn.click();
    el.revealBtn.click();

    // Click known once — should fire only once
    el.knownBtn.click();

    // Card should advance (if only one listener fired)
    // After first card rated known, second card appears
    expect(el.front.textContent).toBe('再见');

    // Complete second card
    el.revealBtn.click();
    el.knownBtn.click();

    // Should show completion (not crash)
    const completion = root.querySelector('.flashcard-completion');
    expect(completion).not.toBeNull();
  });
});
