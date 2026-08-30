// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBasicVocabularyProgressCoordinator,
  resetBasicVocabularyProgressCoordinator,
  setBasicVocabularyProgressCoordinator,
  type BasicVocabularyCoordinatorDependencies,
} from '../src/client/basicVocabularyProgressCoordinator';
import { clearBasicVocabularyAuthState } from '../src/client/basicVocabularyAccount';
import { bindBasicVocabularySyncStatus } from '../src/client/basicVocabularySyncStatusAdapter';
import type { BasicVocabularySupabaseRepository } from '../src/data/basicVocabularySupabaseRepository';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import type { StorageLike } from '../src/lib/progress';
import type {
  BasicVocabularyCloudItem,
  BasicVocabularyCloudSnapshot,
} from '../src/domain/basicVocabularySync';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import { initBasicVocabularyCatalog } from '../src/client/basicVocabularyCatalog';
import {
  loadBasicVocabularyCatalog,
} from '../src/content/basicVocabularyCatalog';
import type { BasicVocabularyCatalogItem } from '../src/content/basicVocabularyCatalog';
import { createSessionRoot, SESSION_IDS } from './helpers/basicVocabularyTestData';

vi.mock('../src/lib/supabaseBrowserClient', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

import { getSupabaseBrowserClient } from '../src/lib/supabaseBrowserClient';

const mockedGetClient = vi.mocked(getSupabaseBrowserClient);

const USER_ID = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
const OTHER_USER_ID = 'aaaa1111-2222-3333-4444-555566667777';
const RESET_ID = 'bbbb2222-3333-4444-5555-666677778888';
const USER_PROGRESS_KEY = `chabiko:basic-vocabulary-progress:user:${USER_ID}:v1`;

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class ScriptedRepository implements BasicVocabularySupabaseRepository {
  loadScript: Array<() => BasicVocabularyCloudSnapshot | Promise<BasicVocabularyCloudSnapshot>> = [];
  pushScript: Array<() => void | Promise<void>> = [];
  resetScript: Array<() => number | Promise<number>> = [];
  loadCalls = 0;
  pushCalls = 0;
  resetCalls = 0;
  pushedBatches: BasicVocabularyCloudItem[][] = [];

  loadSnapshot(): Promise<BasicVocabularyCloudSnapshot> {
    this.loadCalls += 1;
    const step = this.loadScript[Math.min(this.loadCalls - 1, this.loadScript.length - 1)];
    const result = step === undefined ? { resetGeneration: 0, items: [] } : step();
    return Promise.resolve(result);
  }

  pushMutations(
    _userId: string,
    _generation: number,
    items: readonly BasicVocabularyCloudItem[],
  ): Promise<void> {
    this.pushCalls += 1;
    this.pushedBatches.push([...items]);
    const step = this.pushScript[Math.min(this.pushCalls - 1, this.pushScript.length - 1)];
    const result = step === undefined ? undefined : step();
    return Promise.resolve(result);
  }

  reset(): Promise<number> {
    this.resetCalls += 1;
    const step = this.resetScript[Math.min(this.resetCalls - 1, this.resetScript.length - 1)];
    const result = step === undefined ? 0 : step();
    return Promise.resolve(result);
  }
}

function dependencies(options: {
  storage?: StorageLike;
  repository?: BasicVocabularySupabaseRepository | null;
  isOnline?: () => boolean;
} = {}): BasicVocabularyCoordinatorDependencies {
  const repository = options.repository === undefined ? new ScriptedRepository() : options.repository;
  return {
    storage: options.storage ?? makeStorage(),
    repository,
    isOnline: options.isOnline ?? (() => true),
    createResetId: () => RESET_ID,
  };
}

beforeEach(() => {
  clearBasicVocabularyAuthState();
  resetBasicVocabularyProgressCoordinator();
  setBasicVocabularyProgressCoordinator(null);
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/vocabulary/basic/words/');
  mockedGetClient.mockReturnValue(null as never);
});

afterEach(() => {
  clearBasicVocabularyAuthState();
  resetBasicVocabularyProgressCoordinator();
  setBasicVocabularyProgressCoordinator(null);
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/vocabulary/basic/words/');
  vi.restoreAllMocks();
});

describe('basic vocabulary progress coordinator', () => {
  it('starts guest synchronously with the guest store and no network work', () => {
    const repo = new ScriptedRepository();
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );

    expect(coordinator.getSnapshot()).toEqual({ scope: 'guest', userId: null, status: 'guest' });
    expect(coordinator.getStore().getStorageKey()).toBe(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(repo.loadCalls).toBe(0);
    expect(repo.pushCalls).toBe(0);
    coordinator.dispose();
  });

  it('switches to a user runtime on signed-in and keeps user-scoped local mode when unconfigured', () => {
    const storage = makeStorage();
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: null }),
    );

    coordinator.acceptSignedIn(USER_ID);
    expect(coordinator.getSnapshot()).toEqual({ scope: 'user', userId: USER_ID, status: 'offline' });
    expect(coordinator.getStore().getStorageKey()).toBe(USER_PROGRESS_KEY);
    coordinator.dispose();
  });

  it('signed-out returns to guest, preserving both guest and user caches', () => {
    const storage = makeStorage();
    storage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, '{"version":1,"items":{}}');
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: null }),
    );

    coordinator.acceptSignedIn(USER_ID);
    coordinator.getStore().applyRating('a', 'known');
    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();

    coordinator.acceptSignedOut();
    expect(coordinator.getSnapshot()).toEqual({ scope: 'guest', userId: null, status: 'guest' });
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).not.toBeNull();
    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();
    coordinator.dispose();
  });

  it('switches user A to user B without any reset and preserves A storage', () => {
    const storage = makeStorage();
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: null }),
    );
    const keyB = `chabiko:basic-vocabulary-progress:user:${OTHER_USER_ID}:v1`;

    coordinator.acceptSignedIn(USER_ID);
    coordinator.getStore().applyRating('a', 'known');
    coordinator.acceptSignedIn(OTHER_USER_ID);

    expect(coordinator.getSnapshot()).toEqual({ scope: 'user', userId: OTHER_USER_ID, status: 'offline' });
    expect(coordinator.getStore().getStorageKey()).toBe(keyB);
    expect(coordinator.getStore().getStatus('a')).toBe('new');
    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();
    coordinator.dispose();
  });

  it('already-published signed-in auth state is never missed by a late coordinator', async () => {
    const client = createFakeClient();
    client.auth.getSession.mockResolvedValue({
      data: {
        session: fakeSession(USER_ID, 'learner@example.com'),
      },
      error: null,
    });
    mockedGetClient.mockReturnValue(client as never);

    // The account module accepts and publishes signed-in before any
    // coordinator exists.
    const { initBasicVocabularyAccount } = await import('../src/client/basicVocabularyAccount');
    const accountRoot = document.createElement('section');
    accountRoot.dataset.basicVocabularyAccount = '';
    accountRoot.innerHTML =
      '<p data-basic-vocabulary-account-status aria-live="polite">ログイン状態を確認しています</p>' +
      '<button data-basic-vocabulary-account-action type="button" hidden>Googleでログイン</button>';
    document.body.append(accountRoot);
    initBasicVocabularyAccount(accountRoot);
    await flush();

    // A coordinator created after the state was published must pick it up.
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: null }),
    );
    expect(coordinator.getSnapshot()).toEqual({ scope: 'user', userId: USER_ID, status: 'offline' });
    coordinator.dispose();
  });

  it('initial signed-in triggers exactly one non-blocking sync', async () => {
    const repo = new ScriptedRepository();
    repo.loadScript = [() => ({ resetGeneration: 0, items: [] })];
    repo.pushScript = [() => undefined];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );

    coordinator.acceptSignedIn(USER_ID);
    // One load; the sync is non-blocking and does not await the coordinator.
    expect(repo.loadCalls).toBe(1);
    coordinator.dispose();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('an accepted rating applies locally before any deferred network and requests one sync', async () => {
    const repo = new ScriptedRepository();
    repo.loadScript = [() => ({ resetGeneration: 0, items: [] })];
    repo.pushScript = [() => undefined];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );

    coordinator.acceptSignedIn(USER_ID);
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.loadCalls).toBe(1);

    // Rate on the study side through the coordinator.
    coordinator.applyRating('a', 'known');
    // Local write happened synchronously.
    expect(coordinator.getStore().getStatus('a')).toBe('learning');
    expect(coordinator.getStore().getKnownStreak('a')).toBe(1);
    // One more sync requested (non-blocking).
    expect(repo.loadCalls).toBe(2);
    coordinator.dispose();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('a reset applies locally and requests one sync without blocking', async () => {
    const repo = new ScriptedRepository();
    repo.loadScript = [() => ({ resetGeneration: 0, items: [] })];
    repo.pushScript = [() => undefined];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );

    coordinator.acceptSignedIn(USER_ID);
    await new Promise((r) => setTimeout(r, 0));
    coordinator.getStore().applyRating('a', 'known');
    expect(coordinator.getStore().getStatus('a')).toBe('learning');

    coordinator.resetAll();
    // Local reset applied synchronously.
    expect(coordinator.getStore().getAllItems()).toEqual({});
    // The reset RPC is part of the deferred non-blocking sync: exactly one
    // reset fires, never awaited by the caller.
    expect(repo.resetCalls).toBe(1);
    coordinator.dispose();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('a signed-in unconfigured or network-failed state stays user-scoped local mode', async () => {
    // Unconfigured (no repository).
    const offlineCoordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: null }),
    );
    offlineCoordinator.acceptSignedIn(USER_ID);
    expect(offlineCoordinator.getSnapshot().scope).toBe('user');
    expect(offlineCoordinator.getSnapshot().status).toBe('offline');
    offlineCoordinator.dispose();

    // Network-failed with a repository: the runtime syncs once and the failure
    // must not fall back to the guest scope.
    const repo = new ScriptedRepository();
    repo.loadScript = [() => {
      throw new Error('network exploded');
    }];
    const netCoordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );
    netCoordinator.acceptSignedIn(USER_ID);
    expect(netCoordinator.getSnapshot().scope).toBe('user');
    await new Promise((r) => setTimeout(r, 0));
    expect(netCoordinator.getSnapshot().scope).toBe('user');
    expect(netCoordinator.getSnapshot().status).toBe('error');
    netCoordinator.dispose();
  });

  it('owns exactly one online/pageshow/storage listener set; dispose removes them', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const repo = new ScriptedRepository();
    repo.loadScript = [() => ({ resetGeneration: 0, items: [] })];
    repo.pushScript = [() => undefined];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );
    coordinator.acceptSignedIn(USER_ID);
    await new Promise((r) => setTimeout(r, 0));
    const loadsAfterInit = repo.loadCalls;

    // Exactly one listener per event is registered.
    expect(addSpy.mock.calls.filter((c) => c[0] === 'online')).toHaveLength(1);
    expect(addSpy.mock.calls.filter((c) => c[0] === 'pageshow')).toHaveLength(1);
    expect(addSpy.mock.calls.filter((c) => c[0] === 'storage')).toHaveLength(1);

    // One online event → one non-blocking sync.
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.loadCalls).toBe(loadsAfterInit + 1);

    // One pageshow event → local refresh plus one non-blocking sync for the
    // signed-in user scope (acceptance: pageshow is a sync trigger).
    const loadsAfterOnline = repo.loadCalls;
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.loadCalls).toBe(loadsAfterOnline + 1);

    // Dispose removes each listener exactly once.
    coordinator.dispose();
    expect(removeSpy.mock.calls.filter((c) => c[0] === 'online')).toHaveLength(1);
    expect(removeSpy.mock.calls.filter((c) => c[0] === 'pageshow')).toHaveLength(1);
    expect(removeSpy.mock.calls.filter((c) => c[0] === 'storage')).toHaveLength(1);

    // A later online event does nothing after disposal.
    const afterDispose = repo.loadCalls;
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.loadCalls).toBe(afterDispose);
  });

  it('late completions after dispose rewrite nothing', async () => {
    const storage = makeStorage();
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: repo }),
    );

    coordinator.acceptSignedIn(USER_ID);
    expect(repo.loadCalls).toBe(1);
    coordinator.dispose();
    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    // The late load completion observes `disposed` and rewrites nothing: no
    // user progress document and no sync-metadata row are written.
    expect(storage.getItem(USER_PROGRESS_KEY)).toBeNull();
    expect(
      storage.getItem(`chabiko:basic-vocabulary-sync-meta:user:${USER_ID}:v1`),
    ).toBeNull();
  });
});

