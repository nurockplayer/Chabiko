import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTE = '/teacher-review/vocabulary/';
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('teacher vocabulary overview is keyboard-accessible and contained at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  const controls = [
    page.locator('[data-tvro-search]'), page.locator('[data-tvro-source-sheet]'),
    page.locator('[data-tvro-part-of-speech]'), page.locator('[data-tvro-decision]'),
  ];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await expect(controls[0]).toHaveAccessibleName('単語を検索');
  await expect(controls[1]).toHaveAccessibleName('出典シート');
  await expect(controls[2]).toHaveAccessibleName('品詞');
  await expect(controls[3]).toHaveAccessibleName('確認状態');
  await controls[0].focus();
  for (const expected of controls.slice(1)) {
    await page.keyboard.press('Tab');
    await expect(expected).toBeFocused();
  }
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking).toEqual([]);
});
