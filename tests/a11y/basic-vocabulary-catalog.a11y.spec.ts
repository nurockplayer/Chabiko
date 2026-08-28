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

const ROUTE = '/vocabulary/basic/words/';
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

async function assertWcagAaClean(page: Page, theme: A11yTheme): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact != null && BLOCKING_IMPACTS.has(violation.impact),
  );
  if (blocking.length > 0) {
    throw new Error(
      `serious/critical axe violations on ${ROUTE} (${theme}):\n${blocking
        .map((violation) => `[${violation.impact}] ${violation.id}: ${violation.helpUrl}`)
        .join('\n')}`,
    );
  }
}

for (const theme of A11Y_THEMES) {
  test.describe(`/vocabulary/basic/words/ ${theme} theme`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    test('facet and detail-link keyboard flow is WCAG AA clean', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const externalRequests = await openUrl(page, `${BASE_URL}${ROUTE}`, theme);
      await expect(page.locator('[data-basic-vocabulary-catalog]')).toBeVisible();
      await assertStructuralContract(page);
      await assertWcagAaClean(page, theme);

      const search = page.locator('[data-catalog-search]');
      const status = page.locator('[data-catalog-status]');
      const partOfSpeech = page.locator('[data-catalog-part-of-speech]');
      await expect(search).toHaveAccessibleName('単語を検索');
      await expect(status).toHaveAccessibleName('学習状態');
      await expect(partOfSpeech).toHaveAccessibleName('品詞');

      for (const control of [search, status, partOfSpeech]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      await search.focus();
      await page.keyboard.press('Tab');
      await expect(status).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(partOfSpeech).toBeFocused();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect(partOfSpeech).toHaveValue('verb');
      await expect(page.locator('[data-catalog-summary]')).toContainText(/^\u51681582\u8a9e\u4e2d \d+\u8a9e\u3092\u8868\u793a$/);

      await page.keyboard.press('Tab');
      const firstDetailLink = page.locator('.basic-vocabulary-catalog-detail-link').first();
      await expect(firstDetailLink).toBeFocused();
      await expect(firstDetailLink).toHaveAttribute(
        'href',
        /^\/vocabulary\/basic\/words\/[^/]+\/$/,
      );
      const linkBox = await firstDetailLink.boundingBox();
      expect(linkBox).not.toBeNull();
      expect(linkBox!.height).toBeGreaterThanOrEqual(44);
      expect(
        await firstDetailLink.evaluate((link) => {
          const style = getComputedStyle(link);
          return link.matches(':focus-visible') && style.outlineStyle !== 'none' &&
            Number.parseFloat(style.outlineWidth) > 0;
        }),
      ).toBe(true);

      const href = await firstDetailLink.getAttribute('href');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${BASE_URL}${href}`);
      assertNoExternalRequests(externalRequests);
    });
  });
}
