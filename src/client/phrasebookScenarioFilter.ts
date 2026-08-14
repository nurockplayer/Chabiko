import {
  PHRASEBOOK_SCENARIOS,
  type PhrasebookScenario,
} from '../content/loadPhrasebook';

// ─── Frozen #236 filter contract ───────────────────────────────────────────────

/** URL query key for the scenario filter. */
export const PHRASEBOOK_SCENARIO_PARAM = 'scenario';

/** Selectable filter values; `all` shows every scenario group. */
export type PhrasebookFilterValue = PhrasebookScenario | 'all';

const SCENARIO_VALUES = new Set<string>(PHRASEBOOK_SCENARIOS);

/**
 * Read the effective scenario filter from a raw URL query string.
 *
 * Frozen contract (#236): no query, an unknown/empty value, or a repeated
 * `scenario` key all safely show every scenario group (`all`). Only a single
 * controlled value selects that scenario.
 */
export function readScenarioFromSearch(search: string): PhrasebookFilterValue {
  const params = new URLSearchParams(search);
  const values = params.getAll(PHRASEBOOK_SCENARIO_PARAM);
  if (values.length !== 1) return 'all';
  const value = values[0];
  return SCENARIO_VALUES.has(value) ? (value as PhrasebookFilterValue) : 'all';
}

/** Serialize a filter into its URL query (empty for `all`). */
export function scenarioToSearch(filter: PhrasebookFilterValue): string {
  if (filter === 'all') return '';
  return `?${PHRASEBOOK_SCENARIO_PARAM}=${encodeURIComponent(filter)}`;
}

// ─── Singleton controller ──────────────────────────────────────────────────────

interface ActiveBinding {
  cleanup: () => void;
}

/** A single active binding per page; re-init tears the previous one down. */
let active: ActiveBinding | null = null;

/**
 * Bind the native scenario-filter `<select>` to the phrasebook scenario groups.
 *
 * Behavior contract (#236):
 * - Filtering is URL-only: reads `location.search` on init (so a direct
 *   refresh re-applies the filter) and writes the query only via
 *   `history.replaceState` on a learner selection. Never reads or writes
 *   localStorage/sessionStorage and never touches the network.
 * - Missing/unknown/empty/repeated values show all scenario groups in
 *   controlled order; a controlled value filters to that scenario's section.
 * - The native reset link navigates to the base route, removing the query.
 * - Re-initialization tears down the previous binding, so change listeners are
 *   never duplicated.
 *
 * @param root  the subtree that holds the filter controls and scenario groups
 *   (defaults to the whole document).
 * @returns a cleanup that removes this binding's select listener.
 */
export function initPhrasebookScenarioFilter(
  root: ParentNode = document,
): () => void {
  active?.cleanup();

  const select = root.querySelector<HTMLSelectElement>('[data-scenario-filter]');
  const groups = Array.from(
    root.querySelectorAll<HTMLElement>('[data-phrasebook-scenario]'),
  );
  const countElement = root.querySelector<HTMLElement>('[data-scenario-count]');
  const noMatchElement = root.querySelector<HTMLElement>(
    '[data-phrasebook-no-match]',
  );

  function applyFilter(filter: PhrasebookFilterValue): void {
    let visibleCount = 0;
    for (const group of groups) {
      const matches = filter === 'all' || group.dataset.scenario === filter;
      group.hidden = !matches;
      if (matches) visibleCount += 1;
    }
    if (countElement !== null) {
      countElement.textContent =
        filter === 'all' ? `全${groups.length}件` : `${visibleCount}件`;
    }
    if (noMatchElement !== null) {
      noMatchElement.hidden = visibleCount > 0;
    }
  }

  function updateUrl(filter: PhrasebookFilterValue): void {
    const url = new URL(window.location.href);
    url.search = scenarioToSearch(filter);
    window.history.replaceState(null, '', url.href);
  }

  function onChange(): void {
    const value = select?.value as PhrasebookFilterValue | undefined;
    if (value === undefined || (value !== 'all' && !SCENARIO_VALUES.has(value))) {
      return;
    }
    applyFilter(value);
    updateUrl(value);
  }

  // Direct refresh re-applies the filter from `location.search` on load.
  const initial = readScenarioFromSearch(window.location.search);
  if (select !== null) select.value = initial;
  applyFilter(initial);

  select?.addEventListener('change', onChange);

  const binding: ActiveBinding = {
    cleanup: () => {
      select?.removeEventListener('change', onChange);
      if (active === binding) active = null;
    },
  };
  active = binding;
  return binding.cleanup;
}
