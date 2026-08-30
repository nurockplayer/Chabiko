import { expect, test, type Page } from '@playwright/test';

const CATALOG_PATH = '/vocabulary/basic/words/';
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
] as const;

async function assertFocusedItemVisible(page: Page, learnerId: string): Promise<void> {
  const link = page.locator(
    `#word-${learnerId} .basic-vocabulary-catalog-detail-link`,
  );
  await expect(link).toBeFocused();
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientHeight),
  );
}

for (const viewport of VIEWPORTS) {
  test(`page-2 detail round trip is refresh-safe at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(`${CATALOG_PATH}?page=2`, { waitUntil: 'load' });
    await expect(page.locator('[data-catalog-page-indicator]')).toHaveText('2 / 66');

    await page.reload({ waitUntil: 'load' });
    await expect(page).toHaveURL(/\/vocabulary\/basic\/words\/\?page=2$/);
    await expect(page.locator('[data-catalog-page-indicator]')).toHaveText('2 / 66');

    const selectedLink = page.locator('.basic-vocabulary-catalog-detail-link').first();
    const selectedCard = selectedLink.locator('xpath=ancestor::li[1]');
    const learnerId = (await selectedCard.getAttribute('data-catalog-item-id'))!;
    await selectedLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/vocabulary/basic/words/${learnerId}/\\?from=`),
    );
    await expect(page.locator('.basic-vocabulary-detail-back a'))
      .toHaveAccessibleName('単語一覧の元の位置に戻る');

    await page.goBack({ waitUntil: 'load' });
    await expect(page.locator('[data-catalog-page-indicator]')).toHaveText('2 / 66');
    await expect(page).toHaveURL(
      new RegExp(`\\?page=2&item=${learnerId}#word-${learnerId}$`),
    );
    await assertFocusedItemVisible(page, learnerId);

    const screenshotPath = testInfo.outputPath(`catalog-return-${viewport.width}px.png`);
    await page.locator(`#word-${learnerId}`).screenshot({
      animations: 'disabled',
      path: screenshotPath,
    });
    await testInfo.attach(`catalog-return-${viewport.width}px`, {
      path: screenshotPath,
      contentType: 'image/png',
    });

    await page.locator(`#word-${learnerId} .basic-vocabulary-catalog-detail-link`).click();
    const explicitReturn = page.locator('.basic-vocabulary-detail-back a');
    await expect(explicitReturn).toHaveAccessibleName('単語一覧の元の位置に戻る');
    await explicitReturn.click();
    await expect(page.locator('[data-catalog-page-indicator]')).toHaveText('2 / 66');
    await assertFocusedItemVisible(page, learnerId);

    await page.goto(
      `${CATALOG_PATH}?q=zzz-no-match-zzz&status=learned&pos=verb&page=4`,
      { waitUntil: 'load' },
    );
    await expect(page).toHaveURL(
      /\?q=zzz-no-match-zzz&status=learned&pos=verb$/,
    );
    await expect(page.locator('[data-catalog-summary]'))
      .toHaveText('条件に一致する単語がありません');
    await expect(page.locator('[data-catalog-page-indicator]')).toHaveText('1 / 1');

    await page.goto(
      `${CATALOG_PATH}?status=wrong&pos=other&page=999&item=missing&stale=1`,
      { waitUntil: 'load' },
    );
    await expect(page).toHaveURL(/\/vocabulary\/basic\/words\/\?page=66$/);
    await expect(page.locator('[data-catalog-page-indicator]')).toHaveText('66 / 66');
  });
}
