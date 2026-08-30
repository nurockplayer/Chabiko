import type { DashboardProgressPayload } from '../domain/dashboardProgress';
import { loadAllRenderableLessons, hasUsableLessonPractice } from './loadLessons';
import { loadHskLearnerProjection } from './loadHskVocabulary';
import type { LearnerManifest } from '../types/learnerManifest';
import manifestData from '../../data/teacher-vocabulary-preview/learner-manifest.json' assert { type: 'json' };

const manifest = manifestData as LearnerManifest;

/**
 * Build the build-time reference payload for the learner Dashboard (Issue
 * #374). Emits the exact production corpora the #372 coordinator is allowed to
 * count against:
 *
 * - the full learner-manifest `learnerId` set (the only ids the
 *   `/vocabulary/basic/` writer can produce),
 * - the production HSK ids grouped by declared delivery level,
 * - the Taiwan lesson ids with a usable practice path (the fixed denominator)
 *   plus the display metadata (title + core sentence + pinyin) used to render a
 *   truthful continuation/track destination.
 *
 * Fails closed on an empty/malformed manifest or lesson source via the same
 * loaders the existing routes use. Pure and deterministic.
 */
export function buildDashboardProgressPayload(): DashboardProgressPayload {
  const lessons = loadAllRenderableLessons();
  const completableLessons = lessons.filter(hasUsableLessonPractice);

  const basicVocabularyCorpusIds = manifest.rows.map((row) => row.learnerId);

  return {
    basicVocabularyCorpusIds,
    hsk: loadHskLearnerProjection(),
    taiwanCompletableLessonIds: completableLessons.map((lesson) => lesson.id),
    taiwanLessons: completableLessons.map((lesson) => ({
      id: lesson.id,
      titleJa: lesson.titleJa,
      coreSentence: lesson.coreSentence,
      pinyin: lesson.examples?.[0]?.pinyin ?? '',
    })),
  };
}

/**
 * Serialize the payload into an inline JSON script body. `replace(/</g,
 * '\\u003c')` prevents a value from breaking out of the inline script element
 * (same hardening the other route payloads use).
 */
export function serializeDashboardProgressPayload(
  payload: DashboardProgressPayload,
): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
