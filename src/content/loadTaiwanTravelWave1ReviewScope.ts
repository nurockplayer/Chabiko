import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLearningContentGraph } from './loadLearningContentGraph';
import { loadLessons } from './loadLessons';
import { sha256Hex } from './loadTeacherReviewCampaign';
import { stableStringify } from '../domain/teacherReview';
import type {
  ContentRef,
  LearningContentPath,
  LearningContentRelation,
} from '../types/learningContent';
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
const TAIWAN_TRAVEL_WAVE1_PRODUCTION_BASELINE_IDS = new Set(
  Array.from({ length: 10 }, (_, index) =>
    `lesson-${String(index + 1).padStart(3, '0')}`,
  ),
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
  'review-status',
  'teaching-accuracy',
  'lesson-loop-usefulness',
  'pronunciation-guidance',
  'kanji-bridge-accuracy',
  'exercise-quality',
  'graph-and-scope-correctness',
  'source-and-script-provenance',
] as const;
type ReviewDimensionId = (typeof REVIEW_DIMENSION_IDS)[number];
export type TaiwanTravelWave1ReviewerRole =
  | 'human-language-reviewer'
  | 'human-script-verifier'
  | 'human-regional-reviewer'
  | 'human-source-reviewer'
  | 'human-teaching-reviewer'
  | 'maintainer';
const REVIEWER_ROLE_MATRIX = {
  'natural-taiwan-mandarin': [
    'human-language-reviewer',
    'human-regional-reviewer',
  ],
  'natural-japanese-explanation': ['human-language-reviewer'],
  'review-status': ['human-language-reviewer'],
  'teaching-accuracy': ['human-teaching-reviewer'],
  'lesson-loop-usefulness': ['human-teaching-reviewer'],
  'pronunciation-guidance': [
    'human-language-reviewer',
    'human-teaching-reviewer',
  ],
  'kanji-bridge-accuracy': ['human-teaching-reviewer'],
  'exercise-quality': ['human-teaching-reviewer'],
  'graph-and-scope-correctness': ['maintainer'],
  'source-and-script-provenance': [
    'human-source-reviewer',
    'human-script-verifier',
  ],
} as const satisfies Record<
  ReviewDimensionId,
  readonly TaiwanTravelWave1ReviewerRole[]
>;
const REVIEW_OUTCOMES = [
  'accepted',
  'rejected',
  'needs-changes',
  'not-reviewed',
] as const;
const REVIEWER_ROLES = new Set<TaiwanTravelWave1ReviewerRole>([
  'human-language-reviewer',
  'human-script-verifier',
  'human-regional-reviewer',
  'human-source-reviewer',
  'human-teaching-reviewer',
  'maintainer',
]);

export type TaiwanTravelWave1ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export interface TaiwanTravelWave1ScopeRecord {
  collection: 'lessons';
  type: 'lesson';
  id: string;
  sourcePath: string;
}

export interface TaiwanTravelWave1ReviewDimension {
  id: ReviewDimensionId;
  label: string;
  reviewerRoles: TaiwanTravelWave1ReviewerRole[];
  reviewerEvidence: TaiwanTravelWave1ReviewerEvidence[];
}

export interface TaiwanTravelWave1ReviewerEvidence {
  role: TaiwanTravelWave1ReviewerRole;
  outcome: TaiwanTravelWave1ReviewOutcome;
  reviewerIdentity: string | null;
  reviewDate: string | null;
  reviewVersion: string | null;
  findings: string | null;
}

