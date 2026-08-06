import type { StorageLike } from '../lib/progress';
import type { VocabularySessionRating } from '../domain/vocabularySession';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
  type BasicVocabularyProgressDocument,
} from '../domain/basicVocabularyProgress';
import {
  BASIC_VOCABULARY_GUEST_SCOPE,
  getBasicVocabularyProgressStorageKey,
  isValidSupabaseUserId,
  type BasicVocabularyProgressScope,
} from '../domain/basicVocabularyProgressScope';
import {
  BasicVocabularyRepositoryError,
  type BasicVocabularyRepositoryErrorKind,
  type BasicVocabularySupabaseRepository,
} from '../data/basicVocabularySupabaseRepository';
import {
  acknowledgeBasicVocabularyMutations,
  acknowledgeBasicVocabularyRemoteReset,
  beginBasicVocabularyLocalReset,
  createBasicVocabularySyncMeta,
  importBasicVocabularyGuestProgress,
  mergeBasicVocabularyCloudSnapshot,
  parseBasicVocabularySyncMeta,
  recordBasicVocabularyDirtyItem,
  type BasicVocabularyCloudItem,
  type BasicVocabularyDirtyItem,
  type BasicVocabularySyncMetaDocument,
} from '../domain/basicVocabularySync';
import type { VocabularyProgressEntry } from '../domain/vocabularyProgress';

// ─── Public API ─────────────────────────────────────────────────────────────────

export type BasicVocabularySyncStatus =
  | 'guest'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface BasicVocabularySyncRuntimeSnapshot {
  readonly scope: 'guest' | 'user';
  readonly userId: string | null;
  readonly status: BasicVocabularySyncStatus;
}

export interface BasicVocabularySyncRuntime {
  getSnapshot(): BasicVocabularySyncRuntimeSnapshot;
  getStore(): BasicVocabularyProgressStore;
  subscribe(listener: (snapshot: BasicVocabularySyncRuntimeSnapshot) => void): () => void;
  applyRating(itemId: string, rating: VocabularySessionRating): void;
  resetAll(): void;
  refreshLocal(): void;
  syncNow(): Promise<void>;
  handleStorageChange(key: string | null, storageArea: StorageLike | null): void;
  dispose(): void;
}

export interface BasicVocabularySyncRuntimeDependencies {
  readonly storage: StorageLike | null;
  readonly repository: BasicVocabularySupabaseRepository | null;
  readonly isOnline: () => boolean;
  readonly createResetId: () => string;
}

// ─── Sync metadata key (Issue #292) ────────────────────────────────────────────

const SYNC_META_KEY_PREFIX = 'chabiko:basic-vocabulary-sync-meta:user:';
const SYNC_META_KEY_SUFFIX = ':v1';

/** For user UUID `u`, the exact physical sync-metadata key. */
function getSyncMetaKey(userId: string): string {
  if (!isValidSupabaseUserId(userId)) {
    throw new Error(
      `Invalid Supabase user ID for basic-vocabulary sync meta: "${userId}"`,
    );
  }
  return `${SYNC_META_KEY_PREFIX}${userId}${SYNC_META_KEY_SUFFIX}`;
}

/**
 * Load the user's sync metadata synchronously for immediate use.
 *
 * Malformed/wrong-user metadata falls back to fresh metadata without deleting
 * the malformed raw key; it is rewritten only by a later successful write.
 * Unavailable storage also falls back to fresh in-memory metadata.
 */
function loadSyncMeta(
  storage: StorageLike | null,
  metaKey: string,
  userId: string,
): BasicVocabularySyncMetaDocument {
  if (storage === null) return createBasicVocabularySyncMeta(userId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(metaKey);
  } catch {
    raw = null;
  }
  if (raw === null) return createBasicVocabularySyncMeta(userId);
  const parsed = parseBasicVocabularySyncMeta(raw, userId);
  if (parsed === null) return createBasicVocabularySyncMeta(userId);
  return parsed;
}

// ─── Runtime implementation ────────────────────────────────────────────────────

interface BasicVocabularySyncRuntimeConfig {
  readonly scope: 'guest' | 'user';
  readonly userId: string | null;
  readonly store: BasicVocabularyProgressStore;
  readonly guestStore: BasicVocabularyProgressStore | null;
  readonly metaKey: string | null;
  readonly meta: BasicVocabularySyncMetaDocument | null;
  readonly dependencies: BasicVocabularySyncRuntimeDependencies;
}

