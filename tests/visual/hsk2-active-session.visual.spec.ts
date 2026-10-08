import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { answerPayload, ids, newPoolIds } from '../fixtures/hsk2-acceptance/data';

const BASE_URL = 'http://127.0.0.1:4322';
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const THEMES = ['light', 'dark'] as const;

async function focusVisible(page: Page, locator: Locator, name: string): Promise<void> {
  await expect.soft(locator).toBeFocused();
  const appearance = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect.soft(appearance.style, `${name} should have a visible keyboard focus indicator`).not.toBe('none');
  expect.soft(appearance.width, `${name} focus indicator should be at least 2px`).toBeGreaterThanOrEqual(2);
}

async function tabUntil(page: Page, locator: Locator, name: string): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await tabOnce(page);
  }
  throw new Error(`Tab traversal did not reach ${name}`);
}

async function tabOnce(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  const stop = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      id: element.id,
      visible: element.getClientRects().length > 0 && style.visibility !== 'hidden',
      nonzero: box.width > 0 && box.height > 0,
      focusStyle: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
    };
  });
  expect.soft(stop, 'each Tab stop must be visible, nonzero, and visibly focused').not.toBeNull();
  if (stop) {
    expect.soft(stop.visible, `Tab stop ${stop.id} must be visible`).toBe(true);
    expect.soft(stop.nonzero, `Tab stop ${stop.id} must have a nonzero box`).toBe(true);
    expect.soft(stop.focusStyle, `Tab stop ${stop.id} must have a visible focus indicator`).toBe(true);
  }
}

async function assertUnrevealedAnswerAbsent(page: Page): Promise<void> {
  const html = await page.locator('body').innerHTML();
  expect(html).not.toContain('中合成語');
  expect(html).not.toContain('zhōng hé chéng yǔ');
}

