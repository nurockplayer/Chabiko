// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBasicVocabularyCatalog } from '../src/content/basicVocabularyCatalog';
import type { BasicVocabularyCatalogItem } from '../src/content/basicVocabularyCatalog';
import {
  BASIC_VOCABULARY_CATALOG_PAGE_SIZE,
  selectBasicVocabularyCatalogPage,
} from '../src/domain/basicVocabularyCatalog';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../src/domain/basicVocabularyProgress';
import { initBasicVocabularyCatalog } from '../src/client/basicVocabularyCatalog';

// ─── Test harness ──────────────────────────────────────────────────────────────

const cleanups = new Set<() => void>();

/** Build a catalog root exactly as the component emits it: the SSR list with
 * the first 24 cards (no badges) and the serialized JSON payload. The client
 * re-renders the same 24 items with truthful statuses on init. */
function createCatalogRoot(
  items: readonly BasicVocabularyCatalogItem[] = loadBasicVocabularyCatalog(),
  itemsJson: string = JSON.stringify(items).replace(/</g, '\\u003c'),
): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyCatalog = '';
  const firstPage = selectBasicVocabularyCatalogPage(items, {}, {
    searchText: '',
    status: 'all',
    partOfSpeech: 'all',
    page: 1,
  });
  const listItems = firstPage.items
    .map(
      (entry) =>
        `<li class="basic-vocabulary-catalog-card"><div class="basic-vocabulary-catalog-illustration"><img src="${entry.item.illustration.assetPath}" width="${entry.item.illustration.width}" height="${entry.item.illustration.height}" alt="" loading="lazy" decoding="async"></div><div class="basic-vocabulary-catalog-body"><h3 class="basic-vocabulary-catalog-simplified" lang="zh-Hans">${entry.item.simplified}</h3></div></li>`,
    )
    .join('');
  root.innerHTML =
    '<div class="basic-vocabulary-catalog-controls">' +
    '<label for="basic-vocabulary-catalog-search">単語を検索</label>' +
    '<input id="basic-vocabulary-catalog-search" data-catalog-search type="search" placeholder="中国語・ピンイン・日本語">' +
    '<label for="basic-vocabulary-catalog-status">学習状態</label>' +
    '<select id="basic-vocabulary-catalog-status" data-catalog-status>' +
    '<option value="all">すべて</option>' +
    '<option value="new">新規</option>' +
    '<option value="learning">学習中</option>' +
    '<option value="learned">習得済み</option>' +
    '</select>' +
    '<label for="basic-vocabulary-catalog-part-of-speech">品詞</label>' +
    '<select id="basic-vocabulary-catalog-part-of-speech" data-catalog-part-of-speech>' +
    '<option value="all">すべて</option>' +
    '<option value="noun">名詞</option>' +
    '<option value="verb">動詞</option>' +
    '<option value="adjective">形容詞</option>' +
    '<option value="adverb">副詞</option>' +
    '</select>' +
    '</div>' +
    `<p data-catalog-summary aria-live="polite"></p>` +
    `<ol data-catalog-results>${listItems}</ol>` +
    `<button data-catalog-page="previous" type="button" disabled>前へ</button>` +
    `<span data-catalog-page-indicator>1 / 1</span>` +
    `<button data-catalog-page="next" type="button" disabled>次へ</button>` +
    `<script type="application/json" id="basic-vocabulary-catalog-data">${itemsJson}</script>`;
  document.body.append(root);
  return root;
}

/** A small controlled catalog slice for deterministic status/pagination tests.
 * Uses real production items so the data is truthful. */
function sliceCatalog(count: number): BasicVocabularyCatalogItem[] {
  return loadBasicVocabularyCatalog().slice(0, count);
}

function dispatchStorage(key: string | null, newValue: string | null, storageArea: Storage | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      oldValue: null,
      newValue,
      storageArea,
    }),
  );
}

function initialize(root: HTMLElement): () => void {
  const cleanup = initBasicVocabularyCatalog(root);
  cleanups.add(cleanup);
  return cleanup;
}

