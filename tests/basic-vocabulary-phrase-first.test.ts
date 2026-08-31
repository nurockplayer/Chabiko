// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import { createSessionRoot, renderPayloadFor } from './helpers/basicVocabularyTestData';

const WITH_EXAMPLE_ID = 'teacher-star-1-37e0eb213f0f';
const WITH_EXAMPLE_TEXT = '大家好 大家请听';
const WITHOUT_EXAMPLE_ID = 'teacher-learner-ce0a85de48246f4b';
const LONG_EXAMPLE_ID = 'teacher-learner-156cf7b03e67d363';
const LONG_EXAMPLE_TEXT =
  '昨天有人一直打电话过来，原来是你啊！！ 王力从原来住的地方搬出来了 长大后小美的脾气比原来好多了';

function rootFor(id: string): HTMLElement {
  return createSessionRoot([id]);
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe('teacher vocabulary phrase-first study composition (#464)', () => {
  it('keeps contextual language behind the existing recall reveal', () => {
    const root = rootFor(WITH_EXAMPLE_ID);
    initBasicVocabularySession(root);

    expect(root.querySelector('.basic-vocabulary-context')).toBeNull();
    expect(root.textContent).not.toContain(WITH_EXAMPLE_TEXT);
    expect(root.querySelector('[data-action="reveal"]')).not.toBeNull();
  });

  it('leads the revealed object with the exact approved context, then word information and ratings', () => {
    const root = rootFor(WITH_EXAMPLE_ID);
    initBasicVocabularySession(root);
    reveal(root);

    const context = root.querySelector('.basic-vocabulary-context');
    const phrase = root.querySelector('.basic-vocabulary-context-text');
    const illustration = root.querySelector('.basic-vocabulary-illustration');
    const breakdown = root.querySelector('.basic-vocabulary-word-breakdown');
    const ratings = root.querySelector('.basic-vocabulary-ratings');

    expect(context).not.toBeNull();
    expect(phrase?.textContent).toBe(WITH_EXAMPLE_TEXT);
    expect(phrase?.getAttribute('lang')).toBe('zh-Hans');
    expect(breakdown?.getAttribute('aria-label')).toBe('単語の情報');
    expect(breakdown?.querySelector('.basic-vocabulary-pinyin')).not.toBeNull();
    expect(breakdown?.querySelector('.basic-vocabulary-japanese')).not.toBeNull();
    expect(root.querySelector('.basic-vocabulary-detail-link')).toBeNull();
    expect(root.textContent).not.toContain('例文を見る');

    expect(context!.compareDocumentPosition(illustration!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(illustration!.compareDocumentPosition(breakdown!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(breakdown!.compareDocumentPosition(ratings!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders one unsplit long raw source string as one contextual learning object', () => {
    const root = rootFor(LONG_EXAMPLE_ID);
    initBasicVocabularySession(root);
    reveal(root);

    const phrases = root.querySelectorAll('.basic-vocabulary-context-text');
    expect(phrases).toHaveLength(1);
    expect(phrases[0].textContent).toBe(LONG_EXAMPLE_TEXT);
  });

  it('shows a quiet truthful missing-context state and preserves rating', () => {
    const root = rootFor(WITHOUT_EXAMPLE_ID);
    initBasicVocabularySession(root);
    reveal(root);

    const context = root.querySelector('.basic-vocabulary-context');
    expect(context?.classList.contains('basic-vocabulary-context--missing')).toBe(true);
    expect(context?.textContent).toContain('フレーズ準備中');
    expect(root.querySelector('.basic-vocabulary-context-text')).toBeNull();
    expect(root.querySelector('.basic-vocabulary-word-breakdown')).not.toBeNull();
    expect(root.querySelector('[data-rating="known"]')).not.toBeNull();
  });

  it('keeps phrase-first flow intact when artwork is absent', () => {
    const root = rootFor(WITH_EXAMPLE_ID);
    const payload = renderPayloadFor([WITH_EXAMPLE_ID]);
    delete payload.render[WITH_EXAMPLE_ID];
    root.querySelector('#basic-vocabulary-data')!.textContent = JSON.stringify(payload);
    initBasicVocabularySession(root);
    reveal(root);

    expect(root.querySelector('.basic-vocabulary-context-text')?.textContent).toBe(
      WITH_EXAMPLE_TEXT,
    );
    expect(root.querySelector('.basic-vocabulary-illustration')).toBeNull();
    expect(root.querySelector('.basic-vocabulary-word-breakdown')).not.toBeNull();
    expect(root.querySelector('[data-rating="known"]')).not.toBeNull();
  });
});
