// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mountFlashcardSession,
} from '../src/client/flashcardSession';
import type { SessionData } from '../src/client/flashcardSession';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_ENTRIES: SessionData = {
  ids: ['hsk-001', 'hsk-002'],
  entries: [
    { id: 'hsk-001', simplified: '你好', pinyin: 'nǐ hǎo', japanese: 'こんにちは', traditional: '你好' },
    { id: 'hsk-002', simplified: '再见', pinyin: 'zàijiàn', japanese: 'さようなら' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createFlashcardHTML(data: SessionData): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flashcard-session-root';
  root.setAttribute('data-session', JSON.stringify(data));
  root.innerHTML = `
    <div id="setup-panel" class="setup-panel">
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
          <div data-back class="flashcard-back hidden">
            <p data-pinyin class="flashcard-pinyin" lang="zh-Latn"></p>
            <p data-japanese class="flashcard-japanese"></p>
            <p data-traditional class="flashcard-traditional" lang="zh-Hant" style="display:none"></p>
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlashcardSession DOM lifecycle', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = createFlashcardHTML(SAMPLE_ENTRIES);
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts without error', () => {
    expect(() => mountFlashcardSession(SAMPLE_ENTRIES)).not.toThrow();
  });

  it('starts session and renders first card', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
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
  });

  it('reveals answer on reveal button click', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);

    // Start session first
    el.startBtn.click();
    el.revealBtn.click();

    // Back visible, reveal hidden, ratings visible
    expect(el.back.classList.contains('hidden')).toBe(false);
    expect(el.revealBtn.classList.contains('hidden')).toBe(true);
    expect(el.ratingActions.classList.contains('hidden')).toBe(false);
    expect(el.pinyin.textContent).toBeTruthy();
    expect(el.japanese.textContent).toBeTruthy();
  });

  it('completes session and shows completion view', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
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
    mountFlashcardSession(SAMPLE_ENTRIES);
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
    mountFlashcardSession(SAMPLE_ENTRIES);
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
    mountFlashcardSession(SAMPLE_ENTRIES);
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

describe('FlashcardSession setup controls', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    root = createFlashcardHTML(SAMPLE_ENTRIES);
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the available word count on mount', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const count = root.querySelector('#setup-count') as HTMLElement;
    // 2 available ids, default session size 10 → session clamps to 2.
    expect(count.textContent).toContain('利用可能な単語: 2語');
    expect(count.textContent).toContain('セッション: 2語');
  });

  it('selecting the 20-word size updates active state and aria-checked', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const size10 = root.querySelector('#size-10') as HTMLButtonElement;
    const size20 = root.querySelector('#size-20') as HTMLButtonElement;

    size20.click();

    expect(size20.classList.contains('setup-option--active')).toBe(true);
    expect(size20.getAttribute('aria-checked')).toBe('true');
    expect(size10.classList.contains('setup-option--active')).toBe(false);
    expect(size10.getAttribute('aria-checked')).toBe('false');
  });

  it('selecting a direction updates active state and aria-checked', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const dirZh = root.querySelector('#dir-zh-ja') as HTMLButtonElement;
    const dirJa = root.querySelector('#dir-ja-zh') as HTMLButtonElement;

    dirJa.click();

    expect(dirJa.classList.contains('setup-option--active')).toBe(true);
    expect(dirJa.getAttribute('aria-checked')).toBe('true');
    expect(dirZh.classList.contains('setup-option--active')).toBe(false);
    expect(dirZh.getAttribute('aria-checked')).toBe('false');
  });

  it('renders the card in ja-to-zh direction when selected', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const dirJa = root.querySelector('#dir-ja-zh') as HTMLButtonElement;

    dirJa.click();
    el.startBtn.click();

    // Front shows Japanese, front lang switches to ja.
    expect(el.front.textContent).toBe('こんにちは');
    expect(el.front.getAttribute('lang')).toBe('ja');

    // Reveal shows the simplified form in the japanese slot.
    el.revealBtn.click();
    expect(el.pinyin.textContent).toBe('nǐ hǎo');
    expect(el.japanese.textContent).toBe('你好');
  });

  it('hides the traditional line for entries without a traditional form', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const traditional = root.querySelector('[data-traditional]') as HTMLElement;

    el.startBtn.click();
    // First card (你好) has a traditional form → visible.
    expect(traditional.style.display).toBe('');

    // Advance to second card (再见) which has no traditional form.
    el.revealBtn.click();
    el.knownBtn.click();
    expect(traditional.style.display).toBe('none');
  });
});

describe('FlashcardSession progress reset', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    root = createFlashcardHTML(SAMPLE_ENTRIES);
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reveals the reset button once progress has been recorded', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const resetBtn = root.querySelector('#btn-reset-progress') as HTMLButtonElement;

    expect(resetBtn.hidden).toBe(true);

    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();

    expect(resetBtn.hidden).toBe(false);
  });

  it('clears progress and hides the reset button when confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const resetBtn = root.querySelector('#btn-reset-progress') as HTMLButtonElement;

    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();
    expect(resetBtn.hidden).toBe(false);

    resetBtn.click();

    expect(resetBtn.hidden).toBe(true);
  });

  it('does not clear progress when the confirm dialog is dismissed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const resetBtn = root.querySelector('#btn-reset-progress') as HTMLButtonElement;

    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();

    resetBtn.click();

    // Cancelled → progress remains, button stays visible.
    expect(resetBtn.hidden).toBe(false);
  });
});

describe('FlashcardSession cross-tab / lifecycle listeners', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    root = createFlashcardHTML(SAMPLE_ENTRIES);
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('refreshes progress state on pageshow', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const resetBtn = root.querySelector('#btn-reset-progress') as HTMLButtonElement;

    // Create the progress store and record progress.
    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();
    expect(resetBtn.hidden).toBe(false);

    // Another tab clears the shared progress key, then this tab is restored.
    localStorage.removeItem('chabiko:hsk-vocabulary-progress:v1');
    window.dispatchEvent(new Event('pageshow'));

    expect(resetBtn.hidden).toBe(true);
  });

  it('refreshes progress state on a matching storage event', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const resetBtn = root.querySelector('#btn-reset-progress') as HTMLButtonElement;

    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();
    expect(resetBtn.hidden).toBe(false);

    localStorage.removeItem('chabiko:hsk-vocabulary-progress:v1');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'chabiko:hsk-vocabulary-progress:v1' }),
    );

    expect(resetBtn.hidden).toBe(true);
  });

  it('ignores storage events for unrelated keys', () => {
    mountFlashcardSession(SAMPLE_ENTRIES);
    const el = getCardElements(root);
    const resetBtn = root.querySelector('#btn-reset-progress') as HTMLButtonElement;

    el.startBtn.click();
    el.revealBtn.click();
    el.knownBtn.click();
    expect(resetBtn.hidden).toBe(false);

    // Clear the underlying store but fire an unrelated storage event.
    localStorage.removeItem('chabiko:hsk-vocabulary-progress:v1');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'some-other-key' }),
    );

    // Unrelated key → no refresh, button stays as it was.
    expect(resetBtn.hidden).toBe(false);
  });
});
