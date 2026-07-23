// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountPreviewSession } from '../src/client/previewSession';
import type { PreviewWord } from '../src/client/previewSession';

const WORDS: PreviewWord[] = [
  { id: 'syn-001', simplified: '猫',   traditional: '貓',   pinyin: 'māo',      japanese: '猫' },
  { id: 'syn-002', simplified: '犬',   traditional: '犬',   pinyin: 'quǎn',     japanese: '犬' },
  { id: 'syn-003', simplified: '鱼',   traditional: '魚',   pinyin: 'yú',       japanese: '魚' },
  { id: 'syn-004', simplified: '花',   traditional: '花',   pinyin: 'huā',      japanese: '花' },
  { id: 'syn-005', simplified: '山',   traditional: '山',   pinyin: 'shān',     japanese: '山' },
  { id: 'syn-006', simplified: '水',   traditional: '水',   pinyin: 'shuǐ',     japanese: '水' },
  { id: 'syn-007', simplified: '火',   traditional: '火',   pinyin: 'huǒ',      japanese: '火' },
  { id: 'syn-008', simplified: '月',   traditional: '月',   pinyin: 'yuè',      japanese: '月' },
  { id: 'syn-009', simplified: '星',   traditional: '星',   pinyin: 'xīng',     japanese: '星' },
  { id: 'syn-010', simplified: '雨',   traditional: '雨',   pinyin: 'yǔ',       japanese: '雨' },
];

function createPreviewHTML(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'preview-test-root';
  root.innerHTML = `
    <div class="flashcard">
      <div class="flashcard__inner" id="flashcardInner" tabindex="0"></div>
    </div>
    <div class="flashcard-front" id="flashcardFront">
      <img id="mockImage" src="" alt="MOCK IMAGE" width="960" height="720" />
      <div class="mock-img-fallback" id="imgFallback"><span>MOCK IMAGE</span></div>
      <div class="flashcard-front__zh" id="frontZh"></div>
    </div>
    <div class="flashcard-back" id="flashcardBack">
      <div class="flashcard-back__pinyin" id="backPinyin"></div>
      <div class="flashcard-back__ja" id="backJa"></div>
      <div class="flashcard-back__traditional" id="backTraditional"></div>
    </div>
    <p class="flashcard__hint" id="tapHint">タップして答えを表示</p>
    <div class="assessment-group" id="assessmentGroup">
      <button id="btnRetry" type="button">もう一度</button>
      <button id="btnShaky" type="button">まだ曖昧</button>
      <button id="btnKnew" type="button">覚えた</button>
    </div>
    <div class="completion" id="completionScreen">
      <div class="completion__title" id="completionTitle">完了</div>
      <span class="completion__stat-value" id="statKnew">0</span>
      <span class="completion__stat-value" id="statShaky">0</span>
      <span class="completion__stat-value" id="statRetry">0</span>
      <button class="btn-restart" id="btnRestart" type="button">もう一度挑戦する</button>
    </div>
    <div class="progress-section">
      <span class="progress-count" id="progressCount">0 / 0</span>
      <div class="progress-fill" id="progressFill" style="width:0%"></div>
    </div>
    <div class="assessment-strip" id="assessmentStrip" role="status" aria-live="polite"></div>
  `;
  return root;
}

function q(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}

