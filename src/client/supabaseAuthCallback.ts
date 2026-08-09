import { getSupabaseBrowserClient } from '../lib/supabaseBrowserClient';

/**
 * Static PKCE callback controller for `/auth/callback/` (Issue #290).
 *
 * Exchanges the one-time authorization `code` for a session through the
 * configured Supabase Auth client exactly once, then replaces the current
 * history entry with the stored validated return path. The code is never sent
 * anywhere except the configured Auth client, never persisted manually, and
 * never left in the URL, DOM or logs. No implicit-flow fragments, no
 * `setSession`, no manual token persistence, no retry loop.
 */

/** Exact paths accepted as a stored post-callback return path. */
const AUTH_RETURN_PATH_ALLOWLIST = ['/vocabulary/basic/', '/vocabulary/basic/words/'];

/** Exact fallback return path. */
const FALLBACK_RETURN_PATH = '/vocabulary/basic/';

/** Exact sessionStorage key shared with the sign-in route. */
export const AUTH_RETURN_PATH_STORAGE_KEY = 'chabiko:auth-return-path:v1';

/** Safe learner-facing copy for the callback status region. */
export const CALLBACK_UNAVAILABLE_TEXT = 'ログイン機能は現在利用できません';
export const CALLBACK_FAILED_TEXT = 'ログインできませんでした';
export const CALLBACK_CHECKING_TEXT = 'ログインを確認しています';

/** Rendering callback used by the tests and by the route controller. */
export type RenderCallback = (text: string) => void;

let exchanged = false;

/**
 * Reads exactly one non-empty `code` query parameter. Missing, duplicate, or
 * blank values fail; only an exactly-once occurrence is accepted.
 */
export function readCallbackCode(search: string): string | null {
  let code: string | null = null;
  for (const [key, value] of new URLSearchParams(search)) {
    if (key !== 'code') continue;
    if (code !== null) return null; // duplicate code parameter
    code = value;
  }
  if (code === null || code.length === 0) return null;
  return code;
}

/**
 * Removes callback query/fragment material from the current history entry
 * without navigating. The exchange keeps its in-memory code argument, while
 * unavailable/invalid/error states cannot leave that code in history or a
 * same-origin referrer. History failure must not expose raw errors in the UI.
 */
function clearCallbackLocation(): boolean {
  // A fallback navigation reloads the clean callback path. Do not attempt the
  // same replacement again when there is no query/fragment left to scrub.
  if (window.location.search.length === 0 && window.location.hash.length === 0) {
    return true;
  }
  try {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    return true;
  } catch {
    // Fail closed if history mutation is locked down: replace the current entry
    // with the same safe path so callback material still cannot remain visible.
    // The caller must stop: exchanging while navigation begins could consume the
    // one-use code without deterministically persisting the resulting session.
    window.location.replace(window.location.pathname);
    return false;
  }
}

/**
 * Reads and removes the stored return path. Accepts only the two allowlisted
 * paths; missing/invalid/inaccessible storage falls back to
 * `/vocabulary/basic/`. The key is removed whenever storage is reachable so a
 * stale or invalid value can never be reused. Never throws.
 */
export function readAndRemoveReturnPath(): string {
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY);
  } catch {
    // Storage unavailable — fall through to the fallback path.
  }
  try {
    window.sessionStorage.removeItem(AUTH_RETURN_PATH_STORAGE_KEY);
  } catch {
    // Removal failure must not block the callback.
  }
  if (
    stored === AUTH_RETURN_PATH_ALLOWLIST[0] ||
    stored === AUTH_RETURN_PATH_ALLOWLIST[1]
  ) {
    return stored;
  }
  return FALLBACK_RETURN_PATH;
}

/**
 * Processes the callback: obtains the configured client (unconfigured shows
 * the unavailable copy and stops), validates exactly one code, exchanges it
 * exactly once, and replaces the history entry with the validated return
 * path. On exchange error the stored return path is removed and the safe
 * failed copy is shown — no raw errors, no automatic retry, no navigation.
 * Repeated initialization cannot exchange the same code twice.
 */
export function initSupabaseAuthCallback(
  root: HTMLElement,
  render: RenderCallback = (text) => {
    const status = root.querySelector<HTMLElement>('[data-supabase-auth-callback-status]');
    if (status) status.textContent = text;
  },
): void {
  // Capture the one-use code in memory, then scrub the URL synchronously before
  // any client lookup, exchange await, or error state can expose it.
  const code = readCallbackCode(window.location.search);
  if (!clearCallbackLocation()) return;

  const client = getSupabaseBrowserClient();
  if (client === null) {
    render(CALLBACK_UNAVAILABLE_TEXT);
    return;
  }

  if (code === null) {
    render(CALLBACK_FAILED_TEXT);
    return;
  }
  if (exchanged) {
    // The code is one-time; a second lifecycle must never exchange it again.
    render(CALLBACK_FAILED_TEXT);
    return;
  }
  exchanged = true;

  void (async () => {
    let result;
    try {
      result = await client.auth.exchangeCodeForSession(code);
    } catch {
      try {
        window.sessionStorage.removeItem(AUTH_RETURN_PATH_STORAGE_KEY);
      } catch {
        // Storage unavailable — the callback still stops safely.
      }
      render(CALLBACK_FAILED_TEXT);
      return;
    }
    if (result.error !== null) {
      try {
        window.sessionStorage.removeItem(AUTH_RETURN_PATH_STORAGE_KEY);
      } catch {
        // Storage unavailable — the callback still stops safely.
      }
      render(CALLBACK_FAILED_TEXT);
      return;
    }
    const returnPath = readAndRemoveReturnPath();
    // `replace` drops the one-use code from browser history.
    window.location.replace(returnPath);
  })();
}
