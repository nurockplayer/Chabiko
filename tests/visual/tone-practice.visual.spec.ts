import { expect, test } from '@playwright/test';
import { loadTonePractice } from '../../src/content/loadTonePractice';
import { installFixedFont, installNetworkBoundary } from './helpers';
import { TONE_VISUAL_CASES } from './tonePracticeCases';

const items = loadTonePractice();

for (const visualCase of TONE_VISUAL_CASES) {
  test(visualCase.snapshotName, async ({ page }) => {
    await page.setViewportSize(visualCase.viewport);
    await page.emulateMedia({ colorScheme: visualCase.theme, reducedMotion: 'reduce' });
    const externalRequests = await installNetworkBoundary(page);
    await page.goto('/practice/tones/');
    await installFixedFont(page);
    const root = page.locator('[data-tone-practice]');
    for (const item of items) {
      if (item.toneContourId === visualCase.state || ['correct', 'incorrect'].includes(visualCase.state)) break;
      await root.getByRole('button', { name: item.correctAnswer, exact: true }).click();
      await root.getByRole('button', { name: '答え合わせ', exact: true }).click();
      await root.getByRole('button', { name: '次の問題', exact: true }).click();
    }
    if (['correct', 'incorrect'].includes(visualCase.state)) {
      const choice = visualCase.state === 'correct' ? items[0].correctAnswer : items[0].distractors[0];
      await root.getByRole('button', { name: choice, exact: true }).click();
      await root.getByRole('button', { name: '答え合わせ', exact: true }).click();
      await expect(root.locator('[data-tone-feedback] [data-tone-hint]')).toHaveText(items[0].toneContourHintJa);
    } else {
      await expect(root.locator('[data-tone-contour]')).toHaveAttribute('data-contour', visualCase.state);
      await expect(root.locator('[data-tone-hint]')).toHaveCount(0);
    }
    await root.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const boxes = await root.evaluate((element) => [element, ...element.querySelectorAll(
      '[data-tone-contour], [data-tone-interference], [data-tone-feedback], button',
    )].map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(visualCase.viewport.width);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(visualCase.viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(visualCase.viewport.width);
    expect(externalRequests.size).toBe(0);
    await expect(root).toHaveScreenshot(visualCase.snapshotName);
  });
}
