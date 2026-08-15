import { describe, expect, it } from 'vitest';
import {
  TAIWAN_TRAVEL_LESSON_IDS,
  TAIWAN_TRAVEL_MAX_SCORE,
  TAIWAN_TRAVEL_QUIZ_LENGTH,
  applyTaiwanTravelQuizAction,
  buildTaiwanTravelQuestions,
  buildTaiwanTravelQuestion,
  createTaiwanTravelQuizSession,
  firstUsableReviewPrompt,
  isUsableReviewPrompt,
  scoreOfCompletedAttempt,
  type TaiwanTravelQuestion,
} from '../src/domain/taiwanTravelAssessment';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import {
  TAIWAN_TRAVEL_ASSESSMENT_LABEL_JA,
  TAIWAN_TRAVEL_ASSESSMENT_ROUTE,
  TAIWAN_TRAVEL_TRACK_ID,
  taiwanTravelQuizEntryForTrack,
} from '../src/domain/taiwanTravelQuizNavigation';
import type { Lesson } from '../src/types/lesson';

// ─── Helpers ────────────────────────────────────────────────────────────────

function lesson(
  id: string,
  prompts: Array<{ promptJa: string; answerJa: string; distractorsJa?: string[] }>,
): Lesson {
  return {
    id,
    titleJa: 'タイトル',
    level: 'beginner',
    canDoJa: 'できること',
    learnerOutcomeJa: '到達目標',
    hookJa: 'フック',
    travelScenario: 'scenario',
    coreSentence: 'コア表現',
    chunks: [],
    kanjiBridgeNotes: [],
    soundFocus: [],
    reviewPrompts: prompts,
    travelTask: '旅先タスク',
    reviewStatus: 'reviewed',
  };
}

function lessonWithUsablePrompts(id: string, offset = 0): Lesson {
  return lesson(id, [
    { promptJa: `${id} Q1`, answerJa: `${id} A1`, distractorsJa: [`${id} D1`, `${id} D2`] },
    { promptJa: `${id} Q2`, answerJa: `${id} A2`, distractorsJa: [`${id} D3`] },
  ].map((prompt, index) =>
    index === offset
      ? prompt
      : { ...prompt, distractorsJa: [] },
  ));
}

/** The full frozen 10-lesson synthetic corpus, all with usable prompts. */
function fullCorpus(): Lesson[] {
  return TAIWAN_TRAVEL_LESSON_IDS.map((id) => lessonWithUsablePrompts(id));
}

function session(questions: TaiwanTravelQuestion[] = buildTaiwanTravelQuestions(fullCorpus())) {
  return createTaiwanTravelQuizSession(questions);
}

/** An option index that is guaranteed not to be the correct answer. */
function wrongOptionIndex(question: TaiwanTravelQuestion): number {
  return question.correctIndex === 0 ? 1 : 0;
}

/** Drive a full attempt; `correctPicks` maps each question index to the option
 *  index to select. Returns the completed state. */
function completeAttempt(
  questions: TaiwanTravelQuestion[],
  correctPicks: number[],
) {
  let state = createTaiwanTravelQuizSession(questions);
  for (let index = 0; index < questions.length; index++) {
    state = applyTaiwanTravelQuizAction(state, { kind: 'select', index: correctPicks[index] }).state;
    state = applyTaiwanTravelQuizAction(state, { kind: 'submit' }).state;
    state = applyTaiwanTravelQuizAction(state, { kind: 'next' }).state;
  }
  return state;
}

// ─── Coverage / source traceability ─────────────────────────────────────────

