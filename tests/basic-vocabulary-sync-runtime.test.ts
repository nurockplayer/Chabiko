// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createGuestBasicVocabularySyncRuntime,
  createUserBasicVocabularySyncRuntime,
  type BasicVocabularySyncRuntime,
  type BasicVocabularySyncRuntimeSnapshot,
} from '../src/client/basicVocabularySyncRuntime';
import { BasicVocabularyRepositoryError } from '../src/data/basicVocabularySupabaseRepository';
import type {
  BasicVocabularySupabaseRepository,
} from '../src/data/basicVocabularySupabaseRepository';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import { isValidSupabaseUserId } from '../src/domain/basicVocabularyProgressScope';
import type {
  BasicVocabularyCloudItem,
  BasicVocabularyCloudSnapshot,
  BasicVocabularySyncMetaDocument,
} from '../src/domain/basicVocabularySync';
import type { StorageLike } from '../src/lib/progress';
import type { VocabularyProgressEntry } from '../src/domain/vocabularyProgress';

const USER_ID = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
const OTHER_USER_ID = 'aaaa1111-2222-3333-4444-555566667777';
const RESET_ID = 'bbbb2222-3333-4444-5555-666677778888';
const USER_PROGRESS_KEY = `chabiko:basic-vocabulary-progress:user:${USER_ID}:v1`;
const USER_META_KEY = `chabiko:basic-vocabulary-sync-meta:user:${USER_ID}:v1`;
const OTHER_PROGRESS_KEY = `chabiko:basic-vocabulary-progress:user:${OTHER_USER_ID}:v1`;
const OTHER_META_KEY = `chabiko:basic-vocabulary-sync-meta:user:${OTHER_USER_ID}:v1`;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function entry(
  status: VocabularyProgressEntry['status'],
  knownStreak: number,
): VocabularyProgressEntry {
  return { status, knownStreak };
}

function cloudItem(
  itemId: string,
  status: 'learning' | 'learned',
  knownStreak: number,
  reviewOrder: number,
  resetGeneration: number,
): BasicVocabularyCloudItem {
  return { itemId, status, knownStreak, reviewOrder, resetGeneration };
}

function snapshot(
  resetGeneration: number,
  items: readonly BasicVocabularyCloudItem[] = [],
): BasicVocabularyCloudSnapshot {
  return { resetGeneration, items };
}

function progressDoc(
  items: Record<string, VocabularyProgressEntry>,
): string {
  return JSON.stringify({ version: 1, items });
}

function makeStorage(initial: Record<string, string> = {}): StorageLike {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
  };
}

/** Read a stored JSON object from a fake storage key, or null. */
function readStored(
  storage: StorageLike,
  key: string,
): Record<string, unknown> | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Read the user's sync meta document from storage. */
function readMeta(storage: StorageLike): BasicVocabularySyncMetaDocument {
  return readStored(storage, USER_META_KEY) as unknown as BasicVocabularySyncMetaDocument;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Programmable fake repository. Each method consumes one entry from its
 * script (reusing the last entry once exhausted); returning a deferred
 * promise lets a test pause the sync at an exact point.
 */
class ScriptedRepository implements BasicVocabularySupabaseRepository {
  loadScript: Array<() => BasicVocabularyCloudSnapshot | Promise<BasicVocabularyCloudSnapshot>> = [];
  pushScript: Array<() => void | Promise<void>> = [];
  resetScript: Array<() => number | Promise<number>> = [];
  loadCalls = 0;
  pushCalls = 0;
  resetCalls = 0;
  pushedBatches: BasicVocabularyCloudItem[][] = [];

  loadSnapshot(userId: string): Promise<BasicVocabularyCloudSnapshot> {
    void userId;
    this.loadCalls += 1;
    const step =
      this.loadScript[Math.min(this.loadCalls - 1, this.loadScript.length - 1)];
    const result = step === undefined ? snapshot(0, []) : step();
    return Promise.resolve(result);
  }

  pushMutations(
    userId: string,
    generation: number,
    items: readonly BasicVocabularyCloudItem[],
  ): Promise<void> {
    void userId;
    void generation;
    this.pushCalls += 1;
    this.pushedBatches.push([...items]);
    const step =
      this.pushScript[Math.min(this.pushCalls - 1, this.pushScript.length - 1)];
    const result = step === undefined ? undefined : step();
    return Promise.resolve(result);
  }

  reset(userId: string, resetId: string): Promise<number> {
    void userId;
    void resetId;
    this.resetCalls += 1;
    const step =
      this.resetScript[Math.min(this.resetCalls - 1, this.resetScript.length - 1)];
    const result = step === undefined ? 0 : step();
    return Promise.resolve(result);
  }
}

/** Create a user runtime with guest progress pre-seeded for import tests. */
function userRuntimeWithGuest(
  guestItems: Record<string, VocabularyProgressEntry>,
  options: {
    storage?: StorageLike;
    repository?: BasicVocabularySupabaseRepository | null;
    isOnline?: () => boolean;
    metaRaw?: string | null;
  } = {},
): {
  runtime: BasicVocabularySyncRuntime;
  storage: StorageLike;
  repository: ScriptedRepository;
} {
  const repository = new ScriptedRepository();
  const storage = options.storage ?? makeStorage();
  storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc(guestItems));
  if (options.metaRaw !== undefined && options.metaRaw !== null) {
    storage.setItem(USER_META_KEY, options.metaRaw);
  }
  const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
    storage,
    repository: options.repository !== undefined ? options.repository : repository,
    isOnline: options.isOnline ?? (() => true),
    createResetId: () => RESET_ID,
  });
  return { runtime, storage, repository };
}

// ─── Guest runtime ─────────────────────────────────────────────────────────────

