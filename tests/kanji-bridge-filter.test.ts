// @vitest-environment happy-dom

/**
 * Kanji-bridge relation filter client (Issue #235 / frozen #238 contract).
 *
 * The filter is URL-only and deterministic: missing/unknown/empty/repeated
 * values show the full 50-entry corpus in source order, a single controlled
 * value filters without reordering, direct refresh re-applies from
 * `location.search`, and the URL is written only through
 * `history.replaceState`. It never touches storage or the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initKanjiBridgeFilter,
  KANJI_BRIDGE_RELATION_PARAM,
  readRelationFromSearch,
  relationToSearch,
} from '../src/client/kanjiBridgeFilter';
import { loadKanjiBridge } from '../src/content/loadKanjiBridge';

const ENTRIES = loadKanjiBridge();

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function buildSelect(): string {
  return (
    '<select id="kanji-bridge-relation-filter" data-relation-filter>' +
    '<option value="all">すべて</option>' +
    '<option value="same-meaning">同じ意味</option>' +
    '<option value="partial-overlap">一部が重なる</option>' +
    '<option value="false-friend">見せかけの同義語</option>' +
    '</select>'
  );
}

/** A page mirroring /vocabulary/kanji-bridge/ from the real frozen corpus. */
function buildPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    `<label for="kanji-bridge-relation-filter">関係で絞り込む</label>` +
    buildSelect() +
    '<p data-relation-count>全50件</p>' +
    '<p data-kanji-bridge-no-match hidden>該当する単語がありません。</p>' +
    '<ol data-kanji-bridge-list>' +
    ENTRIES.map(
      (entry) =>
        `<li class="kanji-bridge-entry" data-kanji-bridge-entry data-relation="${entry.similarityType}">${entry.traditional}</li>`,
    ).join('') +
    '</ol>';
  return root;
}

/** A tiny synthetic page used for the zero-match state. */
function buildSingleCardPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    buildSelect() +
    '<p data-relation-count>全1件</p>' +
    '<p data-kanji-bridge-no-match hidden>該当する単語がありません。</p>' +
    '<ol>' +
    '<li class="kanji-bridge-entry" data-kanji-bridge-entry data-relation="same-meaning">テスト</li>' +
    '</ol>';
  return root;
}

function selectOf(root: HTMLElement): HTMLSelectElement {
  const el = root.querySelector<HTMLSelectElement>('[data-relation-filter]');
  if (!(el instanceof HTMLSelectElement)) throw new Error('select not found');
  return el;
}

function cards(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-kanji-bridge-entry]'));
}

function visibleCards(root: HTMLElement): HTMLElement[] {
  return cards(root).filter((card) => !card.hidden);
}

function countText(root: HTMLElement): string {
  return root.querySelector('[data-relation-count]')?.textContent ?? '';
}

function noMatch(root: HTMLElement): HTMLElement {
  const el = root.querySelector('[data-kanji-bridge-no-match]');
  if (!(el instanceof HTMLElement)) throw new Error('no-match not found');
  return el;
}

function setSearch(search: string): void {
  const base = `${window.location.origin}/vocabulary/kanji-bridge/`;
  window.history.replaceState(null, '', `${base}${search}`);
}

function resetSearch(): void {
  window.history.replaceState(null, '', `${window.location.origin}/`);
}

beforeEach(() => {
  resetSearch();
  document.body.replaceChildren();
});

afterEach(() => {
  document.body.replaceChildren();
  resetSearch();
});

// ─── URL read/serialize contract (frozen #238) ─────────────────────────────────

describe('readRelationFromSearch / relationToSearch', () => {
  it('shows the full corpus for a missing, empty, unknown, or repeated relation', () => {
    expect(readRelationFromSearch('')).toBe('all');
    expect(readRelationFromSearch('?other=1')).toBe('all');
    expect(readRelationFromSearch('?relation=')).toBe('all');
    expect(readRelationFromSearch('?relation=garbage')).toBe('all');
    expect(readRelationFromSearch('?relation=same-meaning&relation=partial-overlap')).toBe('all');
    expect(readRelationFromSearch('?relation=all')).toBe('all');
  });

  it('returns the controlled value for a single valid relation', () => {
    expect(readRelationFromSearch('?relation=same-meaning')).toBe('same-meaning');
    expect(readRelationFromSearch('?relation=partial-overlap')).toBe('partial-overlap');
    expect(readRelationFromSearch('?relation=false-friend')).toBe('false-friend');
  });

  it('serializes `all` to an empty query and controlled values to a single param', () => {
    expect(relationToSearch('all')).toBe('');
    expect(relationToSearch('same-meaning')).toBe('?relation=same-meaning');
    expect(relationToSearch('partial-overlap')).toBe('?relation=partial-overlap');
    expect(relationToSearch('false-friend')).toBe('?relation=false-friend');
    expect(KANJI_BRIDGE_RELATION_PARAM).toBe('relation');
  });
});

// ─── Default + controlled-value filtering ──────────────────────────────────────

