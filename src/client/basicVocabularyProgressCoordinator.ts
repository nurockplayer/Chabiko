import {
  subscribeBasicVocabularyAuthState,
  type BasicVocabularyAuthState,
} from './basicVocabularyAccount';
import {
  createGuestBasicVocabularySyncRuntime,
  createUserBasicVocabularySyncRuntime,
  type BasicVocabularySyncRuntime,
  type BasicVocabularySyncRuntimeDependencies,
  type BasicVocabularySyncRuntimeSnapshot,
} from './basicVocabularySyncRuntime';
import type { BasicVocabularyProgressStore } from '../domain/basicVocabularyProgress';
import type { VocabularySessionRating } from '../domain/vocabularySession';
import type { BasicVocabularySupabaseRepository } from '../data/basicVocabularySupabaseRepository';
import { createBasicVocabularySupabaseRepository } from '../data/basicVocabularySupabaseRepository';
import { getSupabaseBrowserClient } from '../lib/supabaseBrowserClient';
import type { StorageLike } from '../lib/progress';

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * The document-level progress coordinator (Issue #293).
 *
 * Owns exactly one sync runtime per document/module instance. It starts guest
 * synchronously, switches to a canonical user runtime on a trustworthy
 * signed-in state, disposes the prior user scope on logout/user change, and
 * never deletes guest or user caches automatically. Signed-in
 * unconfigured/network-failed states remain user-scoped local mode rather than
 * falling back to guest.
 *
 * The runtime store is exposed to the study client (writable via
 * `applyRating`/`resetAll`) and to the catalog client (read-only). One
 * `online`, one `pageshow`, and one relevant `storage` listener set is owned
 * here; there is no polling, timer, realtime, service worker, or unload
 * beacon. Dispose removes subscriptions and ignores late completions.
 */
export interface BasicVocabularyProgressCoordinator {
  /** The exact current scope snapshot of the active runtime. */
  getSnapshot(): BasicVocabularySyncRuntimeSnapshot;
  /** The active scoped progress store (user or guest). */
  getStore(): BasicVocabularyProgressStore;
  /** Subscribe to every runtime snapshot transition (immediate + deduped). */
  subscribe(
    listener: (snapshot: BasicVocabularySyncRuntimeSnapshot) => void,
  ): () => void;
  /** Apply an accepted rating through the active runtime exactly once. */
  applyRating(itemId: string, rating: VocabularySessionRating): void;
  /** Reset the active scoped progress through the runtime exactly once. */
  resetAll(): void;
  /** Accept a trusted signed-in state, switching scope without writes. */
  acceptSignedIn(userId: string): void;
  /** Return to guest scope, preserving the identity being left. */
  acceptSignedOut(): void;
  /** Remove every listener and dispose the active runtime. */
  dispose(): void;
}

// ─── Dependencies ───────────────────────────────────────────────────────────────

export interface BasicVocabularyCoordinatorDependencies {
  readonly storage: StorageLike | null;
  readonly repository: BasicVocabularySupabaseRepository | null;
  readonly isOnline: () => boolean;
  readonly createResetId: () => string;
}

/** Default storage: the browser's localStorage when available, else null. */
export function getDefaultBasicVocabularyStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const prev = localStorage.getItem('__chabiko_basic_vocab_probe__');
      localStorage.setItem('__chabiko_basic_vocab_probe__', '1');
      localStorage.removeItem('__chabiko_basic_vocab_probe__');
      if (prev !== null) localStorage.setItem('__chabiko_basic_vocab_probe__', prev);
      return localStorage;
    }
  } catch {
    /* localStorage unavailable (SSR, private browsing, etc.) */
  }
  return null;
}

/**
 * The default repository built from the configured browser client. Returns
 * null when the client is unconfigured, keeping the signed-in runtime in
 * user-scoped local mode rather than falling back to guest.
 */
export function getDefaultBasicVocabularyRepository(): BasicVocabularySupabaseRepository | null {
  const client = getSupabaseBrowserClient();
  if (client === null) return null;
  return createBasicVocabularySupabaseRepository(client);
}

