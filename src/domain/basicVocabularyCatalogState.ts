import type {
  BasicVocabularyCatalogPartOfSpeechFilter,
  BasicVocabularyCatalogStatusFilter,
} from './basicVocabularyCatalog';

export const BASIC_VOCABULARY_CATALOG_PATH = '/vocabulary/basic/words/';

export interface BasicVocabularyCatalogUrlState {
  readonly searchText: string;
  readonly status: BasicVocabularyCatalogStatusFilter;
  readonly partOfSpeech: BasicVocabularyCatalogPartOfSpeechFilter;
  readonly page: number;
  readonly selectedItemId?: string;
}

const STATUS_FILTERS = new Set<BasicVocabularyCatalogStatusFilter>([
  'all',
  'new',
  'learning',
  'learned',
]);
const PART_OF_SPEECH_FILTERS = new Set<BasicVocabularyCatalogPartOfSpeechFilter>([
  'all',
  'noun',
  'verb',
  'adjective',
  'adverb',
]);

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePositiveInteger(value: string | null): number {
  if (value === null || !/^[1-9]\d*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

export function parseBasicVocabularyCatalogUrlState(
  search: string,
): BasicVocabularyCatalogUrlState {
  const params = new URLSearchParams(search);
  const rawStatus = params.get('status');
  const rawPartOfSpeech = params.get('pos');
  const rawSelectedItemId = params.get('item');

  return {
    searchText: normalizeSearchText(params.get('q') ?? ''),
    status: rawStatus !== null && STATUS_FILTERS.has(
      rawStatus as BasicVocabularyCatalogStatusFilter,
    )
      ? rawStatus as BasicVocabularyCatalogStatusFilter
      : 'all',
    partOfSpeech: rawPartOfSpeech !== null && PART_OF_SPEECH_FILTERS.has(
      rawPartOfSpeech as BasicVocabularyCatalogPartOfSpeechFilter,
    )
      ? rawPartOfSpeech as BasicVocabularyCatalogPartOfSpeechFilter
      : 'all',
    page: parsePositiveInteger(params.get('page')),
    selectedItemId: rawSelectedItemId === null || rawSelectedItemId === ''
      ? undefined
      : rawSelectedItemId,
  };
}

/** Serialize the complete catalog browse state in a fixed parameter order.
 * Defaults are omitted; the selected-item fragment is derived from the item
 * query parameter so a URL has only one canonical representation. */
export function serializeBasicVocabularyCatalogUrlState(
  state: BasicVocabularyCatalogUrlState,
): string {
  const params = new URLSearchParams();
  const searchText = normalizeSearchText(state.searchText);
  if (searchText !== '') params.set('q', searchText);
  if (state.status !== 'all') params.set('status', state.status);
  if (state.partOfSpeech !== 'all') params.set('pos', state.partOfSpeech);
  if (Number.isSafeInteger(state.page) && state.page > 1) {
    params.set('page', String(state.page));
  }
  if (state.selectedItemId !== undefined && state.selectedItemId !== '') {
    params.set('item', state.selectedItemId);
  }

  const query = params.toString();
  const fragment = state.selectedItemId === undefined || state.selectedItemId === ''
    ? ''
    : `#word-${encodeURIComponent(state.selectedItemId)}`;
  return `${BASIC_VOCABULARY_CATALOG_PATH}${query === '' ? '' : `?${query}`}${fragment}`;
}

export function buildBasicVocabularyCatalogDetailHref(
  learnerId: string,
  state: BasicVocabularyCatalogUrlState,
): string {
  const returnTarget = serializeBasicVocabularyCatalogUrlState({
    ...state,
    selectedItemId: learnerId,
  });
  const params = new URLSearchParams({ from: returnTarget });
  return `${BASIC_VOCABULARY_CATALOG_PATH}${encodeURIComponent(learnerId)}/?${params}`;
}

/** Accept only a same-product catalog target whose selected item matches the
 * detail page. Invalid or stale targets fail closed to the catalog root. */
export function sanitizeBasicVocabularyCatalogReturnTarget(
  rawTarget: string | null,
  expectedLearnerId: string,
): string {
  if (rawTarget === null || !rawTarget.startsWith('/') || rawTarget.startsWith('//')) {
    return BASIC_VOCABULARY_CATALOG_PATH;
  }

  let target: URL;
  try {
    target = new URL(rawTarget, 'https://catalog-return.invalid');
  } catch {
    return BASIC_VOCABULARY_CATALOG_PATH;
  }
  if (target.origin !== 'https://catalog-return.invalid' ||
      target.pathname !== BASIC_VOCABULARY_CATALOG_PATH) {
    return BASIC_VOCABULARY_CATALOG_PATH;
  }

  const state = parseBasicVocabularyCatalogUrlState(target.search);
  if (state.selectedItemId !== expectedLearnerId) {
    return BASIC_VOCABULARY_CATALOG_PATH;
  }
  return serializeBasicVocabularyCatalogUrlState(state);
}
