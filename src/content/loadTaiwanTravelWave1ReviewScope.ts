import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLearningContentGraph } from './loadLearningContentGraph';
import { loadLessons } from './loadLessons';
import { sha256Hex } from './loadTeacherReviewCampaign';
import { stableStringify } from '../domain/teacherReview';
import type { ContentRef, LearningContentPath } from '../types/learningContent';
import type { Lesson } from '../types/lesson';

export const TAIWAN_TRAVEL_WAVE1_SCOPE_ID = 'taiwan-travel-wave-1-v1';
export const TAIWAN_TRAVEL_WAVE1_PATH_ID = 'candidate-taiwan-travel-wave-1';
export const TAIWAN_TRAVEL_WAVE1_LESSONS_PATH =
  'data/content-pilots/taiwan-travel-wave-1/lessons.json';
export const TAIWAN_TRAVEL_WAVE1_GRAPH_PATH =
  'data/content-pilots/taiwan-travel-wave-1/graph-paths.json';
export const TAIWAN_TRAVEL_WAVE1_SCOPE_PATH =
  'data/content-pilots/taiwan-travel-wave-1/review-scope.json';
export const TAIWAN_TRAVEL_WAVE1_PACKET_PATH =
  'docs/content/reviews/taiwan-travel-wave-1-v1.md';

export const TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS = Object.freeze(
  Array.from({ length: 14 }, (_, index) => `lesson-${String(index + 11).padStart(3, '0')}`),
);

export const TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION = Object.freeze({
  airport: 2,
  transport: 2,
  food: 3,
  shopping: 2,
  hotel: 2,
  emergency: 2,
  social: 1,
});

const FINGERPRINT_CONTRACT =
  'sha256(stableStringify(recordWithoutTopLevelReviewStatus))';
const REVIEW_DIMENSION_IDS = [
  'natural-taiwan-mandarin',
  'natural-japanese-explanation',
  'lesson-loop-usefulness',
  'pronunciation-guidance',
  'kanji-bridge-accuracy',
  'exercise-quality',
  'graph-and-scope-correctness',
  'source-and-script-provenance',
] as const;
const REVIEW_DIMENSION_OUTCOMES = [
  'accepted',
  'rejected',
  'needs-changes',
  'not-reviewed',
] as const;
const REVIEWER_ROLES = new Set([
  'human-language-reviewer',
  'human-script-verifier',
  'human-regional-reviewer',
  'human-source-reviewer',
  'human-teaching-reviewer',
  'maintainer',
]);

type ReviewDimensionId = (typeof REVIEW_DIMENSION_IDS)[number];
export type TaiwanTravelWave1ReviewDimensionOutcome =
  (typeof REVIEW_DIMENSION_OUTCOMES)[number];

export interface TaiwanTravelWave1ScopeRecord {
  collection: 'lessons';
  type: 'lesson';
  id: string;
  sourcePath: string;
}

export interface TaiwanTravelWave1ReviewDimension {
  id: ReviewDimensionId;
  label: string;
  reviewerRoles: string[];
  outcome: TaiwanTravelWave1ReviewDimensionOutcome;
}

export interface TaiwanTravelWave1DecisionContract {
  outcomes: ['accepted', 'rejected', 'needs-changes'];
  promotableOutcomes: ['accepted'];
  nonPromotableOutcomes: ['rejected', 'needs-changes'];
  fingerprint: typeof FINGERPRINT_CONTRACT;
  separateDecisionNamespace: true;
  productionUnlinked: true;
}

export interface TaiwanTravelWave1ReviewScopeManifest {
  schemaVersion: 1;
  scopeId: typeof TAIWAN_TRAVEL_WAVE1_SCOPE_ID;
  reviewState: 'pending-human-review';
  decisionContract: TaiwanTravelWave1DecisionContract;
  dimensions: TaiwanTravelWave1ReviewDimension[];
  records: TaiwanTravelWave1ScopeRecord[];
}

interface MutableCandidatePath {
  id: string;
  members: ContentRef<'lesson'>[];
}

export interface TaiwanTravelWave1SourceBundle {
  lessons: Lesson[];
  paths: MutableCandidatePath[];
  productionLessons: Lesson[];
}

