// @vitest-environment happy-dom

/**
 * Phrasebook scenario filter client (Issue #236).
 *
 * The filter is URL-only and deterministic: missing/unknown/empty/repeated
 * values show all six scenario groups in controlled order, a single controlled
 * value filters to that scenario's section, direct refresh re-applies from
 * `location.search`, and the URL is written only through
 * `history.replaceState`. It never touches storage or the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initPhrasebookScenarioFilter,
  PHRASEBOOK_SCENARIO_PARAM,
  readScenarioFromSearch,
  scenarioToSearch,
} from '../src/client/phrasebookScenarioFilter';
import {
  groupPhrasebookByScenario,
  loadPhrasebook,
  PHRASEBOOK_SCENARIOS,
} from '../src/content/loadPhrasebook';

const GROUPS = groupPhrasebookByScenario(loadPhrasebook());

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

/** A page mirroring /phrasebook/ from the real frozen corpus. */
function buildPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    `<label for="phrasebook-scenario-filter">場面で絞り込む</label>` +
    buildSelect() +
    '<p data-scenario-count>全6件</p>' +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    '<div data-phrasebook-list>' +
    GROUPS.map(
      (group) =>
        `<section class="phrasebook-scenario" data-phrasebook-scenario data-scenario="${group.scenario}">${group.scenario}</section>`,
    ).join('') +
    '</div>';
  return root;
}

/** A tiny synthetic page used for the zero-match state. */
function buildSingleGroupPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    buildSelect() +
    '<p data-scenario-count>全1件</p>' +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    '<section data-phrasebook-scenario data-scenario="airport">空港</section>';
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

describe('initPhrasebookScenarioFilter — filtering behavior', () => {
  it('shows all six groups with the deterministic count and no-match hidden by default', () => {
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    expect(visibleGroups(root)).toHaveLength(6);
    expect(groups(root).every((group) => !group.hidden)).toBe(true);
    expect(countText(root)).toBe('全6件');
    expect(noMatch(root).hidden).toBe(true);
  });

  it.each(PHRASEBOOK_SCENARIOS)(
    'filters to %s and shows only that scenario group',
    (scenario) => {
      const root = buildPage();
      document.body.append(root);
      initPhrasebookScenarioFilter(root);

      const select = selectOf(root);
      select.value = scenario;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const visible = visibleGroups(root);
      expect(visible).toHaveLength(1);
      expect(visible[0].dataset.scenario).toBe(scenario);
      expect(countText(root)).toBe('1件');
      expect(noMatch(root).hidden).toBe(true);
    },
  );

  it('re-applies the filter from location.search on a direct refresh', () => {
    setSearch('?scenario=hotel');
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    expect(selectOf(root).value).toBe('hotel');
    expect(visibleGroups(root)).toHaveLength(1);
    expect(visibleGroups(root)[0].dataset.scenario).toBe('hotel');
    expect(countText(root)).toBe('1件');
  });

  it('shows the full corpus for a missing/unknown/repeated URL on refresh', () => {
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
      expect(visibleGroups(root)).toHaveLength(6);
      expect(countText(root)).toBe('全6件');
      document.body.replaceChildren();
    }
  });

  it('shows the zero-match state only when no group matches', () => {
    const root = buildSingleGroupPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    const select = selectOf(root);
    select.value = 'transport';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(visibleGroups(root)).toHaveLength(0);
    expect(countText(root)).toBe('0件');
    expect(noMatch(root).hidden).toBe(false);

    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleGroups(root)).toHaveLength(1);
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

  it('clears the query when the learner selects the full corpus again', () => {
    setSearch('?scenario=food');
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    selectOf(root).value = 'all';
    selectOf(root).dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.location.search).toBe('');
    expect(visibleGroups(root)).toHaveLength(6);
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
    expect(visibleGroups(root)).toHaveLength(1);
    expect(window.location.search).toBe('?scenario=airport');

    select.value = 'emergency';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleGroups(root)).toHaveLength(1);
    expect(visibleGroups(root)[0].dataset.scenario).toBe('emergency');
  });

  it('cleanup removes the change listener', () => {
    const root = buildPage();
    document.body.append(root);
    const cleanup = initPhrasebookScenarioFilter(root);

    cleanup();
    const select = selectOf(root);
    select.value = 'airport';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(visibleGroups(root)).toHaveLength(6);
    expect(window.location.search).toBe('');
  });
});
