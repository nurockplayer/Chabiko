import {
  applyRoleplayRehearsalAction,
  cardLearnerLineIndexes,
  createRoleplayRehearsal,
  type RoleplayRehearsalState,
} from '../domain/roleplayRehearsal';
import { selectScript } from '../domain/scriptSelection';
import type { ScriptPreference } from '../lib/scriptPreference';
import { loadPrelaunchRoleplayCards } from '../content/loadRoleplayCards';
import { ROLEPLAY_PROGRESS_KEY, RoleplayProgressStore } from '../lib/roleplayProgress';
import { SCRIPT_PREFERENCE_EVENT } from './scriptPreferenceControl';

const cleanups = new WeakMap<HTMLElement, () => void>();
const cards = loadPrelaunchRoleplayCards();
const cardsById = new Map(cards.map((card) => [card.id, card]));

function preferenceFromRoot(root: HTMLElement): ScriptPreference {
  const value = root.ownerDocument.documentElement.dataset.scriptPreference;
  return value === 'traditional' || value === 'simplified' || value === 'path-default'
    ? value
    : 'path-default';
}

function setText(element: Element | null, value: string): void {
  if (element instanceof HTMLElement) element.textContent = value;
}

function renderLine(
  element: HTMLElement,
  line: (typeof cards)[number]['lines'][number],
  visible: boolean,
  preference: ScriptPreference,
): void {
  element.className = `roleplay-line roleplay-line--${line.speaker}`;
  element.hidden = !visible;
  setText(element.querySelector('[data-roleplay-speaker]'), line.speaker === 'learner' ? 'あなた' : '相手');
  const script = element.querySelector<HTMLElement>('[data-roleplay-script]');
  const pinyin = element.querySelector<HTMLElement>('[data-roleplay-pinyin]');
  const japanese = element.querySelector<HTMLElement>('[data-roleplay-japanese]');
  const fallback = element.querySelector<HTMLElement>('[data-roleplay-fallback]');
  if (!visible) {
    setText(script, '');
    setText(pinyin, '');
    setText(japanese, '');
    setText(fallback, '');
    return;
  }
  const result = selectScript(line.traditional, line.traditionalStatus, preference, {
    traditional: line.traditional,
    traditionalStatus: line.traditionalStatus,
    simplified: line.simplified,
    simplifiedStatus: line.simplifiedStatus,
  });
  if (result.status === 'unavailable') return;
  setText(script, result.script);
  if (script instanceof HTMLElement) {
    script.lang = preference === 'simplified' && result.isFallback === false ? 'zh-Hans' : 'zh-Hant';
  }
  setText(pinyin, line.pinyin);
  setText(japanese, line.japanese);
  setText(fallback, result.isFallback ? 'この表記は未収録のため、コース標準を表示しています。' : '');
}

export interface RoleplayRehearsalController {
  getState: () => RoleplayRehearsalState;
  dispose: () => void;
}

