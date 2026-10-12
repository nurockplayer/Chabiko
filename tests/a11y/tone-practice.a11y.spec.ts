import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadTonePractice } from '../../src/content/loadTonePractice';

const items = loadTonePractice();

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    test(`tone secrecy, geometry, and keyboard flow: ${theme} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/practice/tones/');
      const root = page.locator('[data-tone-practice]');
      for (const item of items) {
        const contour = root.locator('[data-tone-contour]');
        await expect(contour).toHaveAttribute('aria-hidden', 'true');
        await expect(contour).toHaveAttribute('data-contour', item.toneContourId);
        await expect(contour.locator('svg line')).toHaveCount(5);
        // A horizontal SVG line has a zero-height geometry box even when its
        // stroke is painted. Check the drawing viewport and stroke instead.
        await expect(contour.locator('svg')).toBeVisible();
        expect(await contour.locator('svg polyline').evaluate((line) =>
          Number.parseFloat(getComputedStyle(line).strokeWidth),
        )).toBeGreaterThan(0);
        const contrast = await contour.evaluate((element) => {
          const luminance = (color: string) => {
            const channels = color.match(/\d+/g)!.slice(0, 3).map((value) => {
              const channel = Number(value) / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const line = luminance(getComputedStyle(element.querySelector('polyline')!).stroke);
          const background = luminance(getComputedStyle(element).backgroundColor);
          return (Math.max(line, background) + 0.05) / (Math.min(line, background) + 0.05);
        });
        expect(contrast).toBeGreaterThanOrEqual(3);
        // The four choice labels stay visible. They are the only answer-name text allowed.
        const assertSecret = async () => {
          const visibleText = await root.evaluate((element) => [...element.children]
            .filter((child) => !child.matches('[data-tone-choices]'))
            .map((child) => (child as HTMLElement).innerText).join(' '));
          expect(visibleText).not.toContain(item.correctAnswer);
          await expect(root.locator('[data-tone-hint]')).toHaveCount(0);
          await expect(root.locator('[data-tone-interference]')).toHaveText(item.interferenceJa);
        };
        await assertSecret();
        await expect(root.getByRole('group', { name: '声調を選ぶ' })).toBeVisible();
        await expect(root.getByRole('button', { name: item.correctAnswer, exact: true })).toBeFocused();
        const focus = await page.evaluate(() => {
          const style = getComputedStyle(document.activeElement!);
          return { width: style.outlineWidth, style: style.outlineStyle };
        });
        expect(focus.width).not.toBe('0px');
        expect(focus.style).not.toBe('none');
        // Enter selects the first (correct) choice; native focus moves to submit.
        await page.keyboard.press('Enter');
        await assertSecret();
        await expect(root.getByRole('button', { name: '答え合わせ', exact: true })).toBeFocused();
        await page.keyboard.press('Space');
        await expect(root.locator('[data-tone-feedback] [data-tone-hint]')).toHaveText(item.toneContourHintJa);
        const results = await new AxeBuilder({ page }).include('[data-tone-practice]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
        for (const button of await root.locator('button:visible').all()) {
          const box = await button.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await page.keyboard.press('Enter');
      }
      await expect(root).toContainText('練習完了！');
      await page.keyboard.press('Enter');
      await expect(root.locator('[data-tone-contour]')).toHaveAttribute('data-contour', items[0].toneContourId);
      await expect(root.locator('[data-tone-hint]')).toHaveCount(0);
      const wrong = root.getByRole('button', { name: items[0].distractors[0], exact: true });
      await page.keyboard.press('Tab');
      await expect(wrong).toBeFocused();
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      await expect(root.locator('[data-tone-feedback] [data-tone-hint]')).toHaveText(items[0].toneContourHintJa);
      await expect(root.getByRole('button', { name: 'もう一度挑戦する', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(root.locator('[data-tone-hint]')).toHaveCount(0);
    });
  }
}
