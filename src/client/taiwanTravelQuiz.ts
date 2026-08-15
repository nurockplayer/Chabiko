import lessonsBundle from '../../data/examples/valid/lessons.json' assert { type: 'json' };
import type { Lesson } from '../types/lesson';
import {
  applyTaiwanTravelQuizAction,
  buildTaiwanTravelQuestions,
  createTaiwanTravelQuizSession,
  scoreOfCompletedAttempt,
} from '../domain/taiwanTravelAssessment';
import type {
  TaiwanTravelQuestion,
  TaiwanTravelQuizState,
} from '../domain/taiwanTravelAssessment';
import { TaiwanTravelAssessmentStore } from '../lib/taiwanTravelAssessmentStore';

/**
 * Taiwan Travel comprehensive test client (#376).
 *
 * The serialized HTML payload carries only opaque lesson ids; the questions
 * (with answers) live in this client bundle via the lessons import, matching
 * the basic-vocabulary quiz's answer-secrecy model. The learner sees only the
 * source prompt and the option buttons until they commit an answer; only after
 * commitment does correct/incorrect feedback and the source-backed answer
 * appear. On completion the isolated evidence store records the best score at
 * most once per attempt — lesson/practice completion is never touched.
 */

interface TaiwanTravelQuizPayload {
  lessonIds: readonly string[];
}

const lessons = (lessonsBundle as { lessons: Lesson[] }).lessons;

const cleanups = new WeakMap<HTMLElement, () => void>();

function readPayload(root: HTMLElement): TaiwanTravelQuizPayload | null {
  const element = root.querySelector<HTMLElement>('#taiwan-travel-quiz-data');
  if (!element || !element.textContent) return null;
  try {
    const parsed = JSON.parse(element.textContent) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { lessonIds?: unknown }).lessonIds)
    ) {
      return parsed as TaiwanTravelQuizPayload;
    }
  } catch {
    /* malformed payload — fall back to unavailable state */
  }
  return null;
}

function textElement(
  document: Document,
  className: string,
  value: string,
  language?: string,
): HTMLParagraphElement {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = value;
  if (language) element.lang = language;
  return element;
}

function button(
  document: Document,
  className: string,
  label: string,
  action: string,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.dataset.action = action;
  element.textContent = label;
  return element;
}

function renderOptionButton(
  document: Document,
  question: TaiwanTravelQuestion,
  index: number,
): HTMLButtonElement {
  const option = button(
    document,
    'taiwan-travel-quiz-option',
    question.options[index],
    'select',
  );
  option.dataset.index = String(index);
  option.setAttribute('aria-pressed', 'false');
  return option;
}