/** Bind the roleplay rehearsal to one route root, with a single listener set. */
export function mountRoleplayRehearsal(root: HTMLElement): RoleplayRehearsalController {
  cleanups.get(root)?.();
  const knownIds = new Set(cards.map((card) => card.id));
  const progress = new RoleplayProgressStore(undefined, knownIds);
  let state = createRoleplayRehearsal(cards);

  const selection = root.querySelector<HTMLElement>('[data-roleplay-selection]');
  const guidance = root.querySelector<HTMLElement>('[data-roleplay-guidance]');
  const active = root.querySelector<HTMLElement>('[data-roleplay-active]');
  const complete = root.querySelector<HTMLElement>('[data-roleplay-complete]');
  const linesView = root.querySelector<HTMLOListElement>('[data-roleplay-lines]');
  const startButton = root.querySelector<HTMLButtonElement>('[data-roleplay-start]');
  const backButton = root.querySelector<HTMLButtonElement>('[data-roleplay-back]');
  const revealButton = root.querySelector<HTMLButtonElement>('[data-roleplay-reveal]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-roleplay-next]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-roleplay-restart]');
  if (!selection || !guidance || !active || !complete || !linesView || !startButton || !backButton || !revealButton || !nextButton || !restartButton) {
    throw new Error('roleplay rehearsal markup is missing');
  }

  const selectionView = selection;
  const guidanceView = guidance;
  const activeView = active;
  const completeView = complete;
  const lines = linesView;
  const reveal = revealButton;
  const next = nextButton;

  function selectedCard() {
    return state.selectedCardId === null ? null : cardsById.get(state.selectedCardId) ?? null;
  }

  function applyVisibleScripts(): void {
    const card = selectedCard();
    if (card === null) return;
    const preference = preferenceFromRoot(root);
    for (const lineElement of Array.from(lines.querySelectorAll<HTMLElement>('[data-roleplay-line]'))) {
      const index = Number(lineElement.dataset.lineIndex);
      const line = card.lines[index];
      if (line === undefined) continue;
      const visible = line.speaker === 'partner' || state.revealedLearnerLineIndexes.includes(index);
      renderLine(lineElement, line, visible, preference);
    }
  }

  function render(focus: HTMLElement | string | null = null): void {
    const card = selectedCard();
    selectionView.hidden = state.phase !== 'selection';
    guidanceView.hidden = state.phase !== 'guidance';
    activeView.hidden = state.phase !== 'active';
    completeView.hidden = state.phase !== 'completed';

    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-roleplay-card-select]'))) {
      const id = button.dataset.roleplayCardSelect;
      const done = id !== undefined && progress.isComplete(id);
      button.setAttribute('aria-pressed', state.selectedCardId === id ? 'true' : 'false');
      setText(button.querySelector('[data-roleplay-card-status]'), done ? '練習済み' : '未完了');
    }

    if (card !== null) {
      setText(guidanceView.querySelector('[data-roleplay-guidance-title]'), card.titleJa);
      setText(guidanceView.querySelector('[data-roleplay-guidance-goal]'), card.goalJa);
      setText(guidanceView.querySelector('[data-roleplay-guidance-copy]'), card.guidanceJa);
      setText(activeView.querySelector('[data-roleplay-active-title]'), card.titleJa);
      const learnerIndexes = cardLearnerLineIndexes(card);
      const currentPosition = state.currentLearnerLineIndex === null
        ? 0
        : learnerIndexes.indexOf(state.currentLearnerLineIndex) + 1;
      setText(activeView.querySelector('[data-roleplay-progress]'), `${Math.min(currentPosition, learnerIndexes.length)} / ${learnerIndexes.length}`);
      setText(activeView.querySelector('[data-roleplay-active-hint]'), '相手のセリフを確認して、自分のセリフを声に出してみましょう。');

      if (state.phase === 'active' || state.phase === 'completed') {
        const template = root.querySelector<HTMLTemplateElement>(`[data-roleplay-card-template="${card.id}"]`);
        if (template !== null && lines.childElementCount === 0) {
          const fragment = template.content.cloneNode(true) as DocumentFragment;
          for (const line of Array.from(fragment.querySelectorAll<HTMLElement>('[data-roleplay-line-template]'))) {
            line.dataset.roleplayLine = '';
            line.classList.add('roleplay-line');
          }
          lines.append(fragment);
        }
        applyVisibleScripts();
      } else {
        lines.replaceChildren();
      }

      const revealed = state.currentLearnerLineIndex !== null && state.revealedLearnerLineIndexes.includes(state.currentLearnerLineIndex);
      reveal.hidden = state.phase !== 'active' || revealed;
      next.hidden = state.phase !== 'active' || !revealed;
      next.textContent = state.currentLearnerLineIndex !== null && learnerIndexes.indexOf(state.currentLearnerLineIndex) === learnerIndexes.length - 1 ? '完了する' : '次へ';
    } else {
      lines.replaceChildren();
      reveal.hidden = true;
      next.hidden = true;
    }
    const focusElement = typeof focus === 'string' ? root.querySelector<HTMLElement>(focus) : focus;
    if (focusElement !== null && focusElement !== undefined && !focusElement.hidden && !focusElement.hasAttribute('disabled')) focusElement.focus();
  }

  function applyAction(action: Parameters<typeof applyRoleplayRehearsalAction>[1], focusClass?: string): void {
    const result = applyRoleplayRehearsalAction(state, action);
    if (result.effect === 'noop') return;
    state = result.state;
    if (result.effect === 'completed' && state.selectedCardId !== null) progress.markComplete(state.selectedCardId);
    render(result.state.phase === 'completed' ? '[data-roleplay-restart]' : focusClass ?? null);
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cardButton = target.closest<HTMLButtonElement>('[data-roleplay-card-select]');
    if (cardButton !== null && root.contains(cardButton)) {
      applyAction({ kind: 'select-card', cardId: cardButton.dataset.roleplayCardSelect ?? '' }, '[data-roleplay-start]');
      return;
    }
    if (target.closest('[data-roleplay-start]')) { applyAction({ kind: 'start' }, '[data-roleplay-reveal]'); return; }
    if (target.closest('[data-roleplay-back]')) { state = createRoleplayRehearsal(cards); render('[data-roleplay-card-select]'); return; }
    if (target.closest('[data-roleplay-reveal]')) { applyAction({ kind: 'reveal' }, '[data-roleplay-next]'); return; }
    if (target.closest('[data-roleplay-next]')) { applyAction({ kind: 'next' }, '[data-roleplay-reveal]'); return; }
    if (target.closest('[data-roleplay-restart]')) { applyAction({ kind: 'restart' }, '[data-roleplay-card-select]'); }
  }

  function onPreferenceChange(): void { applyVisibleScripts(); }
  function onPageShow(): void { progress.refresh(); render(); }
  function onStorage(event: StorageEvent): void {
    let local: Storage | null = null;
    try { local = window.localStorage; } catch { /* inaccessible storage */ }
    if (event.storageArea !== null && event.storageArea !== local) return;
    if (event.key !== null && event.key !== ROLEPLAY_PROGRESS_KEY) return;
    progress.refresh();
    render();
  }

  root.addEventListener('click', onClick);
  document.addEventListener(SCRIPT_PREFERENCE_EVENT, onPreferenceChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);
  const cleanup = (): void => {
    root.removeEventListener('click', onClick);
    document.removeEventListener(SCRIPT_PREFERENCE_EVENT, onPreferenceChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  render();
  return { getState: () => state, dispose: cleanup };
}
