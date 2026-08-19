import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildLearningContentGraph,
} from './loadLearningContentGraph';
import { loadHskVocabulary } from './loadHskVocabulary';
import { loadLessons } from './loadLessons';
import { sha256Hex } from './loadTeacherReviewCampaign';
import { stableStringify, TEACHER_REVIEW_CAMPAIGN_ID } from '../domain/teacherReview';
import type {
  ContentRef,
  LearningContentGraph,
  LearningContentRecord,
  LearningContentPath,
} from '../types/learningContent';

export const GOLDEN_SET_SCOPE_ID = 'golden-content-pilot-v1';
export const GOLDEN_SET_SOURCE_GRAPH_PATH = 'data/content-pilots/graph-paths.json';
export const GOLDEN_SET_SCOPE_PATH = 'data/content-pilots/golden-review-scope.json';
export const GOLDEN_SET_REVIEW_PACKET_PATH =
  'docs/content/reviews/golden-content-pilot-v1.md';
export const GOLDEN_SET_LESSONS_PATH =
  'data/content-pilots/taiwan-travel-golden/lessons.json';
export const GOLDEN_SET_HSK_PATH = 'data/content-pilots/hsk-golden/vocabulary.json';
export const GOLDEN_SET_RECORD_COUNT = 18;

const FINGERPRINT_CONTRACT =
  'sha256(stableStringify(recordWithoutTopLevelReviewStatus))';
const GOLDEN_SET_DIMENSION_IDS = [
  'natural-taiwan-mandarin',
  'natural-japanese-explanation',
  'learner-usefulness',
  'taiwan-regional-cultural-accuracy',
  'teaching-progression',
  'dialogue-naturalness',
  'exercise-quality',
  'graph-cross-link-correctness',
  'source-provenance-correctness',
] as const;

export type GoldenReviewState = 'pending-human-review';
export type GoldenDimensionState = 'pending' | 'not-applicable';
export type GoldenReviewerRole =
  | 'human-language-reviewer'
  | 'human-script-verifier'
  | 'human-regional-reviewer'
  | 'human-source-reviewer'
  | 'human-teaching-reviewer'
  | 'maintainer';

export interface GoldenSetScopeRecord {
  collection: 'lessons' | 'hskVocabulary';
  type: 'lesson' | 'vocabulary';
  id: string;
  sourcePath: string;
}

export interface GoldenSetReviewDimension {
  id: (typeof GOLDEN_SET_DIMENSION_IDS)[number];
  label: string;
  reviewerRoles: readonly GoldenReviewerRole[];
  appliesTo: readonly ('lesson' | 'vocabulary')[];
  state: GoldenDimensionState;
  note?: string;
}

export interface GoldenSetDecisionContract {
  outcomes: readonly ['accepted', 'needs_changes'];
  fingerprint: typeof FINGERPRINT_CONTRACT;
  separateDecisionNamespace: true;
  baseCampaignUnchanged: true;
}

export interface GoldenSetReviewScopeManifest {
  schemaVersion: 1;
  scopeId: typeof GOLDEN_SET_SCOPE_ID;
  compatibleWithCampaignId: typeof TEACHER_REVIEW_CAMPAIGN_ID;
  reviewState: GoldenReviewState;
  decisionContract: GoldenSetDecisionContract;
  dimensions: readonly GoldenSetReviewDimension[];
  records: readonly GoldenSetScopeRecord[];
}

export interface GoldenSetReviewRecord {
  readonly ref: ContentRef;
  readonly sourcePath: string;
  readonly record: LearningContentRecord;
  readonly reviewStatus: 'draft';
  readonly fingerprint: string;
}

export interface GoldenSetReviewPacket {
  readonly scopeId: typeof GOLDEN_SET_SCOPE_ID;
  readonly compatibleWithCampaignId: typeof TEACHER_REVIEW_CAMPAIGN_ID;
  readonly reviewState: GoldenReviewState;
  readonly reviewVersion: string;
  readonly dimensions: readonly GoldenSetReviewDimension[];
  readonly records: readonly GoldenSetReviewRecord[];
  readonly decisionCount: 0;
  readonly promotionAllowed: false;
}

interface GoldenPathBundle {
  schemaVersion: number;
  paths: readonly LearningContentPath[];
}

export interface GoldenSetSourceBundle {
  readonly graph: LearningContentGraph;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Golden review scope: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`failed to read JSON at ${path}: ${message}`);
  }
}

