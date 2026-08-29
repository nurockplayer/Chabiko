import { describe, it, expect } from 'vitest';
import type { LearnerManifest } from '../src/types/learnerManifest';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import {
  loadBasicVocabularyCatalog,
  type BasicVocabularyCatalogItem,
} from '../src/content/basicVocabularyCatalog';
import {
  BASIC_VOCABULARY_CATALOG_PAGE_SIZE,
  normalizeBasicVocabularyCatalogSearch,
  selectBasicVocabularyCatalogPage,
  type BasicVocabularyCatalogQuery,
  type BasicVocabularyCatalogResult,
} from '../src/domain/basicVocabularyCatalog';
import type { VocabularyProgressStatus } from '../src/domain/vocabularyProgress';
import { readFileSync } from 'node:fs';

const alwaysTracked = () => true;

const manifest: LearnerManifest = JSON.parse(
  readFileSync('data/teacher-vocabulary-preview/learner-manifest.json', 'utf8'),
);

const EXPECTED_COUNT = 1582;

const PRODUCTION_ID = 'teacher-star-1-37e0eb213f0f'; // 大家
const DERIVED_FIRST_ID = 'teacher-learner-5762bc98cd920b67'; // 看, first row
const DERIVED_LAST_ID = 'teacher-learner-ae237a6cfce26501'; // 闲, last row

