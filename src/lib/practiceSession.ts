import type { PracticeQuestion } from './practice';

export interface PracticeSession {
  readonly questions: PracticeQuestion[];
  currentIndex: number;
  readonly lessonId: string;
}

export type FeedbackKind = 'initial' | 'correct' | 'incorrect';

export interface Feedback {
  kind: FeedbackKind;
  correctAnswer?: string;
}

export function createSession(questions: PracticeQuestion[]): PracticeSession {
  if (questions.length === 0) throw new Error('Cannot create session with 0 questions');
  return {
    questions,
    currentIndex: 0,
    lessonId: questions[0].lessonId,
  };
}

export function answer(
  session: PracticeSession,
  selected: string,
): { feedback: Feedback; session: PracticeSession } {
  const q = session.questions[session.currentIndex];
  const isCorrect = selected === q.correctAnswer;

  if (isCorrect) {
    const nextIndex = session.currentIndex + 1;
    const isComplete = nextIndex >= session.questions.length;
    return {
      feedback: { kind: 'correct' },
      session: { ...session, currentIndex: nextIndex },
      ...(isComplete ? { isComplete: true as const } : {}),
    };
  } else {
    return {
      feedback: { kind: 'incorrect', correctAnswer: q.correctAnswer },
      session,
    };
  }
}

export function getCurrentQuestion(session: PracticeSession): PracticeQuestion {
  return session.questions[session.currentIndex];
}
