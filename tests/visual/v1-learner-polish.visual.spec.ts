import { expect, test } from '@playwright/test';
import { installFixedFont, installNetworkBoundary } from './helpers';

test.use({ viewport: { width: 375, height: 812 } });

test('local vocabulary study, catalog and quiz journey', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#continuation-heading')).toHaveText('はじめの一歩');
  await page.locator('[data-dashboard-continuation]').click();
  await expect(page.locator('[data-basic-vocabulary-account]')).toBeHidden();
  for (let index = 0; index < 10; index++) {
    await page.locator('[data-action="reveal"]').click();
    await page.getByRole('button', { name: 'できた', exact: true }).click();
  }
  await expect(page.locator('main')).toContainText('10語');
  await page.getByRole('link', { name: '単語一覧', exact: true }).click();
  await expect(page).toHaveURL(/\/vocabulary\/basic\/words\/$/);
  await page.getByRole('link', { name: 'テスト', exact: true }).click();
  for (let index = 0; index < 10; index++) {
    await page.locator('[data-action="select"]').first().click();
    await page.locator('[data-action="submit"]').click();
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.locator('[data-action="restart"]')).toBeVisible();
});

test('travel lesson feedback persists and leads to the next lesson and assessment', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-dashboard-track="taiwan-travel"]').click();
  await expect(page).toHaveURL(/\/lessons\/lesson-001\/$/);
  await page.getByRole('link', { name: '台湾旅行', exact: true }).click();
  await page.getByRole('link', { name: '第1課 夜市で注文してみようを開く' }).click();
  await page.getByRole('button', { name: 'これはいくらですか', exact: true }).click();
  await page.waitForTimeout(2200);
  await expect(page.locator('.feedback-answer')).toContainText('これをください');
  await page.getByRole('button', { name: 'もう一度', exact: true }).click();
  await page.getByRole('button', { name: 'これをください', exact: true }).click();
  await page.locator('.practice-next-step').click();
  await expect(page).toHaveURL(/\/lessons\/lesson-002\/$/);
  await page.getByRole('link', { name: '台湾旅行', exact: true }).click();
  await page.getByRole('link', { name: '総合テストに進む' }).click();
  await expect(page).toHaveURL(/\/paths\/taiwan-travel\/quiz\/$/);
  for (let index = 0; index < 24; index++) {
    await page.locator('[data-action="select"]').first().click();
    await page.locator('[data-action="submit"]').click();
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.locator('[data-action="restart"]')).toBeVisible();
});

test('phrasebook, roleplay and tone practice offer usable learning sessions', async ({ page }) => {
  await page.goto('/phrasebook/');
  await page.getByRole('combobox', { name: '場面で絞り込む' }).selectOption('food');
  await page.getByRole('link', { name: 'ロールプレイで使ってみる →' }).click();
  await page.locator('[data-roleplay-card-select]').first().click();
  await page.locator('[data-roleplay-start]').click();
  for (let index = 0; index < 10 && await page.locator('[data-roleplay-reveal]').isVisible(); index++) {
    await page.locator('[data-roleplay-reveal]').click();
    await page.locator('[data-roleplay-next]').click();
  }
  await expect(page.locator('[data-roleplay-complete]')).toBeVisible();
  await page.goto('/practice/tones/');
  const items = JSON.parse((await page.locator('[data-tone-session]').getAttribute('data-tone-session'))!).items;
  for (const item of items) {
    await expect(page.locator('[data-tone-interference]')).toBeHidden();
    await expect(page.locator('[data-tone-prompt]')).not.toContainText('mā');
    await page.getByRole('button', { name: item.correctAnswer, exact: true }).click();
    await page.getByRole('button', { name: '答え合わせ', exact: true }).click();
    await expect(page.locator('[data-tone-interference]')).toBeVisible();
    await page.locator('.tone-action--next').click();
  }
  await expect(page.locator('.tone-action--restart')).toBeVisible();
  await page.getByRole('link', { name: '次は語順を練習する →' }).click();
  await expect(page).toHaveURL(/\/practice\/word-order\/$/);
});

test('provisional word-order meaning, alternative answer, and mobile presentation', async ({ page }) => {
  await installNetworkBoundary(page);
  await page.goto('/practice/word-order/');
  await installFixedFont(page);
  await expect(page.locator('[data-word-order-prompt]')).toContainText('私は明日台北に行きます');
  for (const text of '明天我去台北') {
    await page.locator('[data-word-order-pool]').getByRole('button', { name: `チャンク ${text}`, exact: true }).click();
  }
  await page.getByRole('button', { name: '答え合わせ', exact: true }).click();
  await expect(page.locator('[data-word-order-feedback]')).toHaveText('正解！');
  await expect(page.locator('[data-word-order-practice]')).toHaveScreenshot('v1-word-order-alternative-375x812.png');
});

test('kanji next step, reduced motion and learner route containment', async ({ page }) => {
  for (const route of ['/', '/vocabulary/basic/', '/vocabulary/basic/words/', '/vocabulary/basic/quiz/', '/paths/', '/paths/taiwan-travel/', '/phrasebook/', '/roleplay/', '/practice/tones/', '/practice/word-order/']) {
    await page.goto(route);
    await expect(page).toHaveTitle(/Chabiko/);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
    await expect(page.locator('main a[href^="/dev/"], main a[href^="/teacher-review/"], header a[href^="/dev/"], header a[href^="/teacher-review/"]')).toHaveCount(0);
    expect(await page.evaluate(() => [...document.querySelectorAll('main *')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
    }).map((element) => element.className))).toEqual([]);
  }
  await page.goto('/vocabulary/kanji-bridge/');
  await page.getByRole('link', { name: '第1課の漢字ブリッジで「要」を学ぶ →' }).click();
  await expect(page.locator('#kanji-heading')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.practice-choice').first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('1e-05s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.locator('.practice-choice').first().evaluate((element) => getComputedStyle(element).transitionDuration)).not.toBe('1e-05s');
});
