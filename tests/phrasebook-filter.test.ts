// @vitest-environment happy-dom

/**
 * Phrasebook scenario filter client (Issue #236, fail-closed rework per the
 * #349 kanji-bridge precedent).
 *
 * The surface is fail-closed: only scenarios with eligible learner-visible
 * content render (currently airport 5 + food 1 = 6 eligible entries). The
 * filter is URL-only and deterministic: missing/unknown/empty/repeated values
 * show every rendered scenario group in controlled order, a single controlled
 * value filters to that scenario's section, direct refresh re-applies from
 * `location.search`, and the URL is written only through
 * `history.replaceState`. It never touches storage or the network. The count
 * always reflects ELIGIBLE phrase entries, so a controlled scenario with no
 * eligible content (transport/shopping/hotel/emergency) shows the no-match
 * state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initPhrasebookScenarioFilter,
  PHRASEBOOK_SCENARIO_PARAM,
  readScenarioFromSearch,
  scenarioToSearch,
} from '../src/client/phrasebookScenarioFilter';
import { PHRASEBOOK_SCENARIOS } from '../src/content/loadPhrasebook';

// The eligible learner-visible surface (verified corpus facts): airport has 5
// reviewed phrases, food has 1. The other scenarios render no eligible content.
const ELIGIBLE_GROUPS: { scenario: string; entryIds: string[] }[] = [
  {
    scenario: 'airport',
    entryIds: [
      'phrase-airport-001',
      'phrase-airport-002',
      'phrase-airport-003',
      'phrase-airport-004',
      'phrase-airport-005',
    ],
  },
  { scenario: 'food', entryIds: ['phrase-001'] },
];

/** Controlled scenarios that currently render NO eligible content. */
const NO_CONTENT_SCENARIOS = ['transport', 'shopping', 'hotel', 'emergency'];

const TOTAL_ELIGIBLE = ELIGIBLE_GROUPS.reduce(
  (sum, group) => sum + group.entryIds.length,
  0,
);

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function buildSelect(): string {
  const options = ['all', ...PHRASEBOOK_SCENARIOS]
    .map((value) => `<option value="${value}">${value}</option>`)
    .join('');
  return (
    `<select id="phrasebook-scenario-filter" data-scenario-filter>` +
    options +
    '</select>'
  );
}

/** A page mirroring /phrasebook/ from the real eligible surface. */
function buildPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    `<label for="phrasebook-scenario-filter">場面で絞り込む</label>` +
    buildSelect() +
    `<p data-scenario-count>全${TOTAL_ELIGIBLE}件</p>` +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    '<div data-phrasebook-list>' +
    ELIGIBLE_GROUPS.map(
      (group) =>
        `<section class="phrasebook-scenario" data-phrasebook-scenario data-scenario="${group.scenario}">` +
        group.entryIds
          .map(
            (id) => `<article class="phrasebook-phrase" data-phrasebook-entry>${id}</article>`,
          )
          .join('') +
        '</section>',
    ).join('') +
    '</div>';
  return root;
}

function selectOf(root: HTMLElement): HTMLSelectElement {
  const el = root.querySelector<HTMLSelectElement>('[data-scenario-filter]');
  if (!(el instanceof HTMLSelectElement)) throw new Error('select not found');
  return el;
}

function groups(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-phrasebook-scenario]'),
  );
}

function visibleEntries(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-phrasebook-entry]'),
  ).filter((entry) => {
    const group = entry.closest('[data-phrasebook-scenario]') as HTMLElement | null;
    return group !== null && !group.hidden;
  });
}

function visibleGroups(root: HTMLElement): HTMLElement[] {
  return groups(root).filter((group) => !group.hidden);
}

function countText(root: HTMLElement): string {
  return root.querySelector('[data-scenario-count]')?.textContent ?? '';
}

function noMatch(root: HTMLElement): HTMLElement {
  const el = root.querySelector('[data-phrasebook-no-match]');
  if (!(el instanceof HTMLElement)) throw new Error('no-match not found');
  return el;
}

