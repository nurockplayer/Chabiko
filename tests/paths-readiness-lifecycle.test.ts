// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseBrowserClient', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));
import { getSupabaseBrowserClient } from '../src/lib/supabaseBrowserClient';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
} from '../src/domain/basicVocabularyProgress';
import { ProgressStore, STORAGE_KEY } from '../src/lib/progress';
import { VOCABULARY_PROGRESS_KEY, VocabularyProgressStore } from '../src/domain/vocabularyProgress';
import { loadLearningPaths } from '../src/content/loadLearningPaths';
import {
  getBasicVocabularyProgressStorageKey,
  type BasicVocabularyProgressScope,
} from '../src/domain/basicVocabularyProgressScope';
import {
  initPathsReadiness,
  type PathsProgressPayload,
} from '../src/client/pathsReadiness';

// ─── Test harness ──────────────────────────────────────────────────────────────

const cleanups = new Set<() => void>();

const document_ = loadLearningPaths();

/** Build the route root exactly as the /paths/ page renders it: each card plus
 * the Travel Quest readiness section, driven by the frozen loader contract. */
function createRoot(): HTMLElement {
  const root = document.createElement('div');
  root.dataset.pathsRoot = '';
  const paths = document_.learningPaths;
  root.innerHTML =
    '<section class="paths-page">' +
    '<ol class="paths-list">' +
    paths
      .map(
        (path) =>
          `<li class="paths-list-item" data-path-id="${path.id}">` +
          `<a class="learning-path-card" data-path-availability="${path.availability}">` +
          `<span class="learning-path-card__label">${path.labelJa}</span>` +
          (path.members.length > 0
            ? `<span class="learning-path-card__progress" data-path-progress aria-live="polite">0 / ${path.members.length}</span>`
            : '') +
          '</a></li>',
      )
      .join('') +
    '</ol>' +
    '</section>' +
    '<section class="readiness-section" data-readiness-section>' +
    '<ol class="readiness-list">' +
    ['navigate-arrival', 'order-and-pay', 'stay-and-ask', 'recover-and-get-help']
      .map(
        (targetId) =>
          `<li data-readiness-target="${targetId}">` +
          `<span data-readiness-status data-status="not-started">未開始</span>` +
          `<span data-readiness-count>0 / 0</span>` +
          `<span data-readiness-percent>0%</span>` +
          `<span data-readiness-note hidden>note</span>` +
          '</li>',
      )
      .join('') +
    '</ol>' +
    '</section>';
  document.body.append(root);
  return root;
}

function payload(): PathsProgressPayload {
  return {
    paths: document_.learningPaths.map((path) => ({
      id: path.id,
      members: path.members,
    })),
  };
}

function initialize(root: HTMLElement): () => void {
  const cleanup = initPathsReadiness(root, payload());
  cleanups.add(cleanup);
  return cleanup;
}

function setLessonCompleted(id: string): void {
  const store = new ProgressStore();
  store.markComplete(id);
}

function setBasicLearned(id: string): void {
  const store = new BasicVocabularyProgressStore();
  store.applyRating(id, 'known');
  store.applyRating(id, 'known');
}

function setHskLearned(id: string): void {
  const store = new VocabularyProgressStore();
  store.applyRating(id, 'known');
  store.applyRating(id, 'known');
}

function dispatchStorage(key: string | null, storageArea: Storage | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', { key, oldValue: null, newValue: 'x', storageArea }),
  );
}

function cardProgress(root: HTMLElement, pathId: string): string | null {
  const card = root.querySelector<HTMLElement>(`[data-path-id="${pathId}"]`);
  return card?.querySelector<HTMLElement>('[data-path-progress]')?.textContent ?? null;
}

// ─── Fake Supabase auth client (Sol decision: route-local read-only) ──────────

type AuthListener = (event: string, session: unknown) => void;

interface FakeAuthClient {
  getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }>;
  onAuthStateChange: (listener: AuthListener) => {
    data: { subscription: { unsubscribe: () => void } };
  };
}

