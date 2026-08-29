import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIEWPORTS = [320, 375, 390, 1440];
const FIRST_LEARNER_LINE = '我是來台灣旅遊的。';
const FIRST_SIMPLIFIED_LINE = '我是来台湾旅游的。';

async function expectViewportContainment(
  page: Page,
  selectors: string[],
): Promise<void> {
  const result = await page.evaluate((requiredSelectors) => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const boxes = requiredSelectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { selector, left: rect.left, right: rect.right, width: rect.width };
    });
    return { viewportWidth, scrollWidth, boxes };
  }, selectors);

  expect(result.scrollWidth).toBeLessThanOrEqual(result.viewportWidth);
  for (const box of result.boxes) {
    expect(box, `missing required visible element: ${selectors.join(', ')}`).not.toBeNull();
    if (box === null) continue;
    expect(box.width, `${box.selector} should have a visible box`).toBeGreaterThan(0);
    expect(box.left, `${box.selector} extends left of the viewport`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.selector} extends right of the viewport`).toBeLessThanOrEqual(result.viewportWidth);
  }
}

test.describe('/roleplay/ launch surface', () => {
  test('exposes exactly six cards and keeps learner answers out of initial HTML', async ({ page }) => {
    const external: string[] = [];
    await page.route('**/*', async (route) => {
      const request = new URL(route.request().url());
      if (request.origin !== 'http://127.0.0.1:4321') {
        external.push(request.href);
        await route.abort();
      } else await route.continue();
    });
    await page.goto('/roleplay/', { waitUntil: 'load' });
    await expect(page.locator('[data-roleplay-card-select]')).toHaveCount(6);
    await expect(page.locator('[data-roleplay-card-select="roleplay-fixture-transport-001"]')).toHaveCount(0);
    const initialHtml = await page.content();
    expect(initialHtml).not.toContain(FIRST_LEARNER_LINE);
    expect(initialHtml).not.toContain(FIRST_SIMPLIFIED_LINE);
    expect(initialHtml).not.toContain('wǒ shì lái Táiwān lǚyóu de');
    expect(initialHtml).not.toContain('台湾へ旅行に来ました');
    expect(external).toEqual([]);
    const violations = await new AxeBuilder({ page }).analyze();
    expect(violations.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  });

  for (const width of VIEWPORTS) {
    test(`rehearsal fits and reveals one learner turn at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/roleplay/', { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.locator('[data-roleplay-card-select="roleplay-airport-001"]').click();
      await page.locator('[data-roleplay-start]').click();
      await expect(page.locator('[data-roleplay-active]')).toBeVisible();
      await expectViewportContainment(page, ['[data-roleplay-active]', '[data-roleplay-reveal]']);
      await expect(page.locator('[data-roleplay-active]')).not.toContainText(FIRST_LEARNER_LINE);
      await expect(page.locator('[data-roleplay-active]')).toContainText('歡迎來台灣。');

      await page.locator('#script-preference-select').selectOption('simplified');
      await expect(page.locator('[data-roleplay-active]')).not.toContainText(FIRST_LEARNER_LINE);
      await page.locator('[data-roleplay-reveal]').click();
      await expect(page.locator('[data-roleplay-active]')).toContainText(FIRST_SIMPLIFIED_LINE);
      await expect(page.locator('[data-roleplay-next]')).toBeVisible();
      await expectViewportContainment(page, ['[data-roleplay-active]', '[data-roleplay-next]']);
    });
  }
});
