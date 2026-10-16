import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    reporters: ['default', './tests/helpers/file-progress.ts'],
    globalSetup: ['./tests/helpers/global-setup.ts'],
    // Node 26 enables native localStorage; happy-dom must own browser storage.
    // This flag is also supported by the Node 24 CI runtime.
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
    // Keep every file in the serial forks pool by default: build suites share
    // .astro/public, and live Supabase suites share a database. Only these two
    // audited suites (isolated workflow artifacts; no Astro/DB writes) get a separate
    // serial pool. A missing/renamed allowlist entry falls back to serial forks.
    pool: 'forks',
    poolMatchGlobs: [
      ['**/tests/unicode-review-cli.test.ts', 'threads'],
      ['**/tests/unicode-review-workflow.test.ts', 'threads'],
    ],
    // Vitest 2 applies this limit within each pool; at most two outer-suite
    // workers run at a time. Keep worker/module isolation enabled (the default) in both pools.
    fileParallelism: false,
  },
});