/** Build a fake Supabase auth client plus a trigger for auth events. */
function fakeSupabaseClient(initialUserId: string | null): {
  client: { auth: FakeAuthClient };
  emit: (event: string, session: unknown) => void;
  deferNextGetSession: () => (session: { user: { id: string } } | null) => void;
} {
  let currentSession: { user: { id: string } } | null =
    initialUserId !== null ? { user: { id: initialUserId } } : null;
  let pendingResolve: ((session: { user: { id: string } } | null) => void) | null =
    null;
  let deferNext = false;
  const listeners = new Set<AuthListener>();
  return {
    client: {
      auth: {
        getSession: async () => {
          if (deferNext) {
            deferNext = false;
            const session = await new Promise<{ user: { id: string } } | null>(
              (resolve) => {
                pendingResolve = resolve;
              },
            );
            return { data: { session } };
          }
          return { data: { session: currentSession } };
        },
        onAuthStateChange: (listener: AuthListener) => {
          listeners.add(listener);
          return {
            data: {
              subscription: {
                unsubscribe: () => listeners.delete(listener),
              },
            },
          };
        },
      },
    },
    emit: (event: string, session: unknown) => {
      currentSession = (session ?? null) as { user: { id: string } } | null;
      for (const listener of [...listeners]) listener(event, session);
    },
    deferNextGetSession: () => {
      deferNext = true;
      return (session: { user: { id: string } } | null) => {
        if (pendingResolve !== null) pendingResolve(session);
      };
    },
  };
}

