import { expect, test } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4321';

test.describe('/vocabulary/hsk/1/ answer secrecy', () => {
  test('keeps every flashcard lifecycle state inside narrow viewports', async ({ page }) => {
    const viewports = [
      { width: 320, height: 800 },
      { width: 390, height: 844 },
    ];

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(`${BASE_URL}/vocabulary/hsk/1/`, { waitUntil: 'load' });

        const assertContained = async (selector: string) => {
          const boxes = await page.locator(selector).evaluateAll((elements) =>
            elements
              .filter((element) => getComputedStyle(element).display !== 'none')
              .map((element) => {
                const box = element.getBoundingClientRect();
                return { left: box.left, right: box.right, width: box.width };
              }),
          );
          for (const box of boxes) {
            expect(box.left, `${selector} left`).toBeGreaterThanOrEqual(0);
            expect(box.right, `${selector} right`).toBeLessThanOrEqual(viewport.width);
            expect(box.width, `${selector} width`).toBeLessThanOrEqual(viewport.width);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            await page.evaluate(() => document.documentElement.clientWidth),
          );
        };

        await assertContained('#setup-panel');
        await page.getByRole('button', { name: 'スタート' }).click();
        await assertContained('#flashcard-card, .flashcard-actions, #btn-reveal');

        await page.getByRole('button', { name: '答えを見る' }).click();
        await assertContained('#flashcard-card, #rating-actions, #btn-again, #btn-unsure, #btn-known');
        await page.getByRole('button', { name: '覚えた' }).click();
        await page.getByRole('button', { name: '答えを見る' }).click();
        await page.getByRole('button', { name: '覚えた' }).click();
        await assertContained('.flashcard-completion, #btn-restart');

        await page.getByRole('button', { name: 'もう一度' }).click();
        await assertContained('#setup-panel');
      }
    }
  });

  test('answer artifact contains exactly the production-eligible HSK 1 entries', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/data/hsk/1.json`);

    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/json');

    const payload = await response.json();
    expect(payload).toEqual({
      version: 1,
      entries: [
        {
          id: 'hsk-002',
          simplified: '你好',
          pinyin: 'nǐ hǎo',
          japanese: 'こんにちは',
          traditional: '你好',
        },
        {
          id: 'hsk-005',
          simplified: '狗',
          pinyin: 'gǒu',
          japanese: '犬',
        },
      ],
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('hsk-001');
    expect(serialized).not.toContain('hsk-003');
    expect(serialized).not.toContain('hsk-004');
    expect(serialized).not.toContain('reviewStatus');
  });

  test('initial HTML carries opaque eligible IDs without answer-side content', async ({
    page,
  }) => {
    const response = await page.goto(`${BASE_URL}/vocabulary/hsk/1/`, {
      waitUntil: 'load',
    });
    expect(response).not.toBeNull();

    const html = await response!.text();
    expect(html).toContain('hsk-002');
    expect(html).toContain('hsk-005');
    expect(html).not.toContain('&quot;entries&quot;');
    expect(html).not.toContain('nǐ hǎo');
    expect(html).not.toContain('こんにちは');
    expect(html).not.toContain('gǒu');
    expect(html).not.toContain('reviewStatus');
  });

  test('loads eligible answers while keeping the active answer empty until reveal', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/vocabulary/hsk/1/`, { waitUntil: 'load' });

    const start = page.getByRole('button', { name: 'スタート' });
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page.locator('[data-front]')).toHaveText('你好');
    await expect(page.locator('[data-pinyin]')).toHaveText('');
    await expect(page.locator('[data-japanese]')).toHaveText('');

    await page.getByRole('button', { name: '答えを見る' }).click();
    await expect(page.locator('[data-pinyin]')).toHaveText('nǐ hǎo');
    await expect(page.locator('[data-japanese]')).toHaveText('こんにちは');
  });

  for (const invalidArtifact of [
    {
      name: 'malformed',
      payload: { version: 1, entries: 'not-an-array' },
    },
    {
      name: 'duplicate',
      payload: {
        version: 1,
        entries: [
          { id: 'hsk-002', simplified: '你好', pinyin: 'nǐ hǎo', japanese: 'こんにちは' },
          { id: 'hsk-002', simplified: '你好', pinyin: 'nǐ hǎo', japanese: 'こんにちは' },
        ],
      },
    },
    {
      name: 'orphan or reordered',
      payload: {
        version: 1,
        entries: [
          { id: 'hsk-005', simplified: '狗', pinyin: 'gǒu', japanese: '犬' },
          { id: 'hsk-999', simplified: '洩漏', pinyin: 'xièlòu', japanese: '不正なデータ' },
        ],
      },
    },
  ]) {
    test(`fails closed for a ${invalidArtifact.name} answer artifact`, async ({ page }) => {
      await page.route('**/data/hsk/1.json', async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(invalidArtifact.payload),
        });
      });

      await page.goto(`${BASE_URL}/vocabulary/hsk/1/`, { waitUntil: 'load' });

      await expect(page.getByRole('button', { name: 'スタート' })).toBeDisabled();
      await expect(page.getByRole('status')).toHaveText(
        '単語データを読み込めませんでした。ページを再読み込みしてください。',
      );
      await expect(page.locator('#session-area')).toHaveClass(/hidden/);
      await expect(page.locator('[data-front]')).toHaveText('');
    });
  }
});
