import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface SourceProfile {
  profileVersion: number;
  expectedSourceMetadata: Record<string, string | number>;
  coordinate: { expectedLevelCounts: Record<string, number> };
  counts: {
    sourceCandidates: number;
    eligible: number;
    blocked: number;
    firstBatch: number;
    eligibleLevelCounts: Record<string, number>;
    duplicateGroups: number;
    duplicateRows: number;
    supplementarySourceLevelLabels: number;
  };
  plannedBatches: {
    repositoryPublishedBatches?: number;
    firstBatch: string;
    firstBatchPrimaryLevel: number;
    subsequentMaxRows: number;
    subsequentOrdering: string;
  };
  dataset: {
    publisher: string;
    datasetName: string;
    datasetVersion: string;
    generated: string;
    downloadPageVersionLabel: string;
    homepage: string;
    json: { sha256: string };
    jsonDownloadUrl: string;
    csvDownloadUrl: string;
    provenance: string;
    disclaimer: string;
    termsUrl: string;
    termsSummary: string;
    attribution: string;
    license: string;
    licenseUrl: string;
    modificationNotice: string;
    excludedFields: string[];
    artifactScopeRationale: string;
    sourceCoordinateVerification: {
      receiptSha256: string;
      page: string;
      officialArtifactSha256: string;
      scope: string;
    };
  };
}

interface PublicationIndex {
  publicationIndexVersion: number;
  placements: string[];
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
  repositoryBatchFile?: string;
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
  excludedFieldDiscrepancies: Array<{ globalSequence: number; pdfPage: number; field: string; reason: string; retained: boolean }>;
  supplementarySourceLevelLabels: number;
}

