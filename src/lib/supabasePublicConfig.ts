export interface SupabasePublicConfig {
  readonly url: string;
  readonly publishableKey: string;
}

const PUBLIC_URL_KEY = 'PUBLIC_SUPABASE_URL';
const PUBLIC_PUBLISHABLE_KEY_KEY = 'PUBLIC_SUPABASE_PUBLISHABLE_KEY';

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

  // Normalize exactly one trailing slash against the original trimmed input.
  // `URL` is only used above to validate absoluteness and the HTTP(S) protocol;
  // its serialized href/pathname would canonicalize path content (e.g. collapse
  // dot segments), which Issue #286 forbids. Operate on the raw string before
  // the first `?` or `#` so every other path/query/fragment byte is preserved.
  let baseEnd = url.length;
  const searchStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  if (searchStart !== -1) baseEnd = Math.min(baseEnd, searchStart);
  if (hashStart !== -1) baseEnd = Math.min(baseEnd, hashStart);
  const base = url.slice(0, baseEnd);
  const suffix = url.slice(baseEnd);
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;

  return { url: normalizedBase + suffix, publishableKey };
}

