import { isValidSupabaseUserId } from './basicVocabularyProgressScope';
import type { BasicVocabularyProgressDocument } from './basicVocabularyProgress';
import type { VocabularyProgressEntry } from './vocabularyProgress';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One remote row of the basic-vocabulary progress snapshot.
 * `status`/`knownStreak` follow progress v1; `reviewOrder` and
 * `resetGeneration` are non-negative integers owned by the sync layer.
 */
export interface BasicVocabularyCloudItem {
  readonly itemId: string;
  readonly status: 'learning' | 'learned';
  readonly knownStreak: number;
  readonly reviewOrder: number;
  readonly resetGeneration: number;
}

/**
 * A server snapshot: the generation it represents plus its rows.
 * Rows may arrive in any order; the merge reorders them deterministically.
 */
export interface BasicVocabularyCloudSnapshot {
  readonly resetGeneration: number;
  readonly items: readonly BasicVocabularyCloudItem[];
}

/**
 * A locally dirty row: the progress entry plus the exact review order
 * assigned when the mutation was recorded.
 */
export interface BasicVocabularyDirtyItem {
  readonly entry: VocabularyProgressEntry;
  readonly reviewOrder: number;
}

/**
 * Per-user sync metadata for the basic-vocabulary course.
 *
 * - `resetGeneration` is the generation this device will propose for the
 *   next local reset and adopts from remote resets.
 * - `nextReviewOrder` is the next order to assign; it is strictly greater
 *   than every dirty/effective review order in the same meta.
 * - `pendingResetId` holds the reset UUID whose acknowledgement was lost,
 *   so a retried begin is idempotent and rollback stays rejected.
 * - `guestImportCompleted` permanently records that the guest document was
 *   imported once; re-import is a no-op.
 * - `dirtyItems` maps item IDs to their latest unacknowledged mutation,
 *   keyed in the order the mutations were recorded.
 */
export interface BasicVocabularySyncMetaDocument {
  readonly version: 1;
  readonly userId: string;
  readonly resetGeneration: number;
  readonly nextReviewOrder: number;
  readonly pendingResetId: string | null;
  readonly guestImportCompleted: boolean;
  readonly dirtyItems: Readonly<Record<string, BasicVocabularyDirtyItem>>;
}

/** Outcome of a cloud snapshot merge. */
export interface BasicVocabularySyncMergeResult {
  readonly progress: BasicVocabularyProgressDocument;
  readonly meta: BasicVocabularySyncMetaDocument;
  readonly mutationsToPush: readonly BasicVocabularyCloudItem[];
  readonly kind:
    | 'merged'
    | 'remote-reset-applied'
    | 'pending-local-reset'
    | 'stale-remote-rejected';
}

// ─── Invariant helpers ─────────────────────────────────────────────────────────

/** Item IDs are non-empty strings; implicit `new` is absence and is never a row. */
function isValidItemId(id: string): boolean {
  return id !== '';
}