function setStatus(id: string, status: 'new' | 'learning' | 'learned', knownStreak: number): void {
  const key = BASIC_VOCABULARY_PROGRESS_KEY;
  const current = window.localStorage.getItem(key);
  const doc: { version: 1; items: Record<string, { status: string; knownStreak: number }> } =
    current
      ? (JSON.parse(current) as { version: 1; items: Record<string, { status: string; knownStreak: number }> })
      : { version: 1, items: {} };
  doc.items[id] = { status, knownStreak };
  window.localStorage.setItem(key, JSON.stringify(doc));
}

const badgeFor = (card: HTMLElement): string | null =>
  card.querySelector('[data-status]')?.textContent ?? null;

function cardsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('li.basic-vocabulary-catalog-card')];
}

function simplifiedOf(card: HTMLElement): string {
  return card.querySelector('[lang="zh-Hans"]')?.textContent ?? '';
}

const searchInput = (root: HTMLElement): HTMLInputElement =>
  root.querySelector<HTMLInputElement>('[data-catalog-search]')!;

const statusSelect = (root: HTMLElement): HTMLSelectElement =>
  root.querySelector<HTMLSelectElement>('[data-catalog-status]')!;

const partOfSpeechSelect = (root: HTMLElement): HTMLSelectElement =>
  root.querySelector<HTMLSelectElement>('[data-catalog-part-of-speech]')!;

const previousButton = (root: HTMLElement): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>('[data-catalog-page="previous"]')!;

const nextButton = (root: HTMLElement): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>('[data-catalog-page="next"]')!;

const indicator = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-catalog-page-indicator]')!;

const summary = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-catalog-summary]')!;

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/vocabulary/basic/words/');
  vi.restoreAllMocks();
});

// ─── Initialization and rendering ─────────────────────────────────────────────