export function initTaiwanTravelQuiz(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const card = root.querySelector<HTMLElement>('[data-quiz-card]');
  const progressElement = root.querySelector<HTMLElement>('[data-quiz-progress]');
  const scoreElement = root.querySelector<HTMLElement>('[data-quiz-score]');
  const totalElement = root.querySelector<HTMLElement>('[data-quiz-total]');
  if (!card) {
    throw new Error('taiwan travel quiz markup is missing');
  }
  const cardElement = card;

  const payload = readPayload(root);
  if (payload === null || payload.lessonIds.length === 0) {
    renderUnavailable(document, card);
    return () => undefined;
  }

  let questions: TaiwanTravelQuestion[] = [];
  try {
    questions = buildTaiwanTravelQuestions(lessons);
  } catch {
    // Fail closed: never fabricate a question from missing/malformed source.
    renderUnavailable(document, card);
    return () => undefined;
  }

  // The payload contract is the frozen ordered lesson list; if it ever drifts
  // from the production lessons, treat the assessment as unavailable rather
  // than presenting a mismatched session.
  const payloadMatches =
    questions.length === payload.lessonIds.length &&
    questions.every((question, index) => question.lessonId === payload.lessonIds[index]);
  if (!payloadMatches) {
    renderUnavailable(document, card);
    return () => undefined;
  }

  const total = questions.length;
  if (totalElement) {
    totalElement.textContent = `対象 ${total}レッスン`;
  }

  const store = new TaiwanTravelAssessmentStore();
  let state: TaiwanTravelQuizState = createTaiwanTravelQuizSession(questions);

  function updateProgressAndScore(): void {
    if (progressElement) {
      progressElement.textContent = `${state.answeredCount} / ${total}`;
    }
    if (scoreElement) {
      scoreElement.textContent = `正解 ${state.correctCount} / ${total}`;
    }
  }

  function renderUnavailable(document: Document, target: HTMLElement): void {
    target.className = 'taiwan-travel-quiz-card';
    target.replaceChildren(
      textElement(
        document,
        'taiwan-travel-quiz-unavailable',
        '総合テストを開始できませんでした',
        'ja',
      ),
    );
  }

  function renderAnswering(stealFocus: boolean): void {
    if (state.status !== 'answering') return;
    const question = state.questions[state.currentIndex];

    const fragment = document.createDocumentFragment();
    fragment.append(
      textElement(document, 'taiwan-travel-quiz-prompt', question.promptJa, 'ja'),
    );

    const options = document.createElement('div');
    options.className = 'taiwan-travel-quiz-options';
    for (let index = 0; index < question.options.length; index++) {
      options.append(renderOptionButton(document, question, index));
    }
    fragment.append(options);

    const submit = button(
      document,
      'taiwan-travel-quiz-action taiwan-travel-quiz-submit',
      '答える',
      'submit',
    );
    submit.disabled = true;
    fragment.append(submit);

    cardElement.className = 'taiwan-travel-quiz-card';
    cardElement.replaceChildren(fragment);
    updateProgressAndScore();

    if (stealFocus) {
      cardElement
        .querySelector<HTMLButtonElement>('[data-action="select"]')
        ?.focus();
    }
  }

  function updateSelectionUI(): void {
    const optionButtons =
      cardElement.querySelectorAll<HTMLButtonElement>('[data-action="select"]');
    for (const option of optionButtons) {
      const index = Number(option.dataset.index);
      option.setAttribute('aria-pressed', String(index === state.selected));
    }
    const submit = cardElement.querySelector<HTMLButtonElement>(
      '[data-action="submit"]',
    );
    if (submit) submit.disabled = state.selected === null;
  }

  function renderRevealed(): void {
    if (state.status !== 'revealed') return;
    const question = state.questions[state.currentIndex];
    const isCorrect = state.lastCorrect === true;

    const fragment = document.createDocumentFragment();
    fragment.append(
      textElement(document, 'taiwan-travel-quiz-prompt', question.promptJa, 'ja'),
    );

    // The options remain visible after commit, but are non-interactive and
    // annotated so the learner can see the correct answer and their pick.
    const options = document.createElement('div');
    options.className = 'taiwan-travel-quiz-options';
    for (let index = 0; index < question.options.length; index++) {
      const option = renderOptionButton(document, question, index);
      option.disabled = true;
      if (index === question.correctIndex) option.dataset.correct = 'true';
      if (index === state.selected && !isCorrect) option.dataset.wrong = 'true';
      options.append(option);
    }
    fragment.append(options);

    fragment.append(
      textElement(
        document,
        'taiwan-travel-quiz-feedback',
        isCorrect ? '正解です' : '不正解です',
        'ja',
      ),
    );

    // The source-backed answer appears only after commitment.
    fragment.append(
      textElement(
        document,
        'taiwan-travel-quiz-answer',
        `正解：${question.answerJa}`,
        'ja',
      ),
    );

    fragment.append(
      button(
        document,
        'taiwan-travel-quiz-action taiwan-travel-quiz-next',
        '次へ',
        'next',
      ),
    );

    cardElement.className = 'taiwan-travel-quiz-card';
    cardElement.replaceChildren(fragment);
    updateProgressAndScore();
    cardElement.querySelector<HTMLButtonElement>('[data-action="next"]')?.focus();
  }

  function renderCompleted(): void {
    if (state.status !== 'completed') return;
    const score = scoreOfCompletedAttempt(state) ?? 0;
    const bestScore = store.readBestScore();

    const fragment = document.createDocumentFragment();
    fragment.append(
      textElement(document, 'taiwan-travel-quiz-completion-title', 'テスト完了', 'ja'),
    );
    fragment.append(
      textElement(
        document,
        'taiwan-travel-quiz-completion-score',
        `10問中 ${score}問正解`,
        'ja',
      ),
    );
    fragment.append(
      textElement(
        document,
        'taiwan-travel-quiz-completion-best',
        `ベストスコア ${bestScore} / ${total}`,
        'ja',
      ),
    );
    fragment.append(
      button(
        document,
        'taiwan-travel-quiz-action taiwan-travel-quiz-restart',
        'もう一度テストする',
        'restart',
      ),
    );

    cardElement.className = 'taiwan-travel-quiz-card taiwan-travel-quiz-completion';
    cardElement.replaceChildren(fragment);
    updateProgressAndScore();
    cardElement
      .querySelector<HTMLButtonElement>('[data-action="restart"]')
      ?.focus();
  }

  function render(stealFocus = false): void {
    if (state.status === 'answering') renderAnswering(stealFocus);
    else if (state.status === 'revealed') renderRevealed();
    else renderCompleted();
  }

  function select(index: number): void {
    const result = applyTaiwanTravelQuizAction(state, { kind: 'select', index });
    if (result.effect !== 'accepted') return;
    state = result.state;
    updateSelectionUI();
  }

  function submit(): void {
    const result = applyTaiwanTravelQuizAction(state, { kind: 'submit' });
    if (result.effect !== 'correct' && result.effect !== 'incorrect') return;
    state = result.state;
    renderRevealed();
  }

  function next(): void {
    const result = applyTaiwanTravelQuizAction(state, { kind: 'next' });
    if (result.effect !== 'accepted') return;
    state = result.state;
    if (state.status === 'completed') {
      // The attempt just completed: record the best score exactly once. The
      // store never writes before a full attempt completes and never touches
      // lesson progress.
      const score = scoreOfCompletedAttempt(state) ?? 0;
      store.recordCompletedAttempt(score);
    }
    render(true);
  }

  function restart(): void {
    const result = applyTaiwanTravelQuizAction(state, { kind: 'restart' });
    if (result.effect !== 'accepted') return;
    state = result.state;
    render(true);
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLButtonElement>('button[data-action]');
    if (!control || !root.contains(control)) return;

    if (control.dataset.action === 'select') {
      select(Number(control.dataset.index));
    } else if (control.dataset.action === 'submit') {
      submit();
    } else if (control.dataset.action === 'next') {
      next();
    } else if (control.dataset.action === 'restart') {
      restart();
    }
  }

  root.addEventListener('click', onClick);
  render(false);

  const cleanup = (): void => {
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
