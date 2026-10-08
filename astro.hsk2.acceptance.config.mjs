import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import baseConfig from './astro.config.mjs';

const fixturePage = fileURLToPath(
  new URL('./tests/fixtures/hsk2-acceptance/index.astro', import.meta.url),
);

export default defineConfig({
  ...baseConfig,
  srcDir: './tests/fixtures/hsk2-acceptance',
  outDir: './test-results/hsk2-acceptance-dist',
  cacheDir: './node_modules/.astro-hsk2-acceptance',
  integrations: [
    ...(baseConfig.integrations ?? []),
    {
      name: 'hsk2-active-session-acceptance-fixture',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          injectRoute({ pattern: '/__acceptance/hsk2/', entrypoint: fixturePage });
        },
      },
    },
  ],
});