/**
 * One injectable runtime owning the scoped progress store, user sync
 * metadata, one-time guest import, dirty capture, offline reset, explicit
 * synchronization, controlled status, and safe disposal (Issue #292).
 *
 * Independent of Astro DOM and Auth UI: storage, repository, online signal,
 * and reset-ID creation are all injected. No singleton, browser-event,
 * Auth/session client, browser-global access, timer, polling, live
 * subscription, or hidden state lives here.
 */
class BasicVocabularySyncRuntimeImpl implements BasicVocabularySyncRuntime {
  private readonly scope: 'guest' | 'user';
  private readonly userId: string | null;
  private readonly store: BasicVocabularyProgressStore;
  private readonly guestStore: BasicVocabularyProgressStore | null;
  private readonly storage: StorageLike | null;
  private readonly repository: BasicVocabularySupabaseRepository | null;
  private readonly isOnline: () => boolean;
  private readonly createResetId: () => string;
  private readonly metaKey: string | null;
  private meta: BasicVocabularySyncMetaDocument | null;
  private status: BasicVocabularySyncStatus;
  private readonly listeners = new Set<
    (snapshot: BasicVocabularySyncRuntimeSnapshot) => void
  >();
  private inFlightSync: Promise<void> | null = null;
  private disposed = false;

  constructor(config: BasicVocabularySyncRuntimeConfig) {
    this.scope = config.scope;
    this.userId = config.userId;
    this.store = config.store;
    this.guestStore = config.guestStore;
    this.storage = config.dependencies.storage;
    this.repository = config.dependencies.repository;
    this.isOnline = config.dependencies.isOnline;
    this.createResetId = config.dependencies.createResetId;
    this.metaKey = config.metaKey;
    this.meta = config.meta;
    this.status =
      this.scope === 'guest'
        ? 'guest'
        : this.repository === null
          ? 'offline'
          : 'idle';
  }

  // ── Read ───────────────────────────────────────────────────────────────

  getSnapshot(): BasicVocabularySyncRuntimeSnapshot {
    return Object.freeze({
      scope: this.scope,
      userId: this.userId,
      status: this.status,
    });
  }

  getStore(): BasicVocabularyProgressStore {
    return this.store;
  }

