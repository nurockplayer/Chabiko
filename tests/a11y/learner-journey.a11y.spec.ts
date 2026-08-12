import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  A11Y_CASES,
  A11Y_SURFACE_SCAN_TARGET,
  A11Y_THEMES,
  type A11ySurface,
} from './matrix';
import {
  analyzeWithPausedClock,
  assertNoExternalRequests,
  assertStructuralContract,
  PROGRESS_STORAGE_KEY,
  readStorage,
  setupSurface,
  THEME_STORAGE_KEY,
} from './helpers';

/**
 * Required axe tags for the automated WCAG AA pass: color contrast,
 * landmarks/headings structure, accessible names/roles/states, language
 * attributes, form/control semantics and duplicate-id detection are all
 * members of these tags. Running the full default rule set keeps serious and
 * critical violations visible and unsuppressed.
 */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Only serious and critical impacts block the matrix. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Build the axe builder for a surface, scoping to the surface's region when
 *  the matrix declares one (reading vs practice). Never weakens the rule set. */
function builderForSurface(page: Page, surface: A11ySurface): AxeBuilder {
  const target = A11Y_SURFACE_SCAN_TARGET[surface];
  const builder = new AxeBuilder({ page }).withTags(WCAG_AA_TAGS);
  return target !== undefined ? builder.include(target) : builder;
}

for (const theme of A11Y_THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    for (const a11yCase of A11Y_CASES.filter(
      (candidate) => candidate.theme === theme,
    )) {
      test(`axe WCAG AA scan: ${a11yCase.surface}`, async ({ page }) => {
        const externalRequests = await setupSurface(
          page,
          a11yCase.surface,
          theme,
        );

        await assertStructuralContract(page);
        assertNoExternalRequests(externalRequests);

        const results = await analyzeWithPausedClock(
          page,
          builderForSurface(page, a11yCase.surface),
        );

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
            `serious/critical axe violations on ${theme}/${a11yCase.surface}:\n${detail}`,
          );
        }

        // The isolated profile is preserved: completion writes only the
        // progress key for the completed lesson.
        const storage = await readStorage(page);
        const expectedProgress =
          a11yCase.surface === 'completion'
            ? ['lesson-001']
            : undefined;
        expect(storage[THEME_STORAGE_KEY]).toBe(theme);
        if (expectedProgress) {
          expect(storage[PROGRESS_STORAGE_KEY]).toBe(
            JSON.stringify(expectedProgress),
          );
        }
      });
    }

    // Transient-state stability regression (#71): a practice transition timer
    // must never fire from real wall-clock time alone. Each case waits longer
    // than its transition window and asserts the named transient surface is
    // still showing — these fail if real elapsed time can transition it.
    test(`practice-correct stays frozen past the transition window (${theme})`, async ({
      page,
    }) => {
      await setupSurface(page, 'practice-correct', theme);
      // Wait longer than the 1200ms completion transition in real wall-clock
      // time; the feedback surface must not transition to completion.
      await page.waitForTimeout(1500);
      await expect(page.locator('.feedback-correct')).toContainText('正解！');
      await expect(page.locator('.practice-complete')).not.toBeVisible();
    });

    test(`practice-incorrect stays frozen past the transition window (${theme})`, async ({
      page,
    }) => {
      await setupSurface(page, 'practice-incorrect', theme);
      // Wait longer than the 2000ms retry transition in real wall-clock time;
      // the feedback surface must not re-render the question.
      await page.waitForTimeout(2500);
      await expect(page.locator('.feedback-incorrect')).toContainText('不正解。');
      await expect(page.locator('.feedback-answer')).toContainText('正解：');
    });
  });
}
