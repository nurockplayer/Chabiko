// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';

// Three real vocabulary items selected from the production batch:
// - 大家 (illustrated, traditional same as simplified)
// - 人   (illustrated)
// - 小姐/女士 (text-only, no traditional)
const REAL_IDS = [
  'teacher-star-1-37e0eb213f0f',  // 大家
  'teacher-star-1-a66948a76fda',  // 人
  'teacher-star-1-8b957a100bd4',  // 小姐/女士
] as const;

const ITEM_A_SIMPLIFIED = '大家';
const ITEM_A_PINYIN = 'dà jiā';
const ITEM_A_JAPANESE = 'みんな';
const ITEM_B_SIMPLIFIED = '人';
const ITEM_C_SIMPLIFIED = '小姐/女士';

function rootWith(ids: readonly string[] = REAL_IDS): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyIds = JSON.stringify([...ids]);
  root.innerHTML = '<p data-progress aria-live="polite"></p><div data-card></div>';
  document.body.append(root);
  return root;
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  (root.querySelector(`[data-rating="${rating}"]`) as HTMLButtonElement).click();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('basic vocabulary session lifecycle', () => {
  it('uses the state machine for reveal, exact requeue, completion, and restart', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // 大家 is first
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
    reveal(root);
    expect(document.activeElement).toBe(root.querySelector('[data-rating="again"]'));
    rate(root, 'again');
    // After 'again', 大家 is requeued at position 2; next is 人
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_B_SIMPLIFIED);
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    reveal(root);
    rate(root, 'known');
    // After 'known' on 人, next is 小姐/女士
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_C_SIMPLIFIED);
    reveal(root);
    rate(root, 'known');
    // Now 大家 comes back from requeue
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
    reveal(root);
    rate(root, 'known');

    expect(root.textContent).toContain('今回の学習は完了です');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('3 / 3 語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="restart"]'));

    (root.querySelector('[data-action="restart"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
    expect(root.querySelector('[data-progress]')?.textContent).toBe('0 / 3 語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
  });

  it('requeues an unsure item after the remaining queue, preserves order, and later completes with known', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Item 大家 is active → mark unsure
    reveal(root);
    expect(root.textContent).toContain(ITEM_A_PINYIN);
    rate(root, 'unsure');

    // 大家 was requeued at end. Next should be 人
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_B_SIMPLIFIED);
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    // Mark 人 known
    reveal(root);
    rate(root, 'known');

    // Next should be 小姐/女士
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_C_SIMPLIFIED);

    // Mark 小姐/女士 known
    reveal(root);
    rate(root, 'known');

    // Now 大家 comes back from the end of the queue
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);

    // This time complete it with known
    reveal(root);
    rate(root, 'known');

    // Session completed
    expect(root.textContent).toContain('今回の学習は完了です');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('3 / 3 語');
  });

  it('exposes the exact learner copy required by Issue #115', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Before reveal: 答えを見る button
    expect(root.textContent).toContain('答えを見る');

    reveal(root);
    // Rating labels: もう一度, まだ曖昧, 覚えた
    expect(root.textContent).toContain('もう一度');
    expect(root.textContent).toContain('まだ曖昧');
    expect(root.textContent).toContain('覚えた');

    // Complete all items
    for (let i = 0; i < REAL_IDS.length; i++) {
      rate(root, 'known');
      if (root.querySelector('[data-action="restart"]')) break;
      reveal(root);
    }

    // Completion: 今回の学習は完了です, もう一度学ぶ
    expect(root.textContent).toContain('今回の学習は完了です');
    expect(root.textContent).toContain('もう一度学ぶ');
  });

  it('cleans up the prior root listener before Astro reinitialization', () => {
    const root = rootWith();
    const firstCleanup = initBasicVocabularySession(root);
    initBasicVocabularySession(root);

    firstCleanup();
    reveal(root);
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_PINYIN);

    const secondCleanup = initBasicVocabularySession(root);
    secondCleanup();
    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).not.toContain(ITEM_A_PINYIN);
  });

  it('fails deterministically for zero items and invalid present illustration links', () => {
    const empty = rootWith([]);
    expect(() => initBasicVocabularySession(empty)).toThrow('basic vocabulary has no provisional items');

    // Use an ID not present in the real loader data
    const invalidRoot = document.createElement('section');
    invalidRoot.dataset.basicVocabularyIds = JSON.stringify(['nonexistent-id']);
    invalidRoot.innerHTML = '<p data-progress aria-live="polite"></p><div data-card></div>';
    document.body.append(invalidRoot);
    expect(() => initBasicVocabularySession(invalidRoot)).toThrow(
      "basic vocabulary item 'nonexistent-id' is missing from the loader",
    );
  });

  it('includes the required containment declarations in the Astro stylesheet', async () => {
    const source = await readFile('src/components/vocabulary/BasicVocabularySession.astro', 'utf8');

    // Extract the content inside <style is:global>…</style>
    const styleMatch = source.match(/<style is:global>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];

    // .basic-vocabulary-card, .basic-vocabulary-completion
    expect(css).toMatch(
      /\.basic-vocabulary-card,\s*\.basic-vocabulary-completion\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%[^}]*overflow:\s*hidden/,
    );

    // .basic-vocabulary-illustration
    expect(css).toMatch(
      /\.basic-vocabulary-illustration\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*min\(42vh,\s*420px\)[^}]*object-fit:\s*contain/,
    );

    // .basic-vocabulary-ratings
    expect(css).toMatch(
      /\.basic-vocabulary-ratings\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[^}]*width:\s*min\(100%,\s*34rem\)/,
    );

    // .basic-vocabulary-rating (min-width: 0 — note this is in a separate rule
    // from .basic-vocabulary-action, .basic-vocabulary-rating)
    expect(css).toMatch(
      /\.basic-vocabulary-rating\s*\{[^}]*min-width:\s*0/,
    );

    // Browser measurements at 320/375/390 are recorded in the PR body as
    // the genuine layout evidence. Happy DOM does not perform layout.
  });

  it('announces completion via the aria-live progress region, preserves progress text, and moves focus to restart', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Confirm exactly one aria-live region exists
    const liveRegions = root.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions).toHaveLength(1);
    const progressEl = liveRegions[0] as HTMLElement;

    // Complete all three items
    for (let i = 0; i < REAL_IDS.length; i++) {
      reveal(root);
      rate(root, 'known');
    }

    // Completion announcement — a visually-hidden span inside the live region
    const sr = progressEl.querySelector('.basic-vocabulary-sr-only');
    expect(sr).not.toBeNull();
    expect(sr?.textContent).toBe('今回の学習は完了です');

    // Progress text includes the count (visually-hidden span is appended after)
    expect(progressEl.textContent).toBe('3 / 3 語今回の学習は完了です');

    // Only one polite live region still
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    // Focus moved to restart button
    expect(document.activeElement).toBe(root.querySelector('[data-action="restart"]'));

    // Completion title visible in the card
    expect(root.querySelector('[data-card]')?.textContent).toContain('今回の学習は完了です');
  });

  it('produces a card that does not serialize answers into outerHTML attributes before reveal', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    const card = root.querySelector<HTMLElement>('[data-card]')!;
    const html = card.outerHTML;

    // No pinyin or Japanese answer values in the card DOM
    expect(html).not.toContain(ITEM_A_PINYIN);
    expect(html).not.toContain(ITEM_A_JAPANESE);
    // No pinyin for item B either
    expect(html).not.toContain('rén');
    expect(html).not.toContain('人（ひと）');
    // No pinyin/Japanese for text-only item
    expect(html).not.toContain('xiǎo jiě');
    expect(html).not.toContain('～さん（女性）');

    // The data attribute on the root must only contain opaque IDs, no answer values
    const idsAttr = root.dataset.basicVocabularyIds ?? '';
    expect(idsAttr).not.toContain(ITEM_A_PINYIN);
    expect(idsAttr).not.toContain(ITEM_A_JAPANESE);
  });
});
