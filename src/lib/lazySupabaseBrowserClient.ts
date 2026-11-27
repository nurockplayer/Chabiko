import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabasePublicConfig } from './supabasePublicConfig';

let loadedClient: SupabaseClient | null = null;

export function getLoadedSupabaseBrowserClient(): SupabaseClient | null {
  return loadedClient;
}

export async function loadSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  const { getSupabaseBrowserClient } = await import('./supabaseBrowserClient');
  loadedClient = getSupabaseBrowserClient();
  return loadedClient;
}

export function supabaseSessionStorageKey(config: SupabasePublicConfig): string {
  // Supabase's default session key uses the first label of its API hostname.
  // The value is only a load signal. Supabase still resolves the actual session.
  const project = new URL(config.url).hostname.split('.')[0];
  return `sb-${project}-auth-token`;
}

export function hasStoredSupabaseSession(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}
