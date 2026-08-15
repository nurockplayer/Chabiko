import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { prepareVisualCase } from './helpers';
import { VISUAL_CASES, VISUAL_THEMES } from './matrix';

/**
 * Per-snapshot tolerance for one confirmed cross-environment rendering
 * artifact only: the dark practice-correct card at the 768px tablet viewport
 * draws a 4px-radius feedback edge whose antialiasing differs by up to 3px
 * between CI's native amd64 Chromium and the emulated amd64 Chromium used to
 * regenerate baselines locally. The light counterpart and every other case
 * match at the repo's strict 0px contract; this override stays scoped to the
 * exact snapshot name and does not relax the global `maxDiffPixels: 0`.
 */
const DARK_PRACTICE_CORRECT_768 = 'dark-practice-correct-768x1024.png';

function snapshotOptions(snapshotName: string): { fullPage: false; maxDiffPixels?: number } {
  return {
    fullPage: false,
    ...(snapshotName === DARK_PRACTICE_CORRECT_768 ? { maxDiffPixels: 5 } : {}),
  };
}

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
          await expect(page).toHaveScreenshot(
            visualCase.snapshotName,
            snapshotOptions(visualCase.snapshotName),
          );
        },
      );
    }
  });
}