async function capture(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect.soft(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  const visibleControls = page.locator('a, button, input, select, [tabindex]:not([tabindex="-1"])');
  for (const control of await visibleControls.all()) {
    // BaseLayout's keyboard skip link is intentionally clipped offscreen until
    // focused. Ignore only its exact, inactive 1px clipping contract.
    const inactiveClippedSkipLink = await control.evaluate((element) => {
      if (!element.matches('.skip-link') || element === document.activeElement) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.clipPath === 'inset(50%)' &&
        Number.parseFloat(style.width) <= 1 && Number.parseFloat(style.height) <= 1 &&
        box.right < 0;
    });
    if (inactiveClippedSkipLink) continue;
    const isRootControl = await control.evaluate((element) =>
      Boolean(element.closest('.flashcard-session-root')),
    );
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect.soft(box, 'every visible interactive control in the capture must have a box').not.toBeNull();
    if (!box) continue;
    const intersectsCapture = box.x + box.width > 0 && box.x < viewport!.width &&
      box.y + box.height > 0 && box.y < viewport!.height;
    // Every visible session control must fit, even outside the current scroll
    // fragment. Other controls are checked when they intersect the PNG.
    if (!isRootControl && !intersectsCapture) continue;
    expect.soft(box!.x).toBeGreaterThanOrEqual(0);
    expect.soft(box!.y).toBeGreaterThanOrEqual(0);
    expect.soft(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect.soft(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  }
  for (const evidence of await page.locator('.flashcard-session-root, .setup-panel, [data-front], [data-back], [data-progress-text]').all()) {
    if (!(await evidence.isVisible())) continue;
    const box = await evidence.boundingBox();
    expect.soft(box, 'every visible evidence element must have a box').not.toBeNull();
    if (!box) continue;
    expect.soft(box!.x).toBeGreaterThanOrEqual(0);
    expect.soft(box!.y).toBeGreaterThanOrEqual(0);
    expect.soft(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect.soft(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  }

  const png = await page.screenshot({ fullPage: false });
  expect.soft(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect.soft(png.readUInt32BE(16)).toBe(viewport!.width);
  expect.soft(png.readUInt32BE(20)).toBe(viewport!.height);
  await testInfo.attach(`${state}-${viewport!.width}x${viewport!.height}.png`, {
    body: png,
    contentType: 'image/png',
  });
}

async function checkActiveOptions(page: Page): Promise<void> {
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('0 / 20');
  await expect(page.locator('[data-front]')).toHaveAttribute('lang', 'ja');
}

async function selectPoolWithKeyboard(page: Page): Promise<void> {
  await tabUntil(page, page.locator('#pool-full'), 'Full pool radio');
  await focusVisible(page, page.locator('#pool-full'), 'Full pool radio');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#pool-new')).toBeFocused();
  await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 10語）');
}

test('390px keyboard acceptance preserves active HSK 2 choices through same-root remount', async ({ page }) => {
  expect(ids).toHaveLength(22);
  expect(newPoolIds).toHaveLength(21);
  expect(newPoolIds).toEqual(ids.slice(0, 21));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('chabiko_theme', 'light'));
  await page.route('**/__acceptance/hsk2.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(answerPayload),
  }));
  await page.goto(`${BASE_URL}/__acceptance/hsk2/`, { waitUntil: 'load' });
  await expect(page.locator('#btn-start')).toBeEnabled();

  await tabOnce(page);
  await selectPoolWithKeyboard(page);
  await tabOnce(page);
  await tabOnce(page);
  await expect(page.locator('#size-20')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await tabOnce(page);
  await tabOnce(page);
  await expect(page.locator('#dir-ja-zh')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');
  await tabOnce(page);
  await expect(page.locator('#btn-start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '答えを見る' })).toHaveAccessibleName('答えを見る');
  await expect(page.locator('#btn-reveal')).toBeFocused();
  await checkActiveOptions(page);
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味001');
  await assertUnrevealedAnswerAbsent(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-again')).toBeFocused();
  await expect(page.getByRole('button', { name: '覚えた' })).toHaveAccessibleName('覚えた');
  await expect(page.locator('[data-japanese]')).toHaveText('中合成語001');

  await page.evaluate(async () => {
    const importer = (specifier: string) => import(specifier);
    const storeModule = await importer('/src/domain/vocabularyProgress.ts') as {
      VocabularyProgressStore: {
        prototype: { applyRating: (id: string, rating: 'again' | 'unsure' | 'known') => void };
      };
    };
    const prototype = storeModule.VocabularyProgressStore.prototype;
    const original = prototype.applyRating;
    const calls: Array<{ id: string; rating: string }> = [];
    prototype.applyRating = function (this: object, id, rating) {
      calls.push({ id, rating });
      return original.call(this, id, rating);
    };
    (window as Window & { __hskRateCalls?: typeof calls }).__hskRateCalls = calls;
  });
  await page.evaluate(async () => {
    const importer = (specifier: string) => import(specifier);
    const client = await importer('/src/client/flashcardSession.ts') as {
      mountRemoteFlashcardSession: (data: { ids: string[]; newPoolIds: string[]; answerSource: string }) => Promise<() => void>;
    };
    const root = document.querySelector('.flashcard-session-root')!;
    (window as Window & { __hskRoot?: Element }).__hskRoot = root;
    await client.mountRemoteFlashcardSession(JSON.parse(root.getAttribute('data-session')!));
    (window as Window & { __hskRemountedRoot?: Element }).__hskRemountedRoot =
      document.querySelector('.flashcard-session-root')!;
  });
  expect(await page.evaluate(() => {
    const state = window as Window & { __hskRoot?: Element; __hskRemountedRoot?: Element };
    return state.__hskRoot === state.__hskRemountedRoot;
  })).toBe(true);
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');

  await tabUntil(page, page.locator('#btn-start'), 'Start after remount');
  await page.keyboard.press('Enter');
  await checkActiveOptions(page);
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味001');
  await expect(page.locator('[data-pinyin]')).toHaveText('');
  await expect(page.locator('[data-japanese]')).toHaveText('');
  await assertUnrevealedAnswerAbsent(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-japanese]')).toHaveText('中合成語001');
  await tabOnce(page);
  await tabOnce(page);
  await expect(page.locator('#btn-known')).toHaveAccessibleName('覚えた');
  await page.keyboard.press('Enter');
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
  expect(await page.evaluate(() =>
    (window as Window & { __hskRateCalls?: Array<{ id: string; rating: string }> }).__hskRateCalls,
  )).toEqual([{ id: ids[0], rating: 'known' }]);

  const reset = page.locator('#btn-reset-progress');
  await tabUntil(page, reset, 'Reset progress button');
  await focusVisible(page, reset, 'Reset progress button');
  const cancelDialog = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.message()).toContain('進捗をリセット');
    await dialog.dismiss();
  });
  await Promise.all([page.keyboard.press('Enter'), cancelDialog]);
  await expect.soft(reset).toBeFocused();
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
  await tabUntil(page, reset, 'Reset progress button after cancel');
  const confirmDialog = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.message()).toContain('進捗をリセット');
    await dialog.accept();
  });
  await Promise.all([page.keyboard.press('Enter'), confirmDialog]);
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
  await expect(reset).toBeHidden();
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
});

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`active HSK 2 session: ${theme} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      const focusFailures: string[] = [];
      const focusObservations: unknown[] = [];
      const recordFocusedVisibleTarget = async (transition: string) => {
        const target = await page.evaluate(() => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement)) return null;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            visible: element.getClientRects().length > 0 && style.visibility !== 'hidden',
            focusedStyle: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
            inViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
          };
        });
        focusObservations.push({ transition, activeElement: target });
        if (!target?.visible || !target.focusedStyle || !target.inViewport) {
          focusFailures.push(`${transition}: ${JSON.stringify(target)}`);
        }
      };

      await page.setViewportSize(viewport);
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem('chabiko_theme', selectedTheme);
      }, theme);
      await page.route('**/__acceptance/hsk2.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(answerPayload),
      }));
      await page.goto(`${BASE_URL}/__acceptance/hsk2/`, { waitUntil: 'load' });
      await expect(page.locator('#btn-start')).toBeEnabled();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1, name: 'HSK 2 単語フラッシュカード' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'HSK 2 新出単語' })).toHaveAccessibleName('HSK 2 新出単語');
      await expect(page.getByRole('radio', { name: '20語' })).toHaveAccessibleName('20語');
      await expect(page.getByRole('radio', { name: '日本語 → 中国語' })).toHaveAccessibleName('日本語 → 中国語');
      await expect(page.getByRole('button', { name: 'スタート' })).toHaveAccessibleName('スタート');
      await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 22語（セッション: 10語）');

      // Exercise native Tab/Space/Enter behavior through the real rendered controls.
      await tabOnce(page);
      await selectPoolWithKeyboard(page);

      await tabOnce(page);
      await expect(page.locator('#size-10')).toBeFocused();
      await tabOnce(page);
      await focusVisible(page, page.locator('#size-20'), '20-word option');
      await page.keyboard.press('Space');
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');

      await tabOnce(page);
      await expect(page.locator('#dir-zh-ja')).toBeFocused();
      await tabOnce(page);
      await focusVisible(page, page.locator('#dir-ja-zh'), 'Japanese-to-Chinese option');
      await page.keyboard.press('Space');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');
      await tabOnce(page);
      await focusVisible(page, page.locator('#btn-start'), 'Start button');
      await capture(page, testInfo, 'setup');

      const rootIdentity = await page.evaluate(() => {
        (window as Window & { __hskRoot?: Element }).__hskRoot = document.querySelector('.flashcard-session-root')!;
        return true;
      });
      expect(rootIdentity).toBe(true);
      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-reveal')).toBeFocused();
      await recordFocusedVisibleTarget('Start to Reveal');
      await expect(page.getByRole('button', { name: '答えを見る' })).toHaveAccessibleName('答えを見る');
      await checkActiveOptions(page);
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味001');
      await assertUnrevealedAnswerAbsent(page);

      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-again')).toBeFocused();
      await recordFocusedVisibleTarget('Reveal to Again');
      await expect(page.getByRole('button', { name: '覚えた' })).toHaveAccessibleName('覚えた');
      await expect(page.locator('[data-pinyin]')).toHaveText('zhōng hé chéng yǔ 001');
      await expect(page.locator('[data-japanese]')).toHaveText('中合成語001');
      await capture(page, testInfo, 'revealed');

      // The production API is mounted again over the same Astro-rendered root. Wrap the
      // real store method so the acceptance can count an actual persisted rating call.
      await page.evaluate(async () => {
        const importer = (specifier: string) => import(specifier);
        const storeModule = await importer('/src/domain/vocabularyProgress.ts') as {
          VocabularyProgressStore: {
            prototype: {
              applyRating: (id: string, rating: 'again' | 'unsure' | 'known') => void;
            };
          };
        };
        const prototype = storeModule.VocabularyProgressStore.prototype;
        const original = prototype.applyRating;
        const calls: Array<{ id: string; rating: string }> = [];
        prototype.applyRating = function (this: object, id, rating) {
          calls.push({ id, rating });
          return original.call(this, id, rating);
        };
        (window as Window & { __hskRateCalls?: typeof calls }).__hskRateCalls = calls;
      });
      await page.evaluate(async () => {
        const importer = (specifier: string) => import(specifier);
        const client = await importer('/src/client/flashcardSession.ts') as {
          mountRemoteFlashcardSession: (data: {
            ids: string[];
            newPoolIds: string[];
            answerSource: string;
          }) => Promise<() => void>;
        };
        const root = document.querySelector('.flashcard-session-root')!;
        const data = JSON.parse(root.getAttribute('data-session')!);
        await client.mountRemoteFlashcardSession(data);
        (window as Window & { __hskRemountedRoot?: Element }).__hskRemountedRoot =
          document.querySelector('.flashcard-session-root')!;
      });
      await expect(page.locator('.flashcard-session-root')).toBeVisible();
      expect(await page.evaluate(() => {
        const state = window as Window & { __hskRoot?: Element; __hskRemountedRoot?: Element };
        return state.__hskRoot === state.__hskRemountedRoot;
      })).toBe(true);
      await expect(page.locator('#setup-panel')).toBeVisible();
      await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');
      await expect(page.locator('#pool-new')).toBeChecked();
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
      await recordFocusedVisibleTarget('same-root remount to setup');
      await capture(page, testInfo, 'post-remount-setup');

      const startAgain = page.locator('#btn-start');
      await tabUntil(page, startAgain, 'Start button after remount');
      await focusVisible(page, startAgain, 'Start button after remount');
      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-reveal')).toBeFocused();
      await recordFocusedVisibleTarget('Start after same-root remount');
      await checkActiveOptions(page);
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味001');
      await expect(page.locator('[data-pinyin]')).toHaveText('');
      await expect(page.locator('[data-japanese]')).toHaveText('');
      await assertUnrevealedAnswerAbsent(page);
      await capture(page, testInfo, 'post-remount-pre-reveal');

      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-again')).toBeFocused();
      await recordFocusedVisibleTarget('Reveal after same-root remount');
      await expect(page.locator('[data-japanese]')).toHaveText('中合成語001');
      await capture(page, testInfo, 'post-remount-revealed');
      await tabOnce(page);
      await tabOnce(page);
      await focusVisible(page, page.locator('#btn-known'), 'Known rating button');
      await expect(page.locator('#btn-known')).toHaveAccessibleName('覚えた');
      await page.keyboard.press('Enter');
      await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
      await expect(page.locator('#btn-reset-progress')).toBeVisible();
      expect(await page.evaluate(() =>
        (window as Window & { __hskRateCalls?: Array<{id: string; rating: string}> }).__hskRateCalls,
      )).toEqual([{ id: ids[0], rating: 'known' }]);
      await recordFocusedVisibleTarget('Known rating to next card');

      const resetButton = page.locator('#btn-reset-progress');
      await tabUntil(page, resetButton, 'Reset progress button');
      await focusVisible(page, resetButton, 'Reset progress button');
      const cancelDialog = page.waitForEvent('dialog').then(async (dialog) => {
        expect(dialog.message()).toContain('進捗をリセット');
        await dialog.dismiss();
      });
      await Promise.all([page.keyboard.press('Enter'), cancelDialog]);
      await expect.soft(resetButton).toBeFocused();
      await recordFocusedVisibleTarget('canceled reset dialog');
      await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
      await expect(page.locator('#pool-new')).toBeChecked();
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');

      await tabUntil(page, resetButton, 'Reset progress button after cancel');
      const confirmDialog = page.waitForEvent('dialog').then(async (dialog) => {
        expect(dialog.message()).toContain('進捗をリセット');
        await dialog.accept();
      });
      await Promise.all([page.keyboard.press('Enter'), confirmDialog]);
      await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
      await expect(resetButton).toBeHidden();
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
      await expect(page.locator('#pool-new')).toBeChecked();
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
      await recordFocusedVisibleTarget('confirmed reset while session remains active');
      await testInfo.attach('focus-transition-report.json', {
        body: JSON.stringify({ focusObservations, failures: focusFailures }, null, 2),
        contentType: 'application/json',
      });
      await expect.soft(focusFailures, 'strict focus expectations failed:').toEqual([]);
    });
  }
}
