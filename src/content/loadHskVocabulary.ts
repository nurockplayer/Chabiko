import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildHskLearnerProjection,
  type HskLearnerProjection,
} from '../domain/hskLearnerProjection';
import { buildHskLevelPools, type HskLevelPools } from '../domain/hskLevelPool';
import type { HskVocabularyType } from '../types/vocabulary';

const DEFAULT_HSK_MANIFEST = 'data/hsk-import/hearmandarin-hsk-2025-v1/manifest.json';
const DEFAULT_HSK_BATCH_DIR = 'data/hsk-vocabulary';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const SOURCE_URL = 'https://hearmandarin.com/datasets/';
const TERMS_URL = 'https://hearmandarin.com/terms/';
const PROVENANCE_URL = 'https://hearmandarin.com/data-sources/';

export interface HskBundle {
  /** Validated source records, including draft records for authoring consumers. */
  vocabulary: HskVocabularyType[];
  /** Records admitted for learner use by the manifest-level gate. */
  learnerVocabulary: HskVocabularyType[];
  /** Null for a complete, internally consistent repository snapshot. */
  diagnostic: string | null;
  expectedNewWordCounts: Readonly<Record<1 | 2 | 3 | 4, number>>;
  sourceNotice: HskSourceNotice | null;
}

export interface HskSourceNotice {
  readonly attribution: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly termsUrl: string;
  readonly provenanceUrl: string;
  readonly disclaimerUrl: string;
  readonly modificationNotice: string;
}

export interface HskPublication {
  readonly pools: HskLevelPools;
  readonly sourceNotice: HskSourceNotice | null;
}

interface HskManifestRow {
  recordId: string;
  sourceId: string;
  globalSequence: number;
  primaryLevel: number;
  sourceLevelLabel: string;
  sourceEligible: boolean;
  repositoryPublication: string;
  batchPlacement?: string;
  repositoryBatchFile?: string;
  disposition: string;
  simplified: string;
  pinyin: string;
}

interface HskManifestBatch {
  placement: string;
  file: string;
  records: number;
  primaryLevel: number;
  sha256: string;
}

interface HskManifest {
  manifestVersion: number;
  source: {
    publisher: string;
    license: string;
    licenseUrl: string;
    sourceUrl: string;
    termsUrl: string;
    provenanceUrl: string;
    disclaimerUrl: string;
    modificationNotice: string;
    attribution: string;
  };
  accounting: {
    sourceCandidates: number;
    eligible: number;
    blocked: number;
    eligibleLevelCounts: Record<string, number>;
    primaryLevelCounts: Record<string, number>;
  };
  publication: {
    batches: HskManifestBatch[];
    repositoryPublishedBatchCount: number;
    repositoryPublishedRecordCount: number;
    sourceEligibleIsHumanReviewed: boolean;
    sourceEligibleIsRuntimeAvailable: boolean;
  };
  rows: HskManifestRow[];
}

interface HskBatch {
  vocabulary: unknown[];
}

export interface HskRenderableEntry {
  id: string;
  simplified: string;
  pinyin: string;
  japanese: string;
  traditional?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function fail(message: string): never {
  throw new Error(message);
}

function parseJson<T>(raw: string, path: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fail(`Invalid JSON at ${path}`);
  }
}

function validateSourceNotice(manifest: HskManifest): void {
  const source = manifest.source;
  if (
    source.publisher !== 'HearMandarin' ||
    source.license !== 'CC BY 4.0' ||
    source.licenseUrl !== LICENSE_URL ||
    source.sourceUrl !== SOURCE_URL ||
    source.termsUrl !== TERMS_URL ||
    source.provenanceUrl !== PROVENANCE_URL ||
    source.disclaimerUrl !== PROVENANCE_URL ||
    !nonemptyTrimmedString(source.attribution) ||
    !source.attribution.includes('HearMandarin') ||
    !nonemptyTrimmedString(source.modificationNotice) ||
    !source.modificationNotice.includes('Japanese glosses are separately authored')
  ) {
    fail('HSK source attribution, license, terms, provenance, or modification notice is incomplete');
  }
}