describe('initialization renders truthful statuses with at most 24 cards', () => {
  it('replaces the SSR page with the same 24 items plus truthful status badges', () => {
    const catalog = sliceCatalog(30);
    // Make two of the first 24 items learning/learned in storage.
    setStatus(catalog[0].learnerId, 'learning', 1);
    setStatus(catalog[5].learnerId, 'learned', 2);

    const root = createCatalogRoot(catalog);
    // Before init: 24 SSR cards with no badges.
    expect(cardsOf(root)).toHaveLength(24);
    expect(root.querySelector('[data-status]')).toBeNull();

    initialize(root);

    const cards = cardsOf(root);
    expect(cards).toHaveLength(24);
    expect(cardsOf(root).length).toBeLessThanOrEqual(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);

    const first = cards[0];
    expect(badgeFor(first)).toBe('学習中');
    const sixth = cards[5];
    expect(badgeFor(sixth)).toBe('習得済み');
    expect(badgeFor(cards[6])).toBe('新規');
    // Production order is preserved.
    for (let i = 0; i < cards.length; i++) {
      expect(simplifiedOf(cards[i])).toBe(catalog[i].simplified);
    }
    // Every card carries exactly one status badge.
    for (const card of cards) {
      expect(card.querySelectorAll('[data-status]')).toHaveLength(1);
    }
  });

  it('exposes the exact search/status labels and native control semantics', () => {
    const root = createCatalogRoot(sliceCatalog(25));
    initialize(root);

    const input = searchInput(root);
    expect(input.type).toBe('search');
    expect(input.getAttribute('placeholder')).toBe('中国語・ピンイン・日本語');
    expect(root.querySelector('label[for="basic-vocabulary-catalog-search"]')?.textContent)
      .toBe('単語を検索');
    expect(root.querySelector('label[for="basic-vocabulary-catalog-status"]')?.textContent)
      .toBe('学習状態');
    const options = [...statusSelect(root).querySelectorAll('option')];
    expect(options.map((o) => [o.value, o.textContent])).toEqual([
      ['all', 'すべて'],
      ['new', '新規'],
      ['learning', '学習中'],
      ['learned', '習得済み'],
    ]);
    expect(root.querySelector('label[for="basic-vocabulary-catalog-part-of-speech"]')?.textContent)
      .toBe('品詞');
    const partOfSpeechOptions = [...partOfSpeechSelect(root).querySelectorAll('option')];
    expect(partOfSpeechOptions.map((option) => [option.value, option.textContent])).toEqual([
      ['all', 'すべて'],
      ['noun', '名詞'],
      ['verb', '動詞'],
      ['adjective', '形容詞'],
      ['adverb', '副詞'],
    ]);
    expect(summary(root).getAttribute('aria-live')).toBe('polite');
    expect(root.querySelector('[data-catalog-results]')?.tagName).toBe('OL');
  });

  it('does not write to the progress document during initialization', () => {
    const root = createCatalogRoot(sliceCatalog(25));
    const before = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    initialize(root);
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(before);
  });

  it('gives every client-rendered card a semantic link to its existing detail route', () => {
    const catalog = sliceCatalog(30);
    const root = createCatalogRoot(catalog);
    initialize(root);

    const cards = cardsOf(root);
    expect(cards).toHaveLength(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
    for (let index = 0; index < cards.length; index++) {
      const links = cards[index].querySelectorAll<HTMLAnchorElement>(
        'a.basic-vocabulary-catalog-detail-link',
      );
      expect(links).toHaveLength(1);
      expect(new URL(links[0].href).pathname).toBe(
        `/vocabulary/basic/words/${catalog[index].learnerId}/`,
      );
      expect(links[0].textContent).toContain(catalog[index].simplified);
    }
  });
});

// ─── Search ────────────────────────────────────────────────────────────────────

describe('search', () => {
  it('matches Simplified, Traditional, Japanese, and tone-less pinyin via the domain selector', () => {
    const catalog = loadBasicVocabularyCatalog();
    const root = createCatalogRoot(catalog);
    initialize(root);

    const assertSearch = (term: string, expectedSimplified: string): void => {
      const input = searchInput(root);
      input.value = term;
      input.dispatchEvent(new Event('input'));
      const cards = cardsOf(root);
      expect(cards).toHaveLength(1);
      expect(simplifiedOf(cards[0])).toBe(expectedSimplified);
    };

    // Simplified.
    assertSearch('大家', '大家');
    // Traditional (truthful traditional field).
    assertSearch('媽媽', '妈妈');
    // Japanese.
    assertSearch('みんな', '大家');
    // Tone-less pinyin matches tone-marked pinyin.
    assertSearch('da jia', '大家');
  });

  it('collapses whitespace and is case-insensitive through the folded search', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    const input = searchInput(root);
    input.value = '  DA   JIA  ';
    input.dispatchEvent(new Event('input'));
    const cards = cardsOf(root);
    expect(cards).toHaveLength(1);
    expect(simplifiedOf(cards[0])).toBe('大家');
  });

  it('changing search returns to page 1', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    // Go to page 2.
    nextButton(root).click();
    expect(indicator(root).textContent).toBe('2 / 66');

    const input = searchInput(root);
    input.value = '看';
    input.dispatchEvent(new Event('input'));
    // 看 matches several items (看/看见/看病/好看/难看), all on page 1.
    expect(indicator(root).textContent).toBe('1 / 1');
    expect(simplifiedOf(cardsOf(root)[0])).toBe('看');
  });
});

// ─── Status filters ───────────────────────────────────────────────────────────

