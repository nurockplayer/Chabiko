import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { answerHskQuestion, assertQuizConcealed, openHskQuiz } from '../hskQuizBrowser';

for (const [index, width] of [320, 375, 390, 1440].entries()) {
  for (const direction of ['zh-to-ja', 'ja-to-zh'] as const) {
    const level = index + 1;
    const theme = index % 2 ? 'dark' : 'light';
    test(`HSK ${level} quiz keyboard and WCAG AA ${direction} ${theme} ${width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const count = level === 4 ? 20 : 10;
      const entries = await openHskQuiz(page, level, direction, count);
      const check = async () => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      };
      await check();
      await page.locator('[data-quiz-start]').focus();
      await page.keyboard.press('Enter');
      await assertQuizConcealed(page);
      await check();
      await answerHskQuestion(page, entries, direction, true);
      await check();
      await page.keyboard.press('Enter');
      for (let i = 1; i < count; i++) {
        await assertQuizConcealed(page);
        await answerHskQuestion(page, entries, direction);
        await page.keyboard.press('Enter');
      }
      await expect(page.getByRole('heading', { name: 'テスト結果' })).toBeFocused();
      await expect(page.locator('.quiz-missed li')).toHaveCount(count - 1);
      await check();
      await page.locator('[data-action="retry"]').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-quiz-start]')).toBeFocused();
      await expect(page.locator('[data-quiz-card]')).toBeEmpty();
      expect(errors).toEqual([]);
    });
  }
}

test('HSK pronunciation is mounted after answering and speaks Simplified Chinese on demand', async ({ page }) => {
  await page.route('**/audio/index.json', (route) => route.fulfill({ json: {} }));
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string }[] = [];
    Object.assign(window, { __hskQuizSpoken: spoken });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => {}, addEventListener: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => {
        spoken.push({ text: utterance.text, lang: utterance.lang });
        setTimeout(() => utterance.dispatchEvent(new Event('end')), 20);
      },
    } });
  });
  const entries = await openHskQuiz(page, 1, 'ja-to-zh');
  await page.locator('[data-quiz-start]').click();
  await assertQuizConcealed(page);
  await answerHskQuestion(page, entries, 'ja-to-zh');
  const readSpoken = () => page.evaluate(() => (window as unknown as { __hskQuizSpoken: { text: string; lang: string }[] }).__hskQuizSpoken);
  expect(await readSpoken()).toEqual([]);
  const audio = page.locator('[data-pronunciation-button]');
  await expect(audio).toBeVisible();
  const expected = await audio.getAttribute('data-pronunciation-text');
  await audio.focus();
  await page.keyboard.press('Enter');
  await expect.poll(readSpoken).toEqual([{ text: expected, lang: 'zh-CN' }]);
  await page.locator('[data-action="next"]').click();
  await assertQuizConcealed(page);
});
