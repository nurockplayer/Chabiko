import type { Lesson } from '../types/lesson';
import { buildTaiwanTravelQuestions } from '../domain/taiwanTravelAssessment';
import { loadAllRenderableLessons } from './loadLessons';

/** Serializable quiz payload built once at build time from the production
 *  lesson corpus. Carries only opaque lesson ids in lesson order — no prompt,
 *  answer, or options — so the answers stay in the client bundle (lessons
 *  import) and are never leaked into the serialized HTML. */
export interface TaiwanTravelAssessmentPayload {
  /** Opaque lesson ids for the frozen 24-question assessment, in lesson order. */
  readonly lessonIds: readonly string[];
}

/**
 * The non-secret subset serialized to the client: just the ordered lesson ids.
 * `replace(/</g, '\\u003c')` prevents an attacker-influenced value from
 * breaking out of the inline script element.
 */
export function serializeTaiwanTravelAssessmentPayload(
  payload: TaiwanTravelAssessmentPayload,
): string {
  return JSON.stringify({ lessonIds: payload.lessonIds }).replace(/</g, '\\u003c');
}

/** Full-corpus assessment payload over the production lessons. Fails closed on
 *  any missing lesson or lesson without a usable review prompt. */
export function buildTaiwanTravelAssessmentPayload(
  lessons?: readonly Lesson[],
): TaiwanTravelAssessmentPayload {
  const source = lessons ?? loadAllRenderableLessons();
  const questions = buildTaiwanTravelQuestions(source);
  return { lessonIds: questions.map((question) => question.lessonId) };
}
