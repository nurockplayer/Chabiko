import { ProgressStore, STORAGE_KEY, type StorageLike } from '../lib/progress';
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
import {
  ROLEPLAY_PROGRESS_KEY,
  RoleplayProgressStore,
} from '../lib/roleplayProgress';
import { ROLEPLAY_LAUNCH_CARD_IDS } from '../content/loadRoleplayCards';
import readinessData from '../../data/travel-quest-readiness.json';

/**
 * Serialized per-path member references for the `/paths/` route. The route
 * emits this from the frozen #229 loader so the client never reads the data
 * file directly and always reflects the repository-controlled contract.
 */
export interface PathsProgressPayload {
  readonly paths: readonly { readonly id: string; readonly members: readonly LearningPathMemberRef[] }[];
  /** Exact IDs the production basic-vocabulary writer can produce (the learner
   *  manifest learnerIds), emitted by the route. Only these may be accepted
   *  from BasicVocabularyProgressStore, so a stale/manual `voc-*`, `hsk-*`, or
   *  unknown `teacher-*` entry can never inflate path progress (Sol decision,
   *  #233). */
  readonly basicVocabularyWriterIds: readonly string[];
}

const cleanups = new WeakMap<HTMLElement, () => void>();

/** Identity scope for the read-only projection (Sol decision for #233). */
type PathsIdentityScope =
  | { readonly kind: 'signed-in'; readonly userId: string }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'unknown' };

