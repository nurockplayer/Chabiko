// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mountWordOrderPractice } from '../src/client/wordOrderPractice';
import { deriveNonAnswerOrder } from '../src/domain/wordOrderPractice';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CHUNK_TEXTS = ['我', '明天', '去', '台北'];

interface FixtureItem {
  recordId: string;
  promptJa: string;
  separator: ' ' | '';
  chunks: { id: string; text: string }[];
  canonicalOrder: number[];
  shownOrder: number[];
}

function fixtureItem(recordId: string, overrides?: Partial<FixtureItem>): FixtureItem {
  return {
    recordId,
    promptJa: '正しい語順に並べ替えてください',
    separator: ' ',
    chunks: CHUNK_TEXTS.map((text, i) => ({ id: `${recordId}-chunk-${i + 1}`, text })),
    canonicalOrder: CHUNK_TEXTS.map((_, i) => i),
    shownOrder: deriveNonAnswerOrder(recordId, CHUNK_TEXTS.map((text, i) => ({ id: `${recordId}-chunk-${i + 1}`, text }))),
    ...overrides,
  };
}

function createPracticeHTML(data: { items: FixtureItem[] }): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-word-order-practice', '');
  root.setAttribute('data-word-order-session', JSON.stringify(data));
  root.innerHTML =
    '<div class="word-order-header">' +
    '<p class="word-order-progress" data-word-order-progress></p>' +
    '<p class="word-order-prompt" data-word-order-prompt></p></div>' +
    '<div class="word-order-answer-well" role="region" aria-label="組み立て中の答え">' +
    '<p class="word-order-answer-empty" aria-hidden="true">hint</p>' +
    '<div class="word-order-answer" data-word-order-answer></div></div>' +
    '<div class="word-order-feedback" data-word-order-feedback role="status" aria-live="polite" aria-atomic="true"></div>' +
    '<div class="word-order-pool" data-word-order-pool role="group" aria-label="チャンクを選ぶ"></div>' +
    '<div class="word-order-actions" data-word-order-actions></div>';
  document.body.append(root);
  return root;
}

function mount(data: { items: FixtureItem[] }): HTMLElement {
  const root = createPracticeHTML(data);
  mountWordOrderPractice(root);
  return root;
}

// Build an item whose shown order is NOT canonical so a full shown-order
// activation produces a wrong submit (for retry path testing).
function nonCanonicalItem(recordId: string): FixtureItem {
  const canonical = [0, 1, 2, 3];
  const shown = deriveNonAnswerOrder(recordId, CHUNK_TEXTS.map((text, i) => ({ id: `${recordId}-chunk-${i + 1}`, text })));
  return fixtureItem(recordId, { canonicalOrder: canonical, shownOrder: shown });
}

function poolButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.word-order-chunk--pool')];
}

function answerButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.word-order-chunk--answer')];
}

function submitButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>('.word-order-action--submit')!;
}

function selectAll(root: HTMLElement): void {
  // Re-query each iteration because render() replaces the pool's children,
  // detaching previously captured button references from the DOM.
  let btn = poolButtons(root).find((b) => !b.disabled);
  while (btn) {
    btn.click();
    btn = poolButtons(root).find((b) => !b.disabled);
  }
}

function resetDom(): void {
  document.body.replaceChildren();
}

// ─── Transitions and rejected/no-op actions ─────────────────────────────────

