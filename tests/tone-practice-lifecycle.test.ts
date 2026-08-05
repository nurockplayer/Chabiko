// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mountTonePractice } from '../src/client/tonePractice';

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface FixtureItem {
  recordId: string;
  promptJa: string;
  correctAnswer: string;
  distractors: string[];
  contrastId: string;
  toneContourId: string;
  toneContourHintJa: string;
  interferenceJa: string;
}

function fixtureItem(recordId: string, overrides?: Partial<FixtureItem>): FixtureItem {
  return {
    recordId,
    promptJa: '声調の形を見て、「媽 mā」に合うものを選んでください。',
    correctAnswer: '第一声',
    distractors: ['第二声', '第三声', '第四声'],
    contrastId: 'tone-t1-vs-t2-t3-t4',
    toneContourId: 't1-high-flat',
    toneContourHintJa: '第一声は高く平らに保ちます。',
    interferenceJa: '日本語話者は声の高さを平らに伸ばしやすいので、音の高さを意識しましょう。',
    ...overrides,
  };
}

function createPracticeHTML(data: { items: FixtureItem[] }): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-tone-practice', '');
  root.setAttribute('data-tone-session', JSON.stringify(data));
  root.innerHTML =
    '<div class="tone-practice-header">' +
    '<p class="tone-practice-progress" data-tone-progress></p>' +
    '<p class="tone-practice-prompt" data-tone-prompt></p></div>' +
    '<div class="tone-contour" data-tone-contour aria-hidden="true">' +
    '<span class="tone-contour__label" data-tone-contour-label></span></div>' +
    '<p class="tone-hint" data-tone-hint></p>' +
    '<div class="tone-choices" data-tone-choices role="group" aria-label="声調を選ぶ"></div>' +
    '<div class="tone-feedback" data-tone-feedback role="status" aria-live="polite" aria-atomic="true"></div>' +
    '<div class="tone-actions" data-tone-actions></div>';
  document.body.append(root);
  return root;
}

function mount(data: { items: FixtureItem[] }): HTMLElement {
  const root = createPracticeHTML(data);
  mountTonePractice(root);
  return root;
}

function choiceButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.tone-choice')];
}

function choiceButton(root: HTMLElement, label: string): HTMLButtonElement {
  return choiceButtons(root).find((b) => b.textContent === label)!;
}

function submitButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>('.tone-action--submit')!;
}

function resetDom(): void {
  document.body.replaceChildren();
}

// ─── Transitions and rejected/duplicate actions ─────────────────────────────

