import {
  applyVocabularySessionAction,
  createVocabularySession,
} from '../domain/vocabularySession';
import type {
  VocabularySessionRating,
  VocabularySessionState,
} from '../domain/vocabularySession';
import type { VocabularyProgressStatus } from '../domain/vocabularyProgress';
import {
  BasicVocabularyProgressStore,
} from '../domain/basicVocabularyProgress';
import { getBasicVocabularyProgressCoordinator } from './basicVocabularyProgressCoordinator';
import type { BasicVocabularySyncRuntimeSnapshot } from './basicVocabularySyncRuntime';
import type { LearnerRenderIllustration } from '../content/learnerSessionPayload';
import manifest from '../../data/teacher-vocabulary-preview/learner-manifest.json' assert { type: 'json' };
import type { LearnerManifest } from '../types/learnerManifest';
import {
  SCRIPT_PREFERENCE_EVENT,
} from './scriptPreferenceControl';
import { FALLBACK_ANNOTATION } from '../domain/scriptSelection';
import type { ScriptPreference } from '../lib/scriptPreference';

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
  example?: string;
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
  { simplified: string; pinyin?: string; japanese?: string; traditional?: string; example?: string }
>();
for (const row of (manifest as LearnerManifest).rows) {
  answerById.set(row.learnerId, {
    simplified: row.simplified,
    pinyin: row.pinyin,
    japanese: row.japanese,
    traditional: row.traditional,
    example: row.example,
  });
}

interface CompletionMetrics {
  newlyEncounteredCount: number;
  reviewedExistingCount: number;
  newlyLearnedCount: number;
  encounteredTotalCount: number;
  learnedTotalCount: number;
}

const cleanups = new WeakMap<HTMLElement, () => void>();

/** The exact three controlled preference values (#251/#252). Anything else —
 * including the root dataset being absent or garbage — is path-default. */
function readRootScriptPreference(): ScriptPreference {
  const value = document.documentElement.dataset.scriptPreference;
  if (value === 'traditional' || value === 'simplified') return value;
  return 'path-default';
}

/** Which Chinese script the current preference asks for. `path-default` means
 * the path's authored default form, which for this route is simplified. */
function requestedScript(preference: ScriptPreference): 'traditional' | 'simplified' {
  return preference === 'traditional' ? 'traditional' : 'simplified';
}

/** The truthful visible front-script text for an entry under the current
 * preference. A `traditional` request whose item has no authored traditional
 * form is never fabricated: the simplified text is shown with the exact #251
 * fallback annotation. `path-default`/`simplified` requests are unchanged. */
function visibleFrontScript(
  entry: SessionItem,
  preference: ScriptPreference,
): { script: string; lang: 'zh-Hant' | 'zh-Hans'; isFallback: boolean } {
  if (requestedScript(preference) === 'traditional' && entry.traditional) {
    return { script: entry.traditional, lang: 'zh-Hant', isFallback: false };
  }
  return { script: entry.simplified, lang: 'zh-Hans', isFallback: requestedScript(preference) === 'traditional' };
}

/** The truthful revealed traditional comparison text for an entry under the
 * current preference. Path-default and traditional keep the existing
 * production comparison field (authored traditional when present); a
 * simplified preference omits it. Never fabricated: no authored form means
 * no comparison text, preserving answer secrecy. */
function revealedTraditional(
  entry: SessionItem,
  preference: ScriptPreference,
): string | null {
  if (preference === 'simplified') return null;
  return entry.traditional ?? null;
}

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
      example: match.example,
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

