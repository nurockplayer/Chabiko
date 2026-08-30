import { expect, test, type Page } from '@playwright/test';

const ROUTE = '/vocabulary/basic/words/';
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function openCatalog(page: Page): Promise<{
  errors: string[];
  externalRequests: Set<string>;
}> {
  const errors: string[] = [];
  const externalRequests = new Set<string>();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4321') {
      externalRequests.add(url.href);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await page.goto(ROUTE, { waitUntil: 'load' });
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('[data-basic-vocabulary-catalog]')).toBeVisible();
  await expect(page.locator('li.basic-vocabulary-catalog-card')).toHaveCount(24);
  return { errors, externalRequests };
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  for (const selector of [
    '.basic-vocabulary-catalog-controls',
    '[data-catalog-search]',
    '[data-catalog-status]',
    '[data-catalog-part-of-speech]',
    '.basic-vocabulary-catalog-card',
    '.basic-vocabulary-catalog-card img',
    '.basic-vocabulary-catalog-detail-link',
  ]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} has no browser layout box`).not.toBeNull();
    expect(box!.x, `${selector} starts outside the viewport`).toBeGreaterThanOrEqual(0);
    expect(
      box!.x + box!.width,
      `${selector} extends past the viewport`,
    ).toBeLessThanOrEqual(dimensions.clientWidth);
  }
}

for (const viewport of VIEWPORTS) {
  test(`catalog controls, cards, and filtered links are contained at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const { errors, externalRequests } = await openCatalog(page);

    const controls = page.locator('.basic-vocabulary-catalog-controls');
    await controls.scrollIntoViewIfNeeded();
    const controlsBox = await controls.boundingBox();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox!.y).toBeGreaterThanOrEqual(0);
    expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(viewport.height);

    await page.locator('[data-catalog-part-of-speech]').selectOption('verb');
    await expect(page.locator('[data-catalog-summary]')).toContainText(/^\u51681582\u8a9e\u4e2d \d+\u8a9e\u3092\u8868\u793a$/);
    await expect(page.locator('li.basic-vocabulary-catalog-card')).toHaveCount(24);
    const detailLinks = page.locator('.basic-vocabulary-catalog-detail-link');
    await expect(detailLinks).toHaveCount(24);
    for (const href of await detailLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    )) {
      expect(href).toMatch(/^\/vocabulary\/basic\/words\/[^/]+\/\?from=/);
    }

    await page.locator('.basic-vocabulary-catalog-card').first().scrollIntoViewIfNeeded();
    await assertNoHorizontalOverflow(page);
    await testInfo.attach(`catalog-${viewport.width}px`, {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });

    expect([...externalRequests]).toEqual([]);
    expect(errors).toEqual([]);
  });
}
