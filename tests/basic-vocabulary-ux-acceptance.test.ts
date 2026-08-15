// @vitest-environment happy-dom

/**
 * Basic-vocabulary UX final integration acceptance (Issue #281).
 *
 * This file only covers cross-surface guarantees that the focused child suites
 * cannot prove on their own: that study, catalog, and home derive the same
 * non-zero production corpus; that a rated study session propagates truthful
 * statuses to the catalog through the shared progress store; that continuation
 * and exact replay differ over the same real IDs; that catalog browsing leaves
 * the progress document byte-identical; that repeated Astro-style
 * initialization/cleanup leaves exactly one live controller per root; and that
 * the source/route contract plus the responsive/a11y containment declarations
 * hold. It deliberately does not re-test every child-suite behavior.
 *
 * The 1,582 total is reconciled here against the canonical production loader
 * and the manifest totals, exactly as the parent initiative requires; no
 * production UI or route code hard-codes that number.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import { initBasicVocabularyCatalog } from '../src/client/basicVocabularyCatalog';
import { loadBasicVocabularyCatalog } from '../src/content/basicVocabularyCatalog';
import { buildLearnerSessionPayload } from '../src/content/learnerSessionPayload';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
} from '../src/domain/basicVocabularyProgress';
import {
  BASIC_VOCABULARY_CATALOG_PAGE_SIZE,
  selectBasicVocabularyCatalogPage,
} from '../src/domain/basicVocabularyCatalog';
import { createSessionRoot } from './helpers/basicVocabularyTestData';

/** Canonical production total, derived once from the loader. */
const CORPUS_TOTAL = buildLearnerSessionPayload().totalCount;

// ─── Shared happy-dom helpers ──────────────────────────────────────────────────

const cleanups = new Set<() => void>();

function initSession(root: HTMLElement): void {
  cleanups.add(initBasicVocabularySession(root));
}

function initCatalog(root: HTMLElement): void {
  cleanups.add(initBasicVocabularyCatalog(root));
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  (root.querySelector(`[data-rating="${rating}"]`) as HTMLButtonElement).click();
}

function completeSession(root: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) {
    reveal(root);
    rate(root, 'known');
  }
}

function seedProgress(
  items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }>,
): void {
  window.localStorage.setItem(
    BASIC_VOCABULARY_PROGRESS_KEY,
    JSON.stringify({ version: 1, items }),
  );
}

function dispatchStorage(key: string | null, newValue: string | null, storageArea: Storage | null): void {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea }));
}

/** Build a minimal catalog root that mirrors the component's client-visible
 * markup and carries the exact serialized JSON payload. */
function createCatalogRoot(items: readonly unknown[], withPagination = true): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyCatalog = '';
  const pagination = withPagination
    ? `<button data-catalog-page="previous" type="button">前へ</button>` +
      `<span data-catalog-page-indicator>1 / 1</span>` +
      `<button data-catalog-page="next" type="button">次へ</button>`
    : '';
  root.innerHTML =
    `<p data-catalog-summary aria-live="polite"></p>` +
    `<ol data-catalog-results></ol>` +
    pagination +
    `<script type="application/json" id="basic-vocabulary-catalog-data">${JSON.stringify(items).replace(/</g, '\\u003c')}</script>`;
  document.body.append(root);
  return root;
}

const catalogBadges = (root: HTMLElement): (string | null | undefined)[] =>
  [...root.querySelectorAll<HTMLElement>('li.basic-vocabulary-catalog-card')].map(
    (card) => card.querySelector('[data-status]')?.textContent,
  );

// ─── selectSession spy (Issue #281 continue-vs-replay evidence) ──────────────

const originalSelectSession = BasicVocabularyProgressStore.prototype.selectSession;
let selectCalls: Array<{ ids: string[]; size: number; result: string[] }> = [];

function spySelectSession(): void {
  selectCalls = [];
  BasicVocabularyProgressStore.prototype.selectSession = function (
    this: BasicVocabularyProgressStore,
    ids: readonly string[],
    sessionSize: number,
  ) {
    const result = originalSelectSession.call(this, ids, sessionSize);
    selectCalls.push({ ids: [...ids], size: sessionSize, result: [...result] });
    return result;
  };
}

function restoreSelectSession(): void {
  BasicVocabularyProgressStore.prototype.selectSession = originalSelectSession;
}

