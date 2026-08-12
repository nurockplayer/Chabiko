import { expect, type Page } from '@playwright/test';
import type AxeBuilder from '@axe-core/playwright';

export const BASE_URL = 'http://127.0.0.1:4321';

/** Storage keys written by the app for theme and lesson progress. */
export const THEME_STORAGE_KEY = 'chabiko_theme';
export const PROGRESS_STORAGE_KEY = 'chabiko_completed_lessons';

export type A11yTheme = 'light' | 'dark';

const CLOCK_START = '2026-01-15T11:00:00+09:00';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** The subset of timer globals that axe-core relies on. */
interface TimerSwapState {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
}

/**
 * Run an axe scan while the page clock stays paused. Axe-core defers its work
 * with `setTimeout(fn, 0)`; with a paused Playwright clock those zero-delay
 * timers would never fire and the scan would stall. The practice transition
 * timers (+1200/+2000ms) are already scheduled inside the paused fake clock's
 * queue, so for the scan we temporarily expose the real browser timers
 * (captured in openUrl before install): axe's new calls use real timers while
 * the frozen transition timers stay untouched in the paused queue. The
 * transient surface therefore stays stable for the whole scan regardless of
 * wall-clock duration. On an unpaused clock, or when no real timers were
 * captured, the scan simply completes and the swap is a no-op.
 */
export async function analyzeWithPausedClock(
  page: Page,
  builder: AxeBuilder,
): Promise<AxeResults> {
  await page.evaluate(() => {
    const holder = window as unknown as {
      __chabikoRealTimers?: TimerSwapState;
      __chabikoTimerSwap?: TimerSwapState;
    };
    const real = holder.__chabikoRealTimers;
    if (!real) return;
    holder.__chabikoTimerSwap = {
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
    };
    window.setTimeout = real.setTimeout;
    window.clearTimeout = real.clearTimeout;
    window.setInterval = real.setInterval;
    window.clearInterval = real.clearInterval;
  });
  try {
    return await builder.analyze();
  } finally {
    await page.evaluate(() => {
      const holder = window as unknown as {
        __chabikoTimerSwap?: TimerSwapState;
      };
      const saved = holder.__chabikoTimerSwap;
      if (!saved) return;
      window.setTimeout = saved.setTimeout;
      window.clearTimeout = saved.clearTimeout;
      window.setInterval = saved.setInterval;
      window.clearInterval = saved.clearInterval;
      delete holder.__chabikoTimerSwap;
    });
  }
}

/**
 * Navigate to the given URL with a frozen clock and an isolated storage
 * profile seeded by the theme storageState fixture (theme only, no progress).
 * Returns the set of external request URLs that were aborted so the test can
 * assert no cross-origin dependency.
 */
export async function openUrl(
  page: Page,
  url: string,
  theme: A11yTheme,
): Promise<Set<string>> {
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

  // Capture the real browser timers before the clock fakes them, so an axe
  // scan can temporarily expose them while the paused transition timers stay
  // frozen (see analyzeWithPausedClock). Runs before the clock's init script
  // on every navigation, so it always records the pre-fake functions.
  await page.addInitScript(() => {
    const holder = window as unknown as { __chabikoRealTimers?: TimerSwapState };
    if (holder.__chabikoRealTimers) return;
    holder.__chabikoRealTimers = {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
    };
  });

  await page.clock.install({ time: CLOCK_START });
  await page.goto(url, { waitUntil: 'load' });

  // The theme bootstrap runs on load from the seeded storageState, so the page
  // must already be themed; storage is isolated (theme key only, no progress).
  expect(await readStorage(page)).toEqual({ [THEME_STORAGE_KEY]: theme });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return externalRequests;
}

/** Re-read storage; used to assert the isolated profile is preserved. */
export async function readStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key) ?? '']),
    ),
  );
}

/**
 * Pause the installed Playwright clock so the practice transition timers
 * (1200ms completion / 2000ms retry) can never fire during structural
 * assertions and the axe scan. `pauseAt` is the documented paused-clock
 * primitive: after it no timers fire unless runFor/fastForward/pauseAt/resume
 * is called, so the surface stays in its named transient state deterministically
 * regardless of wall-clock duration.
 *
 * This is always called before any practice interaction, when no transition
 * timer is scheduled yet (the app's only timers are the answer handlers' 1200ms
 * / 2000ms transitions), so pausing slightly ahead of the current clock time
 * fires nothing: the small buffer only covers the round-trip between reading
 * the page clock and applying the pause, so the controller never sees a past
 * timestamp. Completion/retry surfaces then advance only explicitly (via
 * runFor in setupSurface / specs).
 */
export async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
}

