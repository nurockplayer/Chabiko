import { expect, test } from '@playwright/test';
import { HSK_STUDY_VISUAL_CASES } from './hskStudyCases';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const LEVELS = [1, 2, 3, 4] as const;
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

test.describe('released HSK levels support disclosed draft study', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`all four levels support contained study: ${colorScheme} ${viewport.width}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        for (const level of LEVELS) {
          await page.goto(`${BASE_URL}/vocabulary/hsk/${level}/`, { waitUntil: 'load' });
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(`HSK ${level} 単語フラッシュカード`);
          await expect(page.locator('#btn-start')).toBeEnabled();
          await expect(page.getByText('日本語訳はAIによる下書き', { exact: false })).toBeVisible();
          await expect(page.locator('.source-notice a').filter({ hasText: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
          await expect(page.locator('[data-front]')).toBeEmpty();
          await page.locator('#btn-start').click();
          await expect(page.locator('[data-front]')).not.toBeEmpty();
          await expect(page.locator('[data-back]')).toBeHidden();
          await page.locator('#btn-reveal').click();
          await expect(page.locator('[data-pinyin]')).not.toBeEmpty();
          await expect(page.locator('[data-japanese]')).not.toBeEmpty();
          await page.locator('#btn-known').click();
          await expect(page.locator('[data-back]')).toBeHidden();
          await page.evaluate(() => window.scrollTo(0, 0));
          const backLink = page.getByRole('link', { name: 'ホームに戻る' });
          await expect(backLink).toHaveAttribute('href', '/');
          await backLink.focus();
          await expect(backLink).toBeFocused();
          const box = await backLink.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
        }
      });
    }
  }

  test('every answer artifact contains the complete cumulative pool and attribution', async ({ request }) => {
    for (const level of LEVELS) {
      const response = await request.get(`${BASE_URL}/data/hsk/${level}.json`);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('application/json');

      const payload = await response.json();
      expect(payload.version).toBe(1);
      expect(payload.entries).toHaveLength([294, 485, 980, 1969][level - 1]);
      expect(payload.entries.every((entry: { japanese: string }) => entry.japanese.trim().length > 0)).toBe(true);
      expect(payload.notice).toBeTruthy();
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toMatch(/hsk-(?:001|002|003|004|005)\b/);
      expect(serialized).not.toContain('reviewStatus');
      expect(serialized).toContain('HearMandarin');
    }
  });
});

for (const { theme, viewport, level, setupSnapshot, answerSnapshot } of HSK_STUDY_VISUAL_CASES) {
  test(`HSK ${level} study snapshots ${theme} ${viewport.width}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize(viewport);
    await page.goto(`${BASE_URL}/vocabulary/hsk/${level}/`);
    await expect(page.locator('#btn-start')).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.flashcard-page')).toHaveScreenshot(setupSnapshot);
    if (level > 1) await page.locator('#pool-new').check();
    await page.locator('#btn-start').click();
    await page.locator('#btn-reveal').click();
    await expect(page.locator('[data-japanese]')).toBeVisible();
    // Capture the complete study area. The shared sticky header has its own
    // home baselines; its compositor corners otherwise vary by seven pixels.
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
    await expect(page.locator('.flashcard-page')).toHaveScreenshot(answerSnapshot);
    await page.locator('#btn-known').click();
    const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')!).entries);
    expect(Object.keys(entries)).toHaveLength(1);
    expect(Object.values(entries)[0]).toEqual({ status: 'learning', knownStreak: 1 });
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')!).entries)).toEqual(entries);
  });
}
