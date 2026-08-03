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
import type { LearnerRenderIllustration } from '../content/learnerSessionPayload';
import manifest from '../../data/teacher-vocabulary-preview/learner-manifest.json' assert { type: 'json' };
import type { LearnerManifest } from '../types/learnerManifest';

interface SessionIllustration {
  assetPath: string;
  width: number;
  height: number;
  altJa: string;
}

interface SessionItem {
  id: string;
  simplified: string;
  pinyin?: string;
  japanese?: string;
  traditional?: string;
  illustration: SessionIllustration | null;
}

interface RenderPayload {
  totalCount: number;
  render: Readonly<Record<string, LearnerRenderIllustration>>;
}

/** Opaque learnerId → non-secret card-front data (image + simplified). Answers
 * (pinyin/japanese/traditional) live in the client bundle via the manifest
 * import, never in the serialized HTML payload. */
const answerById = new Map<
  string,
  { simplified: string; pinyin?: string; japanese?: string; traditional?: string }
>();
for (const row of (manifest as LearnerManifest).rows) {
  answerById.set(row.learnerId, {
    simplified: row.simplified,
    pinyin: row.pinyin,
    japanese: row.japanese,
    traditional: row.traditional,
  });
}

const cleanups = new WeakMap<HTMLElement, () => void>();

function readRenderPayload(root: HTMLElement): RenderPayload | null {
  const el = root.querySelector<HTMLElement>('#basic-vocabulary-data');
  if (!el || !el.textContent) return null;
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { totalCount?: unknown }).totalCount === 'number' &&
      (parsed as { render?: unknown }).render !== null &&
      typeof (parsed as { render?: unknown }).render === 'object'
    ) {
      return parsed as RenderPayload;
    }
  } catch {
    /* malformed payload — fall back to no render metadata */
  }
  return null;
}

function initializeFromIds(
  root: HTMLElement,
): { ids: string[]; entries: Map<string, SessionItem>; availableCount: 10 | 20; totalCount: number } {
  const raw = root.dataset.basicVocabularyIds;
  if (!raw) {
    throw new Error('basic vocabulary session data is missing');
  }

  const ids = JSON.parse(raw) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('basic vocabulary has no provisional items');
  }

  const sizeAttr = root.dataset.basicVocabularySessionSize;
  const availableCount: 10 | 20 = sizeAttr !== undefined ? 10 : 20;

  const payload = readRenderPayload(root);
  const entries = new Map<string, SessionItem>();

  for (const id of ids) {
    const match = answerById.get(id);
    if (!match) {
      throw new Error(`basic vocabulary item '${id}' is missing from the loader`);
    }

    entries.set(id, {
      id,
      simplified: match.simplified,
      pinyin: match.pinyin,
      japanese: match.japanese,
      traditional: match.traditional,
      illustration: payload?.render[id] ?? null,
    });
  }

  return { ids, entries, availableCount, totalCount: payload?.totalCount ?? ids.length };
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

  const { ids: allIds, entries, availableCount, totalCount } = initializeFromIds(root);

  const store = new BasicVocabularyProgressStore();

  const ids = store.selectSession(allIds, availableCount);
  let state: VocabularySessionState = createVocabularySession(ids, availableCount, 'zh-to-ja');
  let hasRatedSinceInit = false;

  const card = root.querySelector<HTMLElement>('[data-card]');
  const progress = root.querySelector<HTMLElement>('[data-progress]');
  const summary = root.querySelector<HTMLElement>('[data-summary]');
  const total = root.querySelector<HTMLElement>('[data-total]');
  if (!card || !progress) {
    throw new Error('basic vocabulary session markup is missing');
  }
  const cardElement = card;
  const progressElement = progress;
  const summaryElement = summary;
  const totalElement = total;

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
    if (totalElement) {
      totalElement.textContent = `対象 ${totalCount}語`;
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
      // Only build the answer container when at least one truthful optional
      // answer exists; a row with no pinyin/japanese/traditional must not
      // render an empty flex item / blank gap after reveal.
      const answerParts: Array<{ className: string; text: string; lang: string }> = [];
      if (entry.pinyin) {
        answerParts.push({ className: 'basic-vocabulary-pinyin', text: entry.pinyin, lang: 'zh-Latn' });
      }
      if (entry.japanese) {
        answerParts.push({ className: 'basic-vocabulary-japanese', text: entry.japanese, lang: 'ja' });
      }
      if (entry.traditional) {
        answerParts.push({ className: 'basic-vocabulary-traditional', text: entry.traditional, lang: 'zh-Hant' });
      }
      if (answerParts.length > 0) {
        const answer = document.createElement('div');
        answer.className = 'basic-vocabulary-answer';
        for (const part of answerParts) {
          answer.append(textElement(document, part.className, part.text, part.lang));
        }
        fragment.append(answer);
      }

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
    const restartIds = store.selectSession(allIds, availableCount);
    state = createVocabularySession(restartIds, availableCount, 'zh-to-ja');
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

  function refreshFromStorage(): void {
    store.refresh();
    updateSummary();
    if (!hasRatedSinceInit) {
      restartSession();
    }
  }

  function onStorage(e: StorageEvent): void {
    if (!store.isRelevantStorageArea(e.storageArea)) return;
    if (e.key !== BASIC_VOCABULARY_PROGRESS_KEY && e.key !== null) return;

    const isExternalDeletion = e.key === null || e.newValue === null;
    if (isExternalDeletion) {
      if (store.acceptExternalClear()) {
        restartSession();
      } else {
        refreshFromStorage();
      }
      return;
    }

    refreshFromStorage();
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