export interface TaiwanTravelWave1ReviewRecord {
  ref: ContentRef<'lesson'>;
  sourcePath: typeof TAIWAN_TRAVEL_WAVE1_LESSONS_PATH;
  lesson: Lesson;
  fingerprint: string;
}

export interface TaiwanTravelWave1ReviewPacket {
  scopeId: typeof TAIWAN_TRAVEL_WAVE1_SCOPE_ID;
  reviewState: 'pending-human-review';
  reviewVersion: string;
  decisionContract: TaiwanTravelWave1DecisionContract;
  dimensions: TaiwanTravelWave1ReviewDimension[];
  records: TaiwanTravelWave1ReviewRecord[];
  scenarioDistribution: typeof TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION;
  overallDecision: Exclude<TaiwanTravelWave1ReviewDimensionOutcome, 'not-reviewed'> | null;
  decisionCount: 0;
  promotionAllowed: false;
  productionLinked: false;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Taiwan Travel Wave 1 review scope: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
  const expected = new Set(expectedKeys);
  const unknownKeys = Object.keys(value).filter((key) => !expected.has(key)).sort();
  assert(
    unknownKeys.length === 0,
    `${label} has unknown field '${unknownKeys[0]}'`,
  );
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Failed to read Wave 1 JSON at ${path}: ${message}`);
  }
}

function refKey(ref: ContentRef<'lesson'>): string {
  return `${ref.collection}:${ref.type}:${ref.id}`;
}

function validateManifest(manifest: TaiwanTravelWave1ReviewScopeManifest): void {
  validateExactKeys(
    manifest,
    [
      'schemaVersion',
      'scopeId',
      'reviewState',
      'decisionContract',
      'dimensions',
      'records',
    ],
    'manifest',
  );
  assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  assert(manifest.scopeId === TAIWAN_TRAVEL_WAVE1_SCOPE_ID, 'scopeId drifted');
  assert(manifest.reviewState === 'pending-human-review', 'reviewState must remain pending-human-review');

  const contract = manifest.decisionContract;
  validateExactKeys(
    contract,
    [
      'outcomes',
      'promotableOutcomes',
      'nonPromotableOutcomes',
      'fingerprint',
      'separateDecisionNamespace',
      'productionUnlinked',
    ],
    'decisionContract',
  );
  assert(
    Array.isArray(contract.outcomes) &&
      contract.outcomes.length === 3 &&
      contract.outcomes[0] === 'accepted' &&
      contract.outcomes[1] === 'rejected' &&
      contract.outcomes[2] === 'needs-changes',
    'decision outcomes drifted',
  );
  assert(
    Array.isArray(contract.promotableOutcomes) &&
      contract.promotableOutcomes.length === 1 &&
      contract.promotableOutcomes[0] === 'accepted',
    'promotable outcomes drifted',
  );
  assert(
    Array.isArray(contract.nonPromotableOutcomes) &&
      contract.nonPromotableOutcomes.length === 2 &&
      contract.nonPromotableOutcomes[0] === 'rejected' &&
      contract.nonPromotableOutcomes[1] === 'needs-changes',
    'non-promotable outcomes drifted',
  );
  assert(contract.fingerprint === FINGERPRINT_CONTRACT, 'fingerprint contract drifted');
  assert(contract.separateDecisionNamespace === true, 'decision namespace must remain separate');
  assert(contract.productionUnlinked === true, 'scope must remain production-unlinked');

  assert(Array.isArray(manifest.dimensions), 'dimensions must be an array');
  assert(manifest.dimensions.length === REVIEW_DIMENSION_IDS.length, 'review dimension count drifted');
  for (const [index, expectedId] of REVIEW_DIMENSION_IDS.entries()) {
    const dimension = manifest.dimensions[index];
    validateExactKeys(
      dimension,
      ['id', 'label', 'reviewerRoles', 'outcome'],
      `dimension '${expectedId}'`,
    );
    assert(dimension?.id === expectedId, `review dimension order drifted at '${expectedId}'`);
    assert(isNonEmptyString(dimension.label), `dimension '${expectedId}' has no label`);
    assert(
      (REVIEW_DIMENSION_OUTCOMES as readonly unknown[]).includes(dimension.outcome),
      `dimension '${expectedId}' has invalid outcome '${String(dimension.outcome)}'`,
    );
    assert(
      Array.isArray(dimension.reviewerRoles) && dimension.reviewerRoles.length > 0,
      `dimension '${expectedId}' has no reviewer roles`,
    );
    for (const role of dimension.reviewerRoles) {
      assert(REVIEWER_ROLES.has(role), `dimension '${expectedId}' has unsupported role '${role}'`);
    }
  }

  assert(Array.isArray(manifest.records), 'records must be an array');
  assert(manifest.records.length === TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS.length, 'record count must be 14');
  const seen = new Set<string>();
  for (const [index, record] of manifest.records.entries()) {
    validateExactKeys(
      record,
      ['collection', 'type', 'id', 'sourcePath'],
      `record '${TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS[index] ?? index}'`,
    );
    const key = refKey(record);
    assert(!seen.has(key), `duplicate record '${key}'`);
    seen.add(key);
  }
  for (const [index, expectedId] of TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS.entries()) {
    const record = manifest.records[index];
    assert(record !== undefined, `missing manifest record '${expectedId}'`);
    assert(
      record.collection === 'lessons' && record.type === 'lesson',
      `record '${record.id}' has a collection/type mismatch`,
    );
    assert(
      record.sourcePath === TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
      `record '${record.id}' has an unexpected source path`,
    );
  }
}

function validateNonEmptyObjectFields(
  value: unknown,
  fields: readonly string[],
  label: string,
): void {
  assert(value !== null && typeof value === 'object', `${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const field of fields) {
    assert(isNonEmptyString(record[field]), `${label}.${field} must be a non-empty string`);
  }
}

