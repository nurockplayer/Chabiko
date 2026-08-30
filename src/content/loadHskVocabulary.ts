import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildHskLearnerProjection,
  type HskLearnerProjection,
} from '../domain/hskLearnerProjection';
import type { HskVocabularyType } from '../types/vocabulary';

const DEFAULT_HSK_PATH = 'data/examples/valid/hsk-vocabulary.json';

interface HskBundle {
  vocabulary: HskVocabularyType[];
}

function parseHskBundle(raw: string, path: string): HskBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse HSK vocabulary at ${path}: not valid JSON`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).vocabulary)
  ) {
    throw new Error(`Invalid HSK vocabulary structure at ${path}: expected {vocabulary: [...]}`);
  }
  return parsed as HskBundle;
}

export interface HskRenderableEntry {
  id: string;
  simplified: string;
  pinyin: string;
  japanese: string;
  traditional?: string;
}

/**
 * Load HSK vocabulary from a JSON file.
 * Throws on file-not-found or invalid structure.
 */
export function loadHskVocabulary(filePath?: string): HskBundle {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_HSK_PATH);
  const raw = readFileSync(path, 'utf-8');
  return parseHskBundle(raw, path);
}

/** Load the single production-derived HSK contract used by learner indexes. */
export function loadHskLearnerProjection(
  filePath?: string,
): HskLearnerProjection {
  return buildHskLearnerProjection(loadHskVocabulary(filePath).vocabulary);
}

function hasTraditional(entry: HskVocabularyType): boolean {
  return 'traditional' in entry && typeof (entry as unknown as Record<string, unknown>).traditional === 'string';
}

/**
 * Load all production-eligible HSK vocabulary entries for a given level.
 */
export function loadHskLevelEntries(
  level: number,
  filePath?: string,
): HskRenderableEntry[] {
  const bundle = loadHskVocabulary(filePath);
  const projection = buildHskLearnerProjection(bundle.vocabulary);
  const levelProjection = projection.levels.find(
    (candidate) => candidate.level === level,
  );
  if (!levelProjection) return [];

  const entriesById = new Map(bundle.vocabulary.map((entry) => [entry.id, entry]));
  return levelProjection.ids.flatMap((id) => {
    const entry = entriesById.get(id);
    if (!entry) return [];
    return [{
      id: entry.id,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      japanese: entry.japanese,
      traditional: hasTraditional(entry)
        ? (entry as unknown as Record<string, unknown>).traditional as string
        : undefined,
    }];
  });
}