describe('sync-status adapter', () => {
  it('writes the exact offline string for a user scope without a repository', () => {
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: null }),
    );
    coordinator.acceptSignedIn(USER_ID);
    const statusEl = document.createElement('p');
    statusEl.textContent = 'ログイン中（learner@example.com）';
    const cleanup = bindBasicVocabularySyncStatus(coordinator, statusEl);
    expect(statusEl.textContent).toBe('オフラインで保存中');
    cleanup();
    coordinator.dispose();
  });

  it('writes the syncing then synced strings for a real sync', async () => {
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );
    coordinator.acceptSignedIn(USER_ID);
    const statusEl = document.createElement('p');
    statusEl.textContent = 'ログイン中（learner@example.com）';
    bindBasicVocabularySyncStatus(coordinator, statusEl);
    // The first sync is in flight (load pending): syncing.
    expect(statusEl.textContent).toBe('同期中…');

    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    // No local dirty rows and an empty cloud snapshot: the sync completes
    // without a push and reports synced.
    expect(statusEl.textContent).toBe('同期済み');
    coordinator.dispose();
  });

  it('does not clobber the account label on a guest scope', () => {
    const coordinator = createBasicVocabularyProgressCoordinator(dependencies());
    const statusEl = document.createElement('p');
    statusEl.textContent = 'ログインすると学習記録を端末間で同期できます';
    const cleanup = bindBasicVocabularySyncStatus(coordinator, statusEl);
    // Guest scope leaves the account's own label intact.
    expect(statusEl.textContent).toBe('ログインすると学習記録を端末間で同期できます');
    cleanup();
    coordinator.dispose();
  });

  it('never writes a UUID or raw error into the region', () => {
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: null }),
    );
    coordinator.acceptSignedIn(USER_ID);
    const statusEl = document.createElement('p');
    bindBasicVocabularySyncStatus(coordinator, statusEl);
    expect(statusEl.textContent).not.toContain(USER_ID);
    expect(statusEl.textContent).not.toContain('Error');
    expect(statusEl.textContent).not.toContain('network');
    coordinator.dispose();
  });

  it('repeated identical sync states never re-announce (only writes on change)', async () => {
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ repository: repo }),
    );
    coordinator.acceptSignedIn(USER_ID);
    const statusEl = document.createElement('p');
    // Count actual writes to the polite region by shadowing the element's
    // textContent with a counting setter.
    let writes = 0;
    let value = '';
    Object.defineProperty(statusEl, 'textContent', {
      configurable: true,
      get: () => value,
      set: (next: string) => {
        value = next;
        writes += 1;
      },
    });

    bindBasicVocabularySyncStatus(coordinator, statusEl);
    // Initial write.
    expect(statusEl.textContent).toBe('同期中…');
    expect(writes).toBe(1);

    // A second identical `syncing` transition (a same-identity online refresh
    // while a sync is already in flight) must not rewrite the region.
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 0));
    expect(statusEl.textContent).toBe('同期中…');
    expect(writes).toBe(1);

    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(statusEl.textContent).toBe('同期済み');
    expect(writes).toBe(2);
    coordinator.dispose();
  });
});