function validatePrompt(prompt: unknown, label: string): void {
  validateNonEmptyObjectFields(prompt, ['promptJa', 'answerJa'], label);
  const record = prompt as Record<string, unknown>;
  assert(Array.isArray(record.distractorsJa), `${label} must have distractorsJa`);
  const answer = String(record.answerJa).trim();
  const distractors = record.distractorsJa.map((value) =>
    typeof value === 'string' ? value.trim() : '',
  );
  assert(
    distractors.length >= 2 &&
      distractors.every((value) => value.length > 0 && value !== answer) &&
      new Set(distractors).size === distractors.length,
    `${label} must have at least two unambiguous distractors distinct from the answer`,
  );
}

function validateLesson(lesson: Lesson, index: number): void {
  const label = `lesson '${lesson.id || index}'`;
  const value = lesson as unknown as Record<string, unknown>;
  for (const field of [
    'id',
    'titleJa',
    'level',
    'canDoJa',
    'learnerOutcomeJa',
    'hookJa',
    'travelScenario',
    'coreSentence',
    'travelTask',
  ]) {
    assert(isNonEmptyString(value[field]), `${label}.${field} must be a non-empty string`);
  }
  assert(lesson.reviewStatus === 'draft', `${label} must remain draft`);
  assert(Array.isArray(lesson.sections) && lesson.sections.length >= 2, `${label} must have at least two sections`);
  lesson.sections.forEach((section, itemIndex) =>
    validateNonEmptyObjectFields(section, ['headingJa', 'contentJa'], `${label}.sections[${itemIndex}]`),
  );
  assert(Array.isArray(lesson.chunks) && lesson.chunks.length >= 3, `${label} must have at least three chunks`);
  lesson.chunks.forEach((chunk, itemIndex) =>
    validateNonEmptyObjectFields(chunk, ['chunk', 'meaning'], `${label}.chunks[${itemIndex}]`),
  );
  assert(Array.isArray(lesson.kanjiBridgeNotes), `${label}.kanjiBridgeNotes must be an array`);
  lesson.kanjiBridgeNotes.forEach((note, itemIndex) =>
    validateNonEmptyObjectFields(note, ['kanji', 'jpReading', 'noteJa'], `${label}.kanjiBridgeNotes[${itemIndex}]`),
  );
  assert(
    Array.isArray(lesson.soundFocus) && lesson.soundFocus.length === 1,
    `${label} must have exactly one sound-focus item`,
  );
  lesson.soundFocus.forEach((item, itemIndex) =>
    validateNonEmptyObjectFields(item, ['item', 'noteJa'], `${label}.soundFocus[${itemIndex}]`),
  );
  assert(Array.isArray(lesson.examples) && lesson.examples.length >= 2, `${label} must have at least two examples`);
  lesson.examples.forEach((example, itemIndex) => {
    validateNonEmptyObjectFields(
      example,
      ['traditional', 'simplified', 'pinyin', 'japanese'],
      `${label}.examples[${itemIndex}]`,
    );
    const exampleValue = example as unknown as Record<string, unknown>;
    assert(
      exampleValue.traditionalStatus === 'generated' &&
        exampleValue.simplifiedStatus === 'generated',
      `${label}.examples[${itemIndex}] script provenance must remain generated`,
    );
  });
  assert(Array.isArray(lesson.reviewPrompts) && lesson.reviewPrompts.length >= 2, `${label} must have at least two review prompts`);
  lesson.reviewPrompts.forEach((prompt, itemIndex) =>
    validatePrompt(prompt, `${label}.reviewPrompts[${itemIndex}]`),
  );
}