afterEach(() => {
  restoreSelectSession();
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// ─── Source / route contract ──────────────────────────────────────────────────

describe('source and route contract (Issue #281)', () => {
  it('home, study, and catalog expose exactly the expected generated links, once each', async () => {
    const home = await readFile('src/pages/index.astro', 'utf8');
    const study = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const catalogComponent = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    // Home (Issue #374 Dashboard): the 先生厳選単語 track card is the study
    // entry point; destinations are derived by the domain module, not
    // hard-coded into the page. No old static entry copy remains.
    expect(home).toContain('data-dashboard-track={trackId}');
    expect(home).not.toContain('単語学習を始める');
    expect(home).not.toContain('単語一覧を見る');
    expect(home).not.toContain('basic-vocabulary-entry');

    // Study: exactly one catalog link, no duplicate home/study CTA.
    expect(study.match(/href="\/vocabulary\/basic\/words\/"/g)).toHaveLength(1);
    expect(study).not.toContain('単語学習を始める');

    // Catalog back link resolves to the study route; no duplicate links.
    expect(catalogComponent.match(/href="\/vocabulary\/basic\/"/g)).toHaveLength(1);
    expect(catalogComponent).toContain('単語学習に戻る');
    expect(catalogComponent).not.toContain('単語一覧を見る');
  });

  it('does not duplicate IDs or links within any of the three surfaces', async () => {
    const home = await readFile('src/pages/index.astro', 'utf8');
    const study = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const catalogComponent = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    for (const source of [home, study, catalogComponent]) {
      const ids = source.match(/id="[^"]+"/g) ?? [];
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const id of ids) {
        if (seen.has(id)) duplicates.push(id);
        seen.add(id);
      }
      expect(duplicates).toEqual([]);
    }

    // The catalog search/status inputs each have exactly one label association.
    expect(catalogComponent.match(/id="basic-vocabulary-catalog-search"/g)).toHaveLength(1);
    expect(catalogComponent.match(/id="basic-vocabulary-catalog-status"/g)).toHaveLength(1);
  });

  it('never hard-codes the 1,582 total in any production page/component/client', async () => {
    const files = [
      'src/pages/index.astro',
      'src/pages/vocabulary/basic/index.astro',
      'src/pages/vocabulary/basic/words/index.astro',
      'src/components/vocabulary/BasicVocabularySession.astro',
      'src/components/vocabulary/BasicVocabularyCatalog.astro',
      'src/client/basicVocabularySession.ts',
      'src/client/basicVocabularyCatalog.ts',
    ];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source).not.toContain('1582');
    }
  });

  it('track/catalog links are native anchors with visible focus styles and 44px minimum targets', async () => {
    const home = await readFile('src/pages/index.astro', 'utf8');
    const study = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const catalogComponent = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    // The Dashboard track card is the home entry point to the study route
    // (Issue #374 migration of the former basic-vocabulary-entry catalog link).
    const homeTrackTemplate = home.match(
      /<a\s+class="track-card"[\s\S]*?data-dashboard-track=\{trackId\}[\s\S]*?>/,
    );
    expect(homeTrackTemplate).not.toBeNull();
    expect(homeTrackTemplate![0]).not.toMatch(/\btabindex="-1"\b/);

    const studyCatalogLink = study.match(
      /<a[^>]*class="basic-vocabulary-page__catalog-link"[^>]*>/,
    );
    expect(studyCatalogLink).not.toBeNull();
    expect(studyCatalogLink![0]).not.toContain('disabled');

    // Both surfaces declare a 44px minimum interactive target.
    const homeStyleMatch = home.match(/<style>([\s\S]*?)<\/style>/);
    expect(homeStyleMatch).not.toBeNull();
    const homeRules = (homeStyleMatch![1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}');
    const trackCardRule = homeRules.find(
      (rule) => rule.includes('.track-card') && rule.includes('min-height'),
    );
    expect(trackCardRule).toBeDefined();
    const studyStyleMatch = study.match(/<style>([\s\S]*?)<\/style>/);
    expect(studyStyleMatch).not.toBeNull();
    const studyRules = (studyStyleMatch![1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}');
    const studyCatalogRule = studyRules.find(
      (rule) => rule.includes('.basic-vocabulary-page__catalog-link') && rule.includes('min-height'),
    );
    expect(studyCatalogRule).toBeDefined();

    // Focus styles must not be suppressed for either surface.
    for (const source of [home, study]) {
      const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
      expect(styleMatch).not.toBeNull();
      const rules = (styleMatch![1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').split('}');
      const focusRule = rules.find((rule) => rule.includes(':focus-visible'));
      expect(focusRule).toBeDefined();
      expect(focusRule).not.toContain('outline: 0');
      expect(focusRule).not.toContain('outline: none');
    }

    expect(catalogComponent).toContain('min-height: 2.75rem');
    expect(catalogComponent).toContain('.basic-vocabulary-catalog-back a');
    expect(catalogComponent).toContain('.basic-vocabulary-catalog-field input:focus-visible');
    expect(catalogComponent).toContain('.basic-vocabulary-catalog-field select:focus-visible');
  });
});

// ─── Production total reconciliation ─────────────────────────────────────────

describe('production corpus reconciliation (Issue #281)', () => {
  it('study and catalog derive the same non-zero total from the canonical loader', () => {
    const payload = buildLearnerSessionPayload();
    const catalog = loadBasicVocabularyCatalog();
    const corpus = loadProductionLearnerCorpus();

    expect(payload.totalCount).toBeGreaterThan(0);
    expect(catalog.length).toBe(payload.totalCount);
    expect(catalog.length).toBe(corpus.length);
    // The full manifest-ordered IDs behind the session and the catalog agree.
    expect(catalog.map((item) => item.learnerId)).toEqual([...payload.ids]);
  });

  it('the current production total reconciles to 1,582 with the manifest totals', () => {
    const manifest = JSON.parse(
      readFileSync('data/teacher-vocabulary-preview/learner-manifest.json', 'utf8'),
    ) as { totals: { eligible: number } };

    const catalog = loadBasicVocabularyCatalog();
    const corpus = loadProductionLearnerCorpus();

    expect(manifest.totals.eligible).toBe(1582);
    expect(catalog.length).toBe(1582);
    expect(corpus.length).toBe(1582);
    expect(catalog.length).toBe(manifest.totals.eligible);
    expect(corpus.length).toBe(manifest.totals.eligible);
  });

  it('exposes the full production set exactly once in loader/source order through 24-item pages', () => {
    const catalog = loadBasicVocabularyCatalog();
    const pageCount = Math.ceil(catalog.length / BASIC_VOCABULARY_CATALOG_PAGE_SIZE);

    // Walk every page and collect the IDs exactly as the catalog would.
    const walked: string[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= pageCount; page++) {
      const result = selectBasicVocabularyCatalogPage(catalog, {}, {
        searchText: '',
        status: 'all',
        page,
      });
      expect(result.items.length).toBeLessThanOrEqual(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
      for (const entry of result.items) {
        expect(seen.has(entry.item.learnerId)).toBe(false);
        seen.add(entry.item.learnerId);
        walked.push(entry.item.learnerId);
      }
    }

    expect(seen.size).toBe(catalog.length);
    expect(walked).toEqual(catalog.map((item) => item.learnerId));
  });

  it('study surfaces the data-derived total and bounded window without implying ten words total', () => {
    const payload = buildLearnerSessionPayload();
    const root = createSessionRoot([...payload.ids], '10');
    initSession(root);

    expect(root.querySelector('[data-total]')?.textContent).toBe(`全${CORPUS_TOTAL}語`);
    expect(root.querySelector('[data-progress]')?.textContent).toBe('今回 0 / 10語');
    const summary = root.querySelector('[data-summary]')?.textContent ?? '';
    expect(summary).toContain(`新規 ${payload.ids.length}語`);
    expect(summary).toContain('学習中 0語');
    expect(summary).toContain('習得済み 0語');
    // The session is explicitly bounded; it must not claim the corpus is 10.
    expect(root.querySelector('[data-total]')?.textContent).not.toContain('10語');
  });
});

// ─── Study → catalog status propagation ───────────────────────────────────────

describe('cross-surface study → catalog lifecycle (Issue #281)', () => {
  it('rating in study then a storage refresh makes the catalog status truthful for the same production IDs', () => {
    const payload = buildLearnerSessionPayload();
    const sessionRoot = createSessionRoot([...payload.ids], '10');
    initSession(sessionRoot);

    completeSession(sessionRoot, 10);
    expect(sessionRoot.textContent).toContain('今回の10語を完了しました');

    // The completion write is the exact progress document the catalog reads.
    const stored = JSON.parse(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!) as {
      version: 1;
      items: Record<string, { status: string; knownStreak: number }>;
    };
    for (const id of payload.ids.slice(0, 10)) {
      expect(stored.items[id]).toEqual({ status: 'learning', knownStreak: 1 });
    }

    // Catalog over the same ten production IDs shows truthful statuses on init.
    const catalogRoot = createCatalogRoot(
      loadBasicVocabularyCatalog().slice(0, 10),
      true,
    );
    initCatalog(catalogRoot);
    expect(catalogBadges(catalogRoot)).toEqual(Array(10).fill('学習中'));

    // A storage refresh (same key, new value) keeps the status truthful.
    dispatchStorage(
      BASIC_VOCABULARY_PROGRESS_KEY,
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY),
      window.localStorage,
    );
    expect(catalogBadges(catalogRoot)).toEqual(Array(10).fill('学習中'));
  });

  it('external clear resets catalog statuses to new and the study summary to zero through store semantics', () => {
    const payload = buildLearnerSessionPayload();
    const catalog = loadBasicVocabularyCatalog();

    // Study: seed progress, then externally clear while a session is active.
    seedProgress({
      [payload.ids[0]]: { status: 'learning', knownStreak: 1 },
      [payload.ids[1]]: { status: 'learned', knownStreak: 2 },
    });
    const sessionRoot = createSessionRoot([...payload.ids], '10');
    initSession(sessionRoot);
    const summary = sessionRoot.querySelector('[data-summary]')!;
    expect(summary.textContent).toContain('学習中 1語');
    expect(summary.textContent).toContain('習得済み 1語');

    window.localStorage.clear();
    dispatchStorage(null, null, window.localStorage);
    expect(summary.textContent).toContain('学習中 0語');
    expect(summary.textContent).toContain('習得済み 0語');
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();

    // Catalog: the same external clear shows every item as new.
    const slice = catalog.slice(0, 5);
    seedProgress({
      [slice[0].learnerId]: { status: 'learning', knownStreak: 1 },
    });
    const catalogRoot = createCatalogRoot(slice, false);
    initCatalog(catalogRoot);
    expect(catalogBadges(catalogRoot)).toEqual(['学習中', '新規', '新規', '新規', '新規']);

    window.localStorage.clear();
    dispatchStorage(null, null, window.localStorage);
    expect(catalogBadges(catalogRoot)).toEqual(Array(5).fill('新規'));
  });

  it('unrelated storage keys and storage areas are ignored by both surfaces', () => {
    const payload = buildLearnerSessionPayload();
    const sessionRoot = createSessionRoot([...payload.ids], '10');
    initSession(sessionRoot);

    dispatchStorage('chabiko:some-other-key', 'x', window.localStorage);
    expect(sessionRoot.querySelector('[data-progress]')?.textContent).toBe('今回 0 / 10語');

    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, 'x', window.sessionStorage);
    expect(sessionRoot.querySelector('[data-progress]')?.textContent).toBe('今回 0 / 10語');

    const catalogRoot = createCatalogRoot(loadBasicVocabularyCatalog().slice(0, 3), false);
    initCatalog(catalogRoot);
    expect(catalogBadges(catalogRoot)).toEqual(['新規', '新規', '新規']);

    dispatchStorage('chabiko:some-other-key', 'x', window.localStorage);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, 'x', window.sessionStorage);
    expect(catalogBadges(catalogRoot)).toEqual(['新規', '新規', '新規']);
  });
});

