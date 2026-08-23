import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Vocabulary, VocabularyBundle } from '../types/vocabulary';

const DEFAULT_VOCABULARY_PATH = 'data/examples/valid/vocabulary.json';

function parseVocabularyBundle(raw: string, path: string): VocabularyBundle {
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
  return {
    vocabulary: (parsed as Record<string, unknown>).vocabulary as Vocabulary[],
  };
}

/** Load the canonical non-HSK vocabulary collection. */
export function loadVocabulary(filePath?: string): VocabularyBundle {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_VOCABULARY_PATH);
  return parseVocabularyBundle(readFileSync(path, 'utf-8'), path);
}