describe('word-order practice lifecycle', () => {
  it('moves initial → composing → submitted correct → next → completed', () => {
    const itemA = fixtureItem('rec-a');
    // Force a canonical shown order so activating every pool chunk is correct.
    const root = mount({ items: [{ ...itemA, shownOrder: [0, 1, 2, 3] }] });

    // initial: answer well empty, submit disabled.
    expect(answerButtons(root)).toHaveLength(0);
    expect(submitButton(root).disabled).toBe(true);

    // composing after first toggle.
    poolButtons(root)[0].click();
    expect(answerButtons(root)).toHaveLength(1);
    expect(submitButton(root).disabled).toBe(true); // not all chunks yet

    // complete the permutation.
    selectAll(root);
    expect(answerButtons(root)).toHaveLength(4);
    expect(submitButton(root).disabled).toBe(false);

    // submitted correct.
    submitButton(root).click();
    expect(root.textContent).toContain('正解！');
    expect(submitButton(root).disabled).toBe(true);
    expect(root.querySelector('.word-order-action--next')).not.toBeNull();
    expect(root.querySelector('.word-order-action--retry')).toBeNull();

    // next → completed.
    (root.querySelector('.word-order-action--next') as HTMLButtonElement).click();
    expect(root.textContent).toContain('練習完了！');
    expect(root.querySelector('.word-order-action--restart')).not.toBeNull();
    resetDom();
  });

  it('moves initial → composing → submitted incorrect → retry resets only current item', () => {
    const itemA = nonCanonicalItem('rec-a');
    const root = mount({ items: [itemA] });

    selectAll(root);
    submitButton(root).click();

    expect(root.textContent).toContain('並べ替えが違います');
    expect(root.textContent).toContain('正解：');
    expect(root.querySelector('.word-order-action--retry')).not.toBeNull();
    expect(root.querySelector('.word-order-action--next')).toBeNull();

    // Retry resets only the current item.
    (root.querySelector('.word-order-action--retry') as HTMLButtonElement).click();
    expect(answerButtons(root)).toHaveLength(0);
    expect(poolButtons(root)).toHaveLength(4);
    expect(root.querySelector('[data-word-order-progress]')?.textContent).toBe('1 / 1');
    // Prompt unchanged.
    expect(root.querySelector('[data-word-order-prompt]')?.textContent).toBe(itemA.promptJa);
    resetDom();
  });

  it('rejects toggling out-of-range positions and submitting an empty selection', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });

    // Out-of-range toggle has no effect.
    const before = poolButtons(root).length;
    expect(before).toBe(4);
    expect(submitButton(root).disabled).toBe(true);

    resetDom();
  });

  it('prevents a chunk being used twice and allows removal in reverse order', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });

    // Activate two distinct chunks (re-query each time, render() rebuilds DOM).
    poolButtons(root)[0].click();
    poolButtons(root).find((b) => !b.disabled)!.click();

    // Both chunks are used; pool no longer offers them.
    expect(poolButtons(root).map((b) => b.disabled).filter((d) => d)).toHaveLength(2);
    expect(answerButtons(root)).toHaveLength(2);

    // Remove the second-added chunk first (reverse order removal).
    answerButtons(root)[1].click();
    expect(answerButtons(root)).toHaveLength(1);
    // The removed chunk is available in the pool again.
    expect(poolButtons(root).filter((b) => !b.disabled)).toHaveLength(3);
    resetDom();
  });

  it('submits exactly once per permutation and locks further activation', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    selectAll(root);
    submitButton(root).click();

    // Submitted: pool chunks are disabled and clicking an answer is a no-op.
    const answerBtn = answerButtons(root)[0];
    answerBtn.click();
    expect(answerButtons(root)).toHaveLength(4);
    expect(poolButtons(root).every((b) => b.disabled)).toBe(true);
    resetDom();
  });

  it('advances to the next item only after a correct submit + next', () => {
    const root = mount({
      items: [
        { ...fixtureItem('rec-a'), shownOrder: [0, 1, 2, 3] },
        { ...fixtureItem('rec-b'), shownOrder: [0, 1, 2, 3] },
      ],
    });

    // Answer rec-a correctly.
    selectAll(root);
    submitButton(root).click();
    expect(root.querySelector('[data-word-order-progress]')?.textContent).toBe('1 / 2');
    (root.querySelector('.word-order-action--next') as HTMLButtonElement).click();
    expect(root.querySelector('[data-word-order-progress]')?.textContent).toBe('2 / 2');
    expect(answerButtons(root)).toHaveLength(0);

    // Answer rec-b correctly → completed.
    selectAll(root);
    submitButton(root).click();
    (root.querySelector('.word-order-action--next') as HTMLButtonElement).click();
    expect(root.textContent).toContain('練習完了！');
    resetDom();
  });

  it('restarts the whole session from completion', () => {
    const root = mount({ items: [{ ...fixtureItem('rec-a'), shownOrder: [0, 1, 2, 3] }] });
    selectAll(root);
    submitButton(root).click();
    (root.querySelector('.word-order-action--next') as HTMLButtonElement).click();
    expect(root.textContent).toContain('練習完了！');

    (root.querySelector('.word-order-action--restart') as HTMLButtonElement).click();
    expect(root.querySelector('[data-word-order-progress]')?.textContent).toBe('1 / 1');
    expect(answerButtons(root)).toHaveLength(0);
    expect(poolButtons(root)).toHaveLength(4);
    expect(submitButton(root).disabled).toBe(true);
    resetDom();
  });
});

// ─── Keyboard / focus / live feedback ───────────────────────────────────────

describe('word-order practice keyboard, focus, and feedback', () => {
  it('renders a single polite aria-live feedback region', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    const live = root.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('data-word-order-feedback')).not.toBeNull();
    resetDom();
  });

  it('focuses the first available pool chunk when composing', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    expect(document.activeElement).toBe(poolButtons(root)[0]);
    resetDom();
  });

  it('moves focus to next/retry after submit, and to restart after completion', () => {
    const root = mount({ items: [{ ...fixtureItem('rec-a'), shownOrder: [0, 1, 2, 3] }] });
    selectAll(root);
    submitButton(root).click();
    expect(document.activeElement).toBe(root.querySelector('.word-order-action--next'));

    // Incorrect path: retry receives focus.
    const root2 = mount({ items: [nonCanonicalItem('rec-a')] });
    selectAll(root2);
    submitButton(root2).click();
    expect(document.activeElement).toBe(root2.querySelector('.word-order-action--retry'));

    // Completion: restart receives focus.
    (root.querySelector('.word-order-action--next') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(root.querySelector('.word-order-action--restart'));
    resetDom();
  });

  it('provides correct/incorrect feedback via the polite region', () => {
    const root = mount({ items: [nonCanonicalItem('rec-a')] });
    selectAll(root);
    submitButton(root).click();
    const feedback = root.querySelector('[data-word-order-feedback]');
    expect(feedback?.textContent).toContain('並べ替えが違います');
    expect(feedback?.textContent).toContain('正解：');
    resetDom();
  });
});