export interface TaiwanTravelWave1OverallDecision {
  outcome: Exclude<TaiwanTravelWave1ReviewOutcome, 'not-reviewed'>;
  reviewerIdentity: string;
  reviewerRole: TaiwanTravelWave1ReviewerRole;
  reviewDate: string;
  reviewVersion: string;
  findings: string;
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
  overallDecision: TaiwanTravelWave1OverallDecision | null;
  unresolvedIssues: string[];
  blockedContent: string[];
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

export interface TaiwanTravelWave1ReviewVersionInput {
  schemaVersion: 1;
  scopeId: typeof TAIWAN_TRAVEL_WAVE1_SCOPE_ID;
  decisionContract: TaiwanTravelWave1DecisionContract;
  dimensions: Array<
    Pick<TaiwanTravelWave1ReviewDimension, 'id' | 'label' | 'reviewerRoles'>
  >;
  graph: {
    pathIds: readonly string[];
    relations: readonly LearningContentRelation[];
  };
  records: Array<
    Pick<TaiwanTravelWave1ReviewRecord, 'ref' | 'sourcePath' | 'fingerprint'>
  >;
}

export interface TaiwanTravelWave1ReviewPacket {
  scopeId: typeof TAIWAN_TRAVEL_WAVE1_SCOPE_ID;
  reviewState: 'pending-human-review';
  reviewVersion: string;
  decisionContract: TaiwanTravelWave1DecisionContract;
  dimensions: TaiwanTravelWave1ReviewDimension[];
  records: TaiwanTravelWave1ReviewRecord[];
  scenarioDistribution: typeof TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION;
  overallDecision: TaiwanTravelWave1OverallDecision | null;
  unresolvedIssues: string[];
  blockedContent: string[];
  decisionCount: number;
  promotionAllowed: false;
  productionLinked: false;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Taiwan Travel Wave 1 review scope: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
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
      'overallDecision',
      'unresolvedIssues',
      'blockedContent',
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

  if (manifest.overallDecision !== null) {
    validateExactKeys(
      manifest.overallDecision,
      [
        'outcome',
        'reviewerIdentity',
        'reviewerRole',
        'reviewDate',
        'reviewVersion',
        'findings',
      ],
      'overallDecision',
    );
    assert(
      contract.outcomes.includes(manifest.overallDecision.outcome),
      `overallDecision must use a canonical outcome`,
    );
    assert(
      isNonEmptyString(manifest.overallDecision.reviewerIdentity),
      'overallDecision requires a reviewer identity',
    );
    assert(
      REVIEWER_ROLES.has(manifest.overallDecision.reviewerRole),
      `overallDecision has unsupported reviewer role '${String(manifest.overallDecision.reviewerRole)}'`,
    );
    assert(
      isIsoCalendarDate(manifest.overallDecision.reviewDate),
      'overallDecision requires a valid ISO review date',
    );
    assert(
      /^[0-9a-f]{64}$/.test(manifest.overallDecision.reviewVersion),
      'overallDecision requires a valid reviewVersion',
    );
    assert(
      isNonEmptyString(manifest.overallDecision.findings),
      'overallDecision requires findings',
    );
  }
  assert(Array.isArray(manifest.unresolvedIssues), 'unresolvedIssues must be an array');
  for (const [index, issue] of manifest.unresolvedIssues.entries()) {
    assert(
      isNonEmptyString(issue) && issue === issue.trim(),
      `unresolvedIssues[${index}] must be a trimmed non-empty string`,
    );
  }
  assert(Array.isArray(manifest.blockedContent), 'blockedContent must be an array');
  for (const [index, recordId] of manifest.blockedContent.entries()) {
    assert(
      isNonEmptyString(recordId) && recordId === recordId.trim(),
      `blockedContent[${index}] must be a trimmed non-empty record ID`,
    );
    assert(
      TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS.includes(recordId),
      `blockedContent[${index}] references unknown record '${recordId}'`,
    );
  }
  assert(
    new Set(manifest.unresolvedIssues).size === manifest.unresolvedIssues.length,
    'unresolvedIssues must not contain duplicates',
  );
  assert(
    new Set(manifest.blockedContent).size === manifest.blockedContent.length,
    'blockedContent must not contain duplicates',
  );

