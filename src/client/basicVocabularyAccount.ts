import { getSupabaseBrowserClient } from '../lib/supabaseBrowserClient';
import { isValidSupabaseUserId } from '../domain/basicVocabularyProgressScope';

/**
 * Optional Google account control for the basic-vocabulary routes (Issue #290).
 *
 * This module owns authentication state and safe identity events only. It
 * never reads or writes cloud progress, never changes the active progress
 * scope, and never exposes session objects, JWTs, access/refresh/provider
 * tokens, raw metadata, the Google subject, or error objects — neither in the
 * DOM, in event detail, nor in logs.
 *
 * The current immutable safe auth state is also published through the
 * module-level {@link getBasicVocabularyAuthState} /
 * {@link subscribeBasicVocabularyAuthState} API (Issue #293), so the progress
 * coordinator can consume the exact already-published state and every later
 * transition without ever seeing a session or token.
 */

/** Bubbling CustomEvent name for every accepted auth state transition. */
export const BASIC_VOCABULARY_AUTH_EVENT =
  'chabiko:basic-vocabulary-auth-state';

/** Safe learner-facing auth state. `userId` is a canonical Supabase UUID;
 * `email` is used only for the visible signed-in label and is omitted when
 * untruthfully unavailable. */
export type BasicVocabularyAuthState =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'signed-in'; readonly userId: string; readonly email: string | null };

/** Exact paths a Google sign-in may remember as the post-callback return path. */
const AUTH_RETURN_PATH_ALLOWLIST = ['/vocabulary/basic/', '/vocabulary/basic/words/'];

/** Exact sessionStorage key shared with the PKCE callback route. */
const AUTH_RETURN_PATH_STORAGE_KEY = 'chabiko:auth-return-path:v1';

const ACTION_SELECTOR = '[data-basic-vocabulary-account-action]';
const STATUS_SELECTOR = '[data-basic-vocabulary-account-status]';

/** Signed-in / signed-out / loading — the last kind rendered before an error. */
type TrustworthyKind = 'loading' | 'signed-out' | 'signed-in';

interface UiParts {
  status: HTMLElement;
  action: HTMLButtonElement;
}

const cleanups = new WeakMap<HTMLElement, () => void>();

// ─── Module-level immutable auth state + subscription (Issue #293) ────────────

/**
 * The single current safe auth state observed by this module instance, or null
 * before the first accepted transition. Only the immutable, learner-safe
 * `BasicVocabularyAuthState` is ever stored here — never a session, JWT,
 * token, or raw Supabase metadata.
 */
let currentAuthState: BasicVocabularyAuthState | null = null;

const authStateSubscribers = new Set<(state: BasicVocabularyAuthState) => void>();

/** The current immutable safe auth state, or null when none has been accepted. */
export function getBasicVocabularyAuthState(): BasicVocabularyAuthState | null {
  return currentAuthState;
}

/**
 * Subscribe to every accepted auth-state transition. The current state (when
 * already accepted) is delivered immediately, so a late subscriber can never
 * miss an already-published state. Identical states are never re-delivered.
 * Returns an idempotent unsubscribe.
 */
export function subscribeBasicVocabularyAuthState(
  listener: (state: BasicVocabularyAuthState) => void,
): () => void {
  authStateSubscribers.add(listener);
  if (currentAuthState !== null) listener(currentAuthState);
  return () => {
    authStateSubscribers.delete(listener);
  };
}

/** Forget the observed state and drop subscribers (test/teardown boundary). */
export function clearBasicVocabularyAuthState(): void {
  currentAuthState = null;
  authStateSubscribers.clear();
}

function publishAuthState(state: BasicVocabularyAuthState): void {
  currentAuthState = state;
  for (const listener of [...authStateSubscribers]) listener(state);
}

function getActionLabel(state: BasicVocabularyAuthState): string | null {
  if (state.kind === 'signed-in') return 'ログアウト';
  if (state.kind === 'signed-out') return 'Googleでログイン';
  return null;
}

/** Value equality so identical states (e.g. the initial session read and the
 * INITIAL_SESSION event) never render or dispatch twice. */
