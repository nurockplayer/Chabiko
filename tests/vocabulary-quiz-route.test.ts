// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import { buildVocabularyQuizPayload } from '../src/content/vocabularyQuizPayload';
import { initBasicVocabularyQuiz } from '../src/client/basicVocabularyQuiz';

const alwaysTracked = () => true;

function eligibleIds(count = 10): string[] {
  return loadProductionLearnerCorpus({ assetTracked: alwaysTracked })
    .filter((item) => (item.japanese?.trim().length ?? 0) > 0)
    .slice(0, count)
    .map((item) => item.learnerId);
}

function createQuizRoot(ids: string[]): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyQuiz = '';
  root.innerHTML =
    '<nav><a href="/vocabulary/basic/">back</a></nav>' +
    '<p data-quiz-total></p><p data-quiz-progress></p><p data-quiz-score></p>' +
    '<div data-quiz-card></div>' +
    `<script type="application/json" id="basic-vocabulary-quiz-data">${JSON.stringify({ eligibleIds: ids })}</script>`;
  document.body.append(root);
  return root;
}

describe('vocabulary quiz route', () => {
  it('loads the production corpus once, guards an empty corpus, and never renders an image', async () => {
    const route = await readFile('src/pages/vocabulary/basic/quiz/index.astro', 'utf8');
    const component = await readFile('src/components/vocabulary/BasicVocabularyQuiz.astro', 'utf8');
    const client = await readFile('src/client/basicVocabularyQuiz.ts', 'utf8');
    const entryPage = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');

    expect(route).toContain("from '../../../../content/vocabularyQuizPayload';");
    expect(route.match(/buildVocabularyQuizPayload\(\)/g)).toHaveLength(1);
    expect(route).toContain('basic vocabulary quiz has no eligible items');
    expect(route).toContain('絵なしテスト');

    // The image-free guarantee is structural: no image is ever emitted.
    expect(route).not.toContain('<img');
    expect(component).not.toContain('<img');
    expect(client).not.toMatch(/createElement\(['"]img['"]\)|querySelector\(['"]img['"]\)/);

    // The quiz is an assessment only: no progress writes, no randomness, no time.
    expect(client).not.toMatch(/localStorage|sessionStorage|fetch\(|Math\.random|Date\b/);

    // The existing image-card learning flow exposes an explicit entry point.
    expect(entryPage).toContain('href="/vocabulary/basic/quiz/"');
  });

  it('derives the eligible ID set from the production corpus, not a hard-coded list', () => {
    const payload = buildVocabularyQuizPayload();
    expect(payload.eligibleIds.length).toBeGreaterThan(0);
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const expected = corpus.filter((item) => (item.japanese?.trim().length ?? 0) > 0).length;
    expect(payload.eligibleIds.length).toBe(expected);
  });
});

describe('vocabulary quiz client', () => {
  it('exposes only the Simplified headword and four Japanese choices before commitment', () => {
    const root = createQuizRoot(eligibleIds());
    initBasicVocabularyQuiz(root);

    // No image ever.
    expect(root.querySelectorAll('img')).toHaveLength(0);

    const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
    expect(card.querySelector('.basic-vocabulary-quiz-simplified')).not.toBeNull();

    const options = card.querySelectorAll<HTMLButtonElement>('[data-action="select"]');
    expect(options).toHaveLength(4);

    // No pinyin / traditional / answer text is present before commit.
    expect(card.querySelector('.basic-vocabulary-quiz-pinyin')).toBeNull();
    expect(card.querySelector('.basic-vocabulary-quiz-traditional')).toBeNull();
    expect(card.querySelector('.basic-vocabulary-quiz-japanese')).toBeNull();
    expect(card.querySelector('.basic-vocabulary-quiz-feedback')).toBeNull();

    // Submit is disabled until a choice is made.
    const submit = card.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    expect(submit.disabled).toBe(true);
  });

  it('marks a selection, enables submit, and reveals feedback plus the answer', () => {
    const root = createQuizRoot(eligibleIds());
    initBasicVocabularyQuiz(root);

    const options = root.querySelectorAll<HTMLButtonElement>('[data-action="select"]');
    // Options and the submit control are native, keyboard-focusable buttons.
    for (const option of options) {
      expect(option.tagName).toBe('BUTTON');
      expect(option.type).toBe('button');
      expect(option.disabled).toBe(false);
    }
    const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    expect(submit.tagName).toBe('BUTTON');
    expect(submit.type).toBe('button');

    options[0].click();

    expect(submit.disabled).toBe(false);
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    expect(options[1].getAttribute('aria-pressed')).toBe('false');

    submit.click();

    const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
    expect(card.querySelector('.basic-vocabulary-quiz-feedback')).not.toBeNull();
    // Exactly one option is the correct answer.
    expect(card.querySelectorAll('[data-correct="true"]')).toHaveLength(1);
    // Post-commit reveal includes pinyin and the Japanese meaning.
    expect(card.querySelector('.basic-vocabulary-quiz-pinyin')).not.toBeNull();
    expect(card.querySelector('.basic-vocabulary-quiz-japanese')).not.toBeNull();
    // Still no image after commit.
    expect(root.querySelectorAll('img')).toHaveLength(0);
    // The next action exists, is focusable, and receives focus after submit.
    const next = card.querySelector<HTMLButtonElement>('[data-action="next"]')!;
    expect(next.tagName).toBe('BUTTON');
    expect(document.activeElement).toBe(next);
  });

  it('advances through every question to completion and restarts with a reset score', () => {
    const ids = eligibleIds(10);
    const root = createQuizRoot(ids);
    initBasicVocabularyQuiz(root);

    const total = 10;
    for (let i = 0; i < total; i++) {
      const option = root.querySelector<HTMLButtonElement>('[data-action="select"]')!;
      option.click();
      root.querySelector<HTMLButtonElement>('[data-action="submit"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-action="next"]')!.click();
    }

    const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
    expect(card.querySelector('.basic-vocabulary-quiz-completion-title')).not.toBeNull();
    expect(root.querySelector('[data-quiz-progress]')?.textContent).toBe(`${total} / ${total}`);
    expect(root.querySelector<HTMLElement>('[data-quiz-score]')?.textContent).toMatch(/^正解 \d+ \/ 10$/);

    const restart = card.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
    restart.click();

    expect(root.querySelector('.basic-vocabulary-quiz-completion-title')).toBeNull();
    expect(root.querySelectorAll<HTMLButtonElement>('[data-action="select"]')).toHaveLength(4);
    expect(root.querySelector<HTMLElement>('[data-quiz-score]')?.textContent).toBe('正解 0 / 10');
  });
});