// ─── Study-session integration (Issue #293) ───────────────────────────────────

describe('session identity-switch integration', () => {
  it('switching guest to a user restarts concealed, resets metrics, focuses reveal, and announces exactly once', () => {
    const storage = makeStorage();
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: null }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createSessionRoot([...SESSION_IDS]);
    const cleanup = initBasicVocabularySession(root);

    // Guest: reveal the first card and rate it.
    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 1 / 3語');

    // Switch to the signed-in user: fresh concealed session, no writes, focus
    // the first reveal, and the exact announcement span.
    coordinator.acceptSignedIn(USER_ID);
    const card = root.querySelector('[data-card]') as HTMLElement;
    expect(card.querySelector('[data-action="reveal"]')).not.toBeNull();
    expect(card.querySelector('[data-action="rate"]')).toBeNull();
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 0 / 3語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
    const ann = root.querySelector('.basic-vocabulary-sr-only');
    expect(ann?.textContent).toBe('学習記録を切り替えました');

    // The guest progress persisted untouched.
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).not.toBeNull();
    cleanup();
  });

  it('keeps the identity-switch announcement when the user runtime syncs (production path)', async () => {
    // With a configured repository the switch snapshot announces, then the
    // same-identity syncing snapshot arrives; the live-region announcement must
    // survive that re-render.
    const storage = makeStorage();
    const repo = new ScriptedRepository();
    repo.loadScript = [() => ({ resetGeneration: 0, items: [] })];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: repo }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createSessionRoot([...SESSION_IDS]);
    const cleanup = initBasicVocabularySession(root);

    // Guest rates one item so the switch visibly resets the session metrics.
    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 1 / 3語');

    // Switch to the signed-in user (configured repository = production path).
    coordinator.acceptSignedIn(USER_ID);
    await new Promise((r) => setTimeout(r, 0));

    const card = root.querySelector('[data-card]') as HTMLElement;
    expect(card.querySelector('[data-action="reveal"]')).not.toBeNull();
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 0 / 3語');
    const ann = root.querySelector('.basic-vocabulary-sr-only');
    expect(ann?.textContent).toBe('学習記録を切り替えました');
    cleanup();
  });

  it('switching user A to user B restarts concealed without reset or write', () => {
    const storage = makeStorage();
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: null }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createSessionRoot([...SESSION_IDS]);
    const cleanup = initBasicVocabularySession(root);

    coordinator.acceptSignedIn(USER_ID);
    // User A rates one item.
    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 1 / 3語');
    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();

    // Switch to user B: fresh concealed session focused on the first reveal.
    coordinator.acceptSignedIn(OTHER_USER_ID);
    const card = root.querySelector('[data-card]') as HTMLElement;
    expect(card.querySelector('[data-action="reveal"]')).not.toBeNull();
    expect(card.querySelector('[data-action="rate"]')).toBeNull();
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 0 / 3語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
    // A's storage is preserved, B starts from empty.
    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();
    const keyB = `chabiko:basic-vocabulary-progress:user:${OTHER_USER_ID}:v1`;
    expect(storage.getItem(keyB)).toBeNull();
    cleanup();
  });

  it('a same-identity post-rating sync updates the summary without teleporting the card', async () => {
    const storage = makeStorage();
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: repo }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createSessionRoot([...SESSION_IDS]);
    const cleanup = initBasicVocabularySession(root);

    coordinator.acceptSignedIn(USER_ID);
    const cardBefore = root.querySelector('[data-card]')?.textContent;
    expect(cardBefore).toContain('大家');

    // Rate through the session: local write, sync requested non-blocking.
    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');

    // Resolve the initial load; the same-identity sync completes without
    // teleporting the active card/queue/reveal/focus.
    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 1 / 3語');
    expect(storage.getItem(USER_PROGRESS_KEY)).not.toBeNull();
    cleanup();
  });

  it('network never delays reveal, rating, or continue while signed in', async () => {
    const storage = makeStorage();
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: repo }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createSessionRoot([...SESSION_IDS]);
    const cleanup = initBasicVocabularySession(root);

    coordinator.acceptSignedIn(USER_ID);
    // The initial sync is in flight (load pending); learning must proceed.
    for (let i = 0; i < SESSION_IDS.length; i++) {
      reveal(root);
      rate(root, 'known');
      if (root.querySelector('[data-action="continue"]')) break;
    }
    expect(root.textContent).toContain('今回の3語を完了しました');
    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    cleanup();
  });
});