describe('guest runtime', () => {
  it('snapshot is always guest scope with no user and no network', async () => {
    const repository = new ScriptedRepository();
    const storage = makeStorage();
    const runtime = createGuestBasicVocabularySyncRuntime({
      storage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    expect(runtime.getSnapshot()).toEqual({
      scope: 'guest',
      userId: null,
      status: 'guest',
    });
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('guest');
    expect(repository.loadCalls).toBe(0);
    expect(repository.pushCalls).toBe(0);
    expect(repository.resetCalls).toBe(0);
  });

  it('preserves complete legacy store semantics through the guest key', () => {
    const storage = makeStorage();
    const runtime = createGuestBasicVocabularySyncRuntime({
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    const store = runtime.getStore();
    expect(store.getStorageKey()).toBe(BASIC_VOCABULARY_PROGRESS_KEY);

    store.applyRating('a', 'known');
    expect(store.getStatus('a')).toBe('learning');
    expect(store.getKnownStreak('a')).toBe(1);
    expect(readStored(storage, BASIC_VOCABULARY_PROGRESS_KEY)).toEqual(
      JSON.parse(progressDoc({ a: entry('learning', 1) })),
    );
    // Guest runtime never touches user keys.
    expect(storage.getItem(USER_PROGRESS_KEY)).toBeNull();
    expect(storage.getItem(USER_META_KEY)).toBeNull();

    store.resetAll();
    expect(store.getStatus('a')).toBe('new');
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();
  });

  it('guest runtime never reads or writes sync metadata even with a repository', async () => {
    const repository = new ScriptedRepository();
    const storage = makeStorage();
    storage.setItem(USER_META_KEY, JSON.stringify({ version: 1, userId: USER_ID }));
    const runtime = createGuestBasicVocabularySyncRuntime({
      storage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    await runtime.syncNow();
    expect(repository.loadCalls).toBe(0);
    expect(repository.pushCalls).toBe(0);
    // Meta key untouched (guest runtime owns no metadata).
    expect(storage.getItem(USER_META_KEY)).not.toBeNull();
  });

  it('guest storage handling only reacts to the legacy progress key and null', () => {
    const storage = makeStorage();
    const runtime = createGuestBasicVocabularySyncRuntime({
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    expect(runtime.getStore().getStatus('a')).toBe('learning');

    // A clear of the active guest key is authoritative.
    storage.removeItem(BASIC_VOCABULARY_PROGRESS_KEY);
    runtime.handleStorageChange(BASIC_VOCABULARY_PROGRESS_KEY, storage);
    expect(runtime.getStore().getStatus('a')).toBe('new');

    // User keys and unrelated keys are ignored by the guest runtime.
    runtime.applyRating('b', 'known');
    storage.setItem(USER_PROGRESS_KEY, progressDoc({ z: entry('learned', 3) }));
    runtime.handleStorageChange(USER_PROGRESS_KEY, storage);
    runtime.handleStorageChange('unrelated-key', storage);
    expect(runtime.getStore().getStatus('b')).toBe('learning');
  });
});

// ─── User key/meta derivation and isolation ───────────────────────────────────

describe('user runtime key derivation and isolation', () => {
  it('derives the exact user progress and sync-meta keys', () => {
    expect(isValidSupabaseUserId(USER_ID)).toBe(true);
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    expect(runtime.getStore().getStorageKey()).toBe(USER_PROGRESS_KEY);
    expect(USER_PROGRESS_KEY).toBe(
      `chabiko:basic-vocabulary-progress:user:${USER_ID}:v1`,
    );
    expect(USER_META_KEY).toBe(
      `chabiko:basic-vocabulary-sync-meta:user:${USER_ID}:v1`,
    );
  });

  it('rejects a non-canonical user id synchronously', () => {
    const storage = makeStorage();
    for (const bad of ['', 'not-a-uuid', USER_ID.toUpperCase(), ` ${USER_ID}`]) {
      expect(() =>
        createUserBasicVocabularySyncRuntime(bad, {
          storage,
          repository: null,
          isOnline: () => true,
          createResetId: () => RESET_ID,
        }),
      ).toThrow();
    }
  });

  it('writes only its own progress and meta keys, leaving guest and other users untouched', () => {
    const storage = makeStorage();
    const otherStorage = makeStorage();
    const repo = new ScriptedRepository();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: repo,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');

    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();
    expect(storage.getItem(USER_META_KEY)).not.toBeNull();
    // Guest key and another user's keys are never written.
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();
    expect(storage.getItem(OTHER_PROGRESS_KEY)).toBeNull();
    expect(storage.getItem(OTHER_META_KEY)).toBeNull();
    // A second user runtime on its own storage is fully isolated.
    const other = createUserBasicVocabularySyncRuntime(OTHER_USER_ID, {
      storage: otherStorage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    other.applyRating('b', 'known');
    expect(otherStorage.getItem(OTHER_PROGRESS_KEY)).not.toBeNull();
    expect(otherStorage.getItem(OTHER_META_KEY)).not.toBeNull();
    expect(otherStorage.getItem(USER_PROGRESS_KEY)).toBeNull();
  });
});

// ─── Malformed / unavailable storage fallback ─────────────────────────────────

describe('malformed and unavailable storage fallback', () => {
  it('a null storage keeps every operation usable in memory', async () => {
    const repo = new ScriptedRepository();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage: null,
      repository: repo,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    expect(runtime.getSnapshot().status).toBe('idle');
    runtime.applyRating('a', 'known');
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    runtime.resetAll();
    expect(runtime.getStore().getStatus('a')).toBe('new');
    runtime.refreshLocal();
    expect(runtime.getStore().getStatus('a')).toBe('new');
  });

  it('malformed or wrong-user sync metadata falls back fresh without deleting the raw key', () => {
    const storage = makeStorage();
    storage.setItem(USER_META_KEY, 'not-json');
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    // Malformed raw key is preserved until a later successful write.
    expect(storage.getItem(USER_META_KEY)).toBe('not-json');

    // The fallback is a fresh meta with the exact initial shape.
    runtime.applyRating('a', 'known');
    const meta = readMeta(storage);
    expect(meta.userId).toBe(USER_ID);
    expect(meta.resetGeneration).toBe(0);
    expect(meta.guestImportCompleted).toBe(false);
    expect(meta.dirtyItems.a).toEqual({ entry: entry('learning', 1), reviewOrder: 0 });
  });

  it('wrong-user metadata falls back fresh and the next successful write replaces it', () => {
    const storage = makeStorage();
    storage.setItem(USER_META_KEY, JSON.stringify({ version: 1, userId: OTHER_USER_ID }));
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    const meta = readMeta(storage);
    expect(meta.userId).toBe(USER_ID);
  });

  it('malformed progress storage falls back to an empty store', () => {
    const storage = makeStorage();
    storage.setItem(USER_PROGRESS_KEY, 'corrupt');
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    expect(runtime.getStore().getAllItems()).toEqual({});
  });
});

// ─── Rating capture ────────────────────────────────────────────────────────────

describe('rating capture', () => {
  it('returns synchronously before any network, writes once, and marks the exact dirty entry/order', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    expect(runtime.getSnapshot().status).toBe('idle');

    runtime.applyRating('a', 'known');
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    expect(runtime.getStore().getKnownStreak('a')).toBe(1);
    expect(repository.pushCalls).toBe(0);
    expect(repository.loadCalls).toBe(0);

    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toEqual({ entry: entry('learning', 1), reviewOrder: 0 });
    expect(meta.nextReviewOrder).toBe(1);
    expect(Object.keys(meta.dirtyItems)).toEqual(['a']);

    // A second rating appends a distinct dirty order.
    runtime.applyRating('b', 'unsure');
    const meta2 = readMeta(storage);
    expect(meta2.dirtyItems.b).toEqual({ entry: entry('learning', 0), reviewOrder: 1 });
    expect(Object.keys(meta2.dirtyItems)).toEqual(['a', 'b']);
  });

  it('a rating during an in-flight sync still returns before network completes', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    const load = deferred<BasicVocabularyCloudSnapshot>();
    const push = deferred<void>();
    repository.loadScript = [() => load.promise];
    repository.pushScript = [() => push.promise];

    const syncPromise = runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('syncing');
    expect(repository.loadCalls).toBe(1);

    runtime.applyRating('a', 'known');
    // Applied synchronously while the sync is paused on the network.
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toBeDefined();
    expect(repository.pushCalls).toBe(0);

    load.resolve(snapshot(0, []));
    await new Promise((r) => setTimeout(r, 0));
    // The rating recorded during the load was retained, so it is pushed.
    expect(repository.pushCalls).toBe(1);
    push.resolve();
    await syncPromise;

    // The rating survived the guest import and was pushed and acked.
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    expect(runtime.getSnapshot().status).toBe('synced');
    const metaAfter = readMeta(storage);
    expect(metaAfter.dirtyItems).toEqual({});
  });

  it('a rating on the guest runtime performs no metadata work', () => {
    const storage = makeStorage();
    const runtime = createGuestBasicVocabularySyncRuntime({
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    expect(storage.getItem(USER_META_KEY)).toBeNull();
  });
});

// ─── Metadata write failure ────────────────────────────────────────────────────

describe('metadata write failure', () => {
  it('keeps the accepted local rating and retryable dirty state, emitting error', () => {
    const storage = makeStorage();
    let failMeta = false;
    const flaky: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (failMeta && k === USER_META_KEY) throw new Error('quota');
        storage.setItem(k, v);
      },
      removeItem: (k) => storage.removeItem(k),
    };
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage: flaky,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    expect(runtime.getSnapshot().status).toBe('offline');

    failMeta = true;
    runtime.applyRating('a', 'known');
    // The accepted local rating is never undone by a metadata write failure.
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    expect(runtime.getSnapshot().status).toBe('error');
    // The dirty state stays retryable: the next successful write persists it.
    failMeta = false;
    runtime.applyRating('b', 'known');
    expect(runtime.getSnapshot().status).toBe('offline');
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toEqual({ entry: entry('learning', 1), reviewOrder: 0 });
    expect(meta.dirtyItems.b).toEqual({ entry: entry('learning', 1), reviewOrder: 1 });
  });
});

// ─── Local reset ───────────────────────────────────────────────────────────────

describe('local reset', () => {
  it('clears the user progress immediately, generates one reset id, and reuses it on a second click', () => {
    const storage = makeStorage();
    const createResetId = vi.fn(() => RESET_ID);
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId,
    });
    runtime.applyRating('a', 'known');
    runtime.applyRating('b', 'known');
    expect(runtime.getStore().getAllItems().a).toBeDefined();

    runtime.resetAll();
    expect(runtime.getStore().getAllItems()).toEqual({});
    expect(createResetId).toHaveBeenCalledTimes(1);
    const meta = readMeta(storage);
    expect(meta.pendingResetId).toBe(RESET_ID);
    expect(meta.resetGeneration).toBe(1);
    expect(meta.dirtyItems).toEqual({});

    // A second click reuses the same pending reset and never generates a new id.
    runtime.resetAll();
    expect(createResetId).toHaveBeenCalledTimes(1);
    const meta2 = readMeta(storage);
    expect(meta2.pendingResetId).toBe(RESET_ID);
    expect(meta2.resetGeneration).toBe(1);
  });

  it('never clears guest, another user, or unrelated keys', () => {
    const storage = makeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc({ g: entry('learned', 2) }));
    storage.setItem(OTHER_PROGRESS_KEY, progressDoc({ o: entry('learned', 2) }));
    storage.setItem('unrelated-key', 'value');
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    runtime.resetAll();

    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).not.toBeNull();
    expect(storage.getItem(OTHER_PROGRESS_KEY)).not.toBeNull();
    expect(storage.getItem('unrelated-key')).toBe('value');
    expect(storage.getItem(USER_PROGRESS_KEY)).toBeNull();
  });

  it('reset returns synchronously and old local rows cannot reappear even when storage still has them', () => {
    const storage = makeStorage();
    storage.setItem(
      USER_PROGRESS_KEY,
      progressDoc({ old: entry('learned', 2) }),
    );
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    // Loaded from storage, then reset.
    expect(runtime.getStore().getStatus('old')).toBe('learned');
    runtime.resetAll();
    expect(runtime.getStore().getStatus('old')).toBe('new');
    // refreshLocal and a later rating cannot resurrect the old row.
    runtime.refreshLocal();
    expect(runtime.getStore().getStatus('old')).toBe('new');
  });

  it('a pending reset blocks remote resurrection during a sync', async () => {
    const storage = makeStorage();
    const repository = new ScriptedRepository();
    const reset = deferred<number>();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repository.resetScript = [() => reset.promise];
    repository.loadScript = [() => load.promise];
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    runtime.resetAll();

    // While the reset is pending, another tab writes newer remote rows.
    storage.setItem(
      USER_PROGRESS_KEY,
      progressDoc({ remote: entry('learned', 5) }),
    );

    const syncPromise = runtime.syncNow();
    // Step 1 (reset RPC) runs before step 2 (load): the cloud is not read yet.
    expect(repository.resetCalls).toBe(1);
    expect(repository.loadCalls).toBe(0);

    reset.resolve(1);
    // Step 1 completes, then step 2 issues the load.
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.loadCalls).toBe(1);
    // The reloaded snapshot is at the stale pre-reset generation, so it is
    // rejected and cannot resurrect the remote rows over the reset state.
    load.resolve(snapshot(0, []));
    await syncPromise;
    // Remote rows never resurrected the local (reset) state.
    expect(runtime.getStore().getStatus('remote')).toBe('new');
  });

  it('a lost reset response and local persistence failure retry the same reset id and increment the server generation once', async () => {
    const storage = makeStorage();
    const repository = new ScriptedRepository();
    // Server applied the reset on the first call (generation 1) and returns
    // the same 1 on the idempotent retry.
    repository.resetScript = [() => 1, () => 1];
    repository.loadScript = [() => snapshot(1, [])];

    // The reset was acknowledged remotely but the local ack write failed, so
    // the pending reset id survived in the stored meta.
    storage.setItem(
      USER_META_KEY,
      JSON.stringify({
        version: 1,
        userId: USER_ID,
        resetGeneration: 1,
        nextReviewOrder: 1,
        pendingResetId: RESET_ID,
        guestImportCompleted: false,
        dirtyItems: {},
      }),
    );
    let failMeta = false;
    const flakyStorage: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (failMeta && k === USER_META_KEY) throw new Error('quota');
        storage.setItem(k, v);
      },
      removeItem: (k) => storage.removeItem(k),
    };
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage: flakyStorage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });

    // First sync: the reset RPC succeeds, but persisting the acknowledgement
    // fails, so the same reset id is retained for an idempotent retry.
    failMeta = true;
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('error');
    expect(repository.resetCalls).toBe(1);
    const metaAfterFail = readMeta(storage);
    expect(metaAfterFail.pendingResetId).toBe(RESET_ID);
    expect(metaAfterFail.resetGeneration).toBe(1);

    // Retry: the ack now persists, the idempotent reset RPC returns the same
    // generation, and the pending reset is cleared without a second increment.
    failMeta = false;
    await runtime.syncNow();
    expect(repository.resetCalls).toBe(2);
    const meta = readMeta(storage);
    expect(meta.pendingResetId).toBeNull();
    expect(meta.resetGeneration).toBe(1);
  });

  it('preserves a rating recorded while the load was in flight after a reset ack', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    // Complete the one-time guest import before the reset.
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];
    await runtime.syncNow();
    expect(readMeta(storage).guestImportCompleted).toBe(true);

    // Begin a local reset: generation 1 with a pending reset id.
    runtime.applyRating('a', 'known');
    runtime.resetAll();
    const metaBefore = readMeta(storage);
    expect(metaBefore.resetGeneration).toBe(1);
    expect(metaBefore.pendingResetId).toBe(RESET_ID);
    expect(metaBefore.dirtyItems).toEqual({});

    // The reset RPC succeeds immediately; the sync then pauses on the load.
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repository.resetScript = [() => 1];
    repository.loadScript = [() => load.promise];
    repository.pushScript = [() => undefined];

    const syncPromise = runtime.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    // The reset was acknowledged and the load is now in flight.
    expect(repository.resetCalls).toBe(1);
    expect(repository.loadCalls).toBe(2);

    // A rating recorded while the load is in flight (after the reset ack).
    runtime.applyRating('b', 'known');
    expect(runtime.getStore().getStatus('b')).toBe('learning');

    load.resolve(snapshot(1, []));
    await syncPromise;

    // The rating recorded after the reset ack survived the merge as a dirty
    // row, was pushed at the acknowledged generation, and acked.
    expect(runtime.getStore().getStatus('b')).toBe('learning');
    expect(repository.resetCalls).toBe(1);
    expect(runtime.getSnapshot().status).toBe('synced');
    const meta = readMeta(storage);
    expect(meta.pendingResetId).toBeNull();
    expect(meta.resetGeneration).toBe(1);
    expect(meta.dirtyItems).toEqual({});
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('b', 'learning', 1, 1, 1),
    ]);
  });

  it('preserves a rating recorded while the reset RPC was in flight', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    // Complete the one-time guest import before the reset.
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];
    await runtime.syncNow();
    expect(readMeta(storage).guestImportCompleted).toBe(true);

    // Begin a local reset: generation 1 with a pending reset id.
    runtime.applyRating('a', 'known');
    runtime.resetAll();
    const metaBefore = readMeta(storage);
    expect(metaBefore.resetGeneration).toBe(1);
    expect(metaBefore.pendingResetId).toBe(RESET_ID);
    expect(metaBefore.dirtyItems).toEqual({});

    // Pause the sync on the reset RPC, record a rating, then complete.
    const reset = deferred<number>();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repository.resetScript = [() => reset.promise];
    repository.loadScript = [() => load.promise];
    repository.pushScript = [() => undefined];

    const syncPromise = runtime.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.resetCalls).toBe(1);
    expect(repository.loadCalls).toBe(1);

    // A rating recorded while the reset RPC is in flight.
    runtime.applyRating('b', 'known');
    expect(runtime.getStore().getStatus('b')).toBe('learning');

    reset.resolve(1);
    await new Promise((r) => setTimeout(r, 0));
    // The reset was acknowledged and the in-flight rating survived the ack:
    // it is persisted as a dirty row, and the load is now in flight.
    expect(repository.loadCalls).toBe(2);
    const metaMid = readMeta(storage);
    expect(metaMid.pendingResetId).toBeNull();
    expect(metaMid.resetGeneration).toBe(1);
    expect(metaMid.dirtyItems.b).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 0,
    });

    load.resolve(snapshot(1, []));
    await syncPromise;

    // The rating survived the ack, the merge, and the push: it was pushed at
    // the acknowledged generation with a unique order, then acked.
    expect(runtime.getStore().getStatus('b')).toBe('learning');
    expect(repository.resetCalls).toBe(1);
    expect(runtime.getSnapshot().status).toBe('synced');
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('b', 'learning', 1, 0, 1),
    ]);
    const meta = readMeta(storage);
    expect(meta.pendingResetId).toBeNull();
    expect(meta.resetGeneration).toBe(1);
    expect(meta.dirtyItems).toEqual({});
  });

  it('preserves a same-ID re-rating recorded while the reset RPC was in flight', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    // Complete the one-time guest import before the reset.
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];
    await runtime.syncNow();
    expect(readMeta(storage).guestImportCompleted).toBe(true);

    // Begin a local reset, then rate an id before the sync runs (E1).
    runtime.resetAll();
    runtime.applyRating('a', 'known');
    const metaBefore = readMeta(storage);
    expect(metaBefore.resetGeneration).toBe(1);
    expect(metaBefore.pendingResetId).toBe(RESET_ID);
    expect(metaBefore.dirtyItems.a).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 0,
    });

    // Pause the sync on the reset RPC, then re-rate the same id (E2).
    const reset = deferred<number>();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repository.resetScript = [() => reset.promise];
    repository.loadScript = [() => load.promise];

    const syncPromise = runtime.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.resetCalls).toBe(1);
    expect(repository.loadCalls).toBe(1);

    // Re-rating the same id while the reset RPC is in flight (E2: learning/2).
    runtime.applyRating('a', 'known');
    expect(runtime.getStore().getKnownStreak('a')).toBe(2);

    reset.resolve(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.loadCalls).toBe(2);
    // The re-rating survived the ack as the newer entry (E2: learned/2), not
    // the older E1 (learning/1), with a unique review order.
    const metaMid = readMeta(storage);
    expect(metaMid.pendingResetId).toBeNull();
    expect(metaMid.resetGeneration).toBe(1);
    expect(metaMid.dirtyItems.a).toEqual({
      entry: entry('learned', 2),
      reviewOrder: 2,
    });

    load.resolve(snapshot(1, []));
    await syncPromise;

    // The newer entry was pushed and acked; the older E1 never reappeared.
    expect(runtime.getStore().getKnownStreak('a')).toBe(2);
    expect(runtime.getStore().getStatus('a')).toBe('learned');
    expect(runtime.getSnapshot().status).toBe('synced');
    expect(repository.resetCalls).toBe(1);
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learned', 2, 2, 1),
    ]);
    const meta = readMeta(storage);
    expect(meta.dirtyItems).toEqual({});
  });
});