function isNonNegativeInteger(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

/** Status/streak consistency matches progress v1 (`basicVocabularyProgress`). */
function isConsistent(
  status: VocabularyProgressEntry['status'],
  knownStreak: number,
): boolean {
  if (status === 'new') return knownStreak === 0;
  if (status === 'learning') return knownStreak === 0 || knownStreak === 1;
  if (status === 'learned') return knownStreak >= 2;
  return false;
}

/**
 * Narrow an entry status to a cloud row status. Implicit `new` is absence
 * and is never a dirty/cloud row, so it cannot be pushed.
 */
function toCloudStatus(
  status: VocabularyProgressEntry['status'],
): 'learning' | 'learned' {
  if (status === 'new') {
    throw new Error(
      'Implicit new cannot be pushed as a basic-vocabulary cloud row',
    );
  }
  return status;
}

/**
 * `nextReviewOrder` must be strictly greater than every dirty/effective
 * review order recorded in the same meta.
 */
function hasValidOrderInvariant(
  nextReviewOrder: number,
  dirtyItems: Readonly<Record<string, BasicVocabularyDirtyItem>>,
): boolean {
  if (!isNonNegativeInteger(nextReviewOrder)) return false;
  for (const dirty of Object.values(dirtyItems)) {
    if (dirty.reviewOrder >= nextReviewOrder) return false;
  }
  return true;
}

function isValidDirtyItem(value: unknown): value is BasicVocabularyDirtyItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== 2) return false;
  const entry = obj.entry;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return false;
  }
  const entryObj = entry as Record<string, unknown>;
  if (Object.keys(entryObj).length !== 2) return false;
  const status = entryObj.status;
  if (status !== 'new' && status !== 'learning' && status !== 'learned') {
    return false;
  }
  if (typeof entryObj.knownStreak !== 'number') return false;
  const reviewOrder = obj.reviewOrder;
  if (typeof reviewOrder !== 'number') return false;
  if (!isNonNegativeInteger(reviewOrder)) return false;
  return isConsistent(status, entryObj.knownStreak);
}

// ─── Creation ─────────────────────────────────────────────────────────────────

/**
 * Create the initial sync meta for a user.
 *
 * Throws when `userId` is not a canonical lowercase UUID: the metadata keys
 * are identity-scoped and a bad identifier must never be persisted.
 */
export function createBasicVocabularySyncMeta(
  userId: string,
): BasicVocabularySyncMetaDocument {
  if (!isValidSupabaseUserId(userId)) {
    throw new Error(
      `Invalid Supabase user ID for basic-vocabulary sync meta: "${userId}"`,
    );
  }
  return {
    version: 1,
    userId,
    resetGeneration: 0,
    nextReviewOrder: 0,
    pendingResetId: null,
    guestImportCompleted: false,
    dirtyItems: {},
  };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * All-or-nothing parse of a serialized sync meta.
 *
 * Requires the exact root keys, `version: 1`, the exact `userId`, and the
 * full invariant set. Any malformed root key, item key, entry, order,
 * generation, or pending reset ID invalidates the entire sync meta.
 */
export function parseBasicVocabularySyncMeta(
  raw: string,
  expectedUserId: string,
): BasicVocabularySyncMetaDocument | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (Object.keys(obj).length !== 7) return null;
    if (obj.version !== 1 || typeof obj.version !== 'number') return null;
    if (obj.userId !== expectedUserId || typeof obj.userId !== 'string') {
      return null;
    }
    if (!isValidSupabaseUserId(obj.userId)) return null;

    const resetGeneration = obj.resetGeneration;
    if (typeof resetGeneration !== 'number' || !isNonNegativeInteger(resetGeneration)) {
      return null;
    }

    const nextReviewOrder = obj.nextReviewOrder;
    if (
      typeof nextReviewOrder !== 'number' ||
      !isNonNegativeInteger(nextReviewOrder)
    ) {
      return null;
    }

    const pendingResetId = obj.pendingResetId;
    if (pendingResetId !== null) {
      if (typeof pendingResetId !== 'string' || !isValidSupabaseUserId(pendingResetId)) {
        return null;
      }
    }

    if (typeof obj.guestImportCompleted !== 'boolean') return null;

    const dirtyRaw = obj.dirtyItems;
    if (
      dirtyRaw === null ||
      typeof dirtyRaw !== 'object' ||
      Array.isArray(dirtyRaw)
    ) {
      return null;
    }
    const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {};
    for (const [id, value] of Object.entries(dirtyRaw)) {
      if (!isValidItemId(id)) return null;
      if (!isValidDirtyItem(value)) return null;
      dirtyItems[id] = value;
    }
    if (!hasValidOrderInvariant(nextReviewOrder, dirtyItems)) return null;

    return {
      version: 1,
      userId: obj.userId,
      resetGeneration,
      nextReviewOrder,
      pendingResetId,
      guestImportCompleted: obj.guestImportCompleted,
      dirtyItems,
    };
  } catch {
    return null;
  }
}