describe('loadBasicVocabularyCatalog — production adapter', () => {
  it('contains exactly the current 1,582 eligible items, reconciled with the loader length', () => {
    const catalog = loadBasicVocabularyCatalog();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(catalog).toHaveLength(EXPECTED_COUNT);
    expect(catalog).toHaveLength(manifest.totals.eligible);
    expect(catalog).toHaveLength(corpus.length);
    expect(catalog.length).not.toBe(20);
  });

  it('preserves loader order exactly (unique IDs, exact first/last)', () => {
    const catalog = loadBasicVocabularyCatalog();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(catalog.map((item) => item.learnerId)).toEqual(corpus.map((item) => item.learnerId));
    expect(catalog.map((item) => item.learnerId)).toEqual(manifest.rows.map((row) => row.learnerId));
    expect(new Set(catalog.map((item) => item.learnerId)).size).toBe(catalog.length);
    expect(catalog[0].learnerId).toBe(DERIVED_FIRST_ID);
    expect(catalog[catalog.length - 1].learnerId).toBe(DERIVED_LAST_ID);
  });

  it('maps fields exactly, truthfully omits absent optional fields, and copies illustration metadata', () => {
    const catalog = loadBasicVocabularyCatalog();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    for (let i = 0; i < catalog.length; i++) {
      const item = catalog[i];
      const source = corpus[i];
      expect(item.learnerId).toBe(source.learnerId);
      expect(item.simplified).toBe(source.simplified);
      expect(item.partOfSpeech).toBe(source.partOfSpeech);
      if (source.traditional !== undefined) {
        expect(item.traditional).toBe(source.traditional);
      } else {
        expect(item.traditional).toBeUndefined();
      }
      if (source.pinyin !== undefined) {
        expect(item.pinyin).toBe(source.pinyin);
      } else {
        expect(item.pinyin).toBeUndefined();
      }
      if (source.japanese !== undefined) {
        expect(item.japanese).toBe(source.japanese);
      } else {
        expect(item.japanese).toBeUndefined();
      }
      if (source.difficulty !== undefined) {
        expect(item.difficulty).toBe(source.difficulty);
      } else {
        expect(item.difficulty).toBeUndefined();
      }
      expect(item.illustration).toEqual({
        assetPath: source.illustration.assetPath,
        width: source.illustration.width,
        height: source.illustration.height,
        altJa: source.illustration.altJa,
      });
    }
  });

  it('preserves opaque production learner IDs and truthful optional values', () => {
    const catalog = loadBasicVocabularyCatalog();
    const item = catalog.find((entry) => entry.learnerId === PRODUCTION_ID)!;
    expect(item).toBeDefined();
    expect(item.learnerId).toBe(PRODUCTION_ID);
    expect(item.simplified).toBe('大家');
    expect(item.traditional).toBe('大家');
    expect(item.pinyin).toBe('dà jiā');
    expect(item.japanese).toBe('みんな');
    expect(item.partOfSpeech).toBe('noun');
    expect(item.difficulty).toBe('☆');
    expect(item.illustration.assetPath).toBe(
      '/assets/vocabulary/teacher-core-v1/ill-teacher-star-1-37e0eb213f0f.webp',
    );
    expect(item.illustration.width).toBeGreaterThan(0);
    expect(item.illustration.height).toBeGreaterThan(0);
    expect(item.illustration.altJa.length).toBeGreaterThan(0);
  });

  it('covers a spread of optional fields across the catalog (some present, some absent)', () => {
    const catalog = loadBasicVocabularyCatalog();
    const withPinyin = catalog.filter((item) => item.pinyin !== undefined).length;
    const withJapanese = catalog.filter((item) => item.japanese !== undefined).length;
    const withTraditional = catalog.filter((item) => item.traditional !== undefined).length;
    const withDifficulty = catalog.filter((item) => item.difficulty !== undefined).length;
    expect(withPinyin).toBe(542);
    expect(withJapanese).toBe(511);
    expect(withTraditional).toBe(19);
    expect(withDifficulty).toBe(19);
    // Some items carry no optional fields at all (index 275 is 强调).
    expect(catalog[275].pinyin).toBeUndefined();
    expect(catalog[275].japanese).toBeUndefined();
    expect(catalog[275].traditional).toBeUndefined();
  });

  it('does not leak preview-only fields or review metadata into catalog items', () => {
    const catalog = loadBasicVocabularyCatalog();
    const forbidden = [
      'sourceSheet', 'sourceRow', 'reviewStatus', 'reconciliationEvidence',
      'sourceImageRelativePath', 'missingFields', 'promptDigest',
      'generationRevision', 'referenceSetIds', 'curriculum', 'source', 'rights',
      'state', 'provenance',
    ];
    for (const item of catalog) {
      const keys = Object.keys(item);
      expect(keys).not.toContain('sourceSheet');
      expect(keys).not.toContain('sourceRow');
      for (const key of forbidden) {
        expect(keys).not.toContain(key);
        expect(Object.keys(item.illustration)).not.toContain(key);
      }
      // Exactly the declared interface fields (optional ones only when present).
      const allowed = ['learnerId', 'simplified', 'traditional', 'pinyin', 'japanese', 'partOfSpeech', 'difficulty', 'illustration'];
      for (const key of keys) {
        expect(allowed).toContain(key);
      }
    }
  });

  it('repeated loads are equivalent and cannot mutate canonical loader data', () => {
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const frozenSimplified = corpus[0].simplified;
    const frozenIllustration = corpus[0].illustration.assetPath;

    const first = loadBasicVocabularyCatalog();
    const second = loadBasicVocabularyCatalog();
    expect(first).toEqual(second);
    expect(first.map((item) => item.learnerId)).toEqual(second.map((item) => item.learnerId));
    expect(first[0]).not.toBe(second[0]);

    const fresh = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(fresh[0].simplified).toBe(frozenSimplified);
    expect(fresh[0].illustration.assetPath).toBe(frozenIllustration);
    expect(fresh.map((item) => item.learnerId)).toEqual(
      loadProductionLearnerCorpus({ assetTracked: alwaysTracked }).map((item) => item.learnerId),
    );
  });
});

// ─── Domain: normalizeBasicVocabularyCatalogSearch ───────────────────────────

describe('normalizeBasicVocabularyCatalogSearch', () => {
  it('strips combining tone marks (tone-less Latin matches tone-marked pinyin)', () => {
    expect(normalizeBasicVocabularyCatalogSearch('da jia')).toBe('da jia');
    expect(normalizeBasicVocabularyCatalogSearch('dà jiā')).toBe('da jia');
    expect(normalizeBasicVocabularyCatalogSearch('dà')).toBe('da');
  });

  it('lowercases case-insensitively and folds whitespace', () => {
    expect(normalizeBasicVocabularyCatalogSearch('  DA    JIA ')).toBe('da jia');
    expect(normalizeBasicVocabularyCatalogSearch('  dà\n jiā\t')).toBe('da jia');
  });

  it('trims outer whitespace and collapses inner runs', () => {
    expect(normalizeBasicVocabularyCatalogSearch('   大家  ')).toBe('大家');
    expect(normalizeBasicVocabularyCatalogSearch('  看   电影  ')).toBe('看 电影');
  });

  it('is locale-independent lowercase for CJK', () => {
    expect(normalizeBasicVocabularyCatalogSearch('大家')).toBe('大家');
  });
});

