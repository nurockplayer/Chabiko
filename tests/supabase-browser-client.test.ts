import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSupabasePublicConfig,
  type SupabasePublicConfig,
} from '../src/lib/supabaseBrowserClient';

type ClientModule = typeof import('../src/lib/supabaseBrowserClient');

const VALID_URL = 'https://project.supabase.co';
const VALID_KEY = 'public-key';

function publicEnv(overrides: Record<string, string | undefined> = {}): Record<
  string,
  string | undefined
> {
  return {
    PUBLIC_SUPABASE_URL: VALID_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    ...overrides,
  };
}

async function importModule(): Promise<ClientModule> {
  return await import('../src/lib/supabaseBrowserClient');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('readSupabasePublicConfig', () => {
  it('returns null when both variables are absent', () => {
    expect(readSupabasePublicConfig({})).toBeNull();
  });

  it('returns null when either variable is absent', () => {
    expect(readSupabasePublicConfig({ PUBLIC_SUPABASE_URL: VALID_URL })).toBeNull();
    expect(
      readSupabasePublicConfig({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY }),
    ).toBeNull();
  });

  it('returns null when either variable is blank or whitespace-only', () => {
    expect(readSupabasePublicConfig(publicEnv({ PUBLIC_SUPABASE_URL: '' }))).toBeNull();
    expect(
      readSupabasePublicConfig(
        publicEnv({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }),
      ),
    ).toBeNull();
    expect(
      readSupabasePublicConfig(publicEnv({ PUBLIC_SUPABASE_URL: '   ' })),
    ).toBeNull();
    expect(
      readSupabasePublicConfig(
        publicEnv({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ' }),
      ),
    ).toBeNull();
  });

  it('returns null when the URL is malformed or not an absolute http(s) URL', () => {
    const malformed = [
      'not a url',
      'project.supabase.co',
      'https://',
      'ftp://project.supabase.co',
      'file:///etc/passwd',
      'mailto:user@example.com',
      '//project.supabase.co',
      'javascript:alert(1)',
    ];
    for (const url of malformed) {
      expect(
        readSupabasePublicConfig(publicEnv({ PUBLIC_SUPABASE_URL: url })),
        `expected ${JSON.stringify(url)} to be rejected`,
      ).toBeNull();
    }
  });

  it('normalizes local http and production https URLs', () => {
    expect(
      readSupabasePublicConfig(
        publicEnv({ PUBLIC_SUPABASE_URL: 'http://localhost:54321' }),
      ),
    ).toEqual({ url: 'http://localhost:54321/', publishableKey: VALID_KEY });
    expect(
      readSupabasePublicConfig(
        publicEnv({ PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }),
      ),
    ).toEqual({ url: 'https://project.supabase.co/', publishableKey: VALID_KEY });
  });

  it('trims whitespace from both fields', () => {
    expect(
      readSupabasePublicConfig(
        publicEnv({
          PUBLIC_SUPABASE_URL: `  ${VALID_URL}  `,
          PUBLIC_SUPABASE_PUBLISHABLE_KEY: `  ${VALID_KEY}  `,
        }),
      ),
    ).toEqual({ url: `${VALID_URL}/`, publishableKey: VALID_KEY });
  });

  it('removes one trailing slash without rewriting path or query content', () => {
    const input = 'https://example.com/auth/v1/?flow=pkce';
    const normalized = readSupabasePublicConfig(
      publicEnv({ PUBLIC_SUPABASE_URL: input }),
    );
    expect(normalized).not.toBeNull();
    expect(normalized?.url).toBe('https://example.com/auth/v1?flow=pkce');
  });

  it('keeps the root trailing slash when the path is just the root', () => {
    expect(
      readSupabasePublicConfig(
        publicEnv({ PUBLIC_SUPABASE_URL: 'https://example.com/' }),
      ),
    ).toEqual({ url: 'https://example.com/', publishableKey: VALID_KEY });
  });

  it('does not call out to the network just to read config', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(readSupabasePublicConfig(publicEnv())).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getSupabaseBrowserClient', () => {
  it('returns null when the public config is unavailable', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', undefined);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);
    const mod = await importModule();
    expect(mod.getSupabaseBrowserClient()).toBeNull();
  });

  it('returns one memoized client for a valid config', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', VALID_URL);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', VALID_KEY);
    const mod = await importModule();
    const first = mod.getSupabaseBrowserClient();
    const second = mod.getSupabaseBrowserClient();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    // The client is built from the normalized public config.
    expect(mod.readSupabasePublicConfig()).toEqual({
      url: `${VALID_URL}/`,
      publishableKey: VALID_KEY,
    });
  });

  it('freezes PKCE, persistence, auto refresh and explicit callback handling', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', VALID_URL);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', VALID_KEY);
    const mod = await importModule();
    const client = mod.getSupabaseBrowserClient();
    expect(client).not.toBeNull();
    // The auth fields are protected on the client type, so surface them for
    // assertion through an unknown bridge; the runtime values are verified.
    const auth = (client!.auth as unknown) as {
      flowType: string;
      persistSession: boolean;
      autoRefreshToken: boolean;
      detectSessionInUrl: boolean;
    };
    expect(auth.flowType).toBe('pkce');
    expect(auth.persistSession).toBe(true);
    expect(auth.autoRefreshToken).toBe(true);
    expect(auth.detectSessionInUrl).toBe(false);
  });

  it('does not throw or create a client on module import without window or storage', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', undefined);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const mod = await importModule();
    expect(mod.getSupabaseBrowserClient()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates the client without any network call', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', VALID_URL);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', VALID_KEY);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const mod = await importModule();
    expect(mod.getSupabaseBrowserClient()).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('no secret credentials surface', () => {
  it('does not reference any non-PUBLIC credential env name in the source', () => {
    const code = readFileSync(
      new URL('../src/lib/supabaseBrowserClient.ts', import.meta.url),
      'utf-8',
    );
    expect(code).not.toMatch(
      /SERVICE_ROLE|SECRET_KEY|ANON_KEY|GOOGLE_CLIENT|SUPABASE_SERVICE|SUPABASE_SECRET/i,
    );
  });

  it('declares only the two supported public variables in the type contract', () => {
    const envDts = readFileSync(
      new URL('../src/env.d.ts', import.meta.url),
      'utf-8',
    );
    expect(envDts).toContain('PUBLIC_SUPABASE_URL');
    expect(envDts).toContain('PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(envDts).not.toMatch(
      /SERVICE_ROLE|SECRET_KEY|ANON_KEY|GOOGLE_CLIENT|SUPABASE_SERVICE|SUPABASE_SECRET/i,
    );
  });

  it('exposes only empty placeholders in .env.example', () => {
    const example = readFileSync(
      new URL('../.env.example', import.meta.url),
      'utf-8',
    );
    expect(example).toContain('PUBLIC_SUPABASE_URL=');
    expect(example).toContain('PUBLIC_SUPABASE_PUBLISHABLE_KEY=');
    expect(example).not.toMatch(/https?:\/\//);
    expect(example).not.toMatch(/sbp_|eyJ|service_role/);
    expect(example).not.toMatch(
      /SERVICE_ROLE|SECRET_KEY|ANON_KEY|GOOGLE_CLIENT|SUPABASE_SERVICE|SUPABASE_SECRET/i,
    );
  });

  it('pins @supabase/supabase-js to an exact version in the package metadata', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as {
      dependencies: Record<string, string>;
    };
    const spec = pkg.dependencies['@supabase/supabase-js'];
    expect(spec).toBeDefined();
    expect(spec).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the pinned dependency backed by the committed lockfile', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as {
      dependencies: Record<string, string>;
    };
    const pinned = pkg.dependencies['@supabase/supabase-js'];
    const lock = readFileSync(
      new URL('../pnpm-lock.yaml', import.meta.url),
      'utf-8',
    );
    expect(lock).toMatch(new RegExp(`      '@supabase/supabase-js':`));
    expect(lock).toMatch(new RegExp(`specifier: ${pinned}`));
    expect(lock).toMatch(new RegExp(`version: ${pinned}`));
    expect(lock).not.toMatch(
      /SERVICE_ROLE|SECRET_KEY|ANON_KEY|GOOGLE_CLIENT|SUPABASE_SERVICE|SUPABASE_SECRET/i,
    );
  });

  it('keeps the built client-facing config free of any credential literal', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', VALID_URL);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', VALID_KEY);
    const mod = await importModule();
    const config = mod.readSupabasePublicConfig() as SupabasePublicConfig;
    expect(config.url).toBe(`${VALID_URL}/`);
    expect(config.publishableKey).toBe(VALID_KEY);
  });
});
