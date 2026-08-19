import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { A11Y_THEMES, type A11yTheme } from './matrix';
import {
  assertNoExternalRequests,
  assertStructuralContract,
  BASE_URL,
  openUrl,
} from './helpers';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const ROUTE = '/vocabulary/hsk/1/';

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

async function openHskVocabulary(
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
  await expect(page.locator('.flashcard-session-root')).toBeVisible();
  await expect(page.locator('#btn-start')).toBeEnabled();
  return { errors, externalRequests };
}

for (const theme of A11Y_THEMES) {
  test.describe(`${ROUTE} ${theme} theme`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    test('setup, recall, reveal, and completion actions are WCAG AA clean', async ({
      page,
    }) => {
      const { errors, externalRequests } = await openHskVocabulary(page, theme);
      await assertStructuralContract(page);

      const start = page.locator('#btn-start');
      await assertWcagAaClean(page, `${theme}/setup`);
      await start.hover();
      await assertWcagAaClean(page, `${theme}/setup-hover`);

      await start.click();
      await expect(page.locator('#btn-reveal')).toBeFocused();
      await expect(page.locator('[data-back]')).toBeHidden();
      await expect(page.locator('[data-pinyin]')).toBeEmpty();
      await expect(page.locator('[data-japanese]')).toBeEmpty();
      await assertWcagAaClean(page, `${theme}/recall`);

      const reveal = page.locator('#btn-reveal');
      await reveal.hover();
      await assertWcagAaClean(page, `${theme}/recall-hover`);
      await reveal.click();
      await expect(page.locator('[data-back]')).toBeVisible();
      await expect(page.locator('[data-pinyin]')).not.toBeEmpty();
      await expect(page.locator('[data-japanese]')).not.toBeEmpty();
      await assertWcagAaClean(page, `${theme}/revealed`);

      let ratings = 0;
      while (!(await page.locator('#btn-restart').isVisible())) {
        if (await page.locator('#btn-reveal').isVisible()) {
          await page.locator('#btn-reveal').click();
        }
        await page.locator('#btn-known').click();
        ratings += 1;
        expect(ratings).toBeLessThanOrEqual(20);
      }

      const restart = page.locator('#btn-restart');
      await assertWcagAaClean(page, `${theme}/completed`);
      await restart.hover();
      await assertWcagAaClean(page, `${theme}/completed-hover`);

      assertNoExternalRequests(externalRequests);
      expect(errors).toEqual([]);
    });
  });
}