function validateEntryRights(entry: HskVocabularyType, row: HskManifestRow): void {
  const note: unknown = entry.source?.note;
  if (!nonemptyTrimmedString(note)) {
    fail(`HSK rights or provenance notice is missing or malformed for '${row.recordId}'`);
  }
  if (
    entry.source?.type !== 'hearmandarin-hsk-json' ||
    !note.includes('HearMandarin') ||
    !note.includes(SOURCE_URL) ||
    !note.includes(LICENSE_URL) ||
    !note.includes(TERMS_URL) ||
    !note.includes(PROVENANCE_URL) ||
    !note.includes('Modified by retaining only') ||
    !note.includes(`Source ID ${row.sourceId};`) ||
    !note.includes(`global sequence ${row.globalSequence};`) ||
    !note.includes(`primary level ${row.primaryLevel};`)
  ) {
    fail(`HSK rights or provenance notice is incomplete for '${row.recordId}'`);
  }
  if (entry.reviewStatus === 'draft') {
    if (!note.includes('Japanese is independently AI-authored and provisional, not human reviewed.')) {
      fail(`HSK draft review notice is stale or missing for '${row.recordId}'`);
    }
  } else if (
    !note.includes('Japanese glosses are human reviewed.') ||
    note.includes('not human reviewed')
  ) {
    fail(`HSK human-review notice is stale or missing for '${row.recordId}'`);
  }
}

function validateSnapshotEntry(value: unknown): asserts value is HskVocabularyType {
  if (!record(value) || !nonemptyTrimmedString(value.id)) {
    fail('HSK batch contains an empty or malformed identity');
  }
  if ('traditional' in value || 'traditionalStatus' in value) {
    fail(`HSK batch entry '${value.id}' contains excluded Traditional fields`);
  }
  if (!hasOnlyKeys(value, ['id', 'pinyin', 'japanese', 'reviewStatus', 'hsk', 'simplified', 'simplifiedStatus', 'source'])) {
    fail(`HSK batch entry '${value.id}' contains a field outside the authorized retained shape`);
  }
  if (
    !nonemptyTrimmedString(value.simplified) ||
    !nonemptyTrimmedString(value.pinyin) ||
    !nonemptyTrimmedString(value.japanese)
  ) {
    fail(`HSK batch entry '${value.id}' has an empty or malformed required answer field`);
  }
  if (
    value.simplifiedStatus !== 'authored' && value.simplifiedStatus !== 'verified'
  ) fail(`HSK batch entry '${value.id}' has an unsupported Simplified status`);
  if (
    !record(value.hsk) ||
    !hasOnlyKeys(value.hsk, ['standardVersion', 'introducedAtLevel', 'sourceLevelLabel'])
  ) fail(`HSK batch entry '${value.id}' has malformed HSK coordinates`);
  if (!record(value.source) || !hasOnlyKeys(value.source, ['type', 'note'])) {
    fail(`HSK batch entry '${value.id}' has malformed or expanded source metadata`);
  }
}

function expectedCounts(manifest: HskManifest): Record<1 | 2 | 3 | 4, number> {
  const counts = {} as Record<1 | 2 | 3 | 4, number>;
  for (const level of [1, 2, 3, 4] as const) {
    const count = manifest.accounting?.eligibleLevelCounts?.[String(level)];
    if (!Number.isSafeInteger(count) || count < 0) fail(`HSK manifest eligible count for level ${level} is invalid`);
    counts[level] = count;
  }
  return Object.freeze(counts);
}

