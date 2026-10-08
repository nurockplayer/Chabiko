import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { answerPayload, ids, newPoolIds } from '../fixtures/hsk2-acceptance/data';

const BASE_URL = 'http://127.0.0.1:4322';
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const THEMES = ['light', 'dark'] as const;
const CONTROL_SELECTOR = 'a, button, input, select, [tabindex]:not([tabindex="-1"])';
const EVIDENCE_SELECTOR = '.flashcard-session-root, .setup-panel, [data-front], [data-back], [data-progress-text]';

async function elementDiagnostic(locator: Locator): Promise<string> {
  const details = await locator.evaluate((element) => {
    const describe = (target: Element | null) => {
      if (!target) return null;
      const style = getComputedStyle(target);
      const box = target.getBoundingClientRect();
      return {
        tag: target.tagName,
        id: target.id,
        classes: typeof target.className === 'string' ? target.className : target.getAttribute('class'),
        href: target.getAttribute('href'),
        text: (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        role: target.getAttribute('role'),
        ariaLabel: target.getAttribute('aria-label'),
        ariaLabelledby: target.getAttribute('aria-labelledby'),
        ariaDescribedby: target.getAttribute('aria-describedby'),
        ariaChecked: target.getAttribute('aria-checked'),
        ariaExpanded: target.getAttribute('aria-expanded'),
        ariaCurrent: target.getAttribute('aria-current'),
        name: target.getAttribute('name'),
        value: target.getAttribute('value'),
        tabIndex: target.getAttribute('tabindex'),
        box: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
        },
        outline: {
          style: style.outlineStyle,
          width: style.outlineWidth,
          color: style.outlineColor,
          offset: style.outlineOffset,
        },
      };
    };
    const activeElement = document.activeElement;
    let deepestActiveElement: Element | null = activeElement;
    while (
      deepestActiveElement instanceof HTMLElement &&
      deepestActiveElement.shadowRoot?.activeElement
    ) {
      deepestActiveElement = deepestActiveElement.shadowRoot.activeElement;
    }
    return {
      element: describe(element),
      documentActiveElement: describe(activeElement),
      shadowDeepestActiveElement: describe(deepestActiveElement),
    };
  });
  return JSON.stringify(details);
}

function readPageStyle(path: URL): string {
  const source = readFileSync(path, 'utf8');
  const blocks = Array.from(source.matchAll(/<style>[\s\S]*?<\/style>/g), (match) => match[0]);
  expect(blocks).toHaveLength(1);
  return blocks[0];
}

test('active HSK2 fixture wrapper style stays byte-identical to the production level route', () => {
  const productionStyle = readPageStyle(
    new URL('../../src/pages/vocabulary/hsk/[level]/index.astro', import.meta.url),
  );
  const fixtureStyle = readPageStyle(
    new URL('../fixtures/hsk2-acceptance/index.astro', import.meta.url),
  );
  expect(fixtureStyle).toBe(productionStyle);
});

async function focusVisible(page: Page, locator: Locator, name: string): Promise<void> {
  await expect.soft(locator).toBeFocused();
  const appearance = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect.soft(appearance.style, `${name} should have a visible keyboard focus indicator`).not.toBe('none');
  expect.soft(appearance.width, `${name} focus indicator should be at least 2px`).toBeGreaterThanOrEqual(2);
}

async function tabUntil(
  page: Page,
  locator: Locator,
  name: string,
  key: 'Tab' | 'Shift+Tab' = 'Tab',
): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await tabOnce(page, key);
  }
  throw new Error(`${key} traversal did not reach ${name}`);
}