// ─── Continue versus replay evidence ─────────────────────────────────────────

describe('continue versus replay over production data (Issue #281)', () => {
  it('continue surfaces an unseen ID beyond the completed set; replay repeats the exact completed IDs/order', () => {
    spySelectSession();

    const payload = buildLearnerSessionPayload();
    const catalog = loadBasicVocabularyCatalog();
    const root = createSessionRoot([...payload.ids], '10');
    initSession(root);

    // Init selected the first bounded window of 10 unseen IDs.
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].result).toHaveLength(10);
    const firstWindow = selectCalls[0].result;
    expect(firstWindow.every((id) => payload.ids.slice(0, 10).includes(id))).toBe(true);
    const simplifiedOf = (ids: readonly string[]): string[] =>
      ids.map((id) => catalog.find((item) => item.learnerId === id)!.simplified);
    const firstSimplifieds = simplifiedOf(firstWindow);

    // Complete the 10-item session.
    for (let i = 0; i < 10; i++) {
      reveal(root);
      rate(root, 'known');
    }
    expect(root.textContent).toContain('今回の10語を完了しました');

    // Replay repeats the exact completed IDs/order and never re-runs the
    // selector (selectCalls stays at 1).
    (root.querySelector('[data-action="replay"]') as HTMLButtonElement).click();
    expect(selectCalls).toHaveLength(1);
    const replaySimplifieds: string[] = [];
    for (let i = 0; i < 10; i++) {
      replaySimplifieds.push(
        root.querySelector('.basic-vocabulary-simplified')?.textContent ?? '',
      );
      reveal(root);
      rate(root, 'known');
    }
    expect(replaySimplifieds).toEqual(firstSimplifieds);

    // Continue re-runs the store selector and surfaces unseen IDs past index 10.
    (root.querySelector('[data-action="continue"]') as HTMLButtonElement).click();
    expect(selectCalls).toHaveLength(2);
    const continueWindow = selectCalls[1].result;
    expect(continueWindow).toHaveLength(10);
    expect(continueWindow.some((id) => payload.ids.indexOf(id) >= 10)).toBe(true);
    expect(continueWindow.some((id) => !firstWindow.includes(id))).toBe(true);
    // The rendered continue session is exactly the selector result.
    const continueSimplifieds: string[] = [];
    for (let i = 0; i < 10; i++) {
      continueSimplifieds.push(
        root.querySelector('.basic-vocabulary-simplified')?.textContent ?? '',
      );
      reveal(root);
      rate(root, 'known');
    }
    expect(continueSimplifieds).toEqual(simplifiedOf(continueWindow));
  });
});

