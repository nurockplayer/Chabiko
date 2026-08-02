import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type {
  VisualCase,
  VisualState,
  VisualTheme,
} from './matrix';

const BASE_URL = 'http://127.0.0.1:4321';
const CLOCK_START = '2026-01-15T11:00:00+09:00';
const FIXED_TIME = '2026-01-15T12:00:00+09:00';
const FONT_FAMILY = 'Noto Sans JP Variable';
const THEME_STORAGE_KEY = 'chabiko_theme';
const PROGRESS_STORAGE_KEY = 'chabiko_completed_lessons';

const require = createRequire(import.meta.url);
const fontCssPath = require.resolve(
  '@fontsource-variable/noto-sans-jp/index.css',
);
const fontFilesDirectory = join(dirname(fontCssPath), 'files');
const fixedFontCss = readFileSync(fontCssPath, 'utf8')
  .replaceAll('url(./files/', 'url(/__visual-fonts/')
  .replaceAll('font-display: swap;', 'font-display: block;');

const fixedFontOverride = `${fixedFontCss}
  :root {
    --font-ja: '${FONT_FAMILY}', sans-serif !important;
    --font-zh: '${FONT_FAMILY}', sans-serif !important;
    --font-pinyin: '${FONT_FAMILY}', sans-serif !important;
  }
  *, *::before, *::after {
    font-family: '${FONT_FAMILY}', sans-serif !important;
    font-synthesis: none !important;
  }
`;

function fixtureStorage(theme: VisualTheme): Record<string, string> {
  return { [THEME_STORAGE_KEY]: theme };
}

async function readStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key) ?? '']),
    ),
  );
}

async function installNetworkBoundary(
  page: Page,
): Promise<Set<string>> {
  const externalRequests = new Set<string>();

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.origin !== BASE_URL) {
      externalRequests.add(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.pathname.startsWith('/__visual-fonts/')) {
      const fileName = decodeURIComponent(
        requestUrl.pathname.slice('/__visual-fonts/'.length),
      );
      if (!/^noto-sans-jp-[\w-]+\.woff2$/.test(fileName)) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        path: join(fontFilesDirectory, fileName),
        contentType: 'font/woff2',
      });
      return;
    }

    await route.continue();
  });

  return externalRequests;
}

async function installFixedFont(page: Page): Promise<void> {
  await page.addStyleTag({ content: fixedFontOverride });
  const fontState = await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    const regularFaces = await document.fonts.load(
      `400 16px "${fontFamily}"`,
      'ホーム 台湾 中国語 Chabiko',
    );
    const boldFaces = await document.fonts.load(
      `700 16px "${fontFamily}"`,
      '練習 正解 完了',
    );
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      regularFaceCount: regularFaces.length,
      boldFaceCount: boldFaces.length,
    };
  }, FONT_FAMILY);

  expect(fontState.bodyFont).toContain(FONT_FAMILY);
  expect(fontState.regularFaceCount).toBeGreaterThan(0);
  expect(fontState.boldFaceCount).toBeGreaterThan(0);
}

async function assertTheme(page: Page, theme: VisualTheme): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#theme-toggle')).toHaveAttribute(
    'aria-pressed',
    theme === 'dark' ? 'true' : 'false',
  );
  const colorScheme = await page.locator('html').evaluate(
    (element) => getComputedStyle(element).colorScheme,
  );
  expect(colorScheme).toBe(theme);
}

async function clickPracticeAnswer(
  page: Page,
  kind: 'correct' | 'incorrect',
): Promise<void> {
  const question = await page.locator('[data-questions]').evaluate((element) => {
    const questions = JSON.parse(
      element.getAttribute('data-questions') ?? '[]',
    ) as Array<{ correctAnswer: string; choices: string[] }>;
    return questions[0];
  });
  expect(question).toBeDefined();

  const value =
    kind === 'correct'
      ? question.correctAnswer
      : question.choices.find((choice) => choice !== question.correctAnswer);
  expect(value).toBeDefined();

  await page.locator('.practice-choice').filter({ hasText: value }).click();
}