// ─── Dirty mutations ──────────────────────────────────────────────────────────

/**
 * Record a dirty mutation for `itemId` (a rating that has not been pushed).
 *
 * - A new ID is inserted at the end of the dirty order.
 * - A repeated ID is moved to the newest position with its latest entry,
 *   keeping the mutation-to-push order deterministic.
 * - Assigns the current `nextReviewOrder` and increments it exactly once.
 */
export function recordBasicVocabularyDirtyItem(
  meta: BasicVocabularySyncMetaDocument,
  itemId: string,
  entry: VocabularyProgressEntry,
): BasicVocabularySyncMetaDocument {
  if (!isValidItemId(itemId)) {
    throw new Error(
      `Invalid item ID for basic-vocabulary dirty item: "${itemId}"`,
    );
  }
  if (entry.status === 'new') {
    throw new Error(
      `Implicit new item "${itemId}" cannot be recorded as a basic-vocabulary dirty item`,
    );
  }
  if (!isConsistent(entry.status, entry.knownStreak)) {
    throw new Error(
      `Invalid progress entry for basic-vocabulary dirty item "${itemId}": ${entry.status}/${entry.knownStreak}`,
    );
  }
  const order = meta.nextReviewOrder;
  const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {};
  for (const [id, dirty] of Object.entries(meta.dirtyItems)) {
    if (id !== itemId) dirtyItems[id] = dirty;
  }
  dirtyItems[itemId] = { entry, reviewOrder: order };
  return {
    version: 1,
    userId: meta.userId,
    resetGeneration: meta.resetGeneration,
    nextReviewOrder: order + 1,
    pendingResetId: meta.pendingResetId,
    guestImportCompleted: meta.guestImportCompleted,
    dirtyItems,
  };
}

// ─── Idempotent local reset ───────────────────────────────────────────────────

/**
 * Begin a local reset with an idempotent `resetId` (a canonical UUID).
 *
 * - No reset pending: validates the UUID, clears pre-reset dirty items,
 *   increments the proposed generation exactly once, resets the next order
 *   to 0, and preserves guest-import completion.
 * - Same reset ID already pending: byte-equivalent no-op, so a retry after a
 *   lost acknowledgement cannot double-increment the generation.
 * - Different reset ID already pending: rejected, never replaced.
 */
export function beginBasicVocabularyLocalReset(
  meta: BasicVocabularySyncMetaDocument,
  resetId: string,
): BasicVocabularySyncMetaDocument {
  if (!isValidSupabaseUserId(resetId)) {
    throw new Error(
      `Invalid reset ID for basic-vocabulary local reset: "${resetId}"`,
    );
  }
  if (meta.pendingResetId !== null) {
    if (meta.pendingResetId === resetId) {
      return meta;
    }
    throw new Error(
      'A different basic-vocabulary reset is already pending; rejecting the new reset ID',
    );
  }
  return {
    version: 1,
    userId: meta.userId,
    resetGeneration: meta.resetGeneration + 1,
    nextReviewOrder: 0,
    pendingResetId: resetId,
    guestImportCompleted: meta.guestImportCompleted,
    dirtyItems: {},
  };
}

// ─── Reset acknowledgement ────────────────────────────────────────────────────

/**
 * Acknowledge that the server applied the pending local reset.
 *
 * Requires a pending reset and a `serverGeneration` strictly greater than
 * the pre-reset generation; retags post-reset dirty rows to the new
 * generation, clears `pendingResetId`, and rejects rollback/equality that
 * could revive old data.
 */