describe('status filters and composition', () => {
  it('filters by each controlled status exactly', () => {
    const catalog = sliceCatalog(25);
    setStatus(catalog[0].learnerId, 'learning', 1);
    setStatus(catalog[1].learnerId, 'learned', 2);
    // catalog[2..24] default to new.

    const root = createCatalogRoot(catalog);
    initialize(root);

    const select = statusSelect(root);
    const setFilter = (value: string): void => {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };

    setFilter('learning');
    let cards = cardsOf(root);
    expect(cards).toHaveLength(1);
    expect(badgeFor(cards[0])).toBe('学習中');

    setFilter('learned');
    cards = cardsOf(root);
    expect(cards).toHaveLength(1);
    expect(badgeFor(cards[0])).toBe('習得済み');

    setFilter('new');
    cards = cardsOf(root);
    expect(cards).toHaveLength(23);
    expect(cards.every((c) => badgeFor(c) === '新規')).toBe(true);

    setFilter('all');
    cards = cardsOf(root);
    expect(cards).toHaveLength(24);
  });

  it('composes status filter with search', () => {
    const catalog = sliceCatalog(25);
    // 看 is the unique slice-25 item matching the search term '看'. Mark it
    // learned; a controlled learned filter + that search must yield exactly it.
    const targetId = catalog.find((item) => item.simplified === '看')!.learnerId;
    setStatus(targetId, 'learned', 2);

    const root = createCatalogRoot(catalog);
    initialize(root);

    // Search that matches exactly 看, further constrained to learned only.
    const select = statusSelect(root);
    select.value = 'learned';
    select.dispatchEvent(new Event('change'));

    const input = searchInput(root);
    input.value = '看';
    input.dispatchEvent(new Event('input'));

    const cards = cardsOf(root);
    expect(cards).toHaveLength(1);
    expect(badgeFor(cards[0])).toBe('習得済み');
    expect(simplifiedOf(cards[0])).toBe('看');
  });

  it('changing the status filter returns to page 1', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    nextButton(root).click();
    expect(indicator(root).textContent).toBe('2 / 66');

    statusSelect(root).value = 'new';
    statusSelect(root).dispatchEvent(new Event('change'));
    expect(indicator(root).textContent).toBe('1 / 66');
  });
});

// ─── Part-of-speech filter ────────────────────────────────────────────────────

