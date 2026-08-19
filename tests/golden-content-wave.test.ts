import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLearningContentGraph } from '../src/content/loadLearningContentGraph';
import { loadHskVocabulary } from '../src/content/loadHskVocabulary';
import { loadLessons } from '../src/content/loadLessons';
import {
  resolveCurrentCampaign,
  sha256Hex,
} from '../src/content/loadTeacherReviewCampaign';
import { stableStringify } from '../src/domain/teacherReview';
import type { ContentRef, LearningContentPath } from '../src/types/learningContent';
import type { HskVocabularyType } from '../src/types/vocabulary';

const LESSONS_PATH = resolve(
  process.cwd(),
  'data/content-pilots/taiwan-travel-golden/lessons.json',
);
const HSK_PATH = resolve(
  process.cwd(),
  'data/content-pilots/hsk-golden/vocabulary.json',
);
const GRAPH_PATHS_PATH = resolve(
  process.cwd(),
  'data/content-pilots/graph-paths.json',
);

type PilotGraphPaths = {
  schemaVersion: number;
  paths: LearningContentPath[];
};

function loadPilotGraphPaths(): PilotGraphPaths {
  // Importing JSON through the filesystem keeps this test aligned with the
  // committed pilot artifact instead of duplicating path members in code.
  return JSON.parse(readFileSync(GRAPH_PATHS_PATH, 'utf8')) as PilotGraphPaths;
}

function pilotGraph() {
  const lessons = loadLessons(LESSONS_PATH).lessons;
  const hskVocabulary = loadHskVocabulary(HSK_PATH).vocabulary;
  const paths = loadPilotGraphPaths();
  return {
    lessons,
    hskVocabulary,
    paths,
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

function hskRef(id: string): ContentRef<'vocabulary'> {
  return { collection: 'hskVocabulary', type: 'vocabulary', id };
}

describe('golden content wave', () => {
  it('contains four Taiwan Travel lesson-loop records across independent scenarios', () => {
    const lessons = loadLessons(LESSONS_PATH).lessons;

    expect(lessons).toHaveLength(4);
    expect(lessons.map((lesson) => lesson.travelScenario)).toEqual([
      'airport',
      'transport',
      'food',
      'hotel',
    ]);
    expect(lessons.every((lesson) => lesson.reviewStatus === 'draft')).toBe(true);
    expect(
      lessons.every((lesson) =>
        lesson.reviewPrompts.some(
          (prompt) =>
            prompt.promptJa.trim() &&
            prompt.answerJa.trim() &&
            prompt.distractorsJa?.some((distractor) => distractor.trim() !== prompt.answerJa.trim()),
        ),
      ),
    ).toBe(true);
    expect(
      lessons.every((lesson) =>
        lesson.examples?.every(
          (example) => {
            const exampleRecord = example as unknown as Record<string, unknown>;
            return (
              exampleRecord.traditionalStatus === 'generated' &&
              exampleRecord.simplifiedStatus === 'generated'
            );
          },
        ),
      ),
    ).toBe(true);
  });

  it('contains fourteen rights-safe synthetic HSK-shaped draft records', () => {
    const records = loadHskVocabulary(HSK_PATH).vocabulary;

    expect(records).toHaveLength(14);
    expect(records.every((record) => record.reviewStatus === 'draft')).toBe(true);
    expect(records.every((record) => record.source.type === 'synthetic-pilot')).toBe(true);
    expect(records.every((record) => record.simplifiedStatus === 'authored')).toBe(true);
    expect(records.every((record) => record.traditionalStatus === 'unavailable')).toBe(true);
    expect(records.every((record) => !('traditional' in record))).toBe(true);
    expect(records.every((record) => !record.source.note?.includes('workbook'))).toBe(true);
  });

  it('reuses the same HSK objects in Taiwan and HSK path views', () => {
    const { graph } = pilotGraph();
    const shared = graph.resolve(hskRef('pilot-hsk-001-qing'));
    const taiwanHskObjects = graph
      .getPathContent('pilot-taiwan-travel-golden')
      .filter((object) => object.ref.collection === 'hskVocabulary');
    const hskObjects = graph
      .getPathContent('pilot-hsk-golden')
      .filter((object) => object.ref.collection === 'hskVocabulary');

    expect(shared).toBeDefined();
    expect(taiwanHskObjects).toHaveLength(10);
    expect(hskObjects).toHaveLength(14);
    expect(taiwanHskObjects.every((object) => hskObjects.includes(object))).toBe(true);
    expect(shared?.pathIds).toEqual([
      'pilot-taiwan-travel-golden',
      'pilot-hsk-golden',
    ]);
    expect(graph.getPathContent('pilot-taiwan-travel-golden')).toContain(shared);
    expect(graph.getPathContent('pilot-hsk-golden')).toContain(shared);
    expect(
      graph.relations.filter(
        (relation) =>
          relation.type === 'path-member' &&
          relation.ref.collection === 'hskVocabulary',
      ),
    ).toHaveLength(24);
  });

  it('keeps pilot records draft and rejects stale cross-track references', () => {
    const { graph, paths } = pilotGraph();
    const resolved = graph.resolve(hskRef('pilot-hsk-011-yuding'));
    const resolvedRecord = resolved?.record as HskVocabularyType | undefined;

    expect(resolvedRecord?.reviewStatus).toBe('draft');
    expect(resolvedRecord?.source.type).toBe('synthetic-pilot');
    expect(paths.schemaVersion).toBe(1);
    expect(() =>
      buildLearningContentGraph({
        lessons: loadLessons(LESSONS_PATH).lessons,
        vocabulary: [],
        hskVocabulary: loadHskVocabulary(HSK_PATH).vocabulary,
        phrases: [],
        roleplayCards: [],
        paths: [
          {
            id: 'pilot-invalid-stale-ref',
            members: [hskRef('pilot-hsk-does-not-exist')],
          },
        ],
      }),
    ).toThrow(/stale member 'hskVocabulary:vocabulary:pilot-hsk-does-not-exist'/);
  });

  it('preserves the fixed #360 teacher-review campaign and fingerprint semantics', async () => {
    const campaign = await resolveCurrentCampaign();

    expect(campaign.counts).toEqual({ phrases: 24, dialogs: 6, roleplay: 6 });
    const record = campaign.records[0];
    const phraseContent = record.content as { japanese: string };
    expect(await sha256Hex(stableStringify(record.content))).toBe(record.fingerprint);
    expect('reviewStatus' in record.content).toBe(false);
    expect(
      await sha256Hex(
        stableStringify({ ...phraseContent, japanese: `${phraseContent.japanese}。` }),
      ),
    ).not.toBe(record.fingerprint);
  });
});
