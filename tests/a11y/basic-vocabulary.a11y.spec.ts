import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  A11Y_THEMES,
  type A11yTheme,
} from './matrix';
import {
  assertNoExternalRequests,
  assertStructuralContract,
  BASE_URL,
  openUrl,
} from './helpers';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const ROUTE = '/vocabulary/basic/';

async function assertWcagAaClean(page: Page, state: string): Promise<void> {
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
    throw new Error(
      `serious/critical axe violations on ${ROUTE} (${state}):\n${detail}`,
    );
  }
}

async function openBasicVocabulary(
  page: Page,
  theme: A11yTheme,
): Promise<{ errors: string[]; externalRequests: Set<string> }> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  const externalRequests = await openUrl(page, `${BASE_URL}${ROUTE}`, theme);
  await expect(page.locator('[data-basic-vocabulary-session]')).toBeVisible();
  await expect(page.locator('[data-action="reveal"]')).toBeFocused();
  return { errors, externalRequests };
}

for (const theme of A11Y_THEMES) {
  test.describe(`/vocabulary/basic/ ${theme} theme`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    test('recall, reveal, and completion actions are WCAG AA clean', async ({
      page,
    }) => {
      const { errors, externalRequests } = await openBasicVocabulary(page, theme);
      await assertStructuralContract(page);

      const reveal = page.locator('[data-action="reveal"]');
      await assertWcagAaClean(page, `${theme}/recall`);
      await reveal.hover();
      await assertWcagAaClean(page, `${theme}/recall-hover`);

      const sessionSize = Number(
        await page
          .locator('[data-basic-vocabulary-session]')
          .getAttribute('data-basic-vocabulary-session-size'),
      );
      expect(sessionSize).toBeGreaterThan(0);

      for (let index = 0; index < sessionSize; index += 1) {
        if (index > 0) await page.locator('[data-action="reveal"]').click();
        else await reveal.click();
        await expect(page.locator('.basic-vocabulary-ratings')).toBeVisible();
        if (index === 0) {
          await assertWcagAaClean(page, `${theme}/revealed`);
        }
        await page.locator('[data-rating="known"]').click();
      }

      const continueAction = page.locator('[data-action="continue"]');
      await expect(continueAction).toBeVisible();
      await assertWcagAaClean(page, `${theme}/completed`);
      await continueAction.hover();
      await assertWcagAaClean(page, `${theme}/completed-hover`);

      assertNoExternalRequests(externalRequests);
      expect(errors).toEqual([]);
    });
  });
}
