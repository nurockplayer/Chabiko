import learningPathsData from '../../data/learning-paths.json';
import readinessData from '../../data/travel-quest-readiness.json';
import vocabularyData from '../../data/examples/valid/vocabulary.json';
import { loadLessonById } from './loadLessons';
import type { Lesson } from '../types/lesson';
import type {
  TravelQuestReadinessDocument,
  TravelQuestTargetSpec,
} from '../types/travelQuestReadiness';
import type { LegacyVocabulary, Vocabulary } from '../types/vocabulary';

const LESSON_ID = 'lesson-001';
const VOCABULARY_ID = 'voc-002';

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

function isLegacyVocabulary(entry: Vocabulary): entry is LegacyVocabulary {
  return (
    entry.id === VOCABULARY_ID &&
    'traditional' in entry &&
    typeof entry.traditional === 'string' &&
    typeof entry.kana === 'string' &&
    typeof entry.category === 'string'
  );
}

function requireVocabulary(): LegacyVocabulary {
  const entries = (vocabularyData as { vocabulary?: Vocabulary[] }).vocabulary;
  const vocabulary = entries?.find(isLegacyVocabulary);
  if (!vocabulary) {
    throw new Error(`Design lab requires vocabulary '${VOCABULARY_ID}'`);
  }
  return vocabulary;
}

function requireTravelTargets(): readonly TravelQuestTargetSpec[] {
  const document = readinessData as TravelQuestReadinessDocument;
  if (!Array.isArray(document.targets) || document.targets.length === 0) {
    throw new Error('Design lab requires travel readiness targets');
  }
  return document.targets;
}

function requirePathLabels(): readonly DesignLabPathLabel[] {
  const document = learningPathsData as {
    learningPaths?: Array<{ id?: unknown; labelJa?: unknown }>;
  };
  if (!Array.isArray(document.learningPaths) || document.learningPaths.length === 0) {
    throw new Error('Design lab requires learning path labels');
  }

  const labels = document.learningPaths.map((path) => {
    if (typeof path.id !== 'string' || path.id.length === 0 || typeof path.labelJa !== 'string' || path.labelJa.length === 0) {
      throw new Error('Design lab requires valid learning path labels');
    }
    return { id: path.id, labelJa: path.labelJa };
  });
  return labels;
}

/**
 * Shared, source-derived content for the isolated design-lab routes.
 *
 * This adapter intentionally does not own learner progress or mutate source
 * data. Missing required canonical content makes the prototypes unavailable
 * instead of substituting invented learning material.
 */
export function buildDesignLabFixture(): DesignLabFixture {
  const lesson = loadLessonById(LESSON_ID);
  if (!lesson) {
    throw new Error(`Design lab requires lesson '${LESSON_ID}'`);
  }

  return {
    lesson,
    vocabulary: requireVocabulary(),
    travelTargets: requireTravelTargets(),
    pathLabels: requirePathLabels(),
  };
}