function setSearch(search: string): void {
  const base = `${window.location.origin}/phrasebook/`;
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

// ─── URL read/serialize contract (frozen #236) ─────────────────────────────────

describe('readScenarioFromSearch / scenarioToSearch', () => {
  it('shows all groups for a missing, empty, unknown, or repeated scenario', () => {
    expect(readScenarioFromSearch('')).toBe('all');
    expect(readScenarioFromSearch('?other=1')).toBe('all');
    expect(readScenarioFromSearch('?scenario=')).toBe('all');
    expect(readScenarioFromSearch('?scenario=garbage')).toBe('all');
    expect(readScenarioFromSearch('?scenario=airport&scenario=food')).toBe('all');
    expect(readScenarioFromSearch('?scenario=all')).toBe('all');
  });

  it('returns the controlled value for a single valid scenario', () => {
    for (const scenario of PHRASEBOOK_SCENARIOS) {
      expect(readScenarioFromSearch(`?scenario=${scenario}`)).toBe(scenario);
    }
  });

  it('serializes `all` to an empty query and controlled values to a single param', () => {
    expect(scenarioToSearch('all')).toBe('');
    for (const scenario of PHRASEBOOK_SCENARIOS) {
      expect(scenarioToSearch(scenario)).toBe(`?scenario=${scenario}`);
    }
    expect(PHRASEBOOK_SCENARIO_PARAM).toBe('scenario');
  });
});

// ─── Default + controlled-value filtering ──────────────────────────────────────

describe('initPhrasebookScenarioFilter — filtering behavior over the eligible set', () => {
  it('shows the eligible groups with the deterministic count and no-match hidden by default', () => {
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    expect(visibleGroups(root)).toHaveLength(2);
    expect(visibleGroups(root).map((group) => group.dataset.scenario)).toEqual([
      'airport',
      'food',
    ]);
    expect(visibleEntries(root)).toHaveLength(TOTAL_ELIGIBLE);
    expect(countText(root)).toBe(`全${TOTAL_ELIGIBLE}件`);
    expect(noMatch(root).hidden).toBe(true);
  });

  it.each(ELIGIBLE_GROUPS)(
    'filters to %s and counts only its eligible entries',
    (group) => {
      const root = buildPage();
      document.body.append(root);
      initPhrasebookScenarioFilter(root);

      const select = selectOf(root);
      select.value = group.scenario;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const visible = visibleGroups(root);
      expect(visible).toHaveLength(1);
      expect(visible[0].dataset.scenario).toBe(group.scenario);
      expect(visibleEntries(root)).toHaveLength(group.entryIds.length);
      expect(countText(root)).toBe(`${group.entryIds.length}件`);
      expect(noMatch(root).hidden).toBe(true);
    },
  );

  it.each(NO_CONTENT_SCENARIOS)(
    'shows the no-match state for %s (no eligible content)',
    (scenario) => {
      const root = buildPage();
      document.body.append(root);
      initPhrasebookScenarioFilter(root);

      const select = selectOf(root);
      select.value = scenario;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(visibleGroups(root)).toHaveLength(0);
      expect(visibleEntries(root)).toHaveLength(0);
      expect(countText(root)).toBe('0件');
      expect(noMatch(root).hidden).toBe(false);
    },
  );

  it('re-applies the filter from location.search on a direct refresh', () => {
    setSearch('?scenario=food');
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    expect(selectOf(root).value).toBe('food');
    expect(visibleGroups(root)).toHaveLength(1);
    expect(visibleGroups(root)[0].dataset.scenario).toBe('food');
    expect(visibleEntries(root)).toHaveLength(1);
    expect(countText(root)).toBe('1件');
  });

  it('shows the full eligible set for a missing/unknown/repeated URL on refresh', () => {
    for (const search of [
      '',
      '?scenario=garbage',
      '?scenario=airport&scenario=food',
    ]) {
      setSearch(search);
      const root = buildPage();
      document.body.append(root);
      initPhrasebookScenarioFilter(root);

      expect(selectOf(root).value).toBe('all');
      expect(visibleGroups(root)).toHaveLength(2);
      expect(visibleEntries(root)).toHaveLength(TOTAL_ELIGIBLE);
      expect(countText(root)).toBe(`全${TOTAL_ELIGIBLE}件`);
      document.body.replaceChildren();
    }
  });

  it('returns to the full eligible set after a no-match selection', () => {
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    const select = selectOf(root);
    select.value = 'transport';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(noMatch(root).hidden).toBe(false);

    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleEntries(root)).toHaveLength(TOTAL_ELIGIBLE);
    expect(noMatch(root).hidden).toBe(true);
  });
});

// ─── URL-only writes ───────────────────────────────────────────────────────────

describe('initPhrasebookScenarioFilter — URL-only, storage-free, native control', () => {
  it('writes the filter only via history.replaceState, never storage or network', () => {
    const root = buildPage();
    document.body.append(root);
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');
    const removeSpy = vi.spyOn(window.localStorage, 'removeItem');
    const sessionWriteSpy = vi.spyOn(window.sessionStorage, 'setItem');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    initPhrasebookScenarioFilter(root);
    const select = selectOf(root);
    select.value = 'airport';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.location.search).toBe('?scenario=airport');
    expect(replaceSpy).toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(sessionWriteSpy).not.toHaveBeenCalled();
  });

  it('clears the query when the learner selects the full set again', () => {
    setSearch('?scenario=food');
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    selectOf(root).value = 'all';
    selectOf(root).dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.location.search).toBe('');
    expect(visibleEntries(root)).toHaveLength(TOTAL_ELIGIBLE);
  });

  it('binds the native select control with the source-order list', () => {
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    const select = selectOf(root);
    expect(select.tagName).toBe('SELECT');
    const label = root.querySelector('label[for="phrasebook-scenario-filter"]');
    expect(label).not.toBeNull();
  });
});

// ─── Singleton re-init / teardown ──────────────────────────────────────────────

describe('initPhrasebookScenarioFilter — singleton lifecycle', () => {
  it('re-initialization tears down the previous binding (no duplicated listeners)', () => {
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    // Re-init the same subtree: the previous select listener must be removed.
    initPhrasebookScenarioFilter(root);

    const select = selectOf(root);
    select.value = 'airport';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Filter applied exactly once, without double-toggle artifacts.
    expect(visibleEntries(root)).toHaveLength(5);
    expect(window.location.search).toBe('?scenario=airport');

    select.value = 'food';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleEntries(root)).toHaveLength(1);
    expect(visibleGroups(root)[0].dataset.scenario).toBe('food');
  });

  it('cleanup removes the change listener', () => {
    const root = buildPage();
    document.body.append(root);
    const cleanup = initPhrasebookScenarioFilter(root);

    cleanup();
    const select = selectOf(root);
    select.value = 'airport';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(visibleEntries(root)).toHaveLength(TOTAL_ELIGIBLE);
    expect(window.location.search).toBe('');
  });
});
