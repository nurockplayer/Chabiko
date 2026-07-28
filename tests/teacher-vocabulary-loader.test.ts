import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { loadTeacherVocabulary } from '../src/content/loadTeacherVocabulary';
import type { Illustration } from '../src/types/illustration';
import type { TeacherVocabularyType } from '../src/types/vocabulary';

// ─── Mock state for error tests (vi.hoisted runs before vi.mock) ────────────
const mockErrVocab = vi.hoisted(() => ({ current: '' }));
const mockErrIll = vi.hoisted(() => ({ current: '' }));
const errorMode = vi.hoisted(() => ({ current: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    readFileSync: vi.fn(((path: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      const p = String(path);
      if (!errorMode.current) {
        return actual.readFileSync(path, ...(args as [{ encoding?: string } | undefined]));
      }
      if (p.includes('/vocabulary/') && mockErrVocab.current) return mockErrVocab.current;
      if (p.includes('/illustrations/') && mockErrIll.current) return mockErrIll.current;
      return actual.readFileSync(path, ...(args as [{ encoding?: string } | undefined]));
    }) as typeof fs.readFileSync),
  };
});

// ─── Helper: load source data for cross-reference verification ──────────────

function loadSourceIllustrations(): Illustration[] {
  const raw = fs.readFileSync(
    'data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json',
    'utf-8',
  );
  return JSON.parse(raw).illustrations;
}

// ─── Expected manifest order from #112 (sorted: difficulty → POS → sheet → row) ───

const EXPECTED_IDS: readonly string[] = [
  'teacher-star-1-37e0eb213f0f',
  'teacher-star-1-a66948a76fda',
  'teacher-star-1-86f5cdb6e25c',
  'teacher-star-1-bdc7865a507e',
  'teacher-star-1-86367b2d53f6',
  'teacher-star-1-8b957a100bd4',
  'teacher-star-1-2cfcacc0503e',
  'teacher-star-1-e7bc12c4f23a',
  'teacher-star-1-e64490a207eb',
  'teacher-star-1-bada4e11125d',
  'teacher-star-1-d903f490725f',
  'teacher-star-1-7420330fee5c',
  'teacher-star-1-ed096023b3be',
  'teacher-star-1-cb42fb8775e5',
  'teacher-star-1-c39a19585434',
  'teacher-star-1-3e6fabf09358',
  'teacher-star-1-1c0cdf0b2b9c',
  'teacher-star-1-8fea4ac29b4c',
  'teacher-star-1-94757170c2b0',
  'teacher-star-1-0cc5799cdbbc',
];

// ─── Language values from #117 review for a subset of rows ──────────────────

