import { configDefaults, defineConfig } from 'vitest/config';

const unicodeSuites = [
  'tests/unicode-review-cli.test.ts',
  'tests/unicode-review-workflow.test.ts',
];

export default defineConfig({
  test: {
    reporters: ['default', './tests/helpers/file-progress.ts'],
    globalSetup: ['./tests/helpers/global-setup.ts'],
    clearMocks: false,
    maxWorkers: 2,
    // Let the existing subprocess and route-build deadlines report their errors.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...unicodeSuites],
          pool: 'forks',
          // Build suites share .astro/public, and live Supabase suites share a database.
          fileParallelism: false,
          // Node 26 enables native localStorage; happy-dom must own browser storage.
          execArgv: ['--no-experimental-webstorage'],
        },
      },
      {
        test: {
          name: 'unicode-review',
          // These suites use isolated artifacts and make no Astro or DB writes.
          include: unicodeSuites,
          pool: 'threads',
          fileParallelism: false,
        },
      },
    ],
  },
});