function labeledWordElement(
  document: Document,
  className: string,
  label: string,
  value: string,
  language: string,
): HTMLElement {
  const field = document.createElement('div');
  field.className = 'basic-vocabulary-word-field';

  const fieldLabel = document.createElement('p');
  fieldLabel.className = 'basic-vocabulary-word-field-label';
  fieldLabel.lang = 'ja';
  fieldLabel.textContent = label;

  field.append(fieldLabel, textElement(document, className, value, language));
  return field;
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
 * Completion result metrics (Issue #277). Captured against the progress status
 * of each selected unique ID at session start, so requeues (again/unsure)
 * never double-count a unique ID. Zero values are kept and rendered.
 */
function deriveCompletionMetrics(
  store: BasicVocabularyProgressStore,
  startStatuses: Map<string, VocabularyProgressStatus>,
  selectedItemIds: readonly string[],
  allIds: readonly string[],
): CompletionMetrics {
  let newlyEncounteredCount = 0;
  let reviewedExistingCount = 0;
  let newlyLearnedCount = 0;
  let encounteredTotalCount = 0;
  let learnedTotalCount = 0;

  for (const id of selectedItemIds) {
    const start = startStatuses.get(id) ?? 'new';
    const current = store.getStatus(id);
    if (start === 'new' && current !== 'new') newlyEncounteredCount++;
    if (start === 'learning' || start === 'learned') reviewedExistingCount++;
    if (start !== 'learned' && current === 'learned') newlyLearnedCount++;
  }

  for (const id of allIds) {
    const status = store.getStatus(id);
    if (status !== 'new') encounteredTotalCount++;
    if (status === 'learned') learnedTotalCount++;
  }

  return {
    newlyEncounteredCount,
    reviewedExistingCount,
    newlyLearnedCount,
    encounteredTotalCount,
    learnedTotalCount,
  };
}

function completionStatRow(
  document: Document,
  label: string,
  count: number,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'basic-vocabulary-completion-stat';
  const labelElement = document.createElement('dt');
  labelElement.textContent = label;
  const valueElement = document.createElement('dd');
  valueElement.textContent = `${count}語`;
  row.append(labelElement, valueElement);
  return row;
}

export function initBasicVocabularySession(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const { ids: allIds, entries, availableCount, totalCount } = initializeFromIds(root);

  /** The coordinator runtime store when present (Issue #293). When the account
   * coordinator is not installed, fall back to a direct guest store so the
   * study route keeps its pre-#293 behavior. */
  const coordinator = getBasicVocabularyProgressCoordinator();
  const directStore =
    coordinator === null ? new BasicVocabularyProgressStore() : null;
  let store: BasicVocabularyProgressStore =
    coordinator !== null ? coordinator.getStore() : directStore!;
  /** The full identity the session is currently bound to, so a coordinator
   * scope switch (guest↔user or user A↔B) is detected without any reset or
   * write. */
  let boundScope: 'guest' | 'user' | null =
    coordinator !== null ? coordinator.getSnapshot().scope : null;
  let boundUserId: string | null =
    coordinator !== null ? coordinator.getSnapshot().userId : null;

  const ids = store.selectSession(allIds, availableCount);
  let state: VocabularySessionState = createVocabularySession(ids, availableCount, 'zh-to-ja');
  let hasRatedSinceInit = false;
  /** Progress status of each selected unique ID at session start, captured
   * before any rating in that session (Issue #277). */
  let startStatuses = new Map<string, VocabularyProgressStatus>(
    ids.map(id => [id, store.getStatus(id)]),
  );
  /** Effective script preference, re-read on the #252 document event so a
   * learner selection, storage refresh, or external clear re-renders the
   * visible script without touching the session/progress domain. */
  let scriptPreference: ScriptPreference = readRootScriptPreference();

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
    // Preserve persistent live-region announcements (identity-switch or reset,
    // marked with data-keep-announcement) so a subsequent same-identity sync's
    // progress re-render does not wipe them before the screen reader can
    // announce them. Completion announcements are intentionally not preserved.
    const announcements = Array.from(
      progressElement.querySelectorAll<HTMLElement>(
        '[data-keep-announcement="true"]',
      ),
    );
    progressElement.textContent =
      `今回 ${state.completedUniqueCount} / ${state.selectedItemIds.length}語`;
    for (const announcement of announcements) progressElement.append(announcement);
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
      totalElement.textContent = `全${totalCount}語`;
    }
  }

  function announceCompletion(): void {
    const sr = document.createElement('span');
    sr.className = 'basic-vocabulary-sr-only';
    sr.textContent = `今回の${state.selectedItemIds.length}語を完了しました`;
    progressElement.append(sr);
  }

  /** Re-capture the start statuses of a fresh session's selected IDs after a
   * new session starts (continue/replay/restart/reset). */
  function refreshSessionMetadata(): void {
    startStatuses = new Map(
      state.selectedItemIds.map(id => [id, store.getStatus(id)]),
    );
  }

  function renderActive(): void {
    if (state.status !== 'active') return;
    const entry = entries.get(state.activeItemId);
    if (!entry) {
      throw new Error(`basic vocabulary item '${state.activeItemId}' is missing`);
    }

    const fragment = document.createDocumentFragment();

    // Reveal-state caption (frozen §13, A1 Editorial Calm): a quiet jade label
    // at the top of the card, shown only once the answer is revealed.
    if (state.answerRevealed) {
      const stateLabel = document.createElement('p');
      stateLabel.className = 'basic-vocabulary-state';
      stateLabel.textContent = '答えを表示済み';
      fragment.append(stateLabel);
    }

    const front = visibleFrontScript(entry, scriptPreference);
    const frontElement = textElement(
      document,
      'basic-vocabulary-simplified',
      front.script,
      front.lang,
    );
    if (state.answerRevealed) {
      const context = document.createElement('section');
      context.className = 'basic-vocabulary-context';
      context.setAttribute('aria-label', '先生の中国語フレーズ');

      const contextLabel = textElement(
        document,
        'basic-vocabulary-context-label',
        '先生の中国語フレーズ',
        'ja',
      );
      context.append(contextLabel);

      if (entry.example) {
        context.append(
          textElement(
            document,
            'basic-vocabulary-context-text',
            entry.example,
            'zh-Hans',
          ),
        );
      } else {
        context.classList.add('basic-vocabulary-context--missing');
        contextLabel.textContent = 'フレーズ準備中';
      }
      fragment.append(context);

      // Recall-first reveal (#356): the illustration is answer feedback, shown
      // together with the answer in the same transition when 「答えを見る」 is
      // pressed. In the phrase-first composition it supports the contextual
      // language and stays ahead of the explanatory word breakdown.
      if (entry.illustration) {
        const image = document.createElement('img');
        image.className = 'basic-vocabulary-illustration';
        image.src = entry.illustration.assetPath;
        image.width = entry.illustration.width;
        image.height = entry.illustration.height;
        image.alt = entry.illustration.altJa;
        fragment.append(image);
      }

      const wordBreakdown = document.createElement('section');
      wordBreakdown.className = 'basic-vocabulary-word-breakdown';
      wordBreakdown.setAttribute('aria-label', '単語の情報');
      wordBreakdown.append(
        textElement(document, 'basic-vocabulary-word-label', '今回の単語', 'ja'),
        frontElement,
      );
      if (front.isFallback) {
        wordBreakdown.append(
          textElement(
            document,
            'basic-vocabulary-script-fallback',
            FALLBACK_ANNOTATION,
            'ja',
          ),
        );
      }

      // Only build the answer container when at least one truthful optional
      // answer exists; a row with no pinyin/japanese/traditional must not
      // render an empty flex item / blank gap after reveal.
      const answerParts: Array<{
        className: string;
        label: string;
        text: string;
        lang: string;
      }> = [];
      if (entry.pinyin) {
        answerParts.push({
          className: 'basic-vocabulary-pinyin',
          label: '単語のピンイン',
          text: entry.pinyin,
          lang: 'zh-Latn',
        });
      }
      if (entry.japanese) {
        answerParts.push({
          className: 'basic-vocabulary-japanese',
          label: '単語の意味',
          text: entry.japanese,
          lang: 'ja',
        });
      }
      // The revealed traditional comparison field follows the global script
      // preference: omitted under a simplified preference, and only shown
      // when the item has an authored traditional form (path-default and
      // traditional keep the existing production comparison).
      const traditional = revealedTraditional(entry, scriptPreference);
      if (traditional) {
        answerParts.push({
          className: 'basic-vocabulary-traditional',
          label: '繁体字の表記',
          text: traditional,
          lang: 'zh-Hant',
        });
      }
      if (answerParts.length > 0) {
        const answer = document.createElement('div');
        answer.className = 'basic-vocabulary-answer';
        for (const part of answerParts) {
          answer.append(
            labeledWordElement(
              document,
              part.className,
              part.label,
              part.text,
              part.lang,
            ),
          );
        }
        wordBreakdown.append(answer);
      }
      fragment.append(wordBreakdown);

      const ratings = document.createElement('div');
      ratings.className = 'basic-vocabulary-ratings';
      for (const [rating, label] of [
        ['again', 'また'],
        ['unsure', 'むずかしい'],
        ['known', 'できた'],
      ] as const) {
        const ratingButton = button(document, 'basic-vocabulary-rating', label, 'rate');
        ratingButton.dataset.rating = rating;
        ratings.append(ratingButton);
      }
      fragment.append(ratings);
    } else {
      fragment.append(frontElement);
      if (front.isFallback) {
        fragment.append(
          textElement(
            document,
            'basic-vocabulary-script-fallback',
            FALLBACK_ANNOTATION,
            'ja',
          ),
        );
      }
      fragment.append(button(document, 'basic-vocabulary-action basic-vocabulary-reveal', '答えを見る', 'reveal'));
    }

    cardElement.className = 'basic-vocabulary-card';
    cardElement.replaceChildren(fragment);
    updateProgress();
  }

  /** In-place script refresh for a preference change (#252 document event) or
   * a pageshow re-read. Updates only the visible Chinese form, the optional
   * fallback annotation, and the revealed traditional comparison — never
   * rebuilds the card, so an in-focus control keeps focus, no rating or
   * progress write happens, and image/pinyin/japanese/buttons stay untouched. */
  function updateVisibleScript(): void {
    if (state.status !== 'active') return;
    const entry = entries.get(state.activeItemId);
    if (!entry) return;

    const front = visibleFrontScript(entry, scriptPreference);
    const frontElement = cardElement.querySelector<HTMLElement>('.basic-vocabulary-simplified');
    if (!frontElement) return;
    frontElement.textContent = front.script;
    frontElement.lang = front.lang;

    const existingFallback = cardElement.querySelector('.basic-vocabulary-script-fallback');
    if (front.isFallback) {
      if (!existingFallback) {
        frontElement.after(
          textElement(document, 'basic-vocabulary-script-fallback', FALLBACK_ANNOTATION, 'ja'),
        );
      }
    } else {
      existingFallback?.remove();
    }

    if (!state.answerRevealed) return;
    const answer = cardElement.querySelector('.basic-vocabulary-answer');
    if (!answer) return;
    const traditional = revealedTraditional(entry, scriptPreference);
    const existingTraditional = answer.querySelector('.basic-vocabulary-traditional');
    if (traditional) {
      if (!existingTraditional) {
        answer.append(
          labeledWordElement(
            document,
            'basic-vocabulary-traditional',
            '繁体字の表記',
            traditional,
            'zh-Hant',
          ),
        );
      } else if (existingTraditional.textContent !== traditional) {
        existingTraditional.textContent = traditional;
      }
    } else {
      existingTraditional?.closest('.basic-vocabulary-word-field')?.remove();
    }
  }

  function renderCompleted(): void {
    const metrics = deriveCompletionMetrics(
      store,
      startStatuses,
      state.selectedItemIds,
      allIds,
    );

    const nextSessionSize = Math.min(availableCount, allIds.length);

    const title = textElement(
      document,
      'basic-vocabulary-completion-title',
      `今回の${state.selectedItemIds.length}語を完了しました`,
      'ja',
    );

    const stats = document.createElement('dl');
    stats.className = 'basic-vocabulary-completion-stats';
    stats.append(
      completionStatRow(document, '新しく学んだ', metrics.newlyEncounteredCount),
      completionStatRow(document, '復習した', metrics.reviewedExistingCount),
      completionStatRow(document, '習得できた', metrics.newlyLearnedCount),
      completionStatRow(
        document,
        '出会った単語',
        metrics.encounteredTotalCount,
      ),
      completionStatRow(document, '習得済み', metrics.learnedTotalCount),
    );
    const encountered = stats.querySelectorAll('.basic-vocabulary-completion-stat')[3] as HTMLElement;
    const encounteredValue = encountered.querySelector('dd');
    if (encounteredValue) {
      encounteredValue.textContent = `${metrics.encounteredTotalCount} / ${totalCount}語`;
    }

    const actions = document.createElement('div');
    actions.className = 'basic-vocabulary-completion-actions';
    actions.append(
      button(
        document,
        'basic-vocabulary-action basic-vocabulary-continue',
        `次の${nextSessionSize}語を学ぶ`,
        'continue',
      ),
      button(
        document,
        'basic-vocabulary-action basic-vocabulary-replay',
        `今回の${state.selectedItemIds.length}語を復習する`,
        'replay',
      ),
    );

    cardElement.className = 'basic-vocabulary-completion';
    cardElement.replaceChildren(title, stats, actions);
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
    // Through the coordinator this invokes the runtime exactly once and
    // requests a non-blocking sync; the direct store path writes locally only.
    // The flag is set before applying so a synchronous same-identity sync
    // notification (the coordinator fires the runtime's `syncing` snapshot
    // before awaiting the network) never restarts the just-rated session.
    hasRatedSinceInit = true;
    if (coordinator !== null) {
      coordinator.applyRating(state.activeItemId!, rating);
    } else {
      store.applyRating(state.activeItemId!, rating);
    }

    state = result.state;
    if (state.status === 'completed') {
      renderCompleted();
      root.querySelector<HTMLButtonElement>('[data-action="continue"]')?.focus();
    } else {
      renderActive();
      root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();
    }
    updateSummary();
  }

  function startSession(ids: readonly string[]): void {
    state = createVocabularySession(ids, availableCount, 'zh-to-ja');
    hasRatedSinceInit = false;
    renderActive();
    refreshSessionMetadata();
    updateSummary();
    root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();
  }

  /** Continue (primary): re-read the canonical store selector over the full
   * corpus so unseen IDs can enter the next window. */
  function continueSession(): void {
    const nextIds = store.selectSession(allIds, availableCount);
    startSession(nextIds);
  }

  /** Replay (secondary): start a new session from the exact just-completed
   * selected IDs in the same order, without re-running the selector. */
  function replaySession(): void {
    startSession([...state.selectedItemIds]);
  }

  function restartSession(): void {
    startSession(store.selectSession(allIds, availableCount));
  }

  function resetProgress(): void {
    if (!window.confirm('この単語コースの学習記録だけを削除しますか？')) return;
    if (coordinator !== null) {
      coordinator.resetAll();
    } else {
      store.resetAll();
    }
    hasRatedSinceInit = false;
    restartSession();
    root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.focus();

    const ann = document.createElement('span');
    ann.className = 'basic-vocabulary-sr-only';
    ann.dataset.keepAnnouncement = 'true';
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
    } else if (control.dataset.action === 'continue') {
      continueSession();
    } else if (control.dataset.action === 'replay') {
      replaySession();
    } else if (control.dataset.action === 'reset') {
      resetProgress();
    }
  }

  root.addEventListener('click', onClick);
  renderActive();
  updateSummary();

  // Update the visible script on an effective preference change (#252 document
  // event). Never restarts, rerates, advances, reveals, writes progress, or
  // moves focus: state and the store stay untouched, and the in-place refresh
  // preserves the active item, revealed answers, and any focused control.
  function onScriptPreferenceChange(): void {
    scriptPreference = readRootScriptPreference();
    updateVisibleScript();
  }
  document.addEventListener(SCRIPT_PREFERENCE_EVENT, onScriptPreferenceChange);

  function onPageShow(): void {
    scriptPreference = readRootScriptPreference();
    store.refresh();
    updateSummary();
    if (!hasRatedSinceInit) {
      restartSession();
    } else {
      updateVisibleScript();
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
    if (!store.isRelevantStorageKey(e.key)) return;

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

  // Coordinator bridge (Issue #293): re-resolve the store on an identity
  // switch and react to same-identity syncs.
  let unsubscribeCoordinator: () => void = () => undefined;
  // The subscription delivers the current snapshot immediately; the session is
  // already initialized against it, so the first callback is skipped.
  let firstCoordinatorSnapshot = true;
  function onCoordinatorSnapshot(snapshot: BasicVocabularySyncRuntimeSnapshot): void {
    if (coordinator === null) return;
    if (firstCoordinatorSnapshot) {
      firstCoordinatorSnapshot = false;
      return;
    }
    const identityChanged =
      snapshot.scope !== boundScope || snapshot.userId !== boundUserId;
    boundScope = snapshot.scope;
    boundUserId = snapshot.userId;
    store = coordinator.getStore();
    if (identityChanged) {
      // Identity switch (guest↔user or user A↔B): switch scope without any
      // write or reset, start a fresh concealed session, reset only the
      // session-local metrics, update the summary, focus the first reveal, and
      // announce exactly once.
      restartSession();
      const ann = document.createElement('span');
      ann.className = 'basic-vocabulary-sr-only';
      ann.dataset.keepAnnouncement = 'true';
      ann.textContent = '学習記録を切り替えました';
      progressElement.append(ann);
      return;
    }
    // Same-identity sync: may restart the selection only before any rating in
    // the active session; after a rating it updates the summary without
    // teleporting the card/queue/reveal/focus.
    if (!hasRatedSinceInit) {
      restartSession();
    } else {
      updateSummary();
    }
  }
  if (coordinator !== null) {
    unsubscribeCoordinator = coordinator.subscribe(onCoordinatorSnapshot);
  }

  const cleanup = () => {
    unsubscribeCoordinator();
    document.removeEventListener(SCRIPT_PREFERENCE_EVENT, onScriptPreferenceChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
