import learningPathsData from '../../data/learning-paths.json';
import readinessData from '../../data/travel-quest-readiness.json';
import vocabularyData from '../../data/examples/valid/vocabulary.json';
import { loadLessonById } from './loadLessons';
import type { Lesson } from '../types/lesson';
import type {
  TravelQuestEvidenceSpec,
  TravelQuestTargetSpec,
} from '../types/travelQuestReadiness';
import type { LegacyVocabulary, VocabularyExample } from '../types/vocabulary';

const LESSON_ID = 'lesson-001';
const VOCABULARY_ID = 'voc-002';
const CONTENT_STATUSES = new Set(['authored', 'verified', 'generated']);
const REVIEW_STATUSES = new Set(['draft', 'reviewed', 'published']);
const EVIDENCE_TYPES = new Set([
  'completed-lesson-practice',
  'completed-phrase-practice',
  'completed-roleplay-rehearsal',
  'completed-vocabulary-session',
]);

export interface DesignLabPathLabel {
  readonly id: string;
  readonly labelJa: string;
}

export interface DesignLabFixture {
  readonly lesson: Lesson;
  readonly vocabulary: LegacyVocabulary;
  readonly travelTargets: readonly TravelQuestTargetSpec[];
  readonly pathLabels: readonly DesignLabPathLabel[];
}

export interface DesignLabFixtureSources {
  readonly lesson: Lesson | undefined;
  readonly vocabularyDocument: unknown;
  readonly readinessDocument: unknown;
  readonly learningPathsDocument: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isContentStatus(value: unknown): boolean {
  return typeof value === 'string' && CONTENT_STATUSES.has(value);
}

function isReviewStatus(value: unknown): boolean {
  return typeof value === 'string' && REVIEW_STATUSES.has(value);
}

function isVocabularyExample(value: unknown): value is VocabularyExample {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.traditional) ||
    !isContentStatus(value.traditionalStatus) ||
    !isNonEmptyString(value.pinyin) ||
    !isNonEmptyString(value.japanese)
  ) {
    return false;
  }

  if (value.simplified === undefined) {
    return value.simplifiedStatus === undefined || value.simplifiedStatus === 'unavailable';
  }

  return isNonEmptyString(value.simplified) && isContentStatus(value.simplifiedStatus);
}

function hasValidOptionalVocabularyMetadata(value: Record<string, unknown>): boolean {
  const optionalText = [
    value.similarityType,
    value.toneNote,
    value.caution,
    value.travelScenario,
  ];
  if (optionalText.some((field) => field !== undefined && !isNonEmptyString(field))) {
    return false;
  }

  if (
    value.painPointTags !== undefined &&
    (!Array.isArray(value.painPointTags) ||
      value.painPointTags.some((tag) => !isNonEmptyString(tag)))
  ) {
    return false;
  }

  if (
    value.examples !== undefined &&
    (!Array.isArray(value.examples) ||
      value.examples.some((example) => !isVocabularyExample(example)))
  ) {
    return false;
  }

  if (value.source !== undefined) {
    if (
      !isRecord(value.source) ||
      !isNonEmptyString(value.source.type) ||
      (value.source.note !== undefined && !isNonEmptyString(value.source.note))
    ) {
      return false;
    }
  }

  return true;
}

function isDesignLabVocabulary(value: unknown): value is LegacyVocabulary {
  return (
    isRecord(value) &&
    value.id === VOCABULARY_ID &&
    value.hsk === undefined &&
    isNonEmptyString(value.traditional) &&
    isContentStatus(value.traditionalStatus) &&
    isNonEmptyString(value.simplified) &&
    isContentStatus(value.simplifiedStatus) &&
    isNonEmptyString(value.pinyin) &&
    isNonEmptyString(value.japanese) &&
    isNonEmptyString(value.kana) &&
    isNonEmptyString(value.category) &&
    isReviewStatus(value.reviewStatus) &&
    hasValidOptionalVocabularyMetadata(value)
  );
}

function requireVocabulary(document: unknown): LegacyVocabulary {
  if (!isRecord(document) || !Array.isArray(document.vocabulary)) {
    throw new Error('Design lab requires a valid vocabulary document');
  }

  const vocabulary = document.vocabulary.find(
    (entry) => isRecord(entry) && entry.id === VOCABULARY_ID,
  );
  if (!isDesignLabVocabulary(vocabulary)) {
    throw new Error(`Design lab requires valid vocabulary '${VOCABULARY_ID}'`);
  }
  return vocabulary;
}

function isTravelEvidence(value: unknown): value is TravelQuestEvidenceSpec {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    EVIDENCE_TYPES.has(value.type) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.labelJa)
  );
}

function isTravelTarget(value: unknown): value is TravelQuestTargetSpec {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.labelJa) &&
    isNonEmptyString(value.goalJa) &&
    Array.isArray(value.evidence) &&
    value.evidence.length > 0 &&
    value.evidence.every(isTravelEvidence)
  );
}

function requireTravelTargets(document: unknown): readonly TravelQuestTargetSpec[] {
  if (
    !isRecord(document) ||
    document.schemaVersion !== 1 ||
    !Array.isArray(document.targets) ||
    document.targets.length === 0 ||
    !document.targets.every(isTravelTarget)
  ) {
    throw new Error('Design lab requires a valid travel readiness document');
  }
  return document.targets;
}

function requirePathLabels(document: unknown): readonly DesignLabPathLabel[] {
  if (!isRecord(document) || !Array.isArray(document.learningPaths) || document.learningPaths.length === 0) {
    throw new Error('Design lab requires learning path labels');
  }

  return document.learningPaths.map((path) => {
    if (!isRecord(path) || !isNonEmptyString(path.id) || !isNonEmptyString(path.labelJa)) {
      throw new Error('Design lab requires valid learning path labels');
    }
    return { id: path.id, labelJa: path.labelJa };
  });
}

/**
 * Build the shared design-lab fixture from explicitly supplied source data.
 * Kept injectable so malformed canonical-content boundaries are testable.
 */
export function buildDesignLabFixtureFromSources(
  sources: DesignLabFixtureSources,
): DesignLabFixture {
  if (!sources.lesson) {
    throw new Error(`Design lab requires lesson '${LESSON_ID}'`);
  }

  return {
    lesson: sources.lesson,
    vocabulary: requireVocabulary(sources.vocabularyDocument),
    travelTargets: requireTravelTargets(sources.readinessDocument),
    pathLabels: requirePathLabels(sources.learningPathsDocument),
  };
}

/**
 * Shared, source-derived content for the isolated design-lab routes.
 * Missing or malformed canonical content makes the prototypes unavailable
 * instead of substituting invented learning material.
 */
export function buildDesignLabFixture(): DesignLabFixture {
  return buildDesignLabFixtureFromSources({
    lesson: loadLessonById(LESSON_ID),
    vocabularyDocument: vocabularyData,
    readinessDocument: readinessData,
    learningPathsDocument: learningPathsData,
  });
}