async function tabOnce(page: Page, key: 'Tab' | 'Shift+Tab' = 'Tab'): Promise<void> {
  await page.keyboard.press(key);
  const stop = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const describe = (target: Element | null) => {
      if (!target) return null;
      const targetStyle = getComputedStyle(target);
      const targetBox = target.getBoundingClientRect();
      return {
        tag: target.tagName,
        id: target.id,
        classes: typeof target.className === 'string' ? target.className : target.getAttribute('class'),
        href: target.getAttribute('href'),
        text: (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        role: target.getAttribute('role'),
        ariaLabel: target.getAttribute('aria-label'),
        ariaLabelledby: target.getAttribute('aria-labelledby'),
        ariaChecked: target.getAttribute('aria-checked'),
        name: target.getAttribute('name'),
        value: target.getAttribute('value'),
        tabIndex: target.getAttribute('tabindex'),
        box: {
          x: targetBox.x,
          y: targetBox.y,
          width: targetBox.width,
          height: targetBox.height,
          top: targetBox.top,
          right: targetBox.right,
          bottom: targetBox.bottom,
          left: targetBox.left,
        },
        outline: {
          style: targetStyle.outlineStyle,
          width: targetStyle.outlineWidth,
          color: targetStyle.outlineColor,
          offset: targetStyle.outlineOffset,
        },
      };
    };
    let deepestActiveElement: Element = element;
    while (
      deepestActiveElement instanceof HTMLElement &&
      deepestActiveElement.shadowRoot?.activeElement
    ) {
      deepestActiveElement = deepestActiveElement.shadowRoot.activeElement;
    }
    return {
      id: element.id,
      visible: element.getClientRects().length > 0 && style.visibility !== 'hidden',
      nonzero: box.width > 0 && box.height > 0,
      focusStyle: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
      documentActiveElement: describe(document.activeElement),
      shadowDeepestActiveElement: describe(deepestActiveElement),
    };
  });
  const diagnostic = `[keyboard-step=${key} selector=document.activeElement metadata=${JSON.stringify(stop)}]`;
  if (!stop) console.error(`[hsk2-tab-stop-failure] ${diagnostic}`);
  expect.soft(stop, `${diagnostic} each ${key} stop must be visible, nonzero, and visibly focused`).not.toBeNull();
  if (stop) {
    if (!stop.visible || !stop.nonzero || !stop.focusStyle) {
      console.error(`[hsk2-tab-stop-failure] ${diagnostic}`);
    }
    expect.soft(stop.visible, `${diagnostic} ${key} stop ${stop.id} must be visible`).toBe(true);
    expect.soft(stop.nonzero, `${diagnostic} ${key} stop ${stop.id} must have a nonzero box`).toBe(true);
    expect.soft(stop.focusStyle, `${diagnostic} ${key} stop ${stop.id} must have a visible focus indicator`).toBe(true);
  }
}

async function assertUnrevealedAnswerAbsent(page: Page): Promise<void> {
  const html = await page.locator('body').innerHTML();
  expect(html).not.toContain('中合成語');
  expect(html).not.toContain('zhōng hé chéng yǔ');
}

async function frameFlashcardRoot(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.flashcard-session-root') as HTMLElement | null;
    if (!root) throw new Error('The production flashcard session root is missing');

    const describeElement = (element: Element | null) => element ? {
      tag: element.tagName,
      id: element.id,
      classes: element.getAttribute('class'),
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
    } : null;
    const describeBox = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
      };
    };

    const activeElementBefore = document.activeElement;
    const rootBoxBefore = describeBox(root);
    const scrollBefore = { x: window.scrollX, y: window.scrollY };
    root.scrollIntoView({ block: 'center', inline: 'nearest' });
    const activeElementAfter = document.activeElement;

    return {
      selector: '.flashcard-session-root',
      root: describeElement(root),
      rootBoxBefore,
      rootBoxAfter: describeBox(root),
      scrollBefore,
      scrollAfter: { x: window.scrollX, y: window.scrollY },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      activeElementPreserved: activeElementBefore === activeElementAfter,
      activeElementBefore: describeElement(activeElementBefore),
      activeElementAfter: describeElement(activeElementAfter),
    };
  });
}

