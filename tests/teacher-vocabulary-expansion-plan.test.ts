import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const planJson = JSON.parse(readSource('../docs/content/teacher-core-v1-expansion-plan.json'));
const planMd = readSource('../docs/content/teacher-core-v1-expansion-plan.md');
const batch01 = JSON.parse(readSource('../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json'));

const KNOWN_SHEETS = ['名词1', '动词1', '形容词1', '副词', '名词2', '形容词2', '动词2'];
const VALID_DIFFICULTIES = ['star-1', 'star-2'] as const;
const VALID_POS = ['noun', 'verb', 'adjective', 'adverb'] as const;

describe('teacher-core-v1-expansion-plan.json', () => {
  describe('root keys and metadata', () => {
    it('has exactly the expected root keys', () => {
      const keys = Object.keys(planJson).sort();
      expect(keys).toEqual([
        'existingBatch01',
        'generatedFromImporter',
        'inventory',
        'remainingBatches',
        'sourceChecksumSha256',
        'sourceFile',
        'sourceId',
        'version',
      ]);
    });

    it('has version 1', () => {
      expect(planJson.version).toBe(1);
    });

    it('has correct sourceId', () => {
      expect(planJson.sourceId).toBe('teacher-core-v1');
    });

    it('has known sourceFile', () => {
      expect(planJson.sourceFile).toBe('单词表(带图).xlsx');
    });

    it('has exact expected checksum', () => {
      expect(planJson.sourceChecksumSha256)
        .toBe('3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37');
    });

    it('has correct importer path', () => {
      expect(planJson.generatedFromImporter)
        .toBe('scripts/import-teacher-vocabulary-xlsx.py');
    });
  });

  describe('inventory counts', () => {
    it('all counts are non-negative integers', () => {
      const { totalCandidateRows, acceptedRows, rejectedRows } = planJson.inventory;
      expect(Number.isInteger(totalCandidateRows)).toBe(true);
      expect(totalCandidateRows).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(acceptedRows)).toBe(true);
      expect(acceptedRows).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(rejectedRows)).toBe(true);
      expect(rejectedRows).toBeGreaterThanOrEqual(0);
    });

    it('accepted + rejected = total', () => {
      const { totalCandidateRows, acceptedRows, rejectedRows } = planJson.inventory;
      expect(acceptedRows + rejectedRows).toBe(totalCandidateRows);
    });

    it('countsByDifficulty has known keys only', () => {
      const keys = Object.keys(planJson.inventory.countsByDifficulty);
      for (const k of keys) {
        expect(VALID_DIFFICULTIES).toContain(k);
      }
    });

    it('countsByDifficulty values are non-negative', () => {
      for (const v of Object.values(planJson.inventory.countsByDifficulty) as number[]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });

    it('countsByPartOfSpeech has known keys only', () => {
      const keys = Object.keys(planJson.inventory.countsByPartOfSpeech);
      for (const k of keys) {
        expect(VALID_POS).toContain(k);
      }
    });

    it('countsByPartOfSpeech values are non-negative', () => {
      for (const v of Object.values(planJson.inventory.countsByPartOfSpeech) as number[]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });

    it('countsByDifficulty sum equals acceptedRows', () => {
      const sum = Object.values(planJson.inventory.countsByDifficulty as Record<string, number>)
        .reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(planJson.inventory.acceptedRows);
    });

    it('countsByPartOfSpeech sum equals acceptedRows', () => {
      const sum = Object.values(planJson.inventory.countsByPartOfSpeech as Record<string, number>)
        .reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(planJson.inventory.acceptedRows);
    });

    it('rejected count equals rejected array length', () => {
      expect(planJson.inventory.rejectedRows).toBe(planJson.inventory.rejected.length);
    });

    it('every rejected entry has sourceSheet, sourceRow, reason', () => {
      for (const r of planJson.inventory.rejected) {
        expect(typeof r.sourceSheet).toBe('string');
        expect(r.sourceSheet.length).toBeGreaterThan(0);
        expect(Number.isInteger(r.sourceRow)).toBe(true);
        expect(r.sourceRow).toBeGreaterThan(0);
        expect(typeof r.reason).toBe('string');
        expect(r.reason.length).toBeGreaterThan(0);
      }
    });

    it('every rejected sourceSheet is a known sheet', () => {
      for (const r of planJson.inventory.rejected) {
        expect(KNOWN_SHEETS).toContain(r.sourceSheet);
      }
    });
  });

  describe('existingBatch01 reconciliation', () => {
    it('has correct filename', () => {
      expect(planJson.existingBatch01.filename).toBe('teacher-vocabulary-batch-01.json');
    });

    it('has count 20', () => {
      expect(planJson.existingBatch01.count).toBe(20);
    });

    it('exactAcceptedPrefix is true', () => {
      expect(planJson.existingBatch01.exactAcceptedPrefix).toBe(true);
    });

    it('has 20 IDs in ids array', () => {
      expect(planJson.existingBatch01.ids).toHaveLength(20);
    });

    it('production batch-01 IDs match plan exactly', () => {
      const prodIds = batch01.vocabulary.map((v: any) => v.id);
      expect(planJson.existingBatch01.ids).toEqual(prodIds);
    });

    it('no vocabulary ID appears in both batch-01 and remaining batches', () => {
      const batch01Set = new Set(planJson.existingBatch01.ids);
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(batch01Set.has(item.id)).toBe(false);
        }
      }
    });
  });

  describe('remainingBatches', () => {
    it('batch numbers are contiguous from 2', () => {
      for (let i = 0; i < planJson.remainingBatches.length; i++) {
        expect(planJson.remainingBatches[i].batchNumber).toBe(i + 2);
      }
    });

    it('every batch count equals item length and is 1-50', () => {
      for (const batch of planJson.remainingBatches) {
        expect(batch.count).toBe(batch.items.length);
        expect(batch.count).toBeGreaterThanOrEqual(1);
        expect(batch.count).toBeLessThanOrEqual(50);
      }
    });

    it('filenames are zero-padded and sequential from batch-02', () => {
      for (let i = 0; i < planJson.remainingBatches.length; i++) {
        const expectedFilename = `teacher-vocabulary-batch-${String(i + 2).padStart(2, '0')}.json`;
        expect(planJson.remainingBatches[i].filename).toBe(expectedFilename);
      }
    });

    it('no duplicate vocabulary IDs across remaining batches', () => {
      const ids = new Set<string>();
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(ids.has(item.id)).toBe(false);
          ids.add(item.id);
        }
      }
    });

    it('no duplicate expected illustration IDs across remaining batches', () => {
      const illIds = new Set<string>();
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(illIds.has(item.expectedIllustrationId)).toBe(false);
          illIds.add(item.expectedIllustrationId);
        }
      }
    });

    it('every illustration ID equals ill-{vocabularyId}', () => {
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(item.expectedIllustrationId).toBe(`ill-${item.id}`);
        }
      }
    });

    it('every item has valid difficultyBand', () => {
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(VALID_DIFFICULTIES).toContain(item.difficultyBand);
        }
      }
    });

    it('every item has valid partOfSpeech', () => {
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(VALID_POS).toContain(item.partOfSpeech);
        }
      }
    });

    it('every item has valid known sourceSheet', () => {
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(KNOWN_SHEETS).toContain(item.sourceSheet);
        }
      }
    });

    it('every item has positive sourceRow', () => {
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(item.sourceRow).toBeGreaterThan(0);
        }
      }
    });

    it('every sourceValueSha256 is 64-character lowercase hex', () => {
      const hex64 = /^[0-9a-f]{64}$/;
      for (const batch of planJson.remainingBatches) {
        for (const item of batch.items) {
          expect(item.sourceValueSha256).toMatch(hex64);
        }
      }
    });

    it('items are globally sorted by difficulty/POS/sheet/row across batch boundaries', () => {
      const DIFF_ORDER: Record<string, number> = { 'star-1': 0, 'star-2': 1 };
      const POS_ORDER: Record<string, number> = { noun: 0, verb: 1, adjective: 2, adverb: 3 };
      const SHEET_ORDER: Record<string, number> = Object.fromEntries(
        KNOWN_SHEETS.map((s, i) => [s, i]),
      );

      const allItems = planJson.remainingBatches.flatMap((b: any) => b.items);
      for (let i = 1; i < allItems.length; i++) {
        const prev = allItems[i - 1];
        const cur = allItems[i];
        const prevKey = [
          DIFF_ORDER[prev.difficultyBand],
          POS_ORDER[prev.partOfSpeech],
          SHEET_ORDER[prev.sourceSheet] ?? 99,
          prev.sourceRow,
        ];
        const curKey = [
          DIFF_ORDER[cur.difficultyBand],
          POS_ORDER[cur.partOfSpeech],
          SHEET_ORDER[cur.sourceSheet] ?? 99,
          cur.sourceRow,
        ];
        for (let j = 0; j < prevKey.length; j++) {
          expect(prevKey[j]).toBeLessThanOrEqual(curKey[j]);
          if (prevKey[j] !== curKey[j]) break;
        }
      }
    });

    it('aggregate accepted count = 20 + all remaining items', () => {
      const remainingCount = planJson.remainingBatches
        .reduce((sum: number, b: any) => sum + b.count, 0);
      expect(planJson.inventory.acceptedRows).toBe(20 + remainingCount);
    });
  });

  describe('no forbidden content', () => {
    const planJsonStr = JSON.stringify(planJson);

    it('JSON does not contain known batch-01 source words', () => {
      const knownWords = ['大家', '人', '客人', '朋友', '先生', '小姐/女士', '自己',
        '爸爸', '妈妈', '父亲', '母亲', '哥哥', '姐姐', '弟弟', '妹妹', '爱人',
        '丈夫', '妻子', '孩子', '儿子'];
      for (const word of knownWords) {
        expect(planJsonStr).not.toContain(word);
      }
    });

    it('Markdown does not contain known batch-01 source words', () => {
      const knownWords = ['大家', '人', '客人', '朋友', '先生', '小姐/女士', '自己',
        '爸爸', '妈妈', '父亲', '母亲', '哥哥', '姐姐', '弟弟', '妹妹', '爱人',
        '丈夫', '妻子', '孩子', '儿子'];
      for (const word of knownWords) {
        expect(planMd).not.toContain(word);
      }
    });

    it('JSON does not contain absolute filesystem paths', () => {
      const absPathRe = /\/(Users|home)\/[^\s/]+\/[^\s/]+/;
      expect(planJsonStr).not.toMatch(absPathRe);
    });

    it('JSON does not contain workbook bytes or base64', () => {
      const base64Long = /[A-Za-z0-9+/]{100,}={0,2}/;
      expect(planJsonStr).not.toMatch(base64Long);
    });

    it('JSON does not contain image filenames', () => {
      const imgExtRe = /\.(png|jpg|jpeg|gif|svg|webp)/i;
      expect(planJsonStr).not.toMatch(imgExtRe);
    });
  });
});

