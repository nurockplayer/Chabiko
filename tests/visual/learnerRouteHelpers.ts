import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { BASIC_VOCABULARY_PROGRESS_KEY } from '../../src/domain/basicVocabularyProgress';

const BASE_URL = 'http://127.0.0.1:4321';
const FONT_FAMILY = 'Noto Sans JP Variable';

const require = createRequire(import.meta.url);
const fontCssPath = require.resolve(
  '@fontsource-variable/noto-sans-jp/index.css',
);
const fontFilesDirectory = join(dirname(fontCssPath), 'files');
const fixedFontCss = readFileSync(fontCssPath, 'utf8')
  .replaceAll('url(./files/', 'url(/__visual-fonts/')
  .replaceAll('font-display: swap;', 'font-display: block;');

const fixedFontOverride = `${fixedFontCss}
  :root {
    --font-ja: '${FONT_FAMILY}', sans-serif !important;
    --font-zh: '${FONT_FAMILY}', sans-serif !important;
    --font-pinyin: '${FONT_FAMILY}', sans-serif !important;
  }
  *, *::before, *::after {
    font-family: '${FONT_FAMILY}', sans-serif !important;
    font-synthesis: none !important;
  }
`;

/** Build the v1 progress document exactly as BasicVocabularyProgressStore
 * persists it: `{version:1, items:{id:{status,knownStreak}}}`. Leading items
 * marked learned (two known) push the next session window past them. */
function learnedProgressDocument(ids: readonly string[]): string {
  const items: Record<string, { status: 'learned'; knownStreak: number }> = {};
  for (const id of ids) {
    items[id] = { status: 'learned', knownStreak: 2 };
  }
  return JSON.stringify({ version: 1, items });
}

async function installFixedFont(page: Page): Promise<void> {
  await page.addStyleTag({ content: fixedFontOverride });
  await page.evaluate(async (fontFamily) => {
    await document.fonts.ready;
    await document.fonts.load(
      `400 16px "${fontFamily}"`,
      'ホーム 台湾 中国語 Chabiko',
    );
    await document.fonts.load(
      `700 16px "${fontFamily}"`,
      '練習 正解 完了',
    );
  }, FONT_FAMILY);
}

/** Route same-origin asset requests and fulfill the fixed fonts from the local
 * package, aborting anything else, so captures are deterministic. Returns the
 * set of aborted external request URLs. */
async function installNetworkBoundary(page: Page): Promise<Set<string>> {
  const externalRequests = new Set<string>();
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== BASE_URL) {
      externalRequests.add(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }
    if (requestUrl.pathname.startsWith('/__visual-fonts/')) {
      const fileName = decodeURIComponent(
        requestUrl.pathname.slice('/__visual-fonts/'.length),
      );
      if (!/^noto-sans-jp-[\w-]+\.woff2$/.test(fileName)) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        path: join(fontFilesDirectory, fileName),
        contentType: 'font/woff2',
      });
      return;
    }
    await route.continue();
  });
  return externalRequests;
}

/** Load /vocabulary/basic/ with the given leading learned IDs so the bounded
 * session window lands on a controlled item. Returns page-scoped handles. */
export async function openLearnerRoute(
  page: Page,
  learnedIds: readonly string[],
): Promise<{
  externalRequests: Set<string>;
  card: ReturnType<Page['locator']>;
  total: ReturnType<Page['locator']>;
  progress: ReturnType<Page['locator']>;
  simplified: ReturnType<Page['locator']>;
}> {
  const externalRequests = await installNetworkBoundary(page);
  if (learnedIds.length > 0) {
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, value);
      },
      [BASIC_VOCABULARY_PROGRESS_KEY, learnedProgressDocument(learnedIds)],
    );
  }
  await page.goto(`${BASE_URL}/vocabulary/basic/`, { waitUntil: 'load' });
  await installFixedFont(page);

  const card = page.locator('[data-card]');
  const total = page.locator('[data-total]');
  const progress = page.locator('[data-progress]');
  const simplified = page.locator('.basic-vocabulary-simplified');
  await expect(card).toBeVisible();
  await expect(simplified).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () =>
      page
        .locator('img')
        .evaluate((img) => {
          const htmlImage = img as HTMLImageElement;
          return htmlImage.complete && htmlImage.naturalWidth > 0;
        })
        .catch(() => false),
    )
    .toBe(true);

  return { externalRequests, card, total, progress, simplified };
}

/** Assert the capture contract: fixed viewport, no horizontal overflow, no
 * external requests, and the fixed font in effect. */
export async function assertLearnerRouteCaptureContract(
  page: Page,
  viewport: { width: number; height: number },
  externalRequests: Set<string>,
): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyFont: getComputedStyle(document.body).fontFamily,
  }));
  expect(dimensions.innerWidth).toBe(viewport.width);
  expect(dimensions.clientWidth).toBe(viewport.width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyFont).toContain(FONT_FAMILY);
  expect([...externalRequests]).toEqual([]);
}