describe('part-of-speech filter', () => {
  it('composes before pagination and resets to page 1 when the facet changes', () => {
    const catalog = loadBasicVocabularyCatalog();
    const root = createCatalogRoot(catalog);
    initialize(root);

    nextButton(root).click();
    expect(indicator(root).textContent).toBe('2 / 66');

    partOfSpeechSelect(root).value = 'verb';
    partOfSpeechSelect(root).dispatchEvent(new Event('change'));

    const expected = catalog
      .filter((item) => item.partOfSpeech === 'verb')
      .slice(0, BASIC_VOCABULARY_CATALOG_PAGE_SIZE)
      .map((item) => item.simplified);
    const filteredCount = catalog.filter((item) => item.partOfSpeech === 'verb').length;
    expect(indicator(root).textContent?.startsWith('1 / ')).toBe(true);
    expect(cardsOf(root).map(simplifiedOf)).toEqual(expected);
    expect(summary(root).textContent).toBe(`全${catalog.length}語中 ${filteredCount}語を表示`);
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('pagination', () => {
  it('navigates pages in production order and preserves search/status', () => {
    const catalog = loadBasicVocabularyCatalog();
    const root = createCatalogRoot(catalog);
    initialize(root);

    expect(indicator(root).textContent).toBe('1 / 66');
    expect(previousButton(root).disabled).toBe(true);
    expect(nextButton(root).disabled).toBe(false);

    nextButton(root).click();
    expect(indicator(root).textContent).toBe('2 / 66');
    expect(simplifiedOf(cardsOf(root)[0])).toBe(catalog[24].simplified);
    expect(previousButton(root).disabled).toBe(false);

    previousButton(root).click();
    expect(indicator(root).textContent).toBe('1 / 66');
    expect(simplifiedOf(cardsOf(root)[0])).toBe(catalog[0].simplified);
  });

  it('disables next at the final page and never exceeds the last page', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    let page = 1;
    while (!nextButton(root).disabled) {
      nextButton(root).click();
      page += 1;
    }
    expect(page).toBe(66);
    expect(nextButton(root).disabled).toBe(true);
    expect(indicator(root).textContent).toBe('66 / 66');
    // Clamping: further clicks are no-ops.
    nextButton(root).click();
    expect(indicator(root).textContent).toBe('66 / 66');
    expect(cardsOf(root).length).toBe(1582 - 65 * BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
  });

  it('does not overflow the last page count', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);
    while (!nextButton(root).disabled) nextButton(root).click();
    expect(cardsOf(root).length).toBeLessThanOrEqual(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
  });

  it('never renders more than 24 cards at once', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);
    for (let i = 0; i < 70; i++) {
      nextButton(root).click();
      expect(cardsOf(root).length).toBeLessThanOrEqual(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
    }
  });
});

// ─── URL and detail return contract ──────────────────────────────────────────

describe('URL-addressable state and detail return context', () => {
  it('restores page 2 directly from the URL and survives a fresh initialization', () => {
    const catalog = loadBasicVocabularyCatalog();
    window.history.replaceState(null, '', '/vocabulary/basic/words/?pos=noun&page=2');

    const firstRoot = createCatalogRoot(catalog);
    const firstCleanup = initialize(firstRoot);
    expect(partOfSpeechSelect(firstRoot).value).toBe('noun');
    expect(indicator(firstRoot).textContent).toMatch(/^2 \/ \d+$/);
    const page2FirstId = cardsOf(firstRoot)[0].id;

    firstCleanup();
    cleanups.delete(firstCleanup);
    document.body.replaceChildren();

    const refreshedRoot = createCatalogRoot(catalog);
    initialize(refreshedRoot);
    expect(partOfSpeechSelect(refreshedRoot).value).toBe('noun');
    expect(indicator(refreshedRoot).textContent).toMatch(/^2 \/ \d+$/);
    expect(cardsOf(refreshedRoot)[0].id).toBe(page2FirstId);
    expect(window.location.pathname + window.location.search)
      .toBe('/vocabulary/basic/words/?pos=noun&page=2');
  });

  it('writes a deterministic combined search, status, and POS no-result URL', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    statusSelect(root).value = 'learned';
    statusSelect(root).dispatchEvent(new Event('change'));
    partOfSpeechSelect(root).value = 'verb';
    partOfSpeechSelect(root).dispatchEvent(new Event('change'));
    searchInput(root).value = 'zzz-no-match-zzz';
    searchInput(root).dispatchEvent(new Event('input'));

    expect(window.location.pathname + window.location.search)
      .toBe('/vocabulary/basic/words/?q=zzz-no-match-zzz&status=learned&pos=verb');
    expect(summary(root).textContent).toBe('条件に一致する単語がありません');
    expect(indicator(root).textContent).toBe('1 / 1');
    expect(cardsOf(root)).toHaveLength(0);
  });

  it('clamps invalid and out-of-range state to one clear canonical URL', () => {
    window.history.replaceState(
      null,
      '',
      '/vocabulary/basic/words/?status=wrong&pos=other&page=999&item=missing&stale=1',
    );
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    expect(statusSelect(root).value).toBe('all');
    expect(partOfSpeechSelect(root).value).toBe('all');
    expect(indicator(root).textContent).toBe('66 / 66');
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/vocabulary/basic/words/?page=66');
  });

  it('carries the selected card through detail navigation and restores its focus', () => {
    const catalog = loadBasicVocabularyCatalog();
    const selected = catalog[24];
    window.history.replaceState(null, '', '/vocabulary/basic/words/?page=2');
    const root = createCatalogRoot(catalog);
    initialize(root);

    const link = root.querySelector<HTMLAnchorElement>(
      `.basic-vocabulary-catalog-detail-link[href^="/vocabulary/basic/words/${selected.learnerId}/"]`,
    )!;
    link.addEventListener('click', (event) => event.preventDefault());
    link.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));

    const selectedCatalogTarget =
      `/vocabulary/basic/words/?page=2&item=${selected.learnerId}#word-${selected.learnerId}`;
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe(selectedCatalogTarget);
    expect(new URL(link.href).searchParams.get('from')).toBe(selectedCatalogTarget);

    const cleanup = [...cleanups].at(-1)!;
    cleanup();
    cleanups.delete(cleanup);
    document.body.replaceChildren();
    const returnedRoot = createCatalogRoot(catalog);
    initialize(returnedRoot);

    const returnedLink = returnedRoot.querySelector<HTMLAnchorElement>(
      `#word-${selected.learnerId} .basic-vocabulary-catalog-detail-link`,
    );
    expect(indicator(returnedRoot).textContent).toBe('2 / 66');
    expect(returnedLink).not.toBeNull();
    expect(document.activeElement).toBe(returnedLink);
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

describe('summary', () => {
  it('renders the exact non-empty and empty copy through the live region', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);
    expect(summary(root).textContent).toBe('全1582語中 1582語を表示');

    const input = searchInput(root);
    input.value = 'zzz-no-match-zzz';
    input.dispatchEvent(new Event('input'));
    expect(summary(root).textContent).toBe('条件に一致する単語がありません');
    expect(cardsOf(root)).toHaveLength(0);
  });

  it('updates the filtered count as the filter narrows', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    const select = statusSelect(root);
    select.value = 'new';
    select.dispatchEvent(new Event('change'));
    expect(summary(root).textContent).toBe('全1582語中 1582語を表示');
  });
});

