import { ProgressStore, STORAGE_KEY } from '../lib/progress';
import { BasicVocabularyProgressStore } from '../domain/basicVocabularyProgress';
import { VocabularyProgressStore } from '../domain/vocabularyProgress';
import { getSupabaseBrowserClient } from '../lib/supabaseBrowserClient';
import {
  getBasicVocabularyProgressStorageKey,
  isValidSupabaseUserId,
} from '../domain/basicVocabularyProgressScope';
import type { LearningPathMemberRef } from '../types/learningPath';
import type {
  TravelQuestReadinessDocument,
  TravelQuestTargetReadiness,
} from '../types/travelQuestReadiness';
import {
  buildReadinessInput,
  pathProgressStateLabel,
  readinessStatusLabel,
  summarizePathProgress,
  type ProgressSignals,
} from '../domain/pathsProgress';
import { evaluateTravelQuestReadiness } from '../domain/travelQuestReadiness';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../domain/basicVocabularyProgress';
import { VOCABULARY_PROGRESS_KEY } from '../domain/vocabularyProgress';
import readinessData from '../../data/travel-quest-readiness.json';

/**
 * Serialized per-path member references for the `/paths/` route. The route
 * emits this from the frozen #229 loader so the client never reads the data
 * file directly and always reflects the repository-controlled contract.
 */
export interface PathsProgressPayload {
  readonly paths: readonly { readonly id: string; readonly members: readonly LearningPathMemberRef[] }[];
}

const cleanups = new WeakMap<HTMLElement, () => void>();

/** Identity scope for the read-only projection (Sol decision for #233). */
type PathsIdentityScope =
  | { readonly kind: 'signed-in'; readonly userId: string }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'unknown' };

/**
 * Read-only browser controller for the learner-facing `/paths/` route (Issue
 * #233). Reads existing lesson, HSK, and basic-vocabulary progress stores and
 * re-renders every card's path summary plus the four Travel Quest readiness
 * targets.
 *
 * This is a route-local read-only projection (Sol decision, #233): it never
 * creates or switches the #293 progress coordinator, never calls
 * `acceptSignedIn`/`syncNow`, and therefore can never trigger progress, sync
 * metadata, or cloud writes merely from viewing `/paths/`. It resolves the
 * trusted Supabase identity itself, subscribes to Supabase auth state changes,
 * and reads the scoped local cache for that identity:
 *
 * - signed-in → user-scoped key
 * - signed-out → guest key
 * - unknown (loading) → basic-vocabulary evidence stays unavailable (never
 *   briefly counted as guest progress)
 *
 * - Reads existing progress only; never writes, migrates, resets, or adds a
 *   new storage key.
 * - Missing, unavailable, duplicate, stale, or malformed evidence never
 *   inflates readiness or shrinks the fixed denominator.
 * - Refreshes on `pageshow`, relevant `storage` events, and Supabase auth
 *   state changes (login/logout/switch re-selects the scoped store); cleanup
 *   removes every subscription and a fresh init tears down the prior instance.
 * - Passive viewing never counts: only completed lesson practices and
 *   `learned` vocabulary items produce progress signals.
 */