function statesEqual(a: BasicVocabularyAuthState, b: BasicVocabularyAuthState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'signed-in' && b.kind === 'signed-in') {
    return a.userId === b.userId && a.email === b.email;
  }
  return true;
}

function render(ui: UiParts, state: BasicVocabularyAuthState): void {
  const label = getActionLabel(state);
  const hasAction = label !== null;
  ui.action.hidden = !hasAction;
  ui.action.disabled = !hasAction;
  ui.action.textContent = label ?? '';
  ui.action.setAttribute('aria-label', label ?? '');

  if (state.kind === 'signed-in') {
    // Visible label is `ログイン中` plus the truthfully available account
    // email; the email fragment is omitted when absent.
    const email = state.email;
    ui.status.textContent =
      email !== null && email.length > 0 ? `ログイン中（${email}）` : 'ログイン中';
  } else if (state.kind === 'signed-out') {
    ui.status.textContent = 'ログインすると学習記録を端末間で同期できます';
  } else if (state.kind === 'loading') {
    ui.status.textContent = 'ログイン状態を確認しています';
  } else {
    ui.status.textContent = 'ログイン機能は現在利用できません';
  }
}

/**
 * Binds the account control at `[data-basic-vocabulary-account]`.
 *
 * Initial state: loading while the initial session is read, then the truthful
 * signed-in/signed-out state (or unavailable when the client is not
 * configured). Exactly one `onAuthStateChange` subscription processes
 * subsequent events; every accepted state dispatches one bubbling
 * `BASIC_VOCABULARY_AUTH_EVENT` with an immutable kind-only detail. The DOM
 * event never carries the private user UUID; the coordinator receives the
 * full safe state through the module-level subscription instead. Returns a
 * cleanup function that unsubscribes and removes the root handler.
 */
