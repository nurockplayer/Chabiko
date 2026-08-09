import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Some production-shaped suites mutate process-external shared resources:
    // the live Supabase database or Astro's repository-local .astro cache.
    // File-pattern pool routing is path-shape dependent and can silently leave
    // those suites concurrent. Serialize test files as a fail-closed invariant
    // so a reset or build can never invalidate another suite mid-operation.
    pool: 'forks',
    fileParallelism: false,
  },
});