// ─── One-time guest import ─────────────────────────────────────────────────────

describe('one-time guest import', () => {
  it('imports every non-new guest entry on an empty cloud and persists the permanent marker', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({
      a: entry('learning', 1),
      b: entry('new', 0),
      c: entry('learned', 3),
    });
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];

    await runtime.syncNow();
    expect(runtime.getStore().getAllItems().a).toEqual(entry('learning', 1));
    expect(runtime.getStore().getAllItems().b).toBeUndefined();
    expect(runtime.getStore().getAllItems().c).toEqual(entry('learned', 3));

    const meta = readMeta(storage);
    expect(meta.guestImportCompleted).toBe(true);
    // Both non-new guest entries were pushed in guest insertion order and then
    // acknowledged, clearing the dirty rows.
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('c', 'learned', 3, 1, 0),
    ]);
    expect(meta.dirtyItems).toEqual({});

    // The guest key itself is never mutated or deleted.
    const guest = readStored(storage, BASIC_VOCABULARY_PROGRESS_KEY) as {
      items: Record<string, VocabularyProgressEntry>;
    };
    expect(guest.items.b).toEqual(entry('new', 0));

    // The permanent marker prevents a second import.
    repository.loadScript = [() => snapshot(0, [])];
    const dirtyBefore = readMeta(storage);
    await runtime.syncNow();
    const dirtyAfter = readMeta(storage);
    expect(dirtyAfter.dirtyItems).toEqual(dirtyBefore.dirtyItems);
    expect(dirtyAfter.guestImportCompleted).toBe(true);
  });

  it('with a non-empty cloud, imports only guest ids absent from the cloud', async () => {
    const { runtime, repository } = userRuntimeWithGuest({
      a: entry('learned', 2),
      b: entry('learning', 1),
      c: entry('learned', 3),
    });
    repository.loadScript = [
      () =>
        snapshot(1, [
          cloudItem('a', 'learning', 0, 0, 1),
          cloudItem('x', 'learned', 2, 1, 1),
        ]),
    ];
    repository.pushScript = [() => undefined];

    await runtime.syncNow();
    // a is in the cloud (cloud wins); b and c are imported after the highest
    // cloud order (1).
    expect(runtime.getStore().getAllItems().a).toEqual(entry('learning', 0));
    expect(runtime.getStore().getAllItems().x).toEqual(entry('learned', 2));
    expect(runtime.getStore().getAllItems().b).toEqual(entry('learning', 1));
    expect(runtime.getStore().getAllItems().c).toEqual(entry('learned', 3));
  });

  it('imports once even for an empty guest and marks completion', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];

    await runtime.syncNow();
    const meta = readMeta(storage);
    expect(meta.guestImportCompleted).toBe(true);
    expect(meta.dirtyItems).toEqual({});
  });

  it('a pre-import rating of a same-ID guest row wins over the guest value', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({
      a: entry('learned', 3),
      g: entry('learning', 1),
    });
    // The user rated the same item before the first sync: the in-memory row is
    // newer than the guest copy and must survive the import.
    runtime.applyRating('a', 'known');
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [
      () => {
        throw new BasicVocabularyRepositoryError('forbidden', {});
      },
    ];

    await runtime.syncNow();
    // The user's value wins for the colliding id; the guest-only id is imported.
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    expect(runtime.getStore().getKnownStreak('a')).toBe(1);
    expect(runtime.getStore().getAllItems().g).toEqual(entry('learning', 1));
    expect(runtime.getSnapshot().status).toBe('error');

    // The dirty rows carry the user's value, not the guest's learned/3. The
    // pre-import order 0 does not collide with the imported orders, so each
    // review order stays unique.
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 0,
    });
    expect(meta.dirtyItems.g).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 2,
    });
    // The pushed batch carries the user's value and the orders are unique.
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('g', 'learning', 1, 2, 0),
    ]);
  });

  it('preserves a rating recorded while the load was in flight on the first sync', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({
      g: entry('learning', 1),
    });
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repository.loadScript = [() => load.promise];
    repository.pushScript = [
      () => {
        throw new BasicVocabularyRepositoryError('forbidden', {});
      },
    ];

    const syncPromise = runtime.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.loadCalls).toBe(1);

    // A rating recorded while the load is in flight.
    runtime.applyRating('a', 'known');

    load.resolve(snapshot(0, []));
    await syncPromise;

    // The rating survived the import: it is not overwritten by the guest rows.
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    expect(runtime.getStore().getKnownStreak('a')).toBe(1);
    // The guest row is still imported alongside it.
    expect(runtime.getStore().getAllItems().g).toEqual(entry('learning', 1));
    expect(runtime.getSnapshot().status).toBe('error');

    // The in-flight rating is a dirty row (its original order 0) and was part
    // of the pushed batch instead of being dropped; the guest row is imported
    // at the next order with no collisions.
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 0,
    });
    expect(meta.dirtyItems.g).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 1,
    });
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('g', 'learning', 1, 1, 0),
    ]);
  });
});