function validateManifest(manifest: HskManifest): Record<1 | 2 | 3 | 4, number> {
  if (!record(manifest) || manifest.manifestVersion !== 2 || !Array.isArray(manifest.rows)) {
    fail('HSK manifest structure or version is invalid');
  }
  validateSourceNotice(manifest);
  const counts = expectedCounts(manifest);
  const ids = new Set<string>();
  const sourceIds = new Set<string>();
  const sequences = new Set<number>();
  const actualEligibleCounts: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const actualPrimaryCounts: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let actualBlockedCount = 0;
  let previousSequence = 0;
  for (const row of manifest.rows) {
    if (
      !row || !nonemptyTrimmedString(row.recordId) || !nonemptyTrimmedString(row.sourceId) || sourceIds.has(row.sourceId) ||
      !Number.isSafeInteger(row.globalSequence) || row.globalSequence <= previousSequence ||
      sequences.has(row.globalSequence) || ids.has(row.recordId) ||
      !Number.isSafeInteger(row.primaryLevel) || row.primaryLevel < 1 || row.primaryLevel > 4 ||
      !nonemptyTrimmedString(row.sourceLevelLabel) ||
      typeof row.sourceEligible !== 'boolean' || typeof row.disposition !== 'string' ||
      row.sourceEligible && (!nonemptyTrimmedString(row.simplified) || !nonemptyTrimmedString(row.pinyin))
    ) fail('HSK manifest rows have malformed or duplicate identities/coordinates');
    ids.add(row.recordId);
    sourceIds.add(row.sourceId);
    sequences.add(row.globalSequence);
    previousSequence = row.globalSequence;
    actualPrimaryCounts[row.primaryLevel as 1 | 2 | 3 | 4] += 1;
    if (row.sourceEligible) {
      if (row.disposition !== 'eligible') fail(`Eligible HSK row '${row.recordId}' has a blocked disposition`);
      if (row.primaryLevel <= 4) actualEligibleCounts[row.primaryLevel as 1 | 2 | 3 | 4] += 1;
    } else if (row.disposition !== 'blocked') {
      fail(`Ineligible HSK row '${row.recordId}' has a non-blocked disposition`);
    } else {
      actualBlockedCount += 1;
    }
  }
  const declaredCounts = expectedCounts(manifest);
  if (
    manifest.accounting.sourceCandidates !== manifest.rows.length ||
    manifest.accounting.blocked !== actualBlockedCount ||
    manifest.accounting.eligible !== manifest.rows.length - actualBlockedCount ||
    manifest.accounting.eligible !== Object.values(declaredCounts).reduce((sum, count) => sum + count, 0) ||
    ([1, 2, 3, 4] as const).some((level) =>
      actualEligibleCounts[level] !== declaredCounts[level] ||
      actualPrimaryCounts[level] !== manifest.accounting.primaryLevelCounts?.[String(level)],
    )
  ) fail('HSK manifest eligible row totals do not match its level accounting');
  if (
    typeof manifest.publication.sourceEligibleIsHumanReviewed !== 'boolean' ||
    typeof manifest.publication.sourceEligibleIsRuntimeAvailable !== 'boolean'
  ) fail('HSK manifest learner eligibility flags are malformed');
  if (
    !Array.isArray(manifest.publication?.batches) ||
    manifest.publication.batches.length !== manifest.publication.repositoryPublishedBatchCount
  ) fail('HSK manifest batch declaration count is inconsistent');
  const files = new Set<string>();
  const placements = new Set<string>();
  let declaredRecords = 0;
  for (const batch of manifest.publication.batches) {
    if (
      !batch || !nonemptyTrimmedString(batch.placement) || placements.has(batch.placement) ||
      typeof batch.file !== 'string' || !/^hsk-vocabulary-[a-z0-9-]+\.json$/.test(batch.file) || files.has(batch.file) ||
      !Number.isSafeInteger(batch.records) || batch.records < 1 ||
      !Number.isSafeInteger(batch.primaryLevel) || batch.primaryLevel < 1 || batch.primaryLevel > 4 ||
      !/^[a-f0-9]{64}$/.test(batch.sha256)
    ) fail('HSK manifest batch declaration is malformed or duplicated');
    files.add(batch.file);
    placements.add(batch.placement);
    declaredRecords += batch.records;
  }
  if (declaredRecords !== manifest.publication.repositoryPublishedRecordCount) {
    fail('HSK manifest published record count is inconsistent');
  }
  for (const row of manifest.rows) {
    if (row.repositoryPublication === 'draft-published-to-repository') {
      const declarations = manifest.publication.batches.filter(
        (batch) => batch.file === row.repositoryBatchFile && batch.placement === row.batchPlacement,
      );
      if (row.sourceEligible !== true || row.disposition !== 'eligible' || declarations.length !== 1) {
        fail(`HSK manifest placement is invalid for '${row.recordId}'`);
      }
    } else if (row.repositoryBatchFile != null) {
      fail(`Undeclared HSK row '${row.recordId}' references a batch`);
    }
  }
  return counts;
}

