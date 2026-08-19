import type {
  ContentRef,
  LearningContentCollection,
  LearningContentCollectionFor,
  LearningContentGraph,
  LearningContentGraphSources,
  LearningContentKind,
  LearningContentObject,
  LearningContentRecord,
  LearningContentRelation,
  LearningContentPath,
  LearningPathContentKind,
} from '../types/learningContent';
import type { LearningPathMemberRef, LearningPathRecord } from '../types/learningPath';
import { PHRASEBOOK_SCENARIOS } from '../types/phrasebook';
import { loadHskVocabulary } from './loadHskVocabulary';
import { loadLearningPaths } from './loadLearningPaths';
import { loadLessons } from './loadLessons';
import { loadPhrasebook } from './loadPhrasebook';
import { loadRoleplayCards } from './loadRoleplayCards';
import { loadVocabulary } from './loadVocabulary';

type DraftObject = {
  ref: ContentRef;
  record: LearningContentRecord;
  pathIds: string[];
};

const COLLECTION_BY_KIND: Record<LearningContentKind, LearningContentCollection> = {
  lesson: 'lessons',
  vocabulary: 'vocabulary',
  phrase: 'phrases',
  roleplay: 'roleplayCards',
};

const COLLECTION_KIND_MATCH: Record<LearningContentCollection, LearningContentKind> = {
  lessons: 'lesson',
  vocabulary: 'vocabulary',
  hskVocabulary: 'vocabulary',
  phrases: 'phrase',
  roleplayCards: 'roleplay',
};

const ROLEPLAY_SCENARIO_SET = new Set<string>(PHRASEBOOK_SCENARIOS);

const PATH_MEMBER_KINDS = new Set<LearningPathContentKind>([
  'lesson',
  'vocabulary',
  'phrase',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function refKey(ref: ContentRef): string {
  return `${ref.collection}:${ref.type}:${ref.id}`;
}

function normalizeRef<K extends LearningContentKind>(
  collection: LearningContentCollectionFor<K>,
  type: K,
  id: string,
): ContentRef<K> {
  return Object.freeze({ collection, type, id });
}

function normalizeExistingRef(ref: ContentRef): ContentRef {
  return normalizeRef(ref.collection, ref.type, ref.id);
}

function isContentRef(value: unknown): value is ContentRef {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.collection)) return false;
  if (!isNonEmptyString(candidate.type) || !isNonEmptyString(candidate.id)) {
    return false;
  }
  return COLLECTION_KIND_MATCH[candidate.collection as LearningContentCollection] === candidate.type;
}