/** Wait a macrotask so the async session read + render settle. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function target(root: HTMLElement, id: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-readiness-target="${id}"]`)!;
}

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.mocked(getSupabaseBrowserClient).mockReset();
});

// ─── Initial SSR-equivalent rendering ─────────────────────────────────────────

describe('initial render', () => {
  it('renders empty path progress and not-started readiness with fixed denominators', () => {
    const root = createRoot();
    initialize(root);

    // Taiwan travel has 14 members, none complete.
    expect(cardProgress(root, 'taiwan-travel')).toContain('0 / 14');
    expect(cardProgress(root, 'hsk-vocabulary')).toContain('0 / 5');
    // kanji-bridge has no members → no progress element.
    expect(cardProgress(root, 'kanji-bridge')).toBeNull();

    // Every target is not-started with its fixed denominator, and the
    // phrase/roleplay-only evidence shows the unavailable note.
    const navigate = target(root, 'navigate-arrival');
    expect(navigate.querySelector('[data-readiness-status]')?.textContent).toBe('未開始');
    expect(navigate.querySelector('[data-readiness-status]')?.getAttribute('data-status')).toBe('not-started');
    expect(navigate.querySelector('[data-readiness-count]')?.textContent).toBe('0 / 3');
    expect(navigate.querySelector('[data-readiness-percent]')?.textContent).toBe('0%');
    expect((navigate.querySelector('[data-readiness-note]') as HTMLElement).hidden).toBe(false);

    // order-and-pay has 5 required evidence items.
    const order = target(root, 'order-and-pay');
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('0 / 5');
  });

  it('does not write to any progress storage key', () => {
    const root = createRoot();
    const before = JSON.stringify(window.localStorage);
    initialize(root);
    expect(JSON.stringify(window.localStorage)).toBe(before);
  });
});

// ─── Lesson/vocabulary signals drive readiness and path progress ─────────────

describe('progress signals', () => {
  it('reflects completed lessons and learned vocabulary in readiness', async () => {
    // Signed-out identity resolves the guest store, so guest progress counts.
    const { client } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    initialize(root);

    setLessonCompleted('lesson-001');
    setLessonCompleted('lesson-002');
    setHskLearned('hsk-001');
    setBasicLearned('teacher-star-1-bdc7865a507e');
    window.dispatchEvent(new Event('pageshow'));
    await flushAsync();

    const order = target(root, 'order-and-pay');
    // lesson-001 + lesson-002 + vocabulary session → 3 of 5.
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('3 / 5');
    expect(order.querySelector('[data-readiness-status]')?.textContent).toBe('進行中');
    expect(order.querySelector('[data-readiness-status]')?.getAttribute('data-status')).toBe('in-progress');
  });

  it('ready requires every declared evidence and is never inflated by passive view', () => {
    const root = createRoot();
    initialize(root);

    // Passive view keys and non-declared IDs never count.
    setLessonCompleted('lesson-004');
    setLessonCompleted('lesson-005');
    setHskLearned('hsk-002');
    window.dispatchEvent(new Event('pageshow'));
    const recover = target(root, 'recover-and-get-help');
    // recover needs phrase + roleplay only → both unavailable → never ready.
    expect(recover.querySelector('[data-readiness-count]')?.textContent).toBe('0 / 2');
    expect(recover.querySelector('[data-readiness-status]')?.textContent).toBe('未開始');
  });

  it('drives path-level partial/complete summaries from stable members', async () => {
    const { client } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    initialize(root);

    // taiwan-travel: complete lesson-001..003 and learned voc-001..004, but the
    // phrase members never count → partial (never complete).
    for (const id of ['lesson-001', 'lesson-002', 'lesson-003']) setLessonCompleted(id);
    for (const id of ['voc-001', 'voc-002', 'voc-003', 'voc-004']) setBasicLearned(id);
    window.dispatchEvent(new Event('pageshow'));
    await flushAsync();

    expect(cardProgress(root, 'taiwan-travel')).toBe('7 / 14 進行中');

    // HSK path: learn all five members → complete.
    for (const id of ['hsk-001', 'hsk-002', 'hsk-003', 'hsk-004', 'hsk-005']) {
      setHskLearned(id);
    }
    window.dispatchEvent(new Event('pageshow'));
    expect(cardProgress(root, 'hsk-vocabulary')).toBe('5 / 5 完了');
  });

  it('reads the user-scoped basic-vocabulary store on direct /paths/ load (signed-in session)', async () => {
    const userId = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const { client } = fakeSupabaseClient(userId);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    initialize(root);

    // A learner-rated item under the user key, not the guest key.
    const userScope: BasicVocabularyProgressScope = { kind: 'user', userId };
    const userStore = new BasicVocabularyProgressStore(
      window.localStorage,
      getBasicVocabularyProgressStorageKey(userScope),
    );
    userStore.applyRating('teacher-star-1-bdc7865a507e', 'known');
    userStore.applyRating('teacher-star-1-bdc7865a507e', 'known');

    // Await the async getSession → render.
    await flushAsync();
    const order = target(root, 'order-and-pay');
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('1 / 5');
  });

  it('re-renders on login/logout/user switch via auth state changes', async () => {
    const userA = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const userB = 'aa0e8c7d-3b5f-4e8a-9a2c-7d6f5e4b3a2c';
    const { client, emit } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    initialize(root);
    await flushAsync();

    // Guest start: guest progress counts (empty → 0/5).
    expect(target(root, 'order-and-pay').querySelector('[data-readiness-count]')?.textContent).toBe('0 / 5');

    // Login as userA → user-scoped progress counts.
    const scopeA: BasicVocabularyProgressScope = { kind: 'user', userId: userA };
    const storeA = new BasicVocabularyProgressStore(
      window.localStorage,
      getBasicVocabularyProgressStorageKey(scopeA),
    );
    storeA.applyRating('teacher-star-1-bdc7865a507e', 'known');
    storeA.applyRating('teacher-star-1-bdc7865a507e', 'known');
    emit('SIGNED_IN', { user: { id: userA } });
    expect(target(root, 'order-and-pay').querySelector('[data-readiness-count]')?.textContent).toBe('1 / 5');

    // Switch to userB → their (empty) scoped progress counts.
    storeA.applyRating('other-id', 'known'); // write to A, must not count for B
    emit('SIGNED_IN', { user: { id: userB } });
    expect(target(root, 'order-and-pay').querySelector('[data-readiness-count]')?.textContent).toBe('0 / 5');

    // Logout → guest progress counts.
    emit('SIGNED_OUT', null);
    expect(target(root, 'order-and-pay').querySelector('[data-readiness-count]')?.textContent).toBe('0 / 5');
  });

  it('never writes progress, sync metadata, or cloud state merely from viewing', async () => {
    const userId = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const { client } = fakeSupabaseClient(userId);
    const repository = { reset: vi.fn(), push: vi.fn(), load: vi.fn() };
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();

    const before = JSON.stringify(window.localStorage);
    initialize(root);
    await flushAsync();
    window.dispatchEvent(new Event('pageshow'));
    dispatchStorage(STORAGE_KEY, window.localStorage);

    expect(JSON.stringify(window.localStorage)).toBe(before);
    expect(repository.reset).not.toHaveBeenCalled();
    expect(repository.push).not.toHaveBeenCalled();
    expect(repository.load).not.toHaveBeenCalled();
  });

  it('guests read the guest store without a coordinator', async () => {
    const { client } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    initialize(root);
    await flushAsync();
    setBasicLearned('teacher-star-1-bdc7865a507e');
    window.dispatchEvent(new Event('pageshow'));
    const order = target(root, 'order-and-pay');
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('1 / 5');
  });

  it('reads the guest store when no Supabase client is configured (guest-only mode)', async () => {
    // No Supabase config (getSupabaseBrowserClient returns null) is the
    // supported guest-only production mode: /paths/ reads the guest store.
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(null as never);
    const root = createRoot();
    initialize(root);
    setBasicLearned('teacher-star-1-bdc7865a507e');
    window.dispatchEvent(new Event('pageshow'));
    const order = target(root, 'order-and-pay');
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('1 / 5');
  });

  it('ignores a stale initial getSession after a newer auth event', async () => {
    const userId = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const { client, emit, deferNextGetSession } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();

    // Defer the NEXT getSession (i.e. the initial one, before initialize calls
    // it synchronously). Before it resolves, a SIGNED_OUT event arrives and
    // pins the guest scope. The stale getSession later resolves a signed-in
    // session — it must NOT flip identity back.
    const resolveSession = deferNextGetSession();
    initialize(root);
    emit('SIGNED_OUT', null);
    resolveSession({ user: { id: userId } });
    await flushAsync();

    // Identity stays signed-out: a guest store read is used, so a guest learned
    // item counts.
    setBasicLearned('teacher-star-1-bdc7865a507e');
    window.dispatchEvent(new Event('pageshow'));
    const order = target(root, 'order-and-pay');
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('1 / 5');
  });
});

// ─── Storage refresh and cleanup ──────────────────────────────────────────────

describe('storage and pageshow refresh', () => {
  it('refreshes on the exact lesson, HSK, and basic-vocabulary storage keys', async () => {
    const { client } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    initialize(root);
    await flushAsync();

    setLessonCompleted('lesson-001');
    dispatchStorage(STORAGE_KEY, window.localStorage);
    expect(cardProgress(root, 'taiwan-travel')).toContain('1 / 14');

    setHskLearned('hsk-001');
    dispatchStorage(VOCABULARY_PROGRESS_KEY, window.localStorage);
    expect(cardProgress(root, 'hsk-vocabulary')).toContain('1 / 5');

    setBasicLearned('teacher-star-1-bdc7865a507e');
    dispatchStorage(BASIC_VOCABULARY_PROGRESS_KEY, window.localStorage);
    // order-and-pay requires lesson-001 (already completed above) plus the
    // vocabulary session → 2 of 5.
    expect(target(root, 'order-and-pay').querySelector('[data-readiness-count]')?.textContent).toBe('2 / 5');
  });

  it('ignores unrelated storage keys', () => {
    const root = createRoot();
    initialize(root);
    setLessonCompleted('lesson-001');
    dispatchStorage('chabiko:unrelated', window.localStorage);
    expect(cardProgress(root, 'taiwan-travel')).toContain('0 / 14');
  });

  it('cleanup removes listeners; events after cleanup are no-ops', () => {
    const root = createRoot();
    const cleanup = initialize(root);
    cleanup();
    cleanups.delete(cleanup);

    setLessonCompleted('lesson-001');
    window.dispatchEvent(new Event('pageshow'));
    expect(cardProgress(root, 'taiwan-travel')).toContain('0 / 14');
  });

  it('reinitializing runs prior cleanup and does not duplicate renders', () => {
    const root = createRoot();
    initialize(root);
    setLessonCompleted('lesson-001');
    window.dispatchEvent(new Event('pageshow'));
    expect(cardProgress(root, 'taiwan-travel')).toContain('1 / 14');

    // Re-init: prior cleanup runs; the card still reflects storage exactly once.
    initialize(root);
    expect(cardProgress(root, 'taiwan-travel')).toContain('1 / 14');
  });

  it('ignores a late getSession reply after cleanup (disposal-safe)', async () => {
    const userId = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const { client, deferNextGetSession } = fakeSupabaseClient(null);
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    const root = createRoot();
    const cleanup = initialize(root);

    // The initial getSession is deferred; before it resolves, cleanup runs.
    const resolveSession = deferNextGetSession();
    cleanup();
    cleanups.delete(cleanup);

    // Late reply resolves a signed-in session after cleanup — must not re-render
    // into the released root or flip identity.
    resolveSession({ user: { id: userId } });
    await flushAsync();

    // The root's readiness stays at the SSR-empty default (no basic-vocabulary
    // evidence), and no signed-in identity leaked into the DOM.
    expect(target(root, 'order-and-pay').querySelector('[data-readiness-count]')?.textContent).toBe('0 / 5');
  });
});

// ─── Malformed storage fallback ───────────────────────────────────────────────

describe('malformed storage', () => {
  it('falls back to empty progress on malformed lesson/vocabulary storage', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ not json');
    window.localStorage.setItem(VOCABULARY_PROGRESS_KEY, 'garbage');
    window.localStorage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, '[[[');

    const root = createRoot();
    initialize(root);

    expect(cardProgress(root, 'taiwan-travel')).toContain('0 / 14');
    const order = target(root, 'order-and-pay');
    expect(order.querySelector('[data-readiness-count]')?.textContent).toBe('0 / 5');
  });
});