function loadProductionSnapshot(root: string): HskBundle {
  try {
    const manifestPath = resolve(root, DEFAULT_HSK_MANIFEST);
    const manifest = parseJson<HskManifest>(readFileSync(manifestPath, 'utf8'), manifestPath);
    const counts = validateManifest(manifest);
    const vocabulary: HskVocabularyType[] = [];
    const seenBatchIds = new Set<string>();
    for (const declaration of manifest.publication.batches) {
      const batchPath = resolve(root, DEFAULT_HSK_BATCH_DIR, declaration.file);
      const raw = readFileSync(batchPath, 'utf8');
      const digest = createHash('sha256').update(raw).digest('hex');
      if (digest !== declaration.sha256) fail(`HSK batch SHA-256 mismatch for '${declaration.file}'`);
      const batch = parseJson<HskBatch>(raw, batchPath);
      if (!record(batch) || !Array.isArray(batch.vocabulary) || batch.vocabulary.length !== declaration.records) {
        fail(`HSK batch record count mismatch for '${declaration.file}'`);
      }
      const declaredRows = manifest.rows.filter((row) =>
        row.repositoryPublication === 'draft-published-to-repository' && row.repositoryBatchFile === declaration.file,
      );
      if (declaredRows.length !== batch.vocabulary.length) fail(`HSK batch join count mismatch for '${declaration.file}'`);
      for (const [index, entry] of batch.vocabulary.entries()) {
        validateSnapshotEntry(entry);
        const row = declaredRows[index];
        if (!row || seenBatchIds.has(entry.id)) fail('HSK batch contains a missing or duplicate row');
        if (
          entry.id !== row.recordId || entry.hsk?.standardVersion !== 'hsk-3.0' ||
          entry.hsk.introducedAtLevel !== row.primaryLevel || entry.hsk.sourceLevelLabel !== row.sourceLevelLabel ||
          entry.simplified !== row.simplified || entry.pinyin !== row.pinyin ||
          declaration.primaryLevel !== row.primaryLevel ||
          entry.reviewStatus !== 'draft' && entry.reviewStatus !== 'reviewed' && entry.reviewStatus !== 'published'
        ) fail(`HSK batch identity or coordinate mismatch for '${row.recordId}'`);
        validateEntryRights(entry, row);
        seenBatchIds.add(entry.id);
        vocabulary.push(entry);
      }
    }
    const sequenceById = new Map(manifest.rows.map((row) => [row.recordId, row.globalSequence]));
    vocabulary.sort((left, right) => (sequenceById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (sequenceById.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    const learnerAllowed = manifest.publication.sourceEligibleIsHumanReviewed === true &&
      manifest.publication.sourceEligibleIsRuntimeAvailable === true;
    const learnerVocabulary = learnerAllowed
      ? vocabulary.filter((entry) => entry.reviewStatus === 'reviewed' || entry.reviewStatus === 'published')
      : [];
    const diagnostic = learnerAllowed
      ? null
      : `Manifest learner gate is closed (humanReviewed=${manifest.publication.sourceEligibleIsHumanReviewed}, runtimeAvailable=${manifest.publication.sourceEligibleIsRuntimeAvailable})`;
    const sourceNotice: HskSourceNotice = Object.freeze({
      attribution: manifest.source.attribution,
      sourceUrl: manifest.source.sourceUrl,
      license: manifest.source.license,
      licenseUrl: manifest.source.licenseUrl,
      termsUrl: manifest.source.termsUrl,
      provenanceUrl: manifest.source.provenanceUrl,
      disclaimerUrl: manifest.source.disclaimerUrl,
      modificationNotice: manifest.source.modificationNotice,
    });
    return { vocabulary, learnerVocabulary, diagnostic, expectedNewWordCounts: counts, sourceNotice };
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : 'HSK source snapshot is invalid';
    return {
      vocabulary: [],
      learnerVocabulary: [],
      diagnostic,
      expectedNewWordCounts: Object.freeze({ 1: 0, 2: 0, 3: 0, 4: 0 }),
      sourceNotice: null,
    };
  }
}

function parseExplicitHskFixture(raw: string, path: string): HskBundle {
  const parsed = parseJson<unknown>(raw, path);
  if (!record(parsed) || !Array.isArray(parsed.vocabulary)) {
    fail(`Invalid HSK vocabulary structure at ${path}: expected {vocabulary: [...]}`);
  }
  return {
    vocabulary: parsed.vocabulary as HskVocabularyType[],
    learnerVocabulary: parsed.vocabulary as HskVocabularyType[],
    diagnostic: null,
    expectedNewWordCounts: Object.freeze({ 1: 0, 2: 0, 3: 0, 4: 0 }),
    sourceNotice: null,
  };
}

/**
 * Load the declared production snapshot. Explicit file paths are retained for
 * authoring and isolated test fixtures; the default never falls back to them.
 */
export function loadHskVocabulary(filePath?: string, root = process.cwd()): HskBundle {
  if (filePath) return parseExplicitHskFixture(readFileSync(filePath, 'utf-8'), filePath);
  return loadProductionSnapshot(root);
}

/** Load the single learner-eligible projection used by Home and /paths/. */
export function loadHskLearnerProjection(filePath?: string): HskLearnerProjection {
  const bundle = loadHskVocabulary(filePath);
  return buildHskLearnerProjection(bundle.learnerVocabulary);
}

/** Read-only immutable pool adapter for the four source-backed HSK levels. */
export function loadHskLevelPools(root = process.cwd()): HskLevelPools {
  return loadHskPublication(root).pools;
}

/** Load admitted pools and the validated source notice from one snapshot. */
export function loadHskPublication(root = process.cwd()): HskPublication {
  const bundle = loadProductionSnapshot(root);
  return {
    pools: buildHskLevelPools(
      bundle.learnerVocabulary,
      bundle.expectedNewWordCounts,
      bundle.diagnostic ?? undefined,
    ),
    sourceNotice: bundle.sourceNotice,
  };
}

/** Load the admitted full-range learner pool for a requested level. */
export function loadHskLevelEntries(level: number, filePath?: string): HskRenderableEntry[] {
  const bundle = loadHskVocabulary(filePath);
  let entries: readonly HskVocabularyType[];
  if (filePath) {
    const projection = buildHskLearnerProjection(bundle.learnerVocabulary);
    entries = projection.levels.find((candidate) => candidate.level === level)?.ids.flatMap((id) => {
      const entry = bundle.vocabulary.find((candidate) => candidate.id === id);
      return entry ? [entry] : [];
    }) ?? [];
  } else {
    entries = buildHskLevelPools(
      bundle.learnerVocabulary,
      bundle.expectedNewWordCounts,
      bundle.diagnostic ?? undefined,
    ).find((pool) => pool.level === level)?.fullRange ?? [];
  }
  return entries.map((entry) => ({
    id: entry.id,
    simplified: entry.simplified,
    pinyin: entry.pinyin,
    japanese: entry.japanese,
    ...(filePath && 'traditional' in entry ? { traditional: entry.traditional } : {}),
  }));
}
