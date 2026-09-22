import { expect, test } from '@playwright/test';

const ROUTE = '/teacher-review/vocabulary/';

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

test('teacher vocabulary overview filters, pages, and remains contained on desktop and mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-teacher-vocabulary-review]')).toBeVisible();
  await expect(page.locator('[data-tvro-results] > li')).toHaveCount(50);
  await page.locator('[data-tvro-search]').fill('xue');
  await page.locator('[data-tvro-part-of-speech]').selectOption('noun');
  await expect(page.locator('[data-tvro-summary]')).toContainText('語を表示');
  await page.screenshot({ path: testInfo.outputPath('desktop-search-filter.png'), animations: 'disabled' });

  await page.locator('[data-tvro-search]').fill('');
  await page.locator('[data-tvro-part-of-speech]').selectOption('all');
  await page.locator('[data-tvro-page="next"]').click();
  await expect(page.locator('[data-tvro-page-indicator]')).toHaveText('2 / 32');
  await page.locator('[data-tvro-results] > li').last().scrollIntoViewIfNeeded();
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  await page.locator('[data-tvro-decision]').selectOption('unreviewed');
  await expect(page.locator('[data-tvro-results] > li')).toHaveCount(50);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-unreviewed.png'), animations: 'disabled' });

  await page.locator('[data-tvro-decision]').selectOption('accepted');
  await expect(page.locator('[data-tvro-results] > li')).toHaveCount(0);
  await expect(page.locator('[data-tvro-summary]')).toHaveText('条件に一致する単語がありません');
  await page.screenshot({ path: testInfo.outputPath('mobile-accepted-empty.png'), animations: 'disabled' });

  await page.locator('[data-tvro-decision]').selectOption('needs_changes');
  await expect(page.locator('[data-tvro-results] > li')).toHaveCount(0);
  await expect(page.locator('[data-tvro-summary]')).toHaveText('条件に一致する単語がありません');
  await page.screenshot({ path: testInfo.outputPath('mobile-needs-changes-empty.png'), animations: 'disabled' });
});
