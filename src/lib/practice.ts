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

export function generateQuestions(lesson: Lesson): PracticeQuestion[] {
  const prompts = (lesson.reviewPrompts ?? []).filter(
    (p) => p.promptJa?.trim() && p.answerJa?.trim(),
  );
  if (prompts.length === 0) return [];

  const questions: PracticeQuestion[] = [];

  for (const prompt of prompts) {
    const correct = prompt.answerJa.trim();
    const distractors = (prompt.distractorsJa ?? []).filter(
      (d): d is string => typeof d === 'string' && d.trim().length > 0 && d.trim() !== correct,
    );

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
