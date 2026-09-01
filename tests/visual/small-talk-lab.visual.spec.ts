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
  SMALL_TALK_LAB_VISUAL_CASES,
  type SmallTalkLabState,
} from './smallTalkLabCases';

const BASE_URL = 'http://127.0.0.1:4321';
const FONT_FAMILY = 'Noto Sans JP Variable';
const SENTINEL_KEY = 'small-talk-lab-test-sentinel';
const SENTINEL_VALUE = 'keep-production-state-untouched';
const require = createRequire(import.meta.url);
const fontCssPath = require.resolve('@fontsource-variable/noto-sans-jp/index.css');
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

type Viewport = { width: number; height: number };
const CONTAINMENT_VIEWPORTS: readonly Viewport[] = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

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
  await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    await document.fonts.load(`400 16px "${fontFamily}"`, '会話を一往復先へ');
    await document.fonts.load(`700 16px "${fontFamily}"`, '会話の証拠を振り返る');
  }, FONT_FAMILY);
}

async function openSmallTalkLab(
  page: Page,
  viewport: Viewport,
): Promise<{ externalRequests: Set<string>; errors: string[] }> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [SENTINEL_KEY, SENTINEL_VALUE] as const,
  );
  const externalRequests = await installNetworkBoundary(page);
  await page.goto(`${BASE_URL}/dev/small-talk/`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await installFixedFont(page);
  await expect(page.locator('[data-small-talk-lab-root]')).toBeVisible();
  await expect(page.locator('[data-small-talk-mission]')).toBeVisible();
  return { externalRequests, errors };
}

async function assertContract(
  page: Page,
  viewport: Viewport,
  externalRequests: Set<string>,
  errors: string[],
): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    bodyFont: getComputedStyle(document.body).fontFamily,
    sentinel: localStorage.getItem('small-talk-lab-test-sentinel'),
  }));
  expect(dimensions.innerWidth).toBe(viewport.width);
  expect(dimensions.innerHeight).toBe(viewport.height);
  expect(dimensions.clientWidth).toBe(viewport.width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyFont).toContain(FONT_FAMILY);
  expect(dimensions.sentinel).toBe(SENTINEL_VALUE);
  expect([...externalRequests]).toEqual([]);
  expect(errors).toEqual([]);
}

type CaptureClip = NonNullable<PageScreenshotOptions['clip']>;

async function prepareCapture(
  page: Page,
  selectors: readonly string[],
): Promise<CaptureClip> {
  const boxes = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    await expect(locator).toBeVisible();
    if (boxes.length === 0) {
      await locator.evaluate((element) =>
        element.scrollIntoView({ block: 'start', inline: 'nearest' }),
      );
    }
    const box = await locator.boundingBox();
    expect(box, `missing evidence element '${selector}'`).not.toBeNull();
    boxes.push({ selector, box: box! });
  }
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const gutter = 8;
  const top = Math.max(0, Math.min(...boxes.map(({ box }) => box.y)) - gutter);
  const bottom = Math.min(
    viewport.height,
    Math.max(...boxes.map(({ box }) => box.y + box.height)) + gutter,
  );
  const clip = { x: 0, y: top, width: viewport.width, height: bottom - top };
  expect(clip.y).toBeGreaterThanOrEqual(0);
  expect(clip.y + clip.height).toBeLessThanOrEqual(viewport.height);
  expect(clip.height, 'evidence fragment must fit inside one viewport').toBeLessThanOrEqual(viewport.height);
  return clip;
}

