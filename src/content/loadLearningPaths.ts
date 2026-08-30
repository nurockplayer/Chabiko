import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  LearningPathAvailability,
  LearningPathAvailabilityReason,
  LearningPathMemberType,
  LearningPathRecord,
  LearningPathsDocument,
  LearningPathScript,
} from '../types/learningPath';
import {
  loadHskLearnerProjection,
  loadHskVocabulary,
} from './loadHskVocabulary';
import { HSK_LEVEL_ONE_DESTINATION } from '../domain/hskLearnerProjection';

const DEFAULT_PATHS_PATH = 'data/learning-paths.json';

/** Production source collections for member references (cross-reference). */
const LESSONS_PATH = 'data/examples/valid/lessons.json';
const VOCABULARY_PATH = 'data/examples/valid/vocabulary.json';
const PHRASEBOOK_PATH = 'data/examples/valid/phrasebook.json';

/** Frozen v1 path set, in delivery order. */
const FIXED_PATH_ORDER = ['taiwan-travel', 'hsk-vocabulary', 'kanji-bridge'] as const;

const VALID_SCRIPTS = new Set<LearningPathScript>(['traditional', 'simplified']);
const VALID_AVAILABILITY_REASONS = new Set<LearningPathAvailabilityReason>([
  'available',
  'unavailable',
  'hsk',
]);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}