function refKey(ref: ContentRef): string {
  return `${ref.collection}:${ref.type}:${ref.id}`;
}

function expectedSourcePath(record: GoldenSetScopeRecord): string {
  return record.collection === 'lessons'
    ? GOLDEN_SET_LESSONS_PATH
    : GOLDEN_SET_HSK_PATH;
}

function validateManifest(manifest: GoldenSetReviewScopeManifest): void {
  assert(manifest !== null && typeof manifest === 'object', 'manifest must be an object');
  assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  assert(manifest.scopeId === GOLDEN_SET_SCOPE_ID, 'scopeId is not the golden pilot scope');
  assert(
    manifest.compatibleWithCampaignId === TEACHER_REVIEW_CAMPAIGN_ID,
    `compatibleWithCampaignId must remain ${TEACHER_REVIEW_CAMPAIGN_ID}`,
  );
  assert(manifest.reviewState === 'pending-human-review', 'reviewState must remain pending-human-review');

  const contract = manifest.decisionContract;
  assert(contract !== null && typeof contract === 'object', 'decisionContract must be an object');
  assert(Array.isArray(contract.outcomes), 'decision outcomes must be an array');
  assert(
    contract.outcomes.length === 2 &&
      contract.outcomes[0] === 'accepted' &&
      contract.outcomes[1] === 'needs_changes',
    'decision outcomes must match the #360 accepted/needs_changes contract',
  );
  assert(contract.fingerprint === FINGERPRINT_CONTRACT, 'fingerprint contract drifted');
  assert(contract.separateDecisionNamespace === true, 'decision namespace must be separate');
  assert(contract.baseCampaignUnchanged === true, 'base campaign must be marked unchanged');

  assert(Array.isArray(manifest.dimensions), 'dimensions must be an array');
  assert(manifest.dimensions.length === GOLDEN_SET_DIMENSION_IDS.length, 'dimension count drifted');
  const dimensionIds = new Set<string>();
  for (const dimension of manifest.dimensions) {
    assert(isNonEmptyString(dimension.id), 'dimension id must be non-empty');
    assert(!dimensionIds.has(dimension.id), `duplicate dimension '${dimension.id}'`);
    dimensionIds.add(dimension.id);
    assert(
      (GOLDEN_SET_DIMENSION_IDS as readonly string[]).includes(dimension.id),
      `unsupported dimension '${dimension.id}'`,
    );
    assert(isNonEmptyString(dimension.label), `dimension '${dimension.id}' has no label`);
    assert(Array.isArray(dimension.reviewerRoles) && dimension.reviewerRoles.length > 0, `dimension '${dimension.id}' has no reviewer role`);
    assert(Array.isArray(dimension.appliesTo), `dimension '${dimension.id}' has invalid appliesTo`);
    assert(
      dimension.state === 'pending' || dimension.state === 'not-applicable',
      `dimension '${dimension.id}' has invalid state`,
    );
    if (dimension.state === 'not-applicable') {
      assert(dimension.appliesTo.length === 0, `not-applicable dimension '${dimension.id}' must have no record types`);
    } else {
      assert(dimension.appliesTo.length > 0, `pending dimension '${dimension.id}' must apply to a record type`);
    }
    for (const role of dimension.reviewerRoles) {
      assert(
        [
          'human-language-reviewer',
          'human-script-verifier',
          'human-regional-reviewer',
          'human-source-reviewer',
          'human-teaching-reviewer',
          'maintainer',
        ].includes(role),
        `dimension '${dimension.id}' has unsupported reviewer role '${role}'`,
      );
    }
    for (const type of dimension.appliesTo) {
      assert(
        type === 'lesson' || type === 'vocabulary',
        `dimension '${dimension.id}' has unsupported record type '${type}'`,
      );
    }
  }
  for (const id of GOLDEN_SET_DIMENSION_IDS) {
    assert(dimensionIds.has(id), `missing review dimension '${id}'`);
  }

  assert(Array.isArray(manifest.records), 'records must be an array');
  assert(manifest.records.length === GOLDEN_SET_RECORD_COUNT, `record count must be ${GOLDEN_SET_RECORD_COUNT}`);
  const recordKeys = new Set<string>();
  for (const record of manifest.records) {
    assert(isNonEmptyString(record.id), 'record id must be non-empty');
    assert(
      record.type === 'lesson' || record.type === 'vocabulary',
      `record '${record.id}' has unsupported type`,
    );
    assert(
      (record.collection === 'lessons' && record.type === 'lesson') ||
        (record.collection === 'hskVocabulary' && record.type === 'vocabulary'),
      `record '${record.id}' has a collection/type mismatch`,
    );
    assert(record.sourcePath === expectedSourcePath(record), `record '${record.id}' has an unexpected source path`);
    const key = `${record.collection}:${record.type}:${record.id}`;
    assert(!recordKeys.has(key), `duplicate record '${key}'`);
    recordKeys.add(key);
  }

  const lessonCount = manifest.records.filter((record) => record.collection === 'lessons').length;
  const hskCount = manifest.records.filter((record) => record.collection === 'hskVocabulary').length;
  assert(lessonCount === 4, `Taiwan Travel lesson count must be 4, got ${lessonCount}`);
  assert(hskCount === 14, `synthetic HSK record count must be 14, got ${hskCount}`);
}

