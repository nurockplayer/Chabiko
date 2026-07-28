import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import type { Illustration } from '../src/types/illustration';

type VocabRow = Record<string, unknown>;
type Loader = typeof import('../src/content/loadTeacherVocabulary')['loadTeacherVocabulary'];

const productionVocabData = JSON.parse(
  fs.readFileSync('data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json', 'utf-8'),
) as { vocabulary: VocabRow[] };
const productionIllustrationData = JSON.parse(
  fs.readFileSync('data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json', 'utf-8'),
) as { illustrations: VocabRow[] };

async function importLoaderWith(
  vocabData: { vocabulary: VocabRow[] } = productionVocabData,
  illustrationData: { illustrations: VocabRow[] } = productionIllustrationData,
): Promise<Loader> {
  vi.resetModules();
  vi.doMock('../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json', () => ({
    default: structuredClone(vocabData),
  }));
  vi.doMock('../data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json', () => ({
    default: structuredClone(illustrationData),
  }));
  const mod = await import('../src/content/loadTeacherVocabulary');
  return mod.loadTeacherVocabulary;
}

afterEach(() => {
  vi.doUnmock('../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json');
  vi.doUnmock('../data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json');
  vi.resetModules();
});

function v(overrides: VocabRow = {}): VocabRow {
  return {
    id: 'test-vocab-1', simplified: '测试', simplifiedStatus: 'authored',
    pinyin: 'cè shì', japanese: 'テスト', reviewStatus: 'draft',
    traditional: undefined, traditionalStatus: 'unavailable',
    curriculum: { sourceId: 'teacher-core-v1', difficultyBand: 'star-1', sourceDifficultyLabel: '☆', partOfSpeech: 'noun', sourceSheet: '名词1', sourceRow: 2 },
    source: { type: 'teacher-workbook' },
    ...overrides,
  };
}

function i(overrides: VocabRow = {}): VocabRow {
  return {
    id: 'ill-test-1', vocabularyId: 'test-vocab-1',
    assetPath: '/assets/vocabulary/teacher-core-v1/test.webp',
    sourceChecksumSha256: 'a'.repeat(64), width: 500, height: 500,
    mimeType: 'image/webp', fileSizeBytes: 1000, altJa: 'テスト',
    rights: { status: 'pending', source: 'teacher-provided', note: 'rights' },
    reviewStatus: 'draft',
    ...overrides,
  };
}

function sourceIlls(): Illustration[] {
  return JSON.parse(fs.readFileSync('data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json', 'utf-8')).illustrations;
}

const EXPECTED_IDS: readonly string[] = [
  'teacher-star-1-37e0eb213f0f', 'teacher-star-1-a66948a76fda', 'teacher-star-1-86f5cdb6e25c',
  'teacher-star-1-bdc7865a507e', 'teacher-star-1-86367b2d53f6', 'teacher-star-1-8b957a100bd4',
  'teacher-star-1-2cfcacc0503e', 'teacher-star-1-e7bc12c4f23a', 'teacher-star-1-e64490a207eb',
  'teacher-star-1-bada4e11125d', 'teacher-star-1-d903f490725f', 'teacher-star-1-7420330fee5c',
  'teacher-star-1-ed096023b3be', 'teacher-star-1-cb42fb8775e5', 'teacher-star-1-c39a19585434',
  'teacher-star-1-3e6fabf09358', 'teacher-star-1-1c0cdf0b2b9c', 'teacher-star-1-8fea4ac29b4c',
  'teacher-star-1-94757170c2b0', 'teacher-star-1-0cc5799cdbbc',
];

