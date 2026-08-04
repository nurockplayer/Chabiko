import type { VocabularyProgressStatus } from './vocabularyProgress';
import type { BasicVocabularyCatalogItem } from '../content/basicVocabularyCatalog';

/** Frozen page size for the basic-vocabulary catalog. */
export const BASIC_VOCABULARY_CATALOG_PAGE_SIZE = 24;

export type BasicVocabularyCatalogStatusFilter =
  | 'all'
  | 'new'
  | 'learning'
  | 'learned';

export interface BasicVocabularyCatalogQuery {
  readonly searchText: string;
  readonly status: BasicVocabularyCatalogStatusFilter;
  readonly page: number;
}

export interface BasicVocabularyCatalogPageItem {
  readonly item: BasicVocabularyCatalogItem;
  readonly status: VocabularyProgressStatus;
}

export interface BasicVocabularyCatalogResult {
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly page: number;
  readonly pageCount: number;
  readonly items: readonly BasicVocabularyCatalogPageItem[];
}

/**
 * Fold a search value for deterministic substring matching.
 *
 * Unicode NFKD, combining marks removed, locale-independent lowercase, all
 * whitespace collapsed, and outer whitespace trimmed — so tone-less Latin
 * input such as `da jia` matches tone-marked pinyin `dà jiā`. No
 * tokenization, ranking, fuzzy search, transliteration, or runtime
 * conversion.
 */
export function normalizeBasicVocabularyCatalogSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fold a single searchable field for substring matching. The folded value is
 * what every haystack field is compared against, so tone-less Latin input such
 * as `da jia` matches tone-marked pinyin `dà jiā`.
 */
function foldField(value: string): string {
  return normalizeBasicVocabularyCatalogSearch(value);
}

/**
 * Substring match over the folded searchable fields. Search covers only
 * `simplified`, truthful `traditional`, `pinyin`, and `japanese`.
 */
function matchesSearch(
  item: BasicVocabularyCatalogItem,
  foldedSearch: string,
): boolean {
  return (
    foldField(item.simplified).includes(foldedSearch) ||
    (item.traditional !== undefined && foldField(item.traditional).includes(foldedSearch)) ||
    (item.pinyin !== undefined && foldField(item.pinyin).includes(foldedSearch)) ||
    (item.japanese !== undefined && foldField(item.japanese).includes(foldedSearch))
  );
}

function pageIndexFromQuery(page: number): number {
  if (typeof page !== 'number') return 0;
  if (!Number.isInteger(page) || !Number.isFinite(page) || page < 1) {
    return 0;
  }
  return page - 1;
}

/**
 * Select a single deterministic catalog page.
 *
 * - Catalog/production order is preserved after every filter.
 * - Missing status-map entries default to `new`; unknown status-map IDs are
 *   ignored (their items never appear).
 * - `status: all` includes every item; controlled status filters match the
 *   resolved status exactly.
 * - Search covers only `simplified`, truthful `traditional`, `pinyin`, and
 *   `japanese`, using the folded substring behavior of
 *   `normalizeBasicVocabularyCatalogSearch`; an empty folded search matches
 *   all.
 * - Non-integer, non-finite, or page `< 1` becomes page 1; a requested page
 *   above the final page clamps to the final page.
 * - `pageCount` is `max(1, ceil(filteredCount / 24))`; zero results return
 *   page 1, pageCount 1, and an empty item list.
 * - Inputs and nested item objects are never mutated. Output items are
 *   references to the original immutable catalog items plus controlled status
 *   only — no copied or fabricated learning state.
 */
export function selectBasicVocabularyCatalogPage(
  items: readonly BasicVocabularyCatalogItem[],
  statusById: Readonly<Record<string, VocabularyProgressStatus>>,
  query: BasicVocabularyCatalogQuery,
): BasicVocabularyCatalogResult {
  const foldedSearch = normalizeBasicVocabularyCatalogSearch(query.searchText);

  const statusFilter = query.status;
  const matchesStatus = (status: VocabularyProgressStatus): boolean =>
    statusFilter === 'all' || status === statusFilter;

  const filtered: BasicVocabularyCatalogPageItem[] = [];
  for (const item of items) {
    if (foldedSearch.length === 0 || matchesSearch(item, foldedSearch)) {
      const status = statusById[item.learnerId] ?? 'new';
      if (matchesStatus(status)) {
        filtered.push({ item, status });
      }
    }
  }

  const filteredCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / BASIC_VOCABULARY_CATALOG_PAGE_SIZE));
  const requestedIndex = pageIndexFromQuery(query.page);
  const pageIndex = Math.min(requestedIndex, pageCount - 1);
  const start = pageIndex * BASIC_VOCABULARY_CATALOG_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + BASIC_VOCABULARY_CATALOG_PAGE_SIZE);

  return {
    totalCount: items.length,
    filteredCount,
    page: pageIndex + 1,
    pageCount,
    items: pageItems,
  };
}
