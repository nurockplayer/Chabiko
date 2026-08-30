import { describe, expect, it } from 'vitest';
import {
  BASIC_VOCABULARY_CATALOG_PATH,
  buildBasicVocabularyCatalogDetailHref,
  parseBasicVocabularyCatalogUrlState,
  sanitizeBasicVocabularyCatalogReturnTarget,
  serializeBasicVocabularyCatalogUrlState,
} from '../src/domain/basicVocabularyCatalogState';

const SELECTED_ID = 'teacher-learner-5762bc98cd920b67';

describe('basic vocabulary catalog URL state', () => {
  it('serializes every non-default field in one deterministic order', () => {
    expect(serializeBasicVocabularyCatalogUrlState({
      searchText: '  DA   JIA  ',
      status: 'learning',
      partOfSpeech: 'verb',
      page: 2,
      selectedItemId: SELECTED_ID,
    })).toBe(
      `${BASIC_VOCABULARY_CATALOG_PATH}?q=DA+JIA&status=learning&pos=verb&page=2&item=${SELECTED_ID}` +
      `#word-${SELECTED_ID}`,
    );
  });

  it('omits default state and normalizes invalid or duplicated parameters safely', () => {
    expect(parseBasicVocabularyCatalogUrlState(
      '?q=%20%20%E7%9C%8B%20%20%E9%9B%BB%E5%BD%B1%20%20&status=wrong&status=learned&pos=other&page=-3&item=',
    )).toEqual({
      searchText: '看 電影',
      status: 'all',
      partOfSpeech: 'all',
      page: 1,
      selectedItemId: undefined,
    });
    expect(serializeBasicVocabularyCatalogUrlState({
      searchText: '',
      status: 'all',
      partOfSpeech: 'all',
      page: 1,
    })).toBe(BASIC_VOCABULARY_CATALOG_PATH);
  });

  it('rejects non-safe integers and canonicalizes unknown parameters away', () => {
    expect(parseBasicVocabularyCatalogUrlState(
      '?page=9007199254740992&pos=noun&unknown=stale',
    )).toEqual({
      searchText: '',
      status: 'all',
      partOfSpeech: 'noun',
      page: 1,
      selectedItemId: undefined,
    });
  });

  it('carries the selected item and complete catalog state through the detail URL', () => {
    const state = {
      searchText: '看',
      status: 'new' as const,
      partOfSpeech: 'verb' as const,
      page: 2,
      selectedItemId: SELECTED_ID,
    };
    const detailHref = buildBasicVocabularyCatalogDetailHref(SELECTED_ID, state);
    const detailUrl = new URL(detailHref, 'https://chabiko.example');
    const returnTarget = detailUrl.searchParams.get('from');

    expect(detailUrl.pathname).toBe(`/vocabulary/basic/words/${SELECTED_ID}/`);
    expect(returnTarget).toBe(serializeBasicVocabularyCatalogUrlState(state));
    expect(sanitizeBasicVocabularyCatalogReturnTarget(returnTarget, SELECTED_ID))
      .toBe(returnTarget);
  });

  it('rejects external, wrong-route, malformed, and wrong-item return targets', () => {
    const fallback = BASIC_VOCABULARY_CATALOG_PATH;
    expect(sanitizeBasicVocabularyCatalogReturnTarget(
      'https://example.com/vocabulary/basic/words/?item=x',
      SELECTED_ID,
    )).toBe(fallback);
    expect(sanitizeBasicVocabularyCatalogReturnTarget(
      '/vocabulary/basic/?item=' + SELECTED_ID,
      SELECTED_ID,
    )).toBe(fallback);
    expect(sanitizeBasicVocabularyCatalogReturnTarget('%not-a-url', SELECTED_ID))
      .toBe(fallback);
    expect(sanitizeBasicVocabularyCatalogReturnTarget(
      `/vocabulary/basic/words/?page=2&item=another#word-another`,
      SELECTED_ID,
    )).toBe(fallback);
  });
});
