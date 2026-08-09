// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALLBACK_CHECKING_TEXT,
  CALLBACK_FAILED_TEXT,
  CALLBACK_UNAVAILABLE_TEXT,
  AUTH_RETURN_PATH_STORAGE_KEY,
  readAndRemoveReturnPath,
  readCallbackCode,
} from '../src/client/supabaseAuthCallback';

vi.mock('../src/lib/supabaseBrowserClient', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

/**
 * Fresh module instances per test: the callback controller keeps a module-level
 * "exchanged once" guard so a duplicate Astro lifecycle can never exchange the
 * same one-time code twice, so each test must re-import after `resetModules`.
 */
async function freshCallbackModules(): Promise<{
  initSupabaseAuthCallback: typeof import('../src/client/supabaseAuthCallback').initSupabaseAuthCallback;
  getSupabaseBrowserClient: typeof import('../src/lib/supabaseBrowserClient').getSupabaseBrowserClient;
}> {
  vi.resetModules();
  const authCallback = await import('../src/client/supabaseAuthCallback');
  const lib = await import('../src/lib/supabaseBrowserClient');
  return {
    initSupabaseAuthCallback: authCallback.initSupabaseAuthCallback,
    getSupabaseBrowserClient: lib.getSupabaseBrowserClient,
  };
}

// ─── Test doubles ────────────────────────────────────────────────────────────

const CODE = 'one-time-auth-code';

interface FakeAuthApi {
  exchangeCodeForSession: ReturnType<typeof vi.fn>;
}

interface FakeClient {
  auth: FakeAuthApi;
}

function createFakeClient(): FakeClient {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user: { id: '11111111-1111-1111-1111-111111111111' }, session: {} },
        error: null,
      }),
    },
  };
}

function createCallbackRoot(): HTMLElement {
  const root = document.createElement('section');
  root.dataset.supabaseAuthCallback = '';
  root.innerHTML =
    '<h1>ログインを確認しています</h1>' +
    '<p data-supabase-auth-callback-status aria-live="polite">ログインを確認しています</p>';
  document.body.append(root);
  return root;
}

