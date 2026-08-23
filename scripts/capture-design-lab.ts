import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Frame, type Locator, type Page } from '@playwright/test';

export const GRAMMARS = ['apple', 'airbnb', 'notion', 'linear', 'duolingo'] as const;
export const VIEWS = ['home', 'vocabulary', 'lesson', 'travel'] as const;
export const REQUIRED_WIDTHS = [320, 375, 390, 430, 768, 1440] as const;

type Grammar = (typeof GRAMMARS)[number];
type View = (typeof VIEWS)[number];

export const INDIVIDUAL_VIEWPORT = { width: 390, height: 844 } as const;
export const COMPARISON_VIEWPORT = { width: 2000, height: 934 } as const;
export const EVIDENCE_DIRECTORY = 'docs/design/evidence/design-lab';
export const MINIMUM_GRAYSCALE_DISTANCE = 0.035;
const DETERMINISTIC_CHROMIUM_ARGS = [
  '--disable-font-subpixel-positioning',
  '--disable-lcd-text',
  '--font-render-hinting=none',
] as const;

export function validateLocalBaseUrl(value: string): URL {
  const baseUrl = new URL(value);
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (baseUrl.protocol !== 'http:' || !loopbackHosts.has(baseUrl.hostname)) {
    throw new Error('DESIGN_LAB_BASE_URL must use a loopback HTTP origin');
  }
  return baseUrl;
}

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
  externalRequests: string[];
};

export type RenderedValidationSummary = {
  interactionScenarios: number;
  responsiveStates: number;
  axeScans: number;
  focusVisibleChecks: number;
  reducedMotionChecks: number;
};

type LuminanceSignature = {
  encoded: string;
  values: number[];
};

export type CaptureSummary = {
  signatures: Record<Grammar, Record<'home' | 'lesson', string>>;
  distances: Record<'home' | 'lesson', { distance: number; pair: [Grammar, Grammar] }>;
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function configureAuditedPage(page: Page, baseUrl: URL): Promise<PageDiagnostics> {
  const diagnostics: PageDiagnostics = { errors: [], externalRequests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => diagnostics.errors.push(`page: ${error.message}`));
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      requestUrl.protocol === 'data:'
      || requestUrl.protocol === 'blob:'
      || requestUrl.origin === baseUrl.origin
    ) {
      await route.fallback();
      return;
    }
    diagnostics.externalRequests.push(requestUrl.href);
    await route.abort('blockedbyclient');
  });
  return diagnostics;
}

function assertDiagnosticsClean(diagnostics: PageDiagnostics, label: string): void {
  ensure(diagnostics.errors.length === 0, `${label}: browser errors: ${diagnostics.errors.join(', ')}`);
  ensure(
    diagnostics.externalRequests.length === 0,
    `${label}: external requests blocked: ${diagnostics.externalRequests.join(', ')}`,
  );
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

async function stabilizeFrame(frame: Frame): Promise<void> {
  await frame.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
  await frame.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
}

async function captureStableScreenshot(page: Page, outputPath: string, label: string): Promise<Buffer> {
  const options = { fullPage: false, animations: 'disabled', caret: 'hide' } as const;
  let previous = await page.screenshot(options);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(() => new Promise<void>((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    }));
    const current = await page.screenshot(options);
    if (current.equals(previous)) {
      await writeFile(outputPath, current);
      return current;
    }
    previous = current;
  }

  throw new Error(`${label}: screenshot did not reach a byte-stable rendered frame`);
}

