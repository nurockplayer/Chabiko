import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { V2_REFERENCE_EVIDENCE_STORAGE_KEY } from '../../src/domain/v2ReferenceFlow';
import {
  V2_REFERENCE_VISUAL_CASES,
  type V2ReferenceScreen,
} from './v2ReferenceCases';

const BASE_URL =
  process.env.V2_REFERENCE_BASE_URL ?? 'http://127.0.0.1:4321';
const FONT_FAMILY = 'Noto Sans JP Variable';

const require = createRequire(import.meta.url);
const fontCssPath = require.resolve('@fontsource-variable/noto-sans-jp/index.css');
const fontFilesDirectory = join(dirname(fontCssPath), 'files');
const fixedFontCss = readFileSync(fontCssPath, 'utf8')
  .replaceAll('url(./files/', 'url(/__visual-fonts/')
  .replaceAll('font-display: swap;', 'font-display: block;');
const fixedFontOverride = `${fixedFontCss}
  :root {
    --v2-font: '${FONT_FAMILY}', sans-serif !important;
  }
  *, *::before, *::after {
    font-family: '${FONT_FAMILY}', sans-serif !important;
    font-synthesis: none !important;
  }
`;

async function preparePage(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

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

async function installFixedFont(page: Page) {
  await page.addStyleTag({ content: fixedFontOverride });
  await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    await document.fonts.load(
      `400 16px "${fontFamily}"`,
      '今日 台湾 我 要 這個 記録',
    );
    await document.fonts.load(
      `700 16px "${fontFamily}"`,
      'できるようになったこと',
    );
  }, FONT_FAMILY);
}

async function assertViewportContract(
  page: Page,
  viewport: { width: number; height: number },
  externalRequests: Set<string>,
  fixedFont = false,
) {
  await expect(page.locator('[data-v2-reference-root]')).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth),
    )
    .toBeLessThanOrEqual(viewport.width);
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyFont: getComputedStyle(document.body).fontFamily,
  }));
  expect(dimensions).toMatchObject({
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    clientWidth: viewport.width,
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  if (fixedFont) {
    expect(dimensions.bodyFont).toContain(FONT_FAMILY);
  } else {
    expect(dimensions.bodyFont).toMatch(/Sans/i);
    expect(dimensions.bodyFont).not.toMatch(/Mincho/i);
  }
  expect([...externalRequests]).toEqual([]);
}

async function assertInteractiveContainment(page: Page) {
  const failures = await page
    .locator(
      '[data-v2-reference-root] a, [data-v2-reference-root] button, [data-v2-reference-root] summary',
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(element).visibility !== 'hidden';
        const intersectsViewport =
          rect.right > 0 &&
          rect.left < window.innerWidth &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const fullyContained =
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight;
        if (!visible || !intersectsViewport || fullyContained) return [];
        return [
          `${element.tagName} ${element.textContent?.trim() ?? ''}: x=${rect.left}..${rect.right}, y=${rect.top}..${rect.bottom}`,
        ];
      }),
    );
  expect(failures).toEqual([]);
}

async function assertWcagAaClean(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .include('[data-v2-screen]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    blocking.map((violation) => ({
      state,
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

async function tabUntil(page: Page, target: Locator, maxTabs = 16) {
  for (let index = 0; index < maxTabs; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`keyboard focus did not reach ${await target.getAttribute('aria-label')}`);
}

async function expectVisibleFocus(page: Page) {
  const hasVisibleFocus = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    const style = getComputedStyle(active);
    return (
      active.matches(':focus-visible') &&
      style.outlineStyle !== 'none' &&
      style.outlineWidth !== '0px'
    );
  });
  expect(hasVisibleFocus).toBe(true);
}

async function chooseTokens(page: Page, labels: readonly string[]) {
  for (const label of labels) {
    await page.getByRole('button', { name: `${label}を選ぶ` }).click();
  }
}

async function enterRepair(page: Page) {
  await page.goto(`${BASE_URL}/v2-reference/retrieval/`, { waitUntil: 'load' });
  await installFixedFont(page);
  await chooseTokens(page, ['這個', '我', '要']);
  await page.getByRole('button', { name: 'この語順で確認する' }).click();
  await expect(page.getByRole('status')).toContainText('語順が違います');
  await page.getByRole('button', { name: '答えを見て直す' }).click();
  await expect(page.locator('[data-v2-revealed-answer]')).toHaveText('我要這個');
}

