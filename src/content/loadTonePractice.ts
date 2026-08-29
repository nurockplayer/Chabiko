/**
 * Load production visual tone-discrimination practice items from the
 * repository practice bundle, preserving source order.
 *
 * Only `tone-discrimination` records are eligible. An eligible record must
 * carry the controlled tone metadata (correct tone, three distractors,
 * contrast id, controlled tone contour id, and the existing hint/interference
 * guidance). Records that do not form a complete, unambiguous four-choice
 * tone item are rejected rather than patched with invented data. The loader
 * is deterministic: identical source always yields identical items.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToneChoice, ToneContourId, TonePracticeItem } from '../domain/tonePractice';
import {
  CONTOUR_BY_TONE,
  isToneChoice,
  isToneContourId,
} from '../domain/tonePractice';

const DEFAULT_DATA_PATH = 'data/examples/valid/practice.json';
const TONE_DISCRIMINATION_TYPE = 'tone-discrimination';

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

function hasThreeNonNullDistractors(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0)
  );
}

/** A language-specific raw record normalized for the existing domain model. */
interface ToneDiscriminationRecord {
  id: string;
  promptJa: string;
  correctAnswer: ToneChoice;
  distractors: string[];
  contrastId: string;
  toneContourId: ToneContourId;
  toneContourHintJa: string;
  interferenceJa: string;
}

/**
 * Validate a candidate tone-discrimination record. The controlled tone
 * contour must be one of the four known ids and must agree with the stated
 * correct tone; any mismatch would show the learner an ambiguous visual, so
 * the record is rejected instead.
 */
function parseToneDiscriminationRecord(
  value: unknown,
): ToneDiscriminationRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.type !== TONE_DISCRIMINATION_TYPE) return undefined;
  if (
    ['correctAnswer', 'distractors', 'correctAnswerTraditional', 'distractorsTraditional']
      .some((field) => field in record)
  ) {
    return undefined;
  }
  const correctAnswer = record.correctAnswerJa;
  const distractorsValue = record.distractorsJa;
  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.promptJa) ||
    !isNonEmptyString(correctAnswer) ||
    !isToneChoice(correctAnswer)
  ) {
    return undefined;
  }
  if (!hasThreeNonNullDistractors(distractorsValue)) return undefined;
  const distractors = distractorsValue as string[];
  if (!distractors.every((d: string) => isToneChoice(d))) return undefined;
  if (!isNonEmptyString(record.contrastId)) return undefined;
  if (!isNonEmptyString(record.toneContourHintJa)) return undefined;
  if (!isNonEmptyString(record.interferenceJa)) return undefined;

  const toneContourId = record.toneContourId;
  if (!isToneContourId(toneContourId)) return undefined;
  // The controlled contour must describe the correct tone; a mismatch would
  // present a visual that contradicts the answer, so it is rejected.
  if (CONTOUR_BY_TONE[correctAnswer] !== toneContourId) return undefined;

  return {
    id: record.id,
    promptJa: record.promptJa,
    correctAnswer,
    distractors,
    contrastId: record.contrastId,
    toneContourId,
    toneContourHintJa: record.toneContourHintJa,
    interferenceJa: record.interferenceJa,
  };
}

/**
 * Load all production tone-discrimination items in source order.
 * Throws on file-not-found or invalid structure; returns an empty array when
 * the bundle has no eligible tone-discrimination records.
 */
export function loadTonePractice(filePath?: string): TonePracticeItem[] {
  const path = filePath ?? resolve(process.cwd(), DEFAULT_DATA_PATH);
  const raw = readFileSync(path, 'utf-8');
  const bundle = parsePracticeBundle(raw, path);

  const items: TonePracticeItem[] = [];

  for (const candidate of bundle.practice) {
    const record = parseToneDiscriminationRecord(candidate);
    if (!record) continue;

    // Deterministic rejection instead of invention: every item needs four
    // named choices, and a duplicate correct answer would make a second
    // correct answer indistinguishable from its own distractors. The first
    // occurrence wins; later duplicates are skipped.
    if (
      items.some(
        (item) =>
          item.correctAnswer === record.correctAnswer &&
          item.distractors[0] === record.distractors[0] &&
          item.distractors[1] === record.distractors[1] &&
          item.distractors[2] === record.distractors[2],
      )
    ) {
      continue;
    }

    items.push({
      recordId: record.id,
      promptJa: record.promptJa,
      correctAnswer: record.correctAnswer,
      distractors: [
        record.distractors[0] as ToneChoice,
        record.distractors[1] as ToneChoice,
        record.distractors[2] as ToneChoice,
      ],
      contrastId: record.contrastId,
      toneContourId: record.toneContourId,
      toneContourHintJa: record.toneContourHintJa,
      interferenceJa: record.interferenceJa,
    });
  }

  return items;
}
