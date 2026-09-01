import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { BASE_URL } from './helpers';

const ROUTE = '/dev/small-talk/';
const THEMES = ['light', 'dark'] as const;
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const LOCAL_SENTINEL = ['chabiko_completed_lessons', 'production-progress-sentinel'] as const;
const SESSION_SENTINEL = ['small-talk-session-sentinel', 'production-session-sentinel'] as const;

async function openLab(
  page: Page,
  theme: (typeof THEMES)[number] = 'light',
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
  await page.addInitScript(
    ({ selectedTheme, local, session }) => {
      localStorage.setItem('chabiko_theme', selectedTheme);
      localStorage.setItem(local[0], local[1]);
      sessionStorage.setItem(session[0], session[1]);
    },
    { selectedTheme: theme, local: LOCAL_SENTINEL, session: SESSION_SENTINEL },
  );
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(ROUTE, { waitUntil: 'load' });
  await expect(page.locator('[data-small-talk-mission]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return { errors, externalRequests };
}

async function assertAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => typeof violation.impact === 'string' && BLOCKING_IMPACTS.has(violation.impact),
  );
  if (blocking.length > 0) {
    throw new Error(blocking.map((violation) =>
      `[${violation.impact}] ${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ).join('\n'));
  }
}

async function assertPageStructure(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).not.toBeEmpty();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const duplicateIds = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll<HTMLElement>('[id]').forEach((element) => {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    });
    return [...counts].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);
}

async function expectFocused(target: Locator, visible = false): Promise<void> {
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      active: element === document.activeElement,
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focus.active).toBe(true);
  if (visible) {
    expect(focus.focusVisible).toBe(true);
    expect(focus.outlineStyle).not.toBe('none');
    expect(focus.outlineWidth).not.toBe('0px');
  }
}

async function assertViewportAndTargets(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const controls = page.locator('[data-small-talk-lab-root] button:visible');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(dimensions.clientWidth);
  }
}

async function finishBaselineInitial(page: Page): Promise<void> {
  await page.locator('[data-small-talk-start]').click();
  await page.locator('[data-small-talk-strategy="weekend-medium-connect-experience"]').click();
  await page.locator('[data-small-talk-strategy="weekend-medium-follow-detail"]').click();
  await expect(page.locator('[data-small-talk-complete]')).toBeVisible();
}

async function finishBaselineReplay(page: Page): Promise<void> {
  await page.locator('[data-small-talk-replay]').click();
  await page.locator('[data-small-talk-strategy="weekend-medium-home-share-movie"]').click();
  await page.locator('[data-small-talk-strategy="weekend-medium-home-follow-genre"]').click();
  await expect(page.locator('[data-small-talk-transfer]')).toBeVisible();
}

for (const theme of THEMES) {
  test(`${theme}: Mission and active Encounter expose clean semantics and names`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors, externalRequests } = await openLab(page, theme);
    await assertPageStructure(page);
    await expect(page.locator('[data-small-talk-start]')).toHaveAccessibleName('会話を始める');
    await assertAxeClean(page);

    await page.locator('[data-small-talk-start]').click();
    const strategies = page.locator('[data-small-talk-strategy]');
    await expect(strategies).toHaveCount(3);
    await expect(strategies.first()).toHaveAccessibleName(/言い方の一例/);
    await expect(page.locator('[data-small-talk-cue-zh]')).toHaveAttribute('lang', 'zh-Hant');
    await expect(page.locator('[data-small-talk-cue-pinyin]')).toHaveAttribute('lang', 'zh-Latn');
    await expect(page.locator('[data-small-talk-cue-ja]')).toHaveAttribute('lang', 'ja');
    await assertAxeClean(page);
    expect([...externalRequests]).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('keyboard focus follows baseline, replay, repair, recap, and transfer controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  const start = page.locator('[data-small-talk-start]');
  for (let tabs = 0; tabs < 10; tabs += 1) {
    if (await start.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expectFocused(start, true);
  await page.keyboard.press('Enter');
  await expectFocused(page.locator('[data-small-talk-encounter-heading]'), true);

  await page.locator('[data-small-talk-strategy="weekend-medium-connect-experience"]').click();
  await expectFocused(page.locator('[data-small-talk-encounter-heading]'));
  await page.locator('[data-small-talk-strategy="weekend-medium-follow-detail"]').click();
  await expectFocused(page.locator('[data-small-talk-complete-heading]'));
  await assertAxeClean(page);

  await page.locator('[data-small-talk-replay]').click();
  await expectFocused(page.locator('[data-small-talk-encounter-heading]'));
  await page.locator('[data-small-talk-strategy="weekend-medium-home-share-movie"]').click();
  await page.locator('[data-small-talk-strategy="weekend-medium-home-follow-genre"]').click();
  await page.locator('[data-small-talk-transfer]').click();
  await page.locator('[data-small-talk-strategy="mid-autumn-share-preference"]').click();
  await page.locator('[data-small-talk-strategy="mid-autumn-repair-kaorou"]').click();
  await expect(page.locator('[data-small-talk-opportunity]')).toContainText('聞き返しは、会話を戻すための選択です');
  await expectFocused(page.locator('[data-small-talk-encounter-heading]'));
  await assertAxeClean(page);

  await page.locator('[data-small-talk-strategy="mid-autumn-confirm-and-return"]').click();
  await expectFocused(page.locator('[data-small-talk-complete-heading]'));
  await expect(page.locator('[data-small-talk-evidence-item]')).toHaveCount(3);
  await expect(page.locator('[data-small-talk-passport]')).toContainText('一度の理解トラブルから戻った');
  await assertAxeClean(page);
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.width}x${viewport.height}: Mission, active, recap, and repair remain contained`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLab(page);
    await assertViewportAndTargets(page);
    await finishBaselineInitial(page);
    await assertViewportAndTargets(page);
    await finishBaselineReplay(page);
    await page.locator('[data-small-talk-transfer]').click();
    await page.locator('[data-small-talk-strategy="mid-autumn-share-preference"]').click();
    await page.locator('[data-small-talk-strategy="mid-autumn-repair-kaorou"]').click();
    await assertViewportAndTargets(page);
  });
}

test('refresh and reset discard only Lab state and preserve production sentinels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openLab(page);
  await page.locator('[data-small-talk-start]').click();
  await page.locator('[data-small-talk-strategy="weekend-medium-connect-experience"]').click();
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('[data-small-talk-mission]')).toBeVisible();
  await expect(page.locator('[data-small-talk-encounter]')).toBeHidden();

  await page.locator('[data-small-talk-start]').click();
  await page.locator('[data-small-talk-reset]').click();
  await expect(page.locator('[data-small-talk-mission]')).toBeVisible();
  await expectFocused(page.locator('[data-small-talk-start]'));
  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
  }));
  expect(storage.local).toEqual({
    chabiko_completed_lessons: LOCAL_SENTINEL[1],
    chabiko_theme: 'light',
  });
  expect(storage.session).toEqual({ [SESSION_SENTINEL[0]]: SESSION_SENTINEL[1] });
});
