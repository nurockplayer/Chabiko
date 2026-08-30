import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { A11Y_THEMES } from './matrix';

const ROUTES = [
  { name: 'short-word-order', path: '/practice/word-order/' },
  { name: 'long-lesson', path: '/lessons/lesson-001/' },
] as const;

const HEADER_CONTROLS = [
  { selector: '.brand', minHeight: 44 },
  { selector: '.nav-link', minHeight: 44 },
  { selector: '#theme-toggle', minHeight: 44 },
  { selector: '#script-preference-select', minHeight: 44 },
] as const;

async function assertHeaderContainment(page: Page, routeName: string): Promise<void> {
  const result = await page.evaluate((selectors) => {
    const header = document.querySelector('.site-header');
    if (!header) throw new Error('site header not found');
    const controls = selectors.map(({ selector }) => {
      const element = header.querySelector(selector);
      if (!element) throw new Error(`header control not found: ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        left: rect.left,
        right: rect.right,
        height: rect.height,
      };
    });
    return {
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls,
    };
  }, HEADER_CONTROLS);

  expect(result.innerWidth, `${routeName}: unexpected viewport width`).toBeGreaterThanOrEqual(320);
  for (const control of result.controls) {
    expect(control.left, `${routeName} ${control.selector} extends left`).toBeGreaterThanOrEqual(0);
    expect(control.right, `${routeName} ${control.selector} enters the scrollbar strip`).toBeLessThanOrEqual(result.clientWidth);
    expect(control.height, `${routeName} ${control.selector} lost its 44px target`).toBeGreaterThanOrEqual(44);
  }
}

for (const theme of A11Y_THEMES) {
  test.describe(`shared Header containment (${theme})`, () => {
    test.use({
      viewport: { width: 320, height: 800 },
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    for (const route of ROUTES) {
      test(`${route.name} keeps native controls inside the drawable viewport`, async ({
        page,
      }, testInfo: TestInfo) => {
        await page.goto(route.path, { waitUntil: 'load' });
        await expect(page.locator('.site-header')).toBeVisible();
        await expect(page.locator('#script-preference-select')).toHaveValue('path-default');
        await expect(page.locator('#script-preference-select')).toHaveAccessibleName('漢字表記');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const dimensions = await page.evaluate(() => ({
          innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
        }));
        if (route.name === 'long-lesson') {
          expect(dimensions.scrollHeight).toBeGreaterThan(800);
        } else {
          expect(dimensions.scrollHeight).toBeLessThanOrEqual(800);
        }
        await assertHeaderContainment(page, route.name);
        await page.screenshot({
          path: testInfo.outputPath(`header-${route.name}-${theme}-320x800.png`),
        });
      });
    }

    for (const width of [390, 768, 1440]) {
      test(`long-lesson keeps controls contained at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/lessons/lesson-001/', { waitUntil: 'load' });
        await expect(page.locator('.site-header')).toBeVisible();
        await assertHeaderContainment(page, `long-lesson-${width}`);
      });
    }
  });
}