export function acknowledgeBasicVocabularyRemoteReset(
  meta: BasicVocabularySyncMetaDocument,
  serverGeneration: number,
): BasicVocabularySyncMetaDocument {
  if (meta.pendingResetId === null) {
    throw new Error(
      'Cannot acknowledge a basic-vocabulary remote reset without a pending local reset',
    );
  }
  if (
    !Number.isInteger(serverGeneration) ||
    serverGeneration <= meta.resetGeneration - 1
  ) {
    throw new Error(
      `Rejecting stale server generation ${serverGeneration} for basic-vocabulary reset; must be greater than pre-reset generation ${meta.resetGeneration - 1}`,
    );
  }
  const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {};
  for (const [id, dirty] of Object.entries(meta.dirtyItems)) {
    dirtyItems[id] = { ...dirty, reviewOrder: dirty.reviewOrder + 1 };
  }
  return {
    version: 1,
    userId: meta.userId,
    resetGeneration: serverGeneration,
    nextReviewOrder: meta.nextReviewOrder + 1,
    pendingResetId: null,
    guestImportCompleted: meta.guestImportCompleted,
    dirtyItems,
  };
}

// ─── Mutation acknowledgement ─────────────────────────────────────────────────

/**
 * Acknowledge the immutable batch that was actually sent.
 *
 * An ID is cleared only when the current dirty entry, review order, and
 * generation still equal that sent item, so a newer same-ID mutation
 * survives acknowledgement of an older batch. Unknown and duplicate sent
 * IDs are harmless after validation.
 */
export function acknowledgeBasicVocabularyMutations(
  meta: BasicVocabularySyncMetaDocument,
  sentItems: readonly BasicVocabularyCloudItem[],
): BasicVocabularySyncMetaDocument {
  for (const item of sentItems) {
    if (!isValidCloudItem(item)) {
      throw new Error(
        `Invalid sent cloud item for basic-vocabulary mutation acknowledgement`,
      );
    }
  }
  const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {};
  for (const [id, dirty] of Object.entries(meta.dirtyItems)) {
    const sent = sentItems.find(
      (item) =>
        item.itemId === id &&
        item.reviewOrder === dirty.reviewOrder &&
        item.resetGeneration === meta.resetGeneration &&
        item.status === dirty.entry.status &&
        item.knownStreak === dirty.entry.knownStreak,
    );
    if (sent === undefined) dirtyItems[id] = dirty;
  }
  return {
    version: 1,
    userId: meta.userId,
    resetGeneration: meta.resetGeneration,
    nextReviewOrder: meta.nextReviewOrder,
    pendingResetId: meta.pendingResetId,
    guestImportCompleted: meta.guestImportCompleted,
    dirtyItems,
  };
}

// ─── Cloud snapshot validation ────────────────────────────────────────────────

function isValidCloudItem(value: unknown): value is BasicVocabularyCloudItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== 5) return false;
  const { itemId, status, knownStreak, reviewOrder, resetGeneration } = obj;
  if (typeof itemId !== 'string' || !isValidItemId(itemId)) return false;
  if (status !== 'learning' && status !== 'learned') return false;
  if (
    typeof knownStreak !== 'number' ||
    !isConsistent(status, knownStreak)
  ) {
    return false;
  }
  if (typeof reviewOrder !== 'number' || !isNonNegativeInteger(reviewOrder)) {
    return false;
  }
  if (
    typeof resetGeneration !== 'number' ||
    !isNonNegativeInteger(resetGeneration)
  ) {
    return false;
  }
  return true;
}

/**
 * Validate a cloud snapshot: every row must match the snapshot generation,
 * IDs must be unique, and review orders must be unique. Any violation
 * throws a controlled `TypeError` before the merge touches local state.
 */
