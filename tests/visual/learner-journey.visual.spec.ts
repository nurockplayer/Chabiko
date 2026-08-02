import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { prepareVisualCase } from './helpers';
import { VISUAL_CASES, VISUAL_THEMES } from './matrix';

for (const theme of VISUAL_THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({
      colorScheme: theme,
      storageState: fileURLToPath(
        new URL(`./fixtures/${theme}.storage.json`, import.meta.url),
      ),
    });

    for (const visualCase of VISUAL_CASES.filter(
      (candidate) => candidate.theme === theme,
    )) {
      test(
        `${visualCase.state} ${visualCase.viewport.width}x${visualCase.viewport.height}`,
        async ({ page }) => {
          await prepareVisualCase(page, visualCase);
          await expect(page).toHaveScreenshot(visualCase.snapshotName, {
            fullPage: false,
          });
        },
      );
    }
  });
}
