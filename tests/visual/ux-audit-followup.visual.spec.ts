import { expect, test } from '@playwright/test';
import { installFixedFont, installNetworkBoundary } from './helpers';

for (const width of [375, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`audit follow-up at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await installNetworkBoundary(page);
      await page.addInitScript((theme) => {
        localStorage.setItem('chabiko_theme', theme);
      }, theme);

      await page.goto('/');
      await installFixedFont(page);
      await expect(page.locator('#continuation-heading')).toHaveText('はじめの一歩');
      await expect(page.locator('[data-continuation-sentence]')).toHaveText('看');
      await expect(page.locator('[data-continuation-pinyin]')).toHaveText('kàn');
      await expect(page.locator('[data-continuation-title]')).toContainText('(本など)を読む');
      await expect(page.getByRole('combobox', { name: '漢字表記' })).toHaveValue('path-default');
      for (const preference of ['traditional', 'simplified', 'path-default']) {
        await page.getByRole('combobox', { name: '漢字表記' }).selectOption(preference);
        const controls = await page.locator('.brand, .nav-link, #theme-toggle, #script-preference-select').evaluateAll((elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, height: rect.height, clientWidth: document.documentElement.clientWidth };
        }));
        for (const control of controls) {
          expect(control.left).toBeGreaterThanOrEqual(0);
          expect(control.right).toBeLessThanOrEqual(control.clientWidth);
          expect(control.height).toBeGreaterThanOrEqual(44);
        }
      }
      const headerHeight = await page.locator('.site-header').evaluate((e) => e.getBoundingClientRect().height);
      expect(headerHeight).toBeLessThanOrEqual(57);
      await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'light' ? 'dark' : 'light');
      await expect(page.locator('#theme-toggle')).toHaveAccessibleName(theme === 'light' ? 'ライトテーマに切り替える' : 'ダークテーマに切り替える');
      await page.locator('#theme-toggle').click();
      await expect(page.locator('.site-header')).toHaveScreenshot(`ux-header-${theme}-${width}.png`);

      await page.locator('[data-dashboard-continuation]').click();
      await installFixedFont(page);
      await expect(page.locator('[data-basic-vocabulary-account]')).toBeHidden();
      const reveal = page.locator('[data-action="reveal"]');
      expect((await reveal.boundingBox())!.y + (await reveal.boundingBox())!.height).toBeLessThanOrEqual(812);
      await reveal.click();
      await expect(page.locator('.basic-vocabulary-japanese li')).toHaveText(['(もの)を見る', '(本など)を読む']);
      await expect(page.locator('.basic-vocabulary-context-text')).toHaveText('看电视 看书');
      await expect(page.locator('.basic-vocabulary-word-breakdown')).toHaveScreenshot(`ux-meanings-${theme}-${width}.png`);
      await page.getByRole('button', { name: 'むずかしい', exact: true }).click();
      await page.goto('/');
      await expect(page.locator('#continuation-heading')).toHaveText('続きを学ぶ');
      await expect(page.locator('[data-continuation-sentence]')).toBeHidden();

      await page.goto('/vocabulary/basic/quiz/');
      await installFixedFont(page);
      const heights = await page.locator('[data-action="select"]').evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().height));
      expect(heights).toHaveLength(4);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
      await expect(page.locator('.basic-vocabulary-quiz-options')).toHaveScreenshot(`ux-quiz-choices-${theme}-${width}.png`);

      await page.goto('/paths/');
      await installFixedFont(page);
      await expect(page.locator('[data-readiness-meter]')).toHaveCount(4);
      await expect(page.locator('[data-readiness-meter]').first()).toHaveAttribute('max', '3');
      const readiness = await page.locator('[data-readiness-section]').boundingBox();
      const paths = await page.locator('.paths-list').boundingBox();
      expect(readiness!.y).toBeLessThan(paths!.y);
      await expect(page.locator('[data-taiwan-count-note]')).toContainText('レッスン24課・単語4語・フレーズ7件');
      await expect(page.locator('[data-taiwan-count-note]')).toContainText('まだ完了を記録できない');
      await expect(page.locator('[data-readiness-section]')).toHaveScreenshot(`ux-readiness-${theme}-${width}.png`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
