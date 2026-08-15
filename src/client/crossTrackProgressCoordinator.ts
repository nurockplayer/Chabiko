import type { BasicVocabularyProgressCoordinator } from './basicVocabularyProgressCoordinator';
import type { BasicVocabularyProgressStore } from '../domain/basicVocabularyProgress';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../domain/basicVocabularyProgress';
import {
  getBasicVocabularyProgressStorageKey,
  isValidSupabaseUserId,
} from '../domain/basicVocabularyProgressScope';
import { ProgressStore, STORAGE_KEY, type StorageLike } from '../lib/progress';
import {
  VOCABULARY_PROGRESS_KEY,
  VocabularyProgressStore,
} from '../domain/vocabularyProgress';
import {
  buildBasicVocabularyTrackSummary,
  buildCrossTrackProgressSnapshot,
  buildHskTrackSummary,
  buildTaiwanTravelTrackSummary,
  type BasicVocabularyTrackScope,
  type BasicVocabularyTrackSummary,
  type CrossTrackProgressSnapshot,
  type HskLevelCorpus,
  type HskTrackSummary,
  type TaiwanTravelTrackSummary,
} from '../domain/crossTrackProgress';

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * The read-only cross-track progress coordinator (Issue #372).
 *
 * Owns exactly one frozen snapshot with three track summaries. It reads the
 * authoritative stores through their existing read paths only, subscribes to
 * the merged basic-vocabulary coordinator for active-scope transitions, and
 * refreshes on `pageshow` plus relevant `storage` events. It never writes a
 * persistence key, never triggers a sync, never polls, and never exposes a
 * mutation API. Dispose removes every subscription and window listener, so a
 * repeated initialize/cleanup cycle cannot stack listeners or leave stale
 * updates behind.
 */
export interface CrossTrackProgressCoordinator {
  /** The current frozen cross-track snapshot (never mutated in place). */
  getSnapshot(): CrossTrackProgressSnapshot;
  /** Subscribe to snapshot transitions (immediate + deduped). */
  subscribe(
    listener: (snapshot: CrossTrackProgressSnapshot) => void,
  ): () => void;
  /** Remove every listener, subscription, and window listener. */
  dispose(): void;
}

export interface CrossTrackProgressDependencies {
  /** Storage backend for the HSK and lesson-completion stores. Pass null when
   *  unavailable (SSR, privacy mode); the stores fall back to empty in-memory
   *  and the snapshot still builds with truthful zero counts. */
  readonly storage: StorageLike | null;
  /** The merged account/progress coordinator (Issue #293). The cross-track
   *  boundary reads its active scoped store and subscribes to its scope
   *  transitions; it never writes through it. */
  readonly basicVocabulary: BasicVocabularyProgressCoordinator;
  /** Production learner corpus ids the basic-vocabulary writer can produce.
   *  Only these may count as learned/learning; a stale or manual id never
   *  inflates a count. */
  readonly basicVocabularyCorpusIds: ReadonlySet<string>;
  /** Declared HSK delivery levels with their production ids. An empty id list
   *  reports that level as unavailable. */
  readonly hskLevels: readonly HskLevelCorpus[];
  /** Lesson ids with a usable practice path (the Taiwan-track denominator). */
  readonly taiwanCompletableLessonIds: readonly string[];
}

/** Create a cross-track coordinator over explicitly injected dependencies. */
export function createCrossTrackProgressCoordinator(
  dependencies: CrossTrackProgressDependencies,
): CrossTrackProgressCoordinator {
  return new CrossTrackProgressCoordinatorImpl(dependencies);
}

// ─── Implementation ─────────────────────────────────────────────────────────────

class CrossTrackProgressCoordinatorImpl
  implements CrossTrackProgressCoordinator
{
  private readonly dependencies: CrossTrackProgressDependencies;
  private snapshot: CrossTrackProgressSnapshot;
  private readonly listeners = new Set<
    (snapshot: CrossTrackProgressSnapshot) => void
  >();
  private disposed = false;
  private readonly unsubscribeBasicVocabulary: () => void;
  private readonly removePageShow: () => void;
  private readonly removeStorage: () => void;

  constructor(dependencies: CrossTrackProgressDependencies) {
    this.dependencies = dependencies;
    this.snapshot = this.computeSnapshot();
    // Bridge the merged coordinator's published scope/state: any active-scope
    // transition recomputes the basic-vocabulary summary from the new scoped
    // store. The subscription delivers the current snapshot immediately; the
    // recompute dedupes against the initial snapshot.
    this.unsubscribeBasicVocabulary = dependencies.basicVocabulary.subscribe(() => {
      this.recompute();
    });

    const onPageShow = (): void => {
      this.recompute();
    };
    window.addEventListener('pageshow', onPageShow);
    this.removePageShow = () => window.removeEventListener('pageshow', onPageShow);

    const onStorage = (event: StorageEvent): void => {
      if (this.isRelevantStorageKey(event.key)) this.recompute();
    };
    window.addEventListener('storage', onStorage);
    this.removeStorage = () => window.removeEventListener('storage', onStorage);
  }

  getSnapshot(): CrossTrackProgressSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: CrossTrackProgressSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeBasicVocabulary();
    this.removePageShow();
    this.removeStorage();
    this.listeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private recompute(): void {
    if (this.disposed) return;
    const next = this.computeSnapshot();
    if (deepEqual(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  private computeSnapshot(): CrossTrackProgressSnapshot {
    const basicVocabulary = this.computeBasicVocabulary();
    const hsk = this.computeHsk();
    const taiwanTravel = this.computeTaiwanTravel();
    return buildCrossTrackProgressSnapshot({ basicVocabulary, hsk, taiwanTravel });
  }

  private computeBasicVocabulary(): BasicVocabularyTrackSummary {
    const scopeSnapshot = this.dependencies.basicVocabulary.getSnapshot();
    const store: BasicVocabularyProgressStore =
      this.dependencies.basicVocabulary.getStore();
    // Read-only refresh: re-reads the authoritative store's physical key so a
    // cross-tab write or pageshow is reflected deterministically. `refresh()`
    // performs no setItem/removeItem and no network, and preserves any
    // unpersisted in-memory progress (the same call the #293 coordinator's own
    // pageshow handler makes).
    store.refresh();
    const progress = store.getAllItems();
    // Fail closed on a non-canonical user id: only a validated Supabase UUID is
    // exposed as a user scope (never a fallback to guest or another identity).
    const scope: BasicVocabularyTrackScope =
      scopeSnapshot.scope === 'user' &&
      scopeSnapshot.userId !== null &&
      isValidSupabaseUserId(scopeSnapshot.userId)
        ? { kind: 'user', userId: scopeSnapshot.userId }
        : scopeSnapshot.scope === 'guest'
          ? { kind: 'guest' }
          : { kind: 'unavailable' };
    return buildBasicVocabularyTrackSummary({
      progress,
      corpusIds: this.dependencies.basicVocabularyCorpusIds,
      scope,
    });
  }

  private computeHsk(): HskTrackSummary {
    const store = new VocabularyProgressStore(this.dependencies.storage);
    return buildHskTrackSummary({
      progress: store.getAllEntries(),
      levels: this.dependencies.hskLevels,
    });
  }

  private computeTaiwanTravel(): TaiwanTravelTrackSummary {
    const store = new ProgressStore(this.dependencies.storage);
    return buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(store.getCompletedIds()),
      completableLessonIds: this.dependencies.taiwanCompletableLessonIds,
    });
  }

  private isRelevantStorageKey(key: string | null): boolean {
    if (key === null) return true; // storage-wide clear
    if (key === STORAGE_KEY) return true;
    if (key === VOCABULARY_PROGRESS_KEY) return true;
    if (key === BASIC_VOCABULARY_PROGRESS_KEY) return true;
    const scopeSnapshot = this.dependencies.basicVocabulary.getSnapshot();
    if (
      scopeSnapshot.scope === 'user' &&
      scopeSnapshot.userId !== null &&
      isValidSupabaseUserId(scopeSnapshot.userId)
    ) {
      return (
        key ===
        getBasicVocabularyProgressStorageKey({
          kind: 'user',
          userId: scopeSnapshot.userId,
        })
      );
    }
    return false;
  }
}

/** Structural equality for the plain-object/array/primitives snapshot shape. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}