function collectionForKind<K extends LearningContentKind>(
  kind: K,
): LearningContentCollectionFor<K> {
  return COLLECTION_BY_KIND[kind] as LearningContentCollectionFor<K>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function snapshotRecord<T extends LearningContentRecord>(record: T): T {
  return deepFreeze(structuredClone(record));
}

/**
 * Preserve the settled learning-path JSON contract while qualifying its
 * references at the derived graph boundary. HSK path members resolve against
 * the HSK collection; the existing Taiwan path resolves vocabulary members
 * against the general vocabulary collection.
 */
function qualifyPathMember(
  path: LearningPathRecord,
  member: LearningPathMemberRef,
): ContentRef<LearningPathContentKind> {
  const collection =
    member.type === 'lesson'
      ? 'lessons'
      : member.type === 'phrase'
        ? 'phrases'
        : path.availabilityReason === 'hsk'
          ? 'hskVocabulary'
          : 'vocabulary';
  return Object.freeze({
    collection,
    type: member.type,
    id: member.id,
  }) as ContentRef<LearningPathContentKind>;
}

function qualifyLearningPaths(
  paths: readonly LearningPathRecord[],
): readonly LearningContentPath[] {
  return paths.map((path) => ({
    id: path.id,
    members: path.members.map((member) => qualifyPathMember(path, member)),
  }));
}

function assertRecordId(
  kind: LearningContentKind,
  record: unknown,
  sourceLabel: string,
  index: number,
): asserts record is { id: string } & LearningContentRecord {
  if (!record || typeof record !== 'object') {
    throw new Error(`${sourceLabel}[${index}] is not a content record`);
  }
  const id = (record as Record<string, unknown>).id;
  if (!isNonEmptyString(id)) {
    throw new Error(`${sourceLabel}[${index}] has an invalid ${kind} id`);
  }
}

/**
 * Build a normalized, deduplicated content graph from existing collections.
 *
 * This function is deliberately pure with respect to the repository: it only
 * reads the supplied records, creates typed references, and fails closed on
 * duplicate IDs or stale relationships. It does not filter review statuses or
 * alter path availability.
 */
export function buildLearningContentGraph(
  sources: LearningContentGraphSources,
): LearningContentGraph {
  const drafts: DraftObject[] = [];
  const byKey = new Map<string, DraftObject>();

  function addCollection(
    kind: LearningContentKind,
    collection: LearningContentCollectionFor<typeof kind>,
    records: readonly LearningContentRecord[],
    sourceLabel: string,
  ): void {
    for (const [index, record] of records.entries()) {
      assertRecordId(kind, record, sourceLabel, index);
      const ref = normalizeRef(collection, kind, record.id);
      const key = refKey(ref);
      if (byKey.has(key)) {
        throw new Error(`duplicate content ref '${key}' from ${sourceLabel}`);
      }
      const draft: DraftObject = {
        ref,
        record,
        pathIds: [],
      };
      drafts.push(draft);
      byKey.set(key, draft);
    }
  }

  addCollection('lesson', 'lessons', sources.lessons, 'lessons');
  addCollection('vocabulary', 'vocabulary', sources.vocabulary, 'vocabulary');
  addCollection('vocabulary', 'hskVocabulary', sources.hskVocabulary, 'hskVocabulary');
  addCollection('phrase', 'phrases', sources.phrases, 'phrases');
  addCollection('roleplay', 'roleplayCards', sources.roleplayCards, 'roleplayCards');

  const pathIds: string[] = [];
  const pathContentById = new Map<string, readonly LearningContentObject[]>();
  const relations: LearningContentRelation[] = [];

  for (const [pathIndex, path] of sources.paths.entries()) {
    if (!path || typeof path !== 'object' || !isNonEmptyString(path.id)) {
      throw new Error(`paths[${pathIndex}] has an invalid path id`);
    }
    if (!Array.isArray(path.members)) {
      throw new Error(`path '${path.id}' has invalid members; expected an array`);
    }
    if (pathContentById.has(path.id)) {
      throw new Error(`duplicate learning path id '${path.id}'`);
    }

    const memberKeys = new Set<string>();
    const memberObjects: LearningContentObject[] = [];
    for (const [memberIndex, member] of path.members.entries()) {
      if (!isContentRef(member) || !PATH_MEMBER_KINDS.has(member.type as LearningPathContentKind)) {
        throw new Error(
          `path '${path.id}' member[${memberIndex}] has unsupported content ref`,
        );
      }
      const normalized = normalizeExistingRef(member) as ContentRef<LearningPathContentKind>;
      const key = refKey(normalized);
      if (memberKeys.has(key)) {
        throw new Error(`path '${path.id}' duplicates member '${key}'`);
      }
      memberKeys.add(key);

      const draft = byKey.get(key);
      if (!draft) {
        throw new Error(`path '${path.id}' has stale member '${key}'`);
      }
      draft.pathIds.push(path.id);
      relations.push({
        type: 'path-member',
        pathId: path.id,
        ref: normalized,
      });
      memberObjects.push(draft as LearningContentObject);
    }

    pathIds.push(path.id);
    pathContentById.set(path.id, Object.freeze(memberObjects));
  }

  function requireTarget(
    fromKind: LearningContentKind,
    fromId: string,
    targetKind: LearningContentKind,
    targetId: string,
    relationName: string,
  ): void {
    if (!isNonEmptyString(targetId)) {
      throw new Error(
        `${relationName} from '${fromKind}:${fromId}' has an invalid target id`,
      );
    }
    const targetRef = normalizeRef(
      collectionForKind(targetKind),
      targetKind,
      targetId,
    );
    if (!byKey.has(refKey(targetRef))) {
      throw new Error(
        `${relationName} from '${fromKind}:${fromId}' has stale target '${refKey(targetRef)}'`,
      );
    }
  }

  function requireSameScenario(
    relationName: string,
    fromId: string,
    targetKind: 'lesson' | 'phrase',
    targetId: string,
    expectedScenario: string,
  ): void {
    if (!ROLEPLAY_SCENARIO_SET.has(expectedScenario)) {
      throw new Error(
        `roleplay:${fromId} has an invalid scenario '${expectedScenario}'`,
      );
    }
    const target = byKey.get(
      refKey(normalizeRef(collectionForKind(targetKind), targetKind, targetId)),
    );
    if (!target) return;
    const targetRecord = target.record as unknown as Record<string, unknown>;
    const targetScenario =
      targetKind === 'lesson' ? targetRecord.travelScenario : targetRecord.scenario;
    if (
      isNonEmptyString(targetScenario) &&
      targetScenario !== expectedScenario
    ) {
      throw new Error(
        `${relationName} from 'roleplay:${fromId}' has cross-scenario target '${targetKind}:${targetId}' ` +
          `(${targetScenario}, expected ${expectedScenario})`,
      );
    }
  }

  function addVocabularyRelations(
    kind: 'lesson' | 'phrase',
    records: readonly { id: string; relatedVocabulary?: readonly string[] }[],
  ): void {
    for (const record of records) {
      if (record.relatedVocabulary === undefined) continue;
      if (!Array.isArray(record.relatedVocabulary)) {
        throw new Error(`${kind}:${record.id} has invalid relatedVocabulary`);
      }
      const seen = new Set<string>();
      for (const vocabularyId of record.relatedVocabulary) {
        if (seen.has(vocabularyId)) {
          throw new Error(
            `${kind}:${record.id} duplicates related vocabulary '${vocabularyId}'`,
          );
        }
        seen.add(vocabularyId);
        requireTarget(
          kind,
          record.id,
          'vocabulary',
          vocabularyId,
          `${kind}-vocabulary relation`,
        );
        if (kind === 'lesson') {
          relations.push({
            type: 'lesson-vocabulary',
            from: normalizeRef('lessons', 'lesson', record.id),
            to: normalizeRef('vocabulary', 'vocabulary', vocabularyId),
          });
        } else {
          relations.push({
            type: 'phrase-vocabulary',
            from: normalizeRef('phrases', 'phrase', record.id),
            to: normalizeRef('vocabulary', 'vocabulary', vocabularyId),
          });
        }
      }
    }
  }

  addVocabularyRelations('lesson', sources.lessons);
  addVocabularyRelations('phrase', sources.phrases);

  for (const [index, card] of sources.roleplayCards.entries()) {
    assertRecordId('roleplay', card, 'roleplayCards', index);
    const scenario = card.scenario as unknown;
    if (!isNonEmptyString(scenario) || !ROLEPLAY_SCENARIO_SET.has(scenario)) {
      throw new Error(`roleplay:${card.id} has an invalid scenario '${String(scenario)}'`);
    }
    const roleplayRef = normalizeRef('roleplayCards', 'roleplay', card.id);
    const lessonRefs = card.lessonRefs ?? [];
    const phraseRefs = card.phraseRefs;
    if (!Array.isArray(lessonRefs) || !Array.isArray(phraseRefs)) {
      throw new Error(`roleplay:${card.id} has invalid relationship refs`);
    }

    const seenLessons = new Set<string>();
    for (const lessonId of lessonRefs) {
      if (seenLessons.has(lessonId)) {
        throw new Error(`roleplay:${card.id} duplicates lesson '${lessonId}'`);
      }
      seenLessons.add(lessonId);
      requireTarget('roleplay', card.id, 'lesson', lessonId, 'roleplay-lesson relation');
      requireSameScenario(
        'roleplay-lesson relation',
        card.id,
        'lesson',
        lessonId,
        scenario,
      );
      relations.push({
        type: 'roleplay-lesson',
        from: roleplayRef,
        to: normalizeRef('lessons', 'lesson', lessonId),
      });
    }

    const seenPhrases = new Set<string>();
    for (const phraseId of phraseRefs) {
      if (seenPhrases.has(phraseId)) {
        throw new Error(`roleplay:${card.id} duplicates phrase '${phraseId}'`);
      }
      seenPhrases.add(phraseId);
      requireTarget('roleplay', card.id, 'phrase', phraseId, 'roleplay-phrase relation');
      requireSameScenario(
        'roleplay-phrase relation',
        card.id,
        'phrase',
        phraseId,
        scenario,
      );
      relations.push({
        type: 'roleplay-phrase',
        from: roleplayRef,
        to: normalizeRef('phrases', 'phrase', phraseId),
      });
    }
  }

  const objects = Object.freeze(
    drafts.map((draft) =>
      Object.freeze({
        ref: draft.ref,
        record: snapshotRecord(draft.record),
        pathIds: Object.freeze([...draft.pathIds]),
      }),
    ),
  ) as readonly LearningContentObject[];
  const objectByKey = new Map(objects.map((object) => [refKey(object.ref), object]));
  const resolvedPathContent = new Map<string, readonly LearningContentObject[]>();
  for (const [pathId, members] of pathContentById) {
    resolvedPathContent.set(
      pathId,
      Object.freeze(
        members.map((member) => objectByKey.get(refKey(member.ref))!),
      ),
    );
  }

  const frozenRelations = Object.freeze(
    relations.map((relation) => Object.freeze(relation)),
  );
  const graph: LearningContentGraph = {
    schemaVersion: 1,
    objects,
    relations: frozenRelations,
    pathIds: Object.freeze(pathIds),
    resolve(ref) {
      if (!isContentRef(ref)) return undefined;
      return objectByKey.get(refKey(ref));
    },
    getPathContent(pathId) {
      return resolvedPathContent.get(pathId) ?? [];
    },
  };
  return Object.freeze(graph);
}

/** Load the graph from the current canonical content collections. */
export function loadLearningContentGraph(): LearningContentGraph {
  const paths = loadLearningPaths().learningPaths;
  return buildLearningContentGraph({
    lessons: loadLessons().lessons,
    vocabulary: loadVocabulary().vocabulary,
    hskVocabulary: loadHskVocabulary().vocabulary,
    phrases: loadPhrasebook().phrases,
    roleplayCards: loadRoleplayCards(),
    paths: qualifyLearningPaths(paths),
  });
}
