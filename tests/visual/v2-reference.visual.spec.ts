import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  V2_REFERENCE_VIEWPORTS,
  V2_REFERENCE_VISUAL_CASES,
  type V2ReferenceVisualState,
} from './v2ReferenceCases';

const BASE_URL = 'http://127.0.0.1:4321';
const ROUTE = '/v2-reference/';
const ANSWER_PATH = '/v2-reference/data/lesson-001-answer.json';
const FONT_FAMILY = 'Noto Sans JP Variable';

const require = createRequire(import.meta.url);
const fontCssPath = require.resolve(
  '@fontsource-variable/noto-sans-jp/index.css',
);
const fontFilesDirectory = join(dirname(fontCssPath), 'files');
const fixedFontCss = readFileSync(fontCssPath, 'utf8')
  .replaceAll('url(./files/', 'url(/__visual-fonts/')
  .replaceAll('font-display: swap;', 'font-display: block;');
const fixedFontOverride = `${fixedFontCss}
  *, *::before, *::after {
    font-family: '${FONT_FAMILY}', sans-serif !important;
    font-synthesis: none !important;
  }
`;

interface RuntimeAudit {
  answerRequests: string[];
  consoleErrors: string[];
  externalRequests: Set<string>;
  pageErrors: string[];
}

function watchRuntime(page: Page): RuntimeAudit {
  const audit: RuntimeAudit = {
    answerRequests: [],
    consoleErrors: [],
    externalRequests: new Set(),
    pageErrors: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === ANSWER_PATH) audit.answerRequests.push(url.pathname);
    if (url.origin !== BASE_URL) audit.externalRequests.add(url.href);
  });
  return audit;
}

async function installNetworkBoundary(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== BASE_URL) {
      await route.abort('blockedbyclient');
      return;
    }
    if (requestUrl.pathname.startsWith('/__visual-fonts/')) {
      const fileName = decodeURIComponent(
        requestUrl.pathname.slice('/__visual-fonts/'.length),
      );
      if (!/^noto-sans-jp-[\w-]+\.woff2$/.test(fileName)) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        path: join(fontFilesDirectory, fileName),
        contentType: 'font/woff2',
      });
      return;
    }
    await route.continue();
  });
}

async function installFixedFont(page: Page): Promise<void> {
  await page.addStyleTag({ content: fixedFontOverride });
  await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    await document.fonts.load(
      `400 16px "${fontFamily}"`,
      '今日 台湾 我要這個 思い出す 組み直す',
    );
    await document.fonts.load(
      `700 16px "${fontFamily}"`,
      '今日できるようになったこと',
    );
    await Promise.all(
      [...document.images].map((image) =>
        image.complete ? Promise.resolve() : image.decode(),
      ),
    );
  }, FONT_FAMILY);
}

async function expectStage(page: Page, stage: string): Promise<void> {
  await expect(page.locator('[data-v2-reference-root]')).toHaveAttribute(
    'data-v2-stage',
    stage,
  );
}

async function expectCaptureContract(
  page: Page,
  viewport: { width: number; height: number },
  audit: RuntimeAudit,
): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    bodyFont: getComputedStyle(document.body).fontFamily,
    clientWidth: document.documentElement.clientWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.innerWidth).toBe(viewport.width);
  expect(dimensions.innerHeight).toBe(viewport.height);
  expect(dimensions.clientWidth).toBe(viewport.width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyFont).toContain(FONT_FAMILY);
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.externalRequests).toEqual(new Set());
  expect(audit.pageErrors).toEqual([]);
}

async function capture(
  page: Page,
  viewport: { width: number; height: number },
  audit: RuntimeAudit,
  state: V2ReferenceVisualState,
): Promise<void> {
  const visualCase = V2_REFERENCE_VISUAL_CASES.find(
    (candidate) =>
      candidate.state === state &&
      candidate.viewport.width === viewport.width &&
      candidate.viewport.height === viewport.height,
  );
  if (!visualCase) throw new Error(`Missing V2 visual case: ${state}`);
  await expectCaptureContract(page, viewport, audit);
  await expect(page).toHaveScreenshot(
    visualCase.snapshotName,
    { fullPage: false },
  );
}

async function selectChunks(page: Page, chunks: readonly string[]): Promise<void> {
  for (const chunk of chunks) {
    await page.getByRole('button', { name: chunk, exact: true }).click();
  }
}

test.describe('/v2-reference/ complete mobile-flow visual baselines', () => {
  for (const viewport of V2_REFERENCE_VIEWPORTS) {
    test(`${viewport.width}×${viewport.height}`, async ({ page }) => {
      test.setTimeout(90_000);
      const audit = watchRuntime(page);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await installNetworkBoundary(page);
      await page.goto(ROUTE, { waitUntil: 'networkidle' });
      await installFixedFont(page);

      await expectStage(page, 'today');
      await capture(page, viewport, audit, 'today');

      await page.locator('[data-action="start-learning"]').first().click();
      await expectStage(page, 'learning');
      await capture(page, viewport, audit, 'learning');

      await page.locator('[data-action="start-retrieval"]').click();
      await expectStage(page, 'retrieval');
      expect(audit.answerRequests).toEqual([]);
      await capture(page, viewport, audit, 'retrieval');

      await selectChunks(page, ['這個', '我', '要']);
      await page.locator('[data-action="submit-retrieval"]').click();
      await expectStage(page, 'repair');
      await page.locator('[data-action="show-hint"]').click();
      expect(audit.answerRequests).toEqual([]);
      await page.locator('[data-action="reveal-answer"]').click();
      await expect(page.locator('[data-reveal-answer]')).toContainText('我要這個');
      expect(audit.answerRequests).toEqual([ANSWER_PATH]);
      await capture(page, viewport, audit, 'repair');

      await page.locator('[data-action="retry"]').click();
      await expectStage(page, 'retrieval');
      await selectChunks(page, ['我', '要', '這個']);
      await page.locator('[data-action="submit-retrieval"]').click();
      await expectStage(page, 'correct');
      await page.locator('[data-action="view-result"]').click();
      await expectStage(page, 'result');
      await capture(page, viewport, audit, 'result');
    });
  }
});
