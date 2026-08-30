import { describe, expect, it } from 'vitest';
import {
  buildLearningContentGraph,
  loadLearningContentGraph,
} from '../src/content/loadLearningContentGraph';
import type {
  ContentRef,
  LearningContentGraphSources,
  LearningContentPath,
} from '../src/types/learningContent';
import type { Lesson } from '../src/types/lesson';
import type { PhrasebookPhrase } from '../src/types/phrasebook';
import type { RoleplayCardRecord } from '../src/types/roleplayCard';
import type {
  HskVocabulary,
  LegacyVocabulary,
} from '../src/types/vocabulary';

type ContentCollection =
  | 'lessons'
  | 'vocabulary'
  | 'hskVocabulary'
  | 'phrases'
  | 'roleplayCards';

function ref<T extends ContentRef['type']>(
  type: T,
  id: string,
  collection?: ContentCollection,
): ContentRef<T> {
  const defaultCollection =
    type === 'lesson'
      ? 'lessons'
      : type === 'phrase'
        ? 'phrases'
        : type === 'roleplay'
          ? 'roleplayCards'
          : 'vocabulary';
  return { collection: collection ?? defaultCollection, type, id } as ContentRef<T>;
}

function path(
  id: string,
  members: readonly ContentRef<'lesson' | 'vocabulary' | 'phrase'>[],
): LearningContentPath {
  return { id, members };
}

function vocabulary(id: string): LegacyVocabulary {
  return {
    id,
    traditional: '共用',
    traditionalStatus: 'authored',
    simplified: '共用',
    simplifiedStatus: 'authored',
    pinyin: 'gòngyòng',
    japanese: '共有',
    kana: 'キョウユウ',
    category: 'test',
    reviewStatus: 'draft',
  };
}

function hskVocabulary(id: string): HskVocabulary {
  return {
    id,
    simplified: '共用',
    simplifiedStatus: 'authored',
    pinyin: 'gòngyòng',
    japanese: '共有',
    hsk: {
      standardVersion: 'hsk-legacy-6-level',
      introducedAtLevel: 1,
      sourceLevelLabel: 'HSK 1',
    },
    source: { type: 'synthetic-test' },
    reviewStatus: 'draft',
  };
}

function lesson(
  id: string,
  relatedVocabulary?: string[],
  travelScenario?: string,
): Lesson {
  return {
    id,
    relatedVocabulary,
    travelScenario,
  } as unknown as Lesson;
}

function phrase(
  id: string,
  relatedVocabulary?: string[],
  scenario?: string,
): PhrasebookPhrase {
  return {
    id,
    relatedVocabulary,
    scenario,
  } as unknown as PhrasebookPhrase;
}

function roleplay(
  id: string,
  lessonRefs: string[] = [],
  phraseRefs: string[] = ['phrase-1'],
  scenario: string = 'transport',
): RoleplayCardRecord {
  return {
    id,
    lessonRefs,
    phraseRefs,
    scenario,
  } as unknown as RoleplayCardRecord;
}

function sources(
  overrides: Partial<LearningContentGraphSources> = {},
): LearningContentGraphSources {
  return {
    lessons: [],
    vocabulary: [],
    hskVocabulary: [],
    phrases: [],
    roleplayCards: [],
    paths: [],
    ...overrides,
  };
}

function qualifiedRef<T extends ContentRef['type']>(
  collection: ContentCollection,
  type: T,
  id: string,
): ContentRef<T> {
  return { collection, type, id } as unknown as ContentRef<T>;
}