export function initBasicVocabularyAccount(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const statusEl = root.querySelector<HTMLElement>(STATUS_SELECTOR);
  if (!statusEl) {
    throw new Error('basic vocabulary account status region is missing');
  }
  const actionEl = root.querySelector<HTMLButtonElement>(ACTION_SELECTOR);
  if (!actionEl) {
    throw new Error('basic vocabulary account action is missing');
  }
  // Narrowed const aliases so closures keep the non-null element types.
  const status: HTMLElement = statusEl;
  const action: HTMLButtonElement = actionEl;

  const client = getSupabaseBrowserClient();
  if (client === null) {
    render({ status, action }, { kind: 'unavailable' });
    dispatchState(root, { kind: 'unavailable' });
    publishAuthState({ kind: 'unavailable' });
    return () => undefined;
  }

  // Reinitialization starts from the pristine loading state and announces it.
  render({ status, action }, { kind: 'loading' });
  dispatchState(root, { kind: 'loading' });
  let latestTrustworthy: BasicVocabularyAuthState = { kind: 'loading' };
  let lastTrustworthyKind: TrustworthyKind = 'loading';
  let disposed = false;
  let signInInFlight = false;
  let signOutInFlight = false;

  /** Safe error text only — never raw messages, codes or token material. */
  function showAuthError(): void {
    status.textContent = 'ログイン状態を確認できませんでした';
  }

  /** Preserve the last trustworthy action; error copy replaces the status. */
  function renderError(): void {
    render({ status, action }, latestTrustworthy);
    showAuthError();
  }

  function accept(state: BasicVocabularyAuthState, trustworthyKind: TrustworthyKind): void {
    if (disposed) return;
    if (statesEqual(state, latestTrustworthy)) return;
    latestTrustworthy = state;
    lastTrustworthyKind = trustworthyKind;
    render({ status, action }, state);
    dispatchState(root, state);
    publishAuthState(state);
  }

  function acceptSignedIn(userId: string, email: string | null): void {
    if (!isValidSupabaseUserId(userId)) {
      // A session with a non-canonical user ID is a safe Auth error: never
      // expose or use the ID, never render a signed-in label from it.
      renderError();
      return;
    }
    accept({ kind: 'signed-in', userId, email }, 'signed-in');
  }

  async function loadInitialSession(): Promise<void> {
    if (client === null || disposed) return;
    try {
      const result = await client.auth.getSession();
      if (disposed) return;
      const session = result.data.session;
      if (session !== null && session.user !== undefined) {
        acceptSignedIn(session.user.id, session.user.email ?? null);
      } else {
        accept({ kind: 'signed-out' }, 'signed-out');
      }
    } catch {
      if (disposed) return;
      renderError();
    }
  }

  /** Handle SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION / SIGNED_OUT events
   * from the single subscription, without duplicate rendering or events. */
  function handleAuthEvent(event: string, session: unknown): void {
    if (disposed) return;
    if (event === 'SIGNED_OUT') {
      accept({ kind: 'signed-out' }, 'signed-out');
      return;
    }
    const ses = (session ?? null) as { user?: { id?: string; email?: string | null } } | null;
    const userId = ses?.user?.id;
    if (typeof userId === 'string' && userId.length > 0) {
      const email = typeof ses?.user?.email === 'string' ? ses.user.email : null;
      acceptSignedIn(userId, email);
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      accept({ kind: 'signed-out' }, 'signed-out');
    }
  }

  function restoreAction(): void {
    if (disposed) return;
    const label = getActionLabel(latestTrustworthy);
    action.disabled = label === null;
    action.hidden = label === null;
  }

  async function onSignInClick(): Promise<void> {
    if (disposed || signInInFlight || action.disabled) return;
    signInInFlight = true;
    action.disabled = true;
    try {
      const pathname = window.location.pathname;
      if (pathname !== AUTH_RETURN_PATH_ALLOWLIST[0] && pathname !== AUTH_RETURN_PATH_ALLOWLIST[1]) {
        // Never start OAuth from a non-allowlisted path.
        showAuthError();
        return;
      }
      try {
        window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, pathname);
      } catch {
        // Storage unavailable must not throw; the callback route then falls
        // back to `/vocabulary/basic/`.
      }
      if (client === null) {
        showAuthError();
        return;
      }
      const result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback/`,
        },
      });
      if (disposed) return;
      if (result.error !== null) {
        showAuthError();
      }
      // Success: the browser is about to redirect to Google.
    } catch {
      if (disposed) return;
      showAuthError();
    } finally {
      signInInFlight = false;
      restoreAction();
    }
  }

  async function onSignOutClick(): Promise<void> {
    if (disposed || signOutInFlight || action.disabled) return;
    signOutInFlight = true;
    action.disabled = true;
    try {
      if (client === null) {
        showAuthError();
        return;
      }
      const result = await client.auth.signOut();
      if (disposed) return;
      if (result.error !== null) {
        // Retain the trustworthy signed-in state and show safe error copy.
        renderError();
        return;
      }
      accept({ kind: 'signed-out' }, 'signed-out');
    } catch {
      if (disposed) return;
      renderError();
    } finally {
      signOutInFlight = false;
      restoreAction();
    }
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(ACTION_SELECTOR);
    if (!button || !root.contains(button)) return;
    if (button.disabled || button.hidden) return;
    if (lastTrustworthyKind === 'signed-in') {
      void onSignOutClick();
    } else if (lastTrustworthyKind === 'signed-out') {
      void onSignInClick();
    }
  }

  root.addEventListener('click', onClick);

  const subscription = client.auth.onAuthStateChange((event, session) => {
    handleAuthEvent(event, session);
  });

  void loadInitialSession();

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    subscription.data.subscription.unsubscribe();
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  }
  cleanups.set(root, cleanup);
  return cleanup;
}

function dispatchState(root: HTMLElement, state: BasicVocabularyAuthState): void {
  const detail: Readonly<Pick<BasicVocabularyAuthState, 'kind'>> = Object.freeze({
    kind: state.kind,
  });
  root.dispatchEvent(
    new CustomEvent<Readonly<Pick<BasicVocabularyAuthState, 'kind'>>>(BASIC_VOCABULARY_AUTH_EVENT, {
      bubbles: true,
      detail,
    }),
  );
}
