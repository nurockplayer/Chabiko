import { expect, test } from '@playwright/test';
import { answerHskQuestion, assertQuizConcealed, openHskQuiz } from '../hskQuizBrowser';

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1440]) {
    for (const direction of ['zh-to-ja', 'ja-to-zh'] as const) {
      test(`HSK quiz ${direction} ${theme} ${width}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        const entries = await openHskQuiz(page, 1, direction);
        const snapshot = async (state: string) => {
          await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
          await expect(page.locator('.hsk-quiz-page')).toHaveScreenshot(`hsk-quiz-${direction}-${state}-${theme}-${width}.png`);
        };
        await snapshot('setup');
        await page.locator('[data-quiz-start]').click();
        await assertQuizConcealed(page);
        await snapshot('question');
        await answerHskQuestion(page, entries, direction);
        await snapshot('feedback');
        await page.locator('[data-action="next"]').click();
        for (let index = 1; index < 10; index++) {
          await answerHskQuestion(page, entries, direction);
          await page.locator('[data-action="next"]').click();
        }
        await expect(page.locator('.quiz-missed li')).toHaveCount(10);
        await expect(page.locator('[data-hsk-level="1"] [data-hsk-quiz-best]')).toHaveText('テスト最高 0%（0/10）');
        await snapshot('result');
        await page.locator('.quiz-back').click();
        await expect(page.locator('[data-hsk-level="1"] [data-hsk-quiz-best]')).toHaveText('テスト最高 0%（0/10）');
      });
    }
  }
}
