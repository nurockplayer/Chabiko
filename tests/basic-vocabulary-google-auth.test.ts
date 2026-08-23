// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASIC_VOCABULARY_AUTH_EVENT,
  type BasicVocabularyAuthState,
  clearBasicVocabularyAuthState,
  getBasicVocabularyAuthState,
  initBasicVocabularyAccount,
  subscribeBasicVocabularyAuthState,
} from '../src/client/basicVocabularyAccount';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../src/domain/basicVocabularyProgress';

vi.mock('../src/lib/supabaseBrowserClient', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

import { getSupabaseBrowserClient } from '../src/lib/supabaseBrowserClient';

const mockedGetClient = vi.mocked(getSupabaseBrowserClient);

// ─── Test doubles ────────────────────────────────────────────────────────────

const RETURN_PATH_KEY = 'chabiko:auth-return-path:v1';
const CANONICAL_USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PROGRESS_KEY = 'chabiko:some-unrelated-key:v1';
const SCRIPT_PREFERENCE_KEY = 'chabiko.script-preference.v1';
const SYNC_METADATA_KEY = 'chabiko:sync-metadata:v1';

const FAKE_JWT = 'header.payload.signature';
const FAKE_SUBJECT = 'google-subject-123';
const FAKE_AVATAR = 'https://example.com/avatar.png';
const FAKE_NAME = 'Test User';

interface FakeAuthApi {
  getSession: ReturnType<typeof vi.fn>;
  signInWithOAuth: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
}

interface FakeClient {
  auth: FakeAuthApi;
}

type Listener = (event: string, session: unknown) => void;

let authListeners: Listener[] = [];
let subscriptionCount = 0;

function createFakeClient(): FakeClient {
  const auth: FakeAuthApi = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/' },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((listener: Listener) => {
      authListeners.push(listener);
      subscriptionCount++;
      return {
        data: {
          subscription: {
            unsubscribe: () => undefined,
          },
        },
      };
    }),
  };
  return { auth };
}

function fakeSession(userId: string, email: string | null): unknown {
  return {
    access_token: FAKE_JWT,
    refresh_token: 'refresh-token-value',
    provider_token: 'provider-token-value',
    provider_refresh_token: 'provider-refresh-token-value',
    user: {
      id: userId,
      email,
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { full_name: FAKE_NAME, avatar_url: FAKE_AVATAR },
      identities: [{ id: FAKE_SUBJECT, provider: 'google' }],
    },
  };
}

function createAccountRoot(): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyAccount = '';
  root.innerHTML =
    '<p data-basic-vocabulary-account-status aria-live="polite">ログイン状態を確認しています</p>' +
    '<button data-basic-vocabulary-account-action type="button" hidden>Googleでログイン</button>';
  document.body.append(root);
  return root;
}

function statusText(root: HTMLElement): string {
  return root.querySelector('[data-basic-vocabulary-account-status]')?.textContent ?? '';
}

function actionButton(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('[data-basic-vocabulary-account-action]');
  if (!button) throw new Error('action button missing');
  return button;
}

function rootText(root: HTMLElement): string {
  return root.textContent ?? '';
}

