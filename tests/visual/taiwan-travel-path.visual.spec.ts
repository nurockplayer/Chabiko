import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  expect,
  test,
  type Page,
  type PageScreenshotOptions,
} from '@playwright/test';
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
  await expect(page.locator('[data-taiwan-lesson-link]')).toHaveCount(24);
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
const CAPTURE_GUTTER = 16;

type CaptureClip = NonNullable<PageScreenshotOptions['clip']>;

async function assertLocatorInsideCapture(
  page: Page,
  selector: string,
  clip: CaptureClip,
): Promise<void> {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `missing evidence element '${selector}'`).not.toBeNull();
  expect(box!.x, `${selector} capture left`).toBeGreaterThanOrEqual(
    clip.x - VIEWPORT_EPSILON,
  );
  expect(box!.x + box!.width, `${selector} capture right`).toBeLessThanOrEqual(
    clip.x + clip.width + VIEWPORT_EPSILON,
  );
  expect(box!.y, `${selector} capture top`).toBeGreaterThanOrEqual(
    clip.y - VIEWPORT_EPSILON,
  );
  expect(box!.y + box!.height, `${selector} capture bottom`).toBeLessThanOrEqual(
    clip.y + clip.height + VIEWPORT_EPSILON,
  );
}

async function assertCaptureInsideViewport(
  page: Page,
  clip: CaptureClip,
  evidenceSelectors: readonly string[],
): Promise<void> {
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(clip.x).toBeGreaterThanOrEqual(0);
  expect(clip.y).toBeGreaterThanOrEqual(0);
  expect(clip.x + clip.width).toBeLessThanOrEqual(viewport.width);
  expect(clip.y + clip.height).toBeLessThanOrEqual(viewport.height);

  for (const selector of evidenceSelectors) {
    await assertLocatorInsideCapture(page, selector, clip);
  }

  const controls = await page.locator('body').evaluate((body, capture) => {
    const controlSelector =
      'a[href], button, select, input:not([type="hidden"]), summary';
    return [...body.querySelectorAll<HTMLElement>(controlSelector)]
      .map((control) => {
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return {
          label: `${control.tagName}.${control.className}`,
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0 &&
            box.height > 0,
          intersectsCapture:
            box.right > capture.x &&
            box.left < capture.x + capture.width &&
            box.bottom > capture.y &&
            box.top < capture.y + capture.height,
          box: box.toJSON(),
        };
      })
      .filter((control) => control.visible && control.intersectsCapture);
  }, clip);

  expect(controls.length, 'capture must include interactive evidence').toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.box.left, `${control.label} capture left`).toBeGreaterThanOrEqual(
      clip.x - VIEWPORT_EPSILON,
    );
    expect(control.box.right, `${control.label} capture right`).toBeLessThanOrEqual(
      clip.x + clip.width + VIEWPORT_EPSILON,
    );
    expect(control.box.top, `${control.label} capture top`).toBeGreaterThanOrEqual(
      clip.y - VIEWPORT_EPSILON,
    );
    expect(control.box.bottom, `${control.label} capture bottom`).toBeLessThanOrEqual(
      clip.y + clip.height + VIEWPORT_EPSILON,
    );
  }
}

async function prepareTopCapture(page: Page): Promise<CaptureClip> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const firstLesson = page.locator('[data-taiwan-lesson-link="lesson-001"]');
  const nextRowLesson = page.locator(
    `[data-taiwan-lesson-link="${
      viewport!.width >= 768 ? 'lesson-003' : 'lesson-002'
    }"]`,
  );
  await expect(firstLesson).toBeVisible();
  await expect(nextRowLesson).toBeVisible();
  const firstBox = await firstLesson.boundingBox();
  const nextRowBox = await nextRowLesson.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(nextRowBox).not.toBeNull();

  const clip: CaptureClip = {
    x: 0,
    y: 0,
    width: viewport!.width,
    height: Math.floor((firstBox!.y + firstBox!.height + nextRowBox!.y) / 2),
  };
  const earlyLessonEvidence = [
    '[data-taiwan-lesson-link="lesson-001"]',
    ...(clip.width >= 768
      ? ['[data-taiwan-lesson-link="lesson-002"]']
      : []),
  ];
  await assertCaptureInsideViewport(page, clip, [
    '.site-header',
    '.breadcrumb',
    '.taiwan-path-intro',
    '.taiwan-path-index__heading',
    ...earlyLessonEvidence,
  ]);
  return clip;
}

async function prepareEndCapture(page: Page): Promise<CaptureClip> {
  const finalLesson = page.locator('[data-taiwan-lesson-link="lesson-024"]');
  const assessment = page.locator('.taiwan-path-assessment');
  await expect(finalLesson).toBeVisible();
  await expect(assessment).toBeVisible();
  await assessment.evaluate((element) =>
    element.scrollIntoView({ block: 'end', inline: 'nearest' }),
  );

  const finalBox = await finalLesson.boundingBox();
  const assessmentBox = await assessment.boundingBox();
  expect(finalBox).not.toBeNull();
  expect(assessmentBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const previousRowLesson = page.locator(
    `[data-taiwan-lesson-link="${
      viewport!.width >= 768 ? 'lesson-022' : 'lesson-023'
    }"]`,
  );
  const previousRowBox = await previousRowLesson.boundingBox();
  expect(previousRowBox).not.toBeNull();
  const previousRowBottom = previousRowBox!.y + previousRowBox!.height;
  const top = Math.max(
    0,
    Math.floor((previousRowBottom + finalBox!.y) / 2),
  );
  const bottom = Math.min(
    viewport!.height,
    Math.ceil(assessmentBox!.y + assessmentBox!.height + CAPTURE_GUTTER),
  );
  const clip: CaptureClip = {
    x: 0,
    y: top,
    width: viewport!.width,
    height: bottom - top,
  };
  const finalLessonEvidence = [
    '[data-taiwan-lesson-link="lesson-024"]',
    ...(clip.width >= 768
      ? ['[data-taiwan-lesson-link="lesson-023"]']
      : []),
  ];
  await assertCaptureInsideViewport(page, clip, [
    ...finalLessonEvidence,
    '[data-taiwan-lesson-link="lesson-024"] .taiwan-path-lesson__number',
    '[data-taiwan-lesson-link="lesson-024"] .taiwan-path-lesson__title',
    '[data-taiwan-lesson-link="lesson-024"] .taiwan-path-lesson__outcome',
    '[data-taiwan-lesson-link="lesson-024"] .taiwan-path-lesson__action',
    '.taiwan-path-assessment',
    '#taiwan-path-assessment-heading',
    '.taiwan-path-assessment__link',
  ]);
  return clip;
}

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
      const clip = visualCase.state === 'top'
        ? await prepareTopCapture(page)
        : await prepareEndCapture(page);
      await expect(page).toHaveScreenshot(visualCase.snapshotName, { clip });
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
      for (const lessonId of ['lesson-001', 'lesson-024']) {
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
