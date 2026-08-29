// @vitest-environment happy-dom

/**
 * Phrasebook scenario filter client (Issue #236, fail-closed rework per the
 * #349 kanji-bridge precedent).
 *
 * The #440 prelaunch surface is fail-closed: its exact 30 canonical phrases
 * and 6 dialogs render across all six scenarios. The filter is URL-only and
 * deterministic: missing/unknown/empty/repeated values show every rendered
 * scenario group in controlled order, a single controlled value filters to
 * that scenario's section, direct refresh re-applies from `location.search`,
 * and the URL is written only through `history.replaceState`. It never touches
 * storage or the network. The count reflects phrase entries only; dialogs and
 * their references must not affect counts or hidden-state behavior. A sparse
 * fail-closed projection still surfaces no-match for a missing scenario.
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
  loadPrelaunchPhrasebook,
  PHRASEBOOK_SCENARIOS,
} from '../src/content/loadPhrasebook';

// Derive the harness fixture from the exact #440 prelaunch projection so the
// filter contract cannot silently drift from canonical source order/content.
const CANONICAL_GROUPS = groupPhrasebookByScenario(loadPrelaunchPhrasebook()).map(
  (group) => ({
    scenario: group.scenario,
    entryIds: group.phrases.map((phrase) => phrase.id),
    dialogId: group.dialog?.id ?? null,
    turnCount: group.dialog?.turns.length ?? 0,
    referenceIds: group.dialog?.relatedPhraseIds ?? [],
  }),
);

const TOTAL_CANONICAL = CANONICAL_GROUPS.reduce(
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

/** A page mirroring /phrasebook/ from the exact prelaunch surface. */
function buildPage(
  renderedGroups = CANONICAL_GROUPS,
): HTMLElement {
  const root = document.createElement('section');
  const renderedEntryCount = renderedGroups.reduce(
    (sum, group) => sum + group.entryIds.length,
    0,
  );
  root.innerHTML =
    `<label for="phrasebook-scenario-filter">場面で絞り込む</label>` +
    buildSelect() +
    `<p data-scenario-count>全${renderedEntryCount}件</p>` +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    '<div data-phrasebook-list>' +
    renderedGroups.map(
      (group) =>
        `<section class="phrasebook-scenario" data-phrasebook-scenario data-scenario="${group.scenario}">` +
        group.entryIds
          .map(
            (id) => `<article class="phrasebook-phrase" data-phrasebook-entry>${id}</article>`,
          )
          .join('') +
        (group.dialogId === null
          ? ''
          : `<div data-phrasebook-dialog><ol>` +
            Array.from(
              { length: group.turnCount },
              (_, index) =>
                `<li data-phrasebook-dialog-turn>${group.dialogId}-turn-${index + 1}</li>`,
            ).join('') +
            `</ol><p class="phrasebook-dialog__references">` +
            group.referenceIds
              .map((id) => `<span data-phrasebook-dialog-reference>${id}</span>`)
              .join('') +
            `</p></div>`
          ) +
        '</section>',
    ).join('') +
    '</div>';
  return root;
}

function dialogs(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-phrasebook-dialog]'),
  );
}

function visibleDialogs(root: HTMLElement): HTMLElement[] {
  return dialogs(root).filter((dialog) => {
    const group = dialog.closest('[data-phrasebook-scenario]') as HTMLElement | null;
    return group !== null && !group.hidden;
  });
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

describe('initPhrasebookScenarioFilter — exact prelaunch corpus', () => {
  it('shows all six canonical groups with the deterministic count and no-match hidden by default', () => {
    const root = buildPage();
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    expect(visibleGroups(root)).toHaveLength(6);
    expect(visibleGroups(root).map((group) => group.dataset.scenario)).toEqual([
      'airport',
      'transport',
      'food',
      'shopping',
      'hotel',
      'emergency',
    ]);
    expect(visibleEntries(root)).toHaveLength(TOTAL_CANONICAL);
    expect(visibleDialogs(root)).toHaveLength(6);
    expect(root.querySelectorAll('[data-phrasebook-dialog-turn]')).toHaveLength(36);
    expect(root.querySelectorAll('[data-phrasebook-dialog-reference]')).toHaveLength(18);
    expect(countText(root)).toBe(`全${TOTAL_CANONICAL}件`);
    expect(noMatch(root).hidden).toBe(true);
  });

  it.each(CANONICAL_GROUPS)(
    'filters to %s and counts only its canonical entries without hiding its dialog',
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
      expect(visibleDialogs(root)).toHaveLength(1);
      expect(visibleDialogs(root)[0].querySelectorAll('[data-phrasebook-dialog-turn]')).toHaveLength(
        group.turnCount,
      );
      expect(visibleDialogs(root)[0].querySelectorAll('[data-phrasebook-dialog-reference]')).toHaveLength(
        group.referenceIds.length,
      );
      expect(countText(root)).toBe(`${group.entryIds.length}件`);
      expect(noMatch(root).hidden).toBe(true);
    },
  );

  it('shows no-match when a sparse fail-closed projection omits a controlled scenario', () => {
    const scenario = 'transport';
    const root = buildPage(
      CANONICAL_GROUPS.filter((group) => group.scenario !== scenario),
    );
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    const select = selectOf(root);
    select.value = scenario;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(visibleGroups(root)).toHaveLength(0);
    expect(visibleEntries(root)).toHaveLength(0);
    expect(countText(root)).toBe('0件');
    expect(noMatch(root).hidden).toBe(false);
  });

  it.each(CANONICAL_GROUPS)(
    're-applies the %s filter from location.search on a direct refresh',
    (group) => {
      setSearch(`?scenario=${group.scenario}`);
      const root = buildPage();
      document.body.append(root);
      initPhrasebookScenarioFilter(root);

      expect(selectOf(root).value).toBe(group.scenario);
      expect(visibleGroups(root)).toHaveLength(1);
      expect(visibleGroups(root)[0].dataset.scenario).toBe(group.scenario);
      expect(visibleEntries(root)).toHaveLength(group.entryIds.length);
      expect(visibleDialogs(root)).toHaveLength(1);
      expect(countText(root)).toBe(`${group.entryIds.length}件`);
    },
  );

  it('shows the full canonical set for a missing/unknown/repeated URL on refresh', () => {
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
      expect(visibleEntries(root)).toHaveLength(TOTAL_CANONICAL);
      expect(visibleDialogs(root)).toHaveLength(6);
      expect(countText(root)).toBe(`全${TOTAL_CANONICAL}件`);
      document.body.replaceChildren();
    }
  });

  it('returns to the sparse rendered set after a no-match selection', () => {
    const root = buildPage(
      CANONICAL_GROUPS.filter((group) => group.scenario !== 'transport'),
    );
    document.body.append(root);
    initPhrasebookScenarioFilter(root);

    const select = selectOf(root);
    select.value = 'transport';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(noMatch(root).hidden).toBe(false);

    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleEntries(root)).toHaveLength(TOTAL_CANONICAL - 5);
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
    expect(visibleEntries(root)).toHaveLength(TOTAL_CANONICAL);
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
    expect(visibleEntries(root)).toHaveLength(5);
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

    expect(visibleEntries(root)).toHaveLength(TOTAL_CANONICAL);
    expect(window.location.search).toBe('');
  });
});
