import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabasePublicConfig } from './supabasePublicConfig';

export { readSupabasePublicConfig, type SupabasePublicConfig } from './supabasePublicConfig';

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

/** Keep the client behind a getter so creating it stays fully lazy. */
let cachedBrowserClient: SupabaseClient | null | undefined;

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
