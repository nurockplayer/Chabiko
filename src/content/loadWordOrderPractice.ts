/**
 * Load production word-order practice from the repository practice bundle.
 *
 * The default production path fails closed unless its source-backed rows
 * exactly reconcile with every mechanically eligible unique target in the
 * production-renderable Taiwan lessons 001–010. Explicit one-file fixture
 * loads retain the legacy loose filtering seam; passing a lesson fixture as
 * the second argument enables the same strict reconciliation used in
 * production.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WordOrderChunk, WordOrderItem } from '../domain/wordOrderPractice';
import {
  deriveNonAnswerOrder,
  tokenizeAnswer,
} from '../domain/wordOrderPractice';
import type { Lesson } from '../types/lesson';
import { loadAllRenderableLessons } from './loadLessons';

const DEFAULT_DATA_PATH = 'data/examples/valid/practice.json';
const WORD_ORDER_TYPE = 'word-order';
const LEGACY_WORD_ORDER_ID = 'practice-002';
const TAIWAN_LESSON_IDS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `lesson-${String(index + 1).padStart(3, '0')}`),
);
const REVIEW_STATUSES = new Set(['draft', 'reviewed', 'published']);

interface PracticeBundle {
  practice: unknown[];
}

interface WordOrderSourceLesson {
  readonly lessonId: string;
  readonly field: string;
  readonly reviewStatus: string;
}

interface WordOrderRecord {
  readonly id: string;
  readonly promptJa: string;
  readonly correctAnswer: string;
  readonly sourceLesson?: WordOrderSourceLesson;
}

interface EligibleLessonSource extends WordOrderSourceLesson {
  readonly target: string;
}

function parsePracticeBundle(raw: string, path: string): PracticeBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse practice bundle at ${path}: file does not contain valid JSON`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).practice)
  ) {
    throw new Error(
      `Invalid practice bundle structure at ${path}: expected {practice: [...]}`,
    );
  }
  return parsed as PracticeBundle;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseSourceLesson(value: unknown): WordOrderSourceLesson | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).length !== 3 ||
    !isNonEmptyString(source.lessonId) ||
    !isNonEmptyString(source.field) ||
    !isNonEmptyString(source.reviewStatus) ||
    !REVIEW_STATUSES.has(source.reviewStatus)
  ) {
    return undefined;
  }
  return {
    lessonId: source.lessonId,
    field: source.field,
    reviewStatus: source.reviewStatus,
  };
}

function parseWordOrderRecord(value: unknown): WordOrderRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    ['correctAnswer', 'distractors', 'correctAnswerJa', 'distractorsJa']
      .some((field) => field in record)
  ) {
    return undefined;
  }
  const correctAnswer = record.correctAnswerTraditional;
  if (
    record.type !== WORD_ORDER_TYPE ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.promptJa) ||
    !isNonEmptyString(correctAnswer)
  ) {
    return undefined;
  }
  if (
    record.distractorsTraditional !== undefined &&
    (!Array.isArray(record.distractorsTraditional) ||
      !record.distractorsTraditional.every(isNonEmptyString))
  ) {
    return undefined;
  }
  const sourceLesson = record.sourceLesson === undefined
    ? undefined
    : parseSourceLesson(record.sourceLesson);
  if (record.sourceLesson !== undefined && sourceLesson === undefined) return undefined;
  return {
    id: record.id,
    promptJa: record.promptJa,
    correctAnswer,
    sourceLesson,
  };
}

function visibleAnswer(
  chunks: readonly WordOrderChunk[],
  order: readonly number[],
  separator: ' ' | '',
): string {
  return order.map((index) => chunks[index]?.text ?? '').join(separator);
}

function tokenizeEligible(sourceKey: string, target: string) {
  try {
    const tokenized = tokenizeAnswer(sourceKey, target);
    const canonical = tokenized.chunks.map((chunk) => chunk.text).join(tokenized.separator);
    if (canonical !== target.trim()) return undefined;
    const shownOrder = deriveNonAnswerOrder(sourceKey, tokenized.chunks);
    if (visibleAnswer(tokenized.chunks, shownOrder, tokenized.separator) === canonical) {
      return undefined;
    }
    return tokenized;
  } catch {
    return undefined;
  }
}

function lessonSources(lesson: Lesson): Array<{ field: string; target: string }> {
  return [
    { field: 'coreSentence', target: lesson.coreSentence },
    ...(lesson.examples ?? []).map((example, index) => ({
      field: `examples[${index}].traditional`,
      target: example.traditional,
    })),
  ];
}

function deriveEligibleLessonSources(
  productionLessons: readonly Lesson[],
): EligibleLessonSource[] {
  const byId = new Map(productionLessons.map((lesson) => [lesson.id, lesson]));
  const seenTargets = new Set<string>();
  const eligible: EligibleLessonSource[] = [];

  for (const lessonId of TAIWAN_LESSON_IDS) {
    const lesson = byId.get(lessonId);
    if (!lesson) {
      throw new Error(
        `Word-order source reconciliation failed: missing production-renderable lesson '${lessonId}'`,
      );
    }
    for (const source of lessonSources(lesson)) {
      if (seenTargets.has(source.target)) continue;
      seenTargets.add(source.target);
      const sourceKey = `${lesson.id}:${source.field}`;
      if (!tokenizeEligible(sourceKey, source.target)) continue;
      eligible.push({
        lessonId: lesson.id,
        field: source.field,
        reviewStatus: lesson.reviewStatus,
        target: source.target,
      });
    }
  }

  return eligible;
}

function sameSource(
  actual: WordOrderSourceLesson,
  expected: EligibleLessonSource,
): boolean {
  return actual.lessonId === expected.lessonId &&
    actual.field === expected.field &&
    actual.reviewStatus === expected.reviewStatus;
}

function buildItem(record: WordOrderRecord): WordOrderItem {
  const tokenized = tokenizeAnswer(record.id, record.correctAnswer);
  const canonicalOrder = tokenized.chunks.map((_, index) => index);
  const shownOrder = deriveNonAnswerOrder(record.id, tokenized.chunks);
  const canonical = tokenized.chunks.map((chunk) => chunk.text).join(tokenized.separator);
  if (canonical !== record.correctAnswer.trim()) {
    throw new Error(
      `Word-order record '${record.id}' failed tokenizer round-trip reconciliation`,
    );
  }
  if (visibleAnswer(tokenized.chunks, shownOrder, tokenized.separator) === canonical) {
    throw new Error(
      `Word-order record '${record.id}' has a visibly pre-solved shown order`,
    );
  }

  return {
    recordId: record.id,
    promptJa: record.promptJa,
    chunks: tokenized.chunks,
    separator: tokenized.separator,
    canonicalOrder,
    shownOrder,
  };
}

function loadStrictWordOrderPractice(
  bundle: PracticeBundle,
  lessonFilePath?: string,
): WordOrderItem[] {
  const expectedSources = deriveEligibleLessonSources(
    loadAllRenderableLessons(lessonFilePath),
  );
  const expectedByTarget = new Map(
    expectedSources.map((source) => [source.target, source]),
  );
  const matchedTargets = new Set<string>();
  const seenIds = new Set<string>();
  const items: WordOrderItem[] = [];
  let legacyCount = 0;

  for (const candidate of bundle.practice) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      (candidate as Record<string, unknown>).type !== WORD_ORDER_TYPE
    ) {
      continue;
    }
    const record = parseWordOrderRecord(candidate);
    if (!record) {
      throw new Error('Word-order source reconciliation failed: malformed word-order record');
    }
    if (seenIds.has(record.id)) {
      throw new Error(`Word-order source reconciliation failed: duplicate record id '${record.id}'`);
    }
    seenIds.add(record.id);

    if (record.id === LEGACY_WORD_ORDER_ID) {
      if (record.sourceLesson) {
        throw new Error(
          `Word-order source reconciliation failed: legacy '${LEGACY_WORD_ORDER_ID}' must remain non-source-backed`,
        );
      }
      legacyCount += 1;
      items.push(buildItem(record));
      continue;
    }

    if (!record.sourceLesson) {
      throw new Error(
        `Word-order source reconciliation failed: '${record.id}' is missing sourceLesson`,
      );
    }
    const expected = expectedByTarget.get(record.correctAnswer);
    if (!expected) {
      throw new Error(
        `Word-order source reconciliation failed: '${record.id}' target is not mechanically eligible`,
      );
    }
    if (matchedTargets.has(record.correctAnswer)) {
      throw new Error(
        `Word-order source reconciliation failed: duplicate target '${record.correctAnswer}'`,
      );
    }
    if (!sameSource(record.sourceLesson, expected)) {
      const reviewMismatch = record.sourceLesson.reviewStatus !== expected.reviewStatus;
      throw new Error(
        `Word-order source reconciliation failed for '${record.id}': ${reviewMismatch ? 'source lesson reviewStatus drift' : 'source lesson/field mismatch'}`,
      );
    }
    matchedTargets.add(record.correctAnswer);
    items.push(buildItem(record));
  }

  if (legacyCount !== 1) {
    throw new Error(
      `Word-order source reconciliation failed: expected exactly one legacy '${LEGACY_WORD_ORDER_ID}' record`,
    );
  }
  const missing = expectedSources.filter((source) => !matchedTargets.has(source.target));
  if (missing.length > 0) {
    throw new Error(
      `Word-order source reconciliation failed: missing ${missing.length} mechanically eligible target(s)`,
    );
  }

  return items;
}

function loadLooseFixture(bundle: PracticeBundle): WordOrderItem[] {
  const items: WordOrderItem[] = [];
  for (const candidate of bundle.practice) {
    const record = parseWordOrderRecord(candidate);
    if (!record) continue;
    try {
      items.push(buildItem(record));
    } catch {
      // Legacy explicit fixture seam: invalid rows are filtered rather than
      // patched. Production and paired-fixture loads use strict reconciliation.
    }
  }
  return items;
}

/**
 * Load production word-order items in source order.
 *
 * The default call and paired practice/lesson fixtures fail closed on any
 * provenance or complete-set drift. A one-argument explicit practice fixture
 * retains the pre-existing loader test seam and filters invalid rows.
 */
export function loadWordOrderPractice(
  filePath?: string,
  lessonFilePath?: string,
): WordOrderItem[] {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_DATA_PATH);
  const raw = readFileSync(path, 'utf-8');
  const bundle = parsePracticeBundle(raw, path);
  const strictReconciliation = filePath === undefined || lessonFilePath !== undefined;
  return strictReconciliation
    ? loadStrictWordOrderPractice(bundle, lessonFilePath)
    : loadLooseFixture(bundle);
}
