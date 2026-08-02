import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

// Legacy local output (scripts/build-teacher-vocabulary-preview.py) can write
// teacher source PNG/JSON under public/assets/dev/. Those files must never
// reach a deployed build even when present locally, so the build-done hook
// removes dist/assets/dev after Astro has copied public/. This only prunes the
// dev directory; the tracked deployable teacher/AI preview assets under
// dist/assets/vocabulary/teacher-preview/ are untouched.
function pruneDevAssets() {
  return {
    name: 'prune-dev-assets',
    hooks: {
      async 'astro:build:done'({ dir }) {
        await rm(fileURLToPath(new URL('assets/dev', dir)), {
          recursive: true,
          force: true,
        });
      },
    },
  };
}

export default defineConfig({
  site: 'https://chabiko.pages.dev',
  output: 'static',
  compressHTML: true,
  integrations: [pruneDevAssets()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  // v1 is a static-first site — no backend or SSR needed.
});
