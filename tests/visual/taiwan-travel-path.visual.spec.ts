import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  TAIWAN_TRAVEL_PATH_VIEWPORTS,
  TAIWAN_TRAVEL_PATH_VISUAL_CASES,
} from './taiwanTravelPathCases';

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

async function openTaiwanTravelPath(
  page: Page,
  theme: 'light' | 'dark',
  viewport: { width: number; height: number },
): Promise<{ errors: string[]; externalRequests: Set<string> }> {
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
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.innerWidth).toBe(viewport.width);
  expect(dimensions.innerHeight).toBe(viewport.height);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  return { errors, externalRequests };
}

const VIEWPORT_EPSILON = 1;

async function assertFragmentInsideViewport(
  page: Page,
  fragmentSelector: string,
  evidenceSelectors: readonly string[],
): Promise<ReturnType<Page['locator']>> {
  const fragment = page.locator(fragmentSelector);
  await expect(fragment).toBeVisible();
  await fragment.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );

  const selectors = [fragmentSelector, ...evidenceSelectors];
  for (const selector of selectors) {
    const locator = selector === fragmentSelector
      ? fragment
      : fragment.locator(selector);
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `missing evidence element '${selector}'`).not.toBeNull();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(box!.x, `${selector} left`).toBeGreaterThanOrEqual(-VIEWPORT_EPSILON);
    expect(box!.x + box!.width, `${selector} right`).toBeLessThanOrEqual(
      viewport.width + VIEWPORT_EPSILON,
    );
    expect(box!.y, `${selector} top`).toBeGreaterThanOrEqual(-VIEWPORT_EPSILON);
    expect(box!.y + box!.height, `${selector} bottom`).toBeLessThanOrEqual(
      viewport.height + VIEWPORT_EPSILON,
    );
  }

  const controlBoxes = await fragment.evaluate((element) => {
    const controlSelector =
      'a[href], button, select, input:not([type="hidden"]), summary';
    const controls = [
      ...(element.matches(controlSelector) ? [element] : []),
      ...element.querySelectorAll<HTMLElement>(controlSelector),
    ];
    return controls.map((control) => ({
      label: `${control.tagName}.${control.className}`,
      box: control.getBoundingClientRect().toJSON(),
    }));
  });
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  for (const control of controlBoxes) {
    expect(control.box.left, `${control.label} left`).toBeGreaterThanOrEqual(
      -VIEWPORT_EPSILON,
    );
    expect(control.box.right, `${control.label} right`).toBeLessThanOrEqual(
      viewport.width + VIEWPORT_EPSILON,
    );
    expect(control.box.top, `${control.label} top`).toBeGreaterThanOrEqual(
      -VIEWPORT_EPSILON,
    );
    expect(control.box.bottom, `${control.label} bottom`).toBeLessThanOrEqual(
      viewport.height + VIEWPORT_EPSILON,
    );
  }
  return fragment;
}

test.describe('/paths/taiwan-travel/ visual baselines', () => {
  for (const visualCase of TAIWAN_TRAVEL_PATH_VISUAL_CASES) {
    test(visualCase.snapshotName, async ({ page }) => {
      const { errors, externalRequests } = await openTaiwanTravelPath(
        page,
        visualCase.theme,
        visualCase.viewport,
      );
      const lessonFragment = await assertFragmentInsideViewport(
        page,
        '[data-taiwan-lesson-link="lesson-001"]',
        [
          '.taiwan-path-lesson__number',
          '.taiwan-path-lesson__title',
          '.taiwan-path-lesson__outcome',
          '.taiwan-path-lesson__action',
        ],
      );
      await expect(lessonFragment).toHaveScreenshot(visualCase.snapshotName);
      expect([...externalRequests]).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('/paths/taiwan-travel/ viewport fragments', () => {
  for (const viewport of TAIWAN_TRAVEL_PATH_VIEWPORTS) {
    test(`${viewport.width}px lesson endpoints and assessment are fully contained`, async ({
      page,
    }) => {
      const { errors, externalRequests } = await openTaiwanTravelPath(
        page,
        'light',
        viewport,
      );
      for (const lessonId of ['lesson-001', 'lesson-010']) {
        await assertFragmentInsideViewport(
          page,
          `[data-taiwan-lesson-link="${lessonId}"]`,
          [
            '.taiwan-path-lesson__number',
            '.taiwan-path-lesson__title',
            '.taiwan-path-lesson__outcome',
            '.taiwan-path-lesson__action',
          ],
        );
      }
      await assertFragmentInsideViewport(page, '.taiwan-path-assessment', [
        '#taiwan-path-assessment-heading',
        '.taiwan-path-assessment__link',
      ]);
      expect([...externalRequests]).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
