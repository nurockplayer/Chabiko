import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LessonBundle } from '../types/lesson';

const DEFAULT_DATA_PATH = 'data/examples/valid/lessons.json';

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
 * Returns undefined when the lesson is not found, the file is missing,
 * or the file contains invalid JSON.
 */
export function loadLessonById(
  id: string,
  filePath?: string,
): LessonBundle['lessons'][number] | undefined {
  try {
    const bundle = loadLessons(filePath);
    return bundle.lessons.find((l) => l.id === id);
  } catch {
    return undefined;
  }
}