function statusText(root: HTMLElement): string {
  return root.querySelector('[data-supabase-auth-callback-status]')?.textContent ?? '';
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setSearch(search: string): void {
  const base = `${window.location.origin}/auth/callback/`;
  window.history.replaceState(null, '', `${base}${search}`);
}

beforeEach(() => {
  window.history.replaceState(null, '', `${window.location.origin}/auth/callback/`);
  window.sessionStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

// ─── Route contract ──────────────────────────────────────────────────────────

describe('callback route contract', () => {
  it('uses BaseLayout with the exact title and robots, the exact heading/copy, and one root', async () => {
    const route = await readFile('src/pages/auth/callback/index.astro', 'utf8');
    expect(route).toContain('<BaseLayout title="ログイン" robots="noindex,nofollow">');
    expect(route).toContain('<h1>ログインを確認しています</h1>');
    expect(route).toContain('data-supabase-auth-callback');
    expect(route.match(/data-supabase-auth-callback-status/g)).toHaveLength(1);
    expect(route).toContain('aria-live="polite"');
    expect(route).toContain("from '../../../client/supabaseAuthCallback'");
    expect(route).toContain('ログインを確認しています');
  });

  it('contains no progress, session, catalog, or cloud payload', async () => {
    const route = await readFile('src/pages/auth/callback/index.astro', 'utf8');
    expect(route).not.toMatch(/basicVocabulary|progress|catalog|sessionPayload|learnerSession/);
    expect(route).not.toMatch(/localStorage|sessionStorage|fetch\(/);
    expect(route).not.toMatch(/setSession|access_token|refresh_token/);
  });

  it('loads only the supabaseAuthCallback client module', async () => {
    const route = await readFile('src/pages/auth/callback/index.astro', 'utf8');
    const scriptMatch = route.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    expect(scriptMatch![1]).toContain("from '../../../client/supabaseAuthCallback'");
    expect(scriptMatch![1]).not.toContain('initBasicVocabularyAccount');
  });
});

// ─── Code validation ─────────────────────────────────────────────────────────

describe('readCallbackCode', () => {
  it('accepts exactly one non-empty code', () => {
    expect(readCallbackCode('?code=abc')).toBe('abc');
    expect(readCallbackCode('?state=x&code=abc&other=y')).toBe('abc');
  });

  it('rejects missing, blank, and duplicate codes', () => {
    expect(readCallbackCode('')).toBeNull();
    expect(readCallbackCode('?state=x')).toBeNull();
    expect(readCallbackCode('?code=')).toBeNull();
    expect(readCallbackCode('?code=abc&code=def')).toBeNull();
  });
});

// ─── Return path handling ────────────────────────────────────────────────────

describe('readAndRemoveReturnPath', () => {
  it('accepts only the two allowlisted paths and removes the key', () => {
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/vocabulary/basic/');
    expect(readAndRemoveReturnPath()).toBe('/vocabulary/basic/');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/vocabulary/basic/words/');
    expect(readAndRemoveReturnPath()).toBe('/vocabulary/basic/words/');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('falls back safely for invalid stored paths and removes the stale value', () => {
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, 'https://evil.example/');
    expect(readAndRemoveReturnPath()).toBe('/vocabulary/basic/');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/other/path/');
    expect(readAndRemoveReturnPath()).toBe('/vocabulary/basic/');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('falls back when storage is missing and does not throw when storage is unavailable', () => {
    expect(readAndRemoveReturnPath()).toBe('/vocabulary/basic/');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readAndRemoveReturnPath()).toBe('/vocabulary/basic/');
    vi.restoreAllMocks();
  });
});

// ─── Exchange and navigation ─────────────────────────────────────────────────

describe('initSupabaseAuthCallback', () => {
  it('exchanges a valid code exactly once and replaces with the basic return path', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/vocabulary/basic/');
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(CODE);
    expect(window.location.pathname).toBe('/vocabulary/basic/');
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('exchanges a valid code exactly once and replaces with the catalog return path', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/vocabulary/basic/words/');
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/vocabulary/basic/words/');
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('falls back to /vocabulary/basic/ when the stored path is invalid, and removes the key', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/evil/path/');
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(window.location.pathname).toBe('/vocabulary/basic/');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('shows the failed copy and does not navigate for missing, blank, or duplicate codes', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    for (const search of ['', '?state=x', '?code=', '?code=abc&code=def']) {
      const client = createFakeClient();
      vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
      setSearch(search);
      const root = createCallbackRoot();
      initSupabaseAuthCallback(root);
      await flush();

      expect(statusText(root)).toBe(CALLBACK_FAILED_TEXT);
      expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/auth/callback/');
      expect(window.location.search).toBe('');
    }
  });

  it('shows the unavailable copy and stops when the client is not configured', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(null);
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(statusText(root)).toBe(CALLBACK_UNAVAILABLE_TEXT);
    expect(window.location.pathname).toBe('/auth/callback/');
    expect(window.location.search).toBe('');
  });

  it('on exchange error shows the failed copy, removes the stored return path, and does not navigate', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    client.auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'code already used — token leak' },
    });
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/vocabulary/basic/');
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(statusText(root)).toBe(CALLBACK_FAILED_TEXT);
    expect(root.textContent).not.toContain('code already used');
    expect(root.textContent).not.toContain('token leak');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/auth/callback/');
    expect(window.location.search).toBe('');
  });

  it('on a throwing exchange shows the failed copy without raw errors and does not navigate', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    client.auth.exchangeCodeForSession.mockRejectedValue(new Error('network exploded'));
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, '/vocabulary/basic/');
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(statusText(root)).toBe(CALLBACK_FAILED_TEXT);
    expect(root.textContent).not.toContain('network exploded');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/auth/callback/');
    expect(window.location.search).toBe('');
  });

  it('does not throw when sessionStorage is unavailable and still completes the exchange', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/vocabulary/basic/');
    vi.restoreAllMocks();
  });

  it('never exchanges the same code twice across repeated initialization', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);

    // A duplicate lifecycle (repeated Astro bootstrap on the same page load)
    // must not exchange the one-time code again.
    const root2 = createCallbackRoot();
    initSupabaseAuthCallback(root2);
    await flush();
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('leaves no raw error, token, or code in the rendered DOM or final navigation', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    const client = createFakeClient();
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);
    await flush();

    const serialized = JSON.stringify({
      rootText: root.textContent,
      rootHtml: root.outerHTML,
      location: window.location.href,
    });
    expect(serialized).not.toContain(CODE);
    expect(serialized).not.toContain('header.payload');
    expect(serialized).not.toContain('refresh_token');
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('provider_token');
    expect(window.location.pathname).toBe('/vocabulary/basic/');
  });

  it('keeps the checking copy until the exchange settles', async () => {
    const { initSupabaseAuthCallback, getSupabaseBrowserClient } = await freshCallbackModules();
    let resolveExchange: (value: unknown) => void = () => undefined;
    const client = createFakeClient();
    client.auth.exchangeCodeForSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExchange = resolve;
        }),
    );
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client as never);
    setSearch(`?code=${CODE}`);
    const root = createCallbackRoot();
    initSupabaseAuthCallback(root);

    // Immediately after init: still the checking copy (pre-dispatch state).
    expect(statusText(root)).toBe(CALLBACK_CHECKING_TEXT);
    expect(window.location.search).toBe('');
    resolveExchange({
      data: { user: { id: 'x' }, session: {} },
      error: null,
    });
    await flush();
    expect(window.location.pathname).toBe('/vocabulary/basic/');
  });
});
