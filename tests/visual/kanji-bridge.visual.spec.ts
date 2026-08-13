import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { assertElementsWithinViewport } from './learnerRouteHelpers';
import { KANJI_BRIDGE_VISUAL_CASES } from './kanjiBridgeCases';

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
      '関係で絞り込む 全50件 同じ意味',
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

/** Load /vocabulary/kanji-bridge/ with the given query and align to the top. */
async function openKanjiBridge(
  page: Page,
  search: string,
): Promise<Set<string>> {
  const externalRequests = await installNetworkBoundary(page);
  await page.goto(`${BASE_URL}/vocabulary/kanji-bridge/${search}`, {
    waitUntil: 'load',
  });
  await installFixedFont(page);
  await expect(page.locator('[data-kanji-bridge-page]')).toBeVisible();
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

test.describe('/vocabulary/kanji-bridge/ visual baselines', () => {
  for (const visualCase of KANJI_BRIDGE_VISUAL_CASES) {
    test(`${visualCase.snapshotName}`, async ({ page }) => {
      await page.setViewportSize(visualCase.viewport);
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      const externalRequests = await openKanjiBridge(page, visualCase.search);

      // The toolbar reflects the state: full corpus vs the 15-item subset.
      if (visualCase.search === '') {
        await expect(page.locator('[data-relation-count]')).toHaveText('全50件');
      } else {
        await expect(page.locator('[data-relation-count]')).toHaveText('15件');
      }

      await assertCaptureContract(page, visualCase.viewport, externalRequests);
      await expect(page).toHaveScreenshot(visualCase.snapshotName, {
        fullPage: false,
      });
    });
  }
});

test.describe('/vocabulary/kanji-bridge/ behavior, viewport, console', () => {
  const VIEWPORTS = KANJI_BRIDGE_VISUAL_CASES.map((visualCase) => visualCase.viewport)
    .filter(
      (viewport, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.width === viewport.width && candidate.height === viewport.height,
        ) === index,
    );

  for (const viewport of VIEWPORTS) {
    test(`key toolbar + entry controls fully inside the ${viewport.width}px viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      const externalRequests = await openKanjiBridge(page, '');

      // The toolbar select/count/reset and the first entry card's headword,
      // provenance, and example are all horizontally contained.
      await assertElementsWithinViewport(page, [
        '#kanji-bridge-relation-filter',
        '.kanji-bridge-toolbar__reset',
        '[data-relation-count]',
        '.kanji-bridge-entry:first-of-type .kanji-bridge-entry__headword',
        '.kanji-bridge-entry:first-of-type .kanji-bridge-entry__provenance',
      ]);

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect([...externalRequests]).toEqual([]);
    });
  }

  test('filtering via the native select updates the count and the URL', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await openKanjiBridge(page, '');

    const select = page.locator('#kanji-bridge-relation-filter');
    await expect(select).toHaveValue('all');
    await select.selectOption('false-friend');
    await expect(page.locator('[data-relation-count]')).toHaveText('15件');
    await expect(page).toHaveURL(/\/vocabulary\/kanji-bridge\/\?relation=false-friend$/);
  });

  test('reset link returns to the unfiltered full corpus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await openKanjiBridge(page, '?relation=false-friend');
    await expect(page.locator('[data-relation-count]')).toHaveText('15件');

    await page.locator('.kanji-bridge-toolbar__reset').click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/vocabulary\/kanji-bridge\/$/);
    await expect(page.locator('[data-relation-count]')).toHaveText('全50件');
  });

  test('console: no errors for the default and filtered surfaces', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

    await openKanjiBridge(page, '');
    await expect(page.locator('[data-relation-count]')).toHaveText('全50件');
    await openKanjiBridge(page, '?relation=false-friend');
    await expect(page.locator('[data-relation-count]')).toHaveText('15件');
    expect(errors).toEqual([]);
  });
});