describe('BasicVocabularyPreview — domain-backed session', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = createPreviewHTML();
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('selects exactly the first 10 words', () => {
    mountPreviewSession({ words: WORDS });
    // First card shows the first word
    const front = q('#frontZh') as HTMLElement;
    expect(front.textContent).toBe('猫');

    // Progress shows 0 / 10
    const progress = q('#progressCount') as HTMLElement;
    expect(progress.textContent).toBe('0 / 10');
  });

  it('hides back content and shows only Simplified before reveal', () => {
    mountPreviewSession({ words: WORDS });
    const back = q('#flashcardBack') as HTMLElement;
    const frontZh = q('#frontZh') as HTMLElement;

    // Front visible with Simplified
    expect(frontZh.textContent).toBe('猫');
    // Back is hidden
    expect(back.classList.contains('flashcard-back--visible')).toBe(false);
    // Assessment buttons hidden
    const group = q('#assessmentGroup') as HTMLElement;
    expect(group.classList.contains('assessment-group--hidden')).toBe(true);
    // Tap hint visible
    const hint = q('#tapHint') as HTMLElement;
    expect(hint.classList.contains('flashcard__hint--hidden')).toBe(false);
  });

  it('reveals pinyin, Japanese, Traditional on Enter key', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const back = q('#flashcardBack') as HTMLElement;
    const pinyin = q('#backPinyin') as HTMLElement;
    const japanese = q('#backJa') as HTMLElement;
    const trad = q('#backTraditional') as HTMLElement;

    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(back.classList.contains('flashcard-back--visible')).toBe(true);
    expect(pinyin.textContent).toBe('māo');
    expect(japanese.textContent).toBe('猫');
    expect(trad.textContent).toBe('貓');
  });

  it('reveals on Space key', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const back = q('#flashcardBack') as HTMLElement;

    inner.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(back.classList.contains('flashcard-back--visible')).toBe(true);
  });

  it('reveals on click', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const back = q('#flashcardBack') as HTMLElement;

    inner.click();
    expect(back.classList.contains('flashcard-back--visible')).toBe(true);
  });

  it('does not expose answer content before reveal via aria', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;

    // Before reveal: flashcardInner is role=button labelled by frontZh
    expect(inner.getAttribute('role')).toBe('button');
    expect(inner.getAttribute('aria-labelledby')).toBe('frontZh');
    expect(inner.getAttribute('aria-describedby')).toBe('tapHint');
  });

  it('known rating completes the card (advances to next unique card)', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const front = q('#frontZh') as HTMLElement;
    const btnKnew = q('#btnKnew') as HTMLButtonElement;

    // Reveal first card
    inner.click();
    // Rate known
    btnKnew.click();

    // Should advance to second card
    expect(front.textContent).toBe('犬');
    // Reveal
    inner.click();
    btnKnew.click();
    expect(front.textContent).toBe('鱼');
  });

  it('unsure rating requeues the card per domain semantics', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const front = q('#frontZh') as HTMLElement;
    const btnShaky = q('#btnShaky') as HTMLButtonElement;

    // Card 1: reveal + unsure
    inner.click();
    btnShaky.click();

    // Domain requeues: card 1 goes to end of queue, card 2 is now active
    expect(front.textContent).toBe('犬');
  });

  it('again rating requeues the card at index 2 per domain semantics', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const front = q('#frontZh') as HTMLElement;
    const btnRetry = q('#btnRetry') as HTMLButtonElement;

    // Card 1: reveal + again
    inner.click();
    btnRetry.click();

    // Domain requeues at index 2: card 1 goes to position 2
    // Card 2 is now active
    expect(front.textContent).toBe('犬');
  });

  it('progress counts completed unique cards, not total assessments', () => {
    mountPreviewSession({ words: WORDS });
    const progress = q('#progressCount') as HTMLElement;
    const inner = q('#flashcardInner') as HTMLElement;
    const btnKnew = q('#btnKnew') as HTMLButtonElement;
    const btnShaky = q('#btnShaky') as HTMLButtonElement;

    // Reveal + known → 1 completed
    inner.click();
    btnKnew.click();
    expect(progress.textContent).toBe('1 / 10');

    // Card 2: reveal + shaky (requeue, not completed) → still 1 completed
    inner.click();
    btnShaky.click();
    expect(progress.textContent).toBe('1 / 10');

    // Card 2 reappears (requeued). Reveal + known → 2 completed
    inner.click();
    btnKnew.click();
    expect(progress.textContent).toBe('2 / 10');
  });

  it('reaches completion only after all unique cards are known', () => {
    mountPreviewSession({ words: WORDS });
    const btnKnew = q('#btnKnew') as HTMLButtonElement;
    const inner = q('#flashcardInner') as HTMLElement;
    const completion = q('#completionScreen') as HTMLElement;

    // Known-rate all 10 cards
    for (let i = 0; i < 10; i++) {
      inner.click();
      btnKnew.click();
    }

    // Should show completion
    expect(completion.classList.contains('completion--visible')).toBe(true);
  });

  it('restart creates a fresh deterministic session', () => {
    mountPreviewSession({ words: WORDS });

    // Complete the session
    const btnKnew = q('#btnKnew') as HTMLButtonElement;
    const inner = q('#flashcardInner') as HTMLElement;
    const restartBtn = q('#btnRestart') as HTMLButtonElement;
    const front = q('#frontZh') as HTMLElement;

    for (let i = 0; i < 10; i++) {
      inner.click();
      btnKnew.click();
    }

    // Restart
    restartBtn.click();

    // After restart, card 1 shows again
    expect(front.textContent).toBe('猫');

    // Progress reset to 0/10
    const progress = q('#progressCount') as HTMLElement;
    expect(progress.textContent).toBe('0 / 10');

    // Completion hidden
    const completion = q('#completionScreen') as HTMLElement;
    expect(completion.classList.contains('completion--visible')).toBe(false);
  });

  it('image load failure shows fallback and does not break flow', () => {
    mountPreviewSession({ words: WORDS });
    const mockImg = q('#mockImage') as HTMLImageElement;
    const fallback = q('#imgFallback') as HTMLElement;

    // Simulate load error
    mockImg.dispatchEvent(new Event('error'));

    // Fallback visible
    expect(fallback.style.display).toBe('flex');
    // Image hidden
    expect(mockImg.style.display).toBe('none');

    // Card still works: reveal should not throw
    const inner = q('#flashcardInner') as HTMLElement;
    expect(() => inner.click()).not.toThrow();
  });

  it('Enter key reveals only once; rapid repeated keys do not break state', () => {
    mountPreviewSession({ words: WORDS });
    const inner = q('#flashcardInner') as HTMLElement;
    const btnKnew = q('#btnKnew') as HTMLButtonElement;
    const front = q('#frontZh') as HTMLElement;

    // Rapid Enter presses
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Rate known — should advance cleanly
    btnKnew.click();
    expect(front.textContent).toBe('犬');
  });
});
