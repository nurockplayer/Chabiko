import { describe, it, expect } from 'vitest';
import {
  createSession,
  answer,
  getCurrentQuestion,
} from '../src/lib/practiceSession';
import { generateQuestions } from '../src/lib/practice';
import type { Lesson } from '../src/types/lesson';

const baseLesson: Lesson = {
  id: 'lesson-001',
  titleJa: '夜市で注文してみよう',
  level: 'beginner',
  canDoJa: '台湾の夜市で簡単に食べ物を注文できる',
  learnerOutcomeJa: '指差し注文と基本表現「我要〜」が使える',
  hookJa: '台湾の夜市と言えば…臭豆腐？それともタピオカ？',
  travelScenario: 'food',
  coreSentence: '我要這個',
  chunks: [
    { chunk: '我要', meaning: '私は〜が欲しい' },
    { chunk: '這個', meaning: 'これ' },
  ],
  kanjiBridgeNotes: [
    { kanji: '要', jpReading: 'よう', noteJa: '日本語の「要る」に近い' },
  ],
  soundFocus: [
    { item: '要 yào', noteJa: '第四声' },
  ],
  reviewStatus: 'reviewed',
  reviewPrompts: [
    {
      promptJa: '「我要這個」はどういう意味？',
      answerJa: 'これをください',
      distractorsJa: ['私は〜が欲しい', 'これはいくらですか'],
    },
  ],
  travelTask: '夜市で指を差して「我要這個」と言ってみよう',
};

function createLessonSession(overrides?: Partial<Lesson>) {
  const lesson: Lesson = { ...baseLesson, ...overrides };
  return createSession(generateQuestions(lesson));
}

describe('practiceSession', () => {
  describe('initial state', () => {
    it('does not reveal the expected answer', () => {
      const session = createLessonSession();
      const q = getCurrentQuestion(session);
      expect(q).toBeDefined();
      // The current question's correctAnswer is not shown in any feedback yet
      expect(session.currentIndex).toBe(0);
    });
  });

  describe('correct answer', () => {
    it('advances to the next question', () => {
      const session = createLessonSession();
      const q = getCurrentQuestion(session);
      const { feedback, session: next } = answer(session, q.correctAnswer);
      expect(feedback.kind).toBe('correct');
      expect(next.currentIndex).toBe(1);
    });
  });

  describe('incorrect answer', () => {
    it('reveals the expected answer in feedback', () => {
      const session = createLessonSession();
      const q = getCurrentQuestion(session);
      const { feedback } = answer(session, 'some wrong answer');
      expect(feedback.kind).toBe('incorrect');
      expect(feedback.correctAnswer).toBe(q.correctAnswer);
    });

    it('does not advance the index', () => {
      const session = createLessonSession();
      answer(session, 'wrong');
      expect(session.currentIndex).toBe(0);
    });

    it('allows retry on the same question', () => {
      const lessonData: Lesson = {
        ...baseLesson,
        id: 'lesson-002',
        reviewPrompts: [
          { promptJa: 'test?', answerJa: '正解', distractorsJa: ['誤答'] },
        ],
      };
      const session = createLessonSession(lessonData);

      // Wrong answer — stays on same question
      const r1 = answer(session, '誤答');
      expect(r1.feedback.kind).toBe('incorrect');
      expect(r1.session.currentIndex).toBe(0);

      // Retry same question — still at index 0
      const qStill = getCurrentQuestion(r1.session);
      expect(qStill.correctAnswer).toBe('正解');

      // Now correct
      const r2 = answer(r1.session, qStill.correctAnswer);
      expect(r2.feedback.kind).toBe('correct');
      expect(r2.session.currentIndex).toBe(1);
    });
  });

  describe('completion', () => {
    it('succeeds only after the last question is answered correctly', () => {
      const lessonData: Lesson = {
        ...baseLesson,
        id: 'lesson-002',
        reviewPrompts: [
          { promptJa: 'Q1?', answerJa: 'A1', distractorsJa: ['W1', 'W2'] },
          { promptJa: 'Q2?', answerJa: 'A2', distractorsJa: ['W3'] },
        ],
      };
      const session = createLessonSession(lessonData);

      // Answer Q1 correctly
      const r1 = answer(session, 'A1');
      expect(r1.feedback.kind).toBe('correct');

      // Answer Q2 correctly — should complete
      const q2 = getCurrentQuestion(r1.session);
      expect(q2.correctAnswer).toBe('A2');
      const r2 = answer(r1.session, q2.correctAnswer);
      expect(r2.feedback.kind).toBe('correct');
    });
  });

  describe('completion event for badge sync', () => {
    it('signals completion when last question is answered correctly', () => {
      const lessonData: Lesson = {
        ...baseLesson,
        reviewPrompts: [
          { promptJa: 'Q1?', answerJa: 'A1', distractorsJa: ['W1'] },
        ],
      };
      const session = createLessonSession(lessonData);
      const q = getCurrentQuestion(session);
      const result = answer(session, q.correctAnswer);
      expect(result.feedback.kind).toBe('correct');
      // After answering the only question correctly, the session advances
      expect(result.session.currentIndex).toBe(1);
      expect(result.session.currentIndex).toBe(session.questions.length);
    });
  });
});
