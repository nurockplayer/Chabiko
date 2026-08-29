import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stableStringify } from '../domain/teacherReview';
import type { Lesson } from '../types/lesson';

/** Exact prelaunch allowlist for the Taiwan Travel learner lesson surface. */
export const TAIWAN_TRAVEL_PRODUCTION_LESSON_IDS = Object.freeze(
  Array.from({ length: 24 }, (_, index) =>
    `lesson-${String(index + 1).padStart(3, '0')}`,
  ),
);

const WAVE1_LESSON_IDS = new Set(
  TAIWAN_TRAVEL_PRODUCTION_LESSON_IDS.slice(10),
);
const WAVE1_CANDIDATE_PATH =
  'data/content-pilots/taiwan-travel-wave-1/lessons.json';

function withoutTopLevelReviewStatus(lesson: Lesson): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(lesson as unknown as Record<string, unknown>).filter(
      ([key]) => key !== 'reviewStatus',
    ),
  );
}

function fingerprint(lesson: Lesson): string {
  return createHash('sha256')
    .update(stableStringify(withoutTopLevelReviewStatus(lesson)))
    .digest('hex');
}

function parseCandidateLessons(): Lesson[] {
  const path = resolve(process.cwd(), WAVE1_CANDIDATE_PATH);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(
      `Taiwan Travel production reconciliation failed: unable to read candidate lessons at ${path}`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).lessons)
  ) {
    throw new Error(
      `Taiwan Travel production reconciliation failed: candidate lessons at ${path} must contain a lessons array`,
    );
  }
  return (parsed as { lessons: Lesson[] }).lessons;
}

/**
 * Enforce the bounded Taiwan prelaunch production contract.
 *
 * Production 001–024 are the only learner-visible lesson IDs. The exact
 * candidate records 011–024 are compared by the same semantic fingerprint
 * used by the Wave-1 review packet, excluding only the mutable top-level
 * reviewStatus. This keeps review metadata truthful while preventing a silent
 * production/candidate content split.
 */
export function assertTaiwanTravelProductionLessonSet(
  lessons: readonly Lesson[],
): void {
  const expectedIds = TAIWAN_TRAVEL_PRODUCTION_LESSON_IDS;
  if (lessons.length !== expectedIds.length) {
    throw new Error(
      `Taiwan Travel production reconciliation failed: expected exactly ${expectedIds.length} learner lessons, got ${lessons.length}`,
    );
  }

  const seen = new Set<string>();
  for (const [index, lesson] of lessons.entries()) {
    const expectedId = expectedIds[index];
    if (lesson.id !== expectedId) {
      throw new Error(
        `Taiwan Travel production reconciliation failed: expected '${expectedId}' at position ${index + 1}, got '${lesson.id}'`,
      );
    }
    if (seen.has(lesson.id)) {
      throw new Error(
        `Taiwan Travel production reconciliation failed: duplicate production lesson '${lesson.id}'`,
      );
    }
    seen.add(lesson.id);
  }

  const candidates = parseCandidateLessons();
  if (candidates.length !== 14) {
    throw new Error(
      `Taiwan Travel production reconciliation failed: expected exactly 14 Wave-1 candidates, got ${candidates.length}`,
    );
  }
  const candidateById = new Map<string, Lesson>();
  for (const [index, candidate] of candidates.entries()) {
    const expectedId = expectedIds[index + 10];
    if (candidate.id !== expectedId) {
      throw new Error(
        `Taiwan Travel production reconciliation failed: expected candidate '${expectedId}' at position ${index + 1}, got '${candidate.id}'`,
      );
    }
    if (candidateById.has(candidate.id)) {
      throw new Error(
        `Taiwan Travel production reconciliation failed: duplicate candidate lesson '${candidate.id}'`,
      );
    }
    candidateById.set(candidate.id, candidate);
  }

  for (const lesson of lessons) {
    if (!WAVE1_LESSON_IDS.has(lesson.id)) continue;
    const candidate = candidateById.get(lesson.id);
    if (!candidate || fingerprint(lesson) !== fingerprint(candidate)) {
      throw new Error(
        `Taiwan Travel production reconciliation failed: candidate drift for '${lesson.id}'`,
      );
    }
    if (lesson.reviewStatus !== 'draft') {
      throw new Error(
        `Taiwan Travel production reconciliation failed: '${lesson.id}' must remain reviewStatus 'draft'`,
      );
    }
  }
}