async function assertCaptureContract(
  page: Page,
  clip: CaptureClip,
  selectors: readonly string[],
): Promise<void> {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(clip.width).toBe(viewport.width);
  expect(clip.height).toBeLessThanOrEqual(viewport.height);
  for (const selector of selectors) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `missing evidence element '${selector}'`).not.toBeNull();
    expect(box!.x, `${selector} left`).toBeGreaterThanOrEqual(clip.x - 1);
    expect(box!.x + box!.width, `${selector} right`).toBeLessThanOrEqual(clip.x + clip.width + 1);
    expect(box!.y, `${selector} top`).toBeGreaterThanOrEqual(clip.y - 1);
    expect(box!.y + box!.height, `${selector} bottom`).toBeLessThanOrEqual(clip.y + clip.height + 1);
  }
  const result = await page.evaluate((capture) => {
    const controls = [...document.querySelectorAll<HTMLElement>(
      'a[href], button, select, input:not([type="hidden"]), summary',
    )].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.width > 0 && rect.height > 0;
      const intersects = rect.right > capture.x && rect.left < capture.x + capture.width &&
        rect.bottom > capture.y && rect.top < capture.y + capture.height;
      return {
        label: element.getAttribute('aria-label') ?? element.textContent?.trim(),
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        visible,
        intersects,
      };
    }).filter((control) => control.visible && control.intersects);
    return { controls, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
  }, clip);
  expect(result.scrollWidth).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  for (const control of result.controls) {
    expect(control.rect.left, `${control.label ?? 'control'} left`).toBeGreaterThanOrEqual(clip.x - 1);
    expect(control.rect.right, `${control.label ?? 'control'} right`).toBeLessThanOrEqual(clip.x + clip.width + 1);
    expect(control.rect.top, `${control.label ?? 'control'} top`).toBeGreaterThanOrEqual(clip.y - 1);
    expect(control.rect.bottom, `${control.label ?? 'control'} bottom`).toBeLessThanOrEqual(clip.y + clip.height + 1);
  }
}

async function selectStrategy(page: Page, strategyId: string): Promise<void> {
  const strategy = page.locator(`[data-small-talk-strategy="${strategyId}"]`);
  await expect(strategy).toBeVisible();
  await strategy.click();
}

async function finishBaseline(page: Page, successful: boolean): Promise<void> {
  await page.locator('[data-small-talk-start]').click();
  if (!successful) {
    await selectStrategy(page, 'weekend-medium-generic-question');
    return;
  }
  await selectStrategy(page, 'weekend-medium-connect-experience');
  await selectStrategy(page, 'weekend-medium-follow-detail');
}

async function finishReplay(page: Page): Promise<void> {
  await finishBaseline(page, true);
  await page.locator('[data-small-talk-replay]').click();
  await selectStrategy(page, 'weekend-medium-home-share-movie');
  await selectStrategy(page, 'weekend-medium-home-close');
}

async function prepareState(page: Page, state: SmallTalkLabState): Promise<void> {
  if (state === 'mission') return;
  if (state === 'active-baseline') {
    await page.locator('[data-small-talk-start]').click();
    return;
  }
  if (state === 'alternate-branch') {
    await page.locator('[data-small-talk-start]').click();
    await selectStrategy(page, 'weekend-medium-preference-path');
    return;
  }
  if (state === 'evidence-recap') {
    await finishBaseline(page, false);
    return;
  }
  if (state === 'passport-replay') {
    await finishBaseline(page, true);
    return;
  }
  await finishReplay(page);
  await page.locator('[data-small-talk-transfer]').click();
  if (state === 'seasonal-transfer') return;
  await selectStrategy(page, 'mid-autumn-share-preference');
  await selectStrategy(page, 'mid-autumn-repair-kaorou');
}

function requiredEvidence(state: SmallTalkLabState): string[] {
  if (state === 'mission') return ['.small-talk-dev-note', '[data-small-talk-mission]'];
  if (state === 'active-baseline' || state === 'alternate-branch' || state === 'seasonal-transfer' || state === 'repair') {
    return ['[data-small-talk-cue]', '[data-small-talk-strategy]:first-child'];
  }
  if (state === 'evidence-recap') {
    return ['.small-talk-terminal', '[data-small-talk-evidence-item]:first-child'];
  }
  return ['[data-small-talk-passport]', '[data-small-talk-replay]'];
}

