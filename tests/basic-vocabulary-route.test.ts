// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadTeacherVocabulary } from '../src/content/loadTeacherVocabulary';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';

type Item = ReturnType<typeof loadTeacherVocabulary>[number];

function createRoot(items: readonly Item[]): HTMLElement {
  const ids = items.map((item) => item.vocabulary.id);
  const root = document.createElement('section');
  root.dataset.basicVocabularyIds = JSON.stringify(ids);
  root.innerHTML = '<p data-progress aria-live="polite"></p><div data-card></div>';
  document.body.append(root);
  return root;
}

describe('basic vocabulary route', () => {
  it('uses the teacher loader once, preserves its full order, and fixes the direction', async () => {
    const route = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const client = await readFile('src/client/basicVocabularySession.ts', 'utf8');
    const loaded = loadTeacherVocabulary();

    expect(route).toContain("import { loadTeacherVocabulary } from '../../../content/loadTeacherVocabulary';");
    expect(route.match(/loadTeacherVocabulary\(\)/g)).toHaveLength(1);
    expect(route).toContain('basic vocabulary has no provisional items');
    expect(route).toContain('イラストで学ぶ基礎中国語');
    // BaseLayout provides the page's main landmark — the route uses a <div> wrapper
    expect(route).not.toContain('<main');
    expect(route).toContain('<div class="basic-vocabulary-page">');
    expect(loaded).toHaveLength(20);
    expect(loaded.map((item) => item.vocabulary.id)).toEqual([
      'teacher-star-1-37e0eb213f0f', 'teacher-star-1-a66948a76fda',
      'teacher-star-1-86f5cdb6e25c', 'teacher-star-1-bdc7865a507e',
      'teacher-star-1-86367b2d53f6', 'teacher-star-1-8b957a100bd4',
      'teacher-star-1-2cfcacc0503e', 'teacher-star-1-e7bc12c4f23a',
      'teacher-star-1-e64490a207eb', 'teacher-star-1-bada4e11125d',
      'teacher-star-1-d903f490725f', 'teacher-star-1-7420330fee5c',
      'teacher-star-1-ed096023b3be', 'teacher-star-1-cb42fb8775e5',
      'teacher-star-1-c39a19585434', 'teacher-star-1-3e6fabf09358',
      'teacher-star-1-1c0cdf0b2b9c', 'teacher-star-1-8fea4ac29b4c',
      'teacher-star-1-94757170c2b0', 'teacher-star-1-0cc5799cdbbc',
    ]);
    expect(client).toContain("createVocabularySession(ids, availableCount, 'zh-to-ja')");
    expect(client).not.toMatch(/localStorage|sessionStorage|fetch\(|Math\.random|Date\b/);
  });

  it('renders all 19 exact illustrations and the text-only item without an image', () => {
    const items = loadTeacherVocabulary();
    const root = createRoot(items);
    initBasicVocabularySession(root);
    const seenIllustrations: Array<{ src: string | null; width: number; height: number; alt: string }> = [];

    for (const item of items) {
      const image = root.querySelector('img');
      if (item.illustration) {
        expect(image).not.toBeNull();
        seenIllustrations.push({
          src: image?.getAttribute('src') ?? null,
          width: image?.width ?? 0,
          height: image?.height ?? 0,
          alt: image?.alt ?? '',
        });
      } else {
        expect(image).toBeNull();
        expect(root.querySelector('[data-card]')?.textContent).toContain('小姐');
      }
      (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
      (root.querySelector('[data-rating="known"]') as HTMLButtonElement).click();
    }

    expect(seenIllustrations).toHaveLength(19);
    expect(seenIllustrations).toEqual(items.flatMap((item) => item.illustration ? [{
      src: item.illustration.assetPath,
      width: item.illustration.width,
      height: item.illustration.height,
      alt: item.illustration.altJa,
    }] : []));
    expect(root.textContent).toContain('今回の学習は完了です');
  });

  it('keeps unrevealed answers out of rendered text, then reveals the exact answer fields', () => {
    const first = loadTeacherVocabulary().slice(0, 1);
    const root = createRoot(first);
    initBasicVocabularySession(root);

    expect(root.textContent).toContain(first[0].vocabulary.simplified);
    expect(root.textContent).not.toContain(first[0].vocabulary.pinyin);
    expect(root.textContent).not.toContain(first[0].vocabulary.japanese);
    if (first[0].vocabulary.traditional && first[0].vocabulary.traditional !== first[0].vocabulary.simplified) {
      expect(root.textContent).not.toContain(first[0].vocabulary.traditional);
    }
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    expect(root.textContent).toContain(first[0].vocabulary.pinyin);
    expect(root.textContent).toContain(first[0].vocabulary.japanese);
    if (first[0].vocabulary.traditional) {
      expect(root.textContent).toContain(first[0].vocabulary.traditional);
    }
  });
});
