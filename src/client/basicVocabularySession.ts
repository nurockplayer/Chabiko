import {
  applyVocabularySessionAction,
  createVocabularySession,
} from '../domain/vocabularySession';
import type {
  VocabularySessionRating,
  VocabularySessionState,
} from '../domain/vocabularySession';

interface SessionIllustration {
  vocabularyId: string;
  assetPath: string;
  width: number;
  height: number;
  altJa: string;
}

interface SessionItem {
  id: string;
  simplified: string;
  pinyin: string;
  japanese: string;
  traditional?: string;
  illustration: SessionIllustration | null;
}

interface SessionData {
  items: SessionItem[];
}

const cleanups = new WeakMap<HTMLElement, () => void>();

function readSessionData(root: HTMLElement): SessionData {
  const source = root.dataset.basicVocabularyData;
  if (!source) {
    throw new Error('basic vocabulary session data is missing');
  }

  const data = JSON.parse(source) as SessionData;
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('basic vocabulary has no provisional items');
  }

  for (const item of data.items) {
    if (item.illustration && item.illustration.vocabularyId !== item.id) {
      throw new Error(`basic vocabulary illustration link is invalid for '${item.id}'`);
    }
  }

  return data;
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

export function initBasicVocabularySession(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const data = readSessionData(root);
  const ids = data.items.map((item) => item.id);
  const entries = new Map(data.items.map((item) => [item.id, item]));
  const availableCount = data.items.length as 10 | 20;
  let state: VocabularySessionState = createVocabularySession(ids, availableCount, 'zh-to-ja');

  const card = root.querySelector<HTMLElement>('[data-card]');
  const progress = root.querySelector<HTMLElement>('[data-progress]');
  if (!card || !progress) {
    throw new Error('basic vocabulary session markup is missing');
  }
  const cardElement = card;
  const progressElement = progress;

  function updateProgress(): void {
    progressElement.textContent = `${state.completedUniqueCount} / ${state.selectedItemIds.length} 語`;
  }

  function renderActive(): void {
    if (state.status !== 'active') return;
    const entry = entries.get(state.activeItemId);
    if (!entry) {
      throw new Error(`basic vocabulary item '${state.activeItemId}' is missing`);
    }

    const fragment = document.createDocumentFragment();
    if (entry.illustration) {
      const image = document.createElement('img');
      image.className = 'basic-vocabulary-illustration';
      image.src = entry.illustration.assetPath;
      image.width = entry.illustration.width;
      image.height = entry.illustration.height;
      image.alt = entry.illustration.altJa;
      fragment.append(image);
    }

    fragment.append(textElement(document, 'basic-vocabulary-simplified', entry.simplified, 'zh-Hans'));

    if (state.answerRevealed) {
      const answer = document.createElement('div');
      answer.className = 'basic-vocabulary-answer';
      answer.append(
        textElement(document, 'basic-vocabulary-pinyin', entry.pinyin, 'zh-Latn'),
        textElement(document, 'basic-vocabulary-japanese', entry.japanese, 'ja'),
      );
      if (entry.traditional) {
        answer.append(textElement(document, 'basic-vocabulary-traditional', entry.traditional, 'zh-Hant'));
      }
      fragment.append(answer);

      const ratings = document.createElement('div');
      ratings.className = 'basic-vocabulary-ratings';
      for (const [rating, label] of [
        ['again', 'もう一度'],
        ['unsure', 'まだ曖昧'],
        ['known', '覚えた'],
      ] as const) {
        const ratingButton = button(document, 'basic-vocabulary-rating', label, 'rate');
        ratingButton.dataset.rating = rating;
        fragment.append(ratings);
        ratings.append(ratingButton);
      }
    } else {
      fragment.append(button(document, 'basic-vocabulary-action basic-vocabulary-reveal', '答えを見る', 'reveal'));
    }

    cardElement.className = 'basic-vocabulary-card';
    cardElement.replaceChildren(fragment);
    updateProgress();
  }

  function renderCompleted(): void {
    cardElement.className = 'basic-vocabulary-completion';
    cardElement.replaceChildren(
      textElement(document, 'basic-vocabulary-completion-title', '今回の学習は完了です', 'ja'),
      button(document, 'basic-vocabulary-action basic-vocabulary-restart', 'もう一度学ぶ', 'restart'),
    );
    updateProgress();
  }

  function reveal(): void {
    const result = applyVocabularySessionAction(state, { kind: 'reveal' });
    if (result.kind !== 'accepted') return;
    state = result.state;
    renderActive();
    root.querySelector<HTMLButtonElement>('[data-rating="again"]')?.focus();
  }

  function rate(rating: VocabularySessionRating): void {
    const result = applyVocabularySessionAction(state, { kind: 'rate', rating });
    if (result.kind !== 'accepted') return;
    state = result.state;
    if (state.status === 'completed') {
      renderCompleted();
      root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.focus();
      return;
    }
    renderActive();
    root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();
  }

  function restart(): void {
    state = createVocabularySession(ids, availableCount, 'zh-to-ja');
    renderActive();
    root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLButtonElement>('button[data-action]');
    if (!control || !root.contains(control)) return;

    if (control.dataset.action === 'reveal') {
      reveal();
    } else if (control.dataset.action === 'rate') {
      const rating = control.dataset.rating as VocabularySessionRating;
      if (rating === 'again' || rating === 'unsure' || rating === 'known') rate(rating);
    } else if (control.dataset.action === 'restart') {
      restart();
    }
  }

  root.addEventListener('click', onClick);
  renderActive();

  const cleanup = () => {
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