interface Question {
  correctAnswer: string;
  choices: string[];
}

function readQuestions(page: Page): Promise<Question[]> {
  return page.locator('[data-questions]').evaluate((element) => {
    const raw = element.getAttribute('data-questions') ?? '[]';
    return JSON.parse(raw) as Question[];
  });
}

/** Click the first question's correct (or a deliberately wrong) choice. */
export async function answerPractice(
  page: Page,
  kind: 'correct' | 'incorrect',
): Promise<void> {
  const questions = await readQuestions(page);
  const question = questions[0];
  expect(question).toBeDefined();

  const value =
    kind === 'correct'
      ? question.correctAnswer
      : question.choices.find((choice) => choice !== question.correctAnswer);
  expect(value).toBeDefined();

  await page.locator('.practice-choice').filter({ hasText: value }).click();
}

/**
 * Bring the lesson page into one of the six surface states:
 * - home: the home page
 * - lesson-reading: the lesson page, before any answer
 * - practice-unanswered: the first practice question is visible and enabled
 * - practice-correct: a correct answer was submitted and feedback is showing
 * - practice-incorrect: a wrong answer was submitted and feedback is showing
 * - completion: the lesson was completed and the completion status is showing
 */
export async function setupSurface(
  page: Page,
  surface: string,
  theme: A11yTheme,
): Promise<Set<string>> {
  if (surface === 'home') {
    return openUrl(page, `${BASE_URL}/`, theme);
  }

  const externalRequests = await openUrl(
    page,
    `${BASE_URL}/lessons/lesson-001/`,
    theme,
  );
  const choices = page.locator('.practice-choice');
  await expect(choices.first()).toBeVisible();

  if (surface === 'lesson-reading' || surface === 'practice-unanswered') {
    await expect(page.locator('.practice-feedback')).toBeEmpty();
    await expect(choices.first()).toBeEnabled();
    return externalRequests;
  }

  if (surface === 'practice-correct') {
    // Freeze the clock before interacting so the 1200ms completion transition
    // timer is frozen the moment it is scheduled — the feedback assertion and
    // axe scan then see the stable practice-correct state regardless of CI
    // timing.
    await freezeClock(page);
    await answerPractice(page, 'correct');
    await expect(page.locator('.feedback-correct')).toContainText('正解！');
    return externalRequests;
  }

  if (surface === 'practice-incorrect') {
    // Freeze before interacting so the 2000ms retry transition timer is frozen
    // the moment it is scheduled; the feedback assertions and axe scan see the
    // stable practice-incorrect state.
    await freezeClock(page);
    await answerPractice(page, 'incorrect');
    await expect(page.locator('.feedback-incorrect')).toContainText('不正解。');
    await expect(page.locator('.feedback-answer')).toContainText('正解：');
    return externalRequests;
  }

  // completion
  // Freeze before interacting so the 1200ms completion transition timer is
  // frozen the moment it is scheduled; the surface advances only via the
  // explicit runFor below.
  await freezeClock(page);
  await answerPractice(page, 'correct');
  await expect(page.locator('.feedback-correct')).toBeVisible();
  await page.clock.runFor(1200);
  await expect(page.locator('.practice-complete')).toContainText(
    '練習完了！レッスンをクリアしました。',
  );
  return externalRequests;
}

/**
 * Assert the global structural contract shared by every surface:
 * - a single h1 with non-empty text
 * - exactly one main landmark and at least one labelled navigation landmark
 * - no duplicate id attributes anywhere on the page
 * - html carries a valid lang attribute
 * - the skip link is present and its target is programmatically focusable
 */
export async function assertStructuralContract(
  page: Page,
): Promise<void> {
  const headings = page.locator('h1');
  await expect(headings).toHaveCount(1);
  await expect(headings.first()).not.toBeEmpty();

  const mains = page.locator('main');
  await expect(mains).toHaveCount(1);
  const navs = page.locator('nav[aria-label]');
  expect(await navs.count()).toBeGreaterThanOrEqual(1);

  const duplicateIds = await page.evaluate(() => {
    const seen = new Map<string, number>();
    document.querySelectorAll('[id]').forEach((element) => {
      seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
    });
    return [...seen.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);

  const lang = await page.locator('html').getAttribute('lang');
  expect(lang).toMatch(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/);

  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toHaveAttribute('href', '#main-content');
  const skipTarget = page.locator('main#main-content');
  await expect(skipTarget).toHaveAttribute('tabindex', '-1');
}

/** Assert no cross-origin requests were attempted for the surface. */
export function assertNoExternalRequests(
  externalRequests: Set<string>,
): void {
  expect([...externalRequests]).toEqual([]);
}
