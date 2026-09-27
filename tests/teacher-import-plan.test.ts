import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type JsonRecord = Record<string, unknown>;

type TeacherRow = {
  id: string;
  simplified: string;
  pinyin: string;
  japanese: string;
  curriculum: {
    sourceId: string;
    difficultyBand: string;
    sourceDifficultyLabel: string;
    partOfSpeech: string;
    sourceSheet: string;
    sourceRow: number;
    [key: string]: unknown;
  };
  source?: JsonRecord;
  reviewStatus?: string;
  [key: string]: unknown;
};

type TeacherBatch = { vocabulary: TeacherRow[] };
type TeacherImportManifest = {
  sourceFile: string;
  sourceChecksumSha256: string;
  sourceId: string;
  totalRows: number;
  accepted: number;
  rejected: number;
  duplicateDiagnostics: unknown[];
  rejectedRows: { sheet: string; row: number; reason: string }[];
  acceptedItems: {
    vocabularyId: string;
    sourceSheet: string;
    sourceRow: number;
  }[];
  batches: { sourceRows: { id: string; sheet: string; row: number }[] }[];
};

type SourceProfile = {
  schemaVersion: string;
  source: { filename: string; driveFileId: string; sizeBytes: number; sha256: string };
  sourceSemantics: { curriculum: string; hskRelationship: string };
  rights: { authority: string; scope: string[]; attribution: string; relicensing: string };
  productDecision: { authority: string; authorization: string };
  toolchain: { parser: string; parserSha256: string; lockfile: string; lockfileSha256: string };
  headers: {
    workbookSheetOrder: string[];
    dataSheetHeaders: Record<string, unknown[]>;
    separatorSheetHeaders: Record<string, unknown[]>;
    oneBasedResolvedColumns: Record<string, unknown>;
    blankLeadingCells: number;
    trailingBlankCellsTrimmed: number;
  };
  diagnostic: { candidateCount: number; accepted: number; rejected: number; batchCount: number };
  artifacts: {
    manifest: { path: string; sha256: string };
    sourceBatch: { path: string; sha256: string; recordCount: number; maximumPerBatch: number };
  };
  productionReconciliation: {
    currentSourceBatch: string;
    currentSourceBatchSha256: string;
    currentBatchCount: number;
    japaneseGlossDifferences: number;
    learnerCorpus: { manifest: string; sha256: string; rows: number };
  };
  runtimeBoundary: string;
  separateHskGate: string;
};

const profilePath = 'data/teacher-import/teacher-core-v1/source-profile.json';
const manifestPath = 'data/teacher-import/teacher-core-v1/manifest.json';
const sourceBatchPath = 'data/teacher-import/teacher-core-v1/teacher-vocabulary-batch-01.json';
const productionBatchPath = 'data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json';
const learnerManifestPath = 'data/teacher-vocabulary-preview/learner-manifest.json';
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as SourceProfile;
const importManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as TeacherImportManifest;
const sourceBatch = JSON.parse(fs.readFileSync(sourceBatchPath, 'utf8')) as TeacherBatch;
const productionBatch = JSON.parse(fs.readFileSync(productionBatchPath, 'utf8')) as TeacherBatch;
const learnerManifest = JSON.parse(fs.readFileSync(learnerManifestPath, 'utf8')) as { rows: unknown[] };

function sha256(path: string): string {
  return createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

function coordinate(sheet: string, row: number): string {
  return `${sheet}:${row}`;
}

const expectedGlossDifferenceIds = [
  'teacher-star-1-37e0eb213f0f',
  'teacher-star-1-a66948a76fda',
  'teacher-star-1-86f5cdb6e25c',
  'teacher-star-1-bdc7865a507e',
  'teacher-star-1-86367b2d53f6',
  'teacher-star-1-e7bc12c4f23a',
  'teacher-star-1-e64490a207eb',
  'teacher-star-1-3e6fabf09358',
  'teacher-star-1-1c0cdf0b2b9c',
  'teacher-star-1-8fea4ac29b4c',
  'teacher-star-1-94757170c2b0',
];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:ts|astro)$/.test(entry.name) ? [fullPath] : [];
  });
}

function hasHskMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasHskMetadata);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => /hsk|standardVersion|introducedAtLevel|sourceLevelLabel/i.test(key) || hasHskMetadata(child));
}

