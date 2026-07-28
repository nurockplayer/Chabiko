import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { loadTeacherVocabulary, validateTeacherVocabData } from '../src/content/loadTeacherVocabulary';
import type { Illustration } from '../src/types/illustration';

function sourceIllustrations(): Illustration[] {
  const raw = fs.readFileSync('data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json', 'utf-8');
  return JSON.parse(raw).illustrations;
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

function vRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-vocab-1', simplified: '测试', simplifiedStatus: 'authored',
    pinyin: 'cè shì', japanese: 'テスト', reviewStatus: 'draft',
    traditional: undefined, traditionalStatus: 'unavailable',
    curriculum: { sourceId: 'teacher-core-v1', difficultyBand: 'star-1', sourceDifficultyLabel: '☆', partOfSpeech: 'noun', sourceSheet: '名词1', sourceRow: 2 },
    source: { type: 'teacher-workbook' },
    ...overrides,
  };
}

function iRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

// ─── Happy path tests with real production data ───────────────────────────

describe('loadTeacherVocabulary', () => {
  let items: readonly { vocabulary: Record<string, unknown>; illustration: Illustration | null }[];

  beforeEach(() => { items = loadTeacherVocabulary() as unknown as typeof items; });

  it('returns exactly 20 items', () => { expect(items).toHaveLength(20); });
  it('returns items in #112 manifest order', () => { expect(items.map(i => (i.vocabulary as Record<string, unknown>).id)).toEqual(EXPECTED_IDS); });
  it('all rows have reviewStatus: draft', () => { for (const i of items) expect((i.vocabulary as Record<string, unknown>).reviewStatus).toBe('draft'); });
  it('all rows have simplifiedStatus: authored', () => { for (const i of items) expect((i.vocabulary as Record<string, unknown>).simplifiedStatus).toBe('authored'); });
  it('小姐/女士 (index 5) has illustration: null', () => { expect(items[5].illustration).toBeNull(); });
  it('exactly 19 rows have a valid illustration', () => { expect(items.filter(i => i.illustration !== null)).toHaveLength(19); });
  it('every asset path points to an existing committed file', () => { for (const i of items) if (i.illustration) expect(fs.existsSync(`public${i.illustration.assetPath}`)).toBe(true); });

  it('exact language values match #117 for every row', () => {
    for (const item of items) {
      const vid = (item.vocabulary as Record<string, unknown>).id as string;
      const expected = LANGUAGE_VALUES[vid];
      expect(expected).toBeDefined();
      const r = item.vocabulary as Record<string, unknown>;
      expect(r.simplified).toBe(expected.simplified);
      expect(r.pinyin).toBe(expected.pinyin);
      expect(r.japanese).toBe(expected.japanese);
      if (expected.traditional) expect(r.traditional).toBe(expected.traditional);
      else expect(r.traditional).toBeUndefined();
    }
  });

  it('all illustration fields and altJa match #113', () => {
    const src = sourceIllustrations();
    const map = new Map(src.map(i => [i.vocabularyId, i]));
    for (const item of items) {
      if (!item.illustration) continue;
      const s = map.get(item.illustration.vocabularyId);
      expect(s).toBeDefined();
      expect(item.illustration.altJa).toBe(s!.altJa);
      expect(item.illustration.assetPath).toBe(s!.assetPath);
      expect(item.illustration.width).toBe(s!.width);
      expect(item.illustration.height).toBe(s!.height);
    }
  });

  it('result array is frozen', () => expect(Object.isFrozen(items)).toBe(true));
  it('every returned object is frozen', () => { for (const i of items) { expect(Object.isFrozen(i)).toBe(true); expect(Object.isFrozen(i.vocabulary)).toBe(true); if (i.illustration) expect(Object.isFrozen(i.illustration)).toBe(true); } });

  it('two calls produce independent nested references for all nested objects', () => {
    const a = loadTeacherVocabulary();
    const b = loadTeacherVocabulary();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    for (let i = 0; i < a.length; i++) {
      // Top level
      expect(a[i]).not.toBe(b[i]);
      // Vocabulary and all nested objects
      expect(a[i].vocabulary).not.toBe(b[i].vocabulary);
      expect(a[i].vocabulary.curriculum).not.toBe(b[i].vocabulary.curriculum);
      expect(a[i].vocabulary.source).not.toBe(b[i].vocabulary.source);
      // Illustration and nested objects
      if (a[i].illustration && b[i].illustration) {
        expect(a[i].illustration).not.toBe(b[i].illustration);
        expect(a[i].illustration!.rights).not.toBe(b[i].illustration!.rights);
      }
    }
  });

  it('imported static data is not frozen or mutated', () => {
    loadTeacherVocabulary();
    const vocabRaw = JSON.parse(fs.readFileSync('data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json', 'utf-8'));
    const illRaw = JSON.parse(fs.readFileSync('data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json', 'utf-8'));
    expect(Object.isFrozen(vocabRaw.vocabulary[0])).toBe(false);
    expect(Object.isFrozen(illRaw.illustrations[0])).toBe(false);
    // nested objects also unfrozen
    expect(Object.isFrozen(vocabRaw.vocabulary[0].curriculum)).toBe(false);
    expect(Object.isFrozen(vocabRaw.vocabulary[0].source)).toBe(false);
    expect(Object.isFrozen(illRaw.illustrations[0].rights)).toBe(false);
  });

  it('is deterministic across calls', () => { const i2 = loadTeacherVocabulary(); expect(i2).toEqual(items); expect(i2).not.toBe(items); });
});

