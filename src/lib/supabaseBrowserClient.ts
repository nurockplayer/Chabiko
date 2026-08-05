import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-only Supabase client boundary.
 *
 * The static Astro site distinguishes “configured” from “not configured”
 * without throwing: when the public variables are missing, blank or invalid,
 * `readSupabasePublicConfig` returns `null` and `getSupabaseBrowserClient`
 * returns `null`. No secret credential is ever read by this module.
 *
 * Only the `PUBLIC_` variables below are read. Credentials that are not
 * `PUBLIC_`-prefixed are intentionally ignored.
 */

export interface SupabasePublicConfig {
  readonly url: string;
  readonly publishableKey: string;
}

const PUBLIC_URL_KEY = 'PUBLIC_SUPABASE_URL';
const PUBLIC_PUBLISHABLE_KEY_KEY = 'PUBLIC_SUPABASE_PUBLISHABLE_KEY';

/** Keep the client behind a getter so creating it stays fully lazy. */
let cachedBrowserClient: SupabaseClient | null | undefined;

/**
 * Reads the supported public configuration from an environment object.
 *
 * Defaults to `import.meta.env`. Returns `null` when the URL is missing,
 * blank, not an absolute `http:`/`https:` URL, or the key is missing/blank.
 * Whitespace is trimmed; one trailing slash is removed without rewriting
 * path/query content. Never throws and never touches `window`, storage,
 * network or Auth.
 */
export function readSupabasePublicConfig(
  env: Readonly<Record<string, string | undefined>> = import.meta.env,
): SupabasePublicConfig | null {
  const rawUrl = env[PUBLIC_URL_KEY];
  const rawKey = env[PUBLIC_PUBLISHABLE_KEY_KEY];

  if (typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  if (url.length === 0) return null;

  const publishableKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (publishableKey.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  // Normalize exactly one trailing slash without rewriting path/query content.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return { url: parsed.toString(), publishableKey };
}

/**
 * Returns a memoized browser client for the public configuration, or `null`
 * when the configuration is unavailable. Importing this module never touches
 * `window`, storage, network or Auth; the client is only created on the first
 * call. Exactly one client is created per module instance.
 *
 * The client is configured for PKCE auth with `persistSession: true` and
 * `autoRefreshToken: true`. `detectSessionInUrl` is `false` because the
 * explicit callback exchange is owned by the account-sync callback work.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cachedBrowserClient !== undefined) return cachedBrowserClient;

  const config = readSupabasePublicConfig();
  cachedBrowserClient = config
    ? createClient(config.url, config.publishableKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

  return cachedBrowserClient;
}