async function enterResult(page: Page) {
  await enterRepair(page);
  await page.getByRole('button', { name: 'もう一度、自分で作る' }).click();
  await chooseTokens(page, ['我', '要', '這個']);
  await page.getByRole('button', { name: 'この語順で確認する' }).click();
  await expect(page.getByRole('status')).toContainText('できました');
  await page.getByRole('link', { name: '今日の結果を見る' }).click();
  await expect(page).toHaveURL(/\/v2-reference\/result\/$/);
  await installFixedFont(page);
  await expect(page.locator('[data-v2-evidence]')).toContainText(
    '答えを確認したあと',
  );
}

async function openScreen(page: Page, screen: V2ReferenceScreen) {
  if (screen === 'today') {
    await page.goto(`${BASE_URL}/v2-reference/`, { waitUntil: 'load' });
    await installFixedFont(page);
    await expect(page.locator('[data-v2-screen="today"]')).toBeVisible();
    return;
  }
  if (screen === 'learning') {
    await page.goto(`${BASE_URL}/v2-reference/learning/`, { waitUntil: 'load' });
    await installFixedFont(page);
    await expect(page.locator('[data-v2-screen="learning"]')).toBeVisible();
    return;
  }
  if (screen === 'repair') {
    await enterRepair(page);
    return;
  }
  await enterResult(page);
}