// ─── Merge paths and deterministic LRU order ──────────────────────────────────

describe('sync merge paths', () => {
  it('applies a same-generation merge deterministically', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({
      a: entry('learning', 1),
    });
    repository.loadScript = [
      () =>
        snapshot(0, [
          cloudItem('a', 'learning', 1, 0, 0),
          cloudItem('c', 'learned', 2, 2, 0),
        ]),
    ];
    repository.pushScript = [() => undefined];

    await runtime.syncNow();
    expect(runtime.getStore().getAllItems().a).toEqual(entry('learning', 1));
    expect(runtime.getStore().getAllItems().c).toEqual(entry('learned', 2));
    const meta = readMeta(storage);
    expect(meta.guestImportCompleted).toBe(true);
    // a is dirty (imported) and pushed; ack cleared it.
    expect(meta.dirtyItems).toEqual({});
  });

  it('applies a newer remote generation by rebuilding from cloud rows in ascending order', async () => {
    const { runtime, repository } = userRuntimeWithGuest({});
    repository.loadScript = [
      () =>
        snapshot(2, [
          cloudItem('y', 'learning', 0, 0, 2),
          cloudItem('x', 'learned', 2, 1, 2),
        ]),
    ];
    repository.pushScript = [() => undefined];

    await runtime.syncNow();
    expect(Object.keys(runtime.getStore().getAllItems())).toEqual(['y', 'x']);
  });

  it('rejects an older remote generation preserving local state', async () => {
    const storage = makeStorage();
    storage.setItem(
      USER_PROGRESS_KEY,
      progressDoc({ a: entry('learning', 1) }),
    );
    storage.setItem(
      USER_META_KEY,
      JSON.stringify({
        version: 1,
        userId: USER_ID,
        resetGeneration: 2,
        nextReviewOrder: 1,
        pendingResetId: null,
        guestImportCompleted: true,
        dirtyItems: {
          a: { entry: entry('learning', 1), reviewOrder: 0 },
        },
      }),
    );
    const repository = new ScriptedRepository();
    repository.loadScript = [
      () => snapshot(1, [cloudItem('z', 'learning', 0, 0, 1)]),
    ];
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    await runtime.syncNow();
    expect(runtime.getStore().getAllItems().a).toEqual(entry('learning', 1));
    expect(runtime.getStore().getAllItems().z).toBeUndefined();
  });
});