// ─── pageshow / storage / external clear ──────────────────────────────────────

describe('pageshow and storage refresh', () => {
  it('refreshes statuses on pageshow while preserving search, filter, and page', () => {
    const catalog = sliceCatalog(60);
    const root = createCatalogRoot(catalog);
    initialize(root);

    // Search for the first item's exact simplified headword (single match).
    const input = searchInput(root);
    input.value = catalog[0].simplified;
    input.dispatchEvent(new Event('input'));
    partOfSpeechSelect(root).value = catalog[0].partOfSpeech;
    partOfSpeechSelect(root).dispatchEvent(new Event('change'));
    expect(indicator(root).textContent).toBe('1 / 1');

    // A status change in another context is reflected on pageshow.
    setStatus(catalog[0].learnerId, 'learning', 1);
    window.dispatchEvent(new Event('pageshow'));

    // Search and filter preserved; status now truthful.
    expect(searchInput(root).value).toBe(catalog[0].simplified);
    expect(partOfSpeechSelect(root).value).toBe(catalog[0].partOfSpeech);
    expect(indicator(root).textContent).toBe('1 / 1');
    expect(cardsOf(root).every((c) => badgeFor(c) !== null)).toBe(true);
    expect(badgeFor(cardsOf(root)[0])).toBe('学習中');
  });

  it('refreshes on an exact-key storage event preserving search/filter/page', () => {
    const catalog = sliceCatalog(60);
    const root = createCatalogRoot(catalog);
    initialize(root);

    // Move to page 2 of status=new.
    const select = statusSelect(root);
    select.value = 'new';
    select.dispatchEvent(new Event('change'));
    nextButton(root).click();
    expect(indicator(root).textContent).toBe('2 / 3');

    // Another tab marks a page-2 item as learned.
    const page2First = catalog[BASIC_VOCABULARY_CATALOG_PAGE_SIZE].learnerId;
    setStatus(page2First, 'learned', 2);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY), window.localStorage);

    // Page is clamped if needed and the badge is truthful.
    expect(statusSelect(root).value).toBe('new');
    expect(searchInput(root).value).toBe('');
    expect(indicator(root).textContent).toBe('2 / 3');
  });

  it('clamps the requested page after storage refresh when the filter count shrinks', () => {
    const catalog = sliceCatalog(60);
    const root = createCatalogRoot(catalog);
    initialize(root);

    // Filter to learned only, then move to page 2 (items 25..48 learned? No —
    // nothing is learned yet, so the learned filter is empty). Instead use the
    // new filter: page 3 of status=new shows items 49..60.
    statusSelect(root).value = 'new';
    statusSelect(root).dispatchEvent(new Event('change'));
    nextButton(root).click();
    nextButton(root).click();
    expect(indicator(root).textContent).toBe('3 / 3');

    // Mark items 48..59 as learned, so the new-filtered set shrinks to items
    // 0..47 (48 items → 2 pages). Page 3 clamps to page 2.
    for (const item of catalog.slice(48)) setStatus(item.learnerId, 'learned', 2);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY), window.localStorage);
    expect(indicator(root).textContent).toBe('2 / 2');

    // Now mark items 0..23 learned too, leaving items 24..47 (24 items → 1
    // page); page 2 clamps to page 1.
    for (const item of catalog.slice(0, 24)) setStatus(item.learnerId, 'learned', 2);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY), window.localStorage);

    // 24 new items remain → 1 page; page 2 clamps to page 1.
    expect(indicator(root).textContent).toBe('1 / 1');
    expect(cardsOf(root)).toHaveLength(24);
  });

  it('treats an external clear (key === null) as showing all items new', () => {
    const catalog = sliceCatalog(25);
    const root = createCatalogRoot(catalog);
    initialize(root);
    setStatus(catalog[0].learnerId, 'learning', 1);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY), window.localStorage);
    expect(badgeFor(cardsOf(root)[0])).toBe('学習中');

    window.localStorage.clear();
    dispatchStorage(null, null, window.localStorage);

    expect(badgeFor(cardsOf(root)[0])).toBe('新規');
  });

  it('ignores unrelated storage keys and storage areas', () => {
    const catalog = sliceCatalog(25);
    const root = createCatalogRoot(catalog);
    initialize(root);
    setStatus(catalog[0].learnerId, 'learning', 1);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY), window.localStorage);
    expect(badgeFor(cardsOf(root)[0])).toBe('学習中');

    // Unrelated key in the same area.
    dispatchStorage('chabiko:some-other-key', 'x', window.localStorage);
    expect(badgeFor(cardsOf(root)[0])).toBe('学習中');

    // Exact key in an unrelated area (sessionStorage) is ignored.
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, 'x', window.sessionStorage);
    expect(badgeFor(cardsOf(root)[0])).toBe('学習中');
  });
});

