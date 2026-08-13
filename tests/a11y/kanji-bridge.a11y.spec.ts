import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BASE_URL, assertStructuralContract } from './helpers';

/**
 * /vocabulary/kanji-bridge/ accessibility (Issue #235).
 *
 * The route is fail-closed on the production-eligibility gate: with the
 * current all-generated/all-draft corpus it server-renders its pending state
 * and leaks no entry content. These specs cover that pending surface — an axe
 * WCAG AA scan (serious/critical blocking), the global structural contract, a
 * no-cross-origin boundary, a clean console, a live-status pending message,
 * and keyboard reachability of the global header script-preference select.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

const ROUTE = '/vocabulary/kanji-bridge/';

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
  await expect(page.locator('[data-kanji-bridge-page]')).toBeVisible();
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

test.describe('/vocabulary/kanji-bridge/ axe + structure (fail-closed)', () => {
  test('pending state: WCAG AA clean, structural contract, no external requests', async ({
    page,
  }) => {
    const { errors, externalRequests } = await openRoute(page);
    await assertStructuralContract(page);
    await assertWcagAaClean(page);
    // The fail-closed pending state is the only surface the current
    // (all generated/draft) corpus produces; no entry cards are rendered.
    await expect(page.locator('[data-kanji-bridge-pending]')).toBeVisible();
    await expect(page.locator('[data-kanji-bridge-entry]')).toHaveCount(0);
    expect([...externalRequests]).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the pending message is a live status region (role=status)', async ({
    page,
  }) => {
    await openRoute(page);
    const pending = page.locator(
      '[data-kanji-bridge-pending] .kanji-bridge-pending',
    );
    await expect(pending).toHaveAttribute('role', 'status');
  });
});

test.describe('/vocabulary/kanji-bridge/ keyboard flows', () => {
  test('header script-preference select is reachable and has visible focus', async ({
    page,
  }) => {
    await openRoute(page);
    const headerSelect = page.locator('#script-preference-select');

    await page.keyboard.press('Tab'); // skip link
    await tabUntil(page, headerSelect, 40, 'header script-preference select');
    await expectVisibleFocus(page, 'header script-preference select');
    await expect(headerSelect).toHaveValue('path-default');
  });
});
