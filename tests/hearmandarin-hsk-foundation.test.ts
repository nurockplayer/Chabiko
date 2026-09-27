import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface SourceProfile {
  dataset: {
    json: { sha256: string };
    jsonDownloadUrl: string;
    csvDownloadUrl: string;
    termsUrl: string;
    artifactScopeRationale: string;
  };
}

interface VerificationReceipt {
  eligibleProjectionSha256: string;
  blocked: Array<{ globalSequence: number; reasons: string[] }>;
  excludedFieldDiscrepancies: Array<{ globalSequence: number; retained: boolean }>;
}

interface JapaneseDraft {
  sourceId: string;
  globalSequence: number;
  simplified: string;
  pinyin: string;
  japanese: string;
}

interface ManifestRow {
  recordId: string;
  sourceId: string;
  globalSequence: number;
  primaryLevel: number;
  sourceLevelLabel: string;
  sourceEligible: boolean;
  repositoryPublication: string;
  batchPlacement: string | null;
  disposition: 'eligible' | 'blocked';
  blockedReason?: string[];
  simplified?: string;
  pinyin?: string;
}

interface HskManifest {
  source: { termsUrl: string; artifactScopeRationale: string };
  accounting: Record<string, number>;
  officialCoordinateVerification: { eligibleProjectionSha256: string };
  publication: { firstBatchPrimaryLevel: number; batchSha256: string };
  rows: ManifestRow[];
}

interface VocabularyRecord {
  id: string;
  pinyin: string;
  japanese: string;
  reviewStatus: string;
  simplified: string;
  simplifiedStatus: string;
  hsk: { standardVersion: string; introducedAtLevel: number; sourceLevelLabel: string };
  source: { type: string; note: string };
}

const root = process.cwd();
const importDir = 'data/hsk-import/hearmandarin-hsk-2025-v1';

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8')) as T;
}

const profile = readJson<SourceProfile>(path.join(importDir, 'source-profile.json'));
const receiptBytes = readFileSync(path.join(root, importDir, 'official-verification.json'));
const receipt = JSON.parse(receiptBytes.toString('utf8')) as VerificationReceipt;
const japanese = readJson<{ authoring: Record<string, unknown>; records: JapaneseDraft[] }>(path.join(importDir, 'first-batch-japanese.json'));
const manifest = readJson<HskManifest>(path.join(importDir, 'manifest.json'));
const batchPath = 'data/hsk-vocabulary/hsk-vocabulary-batch-001.json';
const batch = readJson<{ vocabulary: VocabularyRecord[] }>(batchPath);

