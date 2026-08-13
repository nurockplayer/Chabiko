import type { KanjiBridgeSimilarityType } from '../content/loadKanjiBridge';

// ─── Frozen #238 filter contract ───────────────────────────────────────────────

/** URL query key for the relation filter. */
export const KANJI_BRIDGE_RELATION_PARAM = 'relation';

/** Selectable filter values; `all` shows the full corpus. */
export type KanjiBridgeFilterValue = KanjiBridgeSimilarityType | 'all';

const RELATION_VALUES = new Set<string>([
  'same-meaning',
  'partial-overlap',
  'false-friend',
]);

/**
 * Read the effective relation filter from a raw URL query string.
 *
 * Frozen contract (#238): no query, an unknown/empty value, or a repeated
 * `relation` key all safely show the full corpus (`all`). Only a single
 * controlled value selects that relation.
 */
export function readRelationFromSearch(search: string): KanjiBridgeFilterValue {
  const params = new URLSearchParams(search);
  const values = params.getAll(KANJI_BRIDGE_RELATION_PARAM);
  if (values.length !== 1) return 'all';
  const value = values[0];
  return RELATION_VALUES.has(value) ? (value as KanjiBridgeFilterValue) : 'all';
}

/** Serialize a filter into its URL query (empty for `all`). */
export function relationToSearch(filter: KanjiBridgeFilterValue): string {
  if (filter === 'all') return '';
  return `?${KANJI_BRIDGE_RELATION_PARAM}=${encodeURIComponent(filter)}`;
}

// ─── Singleton controller ──────────────────────────────────────────────────────

interface ActiveBinding {
  cleanup: () => void;
}

/** A single active binding per page; re-init tears the previous one down. */
let active: ActiveBinding | null = null;

/**
 * Bind the native relation-filter `<select>` to the kanji-bridge entry list.
 *
 * Behavior contract (#238):
 * - Filtering is URL-only: reads `location.search` on init (so a direct
 *   refresh re-applies the filter) and writes the query only via
 *   `history.replaceState` on a learner selection. Never reads or writes
 *   localStorage/sessionStorage and never touches the network.
 * - Missing/unknown/empty/repeated values show the full corpus in source
 *   order; a controlled value filters without reordering (source order and the
 *   deterministic count are preserved).
 * - The native reset link navigates to the base route, removing the query.
 * - Re-initialization tears down the previous binding, so change listeners are
 *   never duplicated.
 *
 * @param root  the subtree that holds the filter controls and entry list
 *   (defaults to the whole document).
 * @returns a cleanup that removes this binding's select listener.
 */
export function initKanjiBridgeFilter(root: ParentNode = document): () => void {
  active?.cleanup();

  const select = root.querySelector<HTMLSelectElement>('[data-relation-filter]');
  const entries = Array.from(
    root.querySelectorAll<HTMLElement>('[data-kanji-bridge-entry]'),
  );
  const countElement = root.querySelector<HTMLElement>('[data-relation-count]');
  const noMatchElement = root.querySelector<HTMLElement>(
    '[data-kanji-bridge-no-match]',
  );

  function applyFilter(filter: KanjiBridgeFilterValue): void {
    let visibleCount = 0;
    for (const entry of entries) {
      const matches = filter === 'all' || entry.dataset.relation === filter;
      entry.hidden = !matches;
      if (matches) visibleCount += 1;
    }
    if (countElement !== null) {
      countElement.textContent =
        filter === 'all'
          ? `全${entries.length}件`
          : `${visibleCount}件`;
    }
    if (noMatchElement !== null) {
      noMatchElement.hidden = visibleCount > 0;
    }
  }

  function updateUrl(filter: KanjiBridgeFilterValue): void {
    const url = new URL(window.location.href);
    url.search = relationToSearch(filter);
    window.history.replaceState(null, '', url.href);
  }

  function onChange(): void {
    const value = select?.value as KanjiBridgeFilterValue | undefined;
    if (value === undefined || (value !== 'all' && !RELATION_VALUES.has(value))) {
      return;
    }
    applyFilter(value);
    updateUrl(value);
  }

  // Direct refresh re-applies the filter from `location.search` on load.
  const initial = readRelationFromSearch(window.location.search);
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