test.describe('/dev/small-talk/ visual evidence', () => {
  for (const visualCase of SMALL_TALK_LAB_VISUAL_CASES) {
    test(visualCase.snapshotName, async ({ page }) => {
      const { externalRequests, errors } = await openSmallTalkLab(page, visualCase.viewport);
      await prepareState(page, visualCase.state);
      await page.mouse.move(0, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      const evidence = requiredEvidence(visualCase.state);
      const clip = await prepareCapture(page, evidence);
      expect(Math.floor(clip.height), 'frozen evidence capture height').toBe(visualCase.captureHeight);
      expect(await page.evaluate(() => window.scrollY), 'frozen evidence scroll state').toBe(visualCase.scrollY);
      await assertCaptureContract(page, clip, evidence);
      await assertContract(page, visualCase.viewport, externalRequests, errors);
      await expect(page).toHaveScreenshot(visualCase.snapshotName, { clip });
    });
  }

  test.describe('behavior, focus, containment, and isolated state', () => {
    for (const viewport of CONTAINMENT_VIEWPORTS) {
      test(`keeps mission and active controls inside ${viewport.width}px`, async ({ page }) => {
        const { externalRequests, errors } = await openSmallTalkLab(page, viewport);
        const start = page.locator('[data-small-talk-start]');
        await expect(start).toHaveAccessibleName('会話を始める');
        await expect(start).toHaveAttribute('type', 'button');
        const startBox = await start.boundingBox();
        expect(startBox).not.toBeNull();
        expect(startBox!.width).toBeGreaterThanOrEqual(44);
        expect(startBox!.height).toBeGreaterThanOrEqual(44);
        const missionClip = await prepareCapture(page, ['[data-small-talk-mission]']);
        await assertCaptureContract(page, missionClip, ['[data-small-talk-mission]']);

        await start.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-small-talk-encounter]')).toBeVisible();
        await expect(page.locator('[data-small-talk-encounter-heading]')).toBeFocused();
        const activeClip = await prepareCapture(page, [
          '[data-small-talk-cue]',
          '[data-small-talk-strategy]:first-child',
        ]);
        await assertCaptureContract(page, activeClip, [
          '[data-small-talk-cue]',
          '[data-small-talk-strategy]:first-child',
        ]);
        const strategies = page.locator('[data-small-talk-strategy]');
        await expect(strategies).toHaveCount(3);
        for (let index = 0; index < await strategies.count(); index += 1) {
          const strategy = strategies.nth(index);
          await expect(strategy).toHaveAccessibleName(/言い方の一例/);
          const box = await strategy.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }

        // Reset is a native button and clears only the in-memory journey.
        const reset = page.locator('[data-small-talk-reset]');
        await expect(reset).toHaveAccessibleName('最初からやり直す');
        await reset.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-small-talk-mission]')).toBeVisible();
        await expect(page.locator('[data-small-talk-encounter]')).toBeHidden();
        expect(await page.evaluate((key) => localStorage.getItem(key), SENTINEL_KEY)).toBe(SENTINEL_VALUE);
        const resetClip = await prepareCapture(page, ['[data-small-talk-mission]']);
        await assertCaptureContract(page, resetClip, ['[data-small-talk-mission]']);

        // A direct refresh must return to Mission; no learner/progress key is
        // allowed to carry this dev-only session across documents.
        await start.click();
        await page.reload({ waitUntil: 'load' });
        await installFixedFont(page);
        await expect(page.locator('[data-small-talk-mission]')).toBeVisible();
        await expect(page.locator('[data-small-talk-encounter]')).toBeHidden();
        expect(await page.evaluate((key) => localStorage.getItem(key), SENTINEL_KEY)).toBe(SENTINEL_VALUE);
        await assertContract(page, viewport, externalRequests, errors);
      });
    }
  });
});