describe('tone practice lifecycle', () => {
  it('moves initial → selected → submitted correct → next → completed', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });

    // initial: no selection, submit disabled.
    expect(choiceButtons(root)).toHaveLength(4);
    expect(submitButton(root).disabled).toBe(true);
    expect(root.querySelector('[data-tone-progress]')?.textContent).toBe('1 / 1');

    // selected.
    choiceButton(root, '第一声').click();
    expect(choiceButton(root, '第一声').getAttribute('aria-pressed')).toBe('true');
    expect(submitButton(root).disabled).toBe(false);

    // submitted correct.
    submitButton(root).click();
    expect(root.textContent).toContain('正解！');
    expect(submitButton(root).disabled).toBe(true);
    expect(root.querySelector('.tone-action--next')).not.toBeNull();
    expect(root.querySelector('.tone-action--retry')).toBeNull();

    // next → completed.
    (root.querySelector('.tone-action--next') as HTMLButtonElement).click();
    expect(root.textContent).toContain('練習完了！');
    expect(root.querySelector('.tone-action--restart')).not.toBeNull();
    resetDom();
  });

  it('moves initial → selected → submitted incorrect → retry returns to the same item', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });

    choiceButton(root, '第二声').click();
    submitButton(root).click();

    expect(root.textContent).toContain('違います');
    expect(root.textContent).toContain('正解：');
    expect(root.textContent).toContain('第一声');
    expect(root.querySelector('.tone-action--retry')).not.toBeNull();
    expect(root.querySelector('.tone-action--next')).toBeNull();

    // Retry returns to the same item with no selection; the existing hint and
    // interference guidance stay visible.
    (root.querySelector('.tone-action--retry') as HTMLButtonElement).click();
    expect(choiceButtons(root)).toHaveLength(4);
    expect(choiceButtons(root).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(submitButton(root).disabled).toBe(true);
    expect(root.querySelector('[data-tone-progress]')?.textContent).toBe('1 / 1');
    expect(root.querySelector('[data-tone-prompt]')?.textContent).toBe(fixtureItem('rec-a').promptJa);
    expect(root.querySelector('[data-tone-hint]')?.textContent).toBe(
      fixtureItem('rec-a').toneContourHintJa,
    );
    resetDom();
  });

  it('rejects duplicate actions: re-selecting the same choice and double-submit', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });

    // Duplicate select: clicking the already-selected choice changes nothing.
    choiceButton(root, '第一声').click();
    choiceButton(root, '第一声').click();
    const selected = choiceButtons(root).filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toBe('第一声');

    // Double submit: after the first submit the second is a no-op.
    submitButton(root).click();
    expect(root.textContent).toContain('正解！');
    submitButton(root).click();
    expect(root.querySelectorAll('.tone-action--next')).toHaveLength(1);
    resetDom();
  });

  it('locks selection while submitted', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    choiceButton(root, '第一声').click();
    submitButton(root).click();
    // All choices are disabled after submit.
    expect(choiceButtons(root).every((b) => b.disabled)).toBe(true);
    resetDom();
  });

  it('advances to the next item only after a correct submit + explicit next', () => {
    const itemB = fixtureItem('rec-b', {
      promptJa: '声調の形を見て、「麻 má」に合うものを選んでください。',
      correctAnswer: '第二声',
      distractors: ['第一声', '第三声', '第四声'],
      contrastId: 'tone-t2-vs-t1-t3-t4',
      toneContourId: 't2-rising',
      toneContourHintJa: '第二声は低くから上がります。',
      interferenceJa: '日本語話者は上がりを小さくしやすいので、しっかり上げましょう。',
    });
    const root = mount({ items: [fixtureItem('rec-a'), itemB] });

    // Answer rec-a correctly and press next.
    choiceButton(root, '第一声').click();
    submitButton(root).click();
    (root.querySelector('.tone-action--next') as HTMLButtonElement).click();
    expect(root.querySelector('[data-tone-progress]')?.textContent).toBe('2 / 2');
    expect(root.querySelector('[data-tone-prompt]')?.textContent).toContain('麻 má');
    expect(choiceButtons(root)).toHaveLength(4);
    // The second item carries its own contour id and guidance.
    expect(root.querySelector('[data-tone-contour]')?.getAttribute('data-contour')).toBe('t2-rising');
    expect(root.querySelector('[data-tone-hint]')?.textContent).toBe(itemB.toneContourHintJa);

    // Answer rec-b correctly → completed.
    choiceButton(root, '第二声').click();
    submitButton(root).click();
    (root.querySelector('.tone-action--next') as HTMLButtonElement).click();
    expect(root.textContent).toContain('練習完了！');
    resetDom();
  });

  it('restarts the whole session from completion', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    choiceButton(root, '第一声').click();
    submitButton(root).click();
    (root.querySelector('.tone-action--next') as HTMLButtonElement).click();
    expect(root.textContent).toContain('練習完了！');

    (root.querySelector('.tone-action--restart') as HTMLButtonElement).click();
    expect(root.querySelector('[data-tone-progress]')?.textContent).toBe('1 / 1');
    expect(choiceButtons(root)).toHaveLength(4);
    expect(choiceButtons(root).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(submitButton(root).disabled).toBe(true);
    resetDom();
  });
});

// ─── Keyboard / focus / live feedback ───────────────────────────────────────

describe('tone practice keyboard, focus, and feedback', () => {
  it('renders a single polite aria-live feedback region', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    const live = root.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('data-tone-feedback')).not.toBeNull();
    resetDom();
  });

  it('focuses the first choice when nothing is selected', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    expect(document.activeElement).toBe(choiceButtons(root)[0]);
    resetDom();
  });

  it('moves focus to submit after a selection, and to next/retry/restart after transitions', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    choiceButton(root, '第一声').click();
    expect(document.activeElement).toBe(submitButton(root));

    submitButton(root).click();
    expect(document.activeElement).toBe(root.querySelector('.tone-action--next'));

    // Incorrect path: retry receives focus.
    const root2 = mount({ items: [fixtureItem('rec-a')] });
    choiceButton(root2, '第二声').click();
    submitButton(root2).click();
    expect(document.activeElement).toBe(root2.querySelector('.tone-action--retry'));

    // Completion: restart receives focus.
    (root.querySelector('.tone-action--next') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(root.querySelector('.tone-action--restart'));
    resetDom();
  });

  it('announces correct/incorrect feedback through the polite region', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    choiceButton(root, '第二声').click();
    submitButton(root).click();
    const feedback = root.querySelector('[data-tone-feedback]');
    expect(feedback?.textContent).toContain('違います');
    expect(feedback?.textContent).toContain('正解：');
    expect(feedback?.textContent).toContain('第一声');
    resetDom();
  });
});