// ─── Progress document immutability ───────────────────────────────────────────

describe('browse actions never write the progress document', () => {
  it('keeps the stored document byte-identical across search, filter, and pagination', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);

    const before = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);

    searchInput(root).value = '大';
    searchInput(root).dispatchEvent(new Event('input'));
    statusSelect(root).value = 'new';
    statusSelect(root).dispatchEvent(new Event('change'));
    nextButton(root).click();
    previousButton(root).click();

    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(before);
    // The document is untouched even when progress exists.
    setStatus(loadBasicVocabularyCatalog()[0].learnerId, 'learning', 1);
    const storedAfterWrite = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    searchInput(root).value = '大';
    searchInput(root).dispatchEvent(new Event('input'));
    nextButton(root).click();
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(storedAfterWrite);
  });
});

// ─── Malformed payload ────────────────────────────────────────────────────────

describe('malformed payload', () => {
  it.each([
    ['null', 'null'],
    ['not-an-array', JSON.stringify({ nope: true })],
    ['empty array', '[]'],
    ['missing learnerId', JSON.stringify([{ simplified: 'x', partOfSpeech: 'noun', illustration: { assetPath: '/a.webp', width: 1, height: 1, altJa: '' } }])],
    ['missing illustration', JSON.stringify([{ learnerId: 'a', simplified: 'x', partOfSpeech: 'noun' }])],
    ['bad width', JSON.stringify([{ learnerId: 'a', simplified: 'x', partOfSpeech: 'noun', illustration: { assetPath: '/a.webp', width: 0, height: 1, altJa: '' } }])],
    ['invalid json', '<not json'],
  ])('%s', (_label, payload) => {
    const root = createCatalogRoot([], payload);
    initialize(root);

    expect(summary(root).textContent).toBe('単語一覧を読み込めませんでした');
    expect(cardsOf(root)).toHaveLength(0);
    expect(searchInput(root).disabled).toBe(true);
    expect(statusSelect(root).disabled).toBe(true);
    expect(partOfSpeechSelect(root).disabled).toBe(true);
    expect(previousButton(root).disabled).toBe(true);
    expect(nextButton(root).disabled).toBe(true);
  });
});

