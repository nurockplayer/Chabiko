import { expect, type Page } from '@playwright/test';
import type { HskQuizDirection, HskQuizEntry } from '../src/domain/hskQuiz';

export async function openHskQuiz(page: Page, level: number, direction: HskQuizDirection, length = 10) {
  await page.addInitScript(() => { Math.random = () => 0.42; });
  await page.goto(`/vocabulary/hsk/${level}/quiz/`);
  await expect(page.locator('[data-quiz-start]')).toBeEnabled();
  await page.locator(`[name="direction"][value="${direction}"]`).check();
  await page.locator(`[name="length"][value="${length}"]`).check();
  const response = await page.request.get(`/data/hsk/${level}.json`);
  return (await response.json()).entries as HskQuizEntry[];
}

export async function answerHskQuestion(page: Page, entries: HskQuizEntry[], direction: HskQuizDirection, correct = false) {
  const prompt = await page.locator('.quiz-prompt').textContent();
  const choices = page.locator('[data-action="answer"]');
  const labels = await choices.allTextContents();
  // Several source words can share a Japanese gloss; only one may be a choice.
  const entry = entries.find((e) => direction === 'zh-to-ja'
    ? e.simplified === prompt && labels.includes(e.japanese)
    : e.japanese === prompt && labels.includes(e.simplified))!;
  const answer = direction === 'zh-to-ja' ? entry.japanese : entry.simplified;
  const index = labels.findIndex((label) => correct ? label === answer : label !== answer);
  await choices.nth(index).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.quiz-pinyin')).toHaveText(entry.pinyin);
  await expect(page.locator('.quiz-feedback')).toHaveText(correct ? '○ 正解です' : '× 不正解です');
  await expect(page.locator('[data-action="next"]')).toBeFocused();
  await expect(page.locator('[data-pronunciation-text]')).toHaveAttribute('data-pronunciation-text', entry.simplified);
  await expect(page.locator('[data-pronunciation-lang]')).toHaveAttribute('data-pronunciation-lang', 'zh-CN');
}

export async function assertQuizConcealed(page: Page) {
  await expect(page.locator('[data-action="answer"]')).toHaveCount(4);
  await expect(page.locator('.quiz-pinyin, .quiz-answer, [data-correct], [data-pronunciation-text]')).toHaveCount(0);
  await expect(page.locator('.quiz-prompt')).toBeFocused();
}
