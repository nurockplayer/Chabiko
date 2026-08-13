import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_VOCABULARY_PATH = 'data/examples/valid/vocabulary.json';

/** The frozen first-release kanji-bridge corpus size: 001..050. */
export const KANJI_BRIDGE_COUNT = 50;

/** Controlled relation values (#235). Anything else fails closed. */
export const KANJI_BRIDGE_SIMILARITY_TYPES = [
  'same-meaning',
  'partial-overlap',
  'false-friend',
] as const;

export type KanjiBridgeSimilarityType =
  (typeof KANJI_BRIDGE_SIMILARITY_TYPES)[number];

/** Per-form provenance. The current corpus is entirely `generated`; the type
 *  stays open so a future authored/verified form surfaces truthfully. */
export type KanjiBridgeFormStatus = 'authored' | 'verified' | 'generated';

export type KanjiBridgeReviewStatus = 'draft' | 'reviewed' | 'published';

export interface KanjiBridgeExample {
  traditional: string;
  traditionalStatus: KanjiBridgeFormStatus;
  simplified: string;
  simplifiedStatus: KanjiBridgeFormStatus;
  pinyin: string;
  japanese: string;
}

export interface KanjiBridgeSource {
  type: string;
  note?: string;
}

/** The learner-surface shape for one kanji-bridge entry. Maps only the fields
 *  the surface consumes; nothing is fabricated or converted. */
export interface KanjiBridgeEntry {
  id: string;
  traditional: string;
  traditionalStatus: KanjiBridgeFormStatus;
  simplified: string;
  simplifiedStatus: KanjiBridgeFormStatus;
  pinyin: string;
  japanese: string;
  kana: string;
  category: string;
  similarityType: KanjiBridgeSimilarityType;
  toneNote: string;
  caution?: string;
  painPointTags?: string[];
  examples: KanjiBridgeExample[];
  reviewStatus: KanjiBridgeReviewStatus;
  source: KanjiBridgeSource;
}

const REQUIRED_STRING_FIELDS = [
  'traditional',
  'simplified',
  'pinyin',
  'japanese',
  'kana',
  'category',
  'toneNote',
] as const;

const VALID_FORM_STATUSES = new Set<string>(['authored', 'verified', 'generated']);
const VALID_REVIEW_STATUSES = new Set<string>(['draft', 'reviewed', 'published']);
const VALID_SIMILARITY_TYPES = new Set<string>(KANJI_BRIDGE_SIMILARITY_TYPES);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** The exact expected id sequence `kanji-bridge-001`..`kanji-bridge-050`. */
function expectedKanjiBridgeIds(): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= KANJI_BRIDGE_COUNT; i += 1) {
    ids.push(`kanji-bridge-${String(i).padStart(3, '0')}`);
  }
  return ids;
}

/**
 * Load the kanji-bridge vocabulary corpus for the learner surface at
 * `/vocabulary/kanji-bridge/`.
 *
 * Deterministic and fail-closed: throws on file-not-found, invalid JSON,
 * invalid document structure, any count or id-order violation against the
 * frozen `kanji-bridge-001`..`050` sequence, duplicate ids, a missing or
 * malformed required field, or an invalid `similarityType`. The returned
 * entries are deeply frozen; each call parses fresh JSON and returns
 * independent references.
 *
 * The loader performs no runtime script conversion and never fabricates or
 * converts content: it maps only the surface's consumed fields verbatim.
 */