function validateCloudSnapshot(snapshot: BasicVocabularyCloudSnapshot): void {
  const generation = snapshot.resetGeneration;
  if (!Number.isInteger(generation) || generation < 0) {
    throw new TypeError(
      `Invalid basic-vocabulary cloud snapshot generation: ${generation}`,
    );
  }
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const item of snapshot.items) {
    if (!isValidCloudItem(item)) {
      throw new TypeError(
        'Invalid basic-vocabulary cloud snapshot item',
      );
    }
    if (item.resetGeneration !== generation) {
      throw new TypeError(
        `Basic-vocabulary cloud item "${item.itemId}" generation ${item.resetGeneration} does not match snapshot generation ${generation}`,
      );
    }
    if (seenIds.has(item.itemId)) {
      throw new TypeError(
        `Duplicate item ID "${item.itemId}" in basic-vocabulary cloud snapshot`,
      );
    }
    if (seenOrders.has(item.reviewOrder)) {
      throw new TypeError(
        `Duplicate review order ${item.reviewOrder} in basic-vocabulary cloud snapshot`,
      );
    }
    seenIds.add(item.itemId);
    seenOrders.add(item.reviewOrder);
  }
}

// ─── Cloud merge ──────────────────────────────────────────────────────────────

/**
 * Merge a remote snapshot into local progress and sync metadata.
 *
 * - `pending-local-reset`: a local reset is not yet acknowledged, so local
 *   post-reset dirty state stays authoritative; remote rows are not copied
 *   and no ordinary push is emitted.
 * - `remote-reset-applied`: the remote generation is newer; rebuild from
 *   cloud rows in ascending review order, clear stale local dirty/cache,
 *   and adopt the remote generation.
 * - `merged`: same generation; the cloud is the base, local dirty IDs
 *   override, dirty-only local IDs remain, non-dirty local-only cached IDs
 *   disappear, output insertion order follows effective review order, and
 *   the push contains exactly the current dirty rows ascending.
 * - `stale-remote-rejected`: older remote generation; local progress and
 *   meta are preserved byte-equivalently with no pushes.
 *
 * No client-clock comparison, status-strength merge, random tie-break, or
 * full-snapshot overwrite.
 */
export function mergeBasicVocabularyCloudSnapshot(
  local: BasicVocabularyProgressDocument,
  meta: BasicVocabularySyncMetaDocument,
  cloud: BasicVocabularyCloudSnapshot,
): BasicVocabularySyncMergeResult {
  if (meta.pendingResetId !== null) {
    return {
      progress: local,
      meta,
      mutationsToPush: [],
      kind: 'pending-local-reset',
    };
  }
  validateCloudSnapshot(cloud);
  const cloudGeneration = cloud.resetGeneration;

  if (cloudGeneration < meta.resetGeneration) {
    return {
      progress: local,
      meta,
      mutationsToPush: [],
      kind: 'stale-remote-rejected',
    };
  }

  if (cloudGeneration > meta.resetGeneration) {
    const items: Record<string, VocabularyProgressEntry> = {};
    const rows = [...cloud.items].sort(
      (a, b) => a.reviewOrder - b.reviewOrder,
    );
    for (const row of rows) {
      items[row.itemId] = { status: row.status, knownStreak: row.knownStreak };
    }
    const nextReviewOrder = rows.length;
    return {
      progress: { version: 1, items },
      meta: {
        version: 1,
        userId: meta.userId,
        resetGeneration: cloudGeneration,
        nextReviewOrder,
        pendingResetId: null,
        guestImportCompleted: meta.guestImportCompleted,
        dirtyItems: {},
      },
      mutationsToPush: [],
      kind: 'remote-reset-applied',
    };
  }

  // Same generation: cloud base + local dirty override.
  const dirtyEntries = Object.entries(meta.dirtyItems);
  const orderOf = new Map<string, number>();
  for (const [id, dirty] of dirtyEntries) {
    orderOf.set(id, dirty.reviewOrder);
  }
  const cloudRows = new Map(
    cloud.items.map((item) => [item.itemId, item] as const),
  );
  // Non-dirty cloud rows keep their cloud review order so the merged output
  // is inserted in effective review order.
  for (const [id, row] of cloudRows) {
    if (!orderOf.has(id)) orderOf.set(id, row.reviewOrder);
  }
  const ids = new Set<string>([
    ...cloudRows.keys(),
    ...dirtyEntries.map(([id]) => id),
  ]);
  const entries: Record<string, VocabularyProgressEntry> = {};
  const sortedIds = [...ids].sort(
    (a, b) => (orderOf.get(a) ?? -1) - (orderOf.get(b) ?? -1),
  );
  for (const id of sortedIds) {
    const dirty = meta.dirtyItems[id];
    if (dirty !== undefined) {
      entries[id] = dirty.entry;
    } else {
      const row = cloudRows.get(id);
      if (row !== undefined) {
        entries[id] = { status: row.status, knownStreak: row.knownStreak };
      }
    }
  }
  const mutationsToPush: BasicVocabularyCloudItem[] = dirtyEntries
    .sort((a, b) => a[1].reviewOrder - b[1].reviewOrder)
    .map(([id, dirty]) => ({
      itemId: id,
      status: toCloudStatus(dirty.entry.status),
      knownStreak: dirty.entry.knownStreak,
      reviewOrder: dirty.reviewOrder,
      resetGeneration: meta.resetGeneration,
    }));
  return {
    progress: { version: 1, items: entries },
    meta,
    mutationsToPush,
    kind: 'merged',
  };
}