// ─── Error condition tests (no mocking needed) ──────────────────────────────

describe('validateTeacherVocabData — error conditions', () => {
  // Base valid data pairs that other tests can use
  function validVocab(id = 'v1') {
    return vRow({ id, traditional: '測', traditionalStatus: 'authored', illustrationRef: 'ill-' + id });
  }
  function validIll(vocabId = 'v1') {
    return iRow({ id: 'ill-' + vocabId, vocabularyId: vocabId });
  }
  const I = [iRow({ traditional: '測', traditionalStatus: 'authored' })];

  it('throws on duplicate vocabulary ID', () => expect(() => validateTeacherVocabData([vRow({ id: 'dup' }), vRow({ id: 'dup' })], I)).toThrow(/duplicate vocabulary id/i));
  it('throws on duplicate illustration ID', () => expect(() => validateTeacherVocabData([vRow({ id: 'a' })], [iRow({ id: 'x', vocabularyId: 'a' }), iRow({ id: 'x', vocabularyId: 'b' })])).toThrow(/duplicate illustration id/i));
  it('throws on duplicate illustration vocabularyId', () => expect(() => validateTeacherVocabData([vRow({ id: 'a' })], [iRow({ id: 'a', vocabularyId: 'a' }), iRow({ id: 'b', vocabularyId: 'a' })])).toThrow(/duplicate illustration vocabularyId/i));
  it('throws on missing illustrationRef', () => expect(() => validateTeacherVocabData([validVocab('a'), vRow({ id: 'b', illustrationRef: 'ill-missing' })], [validIll('a'), validIll('b')])).toThrow(/does not match any illustration/i));
  it('throws on vocabularyId mismatch', () => expect(() => validateTeacherVocabData([vRow({ id: 'a', illustrationRef: 'ill-x' })], [iRow({ id: 'ill-x', vocabularyId: 'other' })])).toThrow(/expected/i));
  it('throws on orphan illustration', () => expect(() => validateTeacherVocabData([vRow({ id: 'a' })], [iRow({ id: 'o', vocabularyId: 'no-such' })])).toThrow(/orphan/i));
  it('throws on invalid source type', () => expect(() => validateTeacherVocabData([vRow({ source: { type: 'hsk-workbook' } })], I)).toThrow(/source.*type/i));
  it('throws on invalid reviewStatus', () => expect(() => validateTeacherVocabData([vRow({ reviewStatus: 'published' })], I)).toThrow(/reviewStatus/i));
  it('throws on non-authored simplifiedStatus', () => expect(() => validateTeacherVocabData([vRow({ simplifiedStatus: 'verified' })], I)).toThrow(/simplifiedStatus/i));
  it('throws on invalid traditionalStatus (present)', () => expect(() => validateTeacherVocabData([vRow({ traditional: '測', traditionalStatus: 'generated' })], I)).toThrow(/traditionalStatus/i));
  it('throws on invalid traditionalStatus (absent)', () => expect(() => validateTeacherVocabData([vRow({ traditional: undefined, traditionalStatus: 'authored' })], I)).toThrow(/traditionalStatus/i));
  it('throws on non-draft illustration reviewStatus', () => expect(() => validateTeacherVocabData([vRow({ id: 'a', illustrationRef: 'ill-a' })], [iRow({ id: 'ill-a', vocabularyId: 'a', reviewStatus: 'reviewed' })])).toThrow(/reviewStatus/i));
  it('throws on incorrect rights status', () => expect(() => validateTeacherVocabData([vRow({ id: 'a', illustrationRef: 'ill-a' })], [iRow({ id: 'ill-a', vocabularyId: 'a', rights: { status: 'cleared', source: 'teacher-provided', note: 't' } })])).toThrow(/rights/i));
  it('throws on incorrect rights source', () => expect(() => validateTeacherVocabData([vRow({ id: 'a', illustrationRef: 'ill-a' })], [iRow({ id: 'ill-a', vocabularyId: 'a', rights: { status: 'pending', source: 'other', note: 't' } })])).toThrow(/rights/i));
  it('throws on empty rights note', () => expect(() => validateTeacherVocabData([vRow({ id: 'a', illustrationRef: 'ill-a' })], [iRow({ id: 'ill-a', vocabularyId: 'a', rights: { status: 'pending', source: 'teacher-provided', note: '' } })])).toThrow(/rights/i));
});