export function loadKanjiBridge(filePath?: string): readonly KanjiBridgeEntry[] {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_VOCABULARY_PATH);
  const raw = readFileSync(path, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse vocabulary at ${path}: not valid JSON`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).vocabulary)
  ) {
    throw new Error(
      `Invalid vocabulary structure at ${path}: expected {vocabulary: [...]}`,
    );
  }

  const vocabulary = (parsed as Record<string, unknown>).vocabulary as unknown[];
  const kanjiBridgeRecords: Array<Record<string, unknown>> = [];
  for (const item of vocabulary) {
    if (item && typeof item === 'object') {
      const id = (item as Record<string, unknown>).id;
      if (typeof id === 'string' && id.startsWith('kanji-bridge-')) {
        kanjiBridgeRecords.push(item as Record<string, unknown>);
      }
    }
  }

  const expectedIds = expectedKanjiBridgeIds();
  assert(
    kanjiBridgeRecords.length === KANJI_BRIDGE_COUNT,
    `kanji-bridge corpus must contain exactly ${KANJI_BRIDGE_COUNT} entries, got ${kanjiBridgeRecords.length}`,
  );

  const seenIds = new Set<string>();
  for (const record of kanjiBridgeRecords) {
    assert(
      typeof record.id === 'string' && !seenIds.has(record.id),
      `duplicate kanji-bridge id '${String(record.id)}'`,
    );
    seenIds.add(record.id as string);
  }

  const entries: KanjiBridgeEntry[] = [];
  for (const [index, record] of kanjiBridgeRecords.entries()) {
    const id = record.id;
    const prefix = `kanji-bridge[${index}]`;
    assert(
      id === expectedIds[index],
      `kanji-bridge id order violation: expected '${expectedIds[index]}' at index ${index}, got '${String(id)}'`,
    );

    for (const field of REQUIRED_STRING_FIELDS) {
      assert(
        isNonEmptyString(record[field]),
        `${prefix} ('${id}') has a missing or empty '${field}'`,
      );
    }
    assert(
      typeof record.traditionalStatus === 'string' &&
        VALID_FORM_STATUSES.has(record.traditionalStatus),
      `${prefix} ('${id}') has invalid traditionalStatus '${String(record.traditionalStatus)}'`,
    );
    assert(
      typeof record.simplifiedStatus === 'string' &&
        VALID_FORM_STATUSES.has(record.simplifiedStatus),
      `${prefix} ('${id}') has invalid simplifiedStatus '${String(record.simplifiedStatus)}'`,
    );
    assert(
      typeof record.similarityType === 'string' &&
        VALID_SIMILARITY_TYPES.has(record.similarityType),
      `${prefix} ('${id}') has invalid similarityType '${String(record.similarityType)}'`,
    );
    assert(
      typeof record.reviewStatus === 'string' &&
        VALID_REVIEW_STATUSES.has(record.reviewStatus),
      `${prefix} ('${id}') has invalid reviewStatus '${String(record.reviewStatus)}'`,
    );
    assert(
      record.source !== null &&
        typeof record.source === 'object' &&
        typeof (record.source as Record<string, unknown>).type === 'string',
      `${prefix} ('${id}') has a missing or invalid source`,
    );

    if (record.caution !== undefined) {
      assert(
        isNonEmptyString(record.caution),
        `${prefix} ('${id}') has a non-string or empty caution`,
      );
    }
    if (record.painPointTags !== undefined) {
      assert(
        Array.isArray(record.painPointTags) &&
          (record.painPointTags as unknown[]).every((tag) => isNonEmptyString(tag)),
        `${prefix} ('${id}') has invalid painPointTags`,
      );
    }

    assert(
      Array.isArray(record.examples) && record.examples.length === 1,
      `${prefix} ('${id}') must have exactly one example`,
    );
    const example = (record.examples as unknown[])[0];
    assert(
      example !== null && typeof example === 'object',
      `${prefix} ('${id}') has an invalid example`,
    );
    const exampleRecord = example as Record<string, unknown>;
    for (const field of ['traditional', 'simplified', 'pinyin', 'japanese']) {
      assert(
        isNonEmptyString(exampleRecord[field]),
        `${prefix} ('${id}') example has a missing or empty '${field}'`,
      );
    }
    assert(
      typeof exampleRecord.traditionalStatus === 'string' &&
        VALID_FORM_STATUSES.has(exampleRecord.traditionalStatus),
      `${prefix} ('${id}') example has invalid traditionalStatus '${String(exampleRecord.traditionalStatus)}'`,
    );
    assert(
      typeof exampleRecord.simplifiedStatus === 'string' &&
        VALID_FORM_STATUSES.has(exampleRecord.simplifiedStatus),
      `${prefix} ('${id}') example has invalid simplifiedStatus '${String(exampleRecord.simplifiedStatus)}'`,
    );

    const source = record.source as Record<string, unknown>;
    entries.push({
      id: id as string,
      traditional: record.traditional as string,
      traditionalStatus: record.traditionalStatus as KanjiBridgeFormStatus,
      simplified: record.simplified as string,
      simplifiedStatus: record.simplifiedStatus as KanjiBridgeFormStatus,
      pinyin: record.pinyin as string,
      japanese: record.japanese as string,
      kana: record.kana as string,
      category: record.category as string,
      similarityType: record.similarityType as KanjiBridgeSimilarityType,
      toneNote: record.toneNote as string,
      ...(record.caution !== undefined ? { caution: record.caution as string } : {}),
      ...(record.painPointTags !== undefined
        ? { painPointTags: record.painPointTags as string[] }
        : {}),
      examples: [
        {
          traditional: exampleRecord.traditional as string,
          traditionalStatus: exampleRecord.traditionalStatus as KanjiBridgeFormStatus,
          simplified: exampleRecord.simplified as string,
          simplifiedStatus: exampleRecord.simplifiedStatus as KanjiBridgeFormStatus,
          pinyin: exampleRecord.pinyin as string,
          japanese: exampleRecord.japanese as string,
        },
      ],
      reviewStatus: record.reviewStatus as KanjiBridgeReviewStatus,
      source: {
        type: source.type as string,
        ...(source.note !== undefined && isNonEmptyString(source.note)
          ? { note: source.note as string }
          : {}),
      },
    });
  }

  return deepFreeze(entries) as readonly KanjiBridgeEntry[];
}
