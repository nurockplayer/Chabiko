import type { Lesson } from '../types/lesson';

export interface PracticeQuestion {
  promptJa: string;
  correctAnswer: string;
  choices: string[];
  lessonId: string;
}

interface ValidReviewPrompt {
  promptJa: string;
  answerJa: string;
  distractorsJa?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidReviewPrompt(value: unknown): value is ValidReviewPrompt {
  if (typeof value !== 'object' || value === null) return false;
  const prompt = value as Record<string, unknown>;
  return isNonEmptyString(prompt.promptJa) && isNonEmptyString(prompt.answerJa);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle<T>(array: T[], seed: string): T[] {
  return [...array]
    .map((value, index) => ({
      value,
      index,
      rank: hashString(`${seed}\u0000${String(value)}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ value }) => value);
}

export function generateQuestions(lesson: Lesson): PracticeQuestion[] {
  const rawPrompts: unknown[] = Array.isArray(lesson.reviewPrompts)
    ? lesson.reviewPrompts
    : [];
  const prompts = rawPrompts.filter(isValidReviewPrompt);
  if (prompts.length === 0) return [];

  const questions: PracticeQuestion[] = [];

  for (const prompt of prompts) {
    const promptText = prompt.promptJa.trim();
    const correct = prompt.answerJa.trim();
    const rawDistractors = Array.isArray(prompt.distractorsJa)
      ? prompt.distractorsJa
      : [];
    const distractors = rawDistractors
      .filter(
        (d): d is string => typeof d === 'string' && d.trim().length > 0,
      )
      .map((d) => d.trim())
      .filter((d) => d !== correct)
      .filter((d, i, arr) => arr.indexOf(d) === i);

    // Skip prompts without at least one effective distractor
    if (distractors.length === 0) continue;

    const choices = deterministicShuffle(
      [correct, ...distractors],
      `${lesson.id}\u0000${promptText}`,
    );

    questions.push({
      promptJa: promptText,
      correctAnswer: correct,
      choices,
      lessonId: lesson.id,
    });
  }

  return questions;
}
