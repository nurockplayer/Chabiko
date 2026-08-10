import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST_CLI = resolve(ROOT, 'node_modules/vitest/vitest.mjs');
const LIVE_ACCEPTANCE_FILES = [
  'tests/supabase-basic-vocabulary-schema.test.ts',
  'tests/basic-vocabulary-supabase-repository.test.ts',
];

describe('account-sync live Supabase release gate', () => {
  it('fails closed instead of skipping when the required Supabase tooling is unavailable', () => {
    // Hide all command-line tools from the child without stopping or mutating a
    // developer's real Supabase stack. Vitest itself is launched by the current
    // Node executable, and only the two live acceptance files are selected, so
    // this command-level self-test cannot recursively invoke the full suite.
    const emptyPath = mkdtempSync(join(tmpdir(), 'chabiko-live-gate-'));
    try {
      const result = spawnSync(
        process.execPath,
        [VITEST_CLI, 'run', ...LIVE_ACCEPTANCE_FILES],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: {
            ...process.env,
            CHABIKO_REQUIRE_LIVE_SUPABASE: '1',
            PATH: emptyPath,
          },
          maxBuffer: 16 * 1024 * 1024,
          timeout: 60_000,
        },
      );
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).not.toBe(0);
      expect(output).toContain(
        'live Supabase acceptance required but unavailable: supabase CLI not installed',
      );
      expect(output).not.toContain('Test Files  2 skipped');
    } finally {
      rmSync(emptyPath, { recursive: true, force: true });
    }
  });
});