describe('learning content graph', () => {
  it('indexes the current HSK and Taiwan Travel pilot collections', () => {
    const graph = loadLearningContentGraph();

    expect(graph.pathIds).toEqual([
      'taiwan-travel',
      'hsk-vocabulary',
      'kanji-bridge',
    ]);
    // 24 canonical lessons + the existing 4 vocabulary and 7 phrase members.
    expect(graph.getPathContent('taiwan-travel')).toHaveLength(35);
    // The HSK path contains only the current production-eligible level-1
    // projection; draft and unrouted records remain outside the learner path.
    expect(graph.getPathContent('hsk-vocabulary')).toHaveLength(2);
    expect(graph.resolve(ref('vocabulary', 'hsk-002', 'hskVocabulary'))?.record.reviewStatus).toBe(
      'reviewed',
    );
    const phraseRecord = graph.resolve(ref('phrase', 'phrase-001'))
      ?.record as PhrasebookPhrase | undefined;
    expect(phraseRecord?.relatedVocabulary).toEqual(['voc-001']);
    expect(graph.relations).toContainEqual({
      type: 'lesson-vocabulary',
      from: ref('lesson', 'lesson-001'),
      to: ref('vocabulary', 'voc-001'),
    });
    expect(graph.relations).toContainEqual({
      type: 'roleplay-phrase',
      from: ref('roleplay', 'roleplay-transport-001'),
      to: ref('phrase', 'phrase-002'),
    });
  });

  it('mounts one canonical HSK vocabulary object in HSK and Taiwan path views', () => {
    const shared = hskVocabulary('shared-vocabulary-001');
    const graph = buildLearningContentGraph(
      sources({
        hskVocabulary: [shared],
        paths: [
          path('taiwan-travel', [ref('vocabulary', shared.id, 'hskVocabulary')]),
          path('hsk-vocabulary', [ref('vocabulary', shared.id, 'hskVocabulary')]),
        ],
      }),
    );

    const object = graph.resolve(ref('vocabulary', shared.id, 'hskVocabulary'));
    expect(object?.pathIds).toEqual(['taiwan-travel', 'hsk-vocabulary']);
    expect(graph.getPathContent('taiwan-travel')[0]).toBe(object);
    expect(graph.getPathContent('hsk-vocabulary')[0]).toBe(object);
    expect(
      graph.objects.filter((candidate) => candidate.ref.id === shared.id),
    ).toHaveLength(1);
  });

  it('preserves review status instead of promoting records through indexing', () => {
    const graph = loadLearningContentGraph();

    expect(graph.resolve(ref('phrase', 'phrase-002'))?.record.reviewStatus).toBe(
      'draft',
    );
    expect(
      graph.resolve(ref('roleplay', 'roleplay-transport-001'))?.record.reviewStatus,
    ).toBe('draft');
  });

  it('fails closed on duplicate IDs and stale dependencies', () => {
    expect(() =>
      buildLearningContentGraph(
        sources({
          vocabulary: [vocabulary('duplicate-001'), vocabulary('duplicate-001')],
        }),
      ),
    ).toThrow(/duplicate content ref 'vocabulary:vocabulary:duplicate-001'/);

    expect(() =>
      buildLearningContentGraph(
        sources({
          vocabulary: [vocabulary('known-001')],
          paths: [path('taiwan-travel', [ref('vocabulary', 'missing-001')])],
        }),
      ),
    ).toThrow(/path 'taiwan-travel' has stale member 'vocabulary:vocabulary:missing-001'/);

    expect(() =>
      buildLearningContentGraph(
        sources({
          lessons: [lesson('lesson-1', ['missing-001'])],
        }),
      ),
    ).toThrow(/lesson-vocabulary relation.*stale target 'vocabulary:vocabulary:missing-001'/);
  });

  it('validates roleplay relationships against canonical lesson and phrase objects', () => {
    const graph = buildLearningContentGraph(
      sources({
        lessons: [lesson('lesson-1')],
        phrases: [phrase('phrase-1')],
        roleplayCards: [roleplay('roleplay-1', ['lesson-1'])],
      }),
    );

    expect(graph.relations).toContainEqual({
      type: 'roleplay-lesson',
      from: ref('roleplay', 'roleplay-1'),
      to: ref('lesson', 'lesson-1'),
    });
    expect(graph.relations).toContainEqual({
      type: 'roleplay-phrase',
      from: ref('roleplay', 'roleplay-1'),
      to: ref('phrase', 'phrase-1'),
    });
  });

  it('fails closed on cross-scenario roleplay dependencies', () => {
    expect(() =>
      buildLearningContentGraph(
        sources({
          lessons: [lesson('lesson-food-1', undefined, 'food')],
          phrases: [phrase('phrase-transport-1', undefined, 'transport')],
          roleplayCards: [
            roleplay(
              'roleplay-food-1',
              ['lesson-food-1'],
              ['phrase-transport-1'],
              'food',
            ),
          ],
        }),
      ),
    ).toThrow(/roleplay-phrase relation.*cross-scenario/);
  });

  it('keeps generic and HSK vocabulary with the same ID independently resolvable', () => {
    const sharedId = 'shared-vocabulary-001';
    const graph = buildLearningContentGraph(
      sources({
        vocabulary: [vocabulary(sharedId)],
        hskVocabulary: [hskVocabulary(sharedId)],
        paths: [
          path('taiwan-travel', [
            qualifiedRef('vocabulary', 'vocabulary', sharedId),
          ]),
          path('hsk-vocabulary', [
            qualifiedRef('hskVocabulary', 'vocabulary', sharedId),
          ]),
        ],
      }),
    );

    const generic = graph.resolve(
      qualifiedRef('vocabulary', 'vocabulary', sharedId),
    );
    const hsk = graph.resolve(
      qualifiedRef('hskVocabulary', 'vocabulary', sharedId),
    );

    expect(generic).toBeDefined();
    expect(hsk).toBeDefined();
    expect(generic).not.toBe(hsk);
    expect(generic?.pathIds).toEqual(['taiwan-travel']);
    expect(hsk?.pathIds).toEqual(['hsk-vocabulary']);
  });

  it('fails closed when a roleplay scenario is not controlled', () => {
    expect(() =>
      buildLearningContentGraph(
        sources({
          phrases: [phrase('phrase-1', undefined, 'transport')],
          roleplayCards: [
            roleplay('roleplay-1', [], ['phrase-1'], 'weather'),
          ],
        }),
      ),
    ).toThrow(/roleplay:roleplay-1 has an invalid scenario/);
  });

  it('exposes immutable record snapshots instead of canonical source objects', () => {
    const canonical = vocabulary('immutable-vocabulary-001');
    const graph = buildLearningContentGraph(
      sources({ vocabulary: [canonical] }),
    );
    const exposed = graph.resolve(ref('vocabulary', canonical.id))?.record;

    expect(exposed).toBeDefined();
    expect(exposed).not.toBe(canonical);
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(canonical.reviewStatus).toBe('draft');
  });
});
