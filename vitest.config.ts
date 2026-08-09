import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Both live Supabase suites share one local database. The schema suite
    // rebuilds it from migrations, so running the repository suite in parallel
    // can drop the database between two RPC calls in a single test. Keep only
    // these production-shaped database files on one worker; all other files
    // retain Vitest's default parallel pool.
    pool: 'forks',
    poolMatchGlobs: [
      ['tests/supabase-basic-vocabulary-schema.test.ts', 'threads'],
      ['tests/basic-vocabulary-supabase-repository.test.ts', 'threads'],
    ],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