function parseDocument(raw: string, path: string): LearningPathsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse learning paths at ${path}: not valid JSON`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).learningPaths)
  ) {
    throw new Error(
      `Invalid learning-paths structure at ${path}: expected {learningPaths: [...]}`,
    );
  }
  return parsed as LearningPathsDocument;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Read the IDs of a production content collection referenced by path members.
 * Parses the same repository-controlled fixture files the existing loaders
 * consume; a malformed or missing source fails closed.
 */
function loadCollectionIds(
  sourcePath: string,
  collectionKey: string,
): ReadonlySet<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  } catch {
    throw new Error(
      `Failed to parse content collection at ${sourcePath}: not valid JSON`,
    );
  }
  const collection = (parsed as Record<string, unknown>)[collectionKey];
  assert(
    parsed !== null &&
      typeof parsed === 'object' &&
      Array.isArray(collection),
    `Invalid content collection structure at ${sourcePath}: expected {${collectionKey}: [...]}`,
  );
  const ids = new Set<string>();
  for (const item of collection as unknown[]) {
    if (item && typeof item === 'object') {
      const id = (item as Record<string, unknown>).id;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

/**
 * Current production content sets that own each member reference type. Any
 * referenced ID that does not exist in its production set is a stale
 * reference. The vocabulary set merges the general vocabulary collection with
 * the current production HSK vocabulary, since both are vocabulary content.
 */
function loadMemberSets(
  hskFilePath?: string,
): Map<LearningPathMemberType, ReadonlySet<string>> {
  const vocabularyIds = new Set(
    loadCollectionIds(VOCABULARY_PATH, 'vocabulary'),
  );
  for (const entry of loadHskVocabulary(hskFilePath).vocabulary) {
    vocabularyIds.add(entry.id);
  }
  return new Map<LearningPathMemberType, ReadonlySet<string>>([
    ['lesson', loadCollectionIds(LESSONS_PATH, 'lessons')],
    ['vocabulary', vocabularyIds],
    ['phrase', loadCollectionIds(PHRASEBOOK_PATH, 'phrasebook')],
  ]);
}

/** Effective availability for a fixed-reason path. */
function resolveFixedAvailability(
  record: LearningPathRecord,
): LearningPathAvailability {
  assert(
    record.availabilityReason === 'available' || record.availabilityReason === 'unavailable',
    `path '${record.id}' has invalid availabilityReason '${record.availabilityReason}'`,
  );
  return record.availabilityReason;
}

/**
 * Load the repository-controlled learning-path contract.
 *
 * Deterministic and fail-closed: throws on file-not-found, invalid JSON,
 * invalid schemaVersion, unknown/invalid fields, duplicate path or member
 * IDs, missing fixed paths, out-of-fixed-order paths, invalid script or
 * destination, invalid availability descriptors or HSK route metadata, or
 * stale member references that no longer exist in their production content
 * collection. The returned
 * document and every nested record are deeply frozen; each call produces
 * independent references.
 *
 * The loader performs no runtime script conversion and never duplicates
 * content: paths only reference content IDs.
 */
export function loadLearningPaths(
  filePath?: string,
  hskFilePath?: string,
): LearningPathsDocument {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_PATHS_PATH);
  const document = parseDocument(readFileSync(path, 'utf-8'), path);

  assert(
    document.schemaVersion === 1,
    `learning-paths schemaVersion must be 1, got '${document.schemaVersion}'`,
  );

  const hskProjection = loadHskLearnerProjection(hskFilePath);
  const memberSets = loadMemberSets(hskFilePath);

  const enrichedPaths: LearningPathRecord[] = [];
  const seenPathIds = new Set<string>();
  for (const [index, record] of document.learningPaths.entries()) {
    const prefix = `learningPaths[${index}]`;
    assert(isNonEmptyString(record.id), `${prefix} has a missing or empty id`);
    assert(!seenPathIds.has(record.id), `duplicate learning path id '${record.id}'`);
    seenPathIds.add(record.id);

    assert(
      index < FIXED_PATH_ORDER.length,
      `unexpected extra learning path '${record.id}' beyond the frozen v1 set`,
    );
    assert(
      record.id === FIXED_PATH_ORDER[index],
      `learning path order violation: expected '${FIXED_PATH_ORDER[index]}' at index ${index}, got '${record.id}'`,
    );

    assert(VALID_SCRIPTS.has(record.script), `${prefix} has invalid script '${record.script}'`);
    assert(isNonEmptyString(record.destination), `${prefix} has a missing or empty destination`);
    assert(
      record.destination.endsWith('/'),
      `${prefix} destination '${record.destination}' must end with '/'`,
    );
    assert(VALID_AVAILABILITY_REASONS.has(record.availabilityReason), `${prefix} has invalid availabilityReason '${record.availabilityReason}'`);

    let availability: LearningPathAvailability;
    if (record.availabilityReason === 'hsk') {
      const descriptor = record.hsk;
      assert(
        descriptor !== undefined &&
          Array.isArray(descriptor.levels) &&
          descriptor.levels.length > 0 &&
          descriptor.levels.every((level) => Number.isInteger(level) && level >= 1),
        `${prefix} must declare a valid hsk descriptor with at least one positive integer level`,
      );
      const sorted = [...descriptor.levels].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i += 1) {
        assert(sorted[i] !== sorted[i - 1], `${prefix} hsk descriptor levels must be unique`);
      }
      assert(
        descriptor.levels.length === hskProjection.levels.length &&
          descriptor.levels.every(
            (level, levelIndex) => level === hskProjection.levels[levelIndex]?.level,
          ),
        `${prefix} hsk levels must match the current learner-route projection`,
      );
      assert(
        record.destination === HSK_LEVEL_ONE_DESTINATION,
        `${prefix} HSK destination must match '${HSK_LEVEL_ONE_DESTINATION}'`,
      );
      availability = hskProjection.availability;
    } else {
      assert(
        record.hsk === undefined,
        `${prefix} has an hsk descriptor but availabilityReason is '${record.availabilityReason}'`,
      );
      availability = resolveFixedAvailability(record);
    }

    const seenMemberKeys = new Set<string>();
    for (const [memberIndex, member] of record.members.entries()) {
      const memberPath = `${prefix}.members[${memberIndex}]`;
      assert(
        member.type === 'lesson' || member.type === 'vocabulary' || member.type === 'phrase',
        `${memberPath} has invalid member type '${String(member.type)}'`,
      );
      assert(isNonEmptyString(member.id), `${memberPath} has a missing or empty id`);

      const key = `${member.type}:${member.id}`;
      assert(!seenMemberKeys.has(key), `${memberPath} duplicates member '${key}'`);
      seenMemberKeys.add(key);

      const collection = memberSets.get(member.type);
      assert(
        collection !== undefined && collection.has(member.id),
        `${memberPath} references stale '${member.id}' (no '${member.type}' with that id exists in production data)`,
      );
    }

    enrichedPaths.push({
      ...record,
      availability,
      availabilityLabelJa:
        record.availabilityReason === 'hsk'
          ? hskProjection.statusLabelJa
          : undefined,
      members:
        record.availabilityReason === 'hsk'
          ? hskProjection.eligibleIds.map((id) => ({ type: 'vocabulary', id }))
          : record.members,
    });
  }

  // All three frozen paths must be present.
  for (const requiredId of FIXED_PATH_ORDER) {
    assert(seenPathIds.has(requiredId), `missing required learning path '${requiredId}'`);
  }

  return deepFreeze({
    schemaVersion: document.schemaVersion,
    learningPaths: enrichedPaths,
  }) as LearningPathsDocument;
}