function collectEvents(root: HTMLElement): Array<Pick<BasicVocabularyAuthState, 'kind'>> {
  const events: Array<Pick<BasicVocabularyAuthState, 'kind'>> = [];
  root.addEventListener(BASIC_VOCABULARY_AUTH_EVENT, (e) => {
    events.push((e as CustomEvent<Pick<BasicVocabularyAuthState, 'kind'>>).detail);
  });
  return events;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Creates a root and initializes the account with the given fake client. */
async function initRoot(options: {
  client?: FakeClient;
  getSession?: () => Promise<{ data: { session: unknown }; error: null }>;
  signIn?: () => Promise<unknown>;
  signOut?: () => Promise<unknown>;
  pathname?: string;
} = {}): Promise<{ root: HTMLElement; client: FakeClient; cleanup: () => void }> {
  const client = options.client ?? createFakeClient();
  if (options.getSession) client.auth.getSession.mockImplementation(options.getSession);
  if (options.signIn) client.auth.signInWithOAuth.mockImplementation(options.signIn);
  if (options.signOut) client.auth.signOut.mockImplementation(options.signOut);
  mockedGetClient.mockReturnValue(client as never);
  if (options.pathname) window.history.replaceState(null, '', options.pathname);
  const root = createAccountRoot();
  const cleanup = initBasicVocabularyAccount(root);
  await flush();
  return { root, client, cleanup };
}

beforeEach(() => {
  authListeners = [];
  subscriptionCount = 0;
});

afterEach(() => {
  mockedGetClient.mockReset();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

// ─── Route placement and root contract ───────────────────────────────────────

describe('route placement', () => {
  it('renders exactly one account on the study route, after heading/navigation and before the session', async () => {
    const route = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    expect(route.match(/<BasicVocabularyAccount/g)).toHaveLength(1);

    const h1End = route.indexOf('</h1>');
    const linkStart = route.indexOf(
      'href="/vocabulary/basic/words/">単語一覧を見る',
    );
    const accountStart = route.indexOf('<BasicVocabularyAccount');
    const sessionStart = route.indexOf('<BasicVocabularySession');
    expect(h1End).toBeGreaterThan(0);
    expect(linkStart).toBeGreaterThan(h1End);
    expect(accountStart).toBeGreaterThan(linkStart);
    expect(sessionStart).toBeGreaterThan(accountStart);
  });

  it('renders exactly one account on the catalog route, after heading and before the catalog component', async () => {
    const route = await readFile('src/pages/vocabulary/basic/words/index.astro', 'utf8');
    expect(route.match(/<BasicVocabularyAccount/g)).toHaveLength(1);

    const h1End = route.indexOf('</h1>');
    const accountStart = route.indexOf('<BasicVocabularyAccount');
    const catalogStart = route.indexOf('<BasicVocabularyCatalog');
    expect(h1End).toBeGreaterThan(0);
    expect(accountStart).toBeGreaterThan(h1End);
    expect(catalogStart).toBeGreaterThan(accountStart);
  });

  it('the account component renders exactly one data root with a live region and a native button', async () => {
    const component = await readFile(
      'src/components/vocabulary/BasicVocabularyAccount.astro',
      'utf8',
    );
    // Exactly one rendered root element; the second occurrence is the
    // client bootstrap's querySelectorAll selector.
    expect(component.match(/data-basic-vocabulary-account>/g)).toHaveLength(1);
    expect(component.match(/\[data-basic-vocabulary-account\]/g)).toHaveLength(2);
    expect(component).toContain(
      '<section class="basic-vocabulary-account" data-basic-vocabulary-account>',
    );
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('<button');
    expect(component).toContain('type="button"');
    expect(component).toContain('ログイン状態を確認しています');
  });

  it('the routes keep exactly one session/catalog component and no duplicated account markup', async () => {
    const study = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const catalog = await readFile('src/pages/vocabulary/basic/words/index.astro', 'utf8');
    expect(study.match(/data-basic-vocabulary-account/g)).toBeNull();
    expect(catalog.match(/data-basic-vocabulary-account/g)).toBeNull();
    expect(study.match(/<BasicVocabularySession/g)).toHaveLength(1);
    expect(catalog.match(/<BasicVocabularyCatalog/g)).toHaveLength(1);
  });
});

// ─── State copy ──────────────────────────────────────────────────────────────

describe('account states and exact copy', () => {
  it('renders the unconfigured state with no action, no network, and no event duplication', async () => {
    mockedGetClient.mockReturnValue(null);
    const root = createAccountRoot();
    const events = collectEvents(root);
    initBasicVocabularyAccount(root);
    await flush();

    expect(statusText(root)).toBe('ログイン機能は現在利用できません');
    expect(actionButton(root).hidden).toBe(true);
    expect(rootText(root)).not.toContain('Googleでログイン');
    expect(rootText(root)).not.toContain('ログアウト');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: 'unavailable' });
  });

  it('renders loading, then signed-out with the exact explanation and one sign-in button', async () => {
    const { root } = await initRoot();
    expect(statusText(root)).toBe('ログインすると学習記録を端末間で同期できます');
    const button = actionButton(root);
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe('Googleでログイン');
    expect(root.querySelectorAll('button')).toHaveLength(1);
  });

  it('renders the signed-in state with truthful email and one sign-out button, no avatar/name/uuid/provider', async () => {
    const { root } = await initRoot({
      getSession: () =>
        Promise.resolve({
          data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
          error: null,
        }),
    });
    expect(statusText(root)).toBe('ログイン中（learner@example.com）');
    const button = actionButton(root);
    expect(button.textContent).toBe('ログアウト');
    expect(root.querySelectorAll('button')).toHaveLength(1);
    expect(rootText(root)).not.toContain(FAKE_NAME);
    expect(rootText(root)).not.toContain(CANONICAL_USER_ID);
    expect(rootText(root)).not.toContain(FAKE_SUBJECT);
    expect(rootText(root)).not.toContain(FAKE_AVATAR);
    expect(rootText(root)).not.toMatch(/google|Google/);
  });

  it('publishes an immutable signed-in state that subscribers cannot change', async () => {
    clearBasicVocabularyAuthState();
    const observed: BasicVocabularyAuthState[] = [];
    const unsubscribe = subscribeBasicVocabularyAuthState((state) => observed.push(state));
    await initRoot({
      getSession: () =>
        Promise.resolve({
          data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
          error: null,
        }),
    });

    const signedIn = observed.at(-1);
    expect(signedIn?.kind).toBe('signed-in');
    expect(Object.isFrozen(signedIn)).toBe(true);
    expect(Reflect.set(signedIn as object, 'userId', '22222222-2222-2222-2222-222222222222')).toBe(
      false,
    );
    expect(getBasicVocabularyAuthState()).toEqual({
      kind: 'signed-in',
      userId: CANONICAL_USER_ID,
      email: 'learner@example.com',
    });
    unsubscribe();
    clearBasicVocabularyAuthState();
  });

  it('omits the email fragment when the session email is absent', async () => {
    const { root } = await initRoot({
      getSession: () =>
        Promise.resolve({ data: { session: fakeSession(CANONICAL_USER_ID, null) }, error: null }),
    });
    expect(statusText(root)).toBe('ログイン中');
  });

  it('shows the safe error copy after a failed initial session read, without raw errors', async () => {
    const { root } = await initRoot({
      getSession: () => Promise.reject(new Error('network exploded with secret detail')),
    });
    expect(statusText(root)).toBe('ログイン状態を確認できませんでした');
    expect(rootText(root)).not.toContain('network exploded');
    expect(rootText(root)).not.toContain('secret');
  });
});

// ─── Google sign-in contract ─────────────────────────────────────────────────

describe('Google sign-in contract', () => {
  it('calls signInWithOAuth exactly once with google and the exact redirect, and stores the allowlisted path', async () => {
    const { root, client, cleanup } = await initRoot({ pathname: '/vocabulary/basic/words/' });

    actionButton(root).click();
    await flush();

    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback/`,
      },
    });
    expect(window.sessionStorage.getItem(RETURN_PATH_KEY)).toBe('/vocabulary/basic/words/');
    cleanup();
  });

  it('disables the button in-flight and suppresses duplicate clicks', async () => {
    let resolveSignIn: (value: unknown) => void = () => undefined;
    const client = createFakeClient();
    client.auth.signInWithOAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const { root, cleanup } = await initRoot({ client, pathname: '/vocabulary/basic/' });

    const button = actionButton(root);
    button.click();
    expect(button.disabled).toBe(true);
    button.click();
    button.click();
    resolveSignIn({
      data: { provider: 'google', url: 'https://accounts.google.com/' },
      error: null,
    });
    await flush();

    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('falls back to the fallback return path when sessionStorage is unavailable, without throwing', async () => {
    const client = createFakeClient();
    const { root, cleanup } = await initRoot({ client, pathname: '/vocabulary/basic/' });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    actionButton(root).click();
    await flush();

    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    cleanup();
  });

  it('never starts OAuth from a non-allowlisted pathname and shows safe error copy', async () => {
    const { root, client, cleanup } = await initRoot({ pathname: '/somewhere/else/' });

    actionButton(root).click();
    await flush();

    expect(client.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(statusText(root)).toBe('ログイン状態を確認できませんでした');
    cleanup();
  });

  it('restores the button and shows safe error copy when signInWithOAuth returns an error', async () => {
    const client = createFakeClient();
    client.auth.signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: '' },
      error: { message: 'OAuth failed' },
    });
    const { root, cleanup } = await initRoot({ client, pathname: '/vocabulary/basic/' });

    actionButton(root).click();
    await flush();

    expect(statusText(root)).toBe('ログイン状態を確認できませんでした');
    expect(actionButton(root).hidden).toBe(false);
    expect(actionButton(root).disabled).toBe(false);
    expect(rootText(root)).not.toContain('OAuth failed');
    cleanup();
  });

  it('shows safe error copy when the sign-in call throws, and keeps the button usable', async () => {
    const client = createFakeClient();
    client.auth.signInWithOAuth.mockRejectedValue(new Error('boom token leak'));
    const { root, cleanup } = await initRoot({ client, pathname: '/vocabulary/basic/' });

    actionButton(root).click();
    await flush();

    expect(statusText(root)).toBe('ログイン状態を確認できませんでした');
    expect(rootText(root)).not.toContain('boom token leak');
    expect(actionButton(root).disabled).toBe(false);
    cleanup();
  });

  it('requests no scopes and no provider tokens in the OAuth call', async () => {
    const { root, client, cleanup } = await initRoot({ pathname: '/vocabulary/basic/' });

    actionButton(root).click();
    await flush();

    const call = client.auth.signInWithOAuth.mock.calls[0] as Array<Record<string, unknown>>;
    expect(call[0]).not.toHaveProperty('scopes');
    expect(call[0]).not.toHaveProperty('provider_token');
    cleanup();
  });
});

// ─── Sign-out contract ───────────────────────────────────────────────────────

describe('sign-out contract', () => {
  it('calls signOut exactly once per click and renders signed-out', async () => {
    const client = createFakeClient();
    client.auth.getSession.mockResolvedValue({
      data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
      error: null,
    });
    const { root, cleanup } = await initRoot({ client });

    actionButton(root).click();
    await flush();

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(statusText(root)).toBe('ログインすると学習記録を端末間で同期できます');
    expect(actionButton(root).textContent).toBe('Googleでログイン');
    cleanup();
  });

  it('retains the trustworthy signed-in state with safe error copy when signOut fails', async () => {
    const client = createFakeClient();
    client.auth.getSession.mockResolvedValue({
      data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
      error: null,
    });
    client.auth.signOut.mockResolvedValue({ error: { message: 'revoke failed' } });
    const { root, cleanup } = await initRoot({ client });

    actionButton(root).click();
    await flush();

    expect(statusText(root)).toBe('ログイン状態を確認できませんでした');
    expect(actionButton(root).textContent).toBe('ログアウト');
    expect(actionButton(root).hidden).toBe(false);
    expect(rootText(root)).not.toContain('revoke failed');
    cleanup();
  });

  it('does not clear guest progress, sync metadata, theme, script preference, or unrelated storage', async () => {
    const client = createFakeClient();
    client.auth.getSession.mockResolvedValue({
      data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
      error: null,
    });
    const { root, cleanup } = await initRoot({ client });

    window.localStorage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, '{"items":{}}');
    window.localStorage.setItem(SYNC_METADATA_KEY, '{"lastSyncedAt":1}');
    window.localStorage.setItem('chabiko_theme', 'dark');
    window.localStorage.setItem(
      SCRIPT_PREFERENCE_KEY,
      JSON.stringify({ version: 1, preference: 'traditional' }),
    );
    window.localStorage.setItem(OTHER_PROGRESS_KEY, 'value');

    actionButton(root).click();
    await flush();

    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe('{"items":{}}');
    expect(window.localStorage.getItem(SYNC_METADATA_KEY)).toBe('{"lastSyncedAt":1}');
    expect(window.localStorage.getItem('chabiko_theme')).toBe('dark');
    expect(window.localStorage.getItem(SCRIPT_PREFERENCE_KEY)).toBe(
      JSON.stringify({ version: 1, preference: 'traditional' }),
    );
    expect(window.localStorage.getItem(OTHER_PROGRESS_KEY)).toBe('value');
    cleanup();
  });
});

// ─── Auth lifecycle ──────────────────────────────────────────────────────────

describe('auth lifecycle', () => {
  it('dispatches exact safe events for loading, signed-in, and signed-out transitions', async () => {
    const client = createFakeClient();
    client.auth.getSession.mockResolvedValue({
      data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
      error: null,
    });
    mockedGetClient.mockReturnValue(client as never);
    const root = createAccountRoot();
    const events = collectEvents(root);
    initBasicVocabularyAccount(root);
    await flush();

    // loading + signed-in; a duplicate signed-in (INITIAL_SESSION) is deduped
    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('loading');
    expect(kinds.filter((k) => k === 'signed-in')).toHaveLength(1);
    const signedIn = events.find((e) => e.kind === 'signed-in');
    expect(signedIn).toEqual({ kind: 'signed-in' });

    // A later SIGNED_OUT event transitions to signed-out
    authListeners.forEach((listener) => listener('SIGNED_OUT', null));
    await flush();
    expect(events[events.length - 1]).toEqual({ kind: 'signed-out' });
    expect(statusText(root)).toBe('ログインすると学習記録を端末間で同期できます');
  });

  it('subscribes exactly once via onAuthStateChange and keeps one live region', async () => {
    const { root } = await initRoot();
    expect(subscriptionCount).toBe(1);
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('treats an invalid user UUID as a safe Auth error without exposing it', async () => {
    const { root } = await initRoot({
      getSession: () =>
        Promise.resolve({
          data: { session: fakeSession('not-a-canonical-uuid', 'attacker@example.com') },
          error: null,
        }),
    });
    expect(statusText(root)).toBe('ログイン状態を確認できませんでした');
    expect(rootText(root)).not.toContain('not-a-canonical-uuid');
    expect(rootText(root)).not.toContain('attacker@example.com');
    expect(actionButton(root).hidden).toBe(true);
  });

  it('never leaks tokens, provider metadata, or the Google subject into DOM, events, or logs', async () => {
    const client = createFakeClient();
    client.auth.getSession.mockResolvedValue({
      data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
      error: null,
    });
    mockedGetClient.mockReturnValue(client as never);
    const root = createAccountRoot();
    const events = collectEvents(root);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    initBasicVocabularyAccount(root);
    await flush();

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(FAKE_JWT);
    expect(serialized).not.toContain('refresh-token-value');
    expect(serialized).not.toContain('provider-token-value');
    expect(serialized).not.toContain(FAKE_SUBJECT);
    expect(serialized).not.toContain(FAKE_AVATAR);
    expect(serialized).not.toContain(FAKE_NAME);
    expect(serialized).not.toContain('provider');
    expect(serialized).not.toContain(CANONICAL_USER_ID);
    expect(rootText(root)).not.toContain(FAKE_JWT);
    expect(rootText(root)).not.toContain(FAKE_SUBJECT);
    expect(rootText(root)).not.toContain(FAKE_AVATAR);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('reinitializing the same root runs prior cleanup first and restarts fresh', async () => {
    const client = createFakeClient();
    mockedGetClient.mockReturnValue(client as never);
    const root = createAccountRoot();
    initBasicVocabularyAccount(root);
    await flush();
    expect(subscriptionCount).toBe(1);

    // Reinitialization starts from loading again and re-resolves to signed-out.
    initBasicVocabularyAccount(root);
    await flush();
    expect(subscriptionCount).toBe(2);
    expect(statusText(root)).toBe('ログインすると学習記録を端末間で同期できます');
    expect(actionButton(root).textContent).toBe('Googleでログイン');
  });

  it('ignores late async completions after cleanup', async () => {
    let resolveGetSession: (value: unknown) => void = () => undefined;
    const client = createFakeClient();
    client.auth.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetSession = resolve;
        }),
    );
    mockedGetClient.mockReturnValue(client as never);
    const root = createAccountRoot();
    const cleanup = initBasicVocabularyAccount(root);
    cleanup();
    resolveGetSession({
      data: { session: fakeSession(CANONICAL_USER_ID, 'learner@example.com') },
      error: null,
    });
    await flush();

    expect(statusText(root)).toBe('ログイン状態を確認しています');
    expect(rootText(root)).not.toContain('learner@example.com');
  });
});

// ─── Accessibility and layout ────────────────────────────────────────────────

describe('accessibility and layout', () => {
  it('has one polite live region and keyboard-reachable native buttons at least 44px high with visible focus', async () => {
    const component = await readFile(
      'src/components/vocabulary/BasicVocabularyAccount.astro',
      'utf8',
    );
    expect(component.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(component).not.toContain('tabindex="-1"');
    const styleMatch = component.match(/<style is:global>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];
    expect(css).toMatch(/min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.basic-vocabulary-account__action:focus-visible\s*\{[^}]*outline/);
    expect(css).not.toContain('nowrap');
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('wraps without horizontal overflow on 320/375/390px and desktop via bounded widths and wrapping', async () => {
    const component = await readFile(
      'src/components/vocabulary/BasicVocabularyAccount.astro',
      'utf8',
    );
    const styleMatch = component.match(/<style is:global>([\s\S]*?)<\/style>/);
    const css = styleMatch![1];
    // Single bounded column with wrapping text and no nowrap / horizontal overflow.
    expect(css).toMatch(/max-width:\s*34rem/);
    expect(css).toMatch(/width:\s*min\(100%,\s*16rem\)/);
    expect(css).not.toContain('nowrap');
    expect(css).not.toContain('overflow-x');
    expect(css).not.toContain('white-space');
  });

  it('hides and disables the button while loading', async () => {
    let resolveGetSession: (value: unknown) => void = () => undefined;
    const client = createFakeClient();
    client.auth.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetSession = resolve;
        }),
    );
    mockedGetClient.mockReturnValue(client as never);
    const root = createAccountRoot();
    initBasicVocabularyAccount(root);

    expect(statusText(root)).toBe('ログイン状態を確認しています');
    expect(actionButton(root).hidden).toBe(true);
    expect(actionButton(root).disabled).toBe(true);
    resolveGetSession({ data: { session: null }, error: null });
    await flush();
  });
});

// ─── Scope guards ────────────────────────────────────────────────────────────

describe('scope guards', () => {
  it('the account client has no progress query, cloud table access, learning gate, or timers', async () => {
    const clientSource = await readFile('src/client/basicVocabularyAccount.ts', 'utf8');
    expect(clientSource).not.toMatch(/\.from\(|selectSession|applyRating|resetAll/);
    expect(clientSource).not.toMatch(/localStorage\.(setItem|removeItem|clear)/);
    expect(clientSource).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|BroadcastChannel/);
    expect(clientSource).not.toMatch(/setInterval|setTimeout/);
  });

  it('the routes add no progress/cloud payload or storage access beyond the account component', async () => {
    const study = await readFile('src/pages/vocabulary/basic/index.astro', 'utf8');
    const catalog = await readFile('src/pages/vocabulary/basic/words/index.astro', 'utf8');
    expect(study).not.toMatch(/localStorage|sessionStorage/);
    expect(catalog).not.toMatch(/localStorage|sessionStorage/);
  });
});