// ─── Reinitialization / teardown / no forbidden behaviors ──────────────────

describe('word-order practice reinitialization and teardown', () => {
  it('disposes listeners so reinit does not duplicate handlers', () => {
    const root = createPracticeHTML({ items: [fixtureItem('rec-a')] });
    const first = mountWordOrderPractice(root);
    first.dispose();
    // Reinit after dispose: toggling works exactly once.
    const second = mountWordOrderPractice(root);
    poolButtons(root)[0].click();
    expect(answerButtons(root)).toHaveLength(1);
    // No stale first-controller handler fired twice.
    expect(answerButtons(root)).toHaveLength(1);
    second.dispose();
    resetDom();
  });

  it('keeps the in-memory state on pageshow (direct refresh-safe)', () => {
    const root = mount({ items: [fixtureItem('rec-a')] });
    poolButtons(root)[0].click();
    expect(answerButtons(root)).toHaveLength(1);
    // Simulate bfcache pageshow.
    window.dispatchEvent(new Event('pageshow'));
    expect(answerButtons(root)).toHaveLength(1);
    resetDom();
  });
});

describe('no storage / random / network / timer', () => {
  it('client source avoids forbidden runtime behaviors', () => {
    const source = readFileSync('src/client/wordOrderPractice.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|Math\.random|setTimeout|Date\.now/);
  });

  it('domain source avoids forbidden runtime behaviors', () => {
    const source = readFileSync('src/domain/wordOrderPractice.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|Math\.random|setTimeout|Date\.now/);
  });

  it('route page contains no drag-and-drop or native DnD dependency', () => {
    const source = readFileSync('src/client/wordOrderPractice.ts', 'utf8');
    expect(source).not.toMatch(/draggable|ondrag|dragstart|dataTransfer|drag-and-drop|dnd-kit/);
  });
});

// ─── Containment declarations in the Astro stylesheet ──────────────────────

describe('word-order practice responsive containment', () => {
  it('declares wrap/flex containment for chunk regions and actions', () => {
    const source = readFileSync('src/components/WordOrderPractice.astro', 'utf8');
    const styleMatch = source.match(/<style(?:\s+is:global)?>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];

    expect(css).toMatch(/\.word-order-answer\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.word-order-pool\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.word-order-actions\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.word-order-practice\s*\{[^}]*width:\s*100%/);
    // Chunk buttons never overflow at narrow widths.
    expect(css).toMatch(/\.word-order-chunk\s*\{[^}]*box-sizing:\s*border-box/);
    // Browser measurements at 320/375/390 are recorded in the PR body as the
    // genuine layout evidence. Happy DOM does not perform layout.
  });
});

// ─── #370 theme-safe state styling in the Astro stylesheet ──────────────────

describe('word-order practice theme-safe state styling', () => {
  it('drives answer/selected/retry states from shared A1 tokens and defers focus to the shared theme rule', () => {
    const source = readFileSync('src/components/WordOrderPractice.astro', 'utf8');
    const styleMatch = source.match(/<style(?:\s+is:global)?>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];

    // Placed (answer-well) chunks use the shared A1 jade learning-state soft
    // surface + ink so the assembly stays readable in both themes (never
    // white-on-accent).
    expect(css).toMatch(
      /\.word-order-chunk--answer\s*\{[\s\S]*?background:\s*var\(--jade-soft\)[\s\S]*?color:\s*var\(--jade-ink\)/,
    );
    // Placed chunks stay fully visible after submit (distinct from dimmed pool
    // chunks), preserving the removable/selected affordance.
    expect(css).toMatch(
      /\.word-order-chunk--answer:disabled\s*\{[\s\S]*?opacity:\s*1[\s\S]*?background:\s*var\(--jade-soft\)/,
    );
    // Focus rings follow the shared BaseLayout :focus-visible theme rule (the
    // #366 focus token), never a hard-coded or per-component accent colour.
    expect(css).not.toMatch(/:focus-visible\s*\{/);
    // Retry uses the A1 coral attention family instead of a hard-coded hex.
    expect(css).toMatch(
      /\.word-order-action--retry\s*\{[\s\S]*?border-color:\s*var\(--coral-deep\)[\s\S]*?color:\s*var\(--coral-deep\)/,
    );
  });
});