async function setPracticeState(
  page: Page,
  state: VisualState,
): Promise<void> {
  const choices = page.locator('.practice-choice');
  await expect(choices.first()).toBeVisible();

  if (state === 'practice-unanswered') {
    await expect(page.locator('.practice-feedback')).toBeEmpty();
    await expect(choices.first()).toBeEnabled();
    return;
  }

  if (state === 'practice-correct') {
    await clickPracticeAnswer(page, 'correct');
    await expect(page.locator('.feedback-correct')).toHaveText('✓正解！');
    await expect(choices.first()).toBeDisabled();
    return;
  }

  if (state === 'practice-incorrect') {
    await clickPracticeAnswer(page, 'incorrect');
    await expect(page.locator('.feedback-incorrect')).toHaveText('✕不正解。');
    await expect(page.locator('.feedback-answer')).toContainText('正解：');
    await expect(choices.first()).toBeDisabled();
    return;
  }

  if (state === 'completion') {
    await clickPracticeAnswer(page, 'correct');
    await expect(page.locator('.feedback-correct')).toBeVisible();
    await page.clock.runFor(1200);
    await expect(page.locator('.practice-complete')).toContainText(
      '練習完了！レッスンをクリアしました。',
    );
  }
}

async function alignCapture(page: Page, state: VisualState): Promise<void> {
  if (state === 'home') {
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    return;
  }

  const selector = state === 'lesson-reading' ? '.lesson-intro' : '.lesson-practice';
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  await target.evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo(0, Math.max(0, Math.floor(top)));
  });
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(56);

  const evidenceSelector =
    state === 'lesson-reading'
      ? '.lesson-intro'
      : state === 'completion'
        ? '.practice-complete'
        : '.practice-question';
  const evidence = page.locator(evidenceSelector);
  await expect(evidence).toBeVisible();
  const evidenceBox = await evidence.boundingBox();
  expect(evidenceBox).not.toBeNull();
  expect(evidenceBox!.y).toBeGreaterThanOrEqual(56);
  expect(evidenceBox!.y + evidenceBox!.height).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight),
  );
}

async function assertCaptureContract(
  page: Page,
  visualCase: VisualCase,
  externalRequests: Set<string>,
): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await assertTheme(page, visualCase.theme);

  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.innerWidth).toBe(visualCase.viewport.width);
  expect(dimensions.innerHeight).toBe(visualCase.viewport.height);
  expect(dimensions.clientWidth).toBe(visualCase.viewport.width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect([...externalRequests]).toEqual([]);
}

export async function prepareVisualCase(
  page: Page,
  visualCase: VisualCase,
): Promise<void> {
  await page.setViewportSize(visualCase.viewport);
  await page.emulateMedia({
    colorScheme: visualCase.theme,
    reducedMotion: 'reduce',
  });
  const externalRequests = await installNetworkBoundary(page);
  await page.clock.install({ time: CLOCK_START });

  const route = visualCase.state === 'home' ? '/' : '/lessons/lesson-001/';
  await page.goto(route, { waitUntil: 'load' });
  await installFixedFont(page);
  await page.clock.pauseAt(FIXED_TIME);

  expect(await readStorage(page)).toEqual(fixtureStorage(visualCase.theme));
  await assertTheme(page, visualCase.theme);

  if (
    visualCase.state === 'practice-unanswered' ||
    visualCase.state === 'practice-correct' ||
    visualCase.state === 'practice-incorrect' ||
    visualCase.state === 'completion'
  ) {
    await setPracticeState(page, visualCase.state);
  }

  const expectedStorage = fixtureStorage(visualCase.theme);
  if (
    visualCase.state === 'practice-correct' ||
    visualCase.state === 'completion'
  ) {
    expectedStorage[PROGRESS_STORAGE_KEY] = '["lesson-001"]';
  }
  expect(await readStorage(page)).toEqual(expectedStorage);

  await alignCapture(page, visualCase.state);
  await assertCaptureContract(page, visualCase, externalRequests);
}
