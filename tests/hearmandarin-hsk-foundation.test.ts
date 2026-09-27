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
  datasetSha256: string;
  intendedCount: number;
  primaryLevelCounts: Record<string, number>;
  eligibleCount: number;
  eligibleLevelCounts: Record<string, number>;
  eligibleProjectionSha256: string;
  blocked: Array<{ globalSequence: number; reasons: string[] }>;
  supplementarySourceLevelLabels: Record<string, string>;
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

interface ManifestAccounting {
  sourceCandidates: number;
  eligible: number;
  blocked: number;
  eligibleLevelCounts: Record<string, number>;
  primaryLevelCounts: Record<string, number>;
  repeatedWordPinyinGroupsWhollyBlocked: number;
  repeatedWordPinyinRowsBlocked: number;
  excludedFieldDiscrepancies: Array<{ globalSequence: number; retained: boolean }>;
  supplementarySourceLevelLabels: number;
}

interface HskManifest {
  source: { termsUrl: string; artifactScopeRationale: string; jsonSha256: string };
  accounting: ManifestAccounting;
  officialCoordinateVerification: { eligibleProjectionSha256: string };
  publication: {
    repositoryPublishedBatchCount: number;
    firstBatchFile: string;
    firstBatchRecords: number;
    firstBatchPrimaryLevel: number;
    subsequentBatchMaximum: number;
    batchSha256: string;
    sourceEligibleIsHumanReviewed: boolean;
    sourceEligibleIsRuntimeAvailable: boolean;
  };
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

interface FoundationArtifacts {
  manifest: HskManifest;
  receipt: VerificationReceipt;
  japanese: { authoring: Record<string, unknown>; records: JapaneseDraft[] };
  batch: { vocabulary: VocabularyRecord[] };
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
const immutablePlanSha256 = '7a1dd56a17d6d973600bcaa487035108dd61ede3b488ff88dff60c3a1a1c4bd3';
const batch = readJson<{ vocabulary: VocabularyRecord[] }>(batchPath);

function requireInvariant(condition: boolean, invariant: string): asserts condition {
  if (!condition) throw new Error(`manifest invariant: ${invariant}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertFoundation(artifacts: FoundationArtifacts): void {
  const { manifest: candidate, receipt: proof, japanese: companion, batch: published } = artifacts;
  const blockedBySequence = new Map(proof.blocked.map((row) => [row.globalSequence, row.reasons]));
  const supplementaryLabels = proof.supplementarySourceLevelLabels;
  const recordIds = new Set<string>();
  const sourceIds = new Set<string>();

  requireInvariant(candidate.rows.length === 2000, 'row-count');
  requireInvariant(candidate.rows.every((row, index) => row.globalSequence === index + 1), 'global-sequence-order');
  requireInvariant(new Set(candidate.rows.map((row) => row.globalSequence)).size === 2000, 'unique-global-sequences');
  for (const row of candidate.rows) {
    requireInvariant(typeof row.sourceId === 'string' && row.sourceId.length > 0, 'nonempty-source-id');
    requireInvariant(!sourceIds.has(row.sourceId), 'unique-source-ids');
    sourceIds.add(row.sourceId);
    requireInvariant(typeof row.recordId === 'string' && row.recordId.length > 0, 'nonempty-record-id');
    requireInvariant(!recordIds.has(row.recordId), 'unique-record-ids');
    recordIds.add(row.recordId);
    requireInvariant(row.recordId === `hm-hsk3-${row.sourceId}`, 'record-id-source-join');

    const expectedBlockedReasons = blockedBySequence.get(row.globalSequence);
    const isEligible = expectedBlockedReasons === undefined;
    requireInvariant(row.sourceEligible === isEligible && row.disposition === (isEligible ? 'eligible' : 'blocked'), 'eligibility-disposition');
    requireInvariant(row.sourceLevelLabel === (supplementaryLabels[String(row.globalSequence)] ?? String(row.primaryLevel)), 'source-level-label');
    if (isEligible) {
      requireInvariant(typeof row.simplified === 'string' && row.simplified.length > 0, 'eligible-simplified-present');
      requireInvariant(typeof row.pinyin === 'string' && row.pinyin.length > 0, 'eligible-pinyin-present');
      requireInvariant(row.blockedReason === undefined, 'eligible-has-no-blocked-reason');
    } else {
      requireInvariant(sameJson(row.blockedReason, expectedBlockedReasons), 'blocked-reasons-match-receipt');
      requireInvariant(row.simplified === undefined && row.pinyin === undefined, 'blocked-fields-omitted');
    }
  }

  const eligibleRows = candidate.rows.filter((row) => row.sourceEligible);
  const blockedRows = candidate.rows.filter((row) => !row.sourceEligible);
  requireInvariant(proof.intendedCount === 2000 && candidate.accounting.sourceCandidates === proof.intendedCount, 'candidate-count');
  requireInvariant(candidate.source.jsonSha256 === proof.datasetSha256, 'manifest-source-receipt-identity');
  requireInvariant(blockedRows.length === proof.blocked.length && eligibleRows.length === proof.eligibleCount, 'receipt-eligibility-counts');
  requireInvariant(sameJson(blockedRows.map((row) => [row.globalSequence, row.blockedReason]), proof.blocked.map((row) => [row.globalSequence, row.reasons])), 'quarantine-coordinates-match-receipt');
  requireInvariant(candidate.accounting.blocked === blockedRows.length && candidate.accounting.eligible === eligibleRows.length, 'manifest-accounting');
  requireInvariant(candidate.accounting.repeatedWordPinyinGroupsWhollyBlocked === 8, 'repeated-word-pinyin-group-count');
  requireInvariant(candidate.accounting.repeatedWordPinyinRowsBlocked === 16, 'repeated-word-pinyin-row-count');
  requireInvariant(sameJson(candidate.accounting.excludedFieldDiscrepancies, proof.excludedFieldDiscrepancies), 'excluded-field-discrepancies');

  const primaryCounts = Object.fromEntries([1, 2, 3, 4].map((level) => [String(level), candidate.rows.filter((row) => row.primaryLevel === level).length]));
  const eligibleLevelCounts = Object.fromEntries([1, 2, 3, 4].map((level) => [String(level), eligibleRows.filter((row) => row.primaryLevel === level).length]));
  requireInvariant(sameJson(primaryCounts, proof.primaryLevelCounts), 'receipt-primary-level-counts');
  requireInvariant(sameJson(eligibleLevelCounts, proof.eligibleLevelCounts), 'receipt-eligible-level-counts');
  requireInvariant(sameJson(candidate.accounting.primaryLevelCounts, proof.primaryLevelCounts), 'manifest-primary-level-counts');
  requireInvariant(sameJson(candidate.accounting.eligibleLevelCounts, proof.eligibleLevelCounts), 'manifest-eligible-level-counts');
  requireInvariant(Object.keys(supplementaryLabels).length === candidate.accounting.supplementarySourceLevelLabels, 'supplementary-label-count');

  const projection = eligibleRows.map((row) => [row.sourceId, row.globalSequence, row.primaryLevel, row.simplified, row.pinyin]);
  const projectionSha256 = createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex');
  requireInvariant(projectionSha256 === proof.eligibleProjectionSha256, 'eligible-projection-sha256');
  requireInvariant(candidate.officialCoordinateVerification.eligibleProjectionSha256 === projectionSha256, 'manifest-eligible-projection-sha256');

  const immutablePlan = candidate.rows.map((row) => [
    row.recordId,
    row.sourceId,
    row.globalSequence,
    row.primaryLevel,
    row.sourceLevelLabel,
    row.sourceEligible,
    row.batchPlacement,
    row.disposition,
    row.blockedReason ?? [],
  ]);
  const planSha256 = createHash('sha256').update(JSON.stringify(immutablePlan), 'utf8').digest('hex');
  requireInvariant(planSha256 === immutablePlanSha256, 'immutable-plan-sha256');

  const firstBatch = eligibleRows.slice(0, 20);
  const firstBatchSequences = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  requireInvariant(sameJson(firstBatch.map((row) => row.globalSequence), firstBatchSequences), 'first-batch-sequences');
  requireInvariant(firstBatch.every((row) => row.primaryLevel === 1 && row.batchPlacement === 'batch-001'), 'first-batch-placement');
  const firstBatchSequencesSet = new Set(firstBatch.map((row) => row.globalSequence));
  for (const row of candidate.rows) {
    const expectedPublication = !row.sourceEligible
      ? 'blocked'
      : firstBatchSequencesSet.has(row.globalSequence)
        ? 'draft-batch-001'
        : 'planned-not-published';
    requireInvariant(row.repositoryPublication === expectedPublication, 'repository-publication-consistency');
    requireInvariant(row.sourceEligible || row.batchPlacement === null, 'blocked-row-has-batch-placement');
    requireInvariant(row.sourceEligible || row.repositoryPublication === 'blocked', 'blocked-row-publication');
  }
  requireInvariant(candidate.publication.repositoryPublishedBatchCount === 1, 'repository-published-batch-count');
  requireInvariant(candidate.publication.firstBatchFile === 'hsk-vocabulary-batch-001.json', 'first-batch-file');
  requireInvariant(candidate.publication.firstBatchRecords === 20 && published.vocabulary.length === 20, 'first-batch-count');
  requireInvariant(candidate.publication.firstBatchPrimaryLevel === 1, 'first-batch-level');
  requireInvariant(candidate.publication.subsequentBatchMaximum === 50, 'subsequent-batch-maximum');
  requireInvariant(candidate.publication.sourceEligibleIsHumanReviewed === false, 'source-eligibility-is-not-human-review');
  requireInvariant(candidate.publication.sourceEligibleIsRuntimeAvailable === false, 'source-eligibility-is-not-runtime-availability');

  for (const row of eligibleRows.filter((entry) => !firstBatchSequencesSet.has(entry.globalSequence))) {
    requireInvariant(row.batchPlacement !== null && row.batchPlacement !== 'batch-001', 'planned-eligible-placement');
  }
  const plans = new Map<string, ManifestRow[]>();
  for (const row of eligibleRows) {
    if (row.batchPlacement === null) throw new Error('manifest invariant: eligible-placement-present');
    const group = plans.get(row.batchPlacement) ?? [];
    group.push(row);
    plans.set(row.batchPlacement, group);
  }
  for (const [name, group] of plans) {
    requireInvariant(group.length <= (name === 'batch-001' ? 20 : 50), `batch-size-${name}`);
    requireInvariant(new Set(group.map((row) => row.primaryLevel)).size === 1, `single-level-batch-${name}`);
    requireInvariant(group.every((row, index) => index === 0 || group[index - 1].globalSequence < row.globalSequence), `ordered-batch-${name}`);
  }

  requireInvariant(companion.records.length === 20, 'japanese-first-batch-count');
  for (const [index, row] of firstBatch.entries()) {
    const japaneseRow = companion.records[index];
    const batchRow = published.vocabulary[index];
    requireInvariant(japaneseRow.sourceId === row.sourceId && japaneseRow.globalSequence === row.globalSequence, `japanese-source-join-${index + 1}`);
    requireInvariant(japaneseRow.simplified === row.simplified && japaneseRow.pinyin === row.pinyin, `japanese-content-join-${index + 1}`);
    requireInvariant(batchRow.id === row.recordId, `batch-record-id-join-${index + 1}`);
    requireInvariant(batchRow.simplified === row.simplified && batchRow.pinyin === row.pinyin && batchRow.japanese === japaneseRow.japanese, `batch-content-join-${index + 1}`);
    requireInvariant(batchRow.hsk.standardVersion === 'hsk-3.0', `batch-hsk-standard-${index + 1}`);
    requireInvariant(batchRow.hsk.introducedAtLevel === row.primaryLevel, `batch-hsk-level-join-${index + 1}`);
    requireInvariant(batchRow.hsk.sourceLevelLabel === row.sourceLevelLabel, `batch-hsk-label-join-${index + 1}`);
  }
}

function serializedBatchSha256(candidate: { vocabulary: VocabularyRecord[] }): string {
  return createHash('sha256').update(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8').digest('hex');
}

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
    expect(() => assertFoundation({ manifest, receipt, japanese, batch })).not.toThrow();
    expect(createHash('sha256').update(readFileSync(path.join(root, batchPath))).digest('hex')).toBe(manifest.publication.batchSha256);
  });

  it('rejects independent manifest and first-batch drift copies through the same validators', () => {
    const cases: Array<{ name: string; invariant: string; mutate: (candidate: FoundationArtifacts) => void }> = [
      {
        name: 'Simplified content drift',
        invariant: 'eligible-projection-sha256',
        mutate: (candidate) => {
          const row = candidate.manifest.rows.find((entry) => entry.sourceEligible);
          if (!row) throw new Error('fixture lacks eligible rows');
          row.simplified = `${row.simplified ?? ''}改`;
        },
      },
      {
        name: 'pinyin content drift',
        invariant: 'eligible-projection-sha256',
        mutate: (candidate) => {
          const row = candidate.manifest.rows.find((entry) => entry.sourceEligible);
          if (!row) throw new Error('fixture lacks eligible rows');
          row.pinyin = `${row.pinyin ?? ''}x`;
        },
      },
      {
        name: 'duplicate record identity',
        invariant: 'unique-record-ids',
        mutate: (candidate) => {
          candidate.manifest.rows[1].recordId = candidate.manifest.rows[0].recordId;
        },
      },
      {
        name: 'duplicate opaque source identity',
        invariant: 'unique-source-ids',
        mutate: (candidate) => {
          candidate.manifest.rows[1].sourceId = candidate.manifest.rows[0].sourceId;
          candidate.manifest.rows[1].recordId = candidate.manifest.rows[0].recordId;
        },
      },
      {
        name: 'renamed blocked source identity',
        invariant: 'immutable-plan-sha256',
        mutate: (candidate) => {
          const row = candidate.manifest.rows.find((entry) => entry.disposition === 'blocked');
          if (!row) throw new Error('fixture lacks blocked rows');
          row.sourceId = 'renamed-opaque-publisher-id';
          row.recordId = `hm-hsk3-${row.sourceId}`;
        },
      },
      {
        name: 'swapped eligible placements',
        invariant: 'immutable-plan-sha256',
        mutate: (candidate) => {
          const planned = candidate.manifest.rows.filter((row) => row.sourceEligible && row.batchPlacement !== 'batch-001');
          const first = planned[0];
          const second = planned.find((row) => row.batchPlacement !== first?.batchPlacement);
          if (!first || !second) throw new Error('fixture lacks distinct planned placements');
          [first.batchPlacement, second.batchPlacement] = [second.batchPlacement, first.batchPlacement];
        },
      },
      {
        name: 'blocked row marked eligible',
        invariant: 'eligibility-disposition',
        mutate: (candidate) => {
          const row = candidate.manifest.rows.find((entry) => entry.disposition === 'blocked');
          if (!row) throw new Error('fixture lacks blocked rows');
          row.sourceEligible = true;
        },
      },
      {
        name: 'source label drift',
        invariant: 'source-level-label',
        mutate: (candidate) => {
          candidate.manifest.rows[0].sourceLevelLabel = 'incorrect-label';
        },
      },
      {
        name: 'quarantine reason drift',
        invariant: 'blocked-reasons-match-receipt',
        mutate: (candidate) => {
          const row = candidate.manifest.rows.find((entry) => entry.disposition === 'blocked');
          if (!row?.blockedReason) throw new Error('fixture lacks blocked reasons');
          row.blockedReason[0] = 'unverified-reason';
        },
      },
      {
        name: 'publication state drift',
        invariant: 'repository-publication-consistency',
        mutate: (candidate) => {
          const row = candidate.manifest.rows.find((entry) => entry.repositoryPublication === 'draft-batch-001');
          if (!row) throw new Error('fixture lacks published draft rows');
          row.repositoryPublication = 'planned-not-published';
        },
      },
      {
        name: 'first-batch Japanese source join drift',
        invariant: 'japanese-source-join-1',
        mutate: (candidate) => {
          candidate.japanese.records[0].sourceId = 'wrong-opaque-id';
        },
      },
      {
        name: 'first-batch repository source join drift',
        invariant: 'batch-record-id-join-1',
        mutate: (candidate) => {
          candidate.batch.vocabulary[0].id = 'hm-hsk3-wrong-opaque-id';
        },
      },
      {
        name: 'first-batch HSK level drift with recalculated batch hash',
        invariant: 'batch-hsk-level-join-1',
        mutate: (candidate) => {
          candidate.batch.vocabulary[0].hsk.introducedAtLevel = 2;
          candidate.manifest.publication.batchSha256 = serializedBatchSha256(candidate.batch);
        },
      },
      {
        name: 'first-batch HSK source label drift with recalculated batch hash',
        invariant: 'batch-hsk-label-join-1',
        mutate: (candidate) => {
          candidate.batch.vocabulary[0].hsk.sourceLevelLabel = 'incorrect-source-label';
          candidate.manifest.publication.batchSha256 = serializedBatchSha256(candidate.batch);
        },
      },
    ];

    for (const testCase of cases) {
      const candidate = JSON.parse(JSON.stringify({ manifest, receipt, japanese, batch })) as FoundationArtifacts;
      testCase.mutate(candidate);
      expect(() => assertFoundation(candidate), testCase.name).toThrow(`manifest invariant: ${testCase.invariant}`);
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
    expect(result.stdout).toContain('31 negative CLI probes');
    expect(result.stdout).toContain('clean/repeat/empty-dir CLI success');
  });
});
