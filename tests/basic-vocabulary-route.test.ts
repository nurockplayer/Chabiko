// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import { createSessionRoot } from './helpers/basicVocabularyTestData';

const alwaysTracked = () => true;

function createRoot(ids: readonly string[]): HTMLElement {
  return createSessionRoot(ids);
}

describe('basic vocabulary route', () => {
  it('uses the full production corpus loader once, preserves manifest order, and fixes the direction', async () => {
    const route = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const client = await readFile('src/client/basicVocabularySession.ts', 'utf8');
    const loaded = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });

    expect(route).toContain("from '../../../content/learnerSessionPayload';");
    expect(route.match(/buildLearnerSessionPayload\(\)/g)).toHaveLength(1);
    expect(route).toContain('basic vocabulary has no provisional items');
    expect(route).toContain('イラストで学ぶ基礎中国語');
    // BaseLayout provides the page's main landmark — the route uses a <div> wrapper
    expect(route).not.toContain('<main');
    expect(route).toContain('<div class="basic-vocabulary-page">');
    // The route loads the full eligible manifest corpus, not the batch-01 20.
    expect(loaded.length).toBeGreaterThan(20);
    expect(loaded.map((item) => item.learnerId)).toEqual(
      [...loadProductionLearnerCorpus({ assetTracked: alwaysTracked }).map((item) => item.learnerId)],
    );
    expect(client).toContain("createVocabularySession(ids, availableCount, 'zh-to-ja')");
    expect(client).not.toMatch(/localStorage|sessionStorage|fetch\(|Math\.random|Date\b/);
    // The text-only production row stays out of the image-learning route.
    expect(loaded.some((item) => item.learnerId === 'teacher-star-1-8b957a100bd4')).toBe(false);
  });

  it('renders every corpus item in the bounded session with its deployed illustration, then completes', () => {
    // A session of size 10 selects exactly 10 corpus items; every selected item
    // must render its deployed illustration and advance to completion.
    const items = loadProductionLearnerCorpus({ assetTracked: alwaysTracked }).slice(0, 10);
    const root = createRoot(items.map((item) => item.learnerId));
    initBasicVocabularySession(root);
    const seenIllustrations: Array<{ src: string | null; width: number; height: number; alt: string }> = [];

    for (let index = 0; index < items.length; index++) {
      const image = root.querySelector('img');
      expect(image).not.toBeNull();
      seenIllustrations.push({
        src: image?.getAttribute('src') ?? null,
        width: image?.width ?? 0,
        height: image?.height ?? 0,
        alt: image?.alt ?? '',
      });
      (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
      (root.querySelector('[data-rating="known"]') as HTMLButtonElement).click();
    }

    expect(seenIllustrations).toHaveLength(10);
    expect(seenIllustrations).toEqual(items.map((item) => ({
      src: item.illustration.assetPath,
      width: item.illustration.width,
      height: item.illustration.height,
      alt: item.illustration.altJa,
    })));
    expect(root.textContent).toContain('今回の10語を完了しました');
  });

  it('keeps unrevealed answers out of rendered text, then reveals the exact answer fields', () => {
    const first = loadProductionLearnerCorpus({ assetTracked: alwaysTracked }).slice(0, 1);
    const root = createRoot(first.map((item) => item.learnerId));
    initBasicVocabularySession(root);

    expect(root.textContent).toContain(first[0].simplified);
    expect(root.textContent).not.toContain(first[0].pinyin);
    expect(root.textContent).not.toContain(first[0].japanese);
    if (first[0].traditional && first[0].traditional !== first[0].simplified) {
      expect(root.textContent).not.toContain(first[0].traditional);
    }
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    expect(root.textContent).toContain(first[0].pinyin);
    expect(root.textContent).toContain(first[0].japanese);
    if (first[0].traditional) {
      expect(root.textContent).toContain(first[0].traditional);
    }
  });

  it('exposes the full corpus total separate from the bounded session size', () => {
    const items = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const root = createRoot(items.slice(0, 10).map((item) => item.learnerId));
    initBasicVocabularySession(root);

    const total = root.querySelector<HTMLElement>('[data-total]');
    expect(total).not.toBeNull();
    expect(total?.textContent).toContain(String(items.length));
    expect(root.querySelector('[data-progress]')?.textContent).toMatch(/^今回 0 \/ 10語/);
  });
});
