import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { assertElementsWithinViewport } from './learnerRouteHelpers';
import { PHRASEBOOK_VISUAL_CASES } from './phrasebookCases';

const BASE_URL = 'http://127.0.0.1:4321';
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
  :root {
    --font-ja: '${FONT_FAMILY}', sans-serif !important;
    --font-zh: '${FONT_FAMILY}', sans-serif !important;
    --font-pinyin: '${FONT_FAMILY}', sans-serif !important;
  }
  *, *::before, *::after {
    font-family: '${FONT_FAMILY}', sans-serif !important;
    font-synthesis: none !important;
  }
`;

async function installFixedFont(page: Page): Promise<void> {
  await page.addStyleTag({ content: fixedFontOverride });
  await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    await document.fonts.load(
      `400 16px "${fontFamily}"`,
      'ホーム 台湾 中国語 Chabiko',
    );
    await document.fonts.load(
      `700 16px "${fontFamily}"`,
      'フレーズ 会話 意味 使い方 レビュー',
    );
  }, FONT_FAMILY);
}

/** Route same-origin asset requests and fulfill the fixed fonts from the local
 * package, aborting anything else, so captures are deterministic. Returns the
 * set of aborted external request URLs. */
async function installNetworkBoundary(page: Page): Promise<Set<string>> {
  const externalRequests = new Set<string>();
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== BASE_URL) {
      externalRequests.add(requestUrl.href);
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
  return externalRequests;
}

/** Load /phrasebook/ with the given query and align to the top. */
async function openPhrasebook(
  page: Page,
  search: string,
): Promise<Set<string>> {
  const externalRequests = await installNetworkBoundary(page);
  await page.goto(`${BASE_URL}/phrasebook/${search}`, {
    waitUntil: 'load',
  });
  await installFixedFont(page);
  await expect(page.locator('[data-phrasebook-page]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  return externalRequests;
}

/** Assert the capture contract: fixed viewport, no horizontal overflow, the
 * fixed font in effect, and no external requests. */
async function assertCaptureContract(
  page: Page,
  viewport: { width: number; height: number },
  externalRequests: Set<string>,
): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyFont: getComputedStyle(document.body).fontFamily,
  }));
  expect(dimensions.innerWidth).toBe(viewport.width);
  expect(dimensions.innerHeight).toBe(viewport.height);
  expect(dimensions.clientWidth).toBe(viewport.width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyFont).toContain(FONT_FAMILY);
  expect([...externalRequests]).toEqual([]);
}

test.describe('/phrasebook/ visual baselines (exact prelaunch corpus)', () => {
  for (const visualCase of PHRASEBOOK_VISUAL_CASES) {
    test(`${visualCase.snapshotName}`, async ({ page }) => {
      await page.setViewportSize(visualCase.viewport);
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      const externalRequests = await openPhrasebook(page, visualCase.search);

      // The bounded prelaunch surface renders the exact canonical corpus.
      await expect(page.locator('[data-phrasebook-entry]')).toHaveCount(30);
      await expect(page.locator('[data-phrasebook-dialog]')).toHaveCount(6);
      await expect(page.locator('[data-phrasebook-dialog-turn]')).toHaveCount(36);
      await expect(page.locator('[data-phrasebook-pending]')).toHaveCount(0);
      await expect(page.locator('[data-phrasebook-no-match]')).toBeHidden();
      for (const scenario of [
        'airport',
        'transport',
        'food',
        'shopping',
        'hotel',
        'emergency',
      ]) {
        const group = page.locator(
          `[data-phrasebook-scenario][data-scenario="${scenario}"]`,
        );
        await expect(group).toBeVisible();
        await expect(group.locator('[data-phrasebook-entry]')).toHaveCount(5);
        await expect(group.locator('[data-phrasebook-dialog]')).toHaveCount(1);
      }

      await assertCaptureContract(page, visualCase.viewport, externalRequests);
      await expect(page).toHaveScreenshot(visualCase.snapshotName, {
        fullPage: false,
      });
    });
  }
});

test.describe('/phrasebook/ behavior, viewport, console', () => {
  const VIEWPORTS = PHRASEBOOK_VISUAL_CASES.map((visualCase) => visualCase.viewport)
    .filter(
      (viewport, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.width === viewport.width && candidate.height === viewport.height,
        ) === index,
    );

  for (const viewport of VIEWPORTS) {
    test(`toolbar + first scenario inside the ${viewport.width}px viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      const externalRequests = await openPhrasebook(page, '');

      // The header, filter toolbar, and first scenario's heading are all
      // horizontally contained (no horizontal
      // overflow at any Issue #205 viewport), including the native select and
      // the count status line. The whole scenario section is intentionally
      // taller than the viewport, so a single short heading is the
      // horizontal-containment probe.
      await assertElementsWithinViewport(page, [
        'header',
        '[data-phrasebook-toolbar]',
        '[data-phrasebook-scenario][data-scenario="airport"] .phrasebook-scenario__heading',
      ]);

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect([...externalRequests]).toEqual([]);
    });
  }

  test('console: no errors for the canonical prelaunch phrasebook surface', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

    await openPhrasebook(page, '');
    await expect(page.locator('[data-phrasebook-entry]')).toHaveCount(30);
    expect(errors).toEqual([]);
  });
});