function loadSourceBundle(root: string): GoldenSetSourceBundle {
  const lessonsPath = resolve(root, GOLDEN_SET_LESSONS_PATH);
  const hskPath = resolve(root, GOLDEN_SET_HSK_PATH);
  const graphPath = resolve(root, GOLDEN_SET_SOURCE_GRAPH_PATH);
  const paths = readJson<GoldenPathBundle>(graphPath);
  assert(paths.schemaVersion === 1, 'graph path schemaVersion must be 1');
  assert(Array.isArray(paths.paths), 'graph paths must be an array');

  const lessons = loadLessons(lessonsPath).lessons;
  const hskVocabulary = loadHskVocabulary(hskPath).vocabulary;
  return {
    graph: buildLearningContentGraph({
      lessons,
      vocabulary: [],
      hskVocabulary,
      phrases: [],
      roleplayCards: [],
      paths: paths.paths,
    }),
  };
}

function withoutTopLevelReviewStatus(record: LearningContentRecord): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record as unknown as Record<string, unknown>).filter(
      ([key]) => key !== 'reviewStatus',
    ),
  );
}

/**
 * Fingerprint the complete source record except for the top-level workflow
 * state. Script provenance, source metadata, graph-facing fields, and all
 * learner-facing fields therefore remain review-relevant.
 */
export async function fingerprintGoldenContentRecord(
  record: LearningContentRecord,
): Promise<string> {
  return sha256Hex(stableStringify(withoutTopLevelReviewStatus(record)));
}

function buildReviewVersionInput(
  manifest: GoldenSetReviewScopeManifest,
  records: readonly GoldenSetReviewRecord[],
  graph: LearningContentGraph,
): unknown {
  return {
    scopeId: manifest.scopeId,
    schemaVersion: manifest.schemaVersion,
    compatibleWithCampaignId: manifest.compatibleWithCampaignId,
    decisionContract: manifest.decisionContract,
    dimensions: manifest.dimensions,
    graph: {
      pathIds: graph.pathIds,
      relations: graph.relations,
    },
    records: records.map((record) => ({
      ref: record.ref,
      sourcePath: record.sourcePath,
      fingerprint: record.fingerprint,
    })),
  };
}

/**
 * Build the review packet for the separate golden set. This is deliberately a
 * repository/content boundary only: it does not write D1, call the #360 API,
 * or change any record's reviewStatus or provenance.
 */