describe('buildTaiwanTravelQuestions — frozen coverage contract', () => {
  it('produces exactly 10 questions, one per lesson in lesson order', () => {
    const questions = buildTaiwanTravelQuestions(fullCorpus());
    expect(questions).toHaveLength(TAIWAN_TRAVEL_QUIZ_LENGTH);
    expect(questions.map((q) => q.lessonId)).toEqual([...TAIWAN_TRAVEL_LESSON_IDS]);
  });

  it('works against the production lesson corpus', () => {
    const questions = buildTaiwanTravelQuestions(loadAllRenderableLessons());
    expect(questions).toHaveLength(TAIWAN_TRAVEL_QUIZ_LENGTH);
    expect(questions.map((q) => q.lessonId)).toEqual([...TAIWAN_TRAVEL_LESSON_IDS]);
  });

  it('each question is source-traceable to a usable production review prompt', () => {
    const lessons = loadAllRenderableLessons();
    const byId = new Map(lessons.map((lessonEntry) => [lessonEntry.id, lessonEntry]));
    for (const question of buildTaiwanTravelQuestions(lessons)) {
      const sourceLesson = byId.get(question.lessonId);
      expect(sourceLesson).toBeDefined();
      const prompt = sourceLesson!.reviewPrompts[question.sourcePromptIndex];
      expect(prompt).toBeDefined();
      expect(isUsableReviewPrompt(prompt)).toBe(true);
      expect(question.promptJa).toBe(prompt.promptJa.trim());
      expect(question.answerJa).toBe(prompt.answerJa.trim());
    }
  });

  it('options are exactly the source answer plus existing distinct distractors (never fabricated)', () => {
    const lessons = loadAllRenderableLessons();
    const byId = new Map(lessons.map((lessonEntry) => [lessonEntry.id, lessonEntry]));
    for (const question of buildTaiwanTravelQuestions(lessons)) {
      const prompt = byId.get(question.lessonId)!.reviewPrompts[question.sourcePromptIndex];
      const sourceDistractors = (prompt.distractorsJa ?? [])
        .map((d) => d.trim())
        .filter((d) => d.length > 0 && d !== question.answerJa);
      const distinct = [...new Set(sourceDistractors)];
      expect(question.options).toHaveLength(1 + distinct.length);
      expect(new Set(question.options).size).toBe(question.options.length);
      expect(question.options).toContain(question.answerJa);
      expect(question.options[question.correctIndex]).toBe(question.answerJa);
      for (const option of question.options) {
        if (option !== question.answerJa) {
          expect(distinct).toContain(option);
        }
      }
    }
  });

  it('choice ordering is deterministic by default', () => {
    const lessons = fullCorpus();
    expect(buildTaiwanTravelQuestions(lessons)).toEqual(buildTaiwanTravelQuestions(lessons));
  });

  it('choice ordering varies only through the injectable ordering seam', () => {
    const lessons = fullCorpus();
    const reverse: (values: readonly string[], seed: string) => readonly string[] =
      (values) => [...values].reverse();
    const defaultOrder = buildTaiwanTravelQuestions(lessons);
    const reversed = buildTaiwanTravelQuestions(lessons, reverse);
    // Same question set, provably different option order through the seam.
    expect(reversed.map((q) => q.lessonId)).toEqual(defaultOrder.map((q) => q.lessonId));
    expect(reversed).not.toEqual(defaultOrder);
    // The seam is deterministic too.
    expect(buildTaiwanTravelQuestions(lessons, reverse)).toEqual(reversed);
  });

  it('does not mutate its input', () => {
    const input = fullCorpus();
    const before = JSON.stringify(input);
    buildTaiwanTravelQuestions(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ─── Fail-closed behavior ───────────────────────────────────────────────────

describe('buildTaiwanTravelQuestions — fail closed', () => {
  it('throws when a required lesson is missing', () => {
    const incomplete = fullCorpus().filter((lessonEntry) => lessonEntry.id !== 'lesson-007');
    expect(() => buildTaiwanTravelQuestions(incomplete)).toThrow(
      /lesson-007/,
    );
  });

  it('throws when a lesson has no usable review prompt', () => {
    const corpus = fullCorpus();
    const noUsable = corpus.map((entry) =>
      entry.id === 'lesson-005'
        ? lesson('lesson-005', [
            { promptJa: 'Q', answerJa: 'A', distractorsJa: [] },
            { promptJa: 'Q2', answerJa: 'A2', distractorsJa: ['A2', '', '   '] },
          ])
        : entry,
    );
    expect(() => buildTaiwanTravelQuestions(noUsable)).toThrow(
      /lesson-005/,
    );
  });

  it('throws on an empty corpus', () => {
    expect(() => buildTaiwanTravelQuestions([])).toThrow(/lesson-001/);
  });

  it('rejects prompts without an effective distinct distractor as unusable', () => {
    expect(isUsableReviewPrompt({ promptJa: 'Q', answerJa: 'A', distractorsJa: [] })).toBe(false);
    expect(isUsableReviewPrompt({ promptJa: 'Q', answerJa: 'A', distractorsJa: ['A'] })).toBe(false);
    expect(isUsableReviewPrompt({ promptJa: 'Q', answerJa: 'A', distractorsJa: ['B'] })).toBe(true);
    expect(firstUsableReviewPrompt(lesson('x', [{ promptJa: 'Q', answerJa: 'A' }]))).toBeNull();
  });
});

// ─── Question construction ──────────────────────────────────────────────────

describe('buildTaiwanTravelQuestion', () => {
  it('selects the first usable prompt deterministically', () => {
    const entry = lesson('lesson-001', [
      { promptJa: 'skip', answerJa: 'skipA', distractorsJa: [] },
      { promptJa: 'pick', answerJa: 'pickA', distractorsJa: ['D'] },
    ]);
    expect(firstUsableReviewPrompt(entry)?.promptJa).toBe('pick');
    const question = buildTaiwanTravelQuestion(entry, 1);
    expect(question.sourcePromptIndex).toBe(1);
    expect(question.promptJa).toBe('pick');
    expect(question.answerJa).toBe('pickA');
  });

  it('keeps the answer and distinct distractors as the full option set', () => {
    const entry = lesson('lesson-001', [
      { promptJa: 'Q', answerJa: 'A', distractorsJa: ['B', 'B', '', 'C'] },
    ]);
    const question = buildTaiwanTravelQuestion(entry, 0);
    expect([...question.options].sort()).toEqual(['A', 'B', 'C']);
    expect(question.options[question.correctIndex]).toBe('A');
  });
});

// ─── Session / state machine ────────────────────────────────────────────────

describe('TaiwanTravelQuiz session', () => {
  it('starts answering the first question with zero score', () => {
    const s = session();
    expect(s.status).toBe('answering');
    expect(s.currentIndex).toBe(0);
    expect(s.selected).toBeNull();
    expect(s.correctCount).toBe(0);
    expect(s.answeredCount).toBe(0);
    expect(scoreOfCompletedAttempt(s)).toBeNull();
  });

  it('rejects an empty question list', () => {
    expect(() => createTaiwanTravelQuizSession([])).toThrow(/at least one question/);
  });

  it('select → submit → next walks through every question', () => {
    const questions = buildTaiwanTravelQuestions(fullCorpus());
    const s = completeAttempt(questions, questions.map(() => 0));
    expect(s.status).toBe('completed');
    expect(s.answeredCount).toBe(TAIWAN_TRAVEL_QUIZ_LENGTH);
    expect(scoreOfCompletedAttempt(s)).toBe(s.correctCount);
  });

  it('tallies a bounded 0–10 score with no pass/fail threshold', () => {
    const questions = buildTaiwanTravelQuestions(fullCorpus());
    const allCorrect = completeAttempt(questions, questions.map((q) => q.correctIndex));
    expect(scoreOfCompletedAttempt(allCorrect)).toBe(TAIWAN_TRAVEL_MAX_SCORE);
    const noneCorrect = completeAttempt(questions, questions.map((q) => wrongOptionIndex(q)));
    expect(scoreOfCompletedAttempt(noneCorrect)).toBe(0);
    const someCorrect = completeAttempt(
      questions,
      questions.map((q, i) => (i % 2 === 0 ? q.correctIndex : wrongOptionIndex(q))),
    );
    const score = scoreOfCompletedAttempt(someCorrect);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(TAIWAN_TRAVEL_MAX_SCORE);
  });

  it('answer-safe until commitment: no correctness signal leaks in state before submit', () => {
    let s = session();
    const correctIndex = s.questions[0].correctIndex;
    s = applyTaiwanTravelQuizAction(s, { kind: 'select', index: correctIndex }).state;
    // Before submit, no lastCorrect is recorded and the score has not moved.
    expect(s.lastCorrect).toBeNull();
    expect(s.correctCount).toBe(0);
    const submitted = applyTaiwanTravelQuizAction(s, { kind: 'submit' });
    expect(submitted.effect).toBe('correct');
  });

  it('restart creates a fresh session without changing questions or score', () => {
    const questions = buildTaiwanTravelQuestions(fullCorpus());
    const s = completeAttempt(questions, questions.map(() => 0));
    const result = applyTaiwanTravelQuizAction(s, { kind: 'restart' });
    expect(result.effect).toBe('accepted');
    expect(result.state.status).toBe('answering');
    expect(result.state.currentIndex).toBe(0);
    expect(result.state.correctCount).toBe(0);
    expect(result.state.answeredCount).toBe(0);
    expect(result.state.questions).toEqual(questions);
  });

  it('rejects out-of-order actions', () => {
    const s = session();
    expect(applyTaiwanTravelQuizAction(s, { kind: 'submit' }).effect).toBe('noop');
    expect(applyTaiwanTravelQuizAction(s, { kind: 'next' }).effect).toBe('noop');
    expect(applyTaiwanTravelQuizAction(s, { kind: 'select', index: -1 }).effect).toBe('noop');
    expect(applyTaiwanTravelQuizAction(s, { kind: 'select', index: 99 }).effect).toBe('noop');
  });

  it('state keys are exactly the seven quiz fields (no hidden state)', () => {
    const s = session();
    expect(Object.keys(s).sort()).toEqual([
      'answeredCount',
      'correctCount',
      'currentIndex',
      'lastCorrect',
      'questions',
      'selected',
      'status',
    ]);
  });

  it('is fully deterministic: repeated identical action sequences are deeply equal', () => {
    function run() {
      const questions = buildTaiwanTravelQuestions(fullCorpus());
      let s = createTaiwanTravelQuizSession(questions);
      s = applyTaiwanTravelQuizAction(s, { kind: 'select', index: 0 }).state;
      s = applyTaiwanTravelQuizAction(s, { kind: 'submit' }).state;
      s = applyTaiwanTravelQuizAction(s, { kind: 'next' }).state;
      return s;
    }
    expect(run()).toEqual(run());
  });
});

// ─── Navigation config (contextual entry, no global tier) ───────────────────

describe('taiwanTravelQuizEntryForTrack — single contextual entry', () => {
  it('owns the exact frozen quiz route and label', () => {
    expect(TAIWAN_TRAVEL_ASSESSMENT_ROUTE).toBe('/paths/taiwan-travel/quiz/');
    expect(TAIWAN_TRAVEL_ASSESSMENT_LABEL_JA).toBe('総合テスト');
    expect(TAIWAN_TRAVEL_TRACK_ID).toBe('taiwan-travel');
  });

  it('returns the entry for the Taiwan Travel track only', () => {
    expect(taiwanTravelQuizEntryForTrack('taiwan-travel')).toEqual({
      labelJa: '総合テスト',
      href: '/paths/taiwan-travel/quiz/',
    });
    // No other track declares a comprehensive test in V1.
    expect(taiwanTravelQuizEntryForTrack('hsk-vocabulary')).toBeNull();
    expect(taiwanTravelQuizEntryForTrack('kanji-bridge')).toBeNull();
    expect(taiwanTravelQuizEntryForTrack('unknown-track')).toBeNull();
  });

  it('never fabricates a route for an arbitrary track id', () => {
    for (const trackId of ['', 'hsk', 'basic-vocabulary', 'roleplay']) {
      expect(taiwanTravelQuizEntryForTrack(trackId)).toBeNull();
    }
  });
});