// ─── Catalog integration (Issue #293) ─────────────────────────────────────────

describe('catalog coordinator integration', () => {
  function createCatalogRoot(
    items: readonly BasicVocabularyCatalogItem[],
  ): HTMLElement {
    const root = document.createElement('section');
    root.dataset.basicVocabularyCatalog = '';
    root.innerHTML =
      '<div class="basic-vocabulary-catalog-controls">' +
      '<input id="basic-vocabulary-catalog-search" data-catalog-search type="search">' +
      '<select id="basic-vocabulary-catalog-status" data-catalog-status>' +
      '<option value="all">すべて</option>' +
      '<option value="new">新規</option>' +
      '<option value="learning">学習中</option>' +
      '<option value="learned">習得済み</option>' +
      '</select>' +
      '<select id="basic-vocabulary-catalog-part-of-speech" data-catalog-part-of-speech>' +
      '<option value="all">すべて</option>' +
      '<option value="noun">名詞</option>' +
      '<option value="verb">動詞</option>' +
      '<option value="adjective">形容詞</option>' +
      '<option value="adverb">副詞</option>' +
      '</select>' +
      '</div>' +
      '<p data-catalog-summary aria-live="polite"></p>' +
      '<ol data-catalog-results></ol>' +
      '<button data-catalog-page="previous" type="button">前へ</button>' +
      '<span data-catalog-page-indicator>1 / 1</span>' +
      '<button data-catalog-page="next" type="button">次へ</button>' +
      `<script type="application/json" id="basic-vocabulary-catalog-data">${JSON.stringify(items)}</script>`;
    document.body.append(root);
    return root;
  }

  function cardBadges(root: HTMLElement): string[] {
    return [...root.querySelectorAll<HTMLElement>('[data-status]')].map(
      (el) => el.textContent ?? '',
    );
  }

  it('browsing never mutates or requests while bound to the coordinator store', () => {
    const items = loadBasicVocabularyCatalog();
    const storage = makeStorage();
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: null }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);
    coordinator.acceptSignedIn(USER_ID);

    const root = createCatalogRoot(items);
    const cleanup = initBasicVocabularyCatalog(root);

    // All items read as new through the user store.
    expect(cardBadges(root).every((b) => b === '新規')).toBe(true);

    // Browse: search + status filter + pagination. No rating, reset, dirty
    // mutation, or network request.
    const search = root.querySelector<HTMLInputElement>('[data-catalog-search]')!;
    search.value = '大家';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('[data-catalog-summary]')?.textContent).toContain('1語');
    const badge = root.querySelector<HTMLElement>('[data-status]');
    expect(badge?.textContent).toBe('新規');

    // No user progress document was created by browsing.
    expect(storage.getItem(USER_PROGRESS_KEY)).toBeNull();
    cleanup();
  });

  it('an identity/sync refresh recomputes status badges while preserving search/filter/page/focus', async () => {
    const items = loadBasicVocabularyCatalog().slice(0, 5);
    const storage = makeStorage();
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: repo }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createCatalogRoot(items);
    const cleanup = initBasicVocabularyCatalog(root);
    const partOfSpeech = root.querySelector<HTMLSelectElement>(
      '[data-catalog-part-of-speech]',
    )!;
    partOfSpeech.value = items[0].partOfSpeech;
    partOfSpeech.dispatchEvent(new Event('change'));
    partOfSpeech.focus();

    coordinator.acceptSignedIn(USER_ID);
    // Complete the initial sync so the runtime is idle and further syncs
    // transition through `syncing` (delivering a snapshot to the catalog).
    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(cardBadges(root).every((b) => b === '新規')).toBe(true);

    // Apply a rating via the coordinator store (as the study side would).
    coordinator.applyRating(items[0].learnerId, 'known');
    expect(cardBadges(root)[0]).toBe('学習中');
    expect(partOfSpeech.value).toBe(items[0].partOfSpeech);
    expect(document.activeElement).toBe(partOfSpeech);

    // The sync completion re-renders badges; browsing state is preserved.
    expect(cardBadges(root)[0]).toBe('学習中');
    cleanup();
  });

  it('browsing can never leak another identity status', async () => {
    const items = loadBasicVocabularyCatalog().slice(0, 5);
    const storage = makeStorage();
    const repo = new ScriptedRepository();
    const load = deferred<BasicVocabularyCloudSnapshot>();
    repo.loadScript = [() => load.promise];
    const coordinator = createBasicVocabularyProgressCoordinator(
      dependencies({ storage, repository: repo }),
    );
    setBasicVocabularyProgressCoordinator(coordinator);

    const root = createCatalogRoot(items);
    const cleanup = initBasicVocabularyCatalog(root);

    // User A learns one item.
    coordinator.acceptSignedIn(USER_ID);
    load.resolve({ resetGeneration: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));
    coordinator.applyRating(items[0].learnerId, 'known');
    expect(cardBadges(root)[0]).toBe('学習中');

    // Switch to user B: the catalog re-reads B's empty store.
    coordinator.acceptSignedIn(OTHER_USER_ID);
    expect(cardBadges(root).every((b) => b === '新規')).toBe(true);
    cleanup();
  });
});

// ─── Fake Supabase client helpers (mirror of basic-vocabulary-google-auth) ────

function fakeSession(userId: string, email: string | null): unknown {
  return {
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-token-value',
    user: {
      id: userId,
      email,
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: 'Test User' },
    },
  };
}

function createFakeClient(): {
  auth: {
    getSession: ReturnType<typeof vi.fn>;
    signInWithOAuth: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
  };
} {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: 'google' }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: () => undefined,
          },
        },
      })),
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  (root.querySelector(`[data-rating="${rating}"]`) as HTMLButtonElement).click();
}