/**
 * Read-only browser controller for the learner-facing `/paths/` route (Issue
 * #233). Reads existing lesson, HSK, basic-vocabulary, and roleplay progress stores and
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
  // Authoritative production corpora for vocabulary progress. A learned entry
  // is only meaningful if its id belongs to the corpus of the store it was
  // read from: HSK storage may only satisfy HSK-path members, and basic
  // storage may only satisfy the exact IDs the production basic-vocabulary
  // writer can produce (the learner-manifest learnerIds emitted by the route).
  // This prevents a stale cross-source or manually-injected entry (e.g.
  // `voc-001: learned` in HSK storage, `hsk-001: learned` in basic storage, or
  // an unknown `teacher-*` id) from advancing the wrong path.
  const hskCorpusIds = new Set<string>();
  for (const path of payload.paths) {
    for (const member of path.members) {
      if (member.type !== 'vocabulary') continue;
      if (path.id === 'hsk-vocabulary') hskCorpusIds.add(member.id);
    }
  }
  const basicWriterCorpusIds = new Set(payload.basicVocabularyWriterIds);
  let identityScope: PathsIdentityScope = { kind: 'unknown' };
  // Disposal guard: once cleanup runs (or a fresh init tears this instance
  // down), no late async auth reply may mutate identityScope or re-render into
  // the (possibly re-initialized) root.
  let disposed = false;

  /** Safe localStorage accessor: a SecurityError from the getter (privacy/
   * sandbox policy) falls back to null, mirroring the progress store's
   * unavailable-storage handling. */
  function safeLocalStorage(): StorageLike | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  function readSignals(): ProgressSignals {
    // Pass the safe storage accessor explicitly so no store constructor runs
    // its getDefaultStorage() localStorage probe on this read-only path.
    const lessonStore = new ProgressStore(safeLocalStorage());
    const completedLessons = new Set(lessonStore.getCompletedIds());
    const learnedVocabulary = new Set<string>();
    const learnedBasicVocabulary = new Set<string>();
    const completedRoleplayCards = new Set(
      new RoleplayProgressStore(
        safeLocalStorage(),
        new Set(ROLEPLAY_LAUNCH_CARD_IDS),
      ).getCompletedCardIds(),
    );

    // HSK storage is only authoritative for ids in the HSK production corpus.
    // A stale cross-source `learned` entry (e.g. `voc-001` or
    // `teacher-star-1-...`) in HSK storage must never satisfy a taiwan-travel
    // vocabulary member or a readiness evidence key.
    const hskStore = new VocabularyProgressStore(safeLocalStorage());
    for (const [id, entry] of Object.entries(hskStore.getAllEntries())) {
      // `learned` requires a finite, non-negative integer knownStreak >= 2; a
      // corrupt record claiming `status: learned` with a zero or non-integer
      // streak must not count.
      if (
        entry.status === 'learned' &&
        Number.isInteger(entry.knownStreak) &&
        entry.knownStreak >= 2 &&
        hskCorpusIds.has(id)
      ) {
        learnedVocabulary.add(id);
      }
    }

    // Basic-vocabulary storage (guest or the signed-in user's scoped key) is
    // only authoritative for the exact writer-producible learnerIds. A stale
    // `voc-*`, `hsk-*`, or unknown `teacher-*` learned entry in basic storage
    // must never advance a path or readiness target. An unknown (still-loading)
    // identity keeps basic-vocabulary evidence unavailable so a signed-in
    // learner's progress is never briefly miscounted as guest progress.
    // Read-only: only `getAllItems()` is used.
    const collectBasic = (store: BasicVocabularyProgressStore): void => {
      for (const [id, entry] of Object.entries(store.getAllItems())) {
        if (entry.status === 'learned' && basicWriterCorpusIds.has(id)) {
          learnedVocabulary.add(id);
          learnedBasicVocabulary.add(id);
        }
      }
    };
    if (identityScope.kind === 'signed-in') {
      collectBasic(
        new BasicVocabularyProgressStore(
          safeLocalStorage(),
          getBasicVocabularyProgressStorageKey({
            kind: 'user',
            userId: identityScope.userId,
          }),
        ),
      );
    } else if (identityScope.kind === 'signed-out') {
      collectBasic(new BasicVocabularyProgressStore(safeLocalStorage()));
    }
    return {
      completedLessons,
      learnedVocabulary,
      learnedBasicVocabulary,
      completedRoleplayCards,
    };
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

  function applySignedOut(): void {
    if (disposed) return;
    const changed = identityScope.kind !== 'signed-out';
    identityScope = { kind: 'signed-out' };
    if (changed) renderAll();
  }

  function applyUnknown(): void {
    if (disposed) return;
    const changed = identityScope.kind !== 'unknown';
    identityScope = { kind: 'unknown' };
    if (changed) renderAll();
  }

  function applyTrustedUserId(userId: string): void {
    if (disposed) return;
    // A non-canonical user ID is a safe Auth error: never expose or use it. An
    // identity event carrying it is untrustworthy from any current scope — fail
    // closed to unknown so no scope's progress is surfaced.
    if (!isValidSupabaseUserId(userId)) {
      if (identityScope.kind !== 'unknown') applyUnknown();
      return;
    }
    const next: PathsIdentityScope = { kind: 'signed-in', userId };
    const changed =
      next.kind !== identityScope.kind ||
      (next.kind === 'signed-in' &&
        identityScope.kind === 'signed-in' &&
        next.userId !== identityScope.userId);
    identityScope = next;
    if (changed) renderAll();
  }

  function handleAuthEvent(event: string, session: unknown): void {
    if (disposed) return;
    if (event === 'SIGNED_OUT') {
      applySignedOut();
      return;
    }
    const ses = (session ?? null) as
      | { user?: { id?: string } }
      | null;
    const userId = ses?.user?.id;
    if (typeof userId === 'string' && userId.length > 0) {
      applyTrustedUserId(userId);
    } else if (event === 'INITIAL_SESSION' && session === null) {
      // A normal initial session event with no session is a signed-out signal,
      // not an untrustworthy identity event: resolving to guest shows the guest
      // basic-vocabulary progress. The identityVersion guard drops any older
      // getSession reply that would otherwise overwrite this newer event.
      applySignedOut();
    } else if (
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'INITIAL_SESSION'
    ) {
      // An identity event without a usable user id is not trustworthy: fail
      // closed to unknown from any current scope so no stale or guest scope's
      // progress is surfaced.
      if (identityScope.kind !== 'unknown') applyUnknown();
    }
  }

  renderAll();

  const client = getSupabaseBrowserClient();
  let authUnsubscribe: (() => void) | null = null;

  // Generation token for the initial getSession reply. Each auth state event
  // increments it, so a stale initial getSession reply (which started before a
  // SIGNED_IN/SIGNED_OUT/switch arrived) is ignored: the event already applied
  // the newer scope.
  let identityVersion = 0;

  // Re-resolve the trusted identity from the auth session (read-only). Used for
  // the initial load and again on `pageshow`, because a BFCache-restored
  // document may have missed auth changes that happened while it was frozen —
  // re-confirming the session prevents a previous user's scoped progress from
  // being surfaced after logout/switch elsewhere. `resolveGeneration` is
  // bumped per resolution so only the most recently started request applies its
  // result; `identityVersion` still drops any reply superseded by a newer auth
  // event, and the disposal guard drops replies after cleanup.
  let resolveGeneration = 0;
  function resolveIdentity(): void {
    const client = getSupabaseBrowserClient();
    if (client == null) return;
    resolveGeneration += 1;
    const generationAtStart = resolveGeneration;
    const versionAtStart = identityVersion;
    void client.auth
      .getSession()
      .then((result) => {
        if (
          disposed ||
          resolveGeneration !== generationAtStart ||
          identityVersion !== versionAtStart
        ) {
          return;
        }
        // An errored session read (corrupt/unreadable persisted session) is not
        // a signed-out signal: keep the identity unknown so basic-vocabulary
        // evidence stays unavailable instead of showing another scope's guest
        // progress.
        if (result.error) return;
        const session = result.data.session;
        // Only an explicit null session is a signed-out signal. A non-null
        // session without a usable canonical user id is not trustworthy: keep
        // the identity unknown so basic-vocabulary evidence stays unavailable
        // rather than showing another scope's guest progress.
        if (session === null) {
          applySignedOut();
          return;
        }
        const userId = session.user?.id;
        if (typeof userId === 'string' && userId.length > 0) {
          applyTrustedUserId(userId);
        }
      })
      .catch(() => {
        // A failed session read is not an auth error we can surface safely;
        // keep identity unknown so basic-vocabulary evidence stays unavailable.
      });
  }

  if (client != null) {
    // Resolve the initial trusted identity (read-only).
    resolveIdentity();

    const subscription = client.auth.onAuthStateChange((event, session) => {
      identityVersion += 1;
      handleAuthEvent(event, session);
    });
    authUnsubscribe = () => {
      subscription.data.subscription.unsubscribe();
    };
  } else {
    // No Supabase configuration (guest-only production mode): there is no
    // identity to resolve, so read the guest store directly instead of staying
    // in the unknown state (which would make basic-vocabulary evidence
    // unavailable).
    identityScope = { kind: 'signed-out' };
    renderAll();
  }

  function onPageShow(event: Event): void {
    // A BFCache-restored document may have missed auth changes while frozen, so
    // its cached scope could be a previous user. Fail closed to unknown before
    // the async re-resolution so a stale user's progress is never flashed, then
    // re-confirm the identity and render. In guest-only mode (no Supabase
    // client) there is no identity to re-resolve and the scope is already the
    // signed-out guest scope, so it must not be cleared.
    if (
      (event as PageTransitionEvent).persisted &&
      getSupabaseBrowserClient() != null
    ) {
      applyUnknown();
    }
    resolveIdentity();
    renderAll();
  }

  function onStorage(event: StorageEvent): void {
    const basicKey = currentBasicKey();
    if (
      event.key === null ||
      event.key === STORAGE_KEY ||
      event.key === ROLEPLAY_PROGRESS_KEY ||
      (basicKey !== null && event.key === basicKey) ||
      event.key === VOCABULARY_PROGRESS_KEY
    ) {
      renderAll();
    }
  }

  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);

  const cleanup = (): void => {
    disposed = true;
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