function validateCandidateSources(sourceBundle: TaiwanTravelWave1SourceBundle): ReturnType<typeof buildLearningContentGraph> {
  assert(Array.isArray(sourceBundle.lessons), 'candidate lessons must be an array');
  assert(Array.isArray(sourceBundle.paths), 'candidate paths must be an array');
  assert(Array.isArray(sourceBundle.productionLessons), 'production lessons must be an array');
  sourceBundle.paths.forEach((path, index) => {
    validateExactKeys(
      path,
      ['id', 'members'],
      `candidate graph path '${index === 0 ? TAIWAN_TRAVEL_WAVE1_PATH_ID : index}'`,
    );
    if (Array.isArray(path.members)) {
      path.members.forEach((member, memberIndex) =>
        validateExactKeys(
          member,
          ['collection', 'type', 'id'],
          `candidate graph member '${TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS[memberIndex] ?? memberIndex}'`,
        ),
      );
    }
  });

  const graph = buildLearningContentGraph({
    lessons: sourceBundle.lessons,
    vocabulary: [],
    hskVocabulary: [],
    phrases: [],
    roleplayCards: [],
    paths: sourceBundle.paths as LearningContentPath[],
  });

  assert(sourceBundle.lessons.length === 14, 'candidate lesson count must be 14');
  const actualIds = sourceBundle.lessons.map((lesson) => lesson.id);
  assert(
    actualIds.every((id, index) => id === TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS[index]),
    'candidate lesson order must be exactly lesson-011 through lesson-024',
  );
  const productionIds = new Set(sourceBundle.productionLessons.map((lesson) => lesson.id));
  for (const id of actualIds) {
    assert(!productionIds.has(id), `candidate lesson '${id}' overlaps production`);
  }
  sourceBundle.lessons.forEach(validateLesson);

  const productionCanDos = new Set(
    sourceBundle.productionLessons.map((lesson) => lesson.canDoJa.trim()),
  );
  const productionCoreSentences = new Set(
    sourceBundle.productionLessons.map((lesson) => lesson.coreSentence.trim()),
  );
  const candidateCanDos = new Set<string>();
  const candidateCoreSentences = new Set<string>();
  for (const lesson of sourceBundle.lessons) {
    const canDo = lesson.canDoJa.trim();
    const coreSentence = lesson.coreSentence.trim();
    assert(!productionCanDos.has(canDo), `${lesson.id} duplicates a production Can-Do`);
    assert(
      !productionCoreSentences.has(coreSentence),
      `${lesson.id} duplicates a production core sentence`,
    );
    assert(!candidateCanDos.has(canDo), `${lesson.id} has a duplicate candidate Can-Do`);
    assert(
      !candidateCoreSentences.has(coreSentence),
      `${lesson.id} has a duplicate candidate core sentence`,
    );
    candidateCanDos.add(canDo);
    candidateCoreSentences.add(coreSentence);
  }

  const actualDistribution: Record<string, number> = {};
  for (const lesson of sourceBundle.lessons) {
    actualDistribution[lesson.travelScenario] =
      (actualDistribution[lesson.travelScenario] ?? 0) + 1;
  }
  assert(
    stableStringify(actualDistribution) ===
      stableStringify(TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION),
    'candidate scenario distribution must remain 2/2/3/2/2/2/1',
  );

  assert(sourceBundle.paths.length === 1, 'candidate graph must have exactly one isolated path');
  const [path] = sourceBundle.paths;
  assert(path.id === TAIWAN_TRAVEL_WAVE1_PATH_ID, 'candidate graph path ID drifted');
  assert(path.members.length === 14, 'candidate graph path must have 14 members');
  assert(
    path.members.every(
      (member, index) =>
        member.collection === 'lessons' &&
        member.type === 'lesson' &&
        member.id === TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS[index],
    ),
    'candidate graph member order must match lesson-011 through lesson-024',
  );
  return graph;
}

