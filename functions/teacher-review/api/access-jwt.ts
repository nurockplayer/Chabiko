/**
 * Cloudflare Access JWT validation for the teacher-review API boundary
 * (Issue #363).
 *
 * Small, official-pattern validation using the Workers Web Crypto API against
 * the Cloudflare Access JWKS endpoint — never trusting a client-supplied
 * identity header or body field. Contract per the current Cloudflare docs
 * ("Validate JWTs in Access"):
 *
 * - The JWT arrives in the `Cf-Access-Jwt-Assertion` request header (the
 *   recommended transport over the `CF_Authorization` cookie).
 * - The public keys live at `https://<team-domain>/cdn-cgi/access/certs`
 *   (JWKS `keys`); the signing key is matched by the JWT header `kid`.
 * - RS256 signature, `iss` = team domain, `aud` = the Access application's
 *   AUD tag, and `exp`/`nbf`/`iat` time claims are all validated.
 *
 * No dependency on jose or the pages-plugin is needed; this is the
 * equivalently small official validation pattern the issue permits, and it
 * returns JSON 401s to API fetchers instead of an HTML login redirect.
 */

export interface AccessJwtPayload {
  aud?: string | readonly string[];
  email?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  sub?: string;
  common_name?: string;
  identity_nonce?: string;
  type?: string;
}

export interface AccessIdentity {
  /** Access user email (Email OTP / IdP identity). */
  email: string;
  /** Access user name (`common_name`), falling back to email. */
  name: string;
  sub: string;
  identityNonce: string;
  payload: AccessJwtPayload;
}

export type AccessJwtResult =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; reason: string };

interface JsonWebKeySet {
  keys?: JsonWebKey[];
}

function base64UrlToBytes(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function parseJwtObject(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(bytesToUtf8(base64UrlToBytes(segment)));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JWT JSON object.');
  }
  return value as Record<string, unknown>;
}

interface JwksCacheEntry {
  cached?: { keys: Map<string, JsonWebKey>; fetchedAt: number };
  pending?: Promise<Map<string, JsonWebKey>>;
  refreshAfter: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const JWKS_MAX_AGE_MS = 60 * 60 * 1000;
const JWKS_KEY_MISS_COOLDOWN_MS = 60 * 1000;

/** Test seam / operator escape hatch: drop the cached JWKS. */
export function clearAccessJwksCache(): void {
  jwksCache.clear();
}

function fetchJwks(
  entry: JwksCacheEntry,
  teamDomain: string,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<Map<string, JsonWebKey>> {
  if (entry.pending) return entry.pending;

  entry.pending = (async () => {
    const set = await fetchJson(`${teamDomain}/cdn-cgi/access/certs`) as JsonWebKeySet | null;
    if (!Array.isArray(set?.keys)) throw new Error('Malformed Access JWKS.');
    const keys = new Map<string, JsonWebKey>();
    for (const key of set.keys) {
      const kid = (key as { kid?: string }).kid;
      if (kid && key.kty) keys.set(kid, key);
    }
    entry.cached = { keys, fetchedAt: Date.now() };
    return keys;
  })().finally(() => {
    entry.pending = undefined;
  });
  return entry.pending;
}

function getClaimedAudiences(payload: AccessJwtPayload): readonly string[] {
  if (typeof payload.aud === 'string') return [payload.aud];
  if (Array.isArray(payload.aud)) return payload.aud as readonly string[];
  return [];
}

/**
 * Verify a Cloudflare Access JWT. `token` is the raw JWT from the
 * `Cf-Access-Jwt-Assertion` header; `teamDomain` and `aud` come from bounded
 * deployment configuration (env vars), never from the client.
 */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Access JWKS fetch failed: HTTP ${response.status}`);
    }
    return response.json();
  },
): Promise<AccessJwtResult> {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return { ok: false, reason: 'Malformed Access JWT (not a JWS).' };
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments;

  let header: Record<string, unknown>;
  try {
    header = parseJwtObject(headerSegment);
  } catch {
    return { ok: false, reason: 'Malformed Access JWT header.' };
  }
  if (header.alg !== 'RS256') {
    return { ok: false, reason: `Unexpected Access JWT algorithm '${header.alg ?? 'missing'}'.` };
  }
  if (typeof header.kid !== 'string' || !header.kid) {
    return { ok: false, reason: 'Access JWT header has no kid.' };
  }

  let payload: AccessJwtPayload;
  try {
    payload = parseJwtObject(payloadSegment) as AccessJwtPayload;
  } catch {
    return { ok: false, reason: 'Malformed Access JWT payload.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return { ok: false, reason: 'Access JWT expired.' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now) {
    return { ok: false, reason: 'Access JWT is not yet valid.' };
  }
  if (typeof payload.iat === 'number' && payload.iat > now + 300) {
    return { ok: false, reason: 'Access JWT issued in the future.' };
  }
  const normalizedTeam = teamDomain.replace(/\/$/, '');
  if (payload.iss !== normalizedTeam) {
    return { ok: false, reason: `Access JWT issuer mismatch (${payload.iss ?? 'missing'}).` };
  }
  const audiences = getClaimedAudiences(payload);
  if (!audiences.includes(aud)) {
    return { ok: false, reason: `Access JWT audience mismatch (aud=${audiences.join(',')}).` };
  }

  let entry = jwksCache.get(normalizedTeam);
  if (!entry) {
    entry = { refreshAfter: 0 };
    jwksCache.set(normalizedTeam, entry);
  }
  let keys: Map<string, JsonWebKey>;
  try {
    const cached = entry.cached;
    keys = cached && Date.now() - cached.fetchedAt < JWKS_MAX_AGE_MS
      ? cached.keys
      : await fetchJwks(entry, normalizedTeam, fetchJson);
  } catch (error) {
    return {
      ok: false,
      reason: `Access JWKS unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  let jwk = keys.get(header.kid);
  if (!jwk && (entry.pending || Date.now() >= entry.refreshAfter)) {
    if (!entry.pending) entry.refreshAfter = Date.now() + JWKS_KEY_MISS_COOLDOWN_MS;
    try {
      jwk = (await fetchJwks(entry, normalizedTeam, fetchJson)).get(header.kid);
    } catch {
      return { ok: false, reason: 'Access JWKS refresh failed.' };
    }
  }
  if (!jwk) {
    return { ok: false, reason: `Access signing key kid=${header.kid} not found.` };
  }

  try {
    const signingKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const data = utf8Bytes(`${headerSegment}.${payloadSegment}`);
    const signature = base64UrlToBytes(signatureSegment);
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      signingKey,
      signature as unknown as BufferSource,
      data as unknown as BufferSource,
    );
    if (!valid) {
      return { ok: false, reason: 'Access JWT signature verification failed.' };
    }
  } catch (error) {
    return {
      ok: false,
      reason: `Access JWT verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const email = payload.email ?? '';
  if (!email) {
    return { ok: false, reason: 'Access JWT carries no email identity.' };
  }
  return {
    ok: true,
    identity: {
      email,
      name: payload.common_name?.trim() || email,
      sub: payload.sub ?? '',
      identityNonce: payload.identity_nonce ?? '',
      payload,
    },
  };
}
