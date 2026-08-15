import { expect, test } from '@playwright/test';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../../src/domain/basicVocabularyProgress';
import {
  assertElementsWithinViewport,
  assertLearnerRouteCaptureContract,
  openLearnerRoute,
} from './learnerRouteHelpers';
import {
  COMPLETE_FIELD_ID,
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
    image: { assetPath: string };
  }>;
};

function learnedIds(count: number): string[] {
  return manifest.rows.slice(0, count).map((row) => row.learnerId);
}

function rowFor(learnerId: string) {
  const row = manifest.rows.find((candidate) => candidate.learnerId === learnerId);
  if (!row) throw new Error(`missing manifest row ${learnerId}`);
  return row;
}

const completeRow = rowFor(COMPLETE_FIELD_ID); // 大家, all three optional fields

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
          // The illustration is answer feedback (#356): it appears with the
          // answer on reveal, so wait for the revealed WebP to finish loading
          // before capturing, so the shot is never a partially-loaded image.
          await expect
            .poll(async () =>
              page
                .locator('[data-card] img')
                .evaluate((img) => {
                  const htmlImage = img as HTMLImageElement;
                  return htmlImage.complete && htmlImage.naturalWidth > 0;
                })
                .catch(() => false),
            )
            .toBe(true);
          await assertLearnerRouteCaptureContract(
            page,
            learnerCase.viewport,
            externalRequests,
          );
          // The learner card screenshot tolerates sub-pixel variance at the
          // illustration/ratings boundary (fractional WebP scaling in the
          // pinned renderer can shift a handful of pixels between runs), while
          // still failing on any real content/layout change (hundreds+ pixels).
          await expect(page.locator('.basic-vocabulary-card')).toHaveScreenshot(
            learnerCase.snapshotName,
            { maxDiffPixels: 200 },
          );
        },
      );
    }
  });

  test.describe('behavior, keyboard, accessibility, viewport, and console', () => {
    for (const viewport of LEARNER_ROUTE_VIEWPORTS) {
      test(`complete-field controls fully inside the ${viewport.width}px viewport`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
        const { externalRequests } = await openLearnerRoute(
          page,
          learnedIds(COMPLETE_FIELD_LEARNED_COUNT),
        );
        await assertLearnerRouteCaptureContract(page, viewport, externalRequests);

        // Before reveal (#356): no illustration — the recall front (card,
        // simplified, reveal) and the reset management block are contained.
        await expect(page.locator('[data-card] img')).toHaveCount(0);
        await assertElementsWithinViewport(page, [
          '[data-card]',
          '.basic-vocabulary-simplified',
          '[data-action="reveal"]',
          '.basic-vocabulary-reset',
        ]);

        // After reveal: illustration, answer, and ratings contained.
        await page.locator('[data-action="reveal"]').click();
        await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
        await expect(page.locator('[data-card] img')).toHaveCount(1);
        await assertElementsWithinViewport(page, [
          '[data-card]',
          '[data-card] img',
          '.basic-vocabulary-answer',
          '.basic-vocabulary-ratings',
          '[data-rating="again"]',
          '[data-rating="unsure"]',
          '[data-rating="known"]',
          '.basic-vocabulary-reset',
        ]);
      });

      test(`missing-all-optional controls fully inside the ${viewport.width}px viewport`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
        const { externalRequests } = await openLearnerRoute(
          page,
          learnedIds(NO_OPTIONAL_LEARNED_COUNT),
        );
        await page.locator('[data-action="reveal"]').click();
        await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
        await assertLearnerRouteCaptureContract(page, viewport, externalRequests);
        // No blank answer container; ratings and reset management contained.
        await expect(page.locator('.basic-vocabulary-answer')).toHaveCount(0);
        await assertElementsWithinViewport(page, [
          '[data-card]',
          '[data-card] img',
          '.basic-vocabulary-simplified',
          '.basic-vocabulary-ratings',
          '[data-rating="again"]',
          '[data-rating="unsure"]',
          '[data-rating="known"]',
          '.basic-vocabulary-reset',
        ]);
      });
    }

    test('complete-field item: reveal shows pinyin, japanese, and traditional', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));

      // 大家 card front (#356): recall-first — the illustration is hidden
      // before reveal, then shown together with the answer.
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('大家');
      await expect(page.locator('[data-card] img')).toHaveCount(0);

      await page.locator('[data-action="reveal"]').click();
      const answer = page.locator('.basic-vocabulary-answer');
      await expect(answer).toBeVisible();
      const imageSrc = await page
        .locator('[data-card] img')
        .getAttribute('src');
      expect(imageSrc).toBe(completeRow.image.assetPath);
      await expect(answer.locator('.basic-vocabulary-pinyin')).toHaveText(
        completeRow.pinyin ?? '',
      );
      await expect(answer.locator('.basic-vocabulary-japanese')).toHaveText(
        completeRow.japanese ?? '',
      );
      await expect(answer.locator('.basic-vocabulary-traditional')).toHaveText(
        completeRow.traditional ?? '',
      );
    });

    test('missing-all-optional item: reveal shows ratings but no blank answer container', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(NO_OPTIONAL_LEARNED_COUNT));

      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('强调');
      await page.locator('[data-action="reveal"]').click();
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
      await expect(page.locator('.basic-vocabulary-answer')).toHaveCount(0);
    });

    test('keyboard: reveal is auto-focused, Enter reveals 大家 and lands on the again rating', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));

      const reveal = page.locator('[data-action="reveal"]');
      const resetSummary = page.locator('.basic-vocabulary-reset summary');
      await expect(reveal).toHaveAccessibleName('答えを見る');
      await expect(resetSummary).toHaveAccessibleName('学習データの管理');

      // The reveal button is the first focusable control and is focused on load.
      await expect(reveal).toBeFocused();

      // Enter reveals via keyboard.
      await page.keyboard.press('Enter');
      await expect(page.locator('.basic-vocabulary-answer')).toBeVisible();
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
      // The reveal handler moves focus to the again rating.
      const again = page.locator('[data-rating="again"]');
      await expect(again).toBeFocused();
      await expect(again).toHaveAccessibleName('もう一度');
      await expect(page.locator('[data-rating="unsure"]')).toHaveAccessibleName('まだ曖昧');
      await expect(page.locator('[data-rating="known"]')).toHaveAccessibleName('覚えた');

      // Natural Tab order continues through the ratings. 大家 has an approved
      // example, so the example-sentence detail link (#342) is the next
      // focusable control after the ratings; Tab continues through it to the
      // reset management summary (which opens the native details block on
      // Enter).
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-rating="unsure"]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-rating="known"]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('.basic-vocabulary-detail-link')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(resetSummary).toBeFocused();
    });

    test('keyboard: reset is reachable and activates via keyboard', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      page.on('dialog', (dialog) => dialog.accept());
      await openLearnerRoute(page, learnedIds(NO_OPTIONAL_LEARNED_COUNT));

      // Session is showing 强调 (missing-all-optional).
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('强调');

      // Reveal is auto-focused; Enter reveals, then Tab through the three
      // ratings to the reset management summary, Enter opens the native
      // details block, Tab reaches the reset button, and Enter activates the
      // reset dialog.
      await expect(page.locator('[data-action="reveal"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
      await page.keyboard.press('Tab'); // again -> unsure
      await page.keyboard.press('Tab'); // unsure -> known
      await page.keyboard.press('Tab'); // known -> reset summary
      const resetSummary = page.locator('.basic-vocabulary-reset summary');
      await expect(resetSummary).toBeFocused();
      await page.keyboard.press('Enter'); // open details
      const reset = page.locator('[data-action="reset"]');
      await expect(reset).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(reset).toBeFocused();
      await page.keyboard.press('Enter');

      // Reset clears progress and restarts from the very first unseen item.
      await expect
        .poll(async () =>
          page.evaluate((key) => localStorage.getItem(key), BASIC_VOCABULARY_PROGRESS_KEY),
        )
        .toBeNull();
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('看');
    });

    test('keyboard: completion then continue is reachable and activates via keyboard', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));

      // Complete the 10-item session with the keyboard. Reveal is auto-focused;
      // Enter reveals, focus moves to the again rating, then two Tabs reach the
      // known rating; after each rating focus returns to reveal.
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Enter'); // reveal
        await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
        await page.keyboard.press('Tab'); // again -> unsure
        await page.keyboard.press('Tab'); // unsure -> known
        await expect(page.locator('[data-rating="known"]')).toBeFocused();
        await page.keyboard.press('Enter'); // rate known
      }
      await expect(page.locator('.basic-vocabulary-completion')).toBeVisible();

      // In the completion state the primary continue button is the focusable
      // control and the secondary replay button is present.
      const continueButton = page.locator('[data-action="continue"]');
      const replay = page.locator('[data-action="replay"]');
      await expect(continueButton).toHaveAccessibleName('次の10語を学ぶ');
      await expect(replay).toHaveAccessibleName('今回の10語を復習する');
      await expect(continueButton).toBeVisible();
      await expect(continueButton).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.basic-vocabulary-reveal')).toBeVisible();
      // Learning items are prioritized on continue, so the window leads with 大家.
      await expect(page.locator('.basic-vocabulary-simplified')).toHaveText('大家');
    });

    test('console: no errors for the complete-field flow', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(COMPLETE_FIELD_LEARNED_COUNT));
      await page.locator('[data-action="reveal"]').click();
      await page.locator('[data-rating="known"]').click();
      await expect(page.locator('[data-progress]')).toHaveText(/今回 1 \/ 10語/);
      expect(errors).toEqual([]);
    });

    test('console: no errors for the missing-all-optional flow (reveal + rating)', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openLearnerRoute(page, learnedIds(NO_OPTIONAL_LEARNED_COUNT));

      // Reveal the answer-less 强调 card, then rate it.
      await page.locator('[data-action="reveal"]').click();
      await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
      await expect(page.locator('.basic-vocabulary-answer')).toHaveCount(0);
      await page.locator('[data-rating="known"]').click();
      await expect(page.locator('[data-progress]')).toHaveText(/今回 1 \/ 10語/);
      expect(errors).toEqual([]);
    });
  });
});