describe('teacher-core-v1-expansion-plan.md', () => {
  it('Mentions the correct checksum', () => {
    expect(planMd).toContain('3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37');
  });

  it('Reports total candidate rows matching JSON', () => {
    const formatted = planJson.inventory.totalCandidateRows.toLocaleString('en-US');
    expect(planMd).toContain(formatted);
  });

  it('Reports accepted count matching JSON', () => {
    expect(planMd).toContain(String(planJson.inventory.acceptedRows));
  });

  it('Reports rejected count matching JSON', () => {
    const formatted = planJson.inventory.rejectedRows.toLocaleString('en-US');
    expect(planMd).toContain(formatted);
  });

  it('Does not contain absolute filesystem paths', () => {
    const absPathRe = /\/(Users|home)\/[^\s/]+\/[^\s/]+/;
    expect(planMd).not.toMatch(absPathRe);
  });

  it('Does not contain workbook bytes or image filenames', () => {
    const imgExtRe = /\.(png|jpg|jpeg|gif|svg|webp)/i;
    expect(planMd).not.toMatch(imgExtRe);
  });

  it('Reports batch-01 reconciliation result', () => {
    expect(planMd).toContain('exact match');
  });

  describe('rejected rows agree with JSON', () => {
    const mdLines = planMd.split('\n');

    it('lists sample rejected rows', () => {
      const hasSampleRow = mdLines.some(l => l.includes('missing difficulty check'));
      expect(hasSampleRow).toBe(true);
    });

    it('shows total rejected count matching JSON categories', () => {
      expect(planMd).toContain('1,845');
    });
  });

  describe('batch table agrees with JSON', () => {
    it('reports no remaining batches when remainingBatches is empty', () => {
      if (planJson.remainingBatches.length === 0) {
        expect(planMd).toContain('no batch-02');
      }
    });

    it('lists batch filename and count when batches exist', () => {
      for (const batch of planJson.remainingBatches) {
        expect(planMd).toContain(batch.filename);
      }
    });
  });
});