// ─── Push and acknowledgement ─────────────────────────────────────────────────

describe('push and acknowledgement', () => {
  it('pushes only the dirty batch and acknowledges exactly the captured batch', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    runtime.applyRating('b', 'unsure');
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];

    await runtime.syncNow();
    expect(repository.pushedBatches).toHaveLength(1);
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learning', 0, 1, 0),
    ]);
    const meta = readMeta(storage);
    expect(meta.dirtyItems).toEqual({});
  });

  it('a newer same-id mutation survives acknowledgement of an older captured batch', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    const load = deferred<BasicVocabularyCloudSnapshot>();
    const push = deferred<void>();
    repository.loadScript = [() => load.promise];
    repository.pushScript = [() => push.promise];

    const syncPromise = runtime.syncNow();
    load.resolve(snapshot(0, []));
    await new Promise((r) => setTimeout(r, 0));
    // The push captured the batch containing a@0.
    expect(repository.pushCalls).toBe(1);
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
    ]);

    // A newer rating of the same id happens while the push is in flight.
    runtime.applyRating('a', 'known');
    push.resolve();
    await syncPromise;

    // The newer mutation (a@1, learned/2) must survive acknowledgement of the
    // older batch (a@0, learning/1).
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toEqual({ entry: entry('learned', 2), reviewOrder: 1 });
  });

  it('preserves a rating recorded while the load was in flight on a later sync', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    // First sync completes the one-time guest import.
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('synced');
    expect(readMeta(storage).guestImportCompleted).toBe(true);

    // Second sync: pause on the load, record a rating, then complete.
    const load = deferred<BasicVocabularyCloudSnapshot>();
    const push = deferred<void>();
    repository.loadScript = [() => load.promise];
    repository.pushScript = [() => push.promise];

    const syncPromise = runtime.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.loadCalls).toBe(2);

    // A rating recorded while the load is in flight (guest import already
    // completed, so this is the plain merge path).
    runtime.applyRating('b', 'known');

    load.resolve(snapshot(0, []));
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.pushCalls).toBe(1);

    push.resolve();
    await syncPromise;

    // The rating survived the same-generation merge, was pushed, and acked.
    expect(runtime.getStore().getStatus('b')).toBe('learning');
    expect(runtime.getSnapshot().status).toBe('synced');
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('b', 'learning', 1, 0, 0),
    ]);
    const meta = readMeta(storage);
    expect(meta.dirtyItems).toEqual({});
  });
});