async function validatePrototypeFrame(
  frame: Frame,
  view: View,
  label: string,
  width: number,
): Promise<void> {
  await waitForLocalAssets(frame);
  await frame.evaluate(async () => {
    await Promise.all(
      document.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const result = await frame.evaluate(({ mobile, requireViewportContainment }) => {
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
    const controls = [
      ...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary'),
    ];

    function isRendered(control: HTMLElement): boolean {
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return !control.closest('[hidden]')
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    }

    function accessibleName(control: HTMLElement): string {
      const ariaLabel = control.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = control.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      if (labelledBy) return labelledBy;
      if (control instanceof HTMLInputElement && control.labels) {
        const labels = [...control.labels].map((label) => label.textContent?.trim() ?? '').filter(Boolean);
        if (labels.length > 0) return labels.join(' ');
        if (control.value && ['button', 'submit', 'reset'].includes(control.type)) return control.value;
      }
      return control.textContent?.trim() || control.getAttribute('title')?.trim() || '';
    }

    const renderedControls = controls.filter(isRendered);
    const unnamedControls = renderedControls
      .filter((control) => accessibleName(control).length === 0)
      .map((control) => control.outerHTML.slice(0, 100));
    const undersizedControls = mobile
      ? renderedControls.filter((control) => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        const isPureTextLink = control instanceof HTMLAnchorElement
          && style.display === 'inline'
          && !control.hasAttribute('data-lab-continuation');
        return !isPureTextLink && (rect.width < 44 || rect.height < 44);
      }).map((control) => {
        const rect = control.getBoundingClientRect();
        return `${accessibleName(control) || control.tagName} (${rect.width.toFixed(1)}x${rect.height.toFixed(1)})`;
      })
      : [];
    const viewportClippedControls = requireViewportContainment ? renderedControls.filter((control) => {
      const rect = control.getBoundingClientRect();
      const intersectsViewport = rect.right > 0
        && rect.bottom > 0
        && rect.left < innerWidth
        && rect.top < innerHeight;
      const contained = rect.left >= 0
        && rect.top >= 0
        && rect.right <= innerWidth
        && rect.bottom <= innerHeight;
      return intersectsViewport && !contained;
    }).map((control) => accessibleName(control) || control.tagName) : [];
    const ancestorClippedControls = renderedControls.filter((control) => {
      const rect = control.getBoundingClientRect();
      let ancestor = control.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        const clipsX = ['auto', 'hidden', 'clip', 'scroll'].includes(style.overflowX);
        const clipsY = ['auto', 'hidden', 'clip', 'scroll'].includes(style.overflowY);
        if (clipsX || clipsY) {
          const ancestorRect = ancestor.getBoundingClientRect();
          if (
            (clipsX && (rect.left < ancestorRect.left || rect.right > ancestorRect.right))
            || (clipsY && (rect.top < ancestorRect.top || rect.bottom > ancestorRect.bottom))
          ) return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    }).map((control) => accessibleName(control) || control.tagName);
    const overlappedControls = renderedControls.filter((control) => {
      const rect = control.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (centerX < 0 || centerX >= innerWidth || centerY < 0 || centerY >= innerHeight) return false;
      const topElement = document.elementFromPoint(centerX, centerY);
      return topElement !== null && topElement !== control && !control.contains(topElement);
    }).map((control) => accessibleName(control) || control.tagName);

    return {
      activeViews: visiblePanels.map((panel) => panel.dataset.labView),
      selectedViews: selectedNavigation.map((navigation) => navigation.dataset.labTarget),
      brokenImages,
      horizontalOverflow,
      unnamedControls,
      undersizedControls,
      viewportClippedControls,
      ancestorClippedControls,
      overlappedControls,
    };
  }, { mobile: width <= 430, requireViewportContainment: width === 390 });

  ensure(
    result.activeViews.length === 1 && result.activeViews[0] === view,
    `${label}: active view was ${result.activeViews.join(', ') || 'missing'}, expected ${view}`,
  );
  ensure(
    result.selectedViews.length === 1 && result.selectedViews[0] === view,
    `${label}: selected navigation was ${result.selectedViews.join(', ') || 'missing'}, expected ${view}`,
  );
  ensure(result.brokenImages.length === 0, `${label}: broken images: ${result.brokenImages.join(', ')}`);
  ensure(!result.horizontalOverflow, `${label}: horizontal overflow at ${width}px`);
  ensure(
    result.unnamedControls.length === 0,
    `${label}: controls without accessible names: ${result.unnamedControls.join(', ')}`,
  );
  ensure(
    result.undersizedControls.length === 0,
    `${label}: controls smaller than 44px: ${result.undersizedControls.join(', ')}`,
  );
  ensure(
    result.viewportClippedControls.length === 0,
    `${label}: visible controls cross the evidence viewport boundary: ${result.viewportClippedControls.join(', ')}`,
  );
  ensure(
    result.ancestorClippedControls.length === 0,
    `${label}: controls are clipped by CSS ancestors: ${result.ancestorClippedControls.join(', ')}`,
  );
  ensure(
    result.overlappedControls.length === 0,
    `${label}: controls are overlapped at their center point: ${result.overlappedControls.join(', ')}`,
  );
}

async function gotoPrototype(page: Page, baseUrl: URL, grammar: Grammar, view: string): Promise<void> {
  await page.goto(new URL(`/design-lab/${grammar}/?view=${view}`, baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  await waitForLocalAssets(page.mainFrame());
}

async function assertFocusedView(page: Page, grammar: Grammar, expected: View): Promise<void> {
  const result = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const visible = [...document.querySelectorAll<HTMLElement>('[data-lab-view]')]
      .filter((panel) => !panel.hidden)
      .map((panel) => panel.dataset.labView);
    const selected = [...document.querySelectorAll<HTMLElement>('[data-lab-nav][aria-selected="true"]')]
      .map((item) => item.dataset.labTarget);
    return { focus: active?.dataset.labTarget, visible, selected };
  });
  ensure(
    result.focus === expected
      && result.visible.length === 1
      && result.visible[0] === expected
      && result.selected.length === 1
      && result.selected[0] === expected,
    `${grammar}: keyboard focus/view mismatch for ${expected}`,
  );
}

async function validateSharedInteractions(page: Page, baseUrl: URL, grammar: Grammar): Promise<void> {
  await page.setViewportSize(INDIVIDUAL_VIEWPORT);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoPrototype(page, baseUrl, grammar, 'vocabulary');
  await validatePrototypeFrame(page.mainFrame(), 'vocabulary', `${grammar}-initial-query`, 390);
  await gotoPrototype(page, baseUrl, grammar, 'unknown');
  await validatePrototypeFrame(page.mainFrame(), 'home', `${grammar}-invalid-query`, 390);

  const navigation = page.locator('[data-lab-nav]');
  ensure(await navigation.count() === 4, `${grammar}: expected four tabs`);
  const tabIndexes = await navigation.evaluateAll((items) => items.map((item) => (item as HTMLElement).tabIndex));
  ensure(JSON.stringify(tabIndexes) === JSON.stringify([0, -1, -1, -1]), `${grammar}: invalid initial roving tab indexes`);

  await page.locator('[data-lab-nav][data-lab-target="home"]').focus();
  for (const expected of ['vocabulary', 'lesson', 'travel', 'home'] as const) {
    await page.keyboard.press('ArrowRight');
    await assertFocusedView(page, grammar, expected);
  }
  await page.keyboard.press('ArrowLeft');
  await assertFocusedView(page, grammar, 'travel');
  await page.keyboard.press('ArrowRight');
  await assertFocusedView(page, grammar, 'home');
  await page.keyboard.press('End');
  await assertFocusedView(page, grammar, 'travel');
  await page.keyboard.press('Home');
  await assertFocusedView(page, grammar, 'home');

  await page.locator('[data-lab-nav][data-lab-target="vocabulary"]').click();
  await page.locator('[data-lab-reveal]').click();
  ensure(await page.locator('[data-lab-answer]').isVisible(), `${grammar}: vocabulary answer did not reveal`);
  await page.locator('[data-lab-rating="known"]').click();
  ensure(
    await page.locator('[data-design-lab]').getAttribute('data-lab-rating') === 'known',
    `${grammar}: rating state was not recorded`,
  );

  await page.locator('[data-lab-nav][data-lab-target="lesson"]').click();
  const feedback = page.locator('[data-lab-quiz-feedback]');
  ensure(await feedback.getAttribute('role') === 'status', `${grammar}: quiz feedback is not a status`);
  await page.locator('[data-lab-quiz-choice][data-lab-correct="false"]').first().click();
  ensure((await feedback.textContent())?.includes('もう一度') ?? false, `${grammar}: incorrect feedback missing`);
  await page.locator('[data-lab-quiz-choice][data-lab-correct="true"]').first().click();
  ensure((await feedback.textContent())?.includes('正解') ?? false, `${grammar}: correct feedback missing`);
}

async function validateFocusVisible(page: Page, grammar: Grammar, view: View): Promise<void> {
  const selected = page.locator('[data-lab-nav][aria-selected="true"]');
  await selected.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const evidence = await selected.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      active: document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  ensure(evidence.active && evidence.focusVisible, `${grammar}-${view}: selected tab lacks keyboard focus evidence`);
  ensure(
    evidence.outlineWidth >= 2 || evidence.boxShadow !== 'none',
    `${grammar}-${view}: focus-visible indicator is not visually measurable`,
  );
}

async function validateReducedMotion(page: Page, grammar: Grammar, view: View): Promise<void> {
  await page.waitForTimeout(20);
  const result = await page.evaluate(() => ({
    preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
    runningAnimations: document.getAnimations({ subtree: true })
      .filter((animation) => animation.playState === 'running')
      .length,
  }));
  ensure(result.preference, `${grammar}-${view}: reduced-motion media query did not match`);
  ensure(result.runningAnimations === 0, `${grammar}-${view}: animations remain active under reduced motion`);
}

async function validateAxe(page: Page, grammar: Grammar, view: View): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  ensure(
    blocking.length === 0,
    `${grammar}-${view}: serious/critical axe violations: ${blocking.map((item) => item.id).join(', ')}`,
  );
}

export async function validateRenderedDesignLab(baseUrlInput: URL | string): Promise<RenderedValidationSummary> {
  const baseUrl = validateLocalBaseUrl(baseUrlInput instanceof URL ? baseUrlInput.href : baseUrlInput);
  const browser = await chromium.launch({ headless: true, args: [...DETERMINISTIC_CHROMIUM_ARGS] });
  const context = await browser.newContext({ colorScheme: 'light', locale: 'ja-JP' });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(15_000);
  const summary: RenderedValidationSummary = {
    interactionScenarios: 0,
    responsiveStates: 0,
    axeScans: 0,
    focusVisibleChecks: 0,
    reducedMotionChecks: 0,
  };
  const failures: string[] = [];

  try {
    for (const grammar of GRAMMARS) {
      const page = await context.newPage();
      const diagnostics = await configureAuditedPage(page, baseUrl);
      try {
        try {
          await validateSharedInteractions(page, baseUrl, grammar);
          summary.interactionScenarios += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
        try {
          assertDiagnosticsClean(diagnostics, `${grammar}-interactions`);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      } finally {
        await page.close();
      }
    }

    for (const grammar of GRAMMARS) {
      const page = await context.newPage();
      const diagnostics = await configureAuditedPage(page, baseUrl);
      try {
        for (const width of REQUIRED_WIDTHS) {
          await page.setViewportSize({ width, height: INDIVIDUAL_VIEWPORT.height });
          await page.emulateMedia({ reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
          await gotoPrototype(page, baseUrl, grammar, 'home');
          for (const view of VIEWS) {
            try {
              if (view !== 'home') {
                await page.locator(`[data-lab-nav][data-lab-target="${view}"]`).click();
              }
              await validatePrototypeFrame(page.mainFrame(), view, `${grammar}-${view}-${width}`, width);
              summary.responsiveStates += 1;
              if (width === 390) {
                await validateAxe(page, grammar, view);
                summary.axeScans += 1;
                await validateFocusVisible(page, grammar, view);
                summary.focusVisibleChecks += 1;
                await validateReducedMotion(page, grammar, view);
                summary.reducedMotionChecks += 1;
              }
            } catch (error) {
              failures.push(error instanceof Error ? error.message : String(error));
            }
          }
        }
        try {
          assertDiagnosticsClean(diagnostics, `${grammar}-responsive`);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  ensure(failures.length === 0, `Rendered Design Lab validation failed:\n${failures.join('\n')}`);
  return summary;
}

async function createLuminanceSignature(page: Page, screenshot: Buffer): Promise<LuminanceSignature> {
  const values = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context is unavailable');
    context.filter = 'grayscale(1)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      luminance.push((pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255);
    }
    return luminance;
  }, screenshot.toString('base64'));
  const encoded = values.map((value) => Math.round(value * 15).toString(16)).join('');
  return { encoded, values };
}

function minimumPairwiseDistance(
  signatures: Map<Grammar, LuminanceSignature>,
): { distance: number; pair: [Grammar, Grammar] } {
  let minimum = Number.POSITIVE_INFINITY;
  let pair: [Grammar, Grammar] = [GRAMMARS[0], GRAMMARS[1]];
  for (let leftIndex = 0; leftIndex < GRAMMARS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < GRAMMARS.length; rightIndex += 1) {
      const leftGrammar = GRAMMARS[leftIndex];
      const rightGrammar = GRAMMARS[rightIndex];
      const left = signatures.get(leftGrammar);
      const right = signatures.get(rightGrammar);
      ensure(left && right, 'Missing grayscale signature');
      const distance = left.values.reduce(
        (sum, value, index) => sum + Math.abs(value - right.values[index]),
        0,
      ) / left.values.length;
      if (distance < minimum) {
        minimum = distance;
        pair = [leftGrammar, rightGrammar];
      }
    }
  }
  return { distance: minimum, pair };
}

async function captureIndividual(
  page: Page,
  baseUrl: URL,
  entry: Extract<CaptureManifestEntry, { kind: 'individual' }>,
  outputPath: string,
): Promise<Buffer> {
  await page.setViewportSize(INDIVIDUAL_VIEWPORT);
  await gotoPrototype(page, baseUrl, entry.grammar, entry.view);
  await stabilizeFrame(page.mainFrame());
  await validatePrototypeFrame(page.mainFrame(), entry.view, `${entry.grammar}-${entry.view}`, 390);
  return captureStableScreenshot(page, outputPath, `${entry.grammar}-${entry.view}`);
}

type ComparisonLinkStyle = {
  backgroundColor: string;
  borderBottomColor: string;
  borderBottomWidth: string;
  color: string;
  fontWeight: string;
  outlineStyle: string;
  outlineWidth: string;
  textDecorationLine: string;
  textDecorationThickness: string;
  transform: string;
};

async function comparisonLinkStyle(
  link: Locator,
): Promise<ComparisonLinkStyle> {
  return link.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      borderBottomWidth: style.borderBottomWidth,
      color: style.color,
      fontWeight: style.fontWeight,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      textDecorationLine: style.textDecorationLine,
      textDecorationThickness: style.textDecorationThickness,
      transform: style.transform,
    };
  });
}

function stylesDiffer(
  before: ComparisonLinkStyle,
  after: ComparisonLinkStyle,
  properties: readonly (keyof ComparisonLinkStyle)[],
): boolean {
  return properties.some((property) => before[property] !== after[property]);
}

async function resetComparisonInteractionState(page: Page): Promise<void> {
  await page.mouse.move(COMPARISON_VIEWPORT.width - 1, COMPARISON_VIEWPORT.height - 1);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function validateComparisonToolbar(page: Page, view: View): Promise<void> {
  const label = `comparison-${view}`;
  const root = page.locator('[data-design-lab-comparison]');
  const toolbar = root.locator('[data-comparison-toolbar]');
  ensure(await toolbar.count() === 1, `${label}: expected one comparison toolbar`);

  const navigation = toolbar.locator('nav');
  ensure(await navigation.count() === 1, `${label}: comparison toolbar requires one navigation landmark`);
  ensure(
    (await navigation.getAttribute('aria-label'))?.trim(),
    `${label}: comparison toolbar navigation lacks an accessible label`,
  );

  const links = toolbar.locator('a[data-comparison-view]');
  ensure(await links.count() === VIEWS.length, `${label}: expected four comparison toolbar links`);
  const linkViews = await links.evaluateAll((items) => items.map((item) => (
    (item as HTMLElement).dataset.comparisonView
  )));
  ensure(
    JSON.stringify(linkViews) === JSON.stringify(VIEWS),
    `${label}: comparison toolbar views are ${linkViews.join(', ') || 'missing'}`,
  );

  const rootView = await root.getAttribute('data-active-view');
  const currentByAttribute = toolbar.locator('a[data-comparison-view][aria-current="page"]');
  ensure(rootView === view, `${label}: comparison root selected ${rootView ?? 'nothing'}`);
  ensure(await currentByAttribute.count() === 1, `${label}: expected one current comparison view`);
  ensure(
    await currentByAttribute.getAttribute('data-comparison-view') === view,
    `${label}: current comparison link does not match ${view}`,
  );

  const measurements = await links.evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const radii = [
      getComputedStyle(item).borderTopLeftRadius,
      getComputedStyle(item).borderTopRightRadius,
      getComputedStyle(item).borderBottomRightRadius,
      getComputedStyle(item).borderBottomLeftRadius,
    ].map((radius) => Number.parseFloat(radius) || 0);
    return {
      view: (item as HTMLElement).dataset.comparisonView,
      width: rect.width,
      height: rect.height,
      maximumRadius: Math.max(...radii),
    };
  }));
  const undersized = measurements.filter(({ width, height }) => width < 44 || height < 44);
  ensure(
    undersized.length === 0,
    `${label}: comparison toolbar controls smaller than 44px: ${undersized.map(({ view: itemView, width, height }) => (
      `${itemView ?? 'unknown'} (${width.toFixed(1)}x${height.toFixed(1)})`
    )).join(', ')}`,
  );
  const pillControls = measurements.filter(({ maximumRadius, height }) => (
    maximumRadius > 8 || maximumRadius >= height / 3
  ));
  ensure(
    pillControls.length === 0,
    `${label}: comparison toolbar uses floating-pill geometry: ${pillControls.map(({ view: itemView }) => itemView).join(', ')}`,
  );

  const currentStyle = await comparisonLinkStyle(currentByAttribute);
  const nonCurrentStyle = await comparisonLinkStyle(
    toolbar.locator('a[data-comparison-view]:not([aria-current="page"])').first(),
  );
  ensure(
    stylesDiffer(currentStyle, nonCurrentStyle, [
      'backgroundColor',
      'borderBottomColor',
      'color',
      'fontWeight',
      'textDecorationLine',
      'textDecorationThickness',
    ]),
    `${label}: current comparison view lacks visible selected styling`,
  );

  for (let index = 0; index < VIEWS.length; index += 1) {
    const link = links.nth(index);
    await resetComparisonInteractionState(page);
    const restingStyle = await comparisonLinkStyle(link);

    await link.hover();
    const hoverStyle = await comparisonLinkStyle(link);
    ensure(
      stylesDiffer(restingStyle, hoverStyle, ['backgroundColor', 'borderBottomColor', 'color', 'transform']),
      `${label}: ${VIEWS[index]} comparison link lacks a visible hover state`,
    );

    const box = await link.boundingBox();
    ensure(box, `${label}: ${VIEWS[index]} comparison link is not rendered`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const activeEvidence = await link.evaluate((element) => element.matches(':active'));
    const activeStyle = await comparisonLinkStyle(link);
    ensure(activeEvidence, `${label}: ${VIEWS[index]} comparison link did not enter :active`);
    ensure(
      stylesDiffer(hoverStyle, activeStyle, ['backgroundColor', 'borderBottomColor', 'color', 'transform']),
      `${label}: ${VIEWS[index]} comparison link lacks a visible pressed state`,
    );
    await page.mouse.move(COMPARISON_VIEWPORT.width - 1, COMPARISON_VIEWPORT.height - 1);
    await page.mouse.up();

    await link.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const focusEvidence = await link.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        active: document.activeElement === element,
        focusVisible: element.matches(':focus-visible'),
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });
    ensure(
      focusEvidence.active && focusEvidence.focusVisible,
      `${label}: ${VIEWS[index]} comparison link lacks keyboard focus evidence`,
    );
    ensure(
      (focusEvidence.outlineStyle !== 'none' && focusEvidence.outlineWidth >= 2)
        || focusEvidence.boxShadow !== 'none',
      `${label}: ${VIEWS[index]} comparison link focus-visible state is not visually measurable`,
    );
  }

  await resetComparisonInteractionState(page);
}