describe('initKanjiBridgeFilter — filtering behavior', () => {
  it('shows all 50 entries with the deterministic count and no-match hidden by default', () => {
    const root = buildPage();
    document.body.append(root);
    initKanjiBridgeFilter(root);

    expect(visibleCards(root)).toHaveLength(50);
    expect(cards(root).every((card) => !card.hidden)).toBe(true);
    expect(countText(root)).toBe('全50件');
    expect(noMatch(root).hidden).toBe(true);
  });

  it.each([
    ['same-meaning', 20],
    ['partial-overlap', 15],
    ['false-friend', 15],
  ] as const)(
    'filters to %s and shows %d entries in source order without reordering',
    (relation, expectedCount) => {
      const root = buildPage();
      document.body.append(root);
      initKanjiBridgeFilter(root);

      const select = selectOf(root);
      select.value = relation;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const visible = visibleCards(root);
      expect(visible).toHaveLength(expectedCount);
      expect(visible.every((card) => card.dataset.relation === relation)).toBe(true);
      // Source order is preserved: visible order matches the corpus order.
      const visibleHeadwords = visible.map((card) => card.textContent ?? '');
      const expectedHeadwords = ENTRIES.filter(
        (entry) => entry.similarityType === relation,
      ).map((entry) => entry.traditional);
      expect(visibleHeadwords).toEqual(expectedHeadwords);
      expect(countText(root)).toBe(`${expectedCount}件`);
      // The no-match message stays hidden while matches exist.
      expect(noMatch(root).hidden).toBe(true);
    },
  );

  it('re-applies the filter from location.search on a direct refresh', () => {
    setSearch('?relation=false-friend');
    const root = buildPage();
    document.body.append(root);
    initKanjiBridgeFilter(root);

    expect(selectOf(root).value).toBe('false-friend');
    expect(visibleCards(root)).toHaveLength(15);
    expect(countText(root)).toBe('15件');
  });

  it('shows the full corpus for a missing/unknown/repeated URL on refresh', () => {
    for (const search of ['', '?relation=garbage', '?relation=same-meaning&relation=false-friend']) {
      setSearch(search);
      const root = buildPage();
      document.body.append(root);
      initKanjiBridgeFilter(root);

      expect(selectOf(root).value).toBe('all');
      expect(visibleCards(root)).toHaveLength(50);
      expect(countText(root)).toBe('全50件');
      document.body.replaceChildren();
    }
  });

  it('shows the zero-match state only when no card matches', () => {
    const root = buildSingleCardPage();
    document.body.append(root);
    initKanjiBridgeFilter(root);

    const select = selectOf(root);
    select.value = 'false-friend';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(visibleCards(root)).toHaveLength(0);
    expect(countText(root)).toBe('0件');
    expect(noMatch(root).hidden).toBe(false);

    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleCards(root)).toHaveLength(1);
    expect(noMatch(root).hidden).toBe(true);
  });
});

// ─── URL-only writes ───────────────────────────────────────────────────────────

describe('initKanjiBridgeFilter — URL-only, storage-free, native control', () => {
  it('writes the filter only via history.replaceState, never storage or network', () => {
    const root = buildPage();
    document.body.append(root);
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');
    const removeSpy = vi.spyOn(window.localStorage, 'removeItem');
    const sessionWriteSpy = vi.spyOn(window.sessionStorage, 'setItem');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    initKanjiBridgeFilter(root);
    const select = selectOf(root);
    select.value = 'same-meaning';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.location.search).toBe('?relation=same-meaning');
    expect(replaceSpy).toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(sessionWriteSpy).not.toHaveBeenCalled();
  });

  it('clears the query when the learner selects the full corpus again', () => {
    setSearch('?relation=partial-overlap');
    const root = buildPage();
    document.body.append(root);
    initKanjiBridgeFilter(root);

    selectOf(root).value = 'all';
    selectOf(root).dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.location.search).toBe('');
    expect(visibleCards(root)).toHaveLength(50);
  });

  it('binds the native select control with the source-order list', () => {
    const root = buildPage();
    document.body.append(root);
    initKanjiBridgeFilter(root);

    const select = selectOf(root);
    expect(select.tagName).toBe('SELECT');
    // Native label association is present in the markup.
    const label = root.querySelector('label[for="kanji-bridge-relation-filter"]');
    expect(label).not.toBeNull();
  });
});

// ─── Singleton re-init / teardown ──────────────────────────────────────────────

describe('initKanjiBridgeFilter — singleton lifecycle', () => {
  it('re-initialization tears down the previous binding (no duplicated listeners)', () => {
    const root = buildPage();
    document.body.append(root);
    initKanjiBridgeFilter(root);

    // Re-init the same subtree: the previous select listener must be removed.
    initKanjiBridgeFilter(root);

    // Both inits read the current URL; a later change must fire only once.
    const select = selectOf(root);
    select.value = 'same-meaning';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Filter applied exactly once, without double-toggle artifacts.
    expect(visibleCards(root)).toHaveLength(20);
    expect(window.location.search).toBe('?relation=same-meaning');

    // A second change on the live binding still works (listener still attached).
    select.value = 'false-friend';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleCards(root)).toHaveLength(15);
  });

  it('cleanup removes the change listener', () => {
    const root = buildPage();
    document.body.append(root);
    const cleanup = initKanjiBridgeFilter(root);

    cleanup();
    const select = selectOf(root);
    select.value = 'same-meaning';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(visibleCards(root)).toHaveLength(50);
    expect(window.location.search).toBe('');
  });
});
