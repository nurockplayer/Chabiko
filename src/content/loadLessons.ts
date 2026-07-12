import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LessonBundle } from '../types/lesson';

const DEFAULT_DATA_PATH = 'data/examples/valid/lessons.json';

/**
 * Load lesson content from a JSON file.
 * Falls back to the default fixture path when no argument is supplied.
 */
export function loadLessons(filePath?: string): LessonBundle {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_DATA_PATH);
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Load a single lesson by its id.
 * Returns undefined when the lesson is not found.
 */
export function loadLessonById(
  id: string,
  filePath?: string,
): LessonBundle['lessons'][number] | undefined {
  const bundle = loadLessons(filePath);
  return bundle.lessons.find((l) => l.id === id);
}
