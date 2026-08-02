import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  testMatch: '**/*.visual.spec.ts',
  outputDir: './test-results/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  updateSnapshots: 'none',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['line']],
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 0,
      threshold: 0,
      scale: 'css',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4321',
    browserName: 'chromium',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--disable-lcd-text',
        '--font-render-hinting=none',
        '--force-color-profile=srgb',
      ],
    },
  },
  webServer: {
    command:
      'corepack pnpm build && corepack pnpm exec astro preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