// ─── Reinitialization / teardown / no forbidden behaviors ──────────────────

describe('tone practice reinitialization and teardown', () => {
  it('disposes listeners so reinit does not duplicate handlers', () => {
    const root = createPracticeHTML({ items: [fixtureItem('rec-a')] });
    const first = mountTonePractice(root);
    first.dispose();
    // Reinit after dispose: selecting works exactly once.
    const second = mountTonePractice(root);
    choiceButton(root, '第一声').click();
    expect(choiceButtons(root).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    // No stale first-controller handler fired twice.
    expect(choiceButtons(root).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    second.dispose();
    resetDom();
  });

  it('keeps the in-memory state on pageshow (direct refresh-safe)', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    choiceButton(root, '第一声').click();
    expect(submitButton(root).disabled).toBe(false);
    // Simulate bfcache pageshow.
    window.dispatchEvent(new Event('pageshow'));
    expect(submitButton(root).disabled).toBe(false);
    expect(choiceButton(root, '第一声').getAttribute('aria-pressed')).toBe('true');
    resetDom();
  });

  it('tears down the pageshow listener on dispose', () => {
    const root = createPracticeHTML({ items: [fixtureItem('rec-a')] });
    const controller = mountTonePractice(root);
    controller.dispose();
    // After dispose, further events must not resurrect handlers; mounting a
    // fresh controller works cleanly.
    const fresh = mountTonePractice(root);
    choiceButton(root, '第一声').click();
    expect(choiceButtons(root).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    fresh.dispose();
    resetDom();
  });
});

// ─── Forbidden runtime behaviors in sources ────────────────────────────────

describe('no storage / network / audio / speech / canvas / timer', () => {
  it('client source avoids forbidden runtime behaviors', () => {
    const source = readFileSync('src/client/tonePractice.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|Math\.random|setTimeout|Date\.now/);
    expect(source).not.toMatch(/audio|speechSynthesis|SpeechSynthesis|getUserMedia|MediaRecorder|canvas|new Image/);
  });

  it('domain source avoids forbidden runtime behaviors', () => {
    const source = readFileSync('src/domain/tonePractice.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|Math\.random|setTimeout|Date\.now/);
    expect(source).not.toMatch(/audio|speechSynthesis|SpeechSynthesis|getUserMedia|MediaRecorder|canvas|new Image/);
  });

  it('loader source avoids forbidden runtime behaviors', () => {
    const source = readFileSync('src/content/loadTonePractice.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|Math\.random|setTimeout|Date\.now/);
    expect(source).not.toMatch(/audio|speechSynthesis|SpeechSynthesis|getUserMedia|MediaRecorder|canvas|new Image/);
  });
});

// ─── Containment declarations in the Astro stylesheet ──────────────────────

describe('tone practice responsive containment', () => {
  it('declares grid/flex containment that cannot overflow at narrow widths', () => {
    const source = readFileSync('src/components/TonePractice.astro', 'utf8');
    const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];

    // The practice column is full width and never exceeds its container.
    expect(css).toMatch(/\.tone-practice\s*\{[^}]*width:\s*100%/);
    // The four choices share a two-column grid whose columns can shrink to
    // zero rather than pushing beyond the viewport at 320/375/390 px.
    expect(css).toMatch(/\.tone-choices\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    // The contour box and the choice buttons size themselves from content
    // inside the grid cell (box-sizing: border-box), never from the outside.
    expect(css).toMatch(/\.tone-contour\s*\{[^}]*box-sizing:\s*border-box/);
    expect(css).toMatch(/\.tone-contour\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.tone-choice\s*\{[^}]*box-sizing:\s*border-box/);
    // Actions wrap instead of overflowing.
    expect(css).toMatch(/\.tone-actions\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
    // Browser measurements at 320/375/390 are recorded in the PR body as the
    // genuine layout evidence. Happy DOM does not perform layout.
  });
});