interface HskManifest {
  manifestVersion: number;
  source: Record<string, unknown>;
  accounting: ManifestAccounting;
  officialCoordinateVerification: {
    authorityUrl: string;
    artifactSha256: string;
    receiptSha256: string;
    intendedCount: number;
    eligibleProjectionSha256: string;
    scope: string;
  };
  publication: {
    batches: Array<{ placement: string; file: string; records: number; primaryLevel: number; sha256: string }>;
    repositoryPublishedBatchCount: number;
    repositoryPublishedRecordCount: number;
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
  profile: SourceProfile;
  publicationIndex: PublicationIndex;
  manifest: HskManifest;
  receipt: VerificationReceipt;
  receiptBytes: Uint8Array;
  companions: Record<string, { authoring: Record<string, unknown>; records: JapaneseDraft[] }>;
  batches: Record<string, { vocabulary: VocabularyRecord[] }>;
  batchBytes: Record<string, Uint8Array>;
  companionFiles: string[];
  batchFiles: string[];
}

const root = process.cwd();
const importDir = 'data/hsk-import/hearmandarin-hsk-2025-v1';

function readJson<T>(relativePath: string): T {
  const json = readFileSync(path.join(root, relativePath), 'utf8');
  assertStrictJson(json);
  return JSON.parse(json) as T;
}

function assertStrictJson(json: string): void {
  const validator = [
    'import json, sys',
    'def unique_object(pairs):',
    '    result = {}',
    '    for key, value in pairs:',
    '        if key in result:',
    '            raise ValueError("duplicate JSON key: " + key)',
    '        result[key] = value',
    '    return result',
    'json.load(sys.stdin, object_pairs_hook=unique_object)',
  ].join('\n');
  execFileSync('python3', ['-c', validator], { input: json, cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
}

const profile = readJson<SourceProfile>(path.join(importDir, 'source-profile.json'));
const publicationIndexBytes = readFileSync(path.join(root, importDir, 'publication-index.json'));
const publicationIndex = readJson<PublicationIndex>(path.join(importDir, 'publication-index.json'));
const receiptBytes = readFileSync(path.join(root, importDir, 'official-verification.json'));
assertStrictJson(receiptBytes.toString('utf8'));
const receipt = JSON.parse(receiptBytes.toString('utf8')) as VerificationReceipt;
const japanese = readJson<{ authoring: Record<string, unknown>; records: JapaneseDraft[] }>(path.join(importDir, 'first-batch-japanese.json'));
const manifest = readJson<HskManifest>(path.join(importDir, 'manifest.json'));
const batchPath = 'data/hsk-vocabulary/hsk-vocabulary-batch-001.json';
const immutablePlanSha256 = '7a1dd56a17d6d973600bcaa487035108dd61ede3b488ff88dff60c3a1a1c4bd3';
const immutableFirstBatchSha256 = '76a5666ca2fc9aa5fbece6113c0b3b3bfd6e25eda7ffceb6934880f97591a23e';
const batch = readJson<{ vocabulary: VocabularyRecord[] }>(batchPath);

function expectedBatchFilename(placement: string): string {
  if (placement === 'batch-001') return 'hsk-vocabulary-batch-001.json';
  const match = /^planned-level-([1-4])-batch-(\d{3})$/.exec(placement);
  if (!match) throw new Error(`invalid placement in test artifact: ${placement}`);
  return `hsk-vocabulary-level-${match[1]}-batch-${match[2]}.json`;
}

function expectedCompanionFilename(placement: string): string {
  if (placement === 'batch-001') return 'first-batch-japanese.json';
  return `japanese/level-${placement.slice('planned-level-'.length)}.json`;
}

const importRoot = path.join(root, importDir);
const importJapaneseDir = path.join(importRoot, 'japanese');
const companionFiles = [
  'first-batch-japanese.json',
  ...(existsSync(importJapaneseDir) ? readdirSync(importJapaneseDir).map((name) => `japanese/${name}`) : []),
].sort();
const batchDirectory = path.join(root, 'data/hsk-vocabulary');
const batchFiles = readdirSync(batchDirectory)
  .filter((name) => name.startsWith('hsk-vocabulary-batch-') || name.startsWith('hsk-vocabulary-level-'))
  .sort();
const foundationArtifacts: FoundationArtifacts = {
  profile,
  publicationIndex,
  manifest,
  receipt,
  receiptBytes,
  companions: Object.fromEntries(publicationIndex.placements.map((placement) => [
    placement,
    placement === 'batch-001'
      ? japanese
      : readJson(path.join(importDir, expectedCompanionFilename(placement))),
  ])),
  batches: Object.fromEntries(batchFiles.map((filename) => [filename, readJson(`data/hsk-vocabulary/${filename}`)])),
  batchBytes: Object.fromEntries(batchFiles.map((filename) => [filename, readFileSync(path.join(batchDirectory, filename))])),
  companionFiles,
  batchFiles,
};

function requireInvariant(condition: boolean, invariant: string): asserts condition {
  if (!condition) throw new Error(`manifest invariant: ${invariant}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return sameJson(leftKeys, rightKeys) && leftKeys.every((key) => sameJson(leftRecord[key], rightRecord[key]));
}

function expectedSourceNote(candidateProfile: SourceProfile, row: ManifestRow): string {
  const dataset = candidateProfile.dataset;
  return `Source: ${dataset.attribution}, ${dataset.datasetName} (${dataset.homepage}). `
    + `Publisher provenance and independence disclaimer: ${dataset.provenance}. `
    + `Publisher Terms: ${dataset.termsUrl}. ${dataset.artifactScopeRationale} `
    + `License: ${dataset.license} (${dataset.licenseUrl}). ${dataset.modificationNotice} `
    + `Japanese is independently AI-authored and provisional, not human reviewed. Source ID ${row.sourceId}; global sequence ${row.globalSequence}; `
    + `primary level ${row.primaryLevel}; source level label ${row.sourceLevelLabel}.`;
}

function producerPublicationIndexError(raw: string): string {
  const code = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("hsk_importer_under_test", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'try:',
    '    value = json.loads(sys.stdin.read(), object_pairs_hook=module._unique_object)',
    '    module._validate_publication_index_header(value)',
    'except Exception as error:',
    '    print(str(error), file=sys.stderr)',
    '    sys.exit(2)',
  ].join('\n');
  const result = spawnSync('python3', ['-c', code, path.join(root, 'scripts/import-hearmandarin-hsk-json.py')], {
    cwd: root,
    input: raw,
    encoding: 'utf8',
  });
  return result.status === 0 ? '' : result.stderr.trim();
}

function assertFoundation(artifacts: FoundationArtifacts): void {
  const { profile: candidateProfile, publicationIndex, manifest: candidate, receipt: proof } = artifacts;
  const blockedBySequence = new Map(proof.blocked.map((row) => [row.globalSequence, row.reasons]));
  const supplementaryLabels = proof.supplementarySourceLevelLabels;
  const recordIds = new Set<string>();
  const sourceIds = new Set<string>();

  requireInvariant(candidateProfile.profileVersion === 2, 'source-profile-version');
  requireInvariant(!Object.hasOwn(candidateProfile.plannedBatches, 'repositoryPublishedBatches'), 'mutable-profile-publication-count-removed');
  requireInvariant(candidateProfile.plannedBatches.firstBatch === expectedBatchFilename('batch-001')
    && candidateProfile.plannedBatches.firstBatchPrimaryLevel === 1
    && candidateProfile.plannedBatches.subsequentMaxRows === 50
    && candidateProfile.plannedBatches.subsequentOrdering === 'global-sequence-within-primary-level', 'profile-publication-plan');
  requireInvariant(publicationIndex.publicationIndexVersion === 1, 'publication-index-version');
  requireInvariant(sameJson(Object.keys(publicationIndex).sort(), ['placements', 'publicationIndexVersion']), 'publication-index-schema');
  requireInvariant(publicationIndex.placements.length > 0 && publicationIndex.placements[0] === 'batch-001', 'publication-index-first-placement');
  requireInvariant(new Set(publicationIndex.placements).size === publicationIndex.placements.length, 'publication-index-unique-placements');
  requireInvariant(candidate.manifestVersion === 2, 'manifest-version');
  requireInvariant(sameJson(Object.keys(candidate).sort(), ['accounting', 'manifestVersion', 'officialCoordinateVerification', 'publication', 'rows', 'source']), 'manifest-root-schema');
  requireInvariant(sameJson(Object.keys(candidate.source).sort(), [
    'artifactScopeRationale', 'attribution', 'csvDownloadUrl', 'datasetName', 'datasetVersion', 'disclaimerUrl', 'downloadPageVersionLabel',
    'excludedFields', 'generated', 'jsonDownloadUrl', 'jsonSha256', 'license', 'licenseUrl', 'modificationNotice', 'provenanceUrl',
    'publisher', 'sourceUrl', 'termsSummary', 'termsUrl',
  ]), 'manifest-source-schema');
  requireInvariant(sameJson(Object.keys(candidate.accounting).sort(), [
    'blocked', 'eligible', 'eligibleLevelCounts', 'excludedFieldDiscrepancies', 'primaryLevelCounts', 'repeatedWordPinyinGroupsWhollyBlocked',
    'repeatedWordPinyinRowsBlocked', 'sourceCandidates', 'supplementarySourceLevelLabels',
  ]), 'manifest-accounting-schema');
  requireInvariant(sameJson(Object.keys(candidate.officialCoordinateVerification).sort(), [
    'artifactSha256', 'authorityUrl', 'eligibleProjectionSha256', 'intendedCount', 'receiptSha256', 'scope',
  ]), 'manifest-official-provenance-schema');
  requireInvariant(sameJson(Object.keys(candidate.publication).sort(), [
    'batches', 'repositoryPublishedBatchCount', 'repositoryPublishedRecordCount', 'sourceEligibleIsHumanReviewed', 'sourceEligibleIsRuntimeAvailable',
  ]), 'manifest-publication-schema');
  requireInvariant(createHash('sha256').update(artifacts.receiptBytes).digest('hex') === candidateProfile.dataset.sourceCoordinateVerification.receiptSha256,
    'source-profile-receipt-sha256');
  requireInvariant(candidateProfile.dataset.json.sha256 === proof.datasetSha256 && candidate.source.jsonSha256 === proof.datasetSha256,
    'profile-manifest-receipt-source-identity');
  requireInvariant(candidateProfile.dataset.disclaimer === candidateProfile.dataset.provenance, 'profile-provenance-disclaimer-join');
  const sourceJoins: Array<[keyof HskManifest['source'], unknown]> = [
    ['publisher', candidateProfile.dataset.publisher],
    ['datasetName', candidateProfile.dataset.datasetName],
    ['datasetVersion', candidateProfile.dataset.datasetVersion],
    ['generated', candidateProfile.dataset.generated],
    ['downloadPageVersionLabel', candidateProfile.dataset.downloadPageVersionLabel],
    ['jsonDownloadUrl', candidateProfile.dataset.jsonDownloadUrl],
    ['csvDownloadUrl', candidateProfile.dataset.csvDownloadUrl],
    ['jsonSha256', candidateProfile.dataset.json.sha256],
    ['license', candidateProfile.dataset.license],
    ['licenseUrl', candidateProfile.dataset.licenseUrl],
    ['termsUrl', candidateProfile.dataset.termsUrl],
    ['termsSummary', candidateProfile.dataset.termsSummary],
    ['artifactScopeRationale', candidateProfile.dataset.artifactScopeRationale],
    ['attribution', candidateProfile.dataset.attribution],
    ['sourceUrl', candidateProfile.dataset.homepage],
    ['provenanceUrl', candidateProfile.dataset.provenance],
    ['disclaimerUrl', candidateProfile.dataset.disclaimer],
    ['modificationNotice', candidateProfile.dataset.modificationNotice],
    ['excludedFields', candidateProfile.dataset.excludedFields],
  ];
  for (const [key, value] of sourceJoins) requireInvariant(sameJson(candidate.source[key], value), `source-profile-manifest-${key}`);
  requireInvariant(candidate.officialCoordinateVerification.authorityUrl === candidateProfile.dataset.sourceCoordinateVerification.page
    && candidate.officialCoordinateVerification.artifactSha256 === candidateProfile.dataset.sourceCoordinateVerification.officialArtifactSha256
    && candidate.officialCoordinateVerification.receiptSha256 === candidateProfile.dataset.sourceCoordinateVerification.receiptSha256
    && candidate.officialCoordinateVerification.intendedCount === proof.intendedCount
    && candidate.officialCoordinateVerification.eligibleProjectionSha256 === proof.eligibleProjectionSha256
    && candidate.officialCoordinateVerification.scope === candidateProfile.dataset.sourceCoordinateVerification.scope,
  'profile-manifest-official-coordinate-provenance');

  requireInvariant(candidate.rows.length === 2000, 'row-count');
  requireInvariant(candidate.rows.every((row, index) => row.globalSequence === index + 1), 'global-sequence-order');
  requireInvariant(new Set(candidate.rows.map((row) => row.globalSequence)).size === 2000, 'unique-global-sequences');
  for (const row of candidate.rows) {
    const baseRowKeys = ['batchPlacement', 'disposition', 'globalSequence', 'primaryLevel', 'recordId', 'repositoryPublication', 'sourceEligible', 'sourceId', 'sourceLevelLabel'];
    const expectedRowKeys = !row.sourceEligible
      ? [...baseRowKeys, 'blockedReason']
      : publicationIndex.placements.includes(row.batchPlacement ?? '')
        ? [...baseRowKeys, 'pinyin', 'repositoryBatchFile', 'simplified']
        : [...baseRowKeys, 'pinyin', 'simplified'];
    requireInvariant(sameJson(Object.keys(row).sort(), expectedRowKeys.sort()), `manifest-row-schema-${row.globalSequence}`);
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
  requireInvariant(proof.intendedCount === 2000 && candidateProfile.counts.sourceCandidates === proof.intendedCount
    && candidate.accounting.sourceCandidates === proof.intendedCount, 'candidate-count');
  requireInvariant(candidate.source.jsonSha256 === proof.datasetSha256, 'manifest-source-receipt-identity');
  requireInvariant(blockedRows.length === proof.blocked.length && eligibleRows.length === proof.eligibleCount, 'receipt-eligibility-counts');
  requireInvariant(sameJson(blockedRows.map((row) => [row.globalSequence, row.blockedReason]), proof.blocked.map((row) => [row.globalSequence, row.reasons])), 'quarantine-coordinates-match-receipt');
  requireInvariant(candidate.accounting.blocked === blockedRows.length && candidate.accounting.eligible === eligibleRows.length
    && candidateProfile.counts.blocked === blockedRows.length && candidateProfile.counts.eligible === eligibleRows.length, 'manifest-accounting');
  requireInvariant(candidate.accounting.repeatedWordPinyinGroupsWhollyBlocked === candidateProfile.counts.duplicateGroups, 'repeated-word-pinyin-group-count');
  requireInvariant(candidate.accounting.repeatedWordPinyinRowsBlocked === candidateProfile.counts.duplicateRows, 'repeated-word-pinyin-row-count');
  requireInvariant(candidate.accounting.excludedFieldDiscrepancies.every((entry) => sameJson(Object.keys(entry).sort(), ['field', 'globalSequence', 'pdfPage', 'reason', 'retained'])),
    'manifest-excluded-discrepancy-schema');
  requireInvariant(sameJson(candidate.accounting.excludedFieldDiscrepancies, proof.excludedFieldDiscrepancies), 'excluded-field-discrepancies');

  const primaryCounts = Object.fromEntries([1, 2, 3, 4].map((level) => [String(level), candidate.rows.filter((row) => row.primaryLevel === level).length]));
  const eligibleLevelCounts = Object.fromEntries([1, 2, 3, 4].map((level) => [String(level), eligibleRows.filter((row) => row.primaryLevel === level).length]));
  requireInvariant(sameJson(primaryCounts, proof.primaryLevelCounts), 'receipt-primary-level-counts');
  requireInvariant(sameJson(eligibleLevelCounts, proof.eligibleLevelCounts), 'receipt-eligible-level-counts');
  requireInvariant(sameJson(primaryCounts, candidateProfile.coordinate.expectedLevelCounts), 'profile-primary-level-counts');
  requireInvariant(sameJson(eligibleLevelCounts, candidateProfile.counts.eligibleLevelCounts), 'profile-eligible-level-counts');
  requireInvariant(sameJson(candidate.accounting.primaryLevelCounts, proof.primaryLevelCounts), 'manifest-primary-level-counts');
  requireInvariant(sameJson(candidate.accounting.eligibleLevelCounts, proof.eligibleLevelCounts), 'manifest-eligible-level-counts');
  requireInvariant(Object.keys(supplementaryLabels).length === candidate.accounting.supplementarySourceLevelLabels, 'supplementary-label-count');

  const projection = eligibleRows.map((row) => [row.sourceId, row.globalSequence, row.primaryLevel, row.simplified, row.pinyin]);
  const projectionSha256 = createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex');
  requireInvariant(projectionSha256 === proof.eligibleProjectionSha256
    && projectionSha256 === 'a207a42633daa821c7c22d1d4d24ce163612dbbc1450b7cfd8b1c0fcc864effa', 'eligible-projection-sha256');
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
  requireInvariant(candidateProfile.counts.firstBatch === firstBatchSequences.length, 'profile-first-batch-count');
  requireInvariant(sameJson(firstBatch.map((row) => row.globalSequence), firstBatchSequences), 'first-batch-sequences');
  requireInvariant(firstBatch.every((row) => row.primaryLevel === 1 && row.batchPlacement === 'batch-001'), 'first-batch-placement');
  const firstBatchSequencesSet = new Set(firstBatch.map((row) => row.globalSequence));
  const groups = new Map<string, ManifestRow[]>();
  for (const row of eligibleRows) {
    requireInvariant(typeof row.batchPlacement === 'string' && row.batchPlacement.length > 0, 'eligible-placement-present');
    const group = groups.get(row.batchPlacement) ?? [];
    group.push(row);
    groups.set(row.batchPlacement, group);
  }
  const declaredPlacements = publicationIndex.placements;
  requireInvariant(declaredPlacements.every((placement) => groups.has(placement)), 'publication-index-known-placement');
  requireInvariant(declaredPlacements.every((placement, index) => index === 0 || groups.has(declaredPlacements[index - 1] ?? '')), 'publication-index-order');
  requireInvariant(sameJson(declaredPlacements, [...groups.keys()].filter((placement) => declaredPlacements.includes(placement))), 'publication-index-order');
  requireInvariant(sameJson(Object.keys(artifacts.companions).sort(), [...declaredPlacements].sort()), 'companion-artifact-set');
  const expectedCompanionFiles = declaredPlacements.map(expectedCompanionFilename).sort();
  requireInvariant(sameJson(artifacts.companionFiles, expectedCompanionFiles), 'companion-filesystem-set');
  const expectedBatchFiles = declaredPlacements.map(expectedBatchFilename).sort();
  requireInvariant(sameJson(Object.keys(artifacts.batches).sort(), expectedBatchFiles), 'batch-artifact-set');
  requireInvariant(sameJson(Object.keys(artifacts.batchBytes).sort(), expectedBatchFiles), 'batch-byte-set');
  requireInvariant(sameJson(artifacts.batchFiles, expectedBatchFiles), 'batch-filesystem-set');

  const declaredSet = new Set(declaredPlacements);
  for (const row of candidate.rows) {
    const isPublished = row.sourceEligible && typeof row.batchPlacement === 'string' && declaredSet.has(row.batchPlacement);
    const expectedPublication = !row.sourceEligible
      ? 'blocked'
      : isPublished
        ? 'draft-published-to-repository'
        : 'planned-not-published';
    requireInvariant(row.repositoryPublication === expectedPublication, 'repository-publication-consistency');
    requireInvariant(row.sourceEligible || row.batchPlacement === null, 'blocked-row-has-batch-placement');
    requireInvariant(row.sourceEligible || row.repositoryPublication === 'blocked', 'blocked-row-publication');
    const expectedFile = isPublished ? expectedBatchFilename(row.batchPlacement ?? '') : undefined;
    requireInvariant(row.repositoryBatchFile === expectedFile, 'repository-batch-file-consistency');
  }
  const expectedPublicationEntries = declaredPlacements.map((placement) => {
    const file = expectedBatchFilename(placement);
    const rows = groups.get(placement) ?? [];
    return { placement, file, records: rows.length, primaryLevel: rows[0]?.primaryLevel ?? 0 };
  });
  requireInvariant(candidate.publication.batches.length === expectedPublicationEntries.length, 'repository-published-batches');
  for (const [index, expected] of expectedPublicationEntries.entries()) {
    const actual = candidate.publication.batches[index];
    requireInvariant(actual !== undefined && sameJson(Object.keys(actual).sort(), ['file', 'placement', 'primaryLevel', 'records', 'sha256']),
      `publication-entry-schema-${index + 1}`);
    requireInvariant(actual?.placement === expected.placement && actual.file === expected.file
      && actual.records === expected.records && actual.primaryLevel === expected.primaryLevel, `publication-entry-${index + 1}`);
  }
  requireInvariant(candidate.publication.repositoryPublishedBatchCount === declaredPlacements.length, 'repository-published-batch-count');
  const publishedRecordCount = expectedPublicationEntries.reduce((total, entry) => total + entry.records, 0);
  requireInvariant(candidate.publication.repositoryPublishedRecordCount === publishedRecordCount, 'repository-published-record-count');
  requireInvariant(candidate.publication.batches[0]?.sha256 === immutableFirstBatchSha256, 'first-batch-sha256-frozen');
  requireInvariant(candidate.publication.sourceEligibleIsHumanReviewed === false, 'source-eligibility-is-not-human-review');
  requireInvariant(candidate.publication.sourceEligibleIsRuntimeAvailable === false, 'source-eligibility-is-not-runtime-availability');

  requireInvariant(firstBatchSequencesSet.size === 20, 'first-batch-frozen-count');
  const expectedAuthoring = {
    method: 'Independently AI-authored from the supplied Simplified Chinese, tone-marked pinyin, and primary-level introduction context only.',
    status: 'ai-provisional',
    reviewStatus: 'draft',
    humanReview: false,
    excludedSourceFieldsUsed: [],
  };
  for (const placement of declaredPlacements) {
    const group = groups.get(placement) ?? [];
    const companion = artifacts.companions[placement];
    const batchFilename = expectedBatchFilename(placement);
    const published = artifacts.batches[batchFilename];
    requireInvariant(group.length > 0 && group.length <= (placement === 'batch-001' ? candidateProfile.counts.firstBatch : candidateProfile.plannedBatches.subsequentMaxRows), `batch-size-${placement}`);
    requireInvariant(new Set(group.map((row) => row.primaryLevel)).size === 1, `single-level-batch-${placement}`);
    requireInvariant(group.every((row, index) => index === 0 || group[index - 1].globalSequence < row.globalSequence), `ordered-batch-${placement}`);
    requireInvariant(companion !== undefined && published !== undefined, `declared-output-present-${placement}`);
    requireInvariant(sameJson(Object.keys(published).sort(), ['vocabulary']), `batch-root-schema-${placement}`);
    requireInvariant(sameJson(Object.keys(companion).sort(), ['authoring', 'records']), `japanese-root-keys-${placement}`);
    requireInvariant(sameJson(companion.authoring, expectedAuthoring), `japanese-authoring-${placement}`);
    requireInvariant(companion.records.length === group.length, `japanese-count-${placement}`);
    requireInvariant(published.vocabulary.length === group.length, `batch-count-${placement}`);
    const declared = candidate.publication.batches.find((entry) => entry.placement === placement);
    const actualBytes = artifacts.batchBytes[batchFilename];
    requireInvariant(declared !== undefined && actualBytes !== undefined, `batch-metadata-and-bytes-present-${placement}`);
    requireInvariant(createHash('sha256').update(actualBytes).digest('hex') === declared.sha256, `batch-sha256-${placement}`);
    for (const [index, row] of group.entries()) {
      const japaneseRow = companion.records[index];
      const batchRow = published.vocabulary[index];
      requireInvariant(japaneseRow !== undefined && sameJson(Object.keys(japaneseRow).sort(), ['globalSequence', 'japanese', 'pinyin', 'simplified', 'sourceId']), `japanese-record-schema-${placement}-${index + 1}`);
      requireInvariant(japaneseRow.globalSequence === row.globalSequence && japaneseRow.sourceId === row.sourceId, `japanese-source-join-${placement}-${index + 1}`);
      requireInvariant(japaneseRow.simplified === row.simplified && japaneseRow.pinyin === row.pinyin && typeof japaneseRow.japanese === 'string' && japaneseRow.japanese.length > 0,
        `japanese-content-join-${placement}-${index + 1}`);
      requireInvariant(batchRow !== undefined && sameJson(Object.keys(batchRow).sort(), ['hsk', 'id', 'japanese', 'pinyin', 'reviewStatus', 'simplified', 'simplifiedStatus', 'source']), `batch-record-schema-${placement}-${index + 1}`);
      requireInvariant(sameJson(Object.keys(batchRow.hsk).sort(), ['introducedAtLevel', 'sourceLevelLabel', 'standardVersion']), `batch-hsk-schema-${placement}-${index + 1}`);
      requireInvariant(sameJson(Object.keys(batchRow.source).sort(), ['note', 'type']), `batch-source-schema-${placement}-${index + 1}`);
      requireInvariant(batchRow.id === row.recordId, `batch-record-id-join-${placement}-${index + 1}`);
      requireInvariant(batchRow.simplified === row.simplified && batchRow.pinyin === row.pinyin && batchRow.japanese === japaneseRow.japanese, `batch-content-join-${placement}-${index + 1}`);
      requireInvariant(batchRow.reviewStatus === 'draft' && batchRow.simplifiedStatus === 'authored', `batch-provisional-status-${placement}-${index + 1}`);
      requireInvariant(batchRow.hsk.standardVersion === 'hsk-3.0' && batchRow.hsk.introducedAtLevel === row.primaryLevel
        && batchRow.hsk.sourceLevelLabel === row.sourceLevelLabel, `batch-hsk-join-${placement}-${index + 1}`);
      requireInvariant(batchRow.source.type === 'hearmandarin-hsk-json', `batch-source-type-${placement}-${index + 1}`);
      requireInvariant(batchRow.source.note === expectedSourceNote(candidateProfile, row), `batch-source-note-exact-${placement}-${index + 1}`);
      requireInvariant(!Object.hasOwn(batchRow, 'traditional'), `batch-excluded-field-${placement}-${index + 1}`);
    }
  }
}

function serializedBatchSha256(candidate: { vocabulary: VocabularyRecord[] }): string {
  return createHash('sha256').update(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8').digest('hex');
}

function serializedBatchBytes(candidate: { vocabulary: VocabularyRecord[] }): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(candidate, null, 2)}\n`);
}

function cloneArtifacts(): FoundationArtifacts {
  return structuredClone(foundationArtifacts) as FoundationArtifacts;
}

describe('HearMandarin HSK source foundation', () => {
  it('pins the exact small receipt and records the bounded artifact-specific terms inference', () => {
    expect(profile.profileVersion).toBe(2);
    expect(profile.plannedBatches).not.toHaveProperty('repositoryPublishedBatches');
    expect(publicationIndex.publicationIndexVersion).toBe(1);
    expect(publicationIndex.placements[0]).toBe('batch-001');
    expect(manifest.manifestVersion).toBe(2);
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

  it('validates the actual and malformed raw publication indexes through the producer boundary', () => {
    expect(producerPublicationIndexError(publicationIndexBytes.toString('utf8'))).toBe('');
    const malformedIndexes: Array<{ raw: string; diagnostic: string }> = [
      {
        raw: '{"publicationIndexVersion":1,"publicationIndexVersion":1,"placements":["batch-001"]}',
        diagnostic: 'duplicate JSON object key: publicationIndexVersion',
      },
      {
        raw: '{"publicationIndexVersion":1.0,"placements":["batch-001"]}',
        diagnostic: 'publication index version must be the integer 1',
      },
      {
        raw: '{"publicationIndexVersion":1,"placements":["batch-001"],"extra":true}',
        diagnostic: 'publication index has unsupported fields',
      },
    ];
    for (const candidate of malformedIndexes) {
      expect(producerPublicationIndexError(candidate.raw)).toContain(candidate.diagnostic);
    }
  });

  it('accounts for official coordinates and reconciles every declared repository output', () => {
    expect(() => assertFoundation(foundationArtifacts)).not.toThrow();
    expect(createHash('sha256').update(readFileSync(path.join(root, batchPath))).digest('hex')).toBe(manifest.publication.batches[0].sha256);
    expect(manifest.publication.batches[0]?.sha256).toBe(immutableFirstBatchSha256);
  });

  it('rejects independent profile, manifest, index, companion, and batch drift copies through the same validators', () => {
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
        invariant: 'manifest-row-schema-10',
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
          const row = candidate.manifest.rows.find((entry) => entry.repositoryPublication === 'draft-published-to-repository');
          if (!row) throw new Error('fixture lacks published draft rows');
          row.repositoryPublication = 'planned-not-published';
        },
      },
      {
        name: 'first-batch Japanese source join drift',
        invariant: 'japanese-source-join-batch-001-1',
        mutate: (candidate) => {
          candidate.companions['batch-001']!.records[0]!.sourceId = 'wrong-opaque-id';
        },
      },
      {
        name: 'first-batch repository source join drift',
        invariant: 'batch-record-id-join-batch-001-1',
        mutate: (candidate) => {
          candidate.batches['hsk-vocabulary-batch-001.json']!.vocabulary[0]!.id = 'hm-hsk3-wrong-opaque-id';
        },
      },
      {
        name: 'first-batch HSK level drift with recalculated batch hash',
        invariant: 'first-batch-sha256-frozen',
        mutate: (candidate) => {
          const filename = 'hsk-vocabulary-batch-001.json';
          const output = candidate.batches[filename]!;
          output.vocabulary[0]!.hsk.introducedAtLevel = 2;
          candidate.batchBytes[filename] = serializedBatchBytes(output);
          candidate.manifest.publication.batches[0]!.sha256 = serializedBatchSha256(output);
        },
      },
      {
        name: 'first-batch HSK source label drift with recalculated batch hash',
        invariant: 'first-batch-sha256-frozen',
        mutate: (candidate) => {
          const filename = 'hsk-vocabulary-batch-001.json';
          const output = candidate.batches[filename]!;
          output.vocabulary[0]!.hsk.sourceLevelLabel = 'incorrect-source-label';
          candidate.batchBytes[filename] = serializedBatchBytes(output);
          candidate.manifest.publication.batches[0]!.sha256 = serializedBatchSha256(output);
        },
      },
      {
        name: 'publication index duplicate placement',
        invariant: 'publication-index-unique-placements',
        mutate: (candidate) => {
          candidate.publicationIndex.placements.push('batch-001');
        },
      },
      {
        name: 'publication index references unknown placement',
        invariant: 'publication-index-known-placement',
        mutate: (candidate) => {
          candidate.publicationIndex.placements.push('planned-level-2-batch-999');
        },
      },
      {
        name: 'publication index has an extra root key',
        invariant: 'publication-index-schema',
        mutate: (candidate) => {
          (candidate.publicationIndex as PublicationIndex & Record<string, unknown>).extra = true;
        },
      },
      {
        name: 'manifest has an obsolete root key',
        invariant: 'manifest-root-schema',
        mutate: (candidate) => {
          (candidate.manifest as HskManifest & Record<string, unknown>).obsolete = true;
        },
      },
      {
        name: 'manifest source has an excluded field',
        invariant: 'manifest-source-schema',
        mutate: (candidate) => {
          candidate.manifest.source.english = 'excluded teaching fixture';
        },
      },
      {
        name: 'manifest accounting has an obsolete field',
        invariant: 'manifest-accounting-schema',
        mutate: (candidate) => {
          (candidate.manifest.accounting as ManifestAccounting & Record<string, unknown>).legacyCount = 20;
        },
      },
      {
        name: 'manifest official coordinate proof has an extra field',
        invariant: 'manifest-official-provenance-schema',
        mutate: (candidate) => {
          (candidate.manifest.officialCoordinateVerification as HskManifest['officialCoordinateVerification'] & Record<string, unknown>).extra = true;
        },
      },
      {
        name: 'manifest publication has an extra field',
        invariant: 'manifest-publication-schema',
        mutate: (candidate) => {
          (candidate.manifest.publication as HskManifest['publication'] & Record<string, unknown>).english = 'excluded teaching fixture';
        },
      },
      {
        name: 'manifest row has an excluded field',
        invariant: 'manifest-row-schema-26',
        mutate: (candidate) => {
          (candidate.manifest.rows[25] as ManifestRow & Record<string, unknown>).english = 'excluded teaching fixture';
        },
      },
      {
        name: 'published manifest row has an excluded field',
        invariant: 'manifest-row-schema-1',
        mutate: (candidate) => {
          (candidate.manifest.rows[0] as ManifestRow & Record<string, unknown>).english = 'excluded teaching fixture';
        },
      },
      {
        name: 'blocked manifest row has an excluded field',
        invariant: 'manifest-row-schema-10',
        mutate: (candidate) => {
          (candidate.manifest.rows[9] as ManifestRow & Record<string, unknown>).english = 'excluded teaching fixture';
        },
      },
      {
        name: 'manifest excluded-field receipt row has an extra field',
        invariant: 'manifest-excluded-discrepancy-schema',
        mutate: (candidate) => {
          (candidate.manifest.accounting.excludedFieldDiscrepancies[0] as ManifestAccounting['excludedFieldDiscrepancies'][number] & Record<string, unknown>).legacy = true;
        },
      },
      {
        name: 'manifest provenance drift from profile',
        invariant: 'source-profile-manifest-licenseUrl',
        mutate: (candidate) => {
          candidate.manifest.source.licenseUrl = 'https://example.invalid/license';
        },
      },
      {
        name: 'missing declared Japanese row',
        invariant: 'japanese-count-batch-001',
        mutate: (candidate) => {
          candidate.companions['batch-001']!.records.pop();
        },
      },
      {
        name: 'reordered declared Japanese rows',
        invariant: 'japanese-source-join-batch-001-1',
        mutate: (candidate) => {
          candidate.companions['batch-001']!.records.reverse();
        },
      },
      {
        name: 'extra Japanese authoring field',
        invariant: 'japanese-authoring-batch-001',
        mutate: (candidate) => {
          candidate.companions['batch-001']!.authoring.extra = true;
        },
      },
      {
        name: 'missing declared Japanese output',
        invariant: 'companion-artifact-set',
        mutate: (candidate) => {
          delete candidate.companions['batch-001'];
        },
      },
      {
        name: 'missing declared vocabulary output',
        invariant: 'batch-artifact-set',
        mutate: (candidate) => {
          delete candidate.batches['hsk-vocabulary-batch-001.json'];
        },
      },
      {
        name: 'extra companion file in managed directory',
        invariant: 'companion-filesystem-set',
        mutate: (candidate) => {
          candidate.companionFiles.push('japanese/unlisted.json');
          candidate.companionFiles.sort();
        },
      },
      {
        name: 'extra managed vocabulary output file',
        invariant: 'batch-filesystem-set',
        mutate: (candidate) => {
          candidate.batchFiles.push('hsk-vocabulary-level-2-batch-999.json');
          candidate.batchFiles.sort();
        },
      },
      {
        name: 'extra excluded field in vocabulary record',
        invariant: 'batch-record-schema-batch-001-1',
        mutate: (candidate) => {
          (candidate.batches['hsk-vocabulary-batch-001.json']!.vocabulary[0] as VocabularyRecord & { traditional?: string }).traditional = '愛';
        },
      },
      {
        name: 'vocabulary batch has an extra root key',
        invariant: 'batch-root-schema-batch-001',
        mutate: (candidate) => {
          (candidate.batches['hsk-vocabulary-batch-001.json'] as { vocabulary: VocabularyRecord[] } & Record<string, unknown>).extra = true;
        },
      },
      {
        name: 'human review flag drift',
        invariant: 'source-eligibility-is-not-human-review',
        mutate: (candidate) => {
          candidate.manifest.publication.sourceEligibleIsHumanReviewed = true;
        },
      },
      {
        name: 'runtime availability flag drift',
        invariant: 'source-eligibility-is-not-runtime-availability',
        mutate: (candidate) => {
          candidate.manifest.publication.sourceEligibleIsRuntimeAvailable = true;
        },
      },
    ];

    for (const testCase of cases) {
      const candidate = cloneArtifacts();
      testCase.mutate(candidate);
      expect(() => assertFoundation(candidate), testCase.name).toThrow(`manifest invariant: ${testCase.invariant}`);
    }
  });

  it('accepts a later independently declared placement with its complete output set', () => {
    const candidate = cloneArtifacts();
    const placement = 'planned-level-2-batch-002';
    const filename = expectedBatchFilename(placement);
    const group = candidate.manifest.rows.filter((row) => row.sourceEligible && row.batchPlacement === placement);
    const records = group.map((row) => {
      const japaneseText = `合成訳${row.globalSequence}`;
      return {
        sourceId: row.sourceId,
        globalSequence: row.globalSequence,
        simplified: row.simplified ?? '',
        pinyin: row.pinyin ?? '',
        japanese: japaneseText,
      };
    });
    const vocabulary = group.map((row, index): VocabularyRecord => ({
      id: row.recordId,
      pinyin: row.pinyin ?? '',
      japanese: records[index]?.japanese ?? '',
      reviewStatus: 'draft',
      hsk: { standardVersion: 'hsk-3.0', introducedAtLevel: row.primaryLevel, sourceLevelLabel: row.sourceLevelLabel },
      simplified: row.simplified ?? '',
      simplifiedStatus: 'authored',
      source: {
        type: 'hearmandarin-hsk-json',
        note: expectedSourceNote(candidate.profile, row),
      },
    }));
    const output = { vocabulary };
    const bytes = serializedBatchBytes(output);
    candidate.publicationIndex.placements.push(placement);
    const authoring = {
        method: 'Independently AI-authored from the supplied Simplified Chinese, tone-marked pinyin, and primary-level introduction context only.',
        status: 'ai-provisional',
        reviewStatus: 'draft',
        humanReview: false,
        excludedSourceFieldsUsed: [],
      };
    candidate.companions[placement] = {
      authoring: Object.fromEntries(Object.entries(authoring).reverse()),
      records,
    };
    candidate.batches[filename] = output;
    candidate.batchBytes[filename] = bytes;
    candidate.companionFiles.push(expectedCompanionFilename(placement));
    candidate.companionFiles.sort();
    candidate.batchFiles.push(filename);
    candidate.batchFiles.sort();
    candidate.manifest.publication.batches.push({
      placement,
      file: filename,
      records: group.length,
      primaryLevel: 2,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    candidate.manifest.publication.repositoryPublishedBatchCount += 1;
    candidate.manifest.publication.repositoryPublishedRecordCount += group.length;
    for (const row of group) {
      row.repositoryPublication = 'draft-published-to-repository';
      row.repositoryBatchFile = filename;
    }
    expect(() => assertFoundation(candidate)).not.toThrow();

    const semanticDrift = structuredClone(candidate) as FoundationArtifacts;
    const laterOutput = semanticDrift.batches[filename]!;
    laterOutput.vocabulary[0]!.hsk.introducedAtLevel = 3;
    semanticDrift.batchBytes[filename] = serializedBatchBytes(laterOutput);
    semanticDrift.manifest.publication.batches[1]!.sha256 = serializedBatchSha256(laterOutput);
    expect(() => assertFoundation(semanticDrift)).toThrow('manifest invariant: batch-hsk-join-planned-level-2-batch-002-1');

    const laterRow = group[0];
    if (!laterRow) throw new Error('synthetic later declaration has no rows');
    const expectedRowSourceNote = expectedSourceNote(candidate.profile, laterRow);
    const sourceNoteDrifts: Array<{ name: string; alter: (note: string) => string }> = [
      { name: 'attribution', alter: (note) => note.replace(candidate.profile.dataset.attribution, 'Unknown publisher') },
      { name: 'dataset title', alter: (note) => note.replace(candidate.profile.dataset.datasetName, 'Unknown dataset') },
      { name: 'homepage', alter: (note) => note.replace(candidate.profile.dataset.homepage, 'https://example.invalid/data') },
      { name: 'provenance and disclaimer', alter: (note) => note.replace(candidate.profile.dataset.provenance, 'https://example.invalid/provenance') },
      { name: 'publisher terms', alter: (note) => note.replace(candidate.profile.dataset.termsUrl, 'https://example.invalid/terms') },
      { name: 'license name', alter: (note) => note.replace(candidate.profile.dataset.license, 'Unknown license') },
      { name: 'license URL', alter: (note) => note.replace(candidate.profile.dataset.licenseUrl, 'https://example.invalid/license') },
      { name: 'modification notice', alter: (note) => note.replace(candidate.profile.dataset.modificationNotice, 'Modification detail omitted.') },
      { name: 'provisional disclaimer', alter: (note) => note.replace('provisional, not human reviewed', 'approved by a human reviewer') },
      { name: 'record identity', alter: (note) => note.replace(`Source ID ${laterRow.sourceId};`, 'Source ID contradictory-id;') },
    ];
    for (const drift of sourceNoteDrifts) {
      const noteDrift = structuredClone(candidate) as FoundationArtifacts;
      const noteOutput = noteDrift.batches[filename]!;
      noteOutput.vocabulary[0]!.source.note = drift.alter(expectedRowSourceNote);
      noteDrift.batchBytes[filename] = serializedBatchBytes(noteOutput);
      noteDrift.manifest.publication.batches[1]!.sha256 = serializedBatchSha256(noteOutput);
      expect(() => assertFoundation(noteDrift), drift.name).toThrow('manifest invariant: batch-source-note-exact-planned-level-2-batch-002-1');
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
    for (const filename of foundationArtifacts.batchFiles) {
      const target = `data/hsk-vocabulary/${filename}`;
      execFileSync('python3', ['scripts/validate-content-schema.py', '--check', target], { cwd: root, stdio: 'pipe' });
      execFileSync('python3', ['scripts/validate-script-status.py', '--check', target], { cwd: root, stdio: 'pipe' });
    }
  });

  it('self-tests the actual CLI, clean repeat, and fail-closed dirty and drift cases', () => {
    const result = spawnSync('python3', ['scripts/import-hearmandarin-hsk-json.py', '--self-test'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('41 negative CLI probes');
    expect(result.stdout).toContain('clean/repeat/empty-dir CLI success');
    expect(result.stdout).toContain('21 synthetic multi-placement negative probes');
    expect(result.stdout).toContain('multi-placement repeat/subset success');
    expect(result.stdout).toContain('partial-link failure/fresh-dir recovery');
  });
});