// ─── Catalog browsing read-only / byte-identity ──────────────────────────────

describe('catalog browse actions keep the progress document byte-identical (Issue #281)', () => {
  it('search, filter, and pagination never rewrite the progress document', () => {
    const catalog = loadBasicVocabularyCatalog();
    const root = document.createElement('section');
    root.dataset.basicVocabularyCatalog = '';
    root.innerHTML =
      `<input id="basic-vocabulary-catalog-search" data-catalog-search type="search" placeholder="中国語・ピンイン・日本語">` +
      `<select id="basic-vocabulary-catalog-status" data-catalog-status>` +
      `<option value="all">すべて</option><option value="new">新規</option>` +
      `<option value="learning">学習中</option><option value="learned">習得済み</option>` +
      `</select>` +
      `<p data-catalog-summary aria-live="polite"></p>` +
      `<ol data-catalog-results></ol>` +
      `<button data-catalog-page="previous" type="button">前へ</button>` +
      `<span data-catalog-page-indicator>1 / 1</span>` +
      `<button data-catalog-page="next" type="button">次へ</button>` +
      `<script type="application/json" id="basic-vocabulary-catalog-data">${JSON.stringify(catalog).replace(/</g, '\\u003c')}</script>`;
    document.body.append(root);
    initCatalog(root);

    const before = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(before).toBeNull();

    const search = root.querySelector<HTMLInputElement>('[data-catalog-search]')!;
    search.value = '看';
    search.dispatchEvent(new Event('input'));
    const select = root.querySelector<HTMLSelectElement>('[data-catalog-status]')!;
    select.value = 'new';
    select.dispatchEvent(new Event('change'));
    const next = root.querySelector<HTMLButtonElement>('[data-catalog-page="next"]')!;
    const prev = root.querySelector<HTMLButtonElement>('[data-catalog-page="previous"]')!;
    for (let i = 0; i < 3; i++) {
      if (next.disabled) break;
      next.click();
    }
    prev.click();

    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(before);

    // Even when progress exists, browse actions do not touch the stored bytes.
    seedProgress({
      [catalog[0].learnerId]: { status: 'learning', knownStreak: 1 },
    });
    const afterSeed = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    search.value = 'dà';
    search.dispatchEvent(new Event('input'));
    next.click();
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(afterSeed);
  });

  it('never renders more than 24 cards or images at once, all lazy-loaded with dimensions', () => {
    const catalog = loadBasicVocabularyCatalog();
    const root = createCatalogRoot(catalog, true);
    initCatalog(root);

    const assertCardBound = (): void => {
      const cards = root.querySelectorAll('li.basic-vocabulary-catalog-card');
      const images = root.querySelectorAll('li.basic-vocabulary-catalog-card img');
      expect(cards.length).toBeLessThanOrEqual(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
      expect(images.length).toBe(cards.length);
      for (const image of images) {
        expect(image.getAttribute('loading')).toBe('lazy');
        expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
        expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
      }
    };

    assertCardBound();
    const next = root.querySelector<HTMLButtonElement>('[data-catalog-page="next"]')!;
    while (!next.disabled) {
      next.click();
      assertCardBound();
    }
  });
});

// ─── Repeated initialization / cleanup ───────────────────────────────────────

describe('repeated Astro-style init/cleanup leaves one live controller per root (Issue #281)', () => {
  it('reinitializing a session root runs prior cleanup and does not duplicate listeners or writes', () => {
    const payload = buildLearnerSessionPayload();
    const root = createSessionRoot([...payload.ids], '10');

    // The second init disposes the first controller internally; only the final
    // controller stays live.
    initBasicVocabularySession(root);
    const live = initBasicVocabularySession(root);
    // Register the final live controller so afterEach() always tears it down,
    // including when an assertion below fails.
    cleanups.add(live);

    reveal(root);
    rate(root, 'known');
    const stored = JSON.parse(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!) as {
      items: Record<string, unknown>;
    };
    // Exactly one write — one item, one store, one controller.
    expect(Object.keys(stored.items)).toHaveLength(1);

    // Explicit cleanup leaves zero live controllers: neither a storage nor a
    // pageshow refresh can update the cleaned-up session root anymore. The
    // rated-item summary is the no-op baseline.
    const baseline = root.querySelector('[data-summary]')?.textContent;
    live();

    // A different progress document would re-render the summary if any
    // listener survived cleanup.
    seedProgress({
      [payload.ids[1]]: { status: 'learned', knownStreak: 2 },
    });
    dispatchStorage(
      BASIC_VOCABULARY_PROGRESS_KEY,
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY),
      window.localStorage,
    );
    window.dispatchEvent(new Event('pageshow'));
    // No listener survived: the summary is byte-identical to the baseline.
    expect(root.querySelector('[data-summary]')?.textContent).toBe(baseline);
  });

  it('cleanup removes the session listeners; a later storage event is a no-op', () => {
    const payload = buildLearnerSessionPayload();
    const root = createSessionRoot([...payload.ids], '10');
    const first = initBasicVocabularySession(root);
    const second = initBasicVocabularySession(root);

    first();
    second();

    seedProgress({
      [payload.ids[0]]: { status: 'learning', knownStreak: 1 },
    });
    dispatchStorage(
      BASIC_VOCABULARY_PROGRESS_KEY,
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY),
      window.localStorage,
    );
    // No listener survived: summary stays all-new.
    expect(root.querySelector('[data-summary]')?.textContent).toContain('新規 1582語');
  });

  it('reinitializing a catalog root runs prior cleanup and keeps one live controller', () => {
    const slice = loadBasicVocabularyCatalog().slice(0, 5);
    const root = createCatalogRoot(slice, false);

    const first = initBasicVocabularyCatalog(root);
    const second = initBasicVocabularyCatalog(root);
    expect(root.querySelectorAll('li.basic-vocabulary-catalog-card')).toHaveLength(5);
    expect(catalogBadges(root)).toEqual(Array(5).fill('新規'));

    // After cleanup no listener survives: a storage event cannot re-render.
    first();
    second();
    seedProgress({
      [slice[0].learnerId]: { status: 'learning', knownStreak: 1 },
    });
    dispatchStorage(
      BASIC_VOCABULARY_PROGRESS_KEY,
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY),
      window.localStorage,
    );
    expect(catalogBadges(root)).toEqual(Array(5).fill('新規'));
  });
});

