import { expect, test } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const LEVELS = [1, 2, 3, 4] as const;
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

test.describe('unavailable HSK levels do not expose learner answers', () => {
  test('all four routes remain noninteractive and contained in light and dark themes', async ({
    page,
  }) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        for (const level of LEVELS) {
          await page.goto(`${BASE_URL}/vocabulary/hsk/${level}/`, {
            waitUntil: 'load',
          });
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            `HSK ${level} 単語フラッシュカード`,
          );
          await expect(page.getByRole('heading', { name: '準備中' })).toBeVisible();
          await expect(
            page.getByText('このレベルの単語は、公開できる状態になり次第追加します。'),
          ).toBeVisible();
          await expect(page.locator('.flashcard-session-root')).toHaveCount(0);
          await expect(page.locator('#session-area')).toHaveCount(0);
          await expect(
            page.locator('#btn-start, #btn-reveal, #btn-again, #btn-unsure, #btn-known, #btn-restart'),
          ).toHaveCount(0);

          const html = await page.locator('body').innerHTML();
          expect(html).not.toMatch(/hsk-(?:001|002|003|004|005)\b/);
          expect(html).not.toContain('reviewStatus');
          expect(html).not.toContain('nǐ hǎo');
          expect(html).not.toContain('こんにちは');

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

          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            await page.evaluate(() => document.documentElement.clientWidth),
          );
        }
      }
    }
  });

  test('every answer artifact contains no learner rows or draft records', async ({ request }) => {
    for (const level of LEVELS) {
      const response = await request.get(`${BASE_URL}/data/hsk/${level}.json`);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('application/json');

      const payload = await response.json();
      expect(payload.version).toBe(1);
      expect(payload.entries).toEqual([]);
      expect(payload.notice).toBeTruthy();
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toMatch(/hsk-(?:001|002|003|004|005)\b/);
      expect(serialized).not.toContain('reviewStatus');
      expect(serialized).not.toContain('nǐ hǎo');
    }
  });
});
