import type { LearningPathRecord } from '../types/learningPath';
import type { Lesson } from '../types/lesson';
import {
  TAIWAN_TRAVEL_ASSESSMENT_ROUTE,
  TAIWAN_TRAVEL_PATH_ROUTE,
} from '../domain/taiwanTravelQuizNavigation';
import { loadLearningPaths } from './loadLearningPaths';
import { loadAllRenderableLessons } from './loadLessons';

const TAIWAN_TRAVEL_PATH_ID = 'taiwan-travel';
export interface TaiwanTravelPathLesson {
  readonly id: string;
  readonly lessonNumber: number;
  readonly titleJa: string;
  readonly canDoJa: string;
  readonly href: string;
}

export interface TaiwanTravelPathModel {
  readonly id: 'taiwan-travel';
  readonly labelJa: string;
  readonly descriptionJa: string;
  readonly script: 'traditional';
  readonly destination: '/paths/taiwan-travel/';
  readonly lessons: readonly TaiwanTravelPathLesson[];
  readonly assessment: {
    readonly labelJa: '総合テスト';
    readonly href: string;
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Reconcile Taiwan path membership with the canonical learner-visible lesson
 * projection. Production eligibility comes from loadAllRenderableLessons()
 * over the canonical lesson bundle; reviewStatus remains truthful metadata and
 * is not rewritten or inferred here. Candidate packages are never loaded.
 */
export function buildTaiwanTravelPathModel(
  path: LearningPathRecord | undefined,
  productionLessons: readonly Lesson[],
): TaiwanTravelPathModel {
  assert(path !== undefined, 'missing required Taiwan Travel path');
  assert(
    path.id === TAIWAN_TRAVEL_PATH_ID,
    `expected Taiwan Travel path '${TAIWAN_TRAVEL_PATH_ID}', got '${path.id}'`,
  );
  assert(
    path.destination === TAIWAN_TRAVEL_PATH_ROUTE,
    `Taiwan Travel path destination must be '${TAIWAN_TRAVEL_PATH_ROUTE}'`,
  );
  assert(
    path.script === 'traditional',
    'Taiwan Travel path must remain Traditional-first',
  );
  assert(
    path.availability === 'available',
    'Taiwan Travel path must remain production-available',
  );
  assert(
    productionLessons.length > 0,
    'Taiwan Travel production lesson projection is empty',
  );

  const productionIds = productionLessons.map((lesson) => lesson.id);
  const productionIdSet = new Set<string>();
  for (const id of productionIds) {
    assert(
      !productionIdSet.has(id),
      `duplicate production lesson id '${id}'`,
    );
    productionIdSet.add(id);
  }

  const pathLessonIds = path.members
    .filter((member) => member.type === 'lesson')
    .map((member) => member.id);
  const pathLessonIdSet = new Set<string>();
  for (const id of pathLessonIds) {
    assert(
      !pathLessonIdSet.has(id),
      `duplicate lesson reference '${id}' in Taiwan Travel path`,
    );
    pathLessonIdSet.add(id);
    assert(
      productionIdSet.has(id),
      `non-production lesson reference '${id}' in Taiwan Travel path`,
    );
  }

  for (const id of productionIds) {
    assert(
      pathLessonIdSet.has(id),
      `missing production lesson reference '${id}' in Taiwan Travel path`,
    );
  }

  for (const [index, id] of pathLessonIds.entries()) {
    assert(
      id === productionIds[index],
      `Taiwan Travel lesson order mismatch at position ${index + 1}: expected '${productionIds[index]}', got '${id}'`,
    );
  }

  const lessons = productionLessons.map((lesson, index) =>
    Object.freeze({
      id: lesson.id,
      lessonNumber: index + 1,
      titleJa: lesson.titleJa,
      canDoJa: lesson.canDoJa,
      href: `/lessons/${lesson.id}/`,
    }),
  );

  return Object.freeze({
    id: TAIWAN_TRAVEL_PATH_ID,
    labelJa: path.labelJa,
    descriptionJa: path.descriptionJa,
    script: 'traditional',
    destination: TAIWAN_TRAVEL_PATH_ROUTE,
    lessons: Object.freeze(lessons),
    assessment: Object.freeze({
      labelJa: '総合テスト',
      href: TAIWAN_TRAVEL_ASSESSMENT_ROUTE,
    }),
  });
}

/** Load the direct-refresh route model from canonical production sources. */
export function loadTaiwanTravelPathModel(): TaiwanTravelPathModel {
  const path = loadLearningPaths().learningPaths.find(
    (candidate) => candidate.id === TAIWAN_TRAVEL_PATH_ID,
  );
  return buildTaiwanTravelPathModel(path, loadAllRenderableLessons());
}