describe('HearMandarin HSK source foundation', () => {
  it('pins the exact small receipt and records the bounded artifact-specific terms inference', () => {
    expect(createHash('sha256').update(receiptBytes).digest('hex')).toBe(
      'd084bb096f5ab6f2183a829308e002e23c3b9ef7c68658207c25e612103ca28e',
    );
    expect(profile.dataset.json.sha256).toBe('5b67eb8acc69d99654646e7226e57f6fb799c111d1ee67d778e1a2954128acc0');
    expect(profile.dataset.jsonDownloadUrl).toBe('https://hearmandarin.com/datasets/hsk-3-0-words.json');
    expect(profile.dataset.csvDownloadUrl).toBe('https://hearmandarin.com/datasets/hsk-3-0-words.csv');
    expect(profile.dataset.termsUrl).toBe('https://hearmandarin.com/terms/');
    expect(profile.dataset.artifactScopeRationale).toContain('not a legal determination');
    expect(profile.dataset.artifactScopeRationale).toContain('paid exports');
    expect(manifest.source.termsUrl).toBe(profile.dataset.termsUrl);
    expect(manifest.source.artifactScopeRationale).toBe(profile.dataset.artifactScopeRationale);
    expect(manifest.accounting).toMatchObject({
      sourceCandidates: 2000,
      eligible: 1969,
      blocked: 31,
      repeatedWordPinyinGroupsWhollyBlocked: 8,
      repeatedWordPinyinRowsBlocked: 16,
      supplementarySourceLevelLabels: 90,
    });
    expect(receipt.excludedFieldDiscrepancies).toEqual([
      expect.objectContaining({ globalSequence: 948, retained: false }),
    ]);
  });

  it('accounts for each official coordinate once and places only the first 20 eligible rows in repository output', () => {
    expect(manifest.rows).toHaveLength(2000);
    expect(manifest.rows.map((row) => row.globalSequence)).toEqual(
      Array.from({ length: 2000 }, (_, index) => index + 1),
    );
    expect(manifest.rows.filter((row) => row.disposition === 'blocked')).toHaveLength(31);
    expect(manifest.rows.filter((row) => row.repositoryPublication === 'draft-batch-001')).toHaveLength(20);
    expect(manifest.rows.filter((row) => row.disposition === 'eligible')).toHaveLength(1969);
    expect(manifest.rows.filter((row) => row.disposition === 'blocked').every(
      (row) => !('simplified' in row) && !('pinyin' in row) && Array.isArray(row.blockedReason),
    )).toBe(true);
    expect(manifest.rows.filter((row) => row.sourceLevelLabel.includes('（')).length).toBe(90);
    expect(manifest.rows.every((row) => row.recordId === `hm-hsk3-${row.sourceId}`)).toBe(true);
    expect(manifest.officialCoordinateVerification.eligibleProjectionSha256).toBe(receipt.eligibleProjectionSha256);
    expect(manifest.rows.filter((row) => row.disposition === 'blocked').map(
      (row) => [row.globalSequence, row.blockedReason],
    )).toEqual(receipt.blocked.map((row) => [row.globalSequence, row.reasons]));
    expect(Object.fromEntries([1, 2, 3, 4].map((level) => [
      String(level), manifest.rows.filter((row) => row.disposition === 'eligible' && row.primaryLevel === level).length,
    ]))).toEqual({ '1': 294, '2': 191, '3': 495, '4': 989 });
    expect(manifest.publication.firstBatchPrimaryLevel).toBe(1);
    expect(createHash('sha256').update(readFileSync(path.join(root, batchPath))).digest('hex')).toBe(manifest.publication.batchSha256);
    const plans = new Map<string, ManifestRow[]>();
    for (const row of manifest.rows.filter((entry) => entry.disposition === 'eligible')) {
      if (row.batchPlacement === null) throw new Error(`eligible row ${row.globalSequence} has no batch placement`);
      const group = plans.get(row.batchPlacement) ?? [];
      group.push(row);
      plans.set(row.batchPlacement, group);
    }
    expect(plans.get('batch-001')?.map((row) => row.globalSequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]);
    for (const [name, group] of plans) {
      expect(group.length, name).toBeLessThanOrEqual(name === 'batch-001' ? 20 : 50);
      expect(new Set(group.map((row) => row.primaryLevel)).size, name).toBe(1);
      expect(group.map((row) => row.globalSequence), name).toEqual([...group.map((row) => row.globalSequence)].sort((a, b) => a - b));
    }
  });

  it('keeps the first Japanese batch provisional and carries source credit and modification details per row', () => {
    expect(japanese.authoring).toMatchObject({
      status: 'ai-provisional',
      reviewStatus: 'draft',
      humanReview: false,
      excludedSourceFieldsUsed: [],
    });
    expect(japanese.records).toHaveLength(20);
    expect(batch.vocabulary).toHaveLength(20);
    expect(batch.vocabulary.map((row) => row.id)).toEqual(japanese.records.map((row) => `hm-hsk3-${row.sourceId}`));
    for (const [index, row] of batch.vocabulary.entries()) {
      const companion = japanese.records[index];
      expect(row.simplified).toBe(companion.simplified);
      expect(row.pinyin).toBe(companion.pinyin);
      expect(row.japanese).toBe(companion.japanese);
      expect(Object.keys(row).sort()).toEqual(['hsk', 'id', 'japanese', 'pinyin', 'reviewStatus', 'simplified', 'simplifiedStatus', 'source']);
      expect(Object.keys(row.hsk).sort()).toEqual(['introducedAtLevel', 'sourceLevelLabel', 'standardVersion']);
      expect(row.reviewStatus).toBe('draft');
      expect(row.simplifiedStatus).toBe('authored');
      expect(row).not.toHaveProperty('traditional');
      expect(row.source.note).toContain('https://creativecommons.org/licenses/by/4.0/');
      expect(row.source.note).toContain('https://hearmandarin.com/terms/');
      expect(row.source.note).toContain('AI-authored and provisional');
      expect(row.source.note).toContain('not a legal determination');
    }
  });

  it('passes the existing vocabulary and script-status validators without changing their contracts', () => {
    execFileSync('python3', ['scripts/validate-content-schema.py', '--check', batchPath], { cwd: root, stdio: 'pipe' });
    execFileSync('python3', ['scripts/validate-script-status.py', '--check', batchPath], { cwd: root, stdio: 'pipe' });
  });

  it('self-tests the actual CLI, clean repeat, and fail-closed dirty and drift cases', () => {
    const result = spawnSync('python3', ['scripts/import-hearmandarin-hsk-json.py', '--self-test'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('clean CLI repeat');
    expect(result.stdout).toContain('dirty output preservation');
    expect(result.stdout).toContain('duplicate coordinates');
    expect(result.stdout).toContain('symlink output rejection');
  });
});
