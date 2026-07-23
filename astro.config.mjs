import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://chabiko.pages.dev',
  output: 'static',
  compressHTML: true,
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  // v1 is a static-first site — no backend or SSR needed.
});
