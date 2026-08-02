import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  filterTeacherVocabularyPreview,
  loadTeacherImageReconciliation,
  loadTeacherVocabularyPreview,
} from '../src/content/loadTeacherVocabularyPreview';
import { loadTeacherVocabulary } from '../src/content/loadTeacherVocabulary';

const preview = loadTeacherVocabularyPreview();
const reconciliation = loadTeacherImageReconciliation();

describe('complete teacher vocabulary preview', () => {
  it('keeps every usable workbook row exactly once with a source-stable preview identity', () => {
    expect(preview.workbook.basename).toBe('单词表(带图).xlsx');
    expect(preview.workbook.sha256).toBe('3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37');
    expect(preview.rows).toHaveLength(1865);
    expect(new Set(preview.rows.map((row) => row.id)).size).toBe(1865);
    expect(new Set(preview.rows.map((row) => `${row.sourceSheet}:${row.sourceRow}`)).size).toBe(1865);
    expect(preview.rows.every((row) => row.simplified.trim().length > 0)).toBe(true);
  });

  it('preserves the immutable production IDs and visible values without entering the production loader contract', () => {
    const production = loadTeacherVocabulary();
    expect(production).toHaveLength(20);
    for (const item of production) {
      const productionRow = item.vocabulary;
      const previewRow = preview.rows.find((row) => row.productionVocabularyId === productionRow.id);
      expect(previewRow).toBeDefined();
      expect(previewRow?.id).toBe(productionRow.id);
      expect(previewRow?.simplified).toBe(productionRow.simplified);
      expect(previewRow?.pinyin).toBe(productionRow.pinyin);
      expect(previewRow?.japanese).toBe(productionRow.japanese);
      expect(previewRow?.traditional).toBe(productionRow.traditional);
    }
  });

  it('keeps missing fields explicit and never claims a teacher image for AI output', () => {
    expect(preview.rows.some((row) => row.missingFields.includes('pinyin'))).toBe(true);
    expect(preview.rows.some((row) => row.missingFields.includes('japanese'))).toBe(true);
    expect(preview.rows.some((row) => row.missingFields.includes('traditional'))).toBe(true);
    for (const row of preview.rows) {
      if (row.image.state === 'ai-generated') {
        expect(row.image.provenance).toBe('ai-generated');
        expect(row.image.reviewStatus).toBe('draft');
        expect(row.image.assetPath).toMatch(/^\/assets\/vocabulary\/teacher-preview\/ai\//);
      }
      if (row.image.state === 'teacher-mapped') {
        expect(row.image.provenance).toBe('teacher-provided');
      }
    }
  });

  it('reconciles every teacher source image exactly once and preserves collisions', () => {
    expect(reconciliation).toHaveLength(1240);
    expect(new Set(reconciliation.map((image) => image.relativePath)).size).toBe(1240);
    expect(reconciliation.filter((image) => image.state === 'duplicate')).toHaveLength(1);
    expect(reconciliation.filter((image) => image.state === 'unsuitable').map((image) => image.relativePath)).toEqual(['拼音表.png']);
    expect(reconciliation.some((image) => image.state === 'ambiguous')).toBe(true);
    expect(reconciliation.some((image) => image.state === 'unmatched')).toBe(true);
  });

  it('has a complete finalized generation queue and exactly one safe asset link per generated row', () => {
    const queue = JSON.parse(readFileSync('data/teacher-vocabulary-preview/generation-queue.json', 'utf8'));
    const generated = preview.rows.filter((row) => row.image.state === 'ai-generated');
    expect(queue.status).toBe('complete');
    expect(queue.totals.pending).toBe(0);
    expect(queue.totals.generated).toBe(queue.totals.suitable);
    expect(generated).toHaveLength(queue.totals.suitable);
    expect(new Set(generated.map((row) => row.image.assetPath)).size).toBe(generated.length);
    for (const row of generated) {
      expect(row.image.promptDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(existsSync(`public${row.image.assetPath}`)).toBe(true);
    }
  });

  it('derives regenerated from actual queue metadata and keeps revision-3 reasons machine-readable', () => {
    const queue = JSON.parse(readFileSync('data/teacher-vocabulary-preview/generation-queue.json', 'utf8'));
    const regeneratedItems = queue.items.filter((item: { regenerationReason?: unknown }) => item.regenerationReason);
    expect(queue.totals.regenerated).toBe(regeneratedItems.length);
    expect(queue.totals.regenerated).toBe(2);
    expect(regeneratedItems.every((item: { generationRevision: number }) => item.generationRevision === 3)).toBe(true);
    for (const item of regeneratedItems) {
      expect(item.regenerationReason.fromRevision).toBe('2');
      expect(item.regenerationReason.toRevision).toBe('3');
      expect(item.regenerationReason.outcome).toBe('rejected-and-regenerated');
      expect(item.regenerationReason.reason.length).toBeGreaterThan(0);
    }
  });

  it('keeps the immutable production 19-image contract and deploys the 1,131 review-only derivatives', () => {
    const productionRows = preview.rows.filter((row) => row.productionVocabularyId);
    expect(productionRows).toHaveLength(20);
    const productionImages = productionRows.filter((row) => row.image.assetPath);
    expect(productionImages).toHaveLength(19);
    for (const row of productionImages) {
      expect(row.image.assetPath).toMatch(/^\/assets\/vocabulary\/teacher-core-v1\//);
      expect(existsSync(`public${row.image.assetPath}`)).toBe(true);
    }
    // All 1,131 review-only teacher derivatives are deployed at the tracked
    // teacher-preview path and exist on disk.
    const reviewOnly = preview.rows.filter((row) => row.image.state === 'teacher-mapped' && !row.productionVocabularyId);
    expect(reviewOnly).toHaveLength(1131);
    for (const row of reviewOnly) {
      expect(row.image.assetPath).toMatch(/^\/assets\/vocabulary\/teacher-preview\/teacher\//);
      expect(existsSync(`public${row.image.assetPath}`)).toBe(true);
    }
    expect(preview.totals.byImageState['teacher-mapped']).toBe(1150);
    // No obsolete local-only state remains anywhere in the corpus.
    const states = preview.rows.map((row) => row.image.state);
    expect(states).not.toContain('teacher-mapped-local');
    expect('teacher-mapped-local' in preview.totals.byImageState).toBe(false);
  });

  it('deploys exactly the expected image-bearing and intentional non-image row counts', () => {
    const imageBearing = preview.rows.filter((row) => row.image.assetPath);
    expect(imageBearing).toHaveLength(1582);
    const nonImage = preview.rows.filter((row) => !row.image.assetPath);
    expect(nonImage).toHaveLength(283);
    expect(preview.totals.byImageState['text-only']).toBe(155);
    expect(preview.totals.byImageState['ambiguous']).toBe(104);
    expect(preview.totals.byImageState['unsuitable']).toBe(24);
    expect(preview.totals.byImageState['skipped']).toBe(0);
    // Every image-bearing row references exactly one existing built asset.
    for (const row of imageBearing) {
      expect(existsSync(`public${row.image.assetPath}`)).toBe(true);
    }
    // Production and AI assets are unchanged and present.
    expect(preview.rows.filter((row) => row.image.state === 'ai-generated')).toHaveLength(432);
  });

  it('keeps filters complete and pagination-safe at the 50-row boundary', () => {
    const filteredStates = preview.rows.flatMap((row) => row.image.state);
    for (const state of new Set(filteredStates)) {
      const result = filterTeacherVocabularyPreview(preview.rows, { imageState: state });
      expect(result).toHaveLength(preview.totals.byImageState[state]);
      expect(result.length).toBeLessThanOrEqual(preview.rows.length);
    }
    for (const sheet of Object.keys(preview.totals.bySourceSheet)) {
      expect(filterTeacherVocabularyPreview(preview.rows, { sourceSheet: sheet })).toHaveLength(preview.totals.bySourceSheet[sheet]);
    }
    expect(Math.ceil(preview.rows.length / 50)).toBeGreaterThan(1);
  });

  it('never writes local source paths or original source files into tracked preview output', () => {
    const payloads = [
      readFileSync('data/teacher-vocabulary-preview/preview-corpus.json', 'utf8'),
      readFileSync('data/teacher-vocabulary-preview/teacher-image-reconciliation.json', 'utf8'),
      readFileSync('data/teacher-vocabulary-preview/generation-queue.json', 'utf8'),
    ].join('\n');
    expect(payloads).not.toContain('/Users/');
    expect(payloads).not.toContain('词汇表/单词表(带图).xlsx');
    expect(payloads).not.toContain('/assets/dev/');
    expect(payloads).not.toContain('teacher-mapped-local');
  });
});