// ─── Single-flight concurrent sync ─────────────────────────────────────────────

describe('single-flight concurrent sync', () => {
  it('concurrent syncNow calls share one in-flight promise with no duplicate work', async () => {
    const { runtime, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    const load = deferred<BasicVocabularyCloudSnapshot>();
    const push = deferred<void>();
    repository.loadScript = [() => load.promise];
    repository.pushScript = [() => push.promise];

    const first = runtime.syncNow();
    const second = runtime.syncNow();
    const third = runtime.syncNow();
    expect(repository.loadCalls).toBe(1);

    load.resolve(snapshot(0, []));
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.pushCalls).toBe(1);

    push.resolve();
    await Promise.all([first, second, third]);
    expect(repository.loadCalls).toBe(1);
    expect(repository.pushCalls).toBe(1);
  });
});

// ─── Stale-generation bounded reload ───────────────────────────────────────────

describe('stale-generation handling', () => {
  it('performs at most one immediate reload/merge cycle with no recursive loop', async () => {
    const { runtime, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    repository.loadScript = [
      // First load sees the pre-reset generation; the push fails stale.
      () => snapshot(0, [cloudItem('a', 'learning', 1, 0, 0)]),
      // Bounded reload sees the newer remote generation, which rebuilds the
      // cache and clears the dirty row, so nothing more is pushed.
      () => snapshot(1, []),
    ];
    repository.pushScript = [
      () => {
        throw new BasicVocabularyRepositoryError('stale-generation', { code: '23503' });
      },
    ];

    await runtime.syncNow();
    // One bounded reload happened; no recursive loop.
    expect(repository.loadCalls).toBe(2);
    expect(repository.pushCalls).toBe(1);
    expect(runtime.getSnapshot().status).toBe('synced');
  });

  it('a second stale-generation failure stops after one bounded reload', async () => {
    const { runtime, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    repository.loadScript = [
      () => snapshot(0, [cloudItem('a', 'learning', 1, 0, 0)]),
      // The reload still reports the same generation with the dirty row still
      // present, so a second push is attempted and also fails stale.
      () => snapshot(0, [cloudItem('a', 'learning', 1, 0, 0)]),
    ];
    repository.pushScript = [
      () => {
        throw new BasicVocabularyRepositoryError('stale-generation', { code: '23503' });
      },
      () => {
        throw new BasicVocabularyRepositoryError('stale-generation', { code: '23503' });
      },
    ];

    await runtime.syncNow();
    // Only one bounded reload cycle ran; the second stale-generation push
    // propagates to the terminal error without another reload.
    expect(repository.loadCalls).toBe(2);
    expect(repository.pushCalls).toBe(2);
    expect(runtime.getSnapshot().status).toBe('error');
  });

  it('preserves an in-flight rating recorded while a stale-generation push was pending', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    const stalePush = deferred<void>();
    const reloadPush = deferred<void>();
    repository.loadScript = [
      // First load sees the pre-reset generation; the push fails stale.
      () => snapshot(0, [cloudItem('a', 'learning', 1, 0, 0)]),
      // Bounded reload still sees the same generation with the dirty row.
      () => snapshot(0, [cloudItem('a', 'learning', 1, 0, 0)]),
    ];
    repository.pushScript = [
      () => stalePush.promise,
      () => reloadPush.promise,
    ];

    const syncPromise = runtime.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(repository.pushCalls).toBe(1);

    // A rating recorded while the first push is still in flight.
    runtime.applyRating('b', 'known');

    // The push fails stale and triggers the bounded reload.
    stalePush.reject(
      new BasicVocabularyRepositoryError('stale-generation', { code: '23503' }),
    );
    await new Promise((r) => setTimeout(r, 0));
    // One bounded reload ran, re-merging with the live meta that now includes
    // b as a dirty row; no recursive loop.
    expect(repository.loadCalls).toBe(2);
    expect(repository.pushCalls).toBe(2);

    // The reloaded push fails for an unrelated reason, so nothing is acked and
    // the retained dirty rows stay inspectable.
    reloadPush.reject(new BasicVocabularyRepositoryError('forbidden', {}));
    await syncPromise;

    // The in-flight rating survived the reload as a dirty row, never dropped
    // by the same-generation remerge.
    expect(runtime.getStore().getStatus('b')).toBe('learning');
    expect(runtime.getStore().getStatus('a')).toBe('learning');
    const meta = readMeta(storage);
    expect(meta.dirtyItems.b).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 1,
    });
    expect(meta.dirtyItems.a).toBeDefined();
    expect(runtime.getSnapshot().status).toBe('error');
  });
});