async function captureComparison(
  page: Page,
  baseUrl: URL,
  entry: Extract<CaptureManifestEntry, { kind: 'comparison' }>,
  outputPath: string,
): Promise<void> {
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
  await stabilizeFrame(page.mainFrame());
  await validateComparisonToolbar(page, entry.view);

  const frameElements = await page.locator('[data-comparison-frame]').all();
  ensure(frameElements.length === GRAMMARS.length, `comparison-${entry.view}: expected five iframe surfaces`);
  for (const [index, frameElement] of frameElements.entries()) {
    const box = await frameElement.boundingBox();
    ensure(box?.width === 390 && box.height === 844, `comparison-${entry.view}: iframe ${index + 1} is not 390x844`);
    ensure(
      box.x >= 0
        && box.y >= 0
        && box.x + box.width <= COMPARISON_VIEWPORT.width
        && box.y + box.height <= COMPARISON_VIEWPORT.height,
      `comparison-${entry.view}: iframe ${index + 1} is outside the capture viewport`,
    );
    const frameHandle = await frameElement.elementHandle();
    const frame = await frameHandle?.contentFrame();
    ensure(frame, `comparison-${entry.view}: iframe ${index + 1} did not load`);
    await stabilizeFrame(frame);
    await validatePrototypeFrame(frame, entry.view, `comparison-${entry.view}/${GRAMMARS[index]}`, 390);
  }

  const comparisonOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  ensure(!comparisonOverflow, `comparison-${entry.view}: comparison tool overflows its viewport`);
  await captureStableScreenshot(page, outputPath, `comparison-${entry.view}`);
}