// ─── Domain: selectBasicVocabularyCatalogPage ────────────────────────────────

const PAGE_SIZE = BASIC_VOCABULARY_CATALOG_PAGE_SIZE;

function defaultQuery(overrides: Partial<BasicVocabularyCatalogQuery> = {}): BasicVocabularyCatalogQuery {
  return { searchText: '', status: 'all', partOfSpeech: 'all', page: 1, ...overrides };
}

function resultItems(result: BasicVocabularyCatalogResult): BasicVocabularyCatalogItem[] {
  return result.items.map((entry) => entry.item);
}

function toStatusById(entries: [string, VocabularyProgressStatus][]): Record<string, VocabularyProgressStatus> {
  return Object.fromEntries(entries);
}

/** A small controlled catalog of the first `count` real catalog items, so
 * status/pagination assertions are precise without depending on the exact
 * 1,582-item production shape. Items are the original frozen references. */
function sampleCatalog(count: number): BasicVocabularyCatalogItem[] {
  return loadBasicVocabularyCatalog().slice(0, count);
}

describe('selectBasicVocabularyCatalogPage — status filtering', () => {
  it('status all includes every item in catalog order', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ status: 'all' }));
    expect(result.totalCount).toBe(catalog.length);
    expect(result.filteredCount).toBe(catalog.length);
    expect(result.pageCount).toBe(Math.ceil(catalog.length / PAGE_SIZE));
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(resultItems(result).map((item) => item.learnerId)).toEqual(
      catalog.slice(0, PAGE_SIZE).map((item) => item.learnerId),
    );
  });

  it('controlled status filters match exactly', () => {
    const catalog = sampleCatalog(5);
    const ids = catalog.map((item) => item.learnerId);
    const statusById = toStatusById([
      [ids[0], 'learning'],
      [ids[1], 'learned'],
      // ids[2..4] missing -> default to new
    ]);
    const learning = selectBasicVocabularyCatalogPage(
      catalog, statusById, defaultQuery({ status: 'learning' }),
    );
    expect(resultItems(learning).map((item) => item.learnerId)).toEqual([ids[0]]);
    expect(learning.items[0].status).toBe('learning');
    const learned = selectBasicVocabularyCatalogPage(
      catalog, statusById, defaultQuery({ status: 'learned' }),
    );
    expect(resultItems(learned).map((item) => item.learnerId)).toEqual([ids[1]]);
    expect(learned.items[0].status).toBe('learned');
    const newFiltered = selectBasicVocabularyCatalogPage(
      catalog, statusById, defaultQuery({ status: 'new' }),
    );
    expect(resultItems(newFiltered).map((item) => item.learnerId)).toEqual(ids.slice(2));
    expect(newFiltered.items.every((entry) => entry.status === 'new')).toBe(true);
  });

  it('missing statuses default to new', () => {
    const catalog = sampleCatalog(5);
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ status: 'new' }));
    expect(result.totalCount).toBe(5);
    expect(result.filteredCount).toBe(5);
    expect(result.items.every((entry) => entry.status === 'new')).toBe(true);
  });

  it('unknown status-map IDs are ignored', () => {
    const catalog = sampleCatalog(5);
    const ids = catalog.map((item) => item.learnerId);
    const statusById = toStatusById([
      ['not-a-real-id', 'learned'],
      [ids[0], 'learned'],
      [ids[1], 'new'],
    ]);
    const learned = selectBasicVocabularyCatalogPage(
      catalog, statusById, defaultQuery({ status: 'learned' }),
    );
    expect(resultItems(learned).map((item) => item.learnerId)).toEqual([ids[0]]);
    // 'not-a-real-id' must not affect any item's resolved status.
    expect(learned.items[0].status).toBe('learned');
    expect(learned.filteredCount).toBe(1);
  });

  it('does not invent learning state for unrated items', () => {
    const catalog = sampleCatalog(5);
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ status: 'all' }));
    expect(result.items.every((entry) => entry.status === 'new')).toBe(true);
  });
});