function withoutTopLevelReviewStatus(lesson: Lesson): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(lesson as unknown as Record<string, unknown>).filter(
      ([key]) => key !== 'reviewStatus',
    ),
  );
}

export async function fingerprintTaiwanTravelWave1Lesson(lesson: Lesson): Promise<string> {
  return sha256Hex(stableStringify(withoutTopLevelReviewStatus(lesson)));
}

function loadSourceBundle(root: string): TaiwanTravelWave1SourceBundle {
  const lessonBundle = loadLessons(resolve(root, TAIWAN_TRAVEL_WAVE1_LESSONS_PATH));
  const graphBundle = readJson<{ schemaVersion: number; paths: MutableCandidatePath[] }>(
    resolve(root, TAIWAN_TRAVEL_WAVE1_GRAPH_PATH),
  );
  validateExactKeys(graphBundle, ['schemaVersion', 'paths'], 'candidate graph');
  assert(graphBundle.schemaVersion === 1, 'candidate graph schemaVersion must be 1');
  const productionLessons = loadLessons(resolve(root, 'data/examples/valid/lessons.json'));
  return {
    lessons: lessonBundle.lessons,
    paths: graphBundle.paths,
    productionLessons: productionLessons.lessons,
  };
}

export async function buildTaiwanTravelWave1ReviewPacket(
  manifest: TaiwanTravelWave1ReviewScopeManifest,
  sourceBundle: TaiwanTravelWave1SourceBundle = loadSourceBundle(process.cwd()),
): Promise<TaiwanTravelWave1ReviewPacket> {
  validateManifest(manifest);
  const graph = validateCandidateSources(sourceBundle);
  const records: TaiwanTravelWave1ReviewRecord[] = [];
  const seen = new Set<string>();

  for (const entry of manifest.records) {
    const ref: ContentRef<'lesson'> = {
      collection: entry.collection,
      type: entry.type,
      id: entry.id,
    };
    const key = refKey(ref);
    assert(!seen.has(key), `duplicate record '${key}'`);
    seen.add(key);
    const object = graph.resolve(ref);
    assert(object !== undefined, `stale record reference '${key}'`);
    assert(object.ref.collection === 'lessons' && object.ref.type === 'lesson', `resolved type drift for '${key}'`);
    assert(object.record.id === entry.id, `resolved ID drift for '${key}'`);
    const lesson = object.record as Lesson;
    records.push({
      ref,
      sourcePath: TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
      lesson,
      fingerprint: await fingerprintTaiwanTravelWave1Lesson(lesson),
    });
  }
  assert(
    records.every(
      (record, index) => record.lesson.id === TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS[index],
    ),
    'manifest lesson order must be exactly lesson-011 through lesson-024',
  );

  const reviewVersion = await sha256Hex(
    stableStringify({
      schemaVersion: manifest.schemaVersion,
      scopeId: manifest.scopeId,
      decisionContract: manifest.decisionContract,
      dimensions: manifest.dimensions,
      graph: { pathIds: graph.pathIds, relations: graph.relations },
      records: records.map((record) => ({
        ref: record.ref,
        sourcePath: record.sourcePath,
        fingerprint: record.fingerprint,
      })),
    }),
  );

  return {
    scopeId: TAIWAN_TRAVEL_WAVE1_SCOPE_ID,
    reviewState: 'pending-human-review',
    reviewVersion,
    decisionContract: manifest.decisionContract,
    dimensions: manifest.dimensions,
    records,
    scenarioDistribution: TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION,
    overallDecision: null,
    decisionCount: 0,
    promotionAllowed: false,
    productionLinked: false,
  };
}

