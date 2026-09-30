import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { A11Y_THEMES, type A11yTheme } from './matrix';
import {
  assertNoExternalRequests,
  assertStructuralContract,
  BASE_URL,
  openUrl,
} from './helpers';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const LEVELS = [1, 2, 3, 4] as const;
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 1440, height: 900 },
];

async function assertWcagAaClean(page: Page, level: number, theme: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_AA_TAGS)
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact != null && BLOCKING_IMPACTS.has(violation.impact),
  );
  if (blocking.length > 0) {
    const detail = blocking
      .map((violation) => {
        const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
        return `[${violation.impact}] ${violation.id} at ${targets}: ${violation.helpUrl}`;
      })
      .join('\n');
    throw new Error(`serious/critical axe violations on HSK ${level} (${theme}):\n${detail}`);
  }
}

async function assertUnavailablePage(
  page: Page,
  level: number,
  viewport: { width: number; height: number },
  theme: A11yTheme,
): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `HSK ${level} 単語フラッシュカード`,
  );
  await expect(page.getByRole('heading', { name: '準備中' })).toBeVisible();
  await expect(page.locator('.flashcard-session-root')).toHaveCount(0);
  await expect(
    page.locator('#btn-start, #btn-reveal, #btn-again, #btn-unsure, #btn-known, #btn-restart'),
  ).toHaveCount(0);
  await assertStructuralContract(page);

  const backLink = page.getByRole('link', { name: 'ホームに戻る' });
  await backLink.focus();
  await expect(backLink).toBeFocused();
  const box = await backLink.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await assertWcagAaClean(page, level, theme);
}

for (const theme of A11Y_THEMES) {
  test.describe(`unavailable HSK routes ${theme} theme`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    test('all four levels stay noninteractive, focused, contained, and WCAG AA clean', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));

      const externalRequests = await openUrl(
        page,
        `${BASE_URL}/vocabulary/hsk/1/`,
        theme,
      );
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        for (const level of LEVELS) {
          if (!(level === 1 && viewport === VIEWPORTS[0])) {
            await page.goto(`${BASE_URL}/vocabulary/hsk/${level}/`, {
              waitUntil: 'load',
            });
          }
          await assertUnavailablePage(page, level, viewport, theme);
        }
      }

      assertNoExternalRequests(externalRequests);
      expect(errors).toEqual([]);
    });
  });
}