test.describe('/v2-reference/ behavior and answer secrecy', () => {
  test('今日 → learning → retrieval → repair → result works without an early answer leak', async ({
    page,
  }) => {
    const externalRequests = await preparePage(page, { width: 390, height: 844 });
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(`${BASE_URL}/v2-reference/`, { waitUntil: 'load' });
    await expect(page.locator('[data-v2-screen="today"]')).toBeVisible();
    await page.getByRole('link', { name: '4分で始める' }).click();
    await expect(page.locator('[data-v2-screen="learning"]')).toBeVisible();
    await expect(page.getByText('我要這個', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '答えを隠して思い出す' }).click();

    const initialHtml = await page.locator('html').innerHTML();
    expect(initialHtml).not.toContain('我要這個');
    expect(initialHtml).not.toContain('wǒ yào zhège');
    await expect(page.locator('body')).not.toContainText('我要這個');

    await chooseTokens(page, ['這個', '我', '要']);
    await page.getByRole('button', { name: 'この語順で確認する' }).click();
    await expect(page.getByRole('status')).toContainText('語順が違います');
    await expect(page.locator('body')).not.toContainText('我要這個');

    await page.getByRole('button', { name: 'ヒントを見る' }).click();
    await expect(page.getByRole('status')).toContainText('まず「私」');
    await expect(page.locator('body')).not.toContainText('我要這個');

    await page.getByRole('button', { name: '答えを見て直す' }).click();
    await expect(page.locator('[data-v2-revealed-answer]')).toHaveText('我要這個');
    await page.getByRole('button', { name: 'もう一度、自分で作る' }).click();
    await expect(page.locator('body')).not.toContainText('我要這個');

    await chooseTokens(page, ['我', '要', '這個']);
    await page.getByRole('button', { name: 'この語順で確認する' }).click();
    await page.getByRole('link', { name: '今日の結果を見る' }).click();
    await expect(page.locator('[data-v2-evidence]')).toContainText(
      '答えを確認したあと',
    );
    await expect(page.locator('body')).not.toContainText(/XP|streak|badge|confetti|%/i);

    await assertViewportContract(page, { width: 390, height: 844 }, externalRequests);
    expect(errors).toEqual([]);
  });

  test('all four states are WCAG AA clean at serious/critical impact', async ({ page }) => {
    await preparePage(page, { width: 390, height: 844 });

    await page.goto(`${BASE_URL}/v2-reference/`, { waitUntil: 'load' });
    await assertWcagAaClean(page, 'today');
    await page.getByRole('link', { name: '4分で始める' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('我要這個');
    await assertWcagAaClean(page, 'learning');
    await page.getByRole('link', { name: '答えを隠して思い出す' }).click();
    await assertWcagAaClean(page, 'retrieval');
    await chooseTokens(page, ['這個', '我', '要']);
    await page.getByRole('button', { name: 'この語順で確認する' }).click();
    await page.getByRole('button', { name: '答えを見て直す' }).click();
    await assertWcagAaClean(page, 'repair');
    await page.getByRole('button', { name: 'もう一度、自分で作る' }).click();
    await chooseTokens(page, ['我', '要', '這個']);
    await page.getByRole('button', { name: 'この語順で確認する' }).click();
    await page.getByRole('link', { name: '今日の結果を見る' }).click();
    await assertWcagAaClean(page, 'result');
  });

  test('result rejects stale session evidence instead of labeling it as today', async ({
    page,
  }) => {
    await preparePage(page, { width: 390, height: 844 });
    await page.goto(`${BASE_URL}/v2-reference/`, { waitUntil: 'load' });
    await page.evaluate(
      ({ key }) => {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            schemaVersion: 1,
            referenceSchemaVersion: 1,
            sourceLessonId: 'lesson-001',
            completedOn: '2000-01-01',
            kind: 'first-try',
            attempt: 1,
            usedHint: false,
            usedReveal: false,
          }),
        );
      },
      { key: V2_REFERENCE_EVIDENCE_STORAGE_KEY },
    );

    await page.goto(`${BASE_URL}/v2-reference/result/`, { waitUntil: 'load' });
    await expect(page.locator('[data-v2-evidence-empty]')).toBeVisible();
    await expect(page.locator('[data-v2-evidence]')).toBeHidden();
  });

  test('primary controls expose names and visible keyboard focus', async ({ page }) => {
    await preparePage(page, { width: 390, height: 844 });
    await page.goto(`${BASE_URL}/v2-reference/`, { waitUntil: 'load' });

    const start = page.getByRole('link', { name: '4分で始める' });
    await tabUntil(page, start);
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-v2-screen="learning"]')).toBeVisible();

    const audio = page.getByRole('button', { name: '音声を聞く' });
    await tabUntil(page, audio);
    await expectVisibleFocus(page);

    await page.getByRole('link', { name: '答えを隠して思い出す' }).click();
    const firstToken = page.getByRole('button', { name: '這個を選ぶ' });
    await tabUntil(page, firstToken);
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '我を選ぶ' })).toBeFocused();
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '要を選ぶ' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'この語順で確認する' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'ヒントを見る' })).toBeFocused();
    await expect(
      page.locator('[data-v2-answer] button, [data-v2-token-pool] button'),
    ).toHaveCount(0);
    await expect(page.locator('.v2-token--static')).toHaveCount(3);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '答えを見て直す' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'もう一度、自分で作る' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '這個を選ぶ' })).toBeFocused();
  });

  for (const viewport of [
    { width: 320, height: 812 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}px flow has no horizontal overflow`, async ({ page }) => {
      const externalRequests = await preparePage(page, viewport);
      await page.goto(`${BASE_URL}/v2-reference/`, { waitUntil: 'load' });
      await installFixedFont(page);
      await assertViewportContract(page, viewport, externalRequests);
      await assertInteractiveContainment(page);
      await expect(page.getByRole('link', { name: '4分で始める' })).toBeInViewport();
      await page.getByRole('link', { name: '4分で始める' }).click();
      await assertViewportContract(page, viewport, externalRequests);
      await assertInteractiveContainment(page);
      await expect(page.getByRole('link', { name: '答えを隠して思い出す' })).toBeInViewport();
      await page.getByRole('link', { name: '答えを隠して思い出す' }).click();
      await assertViewportContract(page, viewport, externalRequests);
      await assertInteractiveContainment(page);
      await chooseTokens(page, ['這個', '我', '要']);
      await page.getByRole('button', { name: 'この語順で確認する' }).click();
      await page.getByRole('button', { name: '答えを見て直す' }).click();
      await assertViewportContract(page, viewport, externalRequests);
      await assertInteractiveContainment(page);
      await expect(page.getByRole('button', { name: 'もう一度、自分で作る' })).toBeInViewport();
      await page.getByRole('button', { name: 'もう一度、自分で作る' }).click();
      await chooseTokens(page, ['我', '要', '這個']);
      await page.getByRole('button', { name: 'この語順で確認する' }).click();
      await page.getByRole('link', { name: '今日の結果を見る' }).click();
      await expect(page.locator('[data-v2-screen="result"]')).toBeVisible();
      await assertViewportContract(page, viewport, externalRequests);
      await assertInteractiveContainment(page);
      const finish = page.getByRole('link', { name: '今日を終える' });
      await finish.scrollIntoViewIfNeeded();
      await expect(finish).toBeInViewport();
      await assertInteractiveContainment(page);
    });
  }

  test('production home does not link to the isolated reference', async ({ page }) => {
    await preparePage(page, { width: 390, height: 844 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
    await expect(page.locator('a[href^="/v2-reference"]')).toHaveCount(0);
  });
});

test.describe('/v2-reference/ visual evidence', () => {
  for (const visualCase of V2_REFERENCE_VISUAL_CASES) {
    test(visualCase.snapshotName, async ({ page }) => {
      const externalRequests = await preparePage(page, visualCase.viewport);
      await openScreen(page, visualCase.screen);
      await page.evaluate(() => window.scrollTo(0, 0));
      await assertViewportContract(
        page,
        visualCase.viewport,
        externalRequests,
        true,
      );
      await assertInteractiveContainment(page);
      await expect(page).toHaveScreenshot(visualCase.snapshotName, {
        fullPage: false,
      });
    });
  }
});