async function capture(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const framing = await frameFlashcardRoot(page);
  await testInfo.attach(`${state}-frame.json`, {
    body: JSON.stringify(framing, null, 2),
    contentType: 'application/json',
  });
  expect.soft(
    framing.activeElementPreserved,
    `[capture=${state}] native session-root scrollIntoView must preserve document.activeElement: ${JSON.stringify(framing)}`,
  ).toBe(true);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const overflowIdentity = await elementDiagnostic(page.locator('html'));
  const overflowDiagnostic = `[capture=${state} selector=document.documentElement element=${overflowIdentity} overflow=${JSON.stringify(overflow)}]`;
  if (overflow.scrollWidth > overflow.clientWidth) {
    console.error(`[hsk2-containment-failure] ${overflowDiagnostic}`);
  }
  expect.soft(overflow.scrollWidth, overflowDiagnostic).toBeLessThanOrEqual(overflow.clientWidth);

  const visibleControls = page.locator(CONTROL_SELECTOR);
  const controls = await visibleControls.all();
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    // BaseLayout's keyboard skip link is intentionally clipped offscreen until
    // focused. Ignore only its exact, inactive 1px clipping contract.
    const inactiveClippedSkipLink = await control.evaluate((element) => {
      if (!element.matches('.skip-link') || element === document.activeElement) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.clipPath === 'inset(50%)' &&
        Number.parseFloat(style.width) <= 1 && Number.parseFloat(style.height) <= 1 &&
        box.right < 0;
    });
    if (inactiveClippedSkipLink) continue;
    const isRootControl = await control.evaluate((element) =>
      Boolean(element.closest('.flashcard-session-root')),
    );
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    const identity = await elementDiagnostic(control);
    const diagnostic = `[capture=${state} selector=${CONTROL_SELECTOR} index=${index} element=${identity}]`;
    if (!box) console.error(`[hsk2-containment-failure] ${diagnostic} playwrightBox=null`);
    expect.soft(box, `${diagnostic} expected a visible interactive control box`).not.toBeNull();
    if (!box) continue;
    const intersectsCapture = box.x + box.width > 0 && box.x < viewport!.width &&
      box.y + box.height > 0 && box.y < viewport!.height;
    // Every visible session control must fit, even outside the current scroll
    // fragment. Other controls are checked when they intersect the PNG.
    if (!isRootControl && !intersectsCapture) continue;
    if (
      box.x < 0 || box.y < 0 || box.x + box.width > viewport!.width ||
      box.y + box.height > viewport!.height
    ) {
      console.error(`[hsk2-containment-failure] ${diagnostic} playwrightBox=${JSON.stringify(box)} viewport=${JSON.stringify(viewport)}`);
    }
    expect.soft(box!.x, `${diagnostic} x must be within the capture`).toBeGreaterThanOrEqual(0);
    expect.soft(box!.y, `${diagnostic} y must be within the capture`).toBeGreaterThanOrEqual(0);
    expect.soft(box!.x + box!.width, `${diagnostic} right edge must be within the capture`).toBeLessThanOrEqual(viewport!.width);
    expect.soft(box!.y + box!.height, `${diagnostic} bottom edge must be within the capture`).toBeLessThanOrEqual(viewport!.height);
  }
  const evidenceElements = await page.locator(EVIDENCE_SELECTOR).all();
  for (let index = 0; index < evidenceElements.length; index += 1) {
    const evidence = evidenceElements[index];
    if (!(await evidence.isVisible())) continue;
    const box = await evidence.boundingBox();
    const identity = await elementDiagnostic(evidence);
    const diagnostic = `[capture=${state} selector=${EVIDENCE_SELECTOR} index=${index} element=${identity}]`;
    if (!box) console.error(`[hsk2-containment-failure] ${diagnostic} playwrightBox=null`);
    expect.soft(box, `${diagnostic} expected a visible evidence element box`).not.toBeNull();
    if (!box) continue;
    if (
      box.x < 0 || box.y < 0 || box.x + box.width > viewport!.width ||
      box.y + box.height > viewport!.height
    ) {
      console.error(`[hsk2-containment-failure] ${diagnostic} playwrightBox=${JSON.stringify(box)} viewport=${JSON.stringify(viewport)}`);
    }
    expect.soft(box!.x, `${diagnostic} x must be within the capture`).toBeGreaterThanOrEqual(0);
    expect.soft(box!.y, `${diagnostic} y must be within the capture`).toBeGreaterThanOrEqual(0);
    expect.soft(box!.x + box!.width, `${diagnostic} right edge must be within the capture`).toBeLessThanOrEqual(viewport!.width);
    expect.soft(box!.y + box!.height, `${diagnostic} bottom edge must be within the capture`).toBeLessThanOrEqual(viewport!.height);
  }

  const png = await page.screenshot({ fullPage: false });
  expect.soft(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect.soft(png.readUInt32BE(16)).toBe(viewport!.width);
  expect.soft(png.readUInt32BE(20)).toBe(viewport!.height);
  await testInfo.attach(`${state}-${viewport!.width}x${viewport!.height}.png`, {
    body: png,
    contentType: 'image/png',
  });
}