export async function loadTaiwanTravelWave1ReviewPacket(
  root = process.cwd(),
): Promise<TaiwanTravelWave1ReviewPacket> {
  const manifest = readJson<TaiwanTravelWave1ReviewScopeManifest>(
    resolve(root, TAIWAN_TRAVEL_WAVE1_SCOPE_PATH),
  );
  return buildTaiwanTravelWave1ReviewPacket(manifest, loadSourceBundle(root));
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderTaiwanTravelWave1ReviewPacket(
  packet: TaiwanTravelWave1ReviewPacket,
): string {
  const dimensionRows = packet.dimensions
    .map(
      (dimension) =>
        `| ${markdownCell(dimension.label)} | ${dimension.reviewerRoles.join(', ')} | ${dimension.outcome} |`,
    )
    .join('\n');
  const recordRows = packet.records
    .map(
      (record) =>
        `| ${record.lesson.id} | ${record.lesson.travelScenario} | ${markdownCell(record.lesson.canDoJa)} | draft | ${record.fingerprint} |`,
    )
    .join('\n');
  const reviewedItems = packet.records
    .map((record) => `lessons:lesson:${record.lesson.id} (${record.sourcePath})`)
    .join(', ');

  return [
    '# Taiwan Travel Wave 1 Human Review Packet',
    '',
    `**Scope:** ${packet.scopeId}`,
    '**Package state:** isolated candidate content; not linked to the production Taiwan path',
    '**Reviewer identity:** {{HUMAN_REVIEWER_IDENTITY}}',
    '**Reviewer role:** {{HUMAN_REVIEWER_ROLE}}',
    '**Review date:** {{YYYY-MM-DD}}',
    `**Reviewed items:** ${reviewedItems}`,
    `**Review version:** ${packet.reviewVersion}`,
    '**Overall review outcome:** {{accepted | rejected | needs-changes}}',
    '**Current repository review state:** pending-human-review; no overall human decision is recorded; promotion is not allowed.',
    `**Decision contract:** Canonical outcomes: ${packet.decisionContract.outcomes.join(', ')}. Promotable: ${packet.decisionContract.promotableOutcomes.join(', ')}. Non-promotable: ${packet.decisionContract.nonPromotableOutcomes.join(', ')}.`,
    '**Decision storage:** No decisions recorded; if a future compatible writer is added, accepted maps to accepted and needs-changes maps to needs_changes; rejected remains non-promotable and is never written as an accepted decision. This packet has a separate decision namespace and does not write to the production or issue-360 review campaigns.',
    '',
    '## Coverage reconciliation',
    '',
    '| Scenario | Required | Included |',
    '|---|---:|---:|',
    ...Object.entries(packet.scenarioDistribution).map(
      ([scenario, count]) => `| ${scenario} | ${count} | ${count} |`,
    ),
    '',
    '## Approval Scope',
    '',
    'Replace each outcome with exactly `accepted`, `rejected`, `needs-changes`, or `not-reviewed`. The committed manifest starts at `not-reviewed`; a per-dimension outcome does not set the separate overall decision or authorize promotion.',
    '',
    '| Dimension | Reviewer roles | Outcome |',
    '|---|---|---|',
    dimensionRows,
    '',
    '## Exact lesson versions',
    '',
    '| Lesson | Scenario | Can-Do | reviewStatus | Fingerprint |',
    '|---|---|---|---|---|',
    recordRows,
    '',
    '## Human gate',
    '',
    '- All 14 lessons remain `reviewStatus: "draft"`.',
    '- Script provenance for the candidate examples remains `generated`.',
    '- Technical validation does not constitute a human content decision.',
    '- Rejected, needs-changes, and not-reviewed dimensions remain non-promotable. Promotion requires a complete human artifact for the exact fingerprints above, all required dimensions accepted, an overall accepted outcome, and a separate maintainer action.',
    '- The human language, teaching, and regional review remain pending, as do source/provenance and script verification.',
    '',
    '## Unresolved Issues',
    '',
    '{{LIST_UNRESOLVED_ISSUES_OR_None.}}',
    '',
    '## Blocked Content',
    '',
    '{{LIST_BLOCKED_CONTENT_OR_None.}}',
    '',
  ].join('\n');
}
