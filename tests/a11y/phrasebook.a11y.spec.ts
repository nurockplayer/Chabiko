import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BASE_URL, assertStructuralContract } from './helpers';

/**
 * /phrasebook/ accessibility (Issue #236, fail-closed rework per the #349
 * kanji-bridge precedent).
 *
 * The learner surface is fail-closed: the bounded #440 prelaunch projection
 * renders exactly the canonical 30 phrases + 6 dialogs while preserving each
 * record's truthful review status. These specs cover that exact launch surface
 * with an axe WCAG AA scan
 * (serious/critical blocking), the global structural contract, the semantic
 * heading/live-status/reset affordances, truthful draft-status presentation, a
 * no-cross-origin boundary, a clean console, and keyboard reachability +
 * visible focus for the native scenario select AND the global header
 * script-preference select.
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

test.describe('/phrasebook/ axe + structure (fail-closed prelaunch surface)', () => {
  test('prelaunch surface: WCAG AA clean, structural contract, no external requests', async ({
    page,
  }) => {
    const { errors, externalRequests } = await openRoute(page);
    await assertStructuralContract(page);
    await assertWcagAaClean(page);

    // The bounded prelaunch surface: exact canonical 30 phrases + 6 dialogs.
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

    // One h1 and all six canonical scenario h2 headings in controlled order.
    await expect(page.locator('h1')).toHaveText('台湾旅行フレーズ集');
    const scenarioHeadings = page.locator('h2');
    await expect(scenarioHeadings).toHaveCount(6);
    await expect(scenarioHeadings).toHaveText(['空港', '交通', '食事', '買い物', 'ホテル', '緊急時']);
    // Every canonical scenario carries one dialog heading.
    await expect(page.locator('h3').filter({ hasText: '会話' })).toHaveCount(6);

    // The scenario count is a live status region announcing the canonical set.
    const count = page.locator('[data-scenario-count]');
    await expect(count).toHaveAttribute('role', 'status');
    await expect(count).toHaveText('全30件');

    // The reset link clears the filter back to the unfiltered surface.
    const reset = page.locator('a[href="/phrasebook/"]');
    await expect(reset).toContainText('絞り込みを解除');
  });

  test('draft records remain visibly truthful on the prelaunch surface', async ({
    page,
  }) => {
    await openRoute(page);

    await expect(page.locator('[data-phrasebook-pending]')).toHaveCount(0);
    await expect(page.locator('.phrasebook-phrase__provenance')).toHaveCount(30);
    await expect(
      page.locator('.phrasebook-phrase__provenance').filter({ hasText: '未レビュー' }),
    ).toHaveCount(24);
    await expect(page.locator('.phrasebook-dialog__provenance')).toHaveCount(6);
    await expect(
      page.locator('.phrasebook-dialog__provenance').filter({ hasText: '未レビュー' }),
    ).toHaveCount(6);
    await expect(
      page.locator('.phrasebook-phrase__provenance').filter({ hasText: 'レビュー済み' }),
    ).toHaveCount(6);
  });

  test('the scenario select filters to a canonical scenario via the URL', async ({
    page,
  }) => {
    await openRoute(page, '?scenario=food');
    await expect(
      page.locator('[data-phrasebook-scenario][data-scenario="food"]'),
    ).toBeVisible();
    // The other scenario groups are hidden by the filter (still in DOM).
    await expect(
      page.locator('[data-phrasebook-scenario][data-scenario="airport"]'),
    ).toBeHidden();
    await expect(page.locator('[data-scenario-count]')).toHaveText('5件');
  });

  test('a controlled scenario keeps its canonical content and no-match stays hidden', async ({
    page,
  }) => {
    await openRoute(page, '?scenario=transport');
    await expect(page.locator('[data-phrasebook-scenario][data-scenario="transport"]')).toBeVisible();
    await expect(page.locator('[data-phrasebook-scenario][data-scenario="transport"] [data-phrasebook-entry]')).toHaveCount(5);
    await expect(page.locator('[data-phrasebook-no-match]')).toBeHidden();
    await expect(page.locator('[data-scenario-count]')).toHaveText('5件');
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
    await expect(page.locator('[data-scenario-count]')).toHaveText('5件');
    await expect(page.locator('a[href="/phrasebook/"]')).toBeVisible();
  });
});
