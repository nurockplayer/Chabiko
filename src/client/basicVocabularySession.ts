import {
  applyVocabularySessionAction,
  createVocabularySession,
} from '../domain/vocabularySession';
import type {
  VocabularySessionRating,
  VocabularySessionState,
} from '../domain/vocabularySession';
import {
  BasicVocabularyProgressStore,
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../domain/basicVocabularyProgress';
import { loadTeacherVocabulary } from '../content/loadTeacherVocabulary';

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

const cleanups = new WeakMap<HTMLElement, () => void>();

function initializeFromIds(
  root: HTMLElement,
): { ids: string[]; entries: Map<string, SessionItem>; availableCount: 20 } {
  const raw = root.dataset.basicVocabularyIds;
  if (!raw) {
    throw new Error('basic vocabulary session data is missing');
  }

  const ids = JSON.parse(raw) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('basic vocabulary has no provisional items');
  }

  const loaded = loadTeacherVocabulary();
  const entries = new Map<string, SessionItem>();

  for (const id of ids) {
    const match = loaded.find((item) => item.vocabulary.id === id);
    if (!match) {
      throw new Error(`basic vocabulary item '${id}' is missing from the loader`);
    }

    const { vocabulary, illustration } = match;

    if (illustration && illustration.vocabularyId !== vocabulary.id) {
      throw new Error(`basic vocabulary illustration link is invalid for '${vocabulary.id}'`);
    }

    entries.set(id, {
      id: vocabulary.id,
      simplified: vocabulary.simplified,
      pinyin: vocabulary.pinyin,
      japanese: vocabulary.japanese,
      traditional: vocabulary.traditional,
      illustration: illustration === null ? null : {
        vocabularyId: illustration.vocabularyId,
        assetPath: illustration.assetPath,
        width: illustration.width,
        height: illustration.height,
        altJa: illustration.altJa,
      },
    });
  }

  return { ids, entries, availableCount: 20 };
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

  const { ids: allIds, entries, availableCount } = initializeFromIds(root);

  const store = new BasicVocabularyProgressStore();

  const ids = store.prioritize(allIds).slice(0, availableCount);
  let state: VocabularySessionState = createVocabularySession(ids, availableCount, 'zh-to-ja');
  let hasRatedSinceInit = false;

  const card = root.querySelector<HTMLElement>('[data-card]');
  const progress = root.querySelector<HTMLElement>('[data-progress]');
  const summary = root.querySelector<HTMLElement>('[data-summary]');
  if (!card || !progress) {
    throw new Error('basic vocabulary session markup is missing');
  }
  const cardElement = card;
  const progressElement = progress;
  const summaryElement = summary;

  function updateProgress(): void {
    progressElement.textContent = `${state.completedUniqueCount} / ${state.selectedItemIds.length} 語`;
  }

  function updateSummary(): void {
    let newCount = 0;
    let learningCount = 0;
    let learnedCount = 0;
    for (const id of allIds) {
      const status = store.getStatus(id);
      if (status === 'new') newCount++;
      else if (status === 'learning') learningCount++;
      else if (status === 'learned') learnedCount++;
    }
    if (summaryElement) {
      summaryElement.textContent = `新規 ${newCount}語・学習中 ${learningCount}語・習得済み ${learnedCount}語`;
    }
  }

  function announceCompletion(): void {
    const sr = document.createElement('span');
    sr.className = 'basic-vocabulary-sr-only';
    sr.textContent = '今回の学習は完了です';
    progressElement.append(sr);
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
        ratings.append(ratingButton);
      }
      fragment.append(ratings);
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
    announceCompletion();
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

    // Apply to progress store. The state machine only accepts rates
    // on active sessions after reveal, so activeItemId is always defined.
    store.applyRating(state.activeItemId!, rating);
    hasRatedSinceInit = true;

    state = result.state;
    if (state.status === 'completed') {
      renderCompleted();
      root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.focus();
    } else {
      renderActive();
      root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();
    }
    updateSummary();
  }

  function restartSession(): void {
    const reprioritized = store.prioritize(allIds);
    const restartIds = reprioritized.slice(0, 10);
    state = createVocabularySession(restartIds, 10, 'zh-to-ja');
    hasRatedSinceInit = false;
    renderActive();
    root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();
    updateSummary();
  }

  function resetProgress(): void {
    if (!window.confirm('この単語コースの学習記録だけを削除しますか？')) return;
    store.resetAll();
    hasRatedSinceInit = false;
    restartSession();
    root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();

    const ann = document.createElement('span');
    ann.className = 'basic-vocabulary-sr-only';
    ann.textContent = 'この単語コースの学習記録をリセットしました';
    progressElement.append(ann);
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
      restartSession();
    } else if (control.dataset.action === 'reset') {
      resetProgress();
    }
  }

  root.addEventListener('click', onClick);
  renderActive();
  updateSummary();

  function onPageShow(): void {
    store.refresh();
    updateSummary();
    if (!hasRatedSinceInit) {
      restartSession();
    }
  }
  window.addEventListener('pageshow', onPageShow);

  function onStorage(e: StorageEvent): void {
    if (e.key !== BASIC_VOCABULARY_PROGRESS_KEY) return;
    store.refresh();
    updateSummary();
    if (!hasRatedSinceInit) {
      restartSession();
    }
  }
  window.addEventListener('storage', onStorage);

  const cleanup = () => {
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