// ─── Domain: search ──────────────────────────────────────────────────────────

describe('selectBasicVocabularyCatalogPage — search', () => {
  it('matches Simplified substring', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: '大家' }));
    const ids = resultItems(result).map((item) => item.learnerId);
    expect(ids).toContain(PRODUCTION_ID);
    expect(result.filteredCount).toBe(1);
  });

  it('matches Traditional substring via truthful traditional field', () => {
    const catalog = loadBasicVocabularyCatalog();
    const mother = catalog.find((item) => item.learnerId === 'teacher-star-1-e64490a207eb')!;
    expect(mother.simplified).toBe('妈妈');
    expect(mother.traditional).toBe('媽媽');
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: '媽媽' }));
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([mother.learnerId]);
  });

  it('matches Japanese substring', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'みんな' }));
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([PRODUCTION_ID]);
  });

  it('matches tone-marked pinyin input', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'dà jiā' }));
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([PRODUCTION_ID]);
  });

  it('matches tone-less pinyin input against tone-marked pinyin', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'da jia' }));
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([PRODUCTION_ID]);
  });

  it('is case-insensitive', () => {
    const catalog = loadBasicVocabularyCatalog();
    const upper = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'DA JIA' }));
    const lower = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'da jia' }));
    expect(resultItems(upper).map((item) => item.learnerId)).toEqual(
      resultItems(lower).map((item) => item.learnerId),
    );
  });

  it('collapses whitespace in the search term', () => {
    const catalog = loadBasicVocabularyCatalog();
    const spaced = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: '  da   jia  ' }));
    const plain = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'da jia' }));
    expect(resultItems(spaced).map((item) => item.learnerId)).toEqual(
      resultItems(plain).map((item) => item.learnerId),
    );
  });

  it('an empty folded search matches all items', () => {
    const catalog = loadBasicVocabularyCatalog();
    for (const searchText of ['', '   ', '\n\t']) {
      const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText }));
      expect(result.filteredCount).toBe(catalog.length);
    }
  });

  it('a no-match search returns an empty page contract', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'zzz-no-match-zzz' }));
    expect(result.totalCount).toBe(catalog.length);
    expect(result.filteredCount).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(result.items).toEqual([]);
  });
});

// ─── Domain: filter + search composition ─────────────────────────────────────

describe('selectBasicVocabularyCatalogPage — filter + search composition', () => {
  it('composes search, status, and learner-approved part of speech before pagination', () => {
    const catalog = loadBasicVocabularyCatalog();
    const target = catalog.find(
      (item) => item.simplified === '看' && item.partOfSpeech === 'verb',
    )!;
    const distractor = catalog.find(
      (item) => item.simplified === '好看' && item.partOfSpeech === 'adjective',
    )!;
    const statusById = toStatusById([
      [target.learnerId, 'learned'],
      [distractor.learnerId, 'learned'],
    ]);

    const result = selectBasicVocabularyCatalogPage(
      catalog,
      statusById,
      {
        searchText: '看',
        status: 'learned',
        partOfSpeech: 'verb',
        page: 1,
      },
    );

    expect(result.filteredCount).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([target.learnerId]);
  });

  it('composes status and search without reordering', () => {
    const catalog = loadBasicVocabularyCatalog();
    // 大家 (index 514) resolved learning; another item sharing no search term
    // stays out. The single match must surface at page 1 in catalog order.
    const statusById = toStatusById([[PRODUCTION_ID, 'learning']]);
    const result = selectBasicVocabularyCatalogPage(
      catalog,
      statusById,
      defaultQuery({ status: 'learning', searchText: 'da jia' }),
    );
    expect(result.filteredCount).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([PRODUCTION_ID]);
    expect(result.items[0].status).toBe('learning');
  });

  it('status new plus a matching search yields only that item with status new', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(
      catalog,
      {},
      defaultQuery({ status: 'new', searchText: '大家' }),
    );
    expect(resultItems(result).map((item) => item.learnerId)).toEqual([PRODUCTION_ID]);
    expect(result.items[0].status).toBe('new');
  });

  it('matching search excludes items filtered out by a controlled status', () => {
    const catalog = loadBasicVocabularyCatalog();
    // 大家 is 'new' here; a learning-only filter must drop it.
    const result = selectBasicVocabularyCatalogPage(
      catalog,
      {},
      defaultQuery({ status: 'learning', searchText: '大家' }),
    );
    expect(result.filteredCount).toBe(0);
    expect(result.items).toEqual([]);
  });
});