  assert(Array.isArray(manifest.dimensions), 'dimensions must be an array');
  assert(manifest.dimensions.length === REVIEW_DIMENSION_IDS.length, 'review dimension count drifted');
  for (const [index, expectedId] of REVIEW_DIMENSION_IDS.entries()) {
    const dimension = manifest.dimensions[index];
    validateExactKeys(
      dimension,
      ['id', 'label', 'reviewerRoles', 'reviewerEvidence'],
      `dimension '${expectedId}'`,
    );
    assert(dimension?.id === expectedId, `review dimension order drifted at '${expectedId}'`);
    assert(isNonEmptyString(dimension.label), `dimension '${expectedId}' has no label`);
    assert(
      Array.isArray(dimension.reviewerRoles) && dimension.reviewerRoles.length > 0,
      `dimension '${expectedId}' has no reviewer roles`,
    );
    for (const role of dimension.reviewerRoles) {
      assert(REVIEWER_ROLES.has(role), `dimension '${expectedId}' has unsupported role '${role}'`);
    }
    const expectedRoles = REVIEWER_ROLE_MATRIX[expectedId];
    assert(
      dimension.reviewerRoles.length === expectedRoles.length &&
        dimension.reviewerRoles.every((role, roleIndex) => role === expectedRoles[roleIndex]),
      `reviewer roles drifted for dimension '${expectedId}'`,
    );
    assert(
      Array.isArray(dimension.reviewerEvidence) &&
        dimension.reviewerEvidence.length === expectedRoles.length,
      `reviewer evidence roles drifted for dimension '${expectedId}'`,
    );
    for (const [evidenceIndex, expectedRole] of expectedRoles.entries()) {
      const evidence = dimension.reviewerEvidence[evidenceIndex];
      validateExactKeys(
        evidence,
        [
          'role',
          'outcome',
          'reviewerIdentity',
          'reviewDate',
          'reviewVersion',
          'findings',
        ],
        `reviewer evidence '${expectedId}:${expectedRole}'`,
      );
      assert(
        evidence.role === expectedRole,
        `reviewer evidence roles drifted for dimension '${expectedId}'`,
      );
      assert(
        (REVIEW_OUTCOMES as readonly unknown[]).includes(evidence.outcome),
        `reviewer evidence '${expectedId}:${expectedRole}' has invalid outcome '${String(evidence.outcome)}'`,
      );
      const hasCompleteFields =
        isNonEmptyString(evidence.reviewerIdentity) &&
        isNonEmptyString(evidence.reviewDate) &&
        isNonEmptyString(evidence.reviewVersion) &&
        isNonEmptyString(evidence.findings);
      const isEmpty =
        evidence.reviewerIdentity === null &&
        evidence.reviewDate === null &&
        evidence.reviewVersion === null &&
        evidence.findings === null;
      if (evidence.outcome === 'not-reviewed') {
        assert(
          isEmpty,
          `not-reviewed reviewer evidence '${expectedId}:${expectedRole}' must remain empty`,
        );
      } else {
        assert(
          hasCompleteFields,
          `${evidence.outcome} reviewer evidence '${expectedId}:${expectedRole}' requires complete reviewer evidence`,
        );
        assert(
          isIsoCalendarDate(evidence.reviewDate ?? ''),
          `${evidence.outcome} reviewer evidence '${expectedId}:${expectedRole}' requires a valid ISO review date`,
        );
        assert(
          /^[0-9a-f]{64}$/.test(evidence.reviewVersion ?? ''),
          `${evidence.outcome} reviewer evidence '${expectedId}:${expectedRole}' requires a valid reviewVersion`,
        );
      }
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

  const roleOutcomes = manifest.dimensions.flatMap((dimension) =>
    dimension.reviewerEvidence.map(({ outcome }) => outcome),
  );
  if (manifest.overallDecision?.outcome === 'accepted') {
    assert(
      roleOutcomes.every((outcome) => outcome === 'accepted'),
      'accepted overallDecision requires every required role outcome to be accepted',
    );
    assert(
      manifest.unresolvedIssues.length === 0 && manifest.blockedContent.length === 0,
      'accepted overallDecision cannot retain unresolved issues or blocked content',
    );
  }
}

function validateReviewVersionBindings(
  manifest: TaiwanTravelWave1ReviewScopeManifest,
  reviewVersion: string,
): void {
  for (const dimension of manifest.dimensions) {
    for (const evidence of dimension.reviewerEvidence) {
      if (evidence.outcome === 'not-reviewed') continue;
      assert(
        evidence.reviewVersion === reviewVersion,
        `${evidence.outcome} reviewer evidence '${dimension.id}:${evidence.role}' is stale for reviewVersion '${reviewVersion}'`,
      );
    }
  }
  if (manifest.overallDecision !== null) {
    assert(
      manifest.overallDecision.reviewVersion === reviewVersion,
      `overallDecision is stale for reviewVersion '${reviewVersion}'`,
    );
  }
}

function validateStringObjectShape(
  value: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  label: string,
): Record<string, unknown> {
  validateExactKeys(value, [...requiredFields, ...optionalFields], label);
  const record = value as Record<string, unknown>;
  for (const field of requiredFields) {
    assert(isNonEmptyString(record[field]), `${label}.${field} must be a non-empty string`);
  }
  for (const field of optionalFields) {
    assert(
      record[field] === undefined || typeof record[field] === 'string',
      `${label}.${field} must be a string when present`,
    );
  }
  return record;
}

function validateOptionalStringArray(
  record: Record<string, unknown>,
  field: string,
  label: string,
): void {
  if (record[field] === undefined) return;
  assert(Array.isArray(record[field]), `${label}.${field} must be an array when present`);
  record[field].forEach((item, index) =>
    assert(
      typeof item === 'string',
      `${label}.${field}[${index}] must be a string`,
    ),
  );
}

function validatePrompt(prompt: unknown, label: string): void {
  validateExactKeys(prompt, ['promptJa', 'answerJa', 'distractorsJa'], label);
  const record = prompt as Record<string, unknown>;
  for (const field of ['promptJa', 'answerJa']) {
    assert(isNonEmptyString(record[field]), `${label}.${field} must be a non-empty string`);
  }
  assert(Array.isArray(record.distractorsJa), `${label}.distractorsJa must be an array`);
  const answer = String(record.answerJa).trim();
  const distractors = record.distractorsJa.map((value, index) => {
    assert(typeof value === 'string', `${label}.distractorsJa[${index}] must be a string`);
    return value.trim();
  });
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
  validateExactKeys(
    value,
    [
      'id',
      'titleJa',
      'level',
      'canDoJa',
      'learnerOutcomeJa',
      'hookJa',
      'travelScenario',
      'coreSentence',
      'sections',
      'chunks',
      'kanjiBridgeNotes',
      'soundFocus',
      'examples',
      'reviewPrompts',
      'travelTask',
      'reviewHookJa',
      'relatedVocabulary',
      'painPointTags',
      'reviewStatus',
    ],
    label,
  );
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
    'reviewHookJa',
  ]) {
    assert(isNonEmptyString(value[field]), `${label}.${field} must be a non-empty string`);
  }
  validateOptionalStringArray(value, 'relatedVocabulary', label);
  validateOptionalStringArray(value, 'painPointTags', label);
  assert(lesson.reviewStatus === 'draft', `${label} must remain draft`);
  assert(Array.isArray(lesson.sections) && lesson.sections.length >= 2, `${label} must have at least two sections`);
  lesson.sections.forEach((section, itemIndex) =>
    validateStringObjectShape(
      section,
      ['headingJa', 'contentJa'],
      [],
      `${label}.sections[${itemIndex}]`,
    ),
  );
  assert(Array.isArray(lesson.chunks) && lesson.chunks.length >= 3, `${label} must have at least three chunks`);
  lesson.chunks.forEach((chunk, itemIndex) =>
    validateStringObjectShape(
      chunk,
      ['chunk', 'meaning'],
      ['notesJa'],
      `${label}.chunks[${itemIndex}]`,
    ),
  );
  assert(
    Array.isArray(lesson.kanjiBridgeNotes) && lesson.kanjiBridgeNotes.length >= 1,
    `${label}.kanjiBridgeNotes must have at least one kanji bridge note`,
  );
  lesson.kanjiBridgeNotes.forEach((note, itemIndex) =>
    validateStringObjectShape(
      note,
      ['kanji', 'jpReading', 'noteJa'],
      [],
      `${label}.kanjiBridgeNotes[${itemIndex}]`,
    ),
  );
  assert(
    Array.isArray(lesson.soundFocus) && lesson.soundFocus.length === 1,
    `${label} must have exactly one sound-focus item`,
  );
  lesson.soundFocus.forEach((item, itemIndex) =>
    validateStringObjectShape(
      item,
      ['item', 'noteJa'],
      [],
      `${label}.soundFocus[${itemIndex}]`,
    ),
  );
  assert(Array.isArray(lesson.examples) && lesson.examples.length >= 2, `${label} must have at least two examples`);
  lesson.examples.forEach((example, itemIndex) => {
    const exampleValue = validateStringObjectShape(
      example,
      ['traditional', 'pinyin', 'japanese'],
      ['traditionalStatus', 'simplified', 'simplifiedStatus'],
      `${label}.examples[${itemIndex}]`,
    );
    assert(
      isNonEmptyString(exampleValue.simplified) &&
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
  sourceBundle.lessons.forEach(validateLesson);
  const knownLessonIds = new Set([
    ...sourceBundle.productionLessons
      .map((lesson) => lesson.id)
      .filter((id) => TAIWAN_TRAVEL_WAVE1_PRODUCTION_BASELINE_IDS.has(id)),
    ...actualIds,
  ]);
  const reviewHooks = new Set<string>();
  for (const lesson of sourceBundle.lessons) {
    const reviewHook = lesson.reviewHookJa?.trim() ?? '';
    assert(
      !reviewHooks.has(reviewHook),
      `lesson '${lesson.id}'.reviewHookJa must be distinct within the candidate package`,
    );
    reviewHooks.add(reviewHook);
    const lessonNumber = Number(lesson.id.slice(-3));
    const targetNumbers = [...reviewHook.matchAll(/第(\d+)課/g)].map((match) =>
      Number(match[1]),
    );
    const postReviewMarker = /^【第(\d+)課後の(?:場面|コース)復習】/.exec(
      reviewHook,
    );
    if (postReviewMarker !== null) {
      assert(
        Number(postReviewMarker[1]) === lessonNumber,
        `lesson '${lesson.id}'.reviewHookJa post-review marker must name its own lesson`,
      );
      for (const targetNumber of targetNumbers.slice(1)) {
        const targetId = `lesson-${String(targetNumber).padStart(3, '0')}`;
        assert(
          knownLessonIds.has(targetId),
          `lesson '${lesson.id}'.reviewHookJa has unresolved review target '${targetId}'`,
        );
      }
      assert(
        targetNumbers.length === 1,
        `lesson '${lesson.id}'.reviewHookJa post-review marker must not name another lesson`,
      );
      continue;
    }
    assert(
      targetNumbers.length > 0,
      `lesson '${lesson.id}'.reviewHookJa must name a concrete later 第N課 review target`,
    );
    for (const targetNumber of targetNumbers) {
      const targetId = `lesson-${String(targetNumber).padStart(3, '0')}`;
      assert(
        knownLessonIds.has(targetId),
        `lesson '${lesson.id}'.reviewHookJa has unresolved review target '${targetId}'`,
      );
      assert(
        targetNumber > lessonNumber,
        `lesson '${lesson.id}'.reviewHookJa must point to a later candidate lesson`,
      );
    }
  }

  const productionCanDos = new Set(
    sourceBundle.productionLessons
      .filter((lesson) => TAIWAN_TRAVEL_WAVE1_PRODUCTION_BASELINE_IDS.has(lesson.id))
      .map((lesson) => lesson.canDoJa.trim()),
  );
  const productionCoreSentences = new Set(
    sourceBundle.productionLessons
      .filter((lesson) => TAIWAN_TRAVEL_WAVE1_PRODUCTION_BASELINE_IDS.has(lesson.id))
      .map((lesson) => lesson.coreSentence.trim()),
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

export async function fingerprintTaiwanTravelWave1ReviewVersion(
  input: TaiwanTravelWave1ReviewVersionInput,
): Promise<string> {
  return sha256Hex(
    stableStringify({
      schemaVersion: input.schemaVersion,
      scopeId: input.scopeId,
      decisionContract: input.decisionContract,
      dimensions: input.dimensions.map(({ id, label, reviewerRoles }) => ({
        id,
        label,
        reviewerRoles,
      })),
      graph: input.graph,
      records: input.records.map(({ ref, sourcePath, fingerprint }) => ({
        ref,
        sourcePath,
        fingerprint,
      })),
    }),
  );
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

  const reviewVersion = await fingerprintTaiwanTravelWave1ReviewVersion({
    schemaVersion: manifest.schemaVersion,
    scopeId: manifest.scopeId,
    decisionContract: manifest.decisionContract,
    dimensions: manifest.dimensions,
    graph: { pathIds: graph.pathIds, relations: graph.relations },
    records,
  });
  validateReviewVersionBindings(manifest, reviewVersion);

  return {
    scopeId: TAIWAN_TRAVEL_WAVE1_SCOPE_ID,
    reviewState: 'pending-human-review',
    reviewVersion,
    decisionContract: manifest.decisionContract,
    dimensions: manifest.dimensions,
    records,
    scenarioDistribution: TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION,
    overallDecision: manifest.overallDecision,
    unresolvedIssues: manifest.unresolvedIssues,
    blockedContent: manifest.blockedContent,
    decisionCount: manifest.dimensions.reduce(
      (count, dimension) =>
        count +
        dimension.reviewerEvidence.filter(({ outcome }) => outcome !== 'not-reviewed')
          .length,
      0,
    ),
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
  const pendingRoleReviews = packet.dimensions.flatMap((dimension) =>
    dimension.reviewerEvidence
      .filter(({ outcome }) => outcome === 'not-reviewed')
      .map(
        ({ role }) => `${markdownCell(dimension.label)} (\`${role}\`)`,
      ),
  );
  const overallDecisionOutcome =
    packet.overallDecision?.outcome ?? '{{accepted | rejected | needs-changes}}';
  const overallReviewerIdentity =
    packet.overallDecision === null
      ? '{{OVERALL_DECISION__IDENTITY}}'
      : markdownCell(packet.overallDecision.reviewerIdentity);
  const overallReviewerRole =
    packet.overallDecision?.reviewerRole ?? '{{OVERALL_DECISION__ROLE}}';
  const overallReviewDate =
    packet.overallDecision?.reviewDate ?? '{{OVERALL_DECISION__YYYY-MM-DD}}';
  const overallReviewVersion =
    packet.overallDecision?.reviewVersion ??
    `{{OVERALL_DECISION__REVIEW_VERSION: ${packet.reviewVersion}}}`;
  const overallFindings =
    packet.overallDecision === null
      ? '{{OVERALL_DECISION__FINDINGS}}'
      : markdownCell(packet.overallDecision.findings);
  const repositoryReviewState =
    packet.overallDecision === null
      ? 'pending-human-review; no overall human decision is recorded; promotion is not allowed.'
      : `pending-human-review; overall human decision is ${packet.overallDecision.outcome}; promotion remains disallowed until a separate maintainer action.`;
  const pendingReviewSummary =
    pendingRoleReviews.length > 0
      ? `- Pending required role reviews: ${pendingRoleReviews.join(', ')}.`
      : '- All required role reviews have recorded outcomes; no role review remains `not-reviewed`.';
  const unresolvedIssues =
    packet.unresolvedIssues.length > 0
      ? packet.unresolvedIssues.map((issue) => `- ${markdownCell(issue)}`).join('\n')
      : 'None.';
  const blockedContent =
    packet.blockedContent.length > 0
      ? packet.blockedContent.map((recordId) => `- ${recordId}`).join('\n')
      : 'None.';
  const decisionStorage =
    `The validated \`${TAIWAN_TRAVEL_WAVE1_SCOPE_PATH}\` manifest is the canonical mutable input for per-role evidence, the overall decision, unresolved issues, and blocked content. ${packet.decisionCount} non-pending required-role outcome(s) are recorded; ` +
    `${packet.overallDecision === null ? 'no overall decision is recorded' : `the overall decision is ${packet.overallDecision.outcome}`}. These fields are excluded from the immutable review version and never write to the production or issue-360 review campaigns.`;
  const evidenceRows = packet.dimensions
    .flatMap((dimension) =>
      dimension.reviewerEvidence.map((evidence) => {
        const placeholderPrefix = `${dimension.id}__${evidence.role}`;
        const reviewerIdentity =
          evidence.reviewerIdentity === null
            ? `{{${placeholderPrefix}__IDENTITY}}`
            : markdownCell(evidence.reviewerIdentity);
        const reviewDate =
          evidence.reviewDate === null
            ? `{{${placeholderPrefix}__YYYY-MM-DD}}`
            : evidence.reviewDate;
        const reviewVersion =
          evidence.reviewVersion === null
            ? `{{${placeholderPrefix}__REVIEW_VERSION: ${packet.reviewVersion}}}`
            : evidence.reviewVersion;
        const findings =
          evidence.findings === null
            ? `{{${placeholderPrefix}__FINDINGS_OR_None.}}`
            : markdownCell(evidence.findings);
        return `| ${markdownCell(dimension.label)} | ${evidence.role} | ${evidence.outcome} | ${reviewerIdentity} | ${reviewDate} | ${reviewVersion} | ${findings} |`;
      }),
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
    '**Package state:** separate review package; production exposure uses a bounded reconciled copy',
    `**Reviewed items:** ${reviewedItems}`,
    `**Review version:** ${packet.reviewVersion}`,
    `**Overall review outcome:** ${overallDecisionOutcome}`,
    `**Overall reviewer identity:** ${overallReviewerIdentity}`,
    `**Overall reviewer role:** ${overallReviewerRole}`,
    `**Overall review date:** ${overallReviewDate}`,
    `**Overall reviewed version:** ${overallReviewVersion}`,
    `**Overall findings:** ${overallFindings}`,
    `**Current repository review state:** ${repositoryReviewState}`,
    `**Decision contract:** Canonical outcomes: ${packet.decisionContract.outcomes.join(', ')}. Promotable: ${packet.decisionContract.promotableOutcomes.join(', ')}. Non-promotable: ${packet.decisionContract.nonPromotableOutcomes.join(', ')}.`,
    `**Decision storage:** ${decisionStorage}`,
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
    'Each required role records its own outcome independently. Replace each outcome with exactly `accepted`, `rejected`, `needs-changes`, or `not-reviewed`. The committed manifest starts with every role at `not-reviewed`; role outcomes do not set the separate overall decision or authorize promotion.',
    '',
    'Every accepted, rejected, or needs-changes role outcome requires complete identity, valid ISO date, the exact immutable review version, and findings evidence. A not-reviewed role must keep all evidence fields empty. Mixed outcomes in a multi-role dimension are retained and remain non-promotable; a global reviewer identity is not sufficient.',
    '',
    '| Dimension | Reviewer role | Outcome | Reviewer identity | Review date | Reviewed version | Findings |',
    '|---|---|---|---|---|---|---|',
    evidenceRows,
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
    '- Rejected, needs-changes, and not-reviewed role outcomes remain non-promotable. Promotion requires a complete human artifact for the exact fingerprints above, every required role accepted with complete evidence, an independent overall accepted outcome, and a separate maintainer action.',
    pendingReviewSummary,
    '',
    '## Unresolved Issues',
    '',
    unresolvedIssues,
    '',
    '## Blocked Content',
    '',
    blockedContent,
    '',
  ].join('\n');
}
