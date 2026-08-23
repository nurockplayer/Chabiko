import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Frame, type Page } from '@playwright/test';

const GRAMMARS = ['apple', 'airbnb', 'notion', 'linear', 'duolingo'] as const;
const VIEWS = ['home', 'vocabulary', 'lesson', 'travel'] as const;

type Grammar = (typeof GRAMMARS)[number];
type View = (typeof VIEWS)[number];

export const INDIVIDUAL_VIEWPORT = { width: 390, height: 844 } as const;
export const COMPARISON_VIEWPORT = { width: 2000, height: 934 } as const;
export const EVIDENCE_DIRECTORY = 'docs/design/evidence/design-lab';

export type CaptureManifestEntry =
  | { kind: 'individual'; grammar: Grammar; view: View; filename: string }
  | { kind: 'comparison'; view: View; filename: string };

export const CAPTURE_MANIFEST: readonly CaptureManifestEntry[] = [
  ...VIEWS.flatMap((view) =>
    GRAMMARS.map((grammar) => ({
      kind: 'individual' as const,
      grammar,
      view,
      filename: `${grammar}-${view}.png`,
    })),
  ),
  ...VIEWS.map((view) => ({
    kind: 'comparison' as const,
    view,
    filename: `comparison-${view}.png`,
  })),
];

type PageDiagnostics = {
  errors: string[];
  taskFourFindings: string[];
};

function captureDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { errors: [], taskFourFindings: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => diagnostics.errors.push(`page: ${error.message}`));
  return diagnostics;
}

async function waitForLocalAssets(frame: Frame): Promise<void> {
  await frame.waitForLoadState('domcontentloaded');
  await frame.waitForFunction(() => document.fonts.status === 'loaded');
  await frame.evaluate(async () => {
    await Promise.all(
      [...document.images].filter((image) => !image.closest('[hidden]')).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((done) => {
          image.addEventListener('load', () => done(), { once: true });
          image.addEventListener('error', () => done(), { once: true });
        });
      }),
    );
  });
}

async function validatePrototypeFrame(frame: Frame, view: View, label: string): Promise<string[]> {
  await waitForLocalAssets(frame);
  const result = await frame.evaluate((expectedView) => {
    const panels = [...document.querySelectorAll<HTMLElement>('[data-lab-view]')];
    const visiblePanels = panels.filter((panel) => !panel.hidden);
    const selectedNavigation = [
      ...document.querySelectorAll<HTMLElement>('[data-lab-nav][aria-selected="true"]'),
    ];
    const brokenImages = [...document.images]
      .filter((image) => !image.closest('[hidden]'))
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
    const horizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const clippedControls = [
      ...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary'),
    ]
      .filter((control) => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        const intersectsViewport = rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
        const contained = rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
        return visible && intersectsViewport && !contained;
      })
      .map((control) => control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 60) || control.tagName);

    return {
      activeViews: visiblePanels.map((panel) => panel.dataset.labView),
      selectedViews: selectedNavigation.map((navigation) => navigation.dataset.labTarget),
      brokenImages,
      horizontalOverflow,
      clippedControls,
      expectedView,
    };
  }, view);

  if (result.activeViews.length !== 1 || result.activeViews[0] !== view) {
    throw new Error(`${label}: active view was ${result.activeViews.join(', ') || 'missing'}, expected ${view}`);
  }
  if (result.selectedViews.length !== 1 || result.selectedViews[0] !== view) {
    throw new Error(`${label}: selected navigation was ${result.selectedViews.join(', ') || 'missing'}, expected ${view}`);
  }
  if (result.brokenImages.length > 0) {
    throw new Error(`${label}: broken images: ${result.brokenImages.join(', ')}`);
  }
  if (result.horizontalOverflow) {
    throw new Error(`${label}: horizontal overflow at 390px`);
  }

  return result.clippedControls.map((control) => `${label}: visible control crosses the viewport boundary (${control})`);
}