async function checkActiveOptions(page: Page): Promise<void> {
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('0 / 20');
  await expect(page.locator('[data-front]')).toHaveAttribute('lang', 'ja');
}

async function selectPoolWithKeyboard(page: Page): Promise<void> {
  await tabUntil(page, page.locator('#pool-full'), 'Full pool radio');
  await focusVisible(page, page.locator('#pool-full'), 'Full pool radio');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#pool-new')).toBeFocused();
  await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 10語）');
}

test('390px keyboard acceptance preserves active HSK 2 choices through same-root remount', async ({ page }) => {
  expect(ids).toHaveLength(22);
  expect(newPoolIds).toHaveLength(21);
  expect(newPoolIds).toEqual(ids.slice(1));
  expect(newPoolIds[0]).not.toBe(ids[0]);
  expect(newPoolIds).not.toContain(ids[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('chabiko_theme', 'light'));
  await page.route('**/__acceptance/hsk2.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(answerPayload),
  }));
  await page.goto(`${BASE_URL}/__acceptance/hsk2/`, { waitUntil: 'load' });
  await expect(page.locator('#btn-start')).toBeEnabled();

  await tabOnce(page);
  await selectPoolWithKeyboard(page);
  await tabOnce(page);
  await tabOnce(page);
  await expect(page.locator('#size-20')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await tabOnce(page);
  await tabOnce(page);
  await expect(page.locator('#dir-ja-zh')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');
  await tabOnce(page);
  await expect(page.locator('#btn-start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '答えを見る' })).toHaveAccessibleName('答えを見る');
  await expect(page.locator('#btn-reveal')).toBeFocused();
  await checkActiveOptions(page);
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
  await assertUnrevealedAnswerAbsent(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-again')).toBeFocused();
  await expect(page.getByRole('button', { name: '覚えた' })).toHaveAccessibleName('覚えた');
  await expect(page.locator('[data-japanese]')).toHaveText('中合成語002');

  await page.evaluate(async () => {
    const importer = (specifier: string) => import(specifier);
    const storeModule = await importer('/src/domain/vocabularyProgress.ts') as {
      VocabularyProgressStore: {
        prototype: { applyRating: (id: string, rating: 'again' | 'unsure' | 'known') => void };
      };
    };
    const prototype = storeModule.VocabularyProgressStore.prototype;
    const original = prototype.applyRating;
    const calls: Array<{ id: string; rating: string }> = [];
    prototype.applyRating = function (this: object, id, rating) {
      calls.push({ id, rating });
      return original.call(this, id, rating);
    };
    (window as Window & { __hskRateCalls?: typeof calls }).__hskRateCalls = calls;
  });
  await page.evaluate(async () => {
    const importer = (specifier: string) => import(specifier);
    const client = await importer('/src/client/flashcardSession.ts') as {
      mountRemoteFlashcardSession: (data: { ids: string[]; newPoolIds: string[]; answerSource: string }) => Promise<() => void>;
    };
    const root = document.querySelector('.flashcard-session-root')!;
    (window as Window & { __hskRoot?: Element }).__hskRoot = root;
    await client.mountRemoteFlashcardSession(JSON.parse(root.getAttribute('data-session')!));
    (window as Window & { __hskRemountedRoot?: Element }).__hskRemountedRoot =
      document.querySelector('.flashcard-session-root')!;
  });
  expect(await page.evaluate(() => {
    const state = window as Window & { __hskRoot?: Element; __hskRemountedRoot?: Element };
    return state.__hskRoot === state.__hskRemountedRoot;
  })).toBe(true);
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');

  await tabUntil(page, page.locator('#btn-start'), 'Start after remount');
  await page.keyboard.press('Enter');
  await checkActiveOptions(page);
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
  await expect(page.locator('[data-pinyin]')).toHaveText('');
  await expect(page.locator('[data-japanese]')).toHaveText('');
  await assertUnrevealedAnswerAbsent(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-japanese]')).toHaveText('中合成語002');
  await tabOnce(page);
  await tabOnce(page);
  await expect(page.locator('#btn-known')).toHaveAccessibleName('覚えた');
  await page.keyboard.press('Enter');
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
  expect(await page.evaluate(() =>
    (window as Window & { __hskRateCalls?: Array<{ id: string; rating: string }> }).__hskRateCalls,
  )).toEqual([{ id: newPoolIds[0], rating: 'known' }]);

  const reset = page.locator('#btn-reset-progress');
  await tabUntil(page, reset, 'Reset progress button', 'Shift+Tab');
  await focusVisible(page, reset, 'Reset progress button');
  const cancelDialog = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.message()).toContain('進捗をリセット');
    await dialog.dismiss();
  });
  await Promise.all([page.keyboard.press('Enter'), cancelDialog]);
  await expect.soft(reset).toBeFocused();
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味003');
  await tabUntil(page, reset, 'Reset progress button after cancel');
  const confirmDialog = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.message()).toContain('進捗をリセット');
    await dialog.accept();
  });
  await Promise.all([page.keyboard.press('Enter'), confirmDialog]);
  await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
  await expect(reset).toBeHidden();
  await expect(page.locator('[data-front]')).toHaveText('日本語の意味003');
  await expect(page.locator('#pool-new')).toBeChecked();
  await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
});

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`active HSK 2 session: ${theme} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      const focusFailures: string[] = [];
      const focusObservations: unknown[] = [];
      const recordFocusedVisibleTarget = async (transition: string) => {
        const framing = await frameFlashcardRoot(page);
        const target = await page.evaluate(() => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement)) return null;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            visible: element.getClientRects().length > 0 && style.visibility !== 'hidden',
            focusedStyle: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
            inViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
          };
        });
        focusObservations.push({ transition, framing, activeElement: target });
        expect.soft(
          framing.activeElementPreserved,
          `[focus transition=${transition}] native session-root scrollIntoView must preserve document.activeElement: ${JSON.stringify(framing)}`,
        ).toBe(true);
        if (!target?.visible || !target.focusedStyle || !target.inViewport) {
          focusFailures.push(`${transition}: ${JSON.stringify(target)}`);
        }
      };

      await page.setViewportSize(viewport);
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem('chabiko_theme', selectedTheme);
      }, theme);
      await page.route('**/__acceptance/hsk2.json', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(answerPayload),
      }));
      await page.goto(`${BASE_URL}/__acceptance/hsk2/`, { waitUntil: 'load' });
      await expect(page.locator('#btn-start')).toBeEnabled();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1, name: 'HSK 2 単語フラッシュカード' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'HSK 2 新出単語' })).toHaveAccessibleName('HSK 2 新出単語');
      await expect(page.getByRole('radio', { name: '20語' })).toHaveAccessibleName('20語');
      await expect(page.getByRole('radio', { name: '日本語 → 中国語' })).toHaveAccessibleName('日本語 → 中国語');
      await expect(page.getByRole('button', { name: 'スタート' })).toHaveAccessibleName('スタート');
      await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 22語（セッション: 10語）');

      // Exercise native Tab/Space/Enter behavior through the real rendered controls.
      await tabOnce(page);
      await selectPoolWithKeyboard(page);

      await tabOnce(page);
      await expect(page.locator('#size-10')).toBeFocused();
      await tabOnce(page);
      await focusVisible(page, page.locator('#size-20'), '20-word option');
      await page.keyboard.press('Space');
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');

      await tabOnce(page);
      await expect(page.locator('#dir-zh-ja')).toBeFocused();
      await tabOnce(page);
      await focusVisible(page, page.locator('#dir-ja-zh'), 'Japanese-to-Chinese option');
      await page.keyboard.press('Space');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');
      await tabOnce(page);
      await focusVisible(page, page.locator('#btn-start'), 'Start button');
      await capture(page, testInfo, 'setup');

      const rootIdentity = await page.evaluate(() => {
        (window as Window & { __hskRoot?: Element }).__hskRoot = document.querySelector('.flashcard-session-root')!;
        return true;
      });
      expect(rootIdentity).toBe(true);
      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-reveal')).toBeFocused();
      await recordFocusedVisibleTarget('Start to Reveal');
      await expect(page.getByRole('button', { name: '答えを見る' })).toHaveAccessibleName('答えを見る');
      await checkActiveOptions(page);
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
      await assertUnrevealedAnswerAbsent(page);

      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-again')).toBeFocused();
      await recordFocusedVisibleTarget('Reveal to Again');
      await expect(page.getByRole('button', { name: '覚えた' })).toHaveAccessibleName('覚えた');
      await expect(page.locator('[data-pinyin]')).toHaveText('zhōng hé chéng yǔ 002');
      await expect(page.locator('[data-japanese]')).toHaveText('中合成語002');
      await capture(page, testInfo, 'revealed');

      // The production API is mounted again over the same Astro-rendered root. Wrap the
      // real store method so the acceptance can count an actual persisted rating call.
      await page.evaluate(async () => {
        const importer = (specifier: string) => import(specifier);
        const storeModule = await importer('/src/domain/vocabularyProgress.ts') as {
          VocabularyProgressStore: {
            prototype: {
              applyRating: (id: string, rating: 'again' | 'unsure' | 'known') => void;
            };
          };
        };
        const prototype = storeModule.VocabularyProgressStore.prototype;
        const original = prototype.applyRating;
        const calls: Array<{ id: string; rating: string }> = [];
        prototype.applyRating = function (this: object, id, rating) {
          calls.push({ id, rating });
          return original.call(this, id, rating);
        };
        (window as Window & { __hskRateCalls?: typeof calls }).__hskRateCalls = calls;
      });
      await page.evaluate(async () => {
        const importer = (specifier: string) => import(specifier);
        const client = await importer('/src/client/flashcardSession.ts') as {
          mountRemoteFlashcardSession: (data: {
            ids: string[];
            newPoolIds: string[];
            answerSource: string;
          }) => Promise<() => void>;
        };
        const root = document.querySelector('.flashcard-session-root')!;
        const data = JSON.parse(root.getAttribute('data-session')!);
        await client.mountRemoteFlashcardSession(data);
        (window as Window & { __hskRemountedRoot?: Element }).__hskRemountedRoot =
          document.querySelector('.flashcard-session-root')!;
      });
      await expect(page.locator('.flashcard-session-root')).toBeVisible();
      expect(await page.evaluate(() => {
        const state = window as Window & { __hskRoot?: Element; __hskRemountedRoot?: Element };
        return state.__hskRoot === state.__hskRemountedRoot;
      })).toBe(true);
      await expect(page.locator('#setup-panel')).toBeVisible();
      await expect(page.locator('#setup-count')).toHaveText('利用可能な単語: 21語（セッション: 20語）');
      await expect(page.locator('#pool-new')).toBeChecked();
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
      await recordFocusedVisibleTarget('same-root remount to setup');
      await capture(page, testInfo, 'post-remount-setup');

      const startAgain = page.locator('#btn-start');
      await tabUntil(page, startAgain, 'Start button after remount');
      await focusVisible(page, startAgain, 'Start button after remount');
      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-reveal')).toBeFocused();
      await recordFocusedVisibleTarget('Start after same-root remount');
      await checkActiveOptions(page);
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味002');
      await expect(page.locator('[data-pinyin]')).toHaveText('');
      await expect(page.locator('[data-japanese]')).toHaveText('');
      await assertUnrevealedAnswerAbsent(page);
      await capture(page, testInfo, 'post-remount-pre-reveal');

      await page.keyboard.press('Enter');
      await expect.soft(page.locator('#btn-again')).toBeFocused();
      await recordFocusedVisibleTarget('Reveal after same-root remount');
      await expect(page.locator('[data-japanese]')).toHaveText('中合成語002');
      await capture(page, testInfo, 'post-remount-revealed');
      await tabOnce(page);
      await tabOnce(page);
      await focusVisible(page, page.locator('#btn-known'), 'Known rating button');
      await expect(page.locator('#btn-known')).toHaveAccessibleName('覚えた');
      await page.keyboard.press('Enter');
      await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
      await expect(page.locator('#btn-reset-progress')).toBeVisible();
      expect(await page.evaluate(() =>
        (window as Window & { __hskRateCalls?: Array<{id: string; rating: string}> }).__hskRateCalls,
      )).toEqual([{ id: newPoolIds[0], rating: 'known' }]);
      await recordFocusedVisibleTarget('Known rating to next card');

      const resetButton = page.locator('#btn-reset-progress');
      await tabUntil(page, resetButton, 'Reset progress button', 'Shift+Tab');
      await focusVisible(page, resetButton, 'Reset progress button');
      const cancelDialog = page.waitForEvent('dialog').then(async (dialog) => {
        expect(dialog.message()).toContain('進捗をリセット');
        await dialog.dismiss();
      });
      await Promise.all([page.keyboard.press('Enter'), cancelDialog]);
      await expect.soft(resetButton).toBeFocused();
      await recordFocusedVisibleTarget('canceled reset dialog');
      await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味003');
      await expect(page.locator('#pool-new')).toBeChecked();
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');

      await tabUntil(page, resetButton, 'Reset progress button after cancel');
      const confirmDialog = page.waitForEvent('dialog').then(async (dialog) => {
        expect(dialog.message()).toContain('進捗をリセット');
        await dialog.accept();
      });
      await Promise.all([page.keyboard.press('Enter'), confirmDialog]);
      await expect(page.locator('#flashcard-progress [data-progress-text]')).toHaveText('1 / 20');
      await expect(resetButton).toBeHidden();
      await expect(page.locator('[data-front]')).toHaveText('日本語の意味003');
      await expect(page.locator('#pool-new')).toBeChecked();
      await expect(page.locator('#size-20')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#dir-ja-zh')).toHaveAttribute('aria-checked', 'true');
      await recordFocusedVisibleTarget('confirmed reset while session remains active');
      await testInfo.attach('focus-transition-report.json', {
        body: JSON.stringify({ focusObservations, failures: focusFailures }, null, 2),
        contentType: 'application/json',
      });
      await expect.soft(focusFailures, 'strict focus expectations failed:').toEqual([]);
    });
  }
}
