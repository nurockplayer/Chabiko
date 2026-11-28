import { readFile, rm, writeFile } from 'node:fs/promises';
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
      async 'astro:build:done'({ dir, pages }) {
        await rm(fileURLToPath(new URL('assets/dev', dir)), {
          recursive: true,
          force: true,
        });
        // Prototype fixtures remain available to the explicit browser-test build.
        // Normal builds (including Cloudflare Pages) never publish these routes.
        if (process.env.CHABIKO_INCLUDE_DEV_ROUTES !== '1') {
          await rm(new URL('dev', dir), { recursive: true, force: true });
        }
        const locations = [];
        for (const { pathname } of pages) {
          const path = pathname.replace(/^\//, '');
          if (/^(dev|teacher-review|auth|data)(\/|$)/.test(path) || /^404(?:\/|\.html|$)/.test(path)) continue;
          const html = await readFile(new URL(`${path.replace(/\/$/, '')}${path ? '/' : ''}index.html`, dir), 'utf8');
          if (/<meta\s+name="robots"\s+content="[^"]*noindex/.test(html)) continue;
          const url = new URL(path, 'https://chabiko.pages.dev/').href;
          locations.push(`<url><loc>${url.replace(/&/g, '&amp;')}</loc></url>`);
        }
        await writeFile(new URL('sitemap.xml', dir), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.join('')}</urlset>\n`);
      },
    },
  };
}

function pagesContentSecurityPolicy() {
  let supabaseOrigin = '';
  return {
    name: 'pages-content-security-policy',
    hooks: {
      'astro:config:setup'({ updateConfig }) {
        updateConfig({ vite: { plugins: [{
          name: 'pages-csp-supabase-origin',
          apply: 'build',
          configResolved({ env }) {
            const url = URL.parse(env.PUBLIC_SUPABASE_URL?.trim() ?? '');
            if (env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
                (url?.protocol === 'https:' || url?.protocol === 'http:')) {
              supabaseOrigin = ` ${url.origin}`;
            }
          },
        }] } });
      },
      async 'astro:build:done'({ dir }) {
        const headersFile = new URL('_headers', dir);
        const headers = await readFile(headersFile, 'utf8');
        await writeFile(headersFile, headers.replace(' __SUPABASE_ORIGIN__', supabaseOrigin));
      },
    },
  };
}

export default defineConfig({
  site: 'https://chabiko.pages.dev',
  output: 'static',
  compressHTML: true,
  integrations: [pruneDevAssets(), pagesContentSecurityPolicy()],
  build: { inlineStylesheets: 'never' },
  // Astro also uses this threshold when deciding whether to inline scripts.
  vite: { build: { assetsInlineLimit: 0 } },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  // v1 is a static-first site — no backend or SSR needed.
});
