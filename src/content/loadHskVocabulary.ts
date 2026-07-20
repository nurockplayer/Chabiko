import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const PRODUCTION_REVIEW_STATUSES = new Set(['reviewed', 'published']);

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
  return bundle.vocabulary
    .filter(
      (entry): boolean =>
        PRODUCTION_REVIEW_STATUSES.has(entry.reviewStatus) &&
        entry.hsk.introducedAtLevel === level,
    )
    .map((entry) => ({
      id: entry.id,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      japanese: entry.japanese,
      traditional: hasTraditional(entry)
        ? (entry as unknown as Record<string, unknown>).traditional as string
        : undefined,
    }));
}
