import { expect, test } from '@playwright/test';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../../src/domain/basicVocabularyProgress';
import {
  assertLearnerRouteCaptureContract,
  openLearnerRoute,
} from './learnerRouteHelpers';
import {
  COMPLETE_FIELD_LEARNED_COUNT,
  LEARNER_ROUTE_CASES,
  NO_OPTIONAL_LEARNED_COUNT,
  LEARNER_ROUTE_VIEWPORTS,
} from './learnerRouteCases';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync('data/teacher-vocabulary-preview/learner-manifest.json', 'utf8'),
) as {
  rows: Array<{
    learnerId: string;
    simplified: string;
    pinyin?: string;
    japanese?: string;
    traditional?: string;
  }>;
};

function learnedIds(count: number): string[] {
  return manifest.rows.slice(0, count).map((row) => row.learnerId);
}

/** Reveal-and-rate every item in the bounded 10-item session as "known",
 * which advances to completion. */
async function completeSession(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await page.locator('[data-action="reveal"]').click();
    await page.locator('[data-rating="known"]').click();
  }
}

test.describe('/vocabulary/basic/ learner route', () => {
  test.describe('visual baselines', () => {
    for (const learnerCase of LEARNER_ROUTE_CASES) {
      test(
        `${learnerCase.snapshotName}`,
        async ({ page }) => {
          await page.setViewportSize(learnerCase.viewport);
          await page.emulateMedia({
            colorScheme: 'light',
            reducedMotion: 'reduce',
          });
          const { externalRequests } = await openLearnerRoute(
            page,
            learnedIds(learnerCase.learnedCount),
          );

          await page.locator('[data-action="reveal"]').click();
          await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
          await assertLearnerRouteCaptureContract(
            page,
            learnerCase.viewport,
            externalRequests,
          );
          await expect(page.locator('.basic-vocabulary-card')).toHaveScreenshot(
            learnerCase.snapshotName,
          );
        },
      );
    }
  });

  test.describe('behavior, keyboard, accessibility, and console', () => {
    for (const viewport of LEARNER_ROUTE_VIEWPORTS) {
      test(`no horizontal overflow at ${viewport.width}px with a complete-field item`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
        const { externalRequests } = await openLearnerRoute(
          page,
          learnedIds(COMPLETE_FIELD_LEARNED_COUNT),
        );
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
        expect([...externalRequests]).toEqual([]);
      });

      test(`no horizontal overflow at ${viewport.width}px with a missing-all-optional item`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
        const { externalRequests } = await openLearnerRoute(
          page,
          learnedIds(NO_OPTIONAL_LEARNED_COUNT),
        );
        await page.locator('[data-action="reveal"]').click();
        await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
        expect([...externalRequests]).toEqual([]);
      });
    }

    test('complete-field item: reveal shows pinyin/japanese, rating advances the session', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));

      const answer = page.locator('.basic-vocabulary-answer');
      await expect(answer).toBeHidden();
      await page.locator('[data-action="reveal"]').click();
      await expect(answer).toBeVisible();
      await expect(answer.locator('.basic-vocabulary-pinyin')).toContainText(
        manifest.rows[0].pinyin ?? '',
      );
      await expect(answer.locator('.basic-vocabulary-japanese')).toContainText(
        manifest.rows[0].japanese ?? '',
      );
      // The progress counter advances after a rating, proving the action works.
      await page.locator('[data-rating="known"]').click();
      await expect(page.locator('[data-progress]')).toHaveText(/1 \/ 10 語/);
    });

    test('missing-all-optional item: reveal shows ratings but no blank answer container', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(NO_OPTIONAL_LEARNED_COUNT));

      await page.locator('[data-action="reveal"]').click();
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
      await expect(page.locator('.basic-vocabulary-answer')).toHaveCount(0);
    });

    test('reset clears progress and restarts the session', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      page.on('dialog', (dialog) => dialog.accept());
      await openLearnerRoute(page, learnedIds(NO_OPTIONAL_LEARNED_COUNT));

      // Session is showing 强调 (missing-all-optional).
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('强调');

      // Rate one item so progress is written, then reset.
      await page.locator('[data-action="reveal"]').click();
      await page.locator('[data-rating="known"]').click();
      const resetButton = page.locator('[data-action="reset"]');
      await resetButton.click();
      await expect
        .poll(async () =>
          page.evaluate((key) => localStorage.getItem(key), BASIC_VOCABULARY_PROGRESS_KEY),
        )
        .toBeNull();
      // After reset the session restarts from the very first unseen item.
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('看');
    });

    test('keyboard focus reaches reveal, ratings, and reset with accessible names', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));

      // The reveal button is the first interactive control and gets focus.
      const reveal = page.locator('[data-action="reveal"]');
      await expect(reveal).toBeVisible();
      await expect(reveal).toHaveAccessibleName('答えを見る');
      await expect(page.locator('[data-action="reset"]')).toHaveAccessibleName('学習記録をリセット');
      await reveal.focus();
      await expect(reveal).toBeFocused();

      // Press Enter/Space to reveal via keyboard.
      await page.keyboard.press('Enter');
      await expect(page.locator('.basic-vocabulary-answer')).toBeVisible();
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();

      // The again rating receives keyboard focus after reveal.
      const again = page.locator('[data-rating="again"]');
      await expect(again).toBeFocused();

      // Accessible names are present on every rating control.
      await expect(again).toHaveAccessibleName('もう一度');
      await expect(page.locator('[data-rating="unsure"]')).toHaveAccessibleName('まだ曖昧');
      await expect(page.locator('[data-rating="known"]')).toHaveAccessibleName('覚えた');
    });

    test('completion then restart restarts a bounded session', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));

      // Complete the 10-item bounded session.
      await completeSession(page);
      await expect(page.locator('.basic-vocabulary-completion')).toBeVisible();

      const restart = page.locator('[data-action="restart"]');
      await restart.click();
      await expect(page.locator('.basic-vocabulary-reveal')).toBeVisible();
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('看');
    });

    test('no console errors on the learner route', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));
      await page.locator('[data-action="reveal"]').click();
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
});