/** Default online signal. */
function defaultIsOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Default reset-ID source: a canonical v1 UUID. Falls back to a random v4
 * UUID where `crypto.randomUUID` is unavailable (never a fixed value, so two
 * distinct resets never collide on the server's idempotent reset RPC). */
function defaultCreateResetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Document-scoped singleton ─────────────────────────────────────────────────

const activeCoordinator: {
  coordinator: BasicVocabularyProgressCoordinator | null;
} = { coordinator: null };

/** Test/teardown boundary: install an explicit coordinator (or detach it). */
let explicitCoordinator: BasicVocabularyProgressCoordinator | null = null;
export function setBasicVocabularyProgressCoordinator(
  coordinator: BasicVocabularyProgressCoordinator | null,
): void {
  explicitCoordinator = coordinator;
  activeCoordinator.coordinator = coordinator;
}

/** Test/teardown boundary: detach the active coordinator without disposing it. */
export function resetBasicVocabularyProgressCoordinator(): void {
  explicitCoordinator = null;
  activeCoordinator.coordinator = null;
}

/**
 * Create a coordinator over explicitly injected dependencies. Tests use this
 * to drive a coordinator without touching the real Supabase client, then
 * install it with {@link setBasicVocabularyProgressCoordinator}.
 */
export function createBasicVocabularyProgressCoordinator(
  dependencies: BasicVocabularyCoordinatorDependencies,
): BasicVocabularyProgressCoordinator {
  return new BasicVocabularyProgressCoordinatorImpl(dependencies);
}

/**
 * Resolve the single document-level coordinator (Issue #293), creating it with
 * the default dependencies when none exists. Returns an explicitly installed
 * coordinator (test boundary) unchanged.
 */
export function ensureBasicVocabularyProgressCoordinator(): BasicVocabularyProgressCoordinator {
  if (explicitCoordinator !== null) return explicitCoordinator;
  if (activeCoordinator.coordinator !== null) return activeCoordinator.coordinator;
  activeCoordinator.coordinator = new BasicVocabularyProgressCoordinatorImpl(
    defaultDependencies(),
  );
  return activeCoordinator.coordinator;
}

/**
 * The already-created coordinator, or null. Never creates one, so the study and
 * catalog clients can consume the coordinator store when present and otherwise
 * fall back to a direct guest store (preserving the pre-#293 behavior).
 */
export function getBasicVocabularyProgressCoordinator(): BasicVocabularyProgressCoordinator | null {
  return activeCoordinator.coordinator ?? explicitCoordinator;
}

/** Injectable dependencies for the default document-level coordinator. */
export function defaultDependencies(): BasicVocabularyCoordinatorDependencies {
  return {
    storage: getDefaultBasicVocabularyStorage(),
    repository: getDefaultBasicVocabularyRepository(),
    isOnline: defaultIsOnline,
    createResetId: defaultCreateResetId,
  };
}

// ─── Implementation ─────────────────────────────────────────────────────────────

class BasicVocabularyProgressCoordinatorImpl
  implements BasicVocabularyProgressCoordinator
{
  private readonly storage: StorageLike | null;
  private readonly repository: BasicVocabularySupabaseRepository | null;
  private readonly isOnline: () => boolean;
  private readonly createResetId: () => string;
  private runtime: BasicVocabularySyncRuntime;
  private readonly runtimeListeners = new Set<
    (snapshot: BasicVocabularySyncRuntimeSnapshot) => void
  >();
  private disposed = false;
  private unsubscribeAuth: () => void = () => undefined;
  private unsubscribeRuntime: () => void = () => undefined;
  private readonly removeOnline: () => void;
  private readonly removePageShow: () => void;
  private readonly removeStorage: () => void;

  constructor(dependencies: BasicVocabularyCoordinatorDependencies) {
    this.storage = dependencies.storage;
    this.repository = dependencies.repository;
    this.isOnline = dependencies.isOnline;
    this.createResetId = dependencies.createResetId;
    this.runtime = createGuestBasicVocabularySyncRuntime(this.runtimeDependencies());
    this.attachRuntimeBridge();

    // Bridge the account's already-published immutable auth state: subscribe
    // before registering any document listener so a state accepted before this
    // subscription can never be missed.
    this.unsubscribeAuth = subscribeBasicVocabularyAuthState((state) => {
      this.handleAuthState(state);
    });

    const onOnline = (): void => {
      void this.syncNow();
    };
    window.addEventListener('online', onOnline);
    this.removeOnline = () => window.removeEventListener('online', onOnline);

    const onPageShow = (): void => {
      // Refresh local storage state, then pull cloud changes for the current
      // user scope (no-op for guest). syncNow is non-blocking and deduplicated
      // through the runtime's in-flight guard.
      this.runtime.refreshLocal();
      void this.syncNow();
    };
    window.addEventListener('pageshow', onPageShow);
    this.removePageShow = () => window.removeEventListener('pageshow', onPageShow);

    const onStorage = (e: StorageEvent): void => {
      this.runtime.handleStorageChange(e.key, e.storageArea);
    };
    window.addEventListener('storage', onStorage);
    this.removeStorage = () => window.removeEventListener('storage', onStorage);
  }

  getSnapshot(): BasicVocabularySyncRuntimeSnapshot {
    return this.runtime.getSnapshot();
  }

  getStore(): BasicVocabularyProgressStore {
    return this.runtime.getStore();
  }

  applyRating(itemId: string, rating: VocabularySessionRating): void {
    if (this.disposed) return;
    // Applies locally through the scoped store exactly once, then requests a
    // non-blocking sync; never awaited.
    this.runtime.applyRating(itemId, rating);
    void this.runtime.syncNow();
  }

  resetAll(): void {
    if (this.disposed) return;
    this.runtime.resetAll();
    void this.runtime.syncNow();
  }

  subscribe(
    listener: (snapshot: BasicVocabularySyncRuntimeSnapshot) => void,
  ): () => void {
    this.runtimeListeners.add(listener);
    listener(this.runtime.getSnapshot());
    return () => {
      this.runtimeListeners.delete(listener);
    };
  }

  acceptSignedIn(userId: string): void {
    this.switchScope('user', userId);
  }

  acceptSignedOut(): void {
    this.switchScope('guest', null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeAuth();
    this.unsubscribeRuntime();
    this.removeOnline();
    this.removePageShow();
    this.removeStorage();
    this.runtimeListeners.clear();
    // Late auth transitions and completions are ignored after disposal.
    this.runtime.dispose();
    if (activeCoordinator.coordinator === this) activeCoordinator.coordinator = null;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private runtimeDependencies(): BasicVocabularySyncRuntimeDependencies {
    return {
      storage: this.storage,
      repository: this.repository,
      isOnline: this.isOnline,
      createResetId: this.createResetId,
    };
  }

  /** Re-bridge the active runtime's snapshot notifications to our listeners. */
  private attachRuntimeBridge(): void {
    this.unsubscribeRuntime();
    this.unsubscribeRuntime = this.runtime.subscribe((snapshot) => {
      this.notifyRuntimeListeners(snapshot);
    });
  }

  private notifyRuntimeListeners(snapshot: BasicVocabularySyncRuntimeSnapshot): void {
    for (const listener of [...this.runtimeListeners]) listener(snapshot);
  }

  private handleAuthState(state: BasicVocabularyAuthState): void {
    if (this.disposed) return;
    if (state.kind === 'signed-in') {
      this.switchScope('user', state.userId);
    } else if (state.kind === 'signed-out') {
      this.switchScope('guest', null);
    } else {
      // `loading` and `unavailable` carry no identity: the current scope is
      // preserved exactly.
      return;
    }
  }

  /**
   * Switch the active runtime to the canonical scope for the given identity.
   * No writes, resets, or cache deletion happen here: the identity being left
   * is preserved untouched. On a real identity change, a fresh user runtime
   * replaces the prior one (which is disposed without touching its storage),
   * and one non-blocking sync is requested for the newly signed-in user.
   */
  private switchScope(kind: 'guest' | 'user', userId: string | null): void {
    if (this.disposed) return;
    const current = this.runtime.getSnapshot();
    if (current.scope === kind && current.userId === userId) {
      // Same scope/identity: nothing to change.
      return;
    }
    const previousRuntime = this.runtime;
    if (kind === 'user' && userId !== null) {
      this.runtime = createUserBasicVocabularySyncRuntime(userId, this.runtimeDependencies());
    } else {
      this.runtime = createGuestBasicVocabularySyncRuntime(this.runtimeDependencies());
    }
    previousRuntime.dispose();
    // attachRuntimeBridge subscribes to the fresh runtime and delivers its
    // current snapshot to every coordinator listener immediately.
    this.attachRuntimeBridge();
    if (kind === 'user') {
      // Initial signed-in state triggers one non-blocking sync; accepted
      // rating/reset already applies locally and requests sync without
      // awaiting it (handled by the study client through the runtime).
      void this.runtime.syncNow();
    }
  }

  private async syncNow(): Promise<void> {
    if (this.disposed) return;
    await this.runtime.syncNow();
  }
}
