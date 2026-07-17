import type { PracticeQuestion } from './practice';

/** Active session: the learner is still answering questions. */
export interface ActiveSession {
  status: 'active';
  questions: PracticeQuestion[];
  currentIndex: number;
  lessonId: string;
}

/** Completed session: all questions answered correctly. */
export interface CompletedSession {
  status: 'completed';
  questions: PracticeQuestion[];
  lessonId: string;
}

export type PracticeSession = ActiveSession | CompletedSession;

export type FeedbackKind = 'initial' | 'correct' | 'incorrect';

export interface Feedback {
  kind: FeedbackKind;
  correctAnswer?: string;
}

export function createSession(questions: PracticeQuestion[]): ActiveSession {
  if (questions.length === 0) throw new Error('Cannot create session with 0 questions');
  return {
    status: 'active',
    questions,
    currentIndex: 0,
    lessonId: questions[0].lessonId,
  };
}

export function answer(
  session: PracticeSession,
  selected: string,
): { feedback: Feedback; session: PracticeSession } {
  if (session.status === 'completed') {
    return {
      feedback: { kind: 'correct' },
      session,
    };
  }
  const q = session.questions[session.currentIndex];
  const isCorrect = selected === q.correctAnswer;

  if (isCorrect) {
    const nextIndex = session.currentIndex + 1;
    const isComplete = nextIndex >= session.questions.length;
    return isComplete
      ? {
          feedback: { kind: 'correct' },
          session: {
            status: 'completed' as const,
            questions: session.questions,
            lessonId: session.lessonId,
          },
        }
      : {
          feedback: { kind: 'correct' },
          session: { ...session, currentIndex: nextIndex },
        };
  } else {
    return {
      feedback: { kind: 'incorrect', correctAnswer: q.correctAnswer },
      session,
    };
  }
}

export function getCurrentQuestion(session: PracticeSession): PracticeQuestion | null {
  if (session.status === 'completed') return null;
  return session.questions[session.currentIndex] ?? null;
}

/** Return the 0-based index of the current question, or questions.length when completed. */
export function getCurrentIndex(session: PracticeSession): number {
  if (session.status === 'completed') return session.questions.length;
  return session.currentIndex;
}
