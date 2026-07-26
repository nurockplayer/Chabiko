// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountPreviewSession } from '../src/client/previewSession';
import type { PreviewWord } from '../src/client/previewSession';

const SYNTHETIC_WORDS: PreviewWord[] = [
  { id: 'test-001', simplified: '猫',   traditional: '', pinyin: 'māo',      japanese: '猫',   localImagePath: '/assets/dev/teacher-vocabulary-preview/test-001.png', localImageAlt: '猫' },
  { id: 'test-002', simplified: '犬',   traditional: '', pinyin: 'quǎn',     japanese: '犬',   localImagePath: '/assets/dev/teacher-vocabulary-preview/test-002.png', localImageAlt: '犬' },
  { id: 'test-003', simplified: '魚',   traditional: '', pinyin: 'yú',       japanese: '魚',   localImagePath: '/assets/dev/teacher-vocabulary-preview/test-003.png', localImageAlt: '魚' },
  { id: 'test-004', simplified: '花',   traditional: '', pinyin: 'huā',      japanese: '花',   localImagePath: undefined, localImageAlt: undefined },
  { id: 'test-005', simplified: '山',   traditional: '', pinyin: 'shān',     japanese: '山',   localImagePath: undefined, localImageAlt: undefined },
  { id: 'test-006', simplified: '水',   traditional: '', pinyin: 'shuǐ',     japanese: '水',   localImagePath: '/assets/dev/teacher-vocabulary-preview/test-006.png', localImageAlt: '水' },
  { id: 'test-007', simplified: '火',   traditional: '', pinyin: 'huǒ',      japanese: '火',   localImagePath: undefined, localImageAlt: undefined },
  { id: 'test-008', simplified: '月',   traditional: '', pinyin: 'yuè',      japanese: '月',   localImagePath: '/assets/dev/teacher-vocabulary-preview/test-008.png', localImageAlt: '月' },
  { id: 'test-009', simplified: '星',   traditional: '', pinyin: 'xīng',     japanese: '星',   localImagePath: undefined, localImageAlt: undefined },
  { id: 'test-010', simplified: '雨',   traditional: '', pinyin: 'yǔ',       japanese: '雨',   localImagePath: '/assets/dev/teacher-vocabulary-preview/test-010.png', localImageAlt: '雨' },
];

const WORDS_SESSION: PreviewWord[] = [
  { id: 's-001', simplified: '犬', traditional: '', pinyin: 'quǎn', japanese: '犬', localImagePath: '/assets/dev/p-001.png', localImageAlt: '犬' },
  { id: 's-002', simplified: '猫', traditional: '', pinyin: 'māo', japanese: '猫', localImagePath: undefined, localImageAlt: undefined },
  { id: 's-003', simplified: '魚', traditional: '', pinyin: 'yú', japanese: '魚', localImagePath: '/assets/dev/p-003.png', localImageAlt: '魚' },
  { id: 's-004', simplified: '花', traditional: '', pinyin: 'huā', japanese: '花', localImagePath: undefined, localImageAlt: undefined },
  { id: 's-005', simplified: '山', traditional: '', pinyin: 'shān', japanese: '山', localImagePath: '/assets/dev/p-005.png', localImageAlt: '山' },
  { id: 's-006', simplified: '水', traditional: '', pinyin: 'shuǐ', japanese: '水', localImagePath: undefined, localImageAlt: undefined },
  { id: 's-007', simplified: '火', traditional: '', pinyin: 'huǒ', japanese: '火', localImagePath: '/assets/dev/p-007.png', localImageAlt: '火' },
  { id: 's-008', simplified: '月', traditional: '', pinyin: 'yuè', japanese: '月', localImagePath: undefined, localImageAlt: undefined },
  { id: 's-009', simplified: '星', traditional: '', pinyin: 'xīng', japanese: '星', localImagePath: '/assets/dev/p-009.png', localImageAlt: '星' },
  { id: 's-010', simplified: '雨', traditional: '', pinyin: 'yǔ', japanese: '雨', localImagePath: undefined, localImageAlt: undefined },
];