// ─── Status classification without losing local state ─────────────────────────

describe('status classification', () => {
  it('maps offline, forbidden, invalid-data, and unknown errors while preserving local state', async () => {
    const cases: Array<{
      error: unknown;
      online: boolean;
      expected: 'offline' | 'error';
    }> = [
      { error: new BasicVocabularyRepositoryError('network', {}), online: false, expected: 'offline' },
      { error: new BasicVocabularyRepositoryError('network', {}), online: true, expected: 'error' },
      { error: new BasicVocabularyRepositoryError('forbidden', {}), online: true, expected: 'error' },
      { error: new BasicVocabularyRepositoryError('invalid-data', {}), online: true, expected: 'error' },
      { error: new BasicVocabularyRepositoryError('unknown', {}), online: false, expected: 'error' },
    ];
    for (const { error, online, expected } of cases) {
      // The sync enters the network layer while online, then the failure
      // surface observes the configured offline signal. An unknown error
      // stays `error` even when the signal turns offline, because only a
      // confirmed network error is downgraded to offline.
      let signal = true;
      const { runtime, repository } = userRuntimeWithGuest(
        {},
        { isOnline: () => signal },
      );
      runtime.applyRating('a', 'known');
      repository.loadScript = [
        () => {
          signal = online;
          throw error;
        },
      ];
      await runtime.syncNow();
      expect(runtime.getSnapshot().status).toBe(expected);
      // Local rating is never lost on a failed sync.
      expect(runtime.getStore().getStatus('a')).toBe('learning');
    }
  });

  it('no repository puts the user runtime in offline local mode', async () => {
    const { runtime } = userRuntimeWithGuest({}, { repository: null });
    expect(runtime.getSnapshot().status).toBe('offline');
    runtime.applyRating('a', 'known');
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('offline');
    expect(runtime.getStore().getStatus('a')).toBe('learning');
  });
});

// ─── Persistence ordering under injected failures ─────────────────────────────

describe('persistence ordering', () => {
  it('never clears the pending reset id before a successful reset response', async () => {
    const storage = makeStorage();
    const repository = new ScriptedRepository();
    repository.resetScript = [() => { throw new BasicVocabularyRepositoryError('network', {}); }];
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.resetAll();
    expect(runtime.getSnapshot().status).toBe('idle');
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('error');
    const meta = readMeta(storage);
    expect(meta.pendingResetId).toBe(RESET_ID);
  });

  it('a cache write failure does not erase dirty metadata', async () => {
    const storage = makeStorage();
    let failProgress = false;
    const flaky: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (failProgress && k === USER_PROGRESS_KEY) throw new Error('quota');
        storage.setItem(k, v);
      },
      removeItem: (k) => storage.removeItem(k),
    };
    const repository = new ScriptedRepository();
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage: flaky,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    const dirtyBefore = readMeta(storage);

    failProgress = true;
    await runtime.syncNow();
    const dirtyAfter = readMeta(storage);
    expect(dirtyAfter.dirtyItems.a).toEqual(dirtyBefore.dirtyItems.a);
  });

  it('a failed push keeps dirty metadata and local cache', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => { throw new BasicVocabularyRepositoryError('forbidden', {}); }];
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('error');
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toBeDefined();
    expect(runtime.getStore().getStatus('a')).toBe('learning');
  });

  it('acknowledged cloud writes may be safely resent after a metadata persistence failure', async () => {
    const storage = makeStorage();
    let failMeta = false;
    const flaky: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (failMeta && k === USER_META_KEY) throw new Error('quota');
        storage.setItem(k, v);
      },
      removeItem: (k) => storage.removeItem(k),
    };
    const repository = new ScriptedRepository();
    repository.loadScript = [() => snapshot(0, [])];
    repository.pushScript = [() => undefined];
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage: flaky,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');

    failMeta = true;
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('error');
    // The push itself succeeded and dirty metadata in storage still shows the
    // row, so a retry can safely re-push the idempotent cloud write.
    expect(repository.pushedBatches[0]).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
    ]);
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toBeDefined();
  });
});

// ─── Storage events ────────────────────────────────────────────────────────────

describe('storage events', () => {
  it('rejects unrelated storage areas', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    const other = makeStorage();
    other.setItem(USER_PROGRESS_KEY, progressDoc({ z: entry('learned', 3) }));
    runtime.handleStorageChange(USER_PROGRESS_KEY, other);
    expect(runtime.getStore().getStatus('z')).toBe('new');
  });

  it('active progress key clear refreshes the scoped store with external-clear semantics', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    storage.removeItem(USER_PROGRESS_KEY);
    runtime.handleStorageChange(USER_PROGRESS_KEY, storage);
    expect(runtime.getStore().getStatus('a')).toBe('new');
  });

  it('a user meta-key event reparses only same-user metadata, preserving in-memory dirty state', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');

    // A cross-tab write of the same user's metadata with a different dirty row.
    storage.setItem(
      USER_META_KEY,
      JSON.stringify({
        version: 1,
        userId: USER_ID,
        resetGeneration: 0,
        nextReviewOrder: 1,
        pendingResetId: null,
        guestImportCompleted: false,
        dirtyItems: {
          b: { entry: entry('learning', 0), reviewOrder: 0 },
        },
      }),
    );
    runtime.handleStorageChange(USER_META_KEY, storage);

    // Both the in-memory dirty row and the cross-tab row survive.
    const meta = readMeta(storage);
    expect(meta.dirtyItems.a).toBeDefined();
    expect(meta.dirtyItems.b).toBeDefined();
  });

  it('ignores other-user and guest keys on a user runtime', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    storage.setItem(OTHER_PROGRESS_KEY, progressDoc({ o: entry('learned', 2) }));
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, progressDoc({ g: entry('learned', 2) }));
    storage.setItem(OTHER_META_KEY, JSON.stringify({ version: 1, userId: OTHER_USER_ID }));
    runtime.handleStorageChange(OTHER_PROGRESS_KEY, storage);
    runtime.handleStorageChange(BASIC_VOCABULARY_PROGRESS_KEY, storage);
    runtime.handleStorageChange(OTHER_META_KEY, storage);
    expect(runtime.getStore().getStatus('o')).toBe('new');
    expect(runtime.getStore().getStatus('g')).toBe('new');
  });

  it('a null clear resets both the progress and meta keys without deleting raw meta on cross-tab clear', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    runtime.applyRating('a', 'known');
    // A real cross-tab clear removes both keys; then the synthetic null event
    // is delivered.
    storage.removeItem(USER_PROGRESS_KEY);
    storage.removeItem(USER_META_KEY);
    runtime.handleStorageChange(null, storage);
    expect(runtime.getStore().getStatus('a')).toBe('new');
    // The raw meta key stays cleared; in-memory metadata is preserved and
    // never rewritten over a cleared key.
    expect(storage.getItem(USER_META_KEY)).toBeNull();
  });

  it('a storage event never starts network work', () => {
    const { runtime, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    const other = makeStorage();
    other.setItem(USER_PROGRESS_KEY, progressDoc({ z: entry('learned', 3) }));
    runtime.handleStorageChange(USER_PROGRESS_KEY, other);
    expect(repository.loadCalls).toBe(0);
    expect(repository.pushCalls).toBe(0);
  });

  it('an older cross-tab meta cannot rewind the reset generation or drop post-reset dirty rows', async () => {
    const storage = makeStorage();
    const repository = new ScriptedRepository();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    // Reach generation 1 with an un-acked post-reset dirty row: a local reset
    // was begun (pending reset id) and a rating happened after the reset.
    runtime.resetAll();
    runtime.applyRating('a', 'known');
    const metaBefore = readMeta(storage);
    expect(metaBefore.resetGeneration).toBe(1);
    expect(metaBefore.pendingResetId).toBe(RESET_ID);
    expect(metaBefore.dirtyItems.a).toBeDefined();

    // A cross-tab write of the same user's meta still at the older generation 0.
    storage.setItem(
      USER_META_KEY,
      JSON.stringify({
        version: 1,
        userId: USER_ID,
        resetGeneration: 0,
        nextReviewOrder: 0,
        pendingResetId: null,
        guestImportCompleted: false,
        dirtyItems: {},
      }),
    );
    runtime.handleStorageChange(USER_META_KEY, storage);

    // The generation did not roll back, the pending reset is retained, and the
    // post-reset dirty row survived the event.
    const metaAfter = readMeta(storage);
    expect(metaAfter.resetGeneration).toBe(1);
    expect(metaAfter.pendingResetId).toBe(RESET_ID);
    expect(metaAfter.dirtyItems.a).toEqual({
      entry: entry('learning', 1),
      reviewOrder: 0,
    });

    // A subsequent sync keeps the dirty row: the merge cannot interpret the
    // retained generation as a remote reset and rebuild it away.
    repository.loadScript = [() => snapshot(1, [])];
    repository.resetScript = [() => 1];
    await runtime.syncNow();
    expect(runtime.getSnapshot().status).toBe('synced');
    expect(runtime.getStore().getStatus('a')).toBe('learning');
  });
});