const LANGUAGE_VALUES: Record<string, { simplified: string; pinyin: string; japanese: string; traditional?: string }> = {
  'teacher-star-1-37e0eb213f0f': { simplified: '大家', pinyin: 'dà jiā', japanese: 'みんな', traditional: '大家' },
  'teacher-star-1-a66948a76fda': { simplified: '人', pinyin: 'rén', japanese: '人（ひと）', traditional: '人' },
  'teacher-star-1-86f5cdb6e25c': { simplified: '客人', pinyin: 'kè ren', japanese: 'お客さん', traditional: '客人' },
  'teacher-star-1-bdc7865a507e': { simplified: '朋友', pinyin: 'péng you', japanese: '友達', traditional: '朋友' },
  'teacher-star-1-86367b2d53f6': { simplified: '先生', pinyin: 'xiān sheng', japanese: '先生（男性）', traditional: '先生' },
  'teacher-star-1-8b957a100bd4': { simplified: '小姐/女士', pinyin: 'xiǎo jiě/nǚ shì', japanese: '～さん（女性）' },
  'teacher-star-1-2cfcacc0503e': { simplified: '自己', pinyin: 'zì jǐ', japanese: '自分', traditional: '自己' },
  'teacher-star-1-e7bc12c4f23a': { simplified: '爸爸', pinyin: 'bà ba', japanese: 'お父さん', traditional: '爸爸' },
  'teacher-star-1-e64490a207eb': { simplified: '妈妈', pinyin: 'mā ma', japanese: 'お母さん', traditional: '媽媽' },
  'teacher-star-1-bada4e11125d': { simplified: '父亲', pinyin: 'fù qin', japanese: '父親', traditional: '父親' },
  'teacher-star-1-d903f490725f': { simplified: '母亲', pinyin: 'mǔ qin', japanese: '母親', traditional: '母親' },
  'teacher-star-1-7420330fee5c': { simplified: '哥哥', pinyin: 'gē ge', japanese: 'お兄さん', traditional: '哥哥' },
  'teacher-star-1-ed096023b3be': { simplified: '姐姐', pinyin: 'jiě jie', japanese: 'お姉さん', traditional: '姐姐' },
  'teacher-star-1-cb42fb8775e5': { simplified: '弟弟', pinyin: 'dì di', japanese: '弟', traditional: '弟弟' },
  'teacher-star-1-c39a19585434': { simplified: '妹妹', pinyin: 'mèi mei', japanese: '妹', traditional: '妹妹' },
  'teacher-star-1-3e6fabf09358': { simplified: '爱人', pinyin: 'ài rén', japanese: '配偶者', traditional: '愛人' },
  'teacher-star-1-1c0cdf0b2b9c': { simplified: '丈夫', pinyin: 'zhàng fu', japanese: '夫', traditional: '丈夫' },
  'teacher-star-1-8fea4ac29b4c': { simplified: '妻子', pinyin: 'qī zi', japanese: '妻', traditional: '妻子' },
  'teacher-star-1-94757170c2b0': { simplified: '孩子', pinyin: 'hái zi', japanese: '子ども', traditional: '孩子' },
  'teacher-star-1-0cc5799cdbbc': { simplified: '儿子', pinyin: 'ér zi', japanese: '息子', traditional: '兒子' },
};

// ─── Happy path tests ───────────────────────────────────────────────────────