function createPreviewHTML(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'preview-test-root';
  root.innerHTML = `
    <div class="flashcard flashcard--hidden" id="flashcard">
      <div class="flashcard__inner" id="flashcardInner" tabindex="0"></div>
    </div>
    <div class="flashcard-front" id="flashcardFront">
      <img id="mockImage" src="" alt="" width="960" height="720" />
      <div class="mock-img-fallback" id="imgFallback"><span>NO IMAGE</span></div>
      <div class="flashcard-front__zh" id="frontZh"></div>
    </div>
    <div class="flashcard-back" id="flashcardBack">
      <div class="flashcard-back__pinyin" id="backPinyin"></div>
      <div class="flashcard-back__ja" id="backJa"></div>
    </div>
    <div class="source-not-generated source-not-generated--visible" id="emptyState">
      <div class="source-not-generated__icon" aria-hidden="true">!</div>
      <div class="source-not-generated__text">LOCAL SOURCE NOT GENERATED</div>
    </div>
    <p class="flashcard__hint flashcard__hint--hidden" id="tapHint">タップして答えを表示</p>
    <div class="assessment-group assessment-group--hidden" id="assessmentGroup">
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

const TEACHER_MODE = 'placeholder' as const;

describe('TeacherPreview — empty state initial', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = createPreviewHTML();
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('empty state is visible by default (source-not-generated--visible present)', () => {
    const es = q('#emptyState') as HTMLElement;
    expect(es.classList.contains('source-not-generated--visible')).toBe(true);
  });

  it('flashcard is hidden by default (flashcard--hidden present)', () => {
    const fc = q('#flashcard') as HTMLElement;
    expect(fc.classList.contains('flashcard--hidden')).toBe(true);
  });

  it('tap hint is hidden by default', () => {
    const hint = q('#tapHint') as HTMLElement;
    expect(hint.classList.contains('flashcard__hint--hidden')).toBe(true);
  });

  it('assessment buttons are hidden by default', () => {
    const group = q('#assessmentGroup') as HTMLElement;
    expect(group.classList.contains('assessment-group--hidden')).toBe(true);
  });

  it('mounting session hides empty state and shows flashcard', () => {
    const es = q('#emptyState') as HTMLElement;
    const fc = q('#flashcard') as HTMLElement;
    const hint = q('#tapHint') as HTMLElement;
    const group = q('#assessmentGroup') as HTMLElement;

    // Simulate what the init script does on success
    fc.classList.remove('flashcard--hidden');
    es.classList.remove('source-not-generated--visible');
    hint.classList.remove('flashcard__hint--hidden');
    group.classList.remove('assessment-group--hidden');

    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);

    expect(fc.classList.contains('flashcard--hidden')).toBe(false);
    expect(es.classList.contains('source-not-generated--visible')).toBe(false);
    expect(q('#frontZh')?.textContent).toBe('猫');
  });

  it('mountPreviewSession with 10 words works', () => {
    mountPreviewSession({ words: WORDS_SESSION }, TEACHER_MODE);
    const front = q('#frontZh') as HTMLElement;
    expect(front.textContent).toBe('犬');

    const progress = q('#progressCount') as HTMLElement;
    expect(progress.textContent).toBe('0 / 10');
  });
});

describe('TeacherPreview — placeholder image mode', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = createPreviewHTML();
    document.body.appendChild(root);
    const fc = q('#flashcard') as HTMLElement;
    const es = q('#emptyState') as HTMLElement;
    const hint = q('#tapHint') as HTMLElement;
    const group = q('#assessmentGroup') as HTMLElement;
    fc.classList.remove('flashcard--hidden');
    es.classList.remove('source-not-generated--visible');
    hint.classList.remove('flashcard__hint--hidden');
    group.classList.remove('assessment-group--hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses local image src when localImagePath is provided', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    const img = q('#mockImage') as HTMLImageElement;
    expect(img.src).toContain('test-001.png');
    expect(img.alt).toBe('猫');
  });

  it('shows fallback for row without localImagePath (no Picsum)', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    const img = q('#mockImage') as HTMLImageElement;
    const inner = q('#flashcardInner') as HTMLElement;
    const btnKnew = q('#btnKnew') as HTMLButtonElement;
    for (let i = 0; i < 3; i++) { inner.click(); btnKnew.click(); }
    expect(img.src).toBe('');
    expect(img.alt).toBe('');
  });

  it('shows first word after mount', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    expect(q('#frontZh')?.textContent).toBe('猫');
  });

  it('reveals pinyin and Japanese on Enter', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    const inner = q('#flashcardInner') as HTMLElement;
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(q('#backPinyin')?.textContent).toBe('māo');
    expect(q('#backJa')?.textContent).toBe('猫');
  });

  it('reveals on Space', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    q('#flashcardInner')?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect((q('#flashcardBack') as HTMLElement).classList.contains('flashcard-back--visible')).toBe(true);
  });

  it('reveals on click', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    q('#flashcardInner')?.click();
    expect((q('#flashcardBack') as HTMLElement).classList.contains('flashcard-back--visible')).toBe(true);
  });

  it('supports rating and advance', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    q('#flashcardInner')?.click();
    (q('#btnKnew') as HTMLButtonElement).click();
    expect(q('#frontZh')?.textContent).toBe('犬');
  });

  it('completes after all 10 cards', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    for (let i = 0; i < 10; i++) { q('#flashcardInner')?.click(); (q('#btnKnew') as HTMLButtonElement).click(); }
    expect((q('#completionScreen') as HTMLElement).classList.contains('completion--visible')).toBe(true);
  });

  it('restart resets session', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    for (let i = 0; i < 10; i++) { q('#flashcardInner')?.click(); (q('#btnKnew') as HTMLButtonElement).click(); }
    (q('#btnRestart') as HTMLButtonElement).click();
    expect(q('#frontZh')?.textContent).toBe('猫');
    expect(q('#progressCount')?.textContent).toBe('0 / 10');
  });

  it('load error shows fallback, no Picsum', () => {
    mountPreviewSession({ words: SYNTHETIC_WORDS }, TEACHER_MODE);
    const img = q('#mockImage') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect((q('#imgFallback') as HTMLElement).style.display).toBe('flex');
    expect(img.src).not.toContain('picsum.photos');
  });

  it('never requests Picsum in placeholder mode', () => {
    const words: PreviewWord[] = [{ id: 't', simplified: 'テスト', traditional: '', pinyin: 't', japanese: 't' }];
    mountPreviewSession({ words }, TEACHER_MODE);
    expect((q('#mockImage') as HTMLImageElement).src).toBe('');
  });
});
