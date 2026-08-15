// @vitest-environment node
/**
 * Cloudflare Access JWT verification boundary (Issue #363).
 *
 * The reviewer identity must come ONLY from a validated Access JWT, never from
 * a client-supplied field. These tests sign real RS256 JWTs with a generated
 * RSA key pair and assert the small official validation pattern rejects
 * expired/foreign-audience/forged tokens and extracts the identity correctly.
 */

import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAccessJwksCache,
  verifyAccessJwt,
  type AccessJwtPayload,
} from '../functions/teacher-review/api/access-jwt';
import {
  isEligibleReviewer,
  reviewerIdentityOf,
} from '../functions/teacher-review/api/campaign-config';

const TEAM_DOMAIN = 'https://team-test.cloudflareaccess.com';
const AUD = '4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2';

interface TestJwk {
  kid: string;
  alg: string;
  kty: string;
  n: string;
  e: string;
  [key: string]: string;
}

interface SigningSetup {
  token: string;
  payload: AccessJwtPayload;
  jwks: { keys: TestJwk[] };
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(
  payload: AccessJwtPayload,
  privateKey: KeyObject,
  kid = 'test-key-1',
): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  const signature = signer.sign(privateKey).toString('base64url');
  return `${header}.${body}.${signature}`;
}

function makeSetup(overrides: Partial<AccessJwtPayload> = {}): SigningSetup {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }) as { publicKey: KeyObject; privateKey: KeyObject };
  const exported = publicKey.export({ format: 'jwk' }) as Record<string, string>;
  const jwk = { ...exported, kid: 'test-key-1', alg: 'RS256' } as TestJwk;
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessJwtPayload = {
    aud: [AUD],
    email: 'teacher@example.com',
    common_name: 'Teacher Reviewer',
    iss: TEAM_DOMAIN,
    sub: 'user-123',
    identity_nonce: 'nonce-123',
    iat: now - 60,
    nbf: now - 60,
    exp: now + 600,
    type: 'app',
    ...overrides,
  };
  return {
    token: signJwt(payload, privateKey),
    payload,
    jwks: { keys: [jwk] },
  };
}

function fetchJsonOf(jwks: { keys: TestJwk[] }): (url: string) => Promise<unknown> {
  return async (url) => {
    expect(url).toBe(`${TEAM_DOMAIN}/cdn-cgi/access/certs`);
    return jwks;
  };
}

beforeEach(() => {
  clearAccessJwksCache();
  vi.restoreAllMocks();
});

describe('verifyAccessJwt', () => {
  it('accepts a valid RS256 token and returns the Access identity', async () => {
    const setup = makeSetup();
    const result = await verifyAccessJwt(
      setup.token,
      TEAM_DOMAIN,
      AUD,
      fetchJsonOf(setup.jwks),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.email).toBe('teacher@example.com');
    expect(result.identity.name).toBe('Teacher Reviewer');
    expect(result.identity.sub).toBe('user-123');
    expect(result.identity.identityNonce).toBe('nonce-123');
  });

  it('rejects a malformed token', async () => {
    const setup = makeSetup();
    const result = await verifyAccessJwt('not-a-jwt', TEAM_DOMAIN, AUD, fetchJsonOf(setup.jwks));
    expect(result.ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    const setup = makeSetup({ exp: Math.floor(Date.now() / 1000) - 10 });
    const result = await verifyAccessJwt(setup.token, TEAM_DOMAIN, AUD, fetchJsonOf(setup.jwks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expired/);
  });

  it('rejects a token with a mismatched audience', async () => {
    const setup = makeSetup({ aud: ['other-aud'] });
    const result = await verifyAccessJwt(setup.token, TEAM_DOMAIN, AUD, fetchJsonOf(setup.jwks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/audience/);
  });

  it('rejects a token with a mismatched issuer', async () => {
    const setup = makeSetup({ iss: 'https://other.cloudflareaccess.com' });
    const result = await verifyAccessJwt(setup.token, TEAM_DOMAIN, AUD, fetchJsonOf(setup.jwks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/issuer/);
  });

  it('rejects a token not yet valid (nbf in the future)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const setup = makeSetup({ nbf: now + 300, iat: now });
    const result = await verifyAccessJwt(setup.token, TEAM_DOMAIN, AUD, fetchJsonOf(setup.jwks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not yet valid/);
  });

  it('rejects a token with a tampered signature', async () => {
    const setup = makeSetup();
    const [header, body] = setup.token.split('.');
    const forged = `${header}.${body}.${b64url('forged-signature-bytes')}`;
    const result = await verifyAccessJwt(forged, TEAM_DOMAIN, AUD, fetchJsonOf(setup.jwks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/signature|verification/);
  });

  it('rejects a token whose signing key is unknown', async () => {
    const setup = makeSetup();
    const result = await verifyAccessJwt(
      setup.token,
      TEAM_DOMAIN,
      AUD,
      async () => ({ keys: [] as TestJwk[] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not found/);
  });

  it('rejects a token without an email identity', async () => {
    const { token, jwks } = makeSetup({ email: undefined });
    const result = await verifyAccessJwt(token, TEAM_DOMAIN, AUD, fetchJsonOf(jwks));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/email/);
  });
});

describe('reviewer eligibility mapping', () => {
  it('maps identity to the configured reviewer role and identity string', () => {
    const identity = reviewerIdentityOf('teacher@example.com', 'Teacher Reviewer');
    expect(identity.reviewerRole).toBe('human-language-reviewer');
    expect(identity.reviewerIdentity).toBe('Teacher Reviewer <teacher@example.com>');
    expect(identity.reviewerEmail).toBe('teacher@example.com');
  });

  it('treats only explicitly configured emails as eligible reviewers', () => {
    // The v1 config is deployment-bounded; a non-configured identity is NOT an
    // eligible reviewer even when it passed Access (maintainer inspection only).
    expect(isEligibleReviewer('')).toBe(false);
  });
});