const LANG: Record<string, { simplified: string; pinyin: string; japanese: string; traditional?: string }> = {
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

describe('loadTeacherVocabulary', () => {
  let loadTeacherVocabulary: Loader;
  let items: readonly { vocabulary: VocabRow; illustration: Illustration | null }[];

  beforeEach(async () => {
    loadTeacherVocabulary = await importLoaderWith();
    items = loadTeacherVocabulary() as unknown as typeof items;
  });

  it('returns 20 items', () => { expect(items).toHaveLength(20); });
  it('order matches #112', () => { expect(items.map(item => item.vocabulary.id)).toEqual(EXPECTED_IDS); });
  it('all reviewStatus: draft', () => { for (const item of items) expect(item.vocabulary.reviewStatus).toBe('draft'); });
  it('all simplifiedStatus: authored', () => { for (const item of items) expect(item.vocabulary.simplifiedStatus).toBe('authored'); });
  it('小姐/女士 (5) illustration: null', () => { expect(items[5].illustration).toBeNull(); });
  it('exactly 19 with illustration', () => { expect(items.filter(item => item.illustration !== null)).toHaveLength(19); });
  it('人 retains its provisional illustration', () => { expect(items[1].illustration?.vocabularyId).toBe(EXPECTED_IDS[1]); });
  it('asset paths exist', () => { for (const item of items) if (item.illustration) expect(fs.existsSync(`public${item.illustration.assetPath}`)).toBe(true); });
  it('language values match #117', () => {
    for (const item of items) {
      const expected = LANG[item.vocabulary.id as string];
      expect(expected).toBeDefined();
      expect(item.vocabulary.simplified).toBe(expected.simplified);
      expect(item.vocabulary.pinyin).toBe(expected.pinyin);
      expect(item.vocabulary.japanese).toBe(expected.japanese);
      if (expected.traditional) expect(item.vocabulary.traditional).toBe(expected.traditional);
      else expect(item.vocabulary.traditional).toBeUndefined();
    }
  });
  it('illustration fields match #113', () => {
    const sourceByVocabularyId = new Map(sourceIlls().map(source => [source.vocabularyId, source]));
    for (const item of items) {
      if (!item.illustration) continue;
      const source = sourceByVocabularyId.get(item.illustration.vocabularyId);
      expect(source).toBeDefined();
      expect(item.illustration.altJa).toBe(source?.altJa);
      expect(item.illustration.assetPath).toBe(source?.assetPath);
      expect(item.illustration.width).toBe(source?.width);
      expect(item.illustration.height).toBe(source?.height);
    }
  });
  it('result frozen', () => expect(Object.isFrozen(items)).toBe(true));
  it('nested objects frozen', () => {
    for (const item of items) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.vocabulary)).toBe(true);
      if (item.illustration) expect(Object.isFrozen(item.illustration)).toBe(true);
    }
  });
  it('imports unfrozen', () => {
    expect(Object.isFrozen(productionVocabData.vocabulary[0])).toBe(false);
    expect(Object.isFrozen(productionVocabData.vocabulary[0].curriculum)).toBe(false);
    expect(Object.isFrozen(productionVocabData.vocabulary[0].source)).toBe(false);
    expect(Object.isFrozen(productionIllustrationData.illustrations[0])).toBe(false);
    expect(Object.isFrozen(productionIllustrationData.illustrations[0].rights)).toBe(false);
  });
  it('calls produce independent refs', () => {
    const a = loadTeacherVocabulary();
    const b = loadTeacherVocabulary();
    for (let index = 0; index < a.length; index++) {
      expect(a[index]).not.toBe(b[index]);
      expect(a[index].vocabulary).not.toBe(b[index].vocabulary);
      expect(a[index].vocabulary.curriculum).not.toBe(b[index].vocabulary.curriculum);
      expect(a[index].vocabulary.source).not.toBe(b[index].vocabulary.source);
      if (a[index].illustration && b[index].illustration) {
        expect(a[index].illustration).not.toBe(b[index].illustration);
        expect(a[index].illustration?.rights).not.toBe(b[index].illustration?.rights);
      }
    }
  });
  it('deterministic', () => { const second = loadTeacherVocabulary(); expect(second).toEqual(items); expect(second).not.toBe(items); });
});