describe('teacher-only #81 source reconciliation', () => {
  it('pins exact source, rights scope, semantics, parser and authoring evidence hashes', () => {
    expect(profile.schemaVersion).toBe('teacher-source-profile-v1');
    expect(profile.source).toEqual({
      filename: '单词表(带图).xlsx',
      driveFileId: '1oOel762eE093e7Ni9_KILPY19J9i0H_8',
      sizeBytes: 144849,
      sha256: '3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37',
      storage: 'authoring-only; workbook binary and local path are not committed',
    });
    expect(profile.rights.authority).toBe('https://github.com/nurockplayer/Chabiko/issues/81#issuecomment-5853229347');
    expect(profile.rights.scope).toEqual([
      'original teacher-authored workbook text',
      'Chabiko product use',
      'deterministic transformation',
      'repository storage',
      'Chabiko publication and distribution',
    ]);
    expect(profile.rights.attribution).toContain('No additional attribution');
    expect(profile.rights.relicensing).toContain('No broader relicensing');
    expect(profile.productDecision.authority).toBe('https://github.com/nurockplayer/Chabiko/issues/81#issuecomment-5853390946');
    expect(profile.sourceSemantics.hskRelationship).toContain('none');
    expect(profile.sourceSemantics.hskRelationship).toContain('do not indicate or imply');
    expect(profile.toolchain.parserSha256).toBe(sha256(profile.toolchain.parser));
    expect(profile.toolchain.lockfileSha256).toBe(sha256(profile.toolchain.lockfile));
    expect(profile.headers.workbookSheetOrder).toEqual(['難易度☆', '名词1', '动词1', '形容词1', '副词', '難易度☆☆', '名词2', '形容词2', '动词2']);
    expect(profile.headers.dataSheetHeaders['名词1']).toEqual([null, '名词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.dataSheetHeaders['动词1']).toEqual([null, '动词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.dataSheetHeaders['形容词1']).toEqual([null, '形容词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.dataSheetHeaders['副词']).toEqual([null, '副词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.dataSheetHeaders['名词2']).toEqual([null, '名词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.dataSheetHeaders['形容词2']).toEqual([null, '形容词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.dataSheetHeaders['动词2']).toEqual([null, '动词', '单词', '拼音', '难易度', '日语翻译', '造词/造句', '日文字', '备注']);
    expect(profile.headers.separatorSheetHeaders).toEqual({ '難易度☆': [], '難易度☆☆': [] });
    expect(profile.headers.oneBasedResolvedColumns).toEqual({ simplified: 3, pinyin: 4, difficulty_check: 5, japanese: 6, example: 7, ignored: ['日文字:8', '备注:9'] });
    expect(profile.headers.blankLeadingCells).toBe(1);
    expect(profile.headers.trailingBlankCellsTrimmed).toBe(0);
    expect(profile.artifacts.manifest.sha256).toBe(sha256(manifestPath));
    expect(profile.artifacts.sourceBatch.sha256).toBe(sha256(sourceBatchPath));
    expect(profile.productionReconciliation.currentSourceBatchSha256).toBe(sha256(productionBatchPath));
    expect(profile.productionReconciliation.learnerCorpus.sha256).toBe(sha256(learnerManifestPath));
    expect(profile.artifacts.sourceBatch.recordCount).toBe(20);
    expect(profile.artifacts.sourceBatch.maximumPerBatch).toBeLessThanOrEqual(50);
    expect(profile.runtimeBoundary).toContain('authoring evidence only');

    const serialized = [profile, importManifest, sourceBatch].map(value => JSON.stringify(value)).join('\n');
    expect(serialized).not.toMatch(/\/Users\/|\/private\/var\/|\/tmp\//);
    expect(fs.readFileSync('docs/content/hsk-import-plan.md', 'utf8')).toContain('Issue #73 owns the separate HSK source package gate');
  });

  it('accounts for each source row once across accepted and rejected diagnostics', () => {
    expect(importManifest.sourceFile).toBe(profile.source.filename);
    expect(importManifest.sourceChecksumSha256).toBe(profile.source.sha256);
    expect(importManifest.sourceId).toBe('teacher-core-v1');
    expect(importManifest.totalRows).toBe(1865);
    expect(importManifest.accepted).toBe(20);
    expect(importManifest.rejected).toBe(1845);
    expect(importManifest.accepted + importManifest.rejected).toBe(importManifest.totalRows);
    expect(importManifest.rejectedRows).toHaveLength(importManifest.rejected);
    expect(importManifest.duplicateDiagnostics).toHaveLength(0);

    const accepted = importManifest.acceptedItems.map(item => coordinate(item.sourceSheet, item.sourceRow));
    const rejected = importManifest.rejectedRows.map(item => {
      expect(item.reason).toContain(item.sheet);
      expect(item.reason).toContain(String(item.row));
      return coordinate(item.sheet, item.row);
    });
    const all = [...accepted, ...rejected];
    expect(new Set(all).size).toBe(importManifest.totalRows);
    expect(new Set(accepted).size).toBe(20);
    expect(new Set(rejected).size).toBe(1845);
    expect(importManifest.batches).toHaveLength(1);
    expect(importManifest.batches[0].sourceRows.map(row => coordinate(row.sheet, row.row))).toEqual(accepted);
  });

  it('keeps the exact first source slice separate from its enriched production glosses', () => {
    expect(sourceBatch.vocabulary).toHaveLength(20);
    expect(productionBatch.vocabulary).toHaveLength(20);
    expect(sourceBatch.vocabulary.map(row => row.id)).toEqual(productionBatch.vocabulary.map(row => row.id));
    expect(sourceBatch.vocabulary.map(row => coordinate(row.curriculum.sourceSheet, row.curriculum.sourceRow)))
      .toEqual(productionBatch.vocabulary.map(row => coordinate(row.curriculum.sourceSheet, row.curriculum.sourceRow)));

    for (const [index, source] of sourceBatch.vocabulary.entries()) {
      const production = productionBatch.vocabulary[index];
      expect(source.curriculum).toMatchObject({
        sourceId: production.curriculum.sourceId,
        difficultyBand: production.curriculum.difficultyBand,
        sourceDifficultyLabel: production.curriculum.sourceDifficultyLabel,
        partOfSpeech: production.curriculum.partOfSpeech,
        sourceSheet: production.curriculum.sourceSheet,
        sourceRow: production.curriculum.sourceRow,
      });
      expect(source.simplified).toBe(production.simplified);
      expect(source.pinyin).toBe(production.pinyin);
      expect(Object.hasOwn(source, 'traditional')).toBe(false);
      expect(source.reviewStatus).toBe('draft');
    }

    const mismatches = sourceBatch.vocabulary
      .filter((source, index) => source.japanese !== productionBatch.vocabulary[index].japanese)
      .map(row => row.id);
    expect(mismatches).toEqual(expectedGlossDifferenceIds);
    expect(mismatches).toHaveLength(profile.productionReconciliation.japaneseGlossDifferences);
    for (const production of productionBatch.vocabulary) {
      expect(production.reviewStatus).toBe('draft');
      expect(production.source?.note).toBe('AI provisional first pass; corrections expected.');
    }
    expect(hasHskMetadata(sourceBatch)).toBe(false);
    expect(hasHskMetadata(importManifest)).toBe(false);
    expect(learnerManifest.rows).toHaveLength(1582);
  });

  it('preserves both existing runtime loading boundaries', async () => {
    const legacy = await import('../src/content/loadTeacherVocabulary');
    const teacherItems = legacy.loadTeacherVocabulary();
    expect(teacherItems).toHaveLength(20);
    expect(teacherItems.map(item => item.vocabulary.id)).toEqual(productionBatch.vocabulary.map(row => row.id));

    const learner = await import('../src/content/loadProductionLearnerCorpus');
    const corpus = learner.loadProductionLearnerCorpus({ assetTracked: () => true });
    expect(corpus).toHaveLength(1582);
    expect(fs.readFileSync('src/content/loadTeacherVocabulary.ts', 'utf8')).toContain('../../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json');
    expect(fs.readFileSync('src/content/loadTeacherVocabulary.ts', 'utf8')).not.toContain('teacher-import/teacher-core-v1');
    expect(fs.readFileSync('src/content/loadProductionLearnerCorpus.ts', 'utf8')).toContain('learner-manifest.json');
    expect(fs.readFileSync('src/content/loadProductionLearnerCorpus.ts', 'utf8')).not.toContain('teacher-import/teacher-core-v1');
    const authoringImports = sourceFiles('src').filter(file => fs.readFileSync(file, 'utf8').includes('teacher-import/teacher-core-v1'));
    expect(authoringImports).toEqual([]);
  });

  it('runs the documented importer self-test, including real CLI dirty-output behavior', () => {
    const result = spawnSync('uv', [
      'run', '--locked', 'python', 'scripts/import-teacher-vocabulary-xlsx.py', '--test',
    ], { encoding: 'utf8', timeout: 120_000 });
    expect(result.error?.message).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('Documented CLI and dirty-output preservation ... PASS');
  }, 120_000);
});