  subscribe(
    listener: (snapshot: BasicVocabularySyncRuntimeSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Rating capture ─────────────────────────────────────────────────────

  applyRating(itemId: string, rating: VocabularySessionRating): void {
    if (this.disposed) return;
    // 1. Apply through the scoped progress store exactly once.
    this.store.applyRating(itemId, rating);
    // 2. Read the accepted resulting item entry.
    const entry: VocabularyProgressEntry = {
      status: this.store.getStatus(itemId),
      knownStreak: this.store.getKnownStreak(itemId),
    };
    if (entry.status === 'new') {
      // An implicit resulting `new` entry is an invariant failure.
      throw new Error(
        `Implicit new item "${itemId}" after basic-vocabulary rating`,
      );
    }
    if (this.scope !== 'user' || this.meta === null) return;
    // 3. Record/update the dirty item through #289.
    this.meta = recordBasicVocabularyDirtyItem(this.meta, itemId, entry);
    // 4. Persist sync metadata best-effort; a write failure keeps the dirty
    //    state in memory, emits `error`, and never undoes the accepted rating.
    if (!this.persistMeta()) {
      this.setStatus('error');
    } else if (this.status === 'error') {
      // A successful write recovers the availability-based status.
      this.setStatus(this.baseStatus());
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────

  resetAll(): void {
    if (this.disposed) return;
    if (this.scope === 'guest') {
      this.store.resetAll();
      return;
    }
    if (this.meta === null) return;
    // One reset UUID only when no reset is pending; a second click reuses the
    // same pending reset and never increments the generation again.
    const resetId = this.meta.pendingResetId ?? this.createResetId();
    this.meta = beginBasicVocabularyLocalReset(this.meta, resetId);
    const persisted = this.persistMeta();
    // Clear only the user-scoped progress store locally.
    this.store.resetAll();
    if (!persisted) {
      this.setStatus('error');
    } else if (this.repository === null || !this.isOnline()) {
      this.setStatus('offline');
    } else {
      this.setStatus('idle');
    }
  }

  // ── Local refresh ──────────────────────────────────────────────────────

  refreshLocal(): void {
    if (this.disposed) return;
    this.store.refresh();
  }

  // ── Explicit sync ──────────────────────────────────────────────────────

  async syncNow(): Promise<void> {
    if (this.disposed) return;
    if (this.inFlightSync !== null) return this.inFlightSync;
    if (this.scope === 'guest') {
      this.setStatus('guest');
      return;
    }
    if (this.repository === null) {
      this.setStatus('offline');
      return;
    }
    if (!this.isOnline()) {
      this.setStatus('offline');
      return;
    }
    const promise = this.runSync();
    this.inFlightSync = promise;
    try {
      await promise;
    } finally {
      if (this.inFlightSync === promise) this.inFlightSync = null;
    }
  }

  private async runSync(): Promise<void> {
    this.setStatus('syncing');
    if (
      this.scope !== 'user' ||
      this.userId === null ||
      this.meta === null ||
      this.repository === null
    ) {
      this.setStatus('offline');
      return;
    }
    const repo = this.repository;
    let metaPersistFailed = false;
    let cacheWriteFailed = false;
    try {
      let meta = this.meta;
      // 1. Acknowledge any pending local reset with the exact ID.
      if (meta.pendingResetId !== null) {
        const resetId = meta.pendingResetId;
        const preReset = meta;
        const generation = await repo.reset(this.userId, resetId);
        if (this.disposed) return;
        const acknowledged = acknowledgeBasicVocabularyRemoteReset(
          preReset,
          generation,
        );
        // A rating recorded while the reset RPC was in flight lives in the
        // live meta. It is absent from the pre-reset meta (a new ID) or holds
        // a newer entry than the pre-reset copy (a same-ID re-rating), so the
        // acknowledgement computed from the pre-reset meta would keep the
        // older entry. Override/merge those rows with unique review orders,
        // keeping the nextReviewOrder-strictly-greater invariant intact
        // (crash-safety rule: never clear dirty metadata before a successful
        // cloud push).
        let merged = acknowledged;
        if (this.meta !== null) {
          const additions = Object.entries(this.meta.dirtyItems).filter(
            ([id, dirty]) => {
              const acknowledgedEntry = acknowledged.dirtyItems[id]?.entry;
              return (
                acknowledgedEntry === undefined ||
                acknowledgedEntry.status !== dirty.entry.status ||
                acknowledgedEntry.knownStreak !== dirty.entry.knownStreak
              );
            },
          );
          if (additions.length > 0) {
            const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {
              ...acknowledged.dirtyItems,
            };
            const usedOrders = new Set(
              Object.values(dirtyItems).map((dirty) => dirty.reviewOrder),
            );
            let nextOrder = acknowledged.nextReviewOrder;
            for (const [id, dirty] of additions) {
              let order = dirty.reviewOrder;
              if (usedOrders.has(order)) {
                order = nextOrder;
                nextOrder = order + 1;
              } else if (order >= nextOrder) {
                nextOrder = order + 1;
              }
              usedOrders.add(order);
              dirtyItems[id] = { entry: dirty.entry, reviewOrder: order };
            }
            merged = { ...acknowledged, dirtyItems, nextReviewOrder: nextOrder };
          }
        }
        this.meta = merged;
        if (!this.persistMeta()) {
          // Retain/rewrite the same reset ID so a retry is idempotent.
          this.meta = { ...merged, pendingResetId: resetId };
          this.setStatus('error');
          return;
        }
        meta = merged;
        // Replace the local cache with the post-reset dirty rows only.
        const resetDoc = this.replaceLocalWithDirty(merged);
        if (!this.persistCache(resetDoc)) cacheWriteFailed = true;
      }
      // 2. Load the cloud snapshot.
      const snapshot = await repo.loadSnapshot(this.userId);
      if (this.disposed) return;
      // Re-capture the live meta after the network wait: a rating recorded
      // while the load was in flight is already applied to this.meta and must
      // survive the import and merge instead of being overwritten by the
      // snapshot (crash-safety rule: never clear dirty metadata before a
      // successful cloud push).
      const liveMeta = this.meta;
      if (liveMeta === null) return;
      // 3. One-time guest import (exactly once against this snapshot).
      if (!liveMeta.guestImportCompleted) {
        const imported = importBasicVocabularyGuestProgress(
          this.currentGuestDocument(),
          snapshot,
          liveMeta,
        );
        let importedMeta = imported.meta;
        let importedProgress = imported.progress;
        // The import rebuilds dirty state from the guest rows only. Preserve
        // any local ratings recorded before or during this first sync: the
        // in-memory dirty rows (including any captured while the load was in
        // flight) are newer than any guest row.
        const preImportDirty = Object.entries(liveMeta.dirtyItems);
        if (preImportDirty.length > 0) {
          const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {
            ...importedMeta.dirtyItems,
          };
          const progressItems: Record<string, VocabularyProgressEntry> = {
            ...importedProgress.items,
          };
          let nextOrder = importedMeta.nextReviewOrder;
          // In-memory ratings (recorded before this first sync) are newer than
          // any guest row, including a same-ID guest import: the in-memory
          // dirty row and entry win the collision. Each preserved order stays
          // unique; a conflict with an already-merged order is re-sequenced
          // after every merged order.
          const usedOrders = new Set(
            Object.values(dirtyItems).map((dirty) => dirty.reviewOrder),
          );
          for (const [id, dirty] of preImportDirty) {
            let order = dirty.reviewOrder;
            if (usedOrders.has(order)) {
              order = nextOrder;
              nextOrder = order + 1;
            } else if (order >= nextOrder) {
              nextOrder = order + 1;
            }
            usedOrders.add(order);
            dirtyItems[id] = { entry: dirty.entry, reviewOrder: order };
            progressItems[id] = dirty.entry;
          }
          importedMeta = { ...importedMeta, dirtyItems, nextReviewOrder: nextOrder };
          importedProgress = { version: 1, items: progressItems };
        }
        if (snapshot.resetGeneration > importedMeta.resetGeneration) {
          // The cloud is already at a newer generation than this device has
          // ever seen. Adopt it so the imported/preserved dirty rows are
          // pushed at the current generation instead of being dropped by a
          // remote-reset rebuild that clears every local dirty row.
          importedMeta = {
            ...importedMeta,
            resetGeneration: snapshot.resetGeneration,
          };
        }
        meta = importedMeta;
        this.meta = importedMeta;
        this.store.replaceAllForSync(importedProgress);
        if (!this.persistCache(importedProgress)) cacheWriteFailed = true;
        if (!this.persistMeta()) metaPersistFailed = true;
      }
      // 4. Merge local/cloud through #289. The merge reads the live meta (for
      //    the guest-import path this is importedMeta with preserved pre-import
      //    dirty; otherwise the current in-memory meta), so any rating recorded
      //    during the network waits enters the merge as a dirty row.
      const merged = mergeBasicVocabularyCloudSnapshot(
        this.currentLocalDocument(),
        this.meta,
        snapshot,
      );
      if (this.disposed) return;
      this.store.replaceAllForSync(merged.progress);
      if (!this.persistCache(merged.progress)) cacheWriteFailed = true;
      this.meta = merged.meta;
      meta = merged.meta;
      if (!this.persistMeta()) metaPersistFailed = true;
      // 5. Capture one immutable sent batch and push it.
      let sentBatch: readonly BasicVocabularyCloudItem[] = merged.mutationsToPush;
      let shouldAck = sentBatch.length > 0;
      if (sentBatch.length > 0) {
        try {
          await repo.pushMutations(this.userId, meta.resetGeneration, sentBatch);
          if (this.disposed) return;
        } catch (error) {
          if (this.classifyRepositoryError(error) === 'stale-generation') {
            // At most one immediate reload/merge cycle in the same call. The
            // remerge reads the live meta: a rating recorded while the push
            // was in flight must enter the merge as a dirty row instead of
            // being dropped by the same-generation merge.
            const fresh = await repo.loadSnapshot(this.userId);
            if (this.disposed) return;
            if (this.meta === null) return;
            const remerged = mergeBasicVocabularyCloudSnapshot(
              this.currentLocalDocument(),
              this.meta,
              fresh,
            );
            this.store.replaceAllForSync(remerged.progress);
            if (!this.persistCache(remerged.progress)) cacheWriteFailed = true;
            this.meta = remerged.meta;
            meta = remerged.meta;
            if (!this.persistMeta()) metaPersistFailed = true;
            sentBatch = remerged.mutationsToPush;
            shouldAck = sentBatch.length > 0;
            if (sentBatch.length > 0) {
              await repo.pushMutations(this.userId, meta.resetGeneration, sentBatch);
              if (this.disposed) return;
            }
          } else {
            throw error;
          }
        }
      }
      // 6. Acknowledge only entries still equal to the sent batch. The ack
      //    always reads the live meta: a rating recorded while the push was in
      //    flight must survive acknowledgement of the older captured batch.
      //    A cache write failure keeps the acknowledged rows dirty so the
      //    push stays safe to resend after the cache recovers.
      if (shouldAck && sentBatch.length > 0 && !cacheWriteFailed) {
        const acked = acknowledgeBasicVocabularyMutations(this.meta, sentBatch);
        this.meta = acked;
        if (!this.persistMeta()) metaPersistFailed = true;
      }
      if (metaPersistFailed || cacheWriteFailed) {
        this.setStatus('error');
      } else {
        this.setStatus('synced');
      }
    } catch (error) {
      if (this.disposed) return;
      const kind = this.classifyRepositoryError(error);
      if (kind === 'network' && !this.isOnline()) {
        this.setStatus('offline');
      } else {
        this.setStatus('error');
      }
    }
  }

  // ── Storage events ─────────────────────────────────────────────────────

  handleStorageChange(key: string | null, storageArea: StorageLike | null): void {
    if (this.disposed) return;
    // Reject unrelated storage areas (null is a synthetic/unknown area).
    if (storageArea !== null && storageArea !== this.storage) return;
    if (this.scope === 'guest') {
      // Guest runtime ignores user meta/user keys entirely.
      if (key === null) {
        this.store.acceptExternalClear();
        return;
      }
      if (key === this.store.getStorageKey()) {
        if (!this.store.acceptExternalClear()) this.store.refresh();
      }
      return;
    }
    if (key === null) {
      // Storage-wide clear affects both the progress key and the meta key.
      this.store.acceptExternalClear();
      this.reparseSyncMeta();
      return;
    }
    if (key === this.store.getStorageKey()) {
      if (!this.store.acceptExternalClear()) this.store.refresh();
      return;
    }
    if (key === this.metaKey) {
      this.reparseSyncMeta();
    }
  }

  // ── Disposal ───────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    // Late network completions observe `disposed` and rewrite nothing.
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  private currentLocalDocument(): BasicVocabularyProgressDocument {
    return { version: 1, items: { ...this.store.getAllItems() } };
  }

  private currentGuestDocument(): BasicVocabularyProgressDocument {
    const items = this.guestStore?.getAllItems() ?? {};
    return { version: 1, items: { ...items } };
  }

  private replaceLocalWithDirty(
    meta: BasicVocabularySyncMetaDocument,
  ): BasicVocabularyProgressDocument {
    const items: Record<string, VocabularyProgressEntry> = {};
    for (const [id, dirty] of Object.entries(meta.dirtyItems)) {
      items[id] = dirty.entry;
    }
    const doc: BasicVocabularyProgressDocument = { version: 1, items };
    this.store.replaceAllForSync(doc);
    return doc;
  }

  /**
   * Write the replacement document to the exact progress key and report
   * whether the write landed.
   *
   * The store keeps a failed replacement usable in memory and later
   * refresh/write cannot resurrect older rows, but the on-disk row for an
   * acknowledged push may be stale after a quota/unavailable failure. A
   * direct read-after-write cannot distinguish that case (the previous write
   * may already hold identical bytes), so the runtime performs its own write
   * and treats a throw as a cache write failure. When the cache write fails,
   * dirty metadata is retained so the acknowledged cloud write can be safely
   * re-pushed after the cache recovers.
   */
  private persistCache(doc: BasicVocabularyProgressDocument): boolean {
    if (this.storage === null) return true;
    try {
      this.storage.setItem(this.store.getStorageKey(), JSON.stringify(doc));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Best-effort write of the sync metadata to its exact user key.
   *
   * Returns false only when a real write attempt throws. Unavailable storage
   * and non-user scopes are not write failures (the runtime falls back to
   * page-lifetime in-memory metadata).
   */
  private persistMeta(): boolean {
    if (this.scope !== 'user' || this.meta === null) return true;
    if (this.storage === null || this.metaKey === null) return true;
    try {
      this.storage.setItem(this.metaKey, JSON.stringify(this.meta));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reparse the stored sync meta on an active meta-key/null storage event.
   *
   * Only a document that belongs to this same user is applied; malformed or
   * wrong-user data is left in place (not deleted) and in-memory metadata is
   * preserved. In-memory dirty items and a pending reset are always retained
   * over stale storage metadata.
   */
  private reparseSyncMeta(): void {
    if (this.scope !== 'user' || this.metaKey === null || this.userId === null) {
      return;
    }
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(this.metaKey) ?? null;
    } catch {
      raw = null;
    }
    if (raw === null) return; // cleared key: keep in-memory meta (no resurrection)
    const parsed = parseBasicVocabularySyncMeta(raw, this.userId);
    if (parsed === null || this.meta === null) return;
    // Preserve in-memory dirty items and any pending reset over stale meta.
    // In-memory dirty rows keep their exact orders; storage-only rows keep
    // their orders unless they collide, in which case they are re-sequenced
    // after every in-memory order so the merge invariant stays intact.
    const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {};
    const usedOrders = new Set<number>();
    for (const [id, dirty] of Object.entries(this.meta.dirtyItems)) {
      dirtyItems[id] = dirty;
      usedOrders.add(dirty.reviewOrder);
    }
    let nextOrder = Math.max(this.meta.nextReviewOrder, parsed.nextReviewOrder);
    for (const [id, dirty] of Object.entries(parsed.dirtyItems)) {
      if (id in dirtyItems) continue; // in-memory wins
      let order = dirty.reviewOrder;
      if (usedOrders.has(order)) order = nextOrder;
      dirtyItems[id] = { entry: dirty.entry, reviewOrder: order };
      usedOrders.add(order);
      nextOrder = order + 1;
    }
    for (const dirty of Object.values(dirtyItems)) {
      if (dirty.reviewOrder >= nextOrder) nextOrder = dirty.reviewOrder + 1;
    }
    this.meta = {
      ...parsed,
      pendingResetId: this.meta.pendingResetId ?? parsed.pendingResetId,
      // The reset generation and guest-import completion never roll back on a
      // storage event: an older cross-tab meta cannot rewind a generation the
      // device already reached (that would let a later sync treat the cloud as
      // a remote reset and rebuild away un-acked post-reset dirty rows).
      resetGeneration: Math.max(
        this.meta.resetGeneration,
        parsed.resetGeneration,
      ),
      guestImportCompleted:
        this.meta.guestImportCompleted || parsed.guestImportCompleted,
      dirtyItems,
      nextReviewOrder: nextOrder,
    };
    // Best-effort rewrite so the merged meta is durable across tabs; a failure
    // keeps the merged in-memory state (retryable on the next event).
    try {
      this.storage?.setItem(this.metaKey, JSON.stringify(this.meta));
    } catch {
      /* keep in-memory merged state */
    }
  }

  private classifyRepositoryError(error: unknown): BasicVocabularyRepositoryErrorKind {
    if (error instanceof BasicVocabularyRepositoryError) return error.kind;
    return 'unknown';
  }

  /** The availability-based status for a user runtime when not mid-sync. */
  private baseStatus(): 'idle' | 'offline' {
    if (this.repository === null) return 'offline';
    if (this.storage === null) return 'offline';
    return 'idle';
  }

  private setStatus(status: BasicVocabularySyncStatus): void {
    if (this.disposed) return;
    if (this.status === status) return;
    this.status = status;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

// ─── Factories ─────────────────────────────────────────────────────────────────

/** Guest runtime: legacy guest progress key, zero network, no sync metadata. */
export function createGuestBasicVocabularySyncRuntime(
  dependencies: BasicVocabularySyncRuntimeDependencies,
): BasicVocabularySyncRuntime {
  const store = new BasicVocabularyProgressStore(
    dependencies.storage,
    getBasicVocabularyProgressStorageKey(BASIC_VOCABULARY_GUEST_SCOPE),
  );
  return new BasicVocabularySyncRuntimeImpl({
    scope: 'guest',
    userId: null,
    store,
    guestStore: null,
    metaKey: null,
    meta: null,
    dependencies,
  });
}

/** User runtime: user-scoped progress + sync metadata; validates the UUID. */
export function createUserBasicVocabularySyncRuntime(
  userId: string,
  dependencies: BasicVocabularySyncRuntimeDependencies,
): BasicVocabularySyncRuntime {
  if (!isValidSupabaseUserId(userId)) {
    throw new Error(
      `Invalid Supabase user ID for basic-vocabulary sync runtime: "${userId}"`,
    );
  }
  const scope: BasicVocabularyProgressScope = { kind: 'user', userId };
  const progressKey = getBasicVocabularyProgressStorageKey(scope);
  const metaKey = getSyncMetaKey(userId);
  const store = new BasicVocabularyProgressStore(dependencies.storage, progressKey);
  // Guest progress is read separately for the one-time import and never
  // mutated or deleted by this runtime.
  const guestStore = new BasicVocabularyProgressStore(
    dependencies.storage,
    BASIC_VOCABULARY_PROGRESS_KEY,
  );
  const meta = loadSyncMeta(dependencies.storage, metaKey, userId);
  return new BasicVocabularySyncRuntimeImpl({
    scope: 'user',
    userId,
    store,
    guestStore,
    metaKey,
    meta,
    dependencies,
  });
}