describe('loadTeacherVocabulary — malformed data', () => {
  async function assertThrows(vocabRows: VocabRow[], illustrationRows: VocabRow[], pattern: RegExp) {
    const loadTeacherVocabulary = await importLoaderWith(
      { vocabulary: vocabRows },
      { illustrations: illustrationRows },
    );
    expect(() => loadTeacherVocabulary()).toThrow(pattern);
  }

  const okV = () => [v({ id: 'v1', illustrationRef: 'ill-v1' })];
  const okI = () => [i({ id: 'ill-v1', vocabularyId: 'v1' })];

  it('rejects duplicate vocabulary ID', async () => { await assertThrows([v({ id: 'dup' }), v({ id: 'dup' })], okI(), /duplicate vocabulary id/i); });
  it('rejects duplicate illustration ID', async () => { await assertThrows(okV(), [i({ id: 'x', vocabularyId: 'v1' }), i({ id: 'x', vocabularyId: 'v2' })], /duplicate illustration id/i); });
  it('rejects duplicate illustration vocabularyId', async () => { await assertThrows(okV(), [i({ id: 'a', vocabularyId: 'v1' }), i({ id: 'b', vocabularyId: 'v1' })], /duplicate illustration vocabularyId/i); });
  it('rejects missing illustrationRef target', async () => { await assertThrows([v({ id: 'v1', illustrationRef: 'ill-missing' })], okI(), /does not match any illustration/i); });
  it('rejects vocabularyId mismatch', async () => { await assertThrows([v({ id: 'v1', illustrationRef: 'ill-x' })], [i({ id: 'ill-x', vocabularyId: 'other' })], /expected/i); });
  it('rejects orphan illustration', async () => { await assertThrows([v({ id: 'v1' })], [i({ id: 'o', vocabularyId: 'no-such' })], /orphan/i); });
  it('rejects invalid source type', async () => { await assertThrows([v({ source: { type: 'hsk-workbook' } })], okI(), /source/i); });
  it('rejects invalid reviewStatus', async () => { await assertThrows([v({ reviewStatus: 'published' })], okI(), /reviewStatus/i); });
  it('rejects non-authored simplifiedStatus', async () => { await assertThrows([v({ simplifiedStatus: 'verified' })], okI(), /simplifiedStatus/i); });
  it('rejects invalid traditionalStatus when present', async () => { await assertThrows([v({ traditional: '測', traditionalStatus: 'generated' })], okI(), /traditionalStatus/i); });
  it('rejects invalid traditionalStatus when absent', async () => { await assertThrows([v({ traditional: undefined, traditionalStatus: 'authored' })], okI(), /traditionalStatus/i); });
  it('rejects non-draft illustration reviewStatus', async () => { await assertThrows([v({ id: 'v1', illustrationRef: 'ill-a' })], [i({ id: 'ill-a', vocabularyId: 'v1', reviewStatus: 'reviewed' })], /reviewStatus/i); });
  it('rejects incorrect rights status', async () => { await assertThrows([v({ id: 'v1', illustrationRef: 'ill-a' })], [i({ id: 'ill-a', vocabularyId: 'v1', rights: { status: 'cleared', source: 'teacher-provided', note: 't' } })], /rights/i); });
  it('rejects incorrect rights source', async () => { await assertThrows([v({ id: 'v1', illustrationRef: 'ill-a' })], [i({ id: 'ill-a', vocabularyId: 'v1', rights: { status: 'pending', source: 'other', note: 't' } })], /rights/i); });
  it('rejects empty rights note', async () => { await assertThrows([v({ id: 'v1', illustrationRef: 'ill-a' })], [i({ id: 'ill-a', vocabularyId: 'v1', rights: { status: 'pending', source: 'teacher-provided', note: '' } })], /rights/i); });
});