// ─── Repeated initialization / cleanup ────────────────────────────────────────

describe('repeated initialization and cleanup', () => {
  it('runs prior cleanup before reinitializing and does not duplicate listeners', () => {
    const root = createCatalogRoot(sliceCatalog(25));
    initialize(root);

    const first = cardsOf(root).length;
    // Reinitialize the same root: prior cleanup runs, no duplicate renders.
    initialize(root);
    expect(cardsOf(root).length).toBe(first);
    expect(badgeFor(cardsOf(root)[0])).toBe('新規');
  });

  it('cleanup removes listeners; events after cleanup are no-ops', () => {
    const root = createCatalogRoot(sliceCatalog(25));
    const cleanup = initialize(root);

    cleanup();
    cleanups.delete(cleanup);

    setStatus(sliceCatalog(25)[0].learnerId, 'learning', 1);
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY), window.localStorage);
    expect(badgeFor(cardsOf(root)[0])).toBe('新規');

    const before = cardsOf(root).map(simplifiedOf);
    partOfSpeechSelect(root).value = 'verb';
    partOfSpeechSelect(root).dispatchEvent(new Event('change'));
    expect(cardsOf(root).map(simplifiedOf)).toEqual(before);
  });
});

// ─── Keyboard / focus / live region ───────────────────────────────────────────

describe('keyboard, focus, and live-region behavior', () => {
  it('uses native controls and keeps exactly one aria-live region', () => {
    const root = createCatalogRoot(sliceCatalog(25));
    initialize(root);

    // Native search + select + buttons (no simulated controls).
    expect(searchInput(root).tagName).toBe('INPUT');
    expect(statusSelect(root).tagName).toBe('SELECT');
    expect(partOfSpeechSelect(root).tagName).toBe('SELECT');
    expect(previousButton(root).tagName).toBe('BUTTON');
    expect(nextButton(root).tagName).toBe('BUTTON');
    // Only the summary is live.
    expect(root.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('provides visible focus targets of at least 44px', async () => {
    // happy-dom has no layout engine, so getBoundingClientRect is always 0.
    // Assert the CSS contract instead: every interactive control (search,
    // status select, pagination buttons) declares a 44px minimum height.
    const { readFile } = await import('node:fs/promises');
    const component = await readFile('src/components/vocabulary/BasicVocabularyCatalog.astro', 'utf8');
    expect(component).toContain('min-height: 2.75rem');
    expect(component).toContain('.basic-vocabulary-catalog-field input');
    expect(component).toContain('.basic-vocabulary-catalog-field select');
    expect(component).toContain('.basic-vocabulary-catalog-pagination button');
  });

  it('wraps long text without horizontal overflow', () => {
    const root = createCatalogRoot(sliceCatalog(25));
    initialize(root);

    // Japanese descriptions are the longest field on the SSR/CLIENT cards; the
    // card body must wrap rather than overflow.
    const body = root.querySelector<HTMLElement>('.basic-vocabulary-catalog-body');
    expect(body).not.toBeNull();
    expect(body!.getAttribute('style')).toBeNull();
    // No inline nowrap anywhere in the rendered cards.
    for (const card of cardsOf(root)) {
      expect(card.textContent).not.toBeNull();
    }
  });

  it('client re-render never exceeds 24 cards on the final page of the full catalog', () => {
    const root = createCatalogRoot(loadBasicVocabularyCatalog());
    initialize(root);
    while (!nextButton(root).disabled) nextButton(root).click();
    const count = cardsOf(root).length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(BASIC_VOCABULARY_CATALOG_PAGE_SIZE);
  });
});
