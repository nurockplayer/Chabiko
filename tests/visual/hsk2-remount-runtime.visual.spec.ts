import { expect, test, type Page } from '@playwright/test';
import { answerPayload, ids, newPoolIds } from '../fixtures/hsk2-acceptance/data';

const URL = 'http://127.0.0.1:4322/__acceptance/hsk2/';
const KEY = 'chabiko:hsk-vocabulary-progress:v1';
type Failure = 'invalid-payload' | 'request-failure';
type StorageMode = 'available' | 'unavailable' | 'quota-absent' | 'quota-populated';
type ProbeWindow = Window & {
  __remountProbe: { writes: number; ratings: Array<{ id: string; rating: string }>; root?: Element };
};

async function installProbe(page: Page, mode: StorageMode) {
  await page.addInitScript(({ mode, key, learnedId }) => {
    const nativeSet = Storage.prototype.setItem;
    nativeSet.call(localStorage, 'chabiko_theme', 'light');
    if (mode === 'quota-populated') {
      nativeSet.call(localStorage, key, JSON.stringify({
        version: 1, entries: { [learnedId]: { status: 'learned', knownStreak: 2 } },
      }));
    }
    const probe = { writes: 0, ratings: [] as Array<{ id: string; rating: string }> };
    (window as ProbeWindow).__remountProbe = probe;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key) {
        probe.writes += 1;
        if (mode.startsWith('quota-')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      }
      if (this === localStorage && mode === 'unavailable' && name === '__chabiko_vocab_probe__') {
        throw new DOMException('Synthetic unavailable storage', 'SecurityError');
      }
      return nativeSet.call(this, name, value);
    };
  }, { mode, key: KEY, learnedId: ids[0] });
}

async function observeRatingAndRoot(page: Page) {
  await page.evaluate(async () => {
    const importer = (specifier: string) => import(specifier);
    const { VocabularyProgressStore } = await importer('/src/domain/vocabularyProgress.ts') as {
      VocabularyProgressStore: { prototype: { applyRating: (id: string, rating: 'again' | 'unsure' | 'known') => void } };
    };
    const original = VocabularyProgressStore.prototype.applyRating;
    const probe = (window as ProbeWindow).__remountProbe;
    probe.root = document.querySelector('.flashcard-session-root')!;
    VocabularyProgressStore.prototype.applyRating = function (id, rating) {
      probe.ratings.push({ id, rating });
      return original.call(this, id, rating);
    };
  });
}

async function remount(page: Page) {
  await page.evaluate(async () => {
    const importer = (specifier: string) => import(specifier);
    const client = await importer('/src/client/flashcardSession.ts') as {
      mountRemoteFlashcardSession: (data: { ids: string[]; newPoolIds: string[]; answerSource: string }) => Promise<() => void>;
    };
    const root = document.querySelector('.flashcard-session-root')!;
    await client.mountRemoteFlashcardSession(JSON.parse(root.getAttribute('data-session')!));
  });
  expect(await page.evaluate(() => document.querySelector('.flashcard-session-root') ===
    (window as ProbeWindow).__remountProbe.root)).toBe(true);
}

async function counts(page: Page) {
  return page.evaluate(() => {
    const { writes, ratings } = (window as ProbeWindow).__remountProbe;
    return { writes, ratings };
  });
}

async function assertCleanSetup(page: Page) {
  await expect(page.locator('#setup-panel')).toBeVisible();
  await expect(page.locator('#session-area')).toBeHidden();
  await expect(page.locator('[data-front]')).toHaveText('');
  await expect(page.locator('[data-pinyin]')).toHaveText('');
  await expect(page.locator('[data-japanese]')).toHaveText('');
  await expect(page.locator('[data-prompt-fallback]')).toHaveText('');
  await expect(page.locator('[data-answer-fallback]')).toHaveText('');
  await expect(page.locator('#btn-start')).toBeEnabled();
}

