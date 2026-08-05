/**
 * Mount the visual tone-discrimination practice controller on the current
 * page.
 *
 * Contains all DOM lifecycle logic: choice selection, submission, feedback,
 * retry, next, completion, restart, focus management, and the live-region
 * announcement. The pure state transitions live in the domain module; this
 * module only binds the domain to the DOM. No storage, network, timer, or
 * media APIs are used.
 */

import type {
  ToneChoice,
  ToneContourId,
  TonePracticeItem,
  TonePracticeState,
} from '../domain/tonePractice';
import {
  isToneChoice,
  applyTonePracticeAction,
  createTonePracticeSession,
} from '../domain/tonePractice';

export interface SerializedTonePracticeItem {
  readonly recordId: string;
  readonly promptJa: string;
  readonly correctAnswer: string;
  readonly distractors: readonly string[];
  readonly contrastId: string;
  readonly toneContourId: string;
  readonly toneContourHintJa: string;
  readonly interferenceJa: string;
}

export interface TonePracticeSessionData {
  readonly items: readonly SerializedTonePracticeItem[];
}

export interface TonePracticeController {
  getState: () => TonePracticeState;
  dispose: () => void;
}

const cleanups = new WeakMap<HTMLElement, () => void>();

export function mountTonePractice(root: HTMLElement): TonePracticeController {
  // A single controller is supported per root. Repeated mounts (Astro
  // navigation) tear down the previous listeners first.
  cleanups.get(root)?.();

  const raw = root.getAttribute('data-tone-session');
  if (!raw) {
    throw new Error('tone practice session data is missing');
  }

  let parsed: TonePracticeSessionData;
  try {
    parsed = JSON.parse(raw) as TonePracticeSessionData;
  } catch {
    throw new Error('tone practice session data is not valid JSON');
  }

  // The serialized data is produced by the loader, which has already
  // validated every field; the casts only restore the narrowed union types.
  const items: TonePracticeItem[] = parsed.items.map((item) => ({
    recordId: item.recordId,
    promptJa: item.promptJa,
    correctAnswer: item.correctAnswer as ToneChoice,
    distractors: [
      item.distractors[0] as ToneChoice,
      item.distractors[1] as ToneChoice,
      item.distractors[2] as ToneChoice,
    ],
    contrastId: item.contrastId,
    toneContourId: item.toneContourId as ToneContourId,
    toneContourHintJa: item.toneContourHintJa,
    interferenceJa: item.interferenceJa,
  }));

  if (items.length === 0) {
    throw new Error('tone practice has no items');
  }

  let state: TonePracticeState = createTonePracticeSession(items);

  const promptEl = root.querySelector<HTMLElement>('[data-tone-prompt]');
  const progressEl = root.querySelector<HTMLElement>('[data-tone-progress]');
  const contourEl = root.querySelector<HTMLElement>('[data-tone-contour]');
  const contourLabelEl = root.querySelector<HTMLElement>('[data-tone-contour-label]');
  const hintEl = root.querySelector<HTMLElement>('[data-tone-hint]');
  const choicesEl = root.querySelector<HTMLElement>('[data-tone-choices]');
  const feedbackEl = root.querySelector<HTMLElement>('[data-tone-feedback]');
  const actionsEl = root.querySelector<HTMLElement>('[data-tone-actions]');

  if (
    !promptEl || !progressEl || !contourEl || !contourLabelEl ||
    !hintEl || !choicesEl || !feedbackEl || !actionsEl
  ) {
    throw new Error('tone practice markup is missing');
  }

  const promptView: HTMLElement = promptEl;
  const progressView: HTMLElement = progressEl;
  const contourView: HTMLElement = contourEl;
  const contourLabelView: HTMLElement = contourLabelEl;
  const hintView: HTMLElement = hintEl;
  const choicesView: HTMLElement = choicesEl;
  const feedbackView: HTMLElement = feedbackEl;
  const actionsView: HTMLElement = actionsEl;

  function currentItem(): TonePracticeItem {
    return state.items[state.currentIndex];
  }

  function render(): void {
    if (state.status === 'completed') {
      renderCompleted();
      return;
    }

    const item = currentItem();

    promptView.textContent = item.promptJa;
    progressView.textContent = `${state.currentIndex + 1} / ${state.items.length}`;

    // ── Tone contour: repository-defined text/CSS geometry only ───────────
    contourView.dataset.contour = item.toneContourId;
    contourLabelView.textContent = item.toneContourHintJa;
    // The hint guidance stays visible from the first render of the item,
    // so retry returns to the same item with the same guidance.
    hintView.textContent = item.toneContourHintJa;
    hintView.hidden = false;

    // ── Four named choices ────────────────────────────────────────────────
    const choices = [item.correctAnswer, ...item.distractors];
    choicesView.replaceChildren();
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tone-choice';
      button.dataset.choice = choice;
      button.setAttribute('data-tone-control', '');
      button.textContent = choice;
      button.lang = 'zh-Hant';
      button.setAttribute('aria-pressed', String(state.selected === choice));
      if (state.status === 'submitted') button.disabled = true;
      choicesView.append(button);
    }

    // ── Feedback ──────────────────────────────────────────────────────────
    feedbackView.textContent = '';
    feedbackView.className = 'tone-feedback';
    if (state.status === 'submitted') {
      if (state.lastCorrect) {
        feedbackView.className = 'tone-feedback tone-feedback--correct';
        feedbackView.textContent = '正解！';
      } else {
        feedbackView.className = 'tone-feedback tone-feedback--incorrect';
        const line1 = document.createElement('p');
        line1.className = 'tone-feedback__line';
        line1.textContent = '違います。';
        const line2 = document.createElement('p');
        line2.className = 'tone-feedback__line';
        line2.append('正解：');
        const correctSpan = document.createElement('strong');
        correctSpan.lang = 'zh-Hant';
        correctSpan.textContent = item.correctAnswer;
        line2.append(correctSpan);
        feedbackView.append(line1, line2);
      }
    }

    // ── Actions ───────────────────────────────────────────────────────────
    const submitDisabled = state.selected === null || state.status === 'submitted';

    actionsView.replaceChildren();
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'tone-action tone-action--submit';
    submitBtn.setAttribute('data-tone-control', '');
    submitBtn.textContent = '答え合わせ';
    submitBtn.disabled = submitDisabled;
    submitBtn.setAttribute('aria-label', submitDisabled
      ? '答え合わせ（声調を選ぶまで利用できません）'
      : '答え合わせ');
    actionsView.append(submitBtn);

    if (state.status === 'submitted') {
      // Retry is offered only on the incorrect path; a correct answer
      // advances straight to next (or completion) with no replay prompt.
      if (!state.lastCorrect) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'tone-action tone-action--retry';
        retryBtn.setAttribute('data-tone-control', '');
        retryBtn.textContent = 'もう一度挑戦する';
        actionsView.append(retryBtn);
      }

      if (state.lastCorrect) {
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'tone-action tone-action--next';
        nextBtn.setAttribute('data-tone-control', '');
        nextBtn.textContent = state.currentIndex + 1 < state.items.length ? '次の問題' : '完了';
        actionsView.append(nextBtn);
      }
    }

    // ── Focus management ──────────────────────────────────────────────────
    if (state.status === 'submitted') {
      if (state.lastCorrect) {
        const nextBtn = actionsView.querySelector<HTMLButtonElement>('.tone-action--next');
        nextBtn?.focus();
      } else {
        const retryBtn = actionsView.querySelector<HTMLButtonElement>('.tone-action--retry');
        retryBtn?.focus();
      }
    } else {
      // A disabled button cannot receive focus, so the submit button becomes
      // the focus target as soon as a choice is selected; otherwise the first
      // choice keeps keyboard navigation reachable.
      const selectedChoice = choicesView.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      if (selectedChoice) {
        submitBtn.focus();
      } else {
        const firstChoice = choicesView.querySelector<HTMLButtonElement>('button.tone-choice');
        firstChoice?.focus();
      }
    }
  }

  function renderCompleted(): void {
    promptView.textContent = '';
    progressView.textContent = '完了';
    contourView.removeAttribute('data-contour');
    contourLabelView.textContent = '';
    hintView.textContent = '';
    hintView.hidden = true;
    choicesView.replaceChildren();

    const complete = document.createElement('p');
    complete.className = 'tone-complete-text';
    complete.textContent = '練習完了！すべての声調を見分けられました。';
    feedbackView.replaceChildren(complete);
    feedbackView.className = 'tone-feedback tone-feedback--complete';

    actionsView.replaceChildren();
    const restartBtn = document.createElement('button');
    restartBtn.type = 'button';
    restartBtn.className = 'tone-action tone-action--restart';
    restartBtn.setAttribute('data-tone-control', '');
    restartBtn.textContent = 'もう一度最初から';
    actionsView.append(restartBtn);
    restartBtn.focus();
  }

  function handleAction(target: Element): void {
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.classList.contains('tone-choice')) {
      const choice = target.dataset.choice;
      // Unknown labels are rejected by the domain; nothing is invented here.
      if (choice !== undefined && isToneChoice(choice) && state.selected !== choice) {
        state = applyTonePracticeAction(state, { kind: 'select', choice }).state;
        render();
      }
      return;
    }

    if (target.classList.contains('tone-action--submit')) {
      state = applyTonePracticeAction(state, { kind: 'submit' }).state;
      render();
      return;
    }
    if (target.classList.contains('tone-action--retry')) {
      state = applyTonePracticeAction(state, { kind: 'retry' }).state;
      render();
      return;
    }
    if (target.classList.contains('tone-action--next')) {
      state = applyTonePracticeAction(state, { kind: 'next' }).state;
      render();
      return;
    }
    if (target.classList.contains('tone-action--restart')) {
      state = applyTonePracticeAction(state, { kind: 'restart' }).state;
      render();
      return;
    }
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>('button[data-tone-control]');
    if (!control || !root.contains(control)) return;
    handleAction(control);
  };

  // Keyboard accessibility: buttons are natively focusable and activate on
  // Enter/Space. We additionally re-render after any pointer click.
  root.addEventListener('click', onClick);

  function onPageShow(): void {
    // Direct refresh / bfcache keeps the pure in-memory state machine; no
    // persistence exists, so the current item survives unchanged.
    render();
  }
  window.addEventListener('pageshow', onPageShow);

  const cleanup = (): void => {
    root.removeEventListener('click', onClick);
    window.removeEventListener('pageshow', onPageShow);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);

  render();

  return {
    getState: () => state,
    dispose: cleanup,
  };
}