// ─── Subscription, deduplication, disposal ────────────────────────────────────

describe('subscription and disposal', () => {
  it('delivers the current immutable snapshot immediately once, then only real changes', () => {
    const { runtime } = userRuntimeWithGuest({});
    const received: BasicVocabularySyncRuntimeSnapshot[] = [];
    const unsubscribe = runtime.subscribe((s) => received.push(s));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      scope: 'user',
      userId: USER_ID,
      status: 'idle',
    });
    // Identical status transitions are deduplicated.
    runtime.applyRating('a', 'known');
    expect(received).toHaveLength(1);
    unsubscribe();
    // Unsubscribe is idempotent.
    unsubscribe();
  });

  it('dispose clears listeners and prevents new work without rewriting storage', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    const received: BasicVocabularySyncRuntimeSnapshot[] = [];
    runtime.subscribe((s) => received.push(s));
    const metaRawBefore = storage.getItem(USER_META_KEY);

    runtime.dispose();
    runtime.dispose(); // repeated dispose is safe
    runtime.applyRating('a', 'known');
    expect(runtime.getStore().getStatus('a')).toBe('new');
    await runtime.syncNow();
    expect(repository.loadCalls).toBe(0);
    // No rewrite of storage after disposal.
    expect(storage.getItem(USER_META_KEY)).toBe(metaRawBefore);
  });

  it('a late network completion after dispose rewrites nothing', async () => {
    const { runtime, storage, repository } = userRuntimeWithGuest({});
    runtime.applyRating('a', 'known');
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repository.loadScript = [() => load.promise];
    const syncPromise = runtime.syncNow();
    expect(repository.loadCalls).toBe(1);

    runtime.dispose();
    load.resolve(snapshot(0, []));
    await syncPromise;
    // Storage is untouched after disposal (no status, no persist).
    expect(storage.getItem(USER_META_KEY)).not.toBeNull();
  });
});

// ─── replaceAllForSync via the runtime store ──────────────────────────────────

describe('replaceAllForSync via runtime store', () => {
  it('validates, replaces, and persists through the instance physical key', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    const store = runtime.getStore();
    store.replaceAllForSync({
      version: 1,
      items: { z: entry('learned', 2), a: entry('learning', 1) },
    });
    expect(Object.keys(store.getAllItems())).toEqual(['z', 'a']);
    const stored = readStored(storage, USER_PROGRESS_KEY) as {
      items: Record<string, VocabularyProgressEntry>;
    };
    expect(Object.keys(stored.items)).toEqual(['z', 'a']);
  });

  it('rejects an invalid document all-or-nothing', () => {
    const storage = makeStorage();
    const runtime = createUserBasicVocabularySyncRuntime(USER_ID, {
      storage,
      repository: null,
      isOnline: () => true,
      createResetId: () => RESET_ID,
    });
    const store = runtime.getStore();
    expect(() =>
      store.replaceAllForSync({
        version: 1,
        items: { a: { status: 'new', knownStreak: 1 } },
      }),
    ).toThrow();
    expect(store.getAllItems()).toEqual({});
  });
});

// ─── No DOM / window / Auth / timer / polling / realtime / console ────────────

describe('runtime has no environment dependencies', () => {
  it('imports no Supabase Auth, DOM, window, timers, polling, realtime, or logging', async () => {
    const source = await readFile(
      'src/client/basicVocabularySyncRuntime.ts',
      'utf8',
    );
    const banned: readonly string[] = [
      '@' + 'supabase',
      'supabase' + '.co',
      'create' + 'Client(',
      'auth.get' + 'User',
      'get' + 'Session',
      'onAuth' + 'StateChange',
      'access_' + 'token',
      'refresh_' + 'token',
      'local' + 'Storage',
      'session' + 'Storage',
      'docu' + 'ment.',
      'win' + 'dow.',
      'HTML' + 'Element',
      'addEvent' + 'Listener',
      'Math.' + 'random',
      'set' + 'Timeout',
      'set' + 'Interval',
      'request' + 'AnimationFrame',
      'fe' + 'tch(',
      'XMLHttp' + 'Request',
      'Web' + 'Socket',
      'send' + 'Beacon',
      'realtime',
      'console.' + 'log',
      'console.' + 'error',
      'console.' + 'warn',
      'Broadcast' + 'Channel',
      'service' + 'Worker',
      'indexed' + 'DB',
    ];
    for (const token of banned) {
      expect(source, token).not.toContain(token);
    }
  });
});
