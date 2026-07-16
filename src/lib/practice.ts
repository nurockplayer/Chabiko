import type { Lesson } from '../types/lesson';

export interface PracticeQuestion {
  promptJa: string;
  correctAnswer: string;
  choices: string[];
  lessonId: string;
}

function shuffle<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function gatherAnswerPool(lesson: Lesson): string[] {
  const pool: string[] = [];
  for (const prompt of lesson.reviewPrompts ?? []) {
    if (prompt.answerJa?.trim()) pool.push(prompt.answerJa.trim());
  }
  for (const chunk of lesson.chunks ?? []) {
    if (chunk.meaning?.trim()) pool.push(chunk.meaning.trim());
  }
  for (const example of lesson.examples ?? []) {
    if (example.japanese?.trim()) pool.push(example.japanese.trim());
  }
  if (lesson.coreSentence?.trim()) pool.push(lesson.coreSentence.trim());
  return pool;
}

export function generateQuestions(lesson: Lesson): PracticeQuestion[] {
  const prompts = (lesson.reviewPrompts ?? []).filter(
    (p) => p.promptJa?.trim() && p.answerJa?.trim(),
  );
  if (prompts.length === 0) return [];

  const pool = gatherAnswerPool(lesson);
  const questions: PracticeQuestion[] = [];

  for (const prompt of prompts) {
    const correct = prompt.answerJa.trim();
    const distractors: string[] = [];
    const seen = new Set<string>([correct]);

    for (const candidate of pool) {
      if (seen.has(candidate)) continue;
      distractors.push(candidate);
      seen.add(candidate);
      if (distractors.length >= 3) break;
    }

    const choices = shuffle([correct, ...distractors]);

    questions.push({
      promptJa: prompt.promptJa,
      correctAnswer: correct,
      choices,
      lessonId: lesson.id,
    });
  }

  return questions;
}

export function isCorrect(question: PracticeQuestion, selected: string): boolean {
  return selected === question.correctAnswer;
}
