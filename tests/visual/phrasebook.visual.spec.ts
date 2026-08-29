import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { assertElementsWithinViewport } from './learnerRouteHelpers';
import { PHRASEBOOK_VISUAL_CASES } from './phrasebookCases';

const BASE_URL = 'http://127.0.0.1:4321';
const FONT_FAMILY = 'Noto Sans JP Variable';
const EMERGENCY_SCENARIO =
  '[data-phrasebook-scenario][data-scenario="emergency"]';
const VIEWPORT_EPSILON = 1;

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

/** Position one deterministic capture anchor below the sticky header without
 * changing the URL or filter state. Aligning on a block boundary avoids
 * cutting preceding learner text through the viewport's top edge. */
async function positionCaptureBelowHeader(
  page: Page,
  selector: string,
): Promise<void> {
  const anchor = page.locator(selector);
  await expect(anchor).toBeVisible();
  await anchor.evaluate((element) => {
    const header = document.querySelector('header');
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(0, absoluteTop - headerHeight - 24),
      left: 0,
      behavior: 'auto',
    });
  });
}

/** Assert that every required evidence element is fully inside the *current*
 * captured viewport. This deliberately does not scroll between selectors, so
 * all asserted boxes describe the same PNG state. */
async function assertCurrentViewportContains(
  page: Page,
  selectors: readonly string[],
): Promise<void> {
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  for (const selector of selectors) {
    const locator = page.locator(selector);
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `missing element for '${selector}'`).not.toBeNull();
    expect(box!.x, `${selector} left`).toBeGreaterThanOrEqual(-VIEWPORT_EPSILON);
    expect(box!.x + box!.width, `${selector} right`).toBeLessThanOrEqual(
      viewport.width + VIEWPORT_EPSILON,
    );
    expect(box!.y, `${selector} top`).toBeGreaterThanOrEqual(-VIEWPORT_EPSILON);
    expect(box!.y + box!.height, `${selector} bottom`).toBeLessThanOrEqual(
      viewport.height + VIEWPORT_EPSILON,
    );
  }
}

async function prepareCaptureState(
  page: Page,
  capture: (typeof PHRASEBOOK_VISUAL_CASES)[number]['capture'],
): Promise<void> {
  if (capture === 'overview') return;

  const emergency = page.locator(EMERGENCY_SCENARIO);
  await expect(emergency).toBeVisible();
  for (const scenario of [
    'airport',
    'transport',
    'food',
    'shopping',
    'hotel',
  ]) {
    await expect(
      page.locator(
        `[data-phrasebook-scenario][data-scenario="${scenario}"]`,
      ),
    ).toBeHidden();
  }

  if (capture === 'emergency-heading') {
    const heading = `${EMERGENCY_SCENARIO} .phrasebook-scenario__heading`;
    await positionCaptureBelowHeader(page, heading);
    await assertCurrentViewportContains(page, [heading]);
    return;
  }

  if (capture === 'emergency-dialog') {
    const dialogHeading = `${EMERGENCY_SCENARIO} .phrasebook-dialog__heading`;
    const firstTurn = `${EMERGENCY_SCENARIO} [data-phrasebook-dialog-turn]:first-child`;
    await positionCaptureBelowHeader(page, dialogHeading);
    await assertCurrentViewportContains(page, [dialogHeading, firstTurn]);
    return;
  }

  const fourthTurn = `${EMERGENCY_SCENARIO} [data-phrasebook-dialog-turn]:nth-child(4)`;
  const fifthTurn = `${EMERGENCY_SCENARIO} [data-phrasebook-dialog-turn]:nth-child(5)`;
  const sixthTurn = `${EMERGENCY_SCENARIO} [data-phrasebook-dialog-turn]:nth-child(6)`;
  const references = `${EMERGENCY_SCENARIO} .phrasebook-dialog__references`;
  await positionCaptureBelowHeader(page, fourthTurn);
  await assertCurrentViewportContains(page, [
    fourthTurn,
    fifthTurn,
    sixthTurn,
    references,
  ]);
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
        if (visualCase.capture === 'overview' || scenario === 'emergency') {
          await expect(group).toBeVisible();
        } else {
          await expect(group).toBeHidden();
        }
        await expect(group.locator('[data-phrasebook-entry]')).toHaveCount(5);
        await expect(group.locator('[data-phrasebook-dialog]')).toHaveCount(1);
      }

      await prepareCaptureState(page, visualCase.capture);
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