export async function buildGoldenSetReviewPacket(
  manifest: GoldenSetReviewScopeManifest,
  sourceBundle: GoldenSetSourceBundle = loadSourceBundle(process.cwd()),
): Promise<GoldenSetReviewPacket> {
  validateManifest(manifest);

  const records: GoldenSetReviewRecord[] = [];
  const seen = new Set<string>();
  for (const entry of manifest.records) {
    const ref = {
      collection: entry.collection,
      type: entry.type,
      id: entry.id,
    } as ContentRef;
    const key = refKey(ref);
    assert(!seen.has(key), `duplicate resolved record '${key}'`);
    seen.add(key);
    const object = sourceBundle.graph.resolve(ref);
    assert(object !== undefined, `stale record reference '${key}'`);
    assert(object.ref.collection === entry.collection, `resolved collection drift for '${key}'`);
    assert(object.ref.type === entry.type, `resolved type drift for '${key}'`);
    assert(object.record.id === entry.id, `resolved id drift for '${key}'`);
    assert(object.record.reviewStatus === 'draft', `record '${key}' must remain draft for review`);
    if (entry.collection === 'hskVocabulary') {
      const recordValue = object.record as unknown as Record<string, unknown>;
      const source = recordValue.source;
      assert(
        source !== null &&
          typeof source === 'object' &&
          (source as Record<string, unknown>).type === 'synthetic-pilot',
        `HSK record '${key}' must use synthetic-pilot provenance`,
      );
      assert(
        !('traditional' in recordValue) &&
          recordValue.traditionalStatus === 'unavailable',
        `HSK record '${key}' must keep Traditional headword unavailable`,
      );
    }
    records.push({
      ref,
      sourcePath: entry.sourcePath,
      record: object.record,
      reviewStatus: 'draft',
      fingerprint: await fingerprintGoldenContentRecord(object.record),
    });
  }

  const reviewVersion = await sha256Hex(
    stableStringify(buildReviewVersionInput(manifest, records, sourceBundle.graph)),
  );

  return {
    scopeId: manifest.scopeId,
    compatibleWithCampaignId: manifest.compatibleWithCampaignId,
    reviewState: manifest.reviewState,
    reviewVersion,
    dimensions: manifest.dimensions,
    records,
    decisionCount: 0,
    promotionAllowed: false,
  };
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function recordLabel(ref: ContentRef): string {
  return `${ref.collection}:${ref.type}:${ref.id}`;
}

/** Render a human-review template without inventing identity, outcome, or approval. */
export function renderGoldenSetReviewPacket(packet: GoldenSetReviewPacket): string {
  const reviewedItems = packet.records
    .map((record) => `${recordLabel(record.ref)} (${record.sourcePath})`)
    .join(', ');
  const dimensionRows = packet.dimensions
    .map(
      (dimension) =>
        `| ${markdownCell(dimension.label)} | ${dimension.reviewerRoles.join(', ')} | ${dimension.appliesTo.join(', ') || 'none'} | ${dimension.state} |`,
    )
    .join('\n');
  const recordRows = packet.records
    .map(
      (record) =>
        `| ${recordLabel(record.ref)} | ${record.sourcePath} | draft | ${record.fingerprint} |`,
    )
    .join('\n');

  return [
    '# Golden Content Review Artifact',
    '',
    `**Scope:** ${packet.scopeId}`,
    `**Compatible decision contract:** ${packet.compatibleWithCampaignId} (separate decision namespace; base campaign unchanged)`,
    '**Reviewer identity:** {{HUMAN_REVIEWER_IDENTITY}}',
    '**Reviewer role:** {{HUMAN_REVIEWER_ROLE}}',
    '**Review date:** {{YYYY-MM-DD}}',
    `**Reviewed items:** ${reviewedItems}`,
    `**Review version:** ${packet.reviewVersion}`,
    '**Overall review outcome:** pending-human-review (human reviewer must record accepted, rejected, or needs-changes)',
    '**Decision storage:** No decisions recorded; this packet never fabricates or writes human decisions.',
    '',
    '## Approval Scope',
    '',
    '| Dimension | Reviewer roles | Applies to | State |',
    '|---|---|---|---|',
    dimensionRows,
    '',
    '## Per-record review fingerprints',
    '',
    '| Record | Source path | Current reviewStatus | Fingerprint |',
    '|---|---|---|---|',
    recordRows,
    '',
    '## Unresolved Issues',
    '',
    '{{LIST_UNRESOLVED_ISSUES_OR_None.}}',
    '',
    '## Blocked Content',
    '',
    '{{LIST_BLOCKED_CONTENT_OR_None.}}',
    '',
    '## Promotion guard',
    '',
    '- This packet records a pending human review scope only; it does not record a human decision.',
    '- All listed records must remain `reviewStatus: "draft"` until the required human artifact is complete and a maintainer performs the separate promotion step.',
    '- Script provenance and source metadata are preserved. HSK records remain synthetic-pilot records with Traditional headwords unavailable while Issue #81 is blocked.',
    '- This scope does not add records to, reinterpret, or write decisions for the fixed `issue-360-launch-v1` campaign.',
    '',
  ].join('\n');
}

/** Load and resolve the committed golden scope manifest. */
export async function loadGoldenSetReviewPacket(
  root = process.cwd(),
): Promise<GoldenSetReviewPacket> {
  const manifestPath = resolve(root, GOLDEN_SET_SCOPE_PATH);
  const manifest = readJson<GoldenSetReviewScopeManifest>(manifestPath);
  return buildGoldenSetReviewPacket(manifest, loadSourceBundle(root));
}
