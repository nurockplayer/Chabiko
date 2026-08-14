import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BASE_URL, assertStructuralContract } from './helpers';

/**
 * /phrasebook/ accessibility (Issue #236).
 *
 * Unlike the kanji-bridge route there is NO production-eligibility gate and NO
 * pending state: the full first-release surface server-renders all 30 phrases
 * and all 6 dialogs (36 turns) in scenario order. These specs cover that real
 * surface — an axe WCAG AA scan (serious/critical blocking), the global
 * structural contract, the semantic heading/live-status/reset affordances, a
 * no-cross-origin boundary, a clean console, and keyboard reachability + visible
 * focus for the native scenario select AND the global header script-preference
 * select.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

const ROUTE = '/phrasebook/';

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

/** Press Tab repeatedly (bounded) until the target is focused, or fail with a
 *  helpful message. Proves keyboard reachability without a global tab count. */
async function tabUntil(
  page: Page,
  target: Locator,
  maxTabs = 60,
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

/** Open the route (optionally filtered) with a cross-origin boundary installed,
 *  asserting no external request was attempted. Returns the console errors. */
async function openRoute(
  page: Page,
  search = '',
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

  await page.goto(`${BASE_URL}${ROUTE}${search}`, { waitUntil: 'load' });
  await expect(page.locator('[data-phrasebook-page]')).toBeVisible();
  return { errors, externalRequests };
}

/** Run the axe WCAG AA scan and fail on serious/critical violations. */
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

test.describe('/phrasebook/ axe + structure (full surface)', () => {
  test('full surface: WCAG AA clean, structural contract, no external requests', async ({
    page,
  }) => {
    const { errors, externalRequests } = await openRoute(page);
    await assertStructuralContract(page);
    await assertWcagAaClean(page);

    // The complete first-release surface: all 30 phrases, all 6 dialogs, all
    // 36 turns — no pending state and no eligibility gate.
    await expect(page.locator('[data-phrasebook-entry]')).toHaveCount(30);
    await expect(page.locator('[data-phrasebook-dialog]')).toHaveCount(6);
    await expect(page.locator('[data-phrasebook-dialog-turn]')).toHaveCount(36);
    await expect(page.locator('[data-phrasebook-pending]')).toHaveCount(0);

    expect([...externalRequests]).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('semantic headings, live count, and reset affordance', async ({
    page,
  }) => {
    await openRoute(page);

    // One h1, six scenario h2 headings in controlled order, dialog h3 headings.
    await expect(page.locator('h1')).toHaveText('台湾旅行フレーズ集');
    const scenarioHeadings = page.locator('h2');
    await expect(scenarioHeadings).toHaveCount(6);
    await expect(scenarioHeadings.nth(0)).toHaveText('空港');
    await expect(scenarioHeadings.nth(1)).toHaveText('交通');
    await expect(scenarioHeadings.nth(2)).toHaveText('食事');
    await expect(scenarioHeadings.nth(3)).toHaveText('買い物');
    await expect(scenarioHeadings.nth(4)).toHaveText('ホテル');
    await expect(scenarioHeadings.nth(5)).toHaveText('緊急時');
    await expect(page.locator('h3').filter({ hasText: '会話' })).toHaveCount(6);

    // The scenario count is a live status region announcing the visible set.
    const count = page.locator('[data-scenario-count]');
    await expect(count).toHaveAttribute('role', 'status');
    await expect(count).toHaveText('全6件');

    // The reset link clears the filter back to the unfiltered surface.
    const reset = page.locator('a[href="/phrasebook/"]');
    await expect(reset).toContainText('絞り込みを解除');
  });

  test('the scenario select filters to one scenario group via the URL', async ({
    page,
  }) => {
    await openRoute(page, '?scenario=food');
    await expect(
      page.locator('[data-phrasebook-scenario][data-scenario="food"]'),
    ).toBeVisible();
    // The other scenario groups are hidden by the filter (still in the DOM).
    for (const scenario of ['airport', 'transport', 'shopping', 'hotel', 'emergency']) {
      await expect(
        page.locator(`[data-phrasebook-scenario][data-scenario="${scenario}"]`),
      ).toBeHidden();
    }
    await expect(page.locator('[data-scenario-count]')).toHaveText('1件');
  });
});

test.describe('/phrasebook/ keyboard flows', () => {
  test('header script-preference select is reachable and has visible focus', async ({
    page,
  }) => {
    await openRoute(page);
    const headerSelect = page.locator('#script-preference-select');

    await page.keyboard.press('Tab'); // skip link
    await tabUntil(page, headerSelect, 60, 'header script-preference select');
    await expectVisibleFocus(page, 'header script-preference select');
    await expect(headerSelect).toHaveValue('path-default');
  });

  test('the native scenario select is reachable, focusable, and filters by keyboard', async ({
    page,
  }) => {
    await openRoute(page);
    const scenarioSelect = page.locator('#phrasebook-scenario-filter');

    await page.keyboard.press('Tab'); // skip link
    await tabUntil(page, scenarioSelect, 60, 'scenario select');
    await expectVisibleFocus(page, 'scenario select');

    // Native <select>: operate it with the keyboard by choosing 食事.
    await scenarioSelect.selectOption('food');
    await expect(
      page.locator('[data-phrasebook-scenario][data-scenario="food"]'),
    ).toBeVisible();
    await expect(page.locator('[data-scenario-count]')).toHaveText('1件');
    await expect(page.locator('a[href="/phrasebook/"]')).toBeVisible();
  });
});