// ─── One-time guest import ────────────────────────────────────────────────────

/**
 * Import a guest progress document exactly once.
 *
 * - Already completed: byte-equivalent no-op.
 * - Otherwise mark `guestImportCompleted` exactly once, including an empty
 *   guest.
 * - Import only non-new guest entries in guest object insertion/LRU order.
 * - Empty cloud imports all guest entries; a non-empty cloud imports only
 *   guest IDs absent from the cloud, with the cloud winning overlaps.
 * - Imported rows become dirty after the highest cloud review order,
 *   preserving guest order. Guest input is never deleted or mutated.
 */
export function importBasicVocabularyGuestProgress(
  guest: BasicVocabularyProgressDocument,
  cloud: BasicVocabularyCloudSnapshot,
  meta: BasicVocabularySyncMetaDocument,
): {
  readonly progress: BasicVocabularyProgressDocument;
  readonly meta: BasicVocabularySyncMetaDocument;
} {
  if (meta.guestImportCompleted) {
    return { progress: guest, meta };
  }
  validateCloudSnapshot(cloud);

  const cloudIds = new Set(cloud.items.map((item) => item.itemId));
  const highestCloudOrder = cloud.items.reduce(
    (max, item) => Math.max(max, item.reviewOrder),
    -1,
  );
  const cloudRows = [...cloud.items].sort(
    (a, b) => a.reviewOrder - b.reviewOrder,
  );
  const progressItems: Record<string, VocabularyProgressEntry> = {};
  for (const row of cloudRows) {
    progressItems[row.itemId] = {
      status: row.status,
      knownStreak: row.knownStreak,
    };
  }

  const dirtyItems: Record<string, BasicVocabularyDirtyItem> = {};
  let nextOrder = Math.max(meta.nextReviewOrder, highestCloudOrder + 1);
  const guestIds = Object.keys(guest.items);
  for (const id of guestIds) {
    if (cloudIds.has(id)) continue;
    const guestEntry = guest.items[id];
    if (guestEntry.status === 'new') continue;
    const entry: VocabularyProgressEntry = {
      status: guestEntry.status,
      knownStreak: guestEntry.knownStreak,
    };
    progressItems[id] = entry;
    dirtyItems[id] = { entry, reviewOrder: nextOrder };
    nextOrder += 1;
  }

  return {
    progress: { version: 1, items: progressItems },
    meta: {
      version: 1,
      userId: meta.userId,
      resetGeneration: meta.resetGeneration,
      nextReviewOrder: nextOrder,
      pendingResetId: meta.pendingResetId,
      guestImportCompleted: true,
      dirtyItems,
    },
  };
}
