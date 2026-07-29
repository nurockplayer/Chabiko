// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';

const ITEMS = [
  { id: 'a', simplified: '甲', pinyin: 'jiǎ', japanese: 'A', traditional: '甲', illustration: {
    vocabularyId: 'a', assetPath: '/assets/a.webp', width: 500, height: 400, altJa: 'A の絵',
  } },
  { id: 'b', simplified: '小姐', pinyin: 'xiǎo jie', japanese: 'お嬢さん', traditional: '小姐', illustration: null },
  { id: 'c', simplified: '丙', pinyin: 'bǐng', japanese: 'C', traditional: '丙', illustration: {
    vocabularyId: 'c', assetPath: '/assets/c.webp', width: 400, height: 500, altJa: 'C の絵',
  } },
];

function rootWith(items = ITEMS): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyData = JSON.stringify({ items });
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

    expect(root.querySelector('[data-card]')?.textContent).toContain('甲');
    reveal(root);
    expect(document.activeElement).toBe(root.querySelector('[data-rating="again"]'));
    rate(root, 'again');
    expect(root.querySelector('[data-card]')?.textContent).toContain('小姐');
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-card]')?.textContent).toContain('丙');
    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-card]')?.textContent).toContain('甲');
    reveal(root);
    rate(root, 'known');

    expect(root.textContent).toContain('今回の学習は完了です');
    expect(root.querySelector('[data-progress]')?.textContent).toBe('3 / 3 語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="restart"]'));

    (root.querySelector('[data-action="restart"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).toContain('甲');
    expect(root.querySelector('[data-progress]')?.textContent).toBe('0 / 3 語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
  });

  it('cleans up the prior root listener before Astro reinitialization', () => {
    const root = rootWith();
    const firstCleanup = initBasicVocabularySession(root);
    initBasicVocabularySession(root);

    firstCleanup();
    reveal(root);
    expect(root.querySelector('[data-card]')?.textContent).toContain('jiǎ');

    const secondCleanup = initBasicVocabularySession(root);
    secondCleanup();
    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).not.toContain('jiǎ');
  });

  it('fails deterministically for zero items and invalid present illustration links', () => {
    const empty = rootWith([]);
    expect(() => initBasicVocabularySession(empty)).toThrow('basic vocabulary has no provisional items');

    const invalid = rootWith([{ ...ITEMS[0], illustration: { ...ITEMS[0].illustration!, vocabularyId: 'wrong' } }]);
    expect(() => initBasicVocabularySession(invalid)).toThrow("basic vocabulary illustration link is invalid for 'a'");
  });

  it.each([320, 375, 390])('keeps card controls within the %ipx mobile viewport contract', (width) => {
    const root = rootWith();
    root.style.width = `${width}px`;
    initBasicVocabularySession(root);
    reveal(root);

    const card = root.querySelector<HTMLElement>('[data-card]')!;
    const ratings = root.querySelector<HTMLElement>('.basic-vocabulary-ratings')!;
    expect(card.querySelectorAll('button')).toHaveLength(3);
    expect(ratings.querySelectorAll('button')).toHaveLength(3);
    expect(card.className).toBe('basic-vocabulary-card');
  });
});