describe('loadTeacherVocabulary — happy path', () => {
  let items: readonly {
    vocabulary: TeacherVocabularyType;
    illustration: Illustration | null;
  }[];

  beforeEach(() => {
    // Eagerly load once (immutable, no side effects across tests)
    items = loadTeacherVocabulary();
  });

  it('returns exactly 20 items', () => {
    expect(items).toHaveLength(20);
  });

  it('returns items in correct manifest order matching #112', () => {
    const ids = items.map(item => item.vocabulary.id);
    expect(ids).toEqual([...EXPECTED_IDS]);
  });

  it('all rows have reviewStatus: draft', () => {
    for (const item of items) {
      expect(item.vocabulary.reviewStatus).toBe('draft');
    }
  });

  it('all rows have simplifiedStatus: authored', () => {
    for (const item of items) {
      expect(item.vocabulary.simplifiedStatus).toBe('authored');
    }
  });

  it('rows with traditional have traditionalStatus: authored', () => {
    for (const item of items) {
      const v = item.vocabulary as unknown as Record<string, unknown>;
      if (v.traditional) {
        expect(v.traditionalStatus).toBe('authored');
      }
    }
  });

  it('rows without traditional have traditionalStatus: unavailable and no traditional key', () => {
    const xj = items[5];
    const record = xj.vocabulary as unknown as Record<string, unknown>;
    expect(record.traditional).toBeUndefined();
    expect(record.traditionalStatus).toBe('unavailable');
  });

  it('exact language values match #117 for every row', () => {
    for (const item of items) {
      const expected = LANGUAGE_VALUES[item.vocabulary.id];
      expect(expected).toBeDefined();
      const record = item.vocabulary as unknown as Record<string, unknown>;
      expect(record.simplified).toBe(expected.simplified);
      expect(record.pinyin).toBe(expected.pinyin);
      expect(record.japanese).toBe(expected.japanese);
      if (expected.traditional) {
        expect(record.traditional).toBe(expected.traditional);
      } else {
        expect(record.traditional).toBeUndefined();
      }
    }
  });

  it('小姐/女士 (6th) has illustration: null and no illustrationRef', () => {
    const item = items[5];
    expect(item.vocabulary.id).toBe('teacher-star-1-8b957a100bd4');
    expect(item.illustration).toBeNull();
    expect((item.vocabulary as unknown as Record<string, unknown>).illustrationRef).toBeUndefined();
  });

  it('人 retains its provisional illustration despite #117 rejection', () => {
    const item = items[1];
    expect(item.vocabulary.id).toBe('teacher-star-1-a66948a76fda');
    expect(item.vocabulary.simplified).toBe('人');
    expect(item.illustration).not.toBeNull();
    expect(item.illustration!.vocabularyId).toBe('teacher-star-1-a66948a76fda');
  });

  it('exactly 19 rows have a valid illustration', () => {
    const withIll = items.filter(item => item.illustration !== null);
    expect(withIll).toHaveLength(19);
  });

  it('every illustration.vocabularyId matches its vocabulary.id', () => {
    for (const item of items) {
      if (item.illustration) {
        expect(item.illustration.vocabularyId).toBe(item.vocabulary.id);
      }
    }
  });

  it('all illustration fields and altJa match #113', () => {
    const sourceIlls = loadSourceIllustrations();
    const illByVocabId = new Map(sourceIlls.map(i => [i.vocabularyId, i]));

    for (const item of items) {
      if (!item.illustration) continue;
      const src = illByVocabId.get(item.vocabulary.id);
      expect(src).toBeDefined();
      expect(item.illustration.altJa).toBe(src!.altJa);
      expect(item.illustration.assetPath).toBe(src!.assetPath);
      expect(item.illustration.mimeType).toBe(src!.mimeType);
      expect(item.illustration.width).toBe(src!.width);
      expect(item.illustration.height).toBe(src!.height);
      expect(item.illustration.fileSizeBytes).toBe(src!.fileSizeBytes);
    }
  });

  it('all illustrations have assetPath under /assets/vocabulary/teacher-core-v1/', () => {
    for (const item of items) {
      if (item.illustration) {
        expect(item.illustration.assetPath).toMatch(/^\/assets\/vocabulary\/teacher-core-v1\//);
      }
    }
  });

  it('all source.type is teacher-workbook', () => {
    for (const item of items) {
      expect(item.vocabulary.source.type).toBe('teacher-workbook');
    }
  });

  it('all curriculum fields are valid', () => {
    for (const item of items) {
      const c = item.vocabulary.curriculum;
      expect(c.sourceId).toBe('teacher-core-v1');
      expect(c.difficultyBand).toBe('star-1');
      expect(c.sourceDifficultyLabel).toBe('☆');
      expect(c.partOfSpeech).toBe('noun');
      expect(c.sourceSheet).toBe('名词1');
      expect(typeof c.sourceRow).toBe('number');
      expect(c.sourceRow).toBeGreaterThanOrEqual(2);
    }
  });

  it('result is frozen (read-only)', () => {
    expect(Object.isFrozen(items)).toBe(true);
    for (const item of items) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.vocabulary)).toBe(true);
    }
  });

  it('is deterministic across multiple calls', () => {
    const items2 = loadTeacherVocabulary();
    expect(items2).toEqual(items);
    expect(items2).not.toBe(items);
  });

  it('null illustration is allowed only when illustrationRef is absent', () => {
    const nullIllItems = items.filter(item => item.illustration === null);
    expect(nullIllItems).toHaveLength(1);
    for (const item of nullIllItems) {
      expect((item.vocabulary as unknown as Record<string, unknown>).illustrationRef).toBeUndefined();
    }
  });

  it('does not use HSK/example loader or fallback — no fallback image constructed', () => {
    // Verify the function name doesn't match HSK loaders
    const fnStr = loadTeacherVocabulary.toString();
    expect(fnStr).not.toContain('loadHskVocabulary');
    expect(fnStr).not.toContain('HskVocabulary');
    expect(fnStr).not.toContain('picsum');
    expect(fnStr).not.toContain('fallback');
  });
});

