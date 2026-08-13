import {
  VOCABULARY_QUIZ_LENGTH,
  applyVocabularyQuizAction,
  buildVocabularyQuizQuestions,
  createVocabularyQuizSession,
} from '../domain/vocabularyQuiz';
import type {
  VocabularyQuizEntry,
  VocabularyQuizQuestion,
  VocabularyQuizState,
} from '../domain/vocabularyQuiz';
import manifest from '../../data/teacher-vocabulary-preview/learner-manifest.json' assert { type: 'json' };
import type { LearnerManifest } from '../types/learnerManifest';

/** Opaque learnerId → quiz-facing entry. Answers (japanese/pinyin/traditional)
 * live in the client bundle via the manifest import, never in the serialized
 * HTML payload, matching the image-card session's answer-secrecy model. */
const entryById = new Map<string, VocabularyQuizEntry>();
for (const row of (manifest as LearnerManifest).rows) {
  entryById.set(row.learnerId, {
    learnerId: row.learnerId,
    simplified: row.simplified,
    japanese: row.japanese ?? '',
    pinyin: row.pinyin,
    traditional: row.traditional,
  });
}

interface QuizPayload {
  eligibleIds: readonly string[];
}

const cleanups = new WeakMap<HTMLElement, () => void>();

function readPayload(root: HTMLElement): QuizPayload | null {
  const el = root.querySelector<HTMLElement>('#basic-vocabulary-quiz-data');
  if (!el || !el.textContent) return null;
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { eligibleIds?: unknown }).eligibleIds)
    ) {
      return parsed as QuizPayload;
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

/**
 * Build the four-option question UI for the current question. The image-free
 * guarantee is structural: no `<img>` element is ever created, and the only
 * learner-facing content before commitment is the Simplified headword plus the
 * four Japanese-meaning buttons.
 */
function renderOptionButton(
  document: Document,
  question: VocabularyQuizQuestion,
  index: number,
): HTMLButtonElement {
  const option = button(
    document,
    'basic-vocabulary-quiz-option',
    question.options[index],
    'select',
  );
  option.dataset.index = String(index);
  option.setAttribute('aria-pressed', 'false');
  return option;
}

export function initBasicVocabularyQuiz(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const card = root.querySelector<HTMLElement>('[data-quiz-card]');
  const progressElement = root.querySelector<HTMLElement>('[data-quiz-progress]');
  const scoreElement = root.querySelector<HTMLElement>('[data-quiz-score]');
  const totalElement = root.querySelector<HTMLElement>('[data-quiz-total]');
  if (!card) {
    throw new Error('basic vocabulary quiz markup is missing');
  }
  const cardElement = card;

  const payload = readPayload(root);
  if (payload === null || payload.eligibleIds.length === 0) {
    renderUnavailable(document, card);
    return () => undefined;
  }

  const entries: VocabularyQuizEntry[] = [];
  for (const id of payload.eligibleIds) {
    const match = entryById.get(id);
    if (!match) {
      throw new Error(`basic vocabulary item '${id}' is missing from the loader`);
    }
    entries.push(match);
  }

  const questions = buildVocabularyQuizQuestions(entries, VOCABULARY_QUIZ_LENGTH);
  if (questions.length === 0) {
    renderUnavailable(document, card);
    return () => undefined;
  }

  const total = questions.length;
  if (totalElement) {
    totalElement.textContent = `対象 ${payload.eligibleIds.length}語`;
  }

  let state: VocabularyQuizState = createVocabularyQuizSession(questions);

  function updateProgressAndScore(): void {
    if (progressElement) {
      progressElement.textContent = `${state.answeredCount} / ${total}`;
    }
    if (scoreElement) {
      scoreElement.textContent = `正解 ${state.correctCount} / ${total}`;
    }
  }

  function renderUnavailable(document: Document, target: HTMLElement): void {
    target.className = 'basic-vocabulary-quiz-card';
    target.replaceChildren(
      textElement(document, 'basic-vocabulary-quiz-unavailable', 'テストを開始できませんでした', 'ja'),
    );
  }

  function renderAnswering(stealFocus: boolean): void {
    if (state.status !== 'answering') return;
    const question = state.questions[state.currentIndex];

    const fragment = document.createDocumentFragment();
    fragment.append(
      textElement(document, 'basic-vocabulary-quiz-simplified', question.simplified, 'zh-Hans'),
    );

    const options = document.createElement('div');
    options.className = 'basic-vocabulary-quiz-options';
    for (let index = 0; index < question.options.length; index++) {
      options.append(renderOptionButton(document, question, index));
    }
    fragment.append(options);

    const submit = button(document, 'basic-vocabulary-quiz-action basic-vocabulary-quiz-submit', '答える', 'submit');
    submit.disabled = true;
    fragment.append(submit);

    cardElement.className = 'basic-vocabulary-quiz-card';
    cardElement.replaceChildren(fragment);
    updateProgressAndScore();

    if (stealFocus) {
      cardElement.querySelector<HTMLButtonElement>('[data-action="select"]')?.focus();
    }
  }

  function updateSelectionUI(): void {
    const optionButtons = cardElement.querySelectorAll<HTMLButtonElement>('[data-action="select"]');
    for (const option of optionButtons) {
      const index = Number(option.dataset.index);
      option.setAttribute('aria-pressed', String(index === state.selected));
    }
    const submit = cardElement.querySelector<HTMLButtonElement>('[data-action="submit"]');
    if (submit) submit.disabled = state.selected === null;
  }

  function renderRevealed(): void {
    if (state.status !== 'revealed') return;
    const question = state.questions[state.currentIndex];
    const isCorrect = state.lastCorrect === true;

    const fragment = document.createDocumentFragment();
    fragment.append(
      textElement(document, 'basic-vocabulary-quiz-simplified', question.simplified, 'zh-Hans'),
    );

    // The options remain visible after commit, but are non-interactive and
    // annotated so the learner can see the correct answer and their pick.
    const options = document.createElement('div');
    options.className = 'basic-vocabulary-quiz-options';
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
        'basic-vocabulary-quiz-feedback',
        isCorrect ? '正解です' : '不正解です',
        'ja',
      ),
    );

    // Post-commit reveal: pinyin, Traditional, and Japanese may now appear.
    const revealParts: Array<{ className: string; text: string; lang: string }> = [];
    if (question.pinyin) {
      revealParts.push({ className: 'basic-vocabulary-quiz-pinyin', text: question.pinyin, lang: 'zh-Latn' });
    }
    if (question.traditional && question.traditional !== question.simplified) {
      revealParts.push({ className: 'basic-vocabulary-quiz-traditional', text: question.traditional, lang: 'zh-Hant' });
    }
    // The correct Japanese meaning is the answer line.
    revealParts.push({
      className: 'basic-vocabulary-quiz-japanese',
      text: question.options[question.correctIndex],
      lang: 'ja',
    });
    const answer = document.createElement('div');
    answer.className = 'basic-vocabulary-quiz-answer';
    for (const part of revealParts) {
      answer.append(textElement(document, part.className, part.text, part.lang));
    }
    fragment.append(answer);

    fragment.append(
      button(document, 'basic-vocabulary-quiz-action basic-vocabulary-quiz-next', '次へ', 'next'),
    );

    cardElement.className = 'basic-vocabulary-quiz-card';
    cardElement.replaceChildren(fragment);
    updateProgressAndScore();
    cardElement.querySelector<HTMLButtonElement>('[data-action="next"]')?.focus();
  }

  function renderCompleted(): void {
    if (state.status !== 'completed') return;
    const fragment = document.createDocumentFragment();
    fragment.append(
      textElement(document, 'basic-vocabulary-quiz-completion-title', 'テスト完了', 'ja'),
    );
    fragment.append(
      textElement(
        document,
        'basic-vocabulary-quiz-completion-score',
        `正解 ${state.correctCount} / ${total}`,
        'ja',
      ),
    );
    fragment.append(
      button(document, 'basic-vocabulary-quiz-action basic-vocabulary-quiz-restart', 'もう一度テストする', 'restart'),
    );

    cardElement.className = 'basic-vocabulary-quiz-card basic-vocabulary-quiz-completion';
    cardElement.replaceChildren(fragment);
    updateProgressAndScore();
    cardElement.querySelector<HTMLButtonElement>('[data-action="restart"]')?.focus();
  }

  function render(stealFocus = false): void {
    if (state.status === 'answering') renderAnswering(stealFocus);
    else if (state.status === 'revealed') renderRevealed();
    else renderCompleted();
  }

  function select(index: number): void {
    const result = applyVocabularyQuizAction(state, { kind: 'select', index });
    if (result.effect !== 'accepted') return;
    state = result.state;
    updateSelectionUI();
  }

  function submit(): void {
    const result = applyVocabularyQuizAction(state, { kind: 'submit' });
    if (result.effect !== 'correct' && result.effect !== 'incorrect') return;
    state = result.state;
    renderRevealed();
  }

  function next(): void {
    const result = applyVocabularyQuizAction(state, { kind: 'next' });
    if (result.effect !== 'accepted') return;
    state = result.state;
    render(true);
  }

  function restart(): void {
    const result = applyVocabularyQuizAction(state, { kind: 'restart' });
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