for (const mode of ['unavailable', 'quota-absent', 'quota-populated'] as const) {
  test(`native same-root remount retains ${mode} page-memory progress`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installProbe(page, mode);
    await page.route('**/__acceptance/hsk2.json', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(answerPayload),
    }));
    await page.goto(URL, { waitUntil: 'load' });
    await expect(page.locator('#btn-start')).toBeEnabled();
    await observeRatingAndRoot(page);
    await page.locator('#pool-new').check();
    await page.locator('#size-20').press('Space');
    await page.locator('#dir-ja-zh').press('Space');
    await page.locator('#btn-start').press('Enter');
    await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
    await page.locator('#btn-reveal').press('Enter');
    await page.locator('#btn-known').press('Enter');
    await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
    const expected = { writes: mode === 'unavailable' ? 0 : 1, ratings: [{ id: newPoolIds[0], rating: 'known' }] };
    expect(await counts(page)).toEqual(expected);

    await remount(page);
    await assertCleanSetup(page);
    await expect(page.locator('#btn-start')).toBeFocused();
    await expect(page.locator('#pool-new')).toBeChecked();
    await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate((key) => {
      window.dispatchEvent(new Event('pageshow'));
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage }));
    }, KEY);
    await remount(page);
    await assertCleanSetup(page);
    expect(await counts(page)).toEqual(expected);

    await page.locator('#pool-full').check();
    await page.locator('#btn-start').press('Enter');
    await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
    await expect(page.locator('[data-progress-hint]')).toHaveText('正解ストリーク: 1');
    await expect(page.locator('#btn-reset-progress')).toBeVisible();
    await expect(page.locator('[data-pinyin]')).toHaveText('');
    await expect(page.locator('[data-japanese]')).toHaveText('');
    expect(await counts(page)).toEqual(expected);
  });
}

for (const failure of ['invalid-payload', 'request-failure'] as const satisfies readonly Failure[]) {
  test(`native active remount recovers focus after ${failure} without duplicate writes`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installProbe(page, 'available');
    let fail = false;
    await page.route('**/__acceptance/hsk2.json', (route) => {
      if (fail && failure === 'request-failure') return route.abort('failed');
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(fail ? { version: 1, entries: [] } : answerPayload) });
    });
    await page.goto(URL, { waitUntil: 'load' });
    await expect(page.locator('#btn-start')).toBeEnabled();
    await observeRatingAndRoot(page);
    await page.locator('#btn-start').press('Enter');
    await page.locator('#btn-reveal').press('Enter');
    await expect(page.locator('#btn-again')).toBeFocused();
    fail = true;
    await remount(page);
    await expect(page.locator('#btn-start')).toBeDisabled();
    // The load error is in the hidden setup panel while the old session is active.
    // Assert its own hidden flag/text, not visibility through that hidden ancestor.
    await expect(page.locator('#session-load-error')).toHaveJSProperty('hidden', false);
    await expect(page.locator('#session-load-error')).toHaveText(/読み込めません/);
    await expect(page.locator('#session-area')).toBeVisible();
    await expect(page.locator('#btn-again')).toBeFocused();
    expect(await counts(page)).toEqual({ writes: 0, ratings: [] });

    fail = false;
    await remount(page);
    await assertCleanSetup(page);
    await expect(page.locator('#btn-start')).toBeFocused();
    await expect(page.locator('#session-load-error')).toHaveJSProperty('hidden', true);
    await expect(page.locator('#session-load-error')).toHaveText('');
    expect(await counts(page)).toEqual({ writes: 0, ratings: [] });
    await page.locator('#btn-start').press('Enter');
    await page.locator('#btn-reveal').press('Enter');
    await page.locator('#btn-known').press('Enter');
    await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 10');
    const expected = { writes: 1, ratings: [{ id: ids[0], rating: 'known' }] };
    expect(await counts(page)).toEqual(expected);

    // Use an existing real external control; no synthetic product DOM.
    const external = page.locator('.back-link');
    await external.focus();
    fail = true;
    await remount(page);
    await expect(external).toBeFocused();
    fail = false;
    await remount(page);
    await assertCleanSetup(page);
    await expect(external).toBeFocused();
    expect(await counts(page)).toEqual(expected);
  });
}