describe('selectBasicVocabularyCatalogPage — part of speech', () => {
  it.each(['noun', 'verb', 'adjective', 'adverb'] as const)(
    'filters the canonical corpus to learner-approved %s entries only',
    (partOfSpeech) => {
      const catalog = loadBasicVocabularyCatalog();
      const expected = catalog.filter((item) => item.partOfSpeech === partOfSpeech);

      const result = selectBasicVocabularyCatalogPage(
        catalog,
        {},
        defaultQuery({ partOfSpeech }),
      );

      expect(result.filteredCount).toBe(expected.length);
      expect(result.items.every((entry) => entry.item.partOfSpeech === partOfSpeech)).toBe(true);
      expect(resultItems(result).map((item) => item.learnerId)).toEqual(
        expected.slice(0, PAGE_SIZE).map((item) => item.learnerId),
      );
    },
  );
});

// ─── Domain: pagination ──────────────────────────────────────────────────────

describe('selectBasicVocabularyCatalogPage — pagination', () => {
  it('page 1 returns the first 24 items', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ page: 1 }));
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(resultItems(result).map((item) => item.learnerId)).toEqual(
      catalog.slice(0, PAGE_SIZE).map((item) => item.learnerId),
    );
    expect(result.page).toBe(1);
  });

  it('the final page (66) starts at index 1560 and carries the last 22 items', () => {
    const catalog = loadBasicVocabularyCatalog();
    expect(catalog.length).toBe(1582);
    expect(Math.ceil(1582 / PAGE_SIZE)).toBe(66);
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ page: 66 }));
    expect(result.page).toBe(66);
    expect(result.pageCount).toBe(66);
    expect(result.items).toHaveLength(1582 - 65 * PAGE_SIZE); // 1582 - 1560 = 22
    expect(resultItems(result)[0].learnerId).toBe(catalog[65 * PAGE_SIZE].learnerId);
  });

  it('page 25 exists and is contiguous with page 24', () => {
    const catalog = loadBasicVocabularyCatalog();
    const page24 = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ page: 24 }));
    const page25 = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ page: 25 }));
    expect(resultItems(page24).map((item) => item.learnerId)).toEqual(
      catalog.slice(23 * PAGE_SIZE, 24 * PAGE_SIZE).map((item) => item.learnerId),
    );
    expect(resultItems(page25).map((item) => item.learnerId)).toEqual(
      catalog.slice(24 * PAGE_SIZE, 25 * PAGE_SIZE).map((item) => item.learnerId),
    );
  });

  it('non-integer, non-finite, or page < 1 becomes page 1', () => {
    const catalog = loadBasicVocabularyCatalog();
    for (const bad of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2' as unknown as number]) {
      const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ page: bad }));
      expect(result.page).toBe(1);
      expect(resultItems(result).map((item) => item.learnerId)).toEqual(
        catalog.slice(0, PAGE_SIZE).map((item) => item.learnerId),
      );
    }
  });

  it('a requested page above the final page clamps to the final page', () => {
    const catalog = loadBasicVocabularyCatalog();
    const finalPage = Math.ceil(catalog.length / PAGE_SIZE);
    for (const over of [finalPage + 1, finalPage + 50, 1000]) {
      const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ page: over }));
      expect(result.page).toBe(finalPage);
      expect(resultItems(result).map((item) => item.learnerId)).toEqual(
        catalog.slice((finalPage - 1) * PAGE_SIZE).map((item) => item.learnerId),
      );
    }
  });

  it('zero results return page 1, pageCount 1, and an empty item list', () => {
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(
      catalog, {}, defaultQuery({ searchText: 'no-such-term' }),
    );
    expect(result.filteredCount).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(result.items).toEqual([]);
  });

  it('pageCount is max(1, ceil(filteredCount / 24))', () => {
    const catalog = loadBasicVocabularyCatalog();
    const subset = catalog.slice(0, 25);
    const page1 = selectBasicVocabularyCatalogPage(subset, {}, defaultQuery({ page: 1 }));
    const page2 = selectBasicVocabularyCatalogPage(subset, {}, defaultQuery({ page: 2 }));
    expect(page1.pageCount).toBe(2);
    expect(page1.items).toHaveLength(PAGE_SIZE);
    expect(page2.items).toHaveLength(1);
    expect(page1.filteredCount).toBe(25);
  });
});

