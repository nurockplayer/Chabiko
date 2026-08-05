// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadBasicVocabularyCatalog } from '../src/content/basicVocabularyCatalog';
import {
  BASIC_VOCABULARY_CATALOG_PAGE_SIZE,
  selectBasicVocabularyCatalogPage,
} from '../src/domain/basicVocabularyCatalog';

/** Route-contract tests for `/vocabulary/basic/words/` (Issue #280). These
 * assert the exact source contract of the new route and component — the
 * build-time load, title/back-link/control copy, SSR card shape, and safe JSON
 * escaping — against the #278 loader and selector, without running a server. */
describe('basic vocabulary catalog route', () => {
  it('loads the full production catalog once at build time and fails on an empty catalog', async () => {
    const route = await readFile('src/pages/vocabulary/basic/words/index.astro', 'utf8');
    const catalog = loadBasicVocabularyCatalog();

    expect(route).toContain("from '../../../../content/basicVocabularyCatalog'");
    expect(route.match(/loadBasicVocabularyCatalog\(\)/g)).toHaveLength(1);
    expect(route).toContain('basic vocabulary catalog is empty');
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('renders the exact title, h1, and back link before the controls', async () => {
    const route = await readFile('src/pages/vocabulary/basic/words/index.astro', 'utf8');
    const component = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    expect(route).toContain('<BaseLayout title="単語一覧">');
    expect(route).toContain('<h1>単語一覧</h1>');

    const backLinkIndex = component.indexOf('href="/vocabulary/basic/"');
    const controlsIndex = component.indexOf('data-catalog-search');
    expect(backLinkIndex).toBeGreaterThan(-1);
    expect(controlsIndex).toBeGreaterThan(backLinkIndex);
    expect(component).toContain('単語学習に戻る');
  });

  it('exposes the exact control copy and select option values', async () => {
    const component = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');
    const client = await readFile('src/client/basicVocabularyCatalog.ts', 'utf8');

    expect(component).toContain('type="search"');
    expect(component).toContain('単語を検索');
    expect(component).toContain('中国語・ピンイン・日本語');
    expect(component).toContain('学習状態');
    for (const [value, label] of [
      ['all', 'すべて'],
      ['new', '新規'],
      ['learning', '学習中'],
      ['learned', '習得済み'],
    ] as const) {
      expect(component).toContain(`<option value="${value}">${label}</option>`);
    }
    expect(component).toContain('前へ');
    expect(component).toContain('次へ');
    // Search and status are page-memory only: no URL or storage persistence.
    expect(client).not.toMatch(/URLSearchParams|history\.|location\.(search|hash)/);
  });

  it('server-renders exactly the first 24 production-order cards via the domain selector', async () => {
    const component = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');
    const catalog = loadBasicVocabularyCatalog();

    // The component derives its SSR page from the #278 selector over the full
    // catalog with empty search/status on page 1 — never a hard-coded count.
    expect(component).toContain('selectBasicVocabularyCatalogPage');
    expect(component).toContain("from '../../domain/basicVocabularyCatalog'");
    expect(component).toContain('firstPage.items.map');

    const firstPage = selectBasicVocabularyCatalogPage(catalog, {}, {
      searchText: '',
      status: 'all',
      page: 1,
    });
    expect(firstPage.items).toHaveLength(24);
    expect(firstPage.items).toHaveLength(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
    expect(firstPage.items.map((entry) => entry.item.learnerId)).toEqual(
      catalog.slice(0, BASIC_VOCABULARY_CATALOG_PAGE_SIZE).map((item) => item.learnerId),
    );
    // The component maps exactly this selector result into its SSR card list.
    expect(component).toContain('firstPage.items.map');
    expect(component).toContain('<li class="basic-vocabulary-catalog-card">');
    // Exactly one SSR list container holds the bounded 24-card page.
    expect(component.match(/<ol class="basic-vocabulary-catalog-results"/g)).toHaveLength(1);
  });

  it('escapes every < as \\u003c in the JSON payload and keeps only catalog fields', async () => {
    const route = await readFile('src/pages/vocabulary/basic/words/index.astro', 'utf8');
    const catalog = loadBasicVocabularyCatalog();

    // The route serializes with the exact escaping rule from the issue.
    expect(route).toContain("JSON.stringify(catalog).replace(/</g, '\\\\u003c')");

    // Re-run the exact route expression against the real loader: the serialized
    // payload must never contain a raw `<`, and must contain only catalog fields.
    const itemsJson = JSON.stringify(catalog).replace(/</g, '\\u003c');
    expect(itemsJson).not.toContain('<');

    const parsed = JSON.parse(itemsJson) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(catalog.length);
    const allowed = new Set([
      'learnerId', 'simplified', 'traditional', 'pinyin', 'japanese',
      'partOfSpeech', 'difficulty', 'illustration',
    ]);
    for (const item of parsed) {
      for (const key of Object.keys(item)) {
        expect(allowed.has(key)).toBe(true);
      }
      const illustration = item.illustration as Record<string, unknown>;
      expect(Object.keys(illustration).sort()).toEqual(['altJa', 'assetPath', 'height', 'width']);
    }
    // No preview-only fields anywhere in the payload.
    const previewFields = ['sourceSheet', 'sourceRow', 'state', 'provenance', 'rights', 'reviewStatus', 'checksum'];
    for (const key of previewFields) {
      expect(itemsJson).not.toContain(key);
    }
  });

  it('declares exact optional-field/lang and image attributes for SSR cards', async () => {
    const component = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    // The SSR template must bind the illustration metadata and optional fields
    // exactly (asset path, dimensions, alt, lazy/async, and the lang pairs).
    expect(component).toContain('pageItem.item.illustration.assetPath');
    expect(component).toContain('pageItem.item.illustration.width');
    expect(component).toContain('pageItem.item.illustration.height');
    expect(component).toContain('pageItem.item.illustration.altJa');
    expect(component).toContain('loading="lazy"');
    expect(component).toContain('decoding="async"');
    expect(component).toContain('lang="zh-Hans"');
    expect(component).toContain('lang="zh-Hant"');
    expect(component).toContain('lang="zh-Latn"');
    expect(component).toContain('lang="ja"');
    // Optional fields render only when truthfully present; the SSR template
    // never emits a status badge element (client-side only) and never a badge
    // in the card markup. The only `data-status` occurrences in the component
    // are CSS attribute selectors, not rendered badges.
    expect(component).toContain('pageItem.item.traditional !== undefined');
    expect(component).toContain('pageItem.item.pinyin !== undefined');
    expect(component).toContain('pageItem.item.japanese !== undefined');
    expect(component).not.toMatch(/<span class="basic-vocabulary-catalog-badge"/);
    expect(component).not.toMatch(/data-action|rating|reset/);

    // The SSR card template binds the first page's illustration and simplified
    // headword directly; the 24-item page is what the server emits.
    expect(component).toContain('src={pageItem.item.illustration.assetPath}');
    expect(component).toContain('{pageItem.item.simplified}');
  });

  it('has no progress-write, reset, rating, editing, network, or storage calls in the client', async () => {
    const client = await readFile('src/client/basicVocabularyCatalog.ts', 'utf8');

    expect(client).not.toMatch(/applyRating|resetAll|selectSession/);
    expect(client).not.toMatch(/localStorage\.(setItem|removeItem|clear)|sessionStorage/);
    expect(client).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/);
    expect(client).not.toMatch(/IntersectionObserver|Virtual|debounce/);
  });

  it('declares single-column mobile and bounded multi-column desktop grids with wrapping text', async () => {
    const component = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    // Default (320/375/390px) is a single column; larger screens expand.
    expect(component).toContain('grid-template-columns: 1fr;');
    expect(component).toContain('@media (min-width: 640px)');
    expect(component).toContain('@media (min-width: 960px)');
    expect(component).not.toMatch(/grid-template-columns:\s*(repeat\(auto-fit|repeat\(4|repeat\(6)/);
    // Long text wraps; no nowrap; no horizontal overflow.
    expect(component).not.toMatch(/white-space:\s*nowrap/);
    expect(component).toContain('overflow-wrap: anywhere');
    // Only the current page of images exists and all are lazy-loaded.
    expect(component).toContain('loading="lazy"');
  });
});
