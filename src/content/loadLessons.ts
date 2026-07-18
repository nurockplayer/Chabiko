import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LessonBundle } from '../types/lesson';

const DEFAULT_DATA_PATH = 'data/examples/valid/lessons.json';

const CONTROLLED_PAIN_POINT_TAGS = new Set([
  'tone',
  'pinyin-pronunciation',
  'kanji-false-friend',
  'same-kanji-different-meaning',
  'same-kanji-different-usage',
  'word-order',
  'measure-word',
  'aspect-particle',
  'complement',
  'traditional-simplified',
  'taiwan-mainland-usage',
]);

function parseLessonBundle(raw: string, path: string): LessonBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse lesson bundle at ${path}: file does not contain valid JSON`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).lessons)
  ) {
    throw new Error(
      `Invalid lesson bundle structure at ${path}: expected {lessons: [...]}`,
    );
  }
  return parsed as LessonBundle;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidPainPointTags(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  const seen = new Set<string>();
  for (const element of value) {
    if (!isNonEmptyString(element)) return false;
    if (!CONTROLLED_PAIN_POINT_TAGS.has(element)) return false;
    if (seen.has(element)) return false;
    seen.add(element);
  }
  return true;
}

function hasUsablePracticePrompt(prompt: unknown): boolean {
  if (!prompt || typeof prompt !== 'object') return false;
  const p = prompt as Record<string, unknown>;
  if (!isNonEmptyString(p.promptJa) || !isNonEmptyString(p.answerJa)) return false;
  // Must have at least one effective distractor
  if (!Array.isArray(p.distractorsJa)) return false;
  const answer = (p.answerJa as string).trim();
  const effective = p.distractorsJa.some(
    (d: unknown) =>
      typeof d === 'string' &&
      d.trim().length > 0 &&
      d.trim() !== answer,
  );
  return effective;
}

function isRenderableLesson(value: unknown): value is LessonBundle['lessons'][number] {
  if (!value || typeof value !== 'object') return false;

  const lesson = value as Record<string, unknown>;
  const requiredTextFields = [
    'id',
    'titleJa',
    'level',
    'canDoJa',
    'learnerOutcomeJa',
    'hookJa',
    'travelScenario',
    'coreSentence',
    'travelTask',
    'reviewStatus',
  ];
  const requiredArrayFields = [
    'chunks',
    'kanjiBridgeNotes',
    'soundFocus',
    'reviewPrompts',
  ];
  const optionalArrayFields = [
    'sections',
    'examples',
    'relatedVocabulary',
  ];

  if (
    !requiredTextFields.every((field) => isNonEmptyString(lesson[field])) ||
    !requiredArrayFields.every((field) => Array.isArray(lesson[field])) ||
    !optionalArrayFields.every(
      (field) => lesson[field] === undefined || Array.isArray(lesson[field]),
    ) ||
    !isValidPainPointTags(lesson.painPointTags)
  ) {
    return false;
  }

  // At least one review prompt must have a usable distractor for practice
  const prompts = (lesson.reviewPrompts as unknown[]) ?? [];
  return prompts.some(hasUsablePracticePrompt);
}

/**
 * Load lesson content from a JSON file.
 * Falls back to the default fixture path when no argument is supplied.
 * Throws on file-not-found, invalid JSON, or structural errors.
 */
export function loadLessons(filePath?: string): LessonBundle {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_DATA_PATH);
  const raw = readFileSync(path, 'utf-8');
  return parseLessonBundle(raw, path);
}

/**
 * Load a single lesson by its id.
 * Returns undefined when the lesson is not found, unavailable, or incomplete.
 */
export function loadLessonById(
  id: string,
  filePath?: string,
): LessonBundle['lessons'][number] | undefined {
  try {
    const bundle = loadLessons(filePath);
    const lesson = bundle.lessons.find((candidate) => candidate.id === id);
    return isRenderableLesson(lesson) ? lesson : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Load all renderable lessons from the bundle, in file order.
 * Filters out lessons that fail isRenderableLesson validation.
 * Throws on file-not-found, invalid JSON, or structural errors.
 */
export function loadAllRenderableLessons(
  filePath?: string,
): LessonBundle['lessons'][number][] {
  const bundle = loadLessons(filePath);
  return bundle.lessons.filter((lesson) => isRenderableLesson(lesson));
}
