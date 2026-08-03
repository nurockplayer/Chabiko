/**
 * Load production word-order practice items from the repository practice
 * bundle, preserving source order.
 *
 * Only `word-order` records are eligible. Every eligible record must be
 * tokenizable deterministically from its own `correctAnswer`; records that
 * cannot be split unambiguously are rejected rather than patched with
 * invented tokens.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WordOrderItem } from '../domain/wordOrderPractice';
import {
  deriveNonAnswerOrder,
  tokenizeAnswer,
} from '../domain/wordOrderPractice';

const DEFAULT_DATA_PATH = 'data/examples/valid/practice.json';
const WORD_ORDER_TYPE = 'word-order';

interface PracticeBundle {
  practice: unknown[];
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

function isWordOrderRecord(
  value: unknown,
): value is { id: string; promptJa: string; correctAnswer: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === WORD_ORDER_TYPE &&
    isNonEmptyString(record.id) &&
    isNonEmptyString(record.promptJa) &&
    isNonEmptyString(record.correctAnswer)
  );
}

/**
 * Load all production word-order items in source order.
 * Records that cannot be tokenized unambiguously are rejected (not patched).
 * Throws on file-not-found or invalid structure; returns an empty array when
 * the bundle has no eligible word-order records.
 */
export function loadWordOrderPractice(filePath?: string): WordOrderItem[] {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_DATA_PATH);
  const raw = readFileSync(path, 'utf-8');
  const bundle = parsePracticeBundle(raw, path);

  const items: WordOrderItem[] = [];

  for (const candidate of bundle.practice) {
    if (!isWordOrderRecord(candidate)) continue;

    let chunks;
    try {
      // Deterministic rejection instead of invented tokens: a record that
      // cannot be split unambiguously is skipped, not patched.
      chunks = tokenizeAnswer(candidate.id, candidate.correctAnswer);
    } catch {
      continue;
    }

    const canonicalOrder = chunks.chunks.map((_, index) => index);
    const shownOrder = deriveNonAnswerOrder(candidate.id, chunks.chunks);

    items.push({
      recordId: candidate.id,
      promptJa: candidate.promptJa,
      chunks: chunks.chunks,
      separator: chunks.separator,
      canonicalOrder,
      shownOrder,
    });
  }

  return items;
}
