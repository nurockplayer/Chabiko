import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { VISUAL_THEMES, VISUAL_VIEWPORTS } from './matrix';

const BASE_URL = 'http://127.0.0.1:4321';
const ROUTE = '/paths/taiwan-travel/';
const FONT_FAMILY = 'Noto Sans JP Variable';
const THEME_STORAGE_KEY = 'chabiko_theme';

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

async function installFixedFont(page: Page): Promise<void> {
  await page.addStyleTag({ content: fixedFontOverride });
  const state = await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    const regular = await document.fonts.load(
      `400 16px "${fontFamily}"`,
      '台湾旅行 レッスン 総合テスト',
    );
    const bold = await document.fonts.load(
      `700 16px "${fontFamily}"`,
      '夜市 注文 値段 場所',
    );
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      regular: regular.length,
      bold: bold.length,
    };
  }, FONT_FAMILY);
  expect(state.bodyFont).toContain(FONT_FAMILY);
  expect(state.regular).toBeGreaterThan(0);
  expect(state.bold).toBeGreaterThan(0);
}

async function assertControlsInsideSurface(page: Page): Promise<void> {
  const violations = await page.locator('[data-taiwan-travel-path]').evaluate(
    (surface) => {
      const surfaceRect = surface.getBoundingClientRect();
      const controls = [
        ...surface.querySelectorAll<HTMLElement>(
          'a[href], button, select, input:not([type="hidden"]), summary',
        ),
      ];
      return controls.flatMap((control) => {
        const rect = control.getBoundingClientRect();
        const contained =
          rect.top >= surfaceRect.top &&
          rect.left >= surfaceRect.left &&
          rect.bottom <= surfaceRect.bottom &&
          rect.right <= surfaceRect.right;
        return contained
          ? []
          : [`${control.tagName}.${control.className} ${JSON.stringify(rect.toJSON())}`];
      });
    },
  );
  expect(violations).toEqual([]);
}

for (const theme of VISUAL_THEMES) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test(`${theme} ${viewport.width}x${viewport.height}: route index capture`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        [THEME_STORAGE_KEY, theme] as const,
      );
      const externalRequests = await installNetworkBoundary(page);

      await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'load' });
      await expect(page.locator('[data-taiwan-travel-path]')).toBeVisible();
      await installFixedFont(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('[data-taiwan-lesson-link]')).toHaveCount(10);
      await expect(
        page.locator('a[href="/paths/taiwan-travel/quiz/"]'),
      ).toHaveCount(1);

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

      const surface = page.locator('[data-taiwan-travel-path]');
      const surfaceSize = await surface.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      }));
      await assertControlsInsideSurface(page);
      const screenshot = await surface.screenshot({
        animations: 'disabled',
        caret: 'hide',
      });
      expect(
        Math.abs(screenshot.readUInt32BE(16) - surfaceSize.width),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(screenshot.readUInt32BE(20) - surfaceSize.height),
      ).toBeLessThanOrEqual(2);
      await testInfo.attach(
        `taiwan-travel-path-${theme}-${viewport.width}x${viewport.height}.png`,
        { body: screenshot, contentType: 'image/png' },
      );

      expect([...externalRequests]).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