// ─── A11y / live region / language / responsive containment ──────────────────

describe('a11y, language, and responsive containment (Issue #281)', () => {
  it('each interactive surface keeps exactly one polite live region', async () => {
    const sessionSource = await readFile('src/components/vocabulary/BasicVocabularySession.astro', 'utf8');
    const catalogSource = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');

    expect(sessionSource.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(catalogSource.match(/aria-live="polite"/g)).toHaveLength(1);

    const payload = buildLearnerSessionPayload();
    const root = createSessionRoot([...payload.ids], '10');
    initSession(root);
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    completeSession(root, 10);
    // Completion announces through the same single region (no announcement storm).
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(root.querySelectorAll('.basic-vocabulary-sr-only')).toHaveLength(1);
  });

  it('declares correct lang attributes and omits absent optional fields on both surfaces', async () => {
    const sessionSource = await readFile('src/components/vocabulary/BasicVocabularySession.astro', 'utf8');
    const catalogSource = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');
    const clientCatalog = await readFile('src/client/basicVocabularyCatalog.ts', 'utf8');

    // Study SSR template binds the non-secret card front with the correct lang.
    expect(sessionSource).toContain('lang="zh-Hans"');
    // Catalog SSR + client cards bind simplified/traditional/pinyin/japanese.
    expect(catalogSource).toContain('lang="zh-Hans"');
    expect(catalogSource).toContain('lang="zh-Hant"');
    expect(catalogSource).toContain('lang="zh-Latn"');
    expect(catalogSource).toContain('lang="ja"');
    expect(clientCatalog).toContain("heading.lang = 'zh-Hans'");
    expect(clientCatalog).toContain("lang = 'zh-Hant'");
    expect(clientCatalog).toContain("lang = 'zh-Latn'");
    expect(clientCatalog).toContain("lang = 'ja'");

    // Absent optional fields are omitted, never rendered as empty elements.
    expect(catalogSource).toContain('pageItem.item.traditional !== undefined');
    expect(catalogSource).toContain('pageItem.item.pinyin !== undefined');
    expect(catalogSource).toContain('pageItem.item.japanese !== undefined');
    expect(clientCatalog).toContain('if (item.traditional !== undefined)');
    expect(clientCatalog).toContain('if (item.pinyin !== undefined)');
    expect(clientCatalog).toContain('if (item.japanese !== undefined)');

    // The SSR session template region (before any <script>/<style>) never
    // renders rating controls or answer fields: only reveal and the demoted
    // reset live in the server markup; rating buttons are built client-side
    // after reveal.
    const templateRegion = sessionSource.slice(0, sessionSource.indexOf('<script'));
    expect(templateRegion).not.toContain('data-rating');
    expect(templateRegion).not.toContain('data-action="rate"');
    expect(templateRegion).not.toContain('data-action="continue"');
    expect(templateRegion).not.toContain('data-action="replay"');
    // Recall-first reveal (#356): the SSR opening card never renders the
    // illustration — the image is reveal-only, so it is absent from the server
    // markup and added client-side together with the answer.
    expect(templateRegion).not.toContain('basic-vocabulary-illustration');
    expect(templateRegion).not.toMatch(/<img\b/);
  });

  it('contains responsive containment declarations with no nowrap on long text', async () => {
    const catalogSource = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');
    const sessionSource = await readFile('src/components/vocabulary/BasicVocabularySession.astro', 'utf8');

    const catalogCss = catalogSource.match(/<style is:global>([\s\S]*?)<\/style>/)![1];
    expect(catalogCss).toContain('grid-template-columns: 1fr;');
    expect(catalogCss).toContain('@media (min-width: 640px)');
    expect(catalogCss).toContain('@media (min-width: 960px)');
    expect(catalogCss).toContain('overflow-wrap: anywhere');
    expect(catalogCss).not.toMatch(/white-space:\s*nowrap/);
    expect(catalogCss).toMatch(/\.basic-vocabulary-catalog-illustration img\s*\{[^}]*max-width:\s*100%/);

    const sessionCss = sessionSource.match(/<style is:global>([\s\S]*?)<\/style>/)![1];
    expect(sessionCss).toMatch(
      /\.basic-vocabulary-card\s*\{[^}]*min-height:\s*clamp\(22rem,\s*66vh,\s*39rem\)/,
    );
    expect(sessionCss).not.toMatch(/\.basic-vocabulary-completion\s*\{[^}]*min-height/);
    expect(sessionCss).toMatch(
      /\.basic-vocabulary-action,\s*\.basic-vocabulary-rating\s*\{[^}]*min-height:\s*2\.75rem/,
    );
    expect(sessionCss).toMatch(
      /\.basic-vocabulary-illustration\s*\{[^}]*max-height:\s*min\(42vh,\s*420px\)/,
    );
    expect(sessionCss).toMatch(/@media \(max-width: 359px\)/);
  });
});
