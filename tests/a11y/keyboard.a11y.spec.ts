import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { A11Y_THEMES } from './matrix';
import { BASE_URL } from './helpers';

const CLOCK_START = '2026-01-15T11:00:00+09:00';

async function focusDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return 'BODY';
    const detail =
      element.getAttribute('aria-label') ??
      element.textContent?.trim().slice(0, 30) ??
      '';
    return `${element.tagName}.${(element as HTMLElement).className} ${detail}`;
  });
}

/**
 * Press Tab repeatedly (bounded) until the given locator is focused, or fail
 * with a helpful message. Proves the target is reachable by keyboard alone
 * without asserting an exact global tab count.
 */
async function tabUntil(
  page: Page,
  target: Locator,
  maxTabs = 40,
  label = 'target',
): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  const focused = await focusDescription(page);
  throw new Error(`keyboard: never reached ${label}; last focused: ${focused}`);
}

/** Assert the focused element carries a visible focus style via :focus-visible. */
async function expectVisibleFocus(page: Page, label: string): Promise<void> {
  const visible = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return false;
    const style = getComputedStyle(element);
    return (
      element.matches(':focus-visible') &&
      style.outlineStyle !== 'none' &&
      style.outlineWidth !== '0px'
    );
  });
  expect(visible, `no visible focus style on ${label}`).toBe(true);
}

for (const theme of A11Y_THEMES) {
  test.describe(`keyboard flow (${theme})`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    test('skip link is the first Tab stop, shows visible focus, and jumps to main', async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
      const skipLink = page.locator('.skip-link');
      await expect(skipLink).toHaveCount(1);

      await page.keyboard.press('Tab');
      await expect(skipLink).toBeFocused();
      await expectVisibleFocus(page, 'skip link');

      await page.keyboard.press('Enter');
      await expect(page.locator('main#main-content')).toBeFocused();
    });

    test('home → lesson → practice is reachable with the keyboard', async ({
      page,
    }) => {
      await page.clock.install({ time: CLOCK_START });
      await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });

      // Skip straight to main content, then Tab to the first lesson card.
      await page.keyboard.press('Tab'); // skip link
      await page.keyboard.press('Enter');
      const firstLesson = page.locator('.lesson-list-link').first();
      await tabUntil(page, firstLesson, 20, 'first lesson link');
      await expectVisibleFocus(page, 'first lesson link');
      await page.keyboard.press('Enter');

      // Landed on the lesson page; the practice choices are present.
      await expect(page.locator('.lesson-practice')).toBeVisible();
      await expect(page.locator('.practice-choice').first()).toBeVisible();

      // Tab reaches the first answer choice.
      const firstChoice = page.locator('.practice-choice').first();
      await tabUntil(page, firstChoice, 40, 'first practice choice');
      await expectVisibleFocus(page, 'first practice choice');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    });

    test('answer/submit via keyboard shows feedback, announces it, and does not lose focus', async ({
      page,
    }) => {
      await page.clock.install({ time: CLOCK_START });
      await page.goto(`${BASE_URL}/lessons/lesson-001/`, {
        waitUntil: 'load',
      });
      const firstChoice = page.locator('.practice-choice').first();
      await expect(firstChoice).toBeVisible();

      const questions = await page.locator('[data-questions]').evaluate((el) =>
        JSON.parse(el.getAttribute('data-questions') ?? '[]'),
      );
      const correct = questions[0].correctAnswer;
      const correctChoice = page
        .locator('.practice-choice')
        .filter({ hasText: correct });

      await correctChoice.focus();
      await page.keyboard.press('Enter');

      // Feedback is a live region (announced to assistive tech).
      const feedback = page.locator('.practice-feedback');
      await expect(feedback).toHaveAttribute('role', 'status');
      await expect(feedback).toHaveAttribute('aria-live', 'polite');

      // Focus moved to the feedback (no BODY focus loss).
      await expect(feedback).toBeFocused();
      await expectVisibleFocus(page, 'feedback');
    });

    test('retry: incorrect answer reveals the correct answer, then a correct answer completes', async ({
      page,
    }) => {
      await page.clock.install({ time: CLOCK_START });
      await page.goto(`${BASE_URL}/lessons/lesson-001/`, {
        waitUntil: 'load',
      });
      await expect(page.locator('.practice-choice').first()).toBeVisible();

      const questions = await page.locator('[data-questions]').evaluate((el) =>
        JSON.parse(el.getAttribute('data-questions') ?? '[]'),
      );
      const correct = questions[0].correctAnswer;
      const incorrect = questions[0].choices.find(
        (choice: string) => choice !== correct,
      );
      expect(incorrect).toBeDefined();

      // Submit a wrong answer via keyboard.
      const incorrectChoice = page
        .locator('.practice-choice')
        .filter({ hasText: incorrect });
      await incorrectChoice.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.feedback-incorrect')).toContainText('不正解。');
      await expect(page.locator('.feedback-answer')).toContainText(
        `正解：${correct}`,
      );
      await expect(page.locator('.practice-feedback')).toBeFocused();

      // After the incorrect-timeout the same question re-renders; focus moves
      // back to the first choice (retry path).
      await page.clock.runFor(2000);
      const retriedChoice = page.locator('.practice-choice').first();
      await expect(retriedChoice).toBeVisible();
      await expect(retriedChoice).toBeFocused();

      // Answer correctly to complete.
      const correctChoice = page
        .locator('.practice-choice')
        .filter({ hasText: correct });
      await correctChoice.focus();
      await page.keyboard.press('Enter');
      await page.clock.runFor(1200);
      await expect(page.locator('.practice-complete')).toContainText(
        '練習完了！レッスンをクリアしました。',
      );
      await expect(page.locator('.practice-complete')).toBeFocused();
    });

    test('completion keeps focus on the status and Tab continues with no focus trap/loss', async ({
      page,
    }) => {
      await page.clock.install({ time: CLOCK_START });
      await page.goto(`${BASE_URL}/lessons/lesson-001/`, {
        waitUntil: 'load',
      });
      await expect(page.locator('.practice-choice').first()).toBeVisible();

      const questions = await page.locator('[data-questions]').evaluate((el) =>
        JSON.parse(el.getAttribute('data-questions') ?? '[]'),
      );
      const correct = questions[0].correctAnswer;
      const correctChoice = page
        .locator('.practice-choice')
        .filter({ hasText: correct });

      await correctChoice.focus();
      await page.keyboard.press('Enter');
      await page.clock.runFor(1200);

      // Completion status receives focus (not BODY).
      const completion = page.locator('.practice-complete');
      await expect(completion).toBeVisible();
      await expect(completion).toBeFocused();
      await expectVisibleFocus(page, 'completion status');

      // Tab continues through the rest of the page: the next lesson nav link is
      // reachable and focus never falls to the document body.
      const nextLink = page.locator('.lesson-nav a').last();
      await tabUntil(page, nextLink, 20, 'lesson nav link');
      await expectVisibleFocus(page, 'lesson nav link');
    });
  });
}
