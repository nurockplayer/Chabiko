import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { answerPractice, assertStructuralContract, BASE_URL } from './helpers';

const ROUTE = '/paths/taiwan-travel/';
const THEME_STORAGE_KEY = 'chabiko_theme';
const THEMES = ['light', 'dark'] as const;
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

test('resumes the Taiwan Travel quiz on reload and lesson practice on Back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${ROUTE}quiz/`);
  for (let index = 0; index < 3; index++) {
    await page.locator('[data-action="select"]').first().click();
    await page.locator('[data-action="submit"]').click();
    await page.locator('[data-action="next"]').click();
  }
  const prompt = page.locator('.taiwan-travel-quiz-prompt');
  const score = page.locator('[data-quiz-score]');
  const fourthPrompt = await prompt.textContent();
  const scoreAfterThree = await score.textContent();
  await page.reload();
  await expect(page.locator('[data-quiz-progress]')).toHaveText('3 / 24');
  await expect(prompt).toHaveText(fourthPrompt!);
  await expect(score).toHaveText(scoreAfterThree!);
  await expect(page.locator('.taiwan-travel-quiz-answer, [data-correct]')).toHaveCount(0);

  await page.addInitScript(() => {
    window.addEventListener('pageshow', (event) => {
      document.documentElement.dataset.pageshowPersisted = String(event.persisted);
    });
  });
  await page.goto('/lessons/lesson-002/#practice-heading');
  await answerPractice(page, 'correct');
  const practicePosition = page.locator('.practice-progress');
  await expect(practicePosition).toHaveText('質問 2 / 2');
  await page.locator('[data-phrasebook-link]').click();
  await expect(page).toHaveURL(/\/phrasebook\//);
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('data-pageshow-persisted', 'false');
  await expect(practicePosition).toHaveText('質問 2 / 2');
  await expect(page.locator('.practice-feedback')).toBeEmpty();
});

async function openRoute(
  page: Page,
  theme: (typeof THEMES)[number],
): Promise<{ errors: string[]; externalRequests: Set<string> }> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const externalRequests = new Set<string>();
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== BASE_URL) {
      externalRequests.add(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'load' });
  await expect(page.locator('[data-taiwan-travel-path]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return { errors, externalRequests };
}

async function assertWcagAaClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_AA_TAGS)
    .analyze();
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact != null && BLOCKING_IMPACTS.has(violation.impact),
  );
  if (blocking.length > 0) {
    const detail = blocking
      .map((violation) => {
        const targets = violation.nodes
          .map((node) => node.target.join(' '))
          .join(', ');
        return `[${violation.impact}] ${violation.id} at ${targets}: ${violation.helpUrl}`;
      })
      .join('\n');
    throw new Error(`serious/critical axe violations on ${ROUTE}:\n${detail}`);
  }
}

async function tabUntil(
  page: Page,
  target: Locator,
  maxTabs = 80,
): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`keyboard never reached ${await target.getAttribute('href')}`);
}

async function expectVisibleFocus(target: Locator): Promise<void> {
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      active: element === document.activeElement,
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focus.active).toBe(true);
  expect(focus.focusVisible).toBe(true);
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).not.toBe('0px');
}

for (const theme of THEMES) {
  test(`${theme}: WCAG AA, structural contract, and accessible names`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors, externalRequests } = await openRoute(page, theme);
    await assertStructuralContract(page);
    await assertWcagAaClean(page);

    const lessonLinks = page.locator('[data-taiwan-lesson-link]');
    await expect(lessonLinks).toHaveCount(24);
    for (let index = 0; index < 24; index += 1) {
      await expect(lessonLinks.nth(index)).toHaveAccessibleName(
        new RegExp(`^第${index + 1}課 .+を開く$`),
      );
    }
    await expect(
      page.locator('a[href="/paths/taiwan-travel/quiz/"]'),
    ).toHaveAccessibleName('総合テストに進む');

    expect([...externalRequests]).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('keyboard reaches every lesson in order and the distinct assessment action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, 'light');
  const lessonLinks = page.locator('[data-taiwan-lesson-link]');
  for (let index = 0; index < 24; index += 1) {
    const link = lessonLinks.nth(index);
    await tabUntil(page, link);
    await expectVisibleFocus(link);
  }
  const assessment = page.locator('a[href="/paths/taiwan-travel/quiz/"]');
  await tabUntil(page, assessment);
  await expectVisibleFocus(assessment);
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.width}x${viewport.height}: no overflow and full native targets`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openRoute(page, 'light');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    const links = page.locator(
      '[data-taiwan-lesson-link], a[href="/paths/taiwan-travel/quiz/"]',
    );
    await expect(links).toHaveCount(25);
    for (let index = 0; index < 25; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
  });
}