async function captureEvidence(baseUrl: URL): Promise<CaptureSummary> {
  const outputDirectory = resolve(EVIDENCE_DIRECTORY);
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: [...DETERMINISTIC_CHROMIUM_ARGS] });
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    reducedMotion: 'reduce',
    timezoneId: 'Asia/Tokyo',
  });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(15_000);
  const signatureMaps = {
    home: new Map<Grammar, LuminanceSignature>(),
    lesson: new Map<Grammar, LuminanceSignature>(),
  };
  const failures: string[] = [];

  try {
    for (const entry of CAPTURE_MANIFEST) {
      console.log(`capturing ${entry.filename}`);
      const page = await context.newPage();
      const diagnostics = await configureAuditedPage(page, baseUrl);
      try {
        const outputPath = resolve(outputDirectory, entry.filename);
        if (entry.kind === 'individual') {
          const screenshot = await captureIndividual(page, baseUrl, entry, outputPath);
          if (entry.view === 'home' || entry.view === 'lesson') {
            signatureMaps[entry.view].set(
              entry.grammar,
              await createLuminanceSignature(page, screenshot),
            );
          }
        } else {
          await captureComparison(page, baseUrl, entry, outputPath);
        }
        assertDiagnosticsClean(diagnostics, entry.filename);
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

  ensure(failures.length === 0, `Design Lab capture failed:\n${failures.join('\n')}`);
  const distances = {
    home: minimumPairwiseDistance(signatureMaps.home),
    lesson: minimumPairwiseDistance(signatureMaps.lesson),
  };
  for (const [view, result] of Object.entries(distances)) {
    ensure(
      result.distance >= MINIMUM_GRAYSCALE_DISTANCE,
      `${view} grayscale structural distance ${result.distance.toFixed(4)} for ${result.pair.join('/')} is below ${MINIMUM_GRAYSCALE_DISTANCE}`,
    );
  }
  const signatures = Object.fromEntries(GRAMMARS.map((grammar) => [
    grammar,
    {
      home: signatureMaps.home.get(grammar)?.encoded ?? '',
      lesson: signatureMaps.lesson.get(grammar)?.encoded ?? '',
    },
  ])) as CaptureSummary['signatures'];
  return { signatures, distances };
}

export async function captureDesignLab(): Promise<void> {
  const baseUrl = validateLocalBaseUrl(
    process.env.DESIGN_LAB_BASE_URL ?? 'http://127.0.0.1:4321',
  );
  const validation = await validateRenderedDesignLab(baseUrl);
  console.log(
    `validated rendered Design Lab contract: ${validation.interactionScenarios} interaction scenarios, `
      + `${validation.responsiveStates} responsive states, ${validation.axeScans} axe scans, `
      + `${validation.focusVisibleChecks} focus-visible checks, `
      + `${validation.reducedMotionChecks} reduced-motion checks`,
  );
  const capture = await captureEvidence(baseUrl);
  console.log(
    `grayscale structural distance: home ${capture.distances.home.distance.toFixed(4)} `
      + `(${capture.distances.home.pair.join('/')}), lesson ${capture.distances.lesson.distance.toFixed(4)} `
      + `(${capture.distances.lesson.pair.join('/')})`,
  );
  for (const grammar of GRAMMARS) {
    console.log(
      `grayscale signature ${grammar}: home=${capture.signatures[grammar].home} `
        + `lesson=${capture.signatures[grammar].lesson}`,
    );
  }
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
