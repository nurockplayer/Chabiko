/**
 * Mount the word-order practice controller on the current page.
 *
 * Contains all DOM lifecycle logic: chunk toggling, submission, feedback,
 * retry, next, completion, restart, focus management, and keyboard access.
 * The pure state transitions live in the domain module; this module only
 * binds the domain to the DOM.
 */

import type { WordOrderState } from '../domain/wordOrderPractice';
import {
  applyWordOrderAction,
  createWordOrderSession,
} from '../domain/wordOrderPractice';

export interface SerializedWordOrderItem {
  readonly recordId: string;
  readonly promptJa: string;
  readonly separator: ' ' | '';
  readonly chunks: readonly { id: string; text: string }[];
  readonly canonicalOrder: readonly number[];
  readonly shownOrder: readonly number[];
}

export interface WordOrderSessionData {
  readonly items: readonly SerializedWordOrderItem[];
}

export interface WordOrderController {
  getState: () => WordOrderState;
  dispose: () => void;
}

const cleanups = new WeakMap<HTMLElement, () => void>();

export function mountWordOrderPractice(root: HTMLElement): WordOrderController {
  // A single controller is supported per root. Repeated mounts (Astro
  // navigation) tear down the previous listeners first.
  cleanups.get(root)?.();

  const raw = root.getAttribute('data-word-order-session');
  if (!raw) {
    throw new Error('word-order practice session data is missing');
  }

  let parsed: WordOrderSessionData;
  try {
    parsed = JSON.parse(raw) as WordOrderSessionData;
  } catch {
    throw new Error('word-order practice session data is not valid JSON');
  }

  const items: WordOrderState['items'] = parsed.items.map((item) => ({
    recordId: item.recordId,
    promptJa: item.promptJa,
    separator: item.separator,
    chunks: item.chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })),
    canonicalOrder: [...item.canonicalOrder],
    shownOrder: [...item.shownOrder],
  }));

  if (items.length === 0) {
    throw new Error('word-order practice has no items');
  }

  let state: WordOrderState = createWordOrderSession(items);

  const promptEl = root.querySelector<HTMLElement>('[data-word-order-prompt]');
  const progressEl = root.querySelector<HTMLElement>('[data-word-order-progress]');
  const poolEl = root.querySelector<HTMLElement>('[data-word-order-pool]');
  const answerEl = root.querySelector<HTMLElement>('[data-word-order-answer]');
  const feedbackEl = root.querySelector<HTMLElement>('[data-word-order-feedback]');
  const actionsEl = root.querySelector<HTMLElement>('[data-word-order-actions]');

  if (!promptEl || !progressEl || !poolEl || !answerEl || !feedbackEl || !actionsEl) {
    throw new Error('word-order practice markup is missing');
  }

  // The guard above proves these are present, but closures inside render()
  // cannot narrow the optional types, so pin them as the non-null element.
  const promptView: HTMLElement = promptEl;
  const progressView: HTMLElement = progressEl;
  const poolView: HTMLElement = poolEl;
  const answerView: HTMLElement = answerEl;
  const feedbackView: HTMLElement = feedbackEl;
  const actionsView: HTMLElement = actionsEl;

  function currentItem(): WordOrderState['items'][number] {
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

    // ── Answer well: selected chunks in activation order ──────────────────
    const answerButtons = state.selected.map((shownPosition) => {
      const chunk = item.chunks[item.shownOrder[shownPosition]];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-order-chunk word-order-chunk--answer';
      button.dataset.position = String(shownPosition);
      button.setAttribute('data-word-order-control', '');
      button.textContent = chunk.text;
      button.lang = 'zh-Hant';
      button.setAttribute('aria-label', `選択中のチャンク ${chunk.text}`);
      if (state.status === 'submitted') button.disabled = true;
      return button;
    });

    answerView.replaceChildren();
    for (const button of answerButtons) answerView.append(button);

    const emptyHint = root.querySelector<HTMLElement>('.word-order-answer-empty');
    if (emptyHint) emptyHint.hidden = state.selected.length > 0;

    // ── Source pool: every chunk exactly once ─────────────────────────────
    const selectedSet = new Set(state.selected);
    const poolButtons = item.shownOrder
      .map((chunkIndex, shownPosition) => ({ chunkIndex, shownPosition }))
      .map(({ chunkIndex, shownPosition }) => {
        const chunk = item.chunks[chunkIndex];
        const isUsed = selectedSet.has(shownPosition);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'word-order-chunk word-order-chunk--pool';
        button.dataset.position = String(shownPosition);
        button.setAttribute('data-word-order-control', '');
        button.textContent = chunk.text;
        button.lang = 'zh-Hant';
        button.disabled = isUsed || state.status === 'submitted';
        button.setAttribute('aria-label', isUsed ? '使用済みのチャンク' : `チャンク ${chunk.text}`);
        return button;
      });

    poolView.replaceChildren();
    for (const button of poolButtons) poolView.append(button);

    // ── Feedback ──────────────────────────────────────────────────────────
    feedbackView.textContent = '';
    feedbackView.className = 'word-order-feedback';
    if (state.status === 'submitted') {
      if (state.lastCorrect) {
        feedbackView.className = 'word-order-feedback word-order-feedback--correct';
        feedbackView.textContent = '正解！';
      } else {
        const canonical = item.canonicalOrder
          .map((chunkIndex) => item.chunks[chunkIndex].text)
          .join(item.separator);

        feedbackView.className = 'word-order-feedback word-order-feedback--incorrect';
        const line1 = document.createElement('p');
        line1.className = 'word-order-feedback__line';
        line1.textContent = '並べ替えが違います。';
        const line2 = document.createElement('p');
        line2.className = 'word-order-feedback__line';
        line2.append('正解：');
        const canonicalSpan = document.createElement('span');
        canonicalSpan.lang = 'zh-Hant';
        canonicalSpan.textContent = canonical;
        line2.append(canonicalSpan);
        feedbackView.append(line1, line2);
      }
    }

    // ── Actions ───────────────────────────────────────────────────────────
    const submitDisabled = state.selected.length === 0 ||
      state.selected.length !== item.chunks.length ||
      state.status === 'submitted';

    actionsView.replaceChildren();
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'word-order-action word-order-action--submit';
    submitBtn.setAttribute('data-word-order-control', '');
    submitBtn.textContent = '答え合わせ';
    submitBtn.disabled = submitDisabled;
    submitBtn.setAttribute('aria-label', submitDisabled
      ? '答え合わせ（すべてのチャンクを選ぶまで利用できません）'
      : '答え合わせ');
    actionsView.append(submitBtn);

    if (state.status === 'submitted') {
      // Retry is offered only on the incorrect path; a correct answer
      // advances straight to next (or completion) with no replay prompt.
      if (!state.lastCorrect) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'word-order-action word-order-action--retry';
        retryBtn.setAttribute('data-word-order-control', '');
        retryBtn.textContent = 'もう一度並べ替える';
        actionsView.append(retryBtn);
      }

      if (state.lastCorrect) {
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'word-order-action word-order-action--next';
        nextBtn.setAttribute('data-word-order-control', '');
        nextBtn.textContent = state.currentIndex + 1 < state.items.length ? '次の文' : '完了';
        actionsView.append(nextBtn);
      }
    }

    // ── Focus management ──────────────────────────────────────────────────
    if (state.status === 'submitted') {
      if (state.lastCorrect) {
        const nextBtn = actionsView.querySelector<HTMLButtonElement>('.word-order-action--next');
        nextBtn?.focus();
      } else {
        const retryBtn = actionsView.querySelector<HTMLButtonElement>('.word-order-action--retry');
        retryBtn?.focus();
      }
    } else {
      // A disabled button cannot receive focus, so while composing the focus
      // lands on the first available pool chunk; once every chunk is used the
      // (now enabled) submit control becomes the focus target.
      const firstAvailable = poolView.querySelector<HTMLButtonElement>('button:not(:disabled)');
      if (firstAvailable) {
        firstAvailable.focus();
      } else {
        submitBtn.focus();
      }
    }
  }

  function renderCompleted(): void {
    promptView.textContent = '';
    progressView.textContent = '完了';
    answerView.replaceChildren();
    poolView.replaceChildren();

    const emptyHint = root.querySelector<HTMLElement>('.word-order-answer-empty');
    if (emptyHint) emptyHint.hidden = true;

    const complete = document.createElement('p');
    complete.className = 'word-order-complete-text';
    complete.textContent = '練習完了！すべて並べ替えられました。';
    feedbackView.replaceChildren(complete);
    feedbackView.className = 'word-order-feedback word-order-feedback--complete';

    actionsView.replaceChildren();
    const restartBtn = document.createElement('button');
    restartBtn.type = 'button';
    restartBtn.className = 'word-order-action word-order-action--restart';
    restartBtn.setAttribute('data-word-order-control', '');
    restartBtn.textContent = 'もう一度最初から';
    actionsView.append(restartBtn);
    restartBtn.focus();
  }

  function handleAction(target: Element): void {
    if (!(target instanceof HTMLButtonElement)) return;

    const position = target.dataset.position;

    if (position !== undefined) {
      const result = applyWordOrderAction(state, {
        kind: 'toggle',
        position: Number(position),
      });
      state = result.state;
      render();
      return;
    }

    if (target.classList.contains('word-order-action--submit')) {
      state = applyWordOrderAction(state, { kind: 'submit' }).state;
      render();
      return;
    }
    if (target.classList.contains('word-order-action--retry')) {
      state = applyWordOrderAction(state, { kind: 'retry' }).state;
      render();
      return;
    }
    if (target.classList.contains('word-order-action--next')) {
      state = applyWordOrderAction(state, { kind: 'next' }).state;
      render();
      return;
    }
    if (target.classList.contains('word-order-action--restart')) {
      state = applyWordOrderAction(state, { kind: 'restart' }).state;
      render();
      return;
    }
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>('button[data-word-order-control]');
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