async function captureIndividual(
  page: Page,
  baseUrl: URL,
  entry: Extract<CaptureManifestEntry, { kind: 'individual' }>,
  outputPath: string,
): Promise<PageDiagnostics> {
  const diagnostics = captureDiagnostics(page);
  await page.setViewportSize(INDIVIDUAL_VIEWPORT);
  await page.goto(new URL(`/design-lab/${entry.grammar}/?view=${entry.view}`, baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  diagnostics.taskFourFindings.push(
    ...(await validatePrototypeFrame(page.mainFrame(), entry.view, `${entry.grammar}-${entry.view}`)),
  );
  await page.screenshot({ path: outputPath, fullPage: false });
  return diagnostics;
}

async function captureComparison(
  page: Page,
  baseUrl: URL,
  entry: Extract<CaptureManifestEntry, { kind: 'comparison' }>,
  outputPath: string,
): Promise<PageDiagnostics> {
  const diagnostics = captureDiagnostics(page);
  await page.setViewportSize(COMPARISON_VIEWPORT);
  await page.goto(new URL(`/design-lab/?view=${entry.view}`, baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    (view) => {
      const root = document.querySelector<HTMLElement>('[data-design-lab-comparison]');
      const frames = [...document.querySelectorAll<HTMLIFrameElement>('[data-comparison-frame]')];
      return root?.dataset.activeView === view
        && frames.length === 5
        && frames.every((frame) => frame.contentDocument?.readyState === 'complete');
    },
    entry.view,
  );
  await waitForLocalAssets(page.mainFrame());

  const frameElements = await page.locator('[data-comparison-frame]').all();
  if (frameElements.length !== GRAMMARS.length) {
    throw new Error(`comparison-${entry.view}: expected five iframe surfaces`);
  }
  for (const [index, frameElement] of frameElements.entries()) {
    const box = await frameElement.boundingBox();
    if (!box || box.width !== 390 || box.height !== 844) {
      throw new Error(`comparison-${entry.view}: iframe ${index + 1} is not 390x844`);
    }
    if (box.x < 0 || box.y < 0 || box.x + box.width > COMPARISON_VIEWPORT.width || box.y + box.height > COMPARISON_VIEWPORT.height) {
      throw new Error(`comparison-${entry.view}: iframe ${index + 1} is outside the capture viewport`);
    }
    const frameHandle = await frameElement.elementHandle();
    const frame = await frameHandle?.contentFrame();
    if (!frame) throw new Error(`comparison-${entry.view}: iframe ${index + 1} did not load`);
    diagnostics.taskFourFindings.push(
      ...(await validatePrototypeFrame(frame, entry.view, `comparison-${entry.view}/${GRAMMARS[index]}`)),
    );
  }

  const comparisonOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (comparisonOverflow) throw new Error(`comparison-${entry.view}: comparison tool overflows its viewport`);

  await page.screenshot({ path: outputPath, fullPage: false });
  return diagnostics;
}

export async function captureDesignLab(): Promise<void> {
  const baseUrl = new URL(process.env.DESIGN_LAB_BASE_URL ?? 'http://127.0.0.1:4321');
  const outputDirectory = resolve(EVIDENCE_DIRECTORY);
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(15_000);
  const externalRequests: string[] = [];

  const failures: string[] = [];
  const taskFourFindings = new Set<string>();
  try {
    for (const entry of CAPTURE_MANIFEST) {
      console.log(`capturing ${entry.filename}`);
      const page = await context.newPage();
      try {
        await page.route('**/*', async (route) => {
          const requestUrl = new URL(route.request().url());
          if (requestUrl.protocol === 'data:' || requestUrl.protocol === 'blob:' || requestUrl.origin === baseUrl.origin) {
            await route.fallback();
            return;
          }
          externalRequests.push(requestUrl.href);
          await route.abort('blockedbyclient');
        });
        const outputPath = resolve(outputDirectory, entry.filename);
        const diagnostics = entry.kind === 'individual'
          ? await captureIndividual(page, baseUrl, entry, outputPath)
          : await captureComparison(page, baseUrl, entry, outputPath);
        failures.push(...diagnostics.errors.map((error) => `${entry.filename}: ${error}`));
        diagnostics.taskFourFindings.forEach((finding) => taskFourFindings.add(finding));
        console.log(`captured ${entry.filename}`);
      } catch (error) {
        failures.push(`${entry.filename}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  failures.push(...externalRequests.map((url) => `external request blocked: ${url}`));
  for (const finding of taskFourFindings) console.warn(`TASK 4 FINDING: ${finding}`);
  if (failures.length > 0) throw new Error(`Design Lab capture failed:\n${failures.join('\n')}`);
  console.log(`captured ${CAPTURE_MANIFEST.length} Design Lab evidence files without browser errors`);
}

const isDirectInvocation = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isDirectInvocation) {
  try {
    await captureDesignLab();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