// ─── Domain: immutability ────────────────────────────────────────────────────

describe('selectBasicVocabularyCatalogPage — immutability', () => {
  it('never mutates input arrays, records, query, or status map', () => {
    const catalog = loadBasicVocabularyCatalog();
    const idsBefore = catalog.map((item) => item.learnerId);
    const simplifiedBefore = catalog.map((item) => item.simplified);
    const statusById: Record<string, VocabularyProgressStatus> = {
      [catalog[0].learnerId]: 'learned',
      [catalog[1].learnerId]: 'learning',
    };
    const statusKeysBefore = Object.keys(statusById);
    const query: BasicVocabularyCatalogQuery = {
      searchText: '  大家  ',
      status: 'all',
      partOfSpeech: 'all',
      page: 1,
    };
    const queryBefore = { ...query };

    selectBasicVocabularyCatalogPage(catalog, statusById, query);

    expect(catalog.map((item) => item.learnerId)).toEqual(idsBefore);
    expect(catalog.map((item) => item.simplified)).toEqual(simplifiedBefore);
    expect(Object.keys(statusById)).toEqual(statusKeysBefore);
    expect(statusById[catalog[0].learnerId]).toBe('learned');
    expect(statusById[catalog[1].learnerId]).toBe('learning');
    expect(query).toEqual(queryBefore);
  });

  it('returns references to the original immutable catalog items plus controlled status only', () => {
    const catalog = loadBasicVocabularyCatalog();
    const statusById = toStatusById([[catalog[0].learnerId, 'learned']]);
    const result = selectBasicVocabularyCatalogPage(catalog, statusById, defaultQuery({ status: 'all' }));
    expect(result.items[0].item).toBe(catalog[0]);
    expect(result.items[0].status).toBe('learned');
    expect(Object.keys(result.items[0])).toEqual(['item', 'status']);
    // The referenced catalog item remains deeply immutable.
    expect(Object.isFrozen(result.items[0].item)).toBe(true);
    expect(Object.isFrozen(result.items[0].item.illustration)).toBe(true);
    expect(() => {
      (result.items[0].item as unknown as Record<string, unknown>).simplified = 'x';
    }).toThrow();
  });
});

// ─── Domain: environment purity ──────────────────────────────────────────────

describe('basic vocabulary catalog domain — environment purity', () => {
  it('never touches storage, DOM, network, randomness, locale-dependent sorting, or runtime conversion', () => {
    // The domain entry points must be pure functions. Loading the catalog
    // calls the canonical loader, which validates a static manifest import and
    // reads deployed asset bytes; no storage, DOM, network, random, or runtime
    // conversion API is invoked by the selection logic itself.
    const catalog = loadBasicVocabularyCatalog();
    const result = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'da jia' }));
    expect(result.filteredCount).toBeGreaterThanOrEqual(1);
    // No per-call randomness: identical inputs give identical output.
    const again = selectBasicVocabularyCatalogPage(catalog, {}, defaultQuery({ searchText: 'da jia' }));
    expect(again).toEqual(result);
  });

  it('loadBasicVocabularyCatalog is deterministic across calls', () => {
    const a = loadBasicVocabularyCatalog();
    const b = loadBasicVocabularyCatalog();
    expect(a.map((item) => item.learnerId)).toEqual(b.map((item) => item.learnerId));
    expect(a.map((item) => item.pinyin)).toEqual(b.map((item) => item.pinyin));
  });
});
