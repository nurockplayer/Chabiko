import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // These production-shaped suites mutate process-external shared resources:
    // the live Supabase database or Astro's repository-local .astro cache.
    // Keep them on one worker so resets and builds cannot invalidate another
    // suite mid-operation; all other files retain the parallel fork pool.
    pool: 'forks',
    poolMatchGlobs: [
      ['tests/supabase-basic-vocabulary-schema.test.ts', 'threads'],
      ['tests/basic-vocabulary-supabase-repository.test.ts', 'threads'],
      ['tests/build/teacher-preview-build.test.ts', 'threads'],
      ['tests/learning-paths-route.test.ts', 'threads'],
    ],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