export function initPathsReadiness(
  root: HTMLElement,
  payload: PathsProgressPayload,
): () => void {
  cleanups.get(root)?.();

  const targets = (readinessData as TravelQuestReadinessDocument).targets;
  let identityScope: PathsIdentityScope = { kind: 'unknown' };

  function readSignals(): ProgressSignals {
    const lessonStore = new ProgressStore();
    const completedLessons = new Set(lessonStore.getCompletedIds());
    const hskStore = new VocabularyProgressStore();
    const learnedVocabulary = new Set<string>();
    for (const [id, entry] of Object.entries(hskStore.getAllEntries())) {
      if (entry.status === 'learned') learnedVocabulary.add(id);
    }
    // Read the basic-vocabulary store scoped to the trusted identity. An
    // unknown (still-loading) identity keeps basic-vocabulary evidence
    // unavailable so a signed-in learner's progress is never briefly miscounted
    // as guest progress. Read-only: only `getAllItems()` is used.
    if (identityScope.kind === 'signed-in') {
      const userStore = new BasicVocabularyProgressStore(
        localStorage,
        getBasicVocabularyProgressStorageKey({
          kind: 'user',
          userId: identityScope.userId,
        }),
      );
      for (const [id, entry] of Object.entries(userStore.getAllItems())) {
        if (entry.status === 'learned') learnedVocabulary.add(id);
      }
    } else if (identityScope.kind === 'signed-out') {
      const guestStore = new BasicVocabularyProgressStore();
      for (const [id, entry] of Object.entries(guestStore.getAllItems())) {
        if (entry.status === 'learned') learnedVocabulary.add(id);
      }
    }
    return { completedLessons, learnedVocabulary };
  }

  function renderAll(): void {
    const signals = readSignals();
    const results = evaluateTravelQuestReadiness(
      buildReadinessInput(targets, signals),
    );
    for (const path of payload.paths) {
      const card = root.querySelector<HTMLElement>(
        `[data-path-id="${path.id}"]`,
      );
      const progress = card?.querySelector<HTMLElement>('[data-path-progress]');
      if (!progress) continue;
      const summary = summarizePathProgress(path.members, signals);
      progress.textContent =
        summary.totalCount > 0
          ? `${summary.completedCount} / ${summary.totalCount} ${pathProgressStateLabel(summary.state)}`
          : '';
    }
    renderReadiness(results);
  }

  function renderReadiness(
    results: readonly TravelQuestTargetReadiness[],
  ): void {
    const section = root.querySelector<HTMLElement>('[data-readiness-section]');
    if (!section) return;
    for (const result of results) {
      const item = section.querySelector<HTMLElement>(
        `[data-readiness-target="${result.targetId}"]`,
      );
      if (!item) continue;
      const count = item.querySelector<HTMLElement>('[data-readiness-count]');
      if (count) count.textContent = `${result.numerator} / ${result.denominator}`;
      const percent = item.querySelector<HTMLElement>(
        '[data-readiness-percent]',
      );
      if (percent) percent.textContent = `${result.percentage}%`;
      const status = item.querySelector<HTMLElement>('[data-readiness-status]');
      if (status) {
        status.textContent = readinessStatusLabel(result.status);
        status.dataset.status = result.status;
      }
      const note = item.querySelector<HTMLElement>('[data-readiness-note]');
      if (note) note.hidden = result.unavailableEvidence.length === 0;
    }
  }

  // The currently relevant basic-vocabulary storage key for the trusted
  // identity, used by the storage listener. Unknown → null (no basic-vocab key
  // is relevant until the identity resolves).
  function currentBasicKey(): string | null {
    if (identityScope.kind === 'signed-in') {
      return getBasicVocabularyProgressStorageKey({
        kind: 'user',
        userId: identityScope.userId,
      });
    }
    if (identityScope.kind === 'signed-out') return BASIC_VOCABULARY_PROGRESS_KEY;
    return null;
  }

  function applySessionUserId(userId: string | null): void {
    const next: PathsIdentityScope =
      userId !== null && isValidSupabaseUserId(userId)
        ? { kind: 'signed-in', userId }
        : { kind: 'signed-out' };
    const changed =
      next.kind !== identityScope.kind ||
      (next.kind === 'signed-in' &&
        identityScope.kind === 'signed-in' &&
        next.userId !== identityScope.userId);
    identityScope = next;
    if (changed) renderAll();
  }

  function handleAuthEvent(event: string, session: unknown): void {
    if (event === 'SIGNED_OUT') {
      applySessionUserId(null);
      return;
    }
    const ses = (session ?? null) as
      | { user?: { id?: string } }
      | null;
    const userId = ses?.user?.id ?? null;
    applySessionUserId(typeof userId === 'string' ? userId : null);
  }

  renderAll();

  const client = getSupabaseBrowserClient();
  let authUnsubscribe: (() => void) | null = null;

  if (client != null) {
    // Resolve the initial trusted identity (read-only).
    void client.auth
      .getSession()
      .then((result) => {
        const session = result.data.session;
        applySessionUserId(session?.user?.id ?? null);
      })
      .catch(() => {
        // A failed session read is not an auth error we can surface safely;
        // keep identity unknown so basic-vocabulary evidence stays unavailable.
      });

    const subscription = client.auth.onAuthStateChange((event, session) => {
      handleAuthEvent(event, session);
    });
    authUnsubscribe = () => {
      subscription.data.subscription.unsubscribe();
    };
  }

  function onPageShow(): void {
    renderAll();
  }

  function onStorage(event: StorageEvent): void {
    const basicKey = currentBasicKey();
    if (
      event.key === null ||
      event.key === STORAGE_KEY ||
      (basicKey !== null && event.key === basicKey) ||
      event.key === VOCABULARY_PROGRESS_KEY
    ) {
      renderAll();
    }
  }

  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);

  const cleanup = (): void => {
    if (authUnsubscribe !== null) {
      authUnsubscribe();
      authUnsubscribe = null;
    }
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