// ─── Error condition tests ──────────────────────────────────────────────────

const _vocabOne = () => JSON.stringify({
  vocabulary: [{
    id: 'teacher-star-1-x', simplified: 'x', simplifiedStatus: 'authored',
    pinyin: 'x', japanese: 'x', reviewStatus: 'draft',
    curriculum: { sourceId: 'teacher-core-v1', difficultyBand: 'star-1', sourceDifficultyLabel: '☆', partOfSpeech: 'noun', sourceSheet: '名词1', sourceRow: 2 },
    source: { type: 'teacher-workbook' },
  }],
});

const _illOne = () => JSON.stringify({
  illustrations: [{
    id: 'ill-teacher-star-1-x', vocabularyId: 'teacher-star-1-x',
    assetPath: '/assets/vocabulary/teacher-core-v1/ill.webp',
    sourceChecksumSha256: 'a'.repeat(64), width: 500, height: 500,
    mimeType: 'image/webp', fileSizeBytes: 1000, altJa: 'alt',
    rights: { status: 'pending', source: 'teacher-provided', note: 'test' },
    reviewStatus: 'draft',
  }],
});

describe('loadTeacherVocabulary — error conditions', () => {
  beforeEach(() => {
    errorMode.current = true;
  });

  afterEach(() => {
    mockErrVocab.current = '';
    mockErrIll.current = '';
    errorMode.current = false;
    vi.restoreAllMocks();
  });

  it('throws on invalid JSON in vocab file', () => {
    mockErrVocab.current = 'not valid json{{{';
    mockErrIll.current = _illOne();
    expect(() => loadTeacherVocabulary()).toThrow(/not valid JSON/i);
  });

  it('throws on invalid vocabulary structure', () => {
    mockErrVocab.current = '{"notVocabulary": []}';
    mockErrIll.current = _illOne();
    expect(() => loadTeacherVocabulary()).toThrow(/Invalid structure/i);
  });

  it('throws on invalid illustration structure', () => {
    mockErrVocab.current = _vocabOne();
    mockErrIll.current = '{"notIllustrations": []}';
    expect(() => loadTeacherVocabulary()).toThrow(/Invalid structure/i);
  });

  it('throws on illustrationRef not matching any illustration id', () => {
    mockErrVocab.current = JSON.stringify({
      vocabulary: [{ ...JSON.parse(_vocabOne()).vocabulary[0], illustrationRef: 'ill-nonexistent' }],
    });
    mockErrIll.current = JSON.stringify({ illustrations: [] });
    expect(() => loadTeacherVocabulary()).toThrow(/does not match any illustration/i);
  });

  it('throws on vocabularyId mismatch', () => {
    mockErrVocab.current = JSON.stringify({
      vocabulary: [{ ...JSON.parse(_vocabOne()).vocabulary[0], illustrationRef: 'ill-mismatch' }],
    });
    mockErrIll.current = JSON.stringify({
      illustrations: [{
        id: 'ill-mismatch', vocabularyId: 'other-id',
        assetPath: '/assets/vocabulary/teacher-core-v1/ill.webp',
        sourceChecksumSha256: 'a'.repeat(64), width: 500, height: 500,
        mimeType: 'image/webp', fileSizeBytes: 1000, altJa: 'alt',
        rights: { status: 'pending', source: 'teacher-provided', note: 'test' },
        reviewStatus: 'draft',
      }],
    });
    expect(() => loadTeacherVocabulary()).toThrow(/does not match vocabulary id/i);
  });

  it('throws on orphan illustration', () => {
    mockErrVocab.current = _vocabOne();
    mockErrIll.current = _illOne();
    expect(() => loadTeacherVocabulary()).toThrow(/orphan/i);
  });
});
