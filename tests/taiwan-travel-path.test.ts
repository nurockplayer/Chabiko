import { describe, expect, it } from 'vitest';
import { loadLearningPaths } from '../src/content/loadLearningPaths';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import {
  buildTaiwanTravelPathModel,
  loadTaiwanTravelPathModel,
} from '../src/content/taiwanTravelPath';
import type { LearningPathRecord } from '../src/types/learningPath';
import type { Lesson } from '../src/types/lesson';

function canonicalPath(): LearningPathRecord {
  const path = loadLearningPaths().learningPaths.find(
    (candidate) => candidate.id === 'taiwan-travel',
  );
  if (!path) throw new Error('test fixture is missing taiwan-travel');
  return structuredClone(path) as LearningPathRecord;
}

function canonicalLessons(): Lesson[] {
  return structuredClone(loadAllRenderableLessons()) as Lesson[];
}

function withLessonIds(
  path: LearningPathRecord,
  ids: readonly string[],
): LearningPathRecord {
  const nonLessons = path.members.filter((member) => member.type !== 'lesson');
  return {
    ...path,
    members: [
      ...ids.map((id) => ({ type: 'lesson' as const, id })),
      ...nonLessons,
    ],
  };
}

describe('Taiwan Travel path production reconciliation', () => {
  it('projects exactly the canonical renderable lessons in file order', () => {
    const lessons = canonicalLessons();
    const model = loadTaiwanTravelPathModel();

    expect(lessons.map((lesson) => lesson.id)).toEqual(
      Array.from({ length: 24 }, (_, index) =>
        `lesson-${String(index + 1).padStart(3, '0')}`,
      ),
    );
    expect(model.lessons.map((lesson) => lesson.id)).toEqual(
      lessons.map((lesson) => lesson.id),
    );
    expect(model.lessons.map((lesson) => lesson.lessonNumber)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(model.lessons.map((lesson) => lesson.titleJa)).toEqual(
      lessons.map((lesson) => lesson.titleJa),
    );
    expect(model.lessons.map((lesson) => lesson.canDoJa)).toEqual(
      lessons.map((lesson) => lesson.canDoJa),
    );
    expect(model.lessons.map((lesson) => lesson.href)).toEqual(
      lessons.map((lesson) => `/lessons/${lesson.id}/`),
    );
  });

  it('uses canonical renderability without rewriting truthful reviewStatus metadata', () => {
    const lessons = canonicalLessons();
    expect(lessons.some((lesson) => lesson.reviewStatus === 'draft')).toBe(true);

    const model = buildTaiwanTravelPathModel(canonicalPath(), lessons);
    expect(model.lessons).toHaveLength(24);
    expect(model.lessons.map((lesson) => lesson.id)).toEqual(
      lessons.map((lesson) => lesson.id),
    );
  });

  it('keeps the Traditional-first destination and distinct assessment action frozen', () => {
    const model = loadTaiwanTravelPathModel();
    expect(model.script).toBe('traditional');
    expect(model.destination).toBe('/paths/taiwan-travel/');
    expect(model.assessment).toEqual({
      labelJa: '総合テスト',
      href: '/paths/taiwan-travel/quiz/',
    });
  });

  it('fails closed when the Taiwan path is missing', () => {
    expect(() =>
      buildTaiwanTravelPathModel(undefined, canonicalLessons()),
    ).toThrow(/missing required Taiwan Travel path/);
  });

  it('fails closed on a stale or candidate-only lesson reference', () => {
    const path = withLessonIds(canonicalPath(), [
      ...canonicalLessons().map((lesson) => lesson.id).slice(0, 23),
      'lesson-999',
    ]);
    expect(() => buildTaiwanTravelPathModel(path, canonicalLessons())).toThrow(
      /non-production lesson reference 'lesson-999'/,
    );
  });

  it('fails closed on duplicate lesson references', () => {
    const ids = canonicalLessons().map((lesson) => lesson.id);
    const path = withLessonIds(canonicalPath(), [...ids, ids[0]]);
    expect(() => buildTaiwanTravelPathModel(path, canonicalLessons())).toThrow(
      /duplicate lesson reference 'lesson-001'/,
    );
  });

  it('fails closed when a production lesson reference is missing', () => {
    const ids = canonicalLessons()
      .map((lesson) => lesson.id)
      .filter((id) => id !== 'lesson-010');
    const path = withLessonIds(canonicalPath(), ids);
    expect(() => buildTaiwanTravelPathModel(path, canonicalLessons())).toThrow(
      /missing production lesson reference 'lesson-010'/,
    );
  });

  it('fails closed when lesson references are out of canonical order', () => {
    const ids = canonicalLessons().map((lesson) => lesson.id);
    [ids[3], ids[4]] = [ids[4], ids[3]];
    const path = withLessonIds(canonicalPath(), ids);
    expect(() => buildTaiwanTravelPathModel(path, canonicalLessons())).toThrow(
      /lesson order mismatch at position 4/,
    );
  });

  it('fails closed when a path lesson is no longer production-renderable', () => {
    const lessons = canonicalLessons().filter(
      (lesson) => lesson.id !== 'lesson-010',
    );
    expect(() => buildTaiwanTravelPathModel(canonicalPath(), lessons)).toThrow(
      /non-production lesson reference 'lesson-010'/,
    );
  });

  it('fails closed when the production projection itself contains duplicate ids', () => {
    const lessons = canonicalLessons();
    lessons.push({ ...lessons[0] });
    expect(() => buildTaiwanTravelPathModel(canonicalPath(), lessons)).toThrow(
      /duplicate production lesson id 'lesson-001'/,
    );
  });

  it('fails closed when the path destination or script drifts', () => {
    expect(() =>
      buildTaiwanTravelPathModel(
        { ...canonicalPath(), destination: '/lessons/' },
        canonicalLessons(),
      ),
    ).toThrow(/destination must be '\/paths\/taiwan-travel\/'/);
    expect(() =>
      buildTaiwanTravelPathModel(
        { ...canonicalPath(), script: 'simplified' },
        canonicalLessons(),
      ),
    ).toThrow(/must remain Traditional-first/);
  });
});
