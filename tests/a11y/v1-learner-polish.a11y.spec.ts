import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark'] as const) {
  test(`word-order cues and progress are accessible at 375px: ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/practice/word-order/');
    await expect(page.getByRole('progressbar', { name: 'この回の語順練習の進み具合' })).toBeVisible();
    for (const text of '明天我去台北') {
      const button = page.locator('[data-word-order-pool]').getByRole('button', { name: `チャンク ${text}`, exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('button', { name: '答え合わせ', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '次の文', exact: true })).toBeFocused();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  });
}
