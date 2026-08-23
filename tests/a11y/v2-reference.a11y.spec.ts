import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTE = '/v2-reference/';
const ANSWER_PATH = '/v2-reference/data/lesson-001-answer.json';
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

async function expectStage(page: Page, stage: string): Promise<void> {
  await expect(page.locator('[data-v2-reference-root]')).toHaveAttribute(
    'data-v2-stage',
    stage,
  );
}

async function expectViewportContainment(page: Page): Promise<void> {
  const audit = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-v2-reference-root]');
    const clippedControls = [...document.querySelectorAll<HTMLElement>('button, summary')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.bottom > 0 &&
          box.top < window.innerHeight &&
          style.visibility !== 'hidden'
        );
      })
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left < 0 ||
          box.right > window.innerWidth ||
          box.top < 0 ||
          box.bottom > window.innerHeight
        );
      })
      .map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' '));
    const undersizedControls = [...document.querySelectorAll<HTMLElement>('button, summary')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
      })
      .map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' '));

    return {
      documentWidths: [
        document.documentElement.clientWidth,
        document.documentElement.scrollWidth,
      ],
      rootWidths: root ? [root.clientWidth, root.scrollWidth] : null,
      clippedControls,
      undersizedControls,
    };
  });

  expect(audit.documentWidths[1]).toBe(audit.documentWidths[0]);
  expect(audit.rootWidths).not.toBeNull();
  expect(audit.rootWidths?.[1]).toBe(audit.rootWidths?.[0]);
  expect(audit.clippedControls).toEqual([]);
  expect(audit.undersizedControls).toEqual([]);
}

async function expectNoBlockingAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('[data-v2-reference-root]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test(`mobile containment ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(ROUTE, { waitUntil: 'networkidle' });

    await expectStage(page, 'today');
    await expectViewportContainment(page);

    await page.locator('[data-action="start-learning"]').first().click();
    await expectStage(page, 'learning');
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toHaveCount(0);
    await expectViewportContainment(page);

    await page.locator('[data-action="start-retrieval"]').click();
    await expectStage(page, 'retrieval');
    await expectViewportContainment(page);
  });
}

test('keyboard-operable repair flow keeps the answer hidden until reveal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const externalRequests = new Set<string>();
  const answerRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === ANSWER_PATH) answerRequests.push(url.pathname);
    if (url.origin !== 'http://127.0.0.1:4321') externalRequests.add(url.href);
  });

  await page.goto(ROUTE, { waitUntil: 'networkidle' });
  await expect(page.locator('#v2-reference-bootstrap')).toHaveCount(0);
  await expectNoBlockingAxeViolations(page);

  const primary = page.locator('[data-action="start-learning"]').first();
  await expect(primary.locator('.v2-button-arrow')).toHaveCount(1);
  const tactileStyle = await primary.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(tactileStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(tactileStyle.borderWidth).not.toBe('0px');
  expect(tactileStyle.boxShadow).not.toBe('none');

  await primary.focus();
  await page.keyboard.press('Enter');
  await expectStage(page, 'learning');
  await expect(page.locator('[data-screen-heading]')).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toHaveCount(0);
  await expectNoBlockingAxeViolations(page);

  await page.locator('[data-action="start-retrieval"]').click();
  await expectStage(page, 'retrieval');
  await expect(page.locator('[data-screen-heading]')).toBeFocused();
  await expect(page.locator('body')).not.toContainText('我要這個');
  await expect(page.locator('body')).not.toContainText('wǒ yào zhège');
  expect(answerRequests).toEqual([]);
  await expectNoBlockingAxeViolations(page);

  for (const chunk of ['這個', '我', '要']) {
    await page.getByRole('button', { name: chunk, exact: true }).click();
  }
  await page.locator('[data-action="submit-retrieval"]').click();
  await expectStage(page, 'repair');
  await expect(page.locator('body')).not.toContainText('我要這個');
  await expect(page.locator('body')).not.toContainText('wǒ yào zhège');
  expect(answerRequests).toEqual([]);

  await page.locator('[data-action="show-hint"]').click();
  await expect(page.locator('[data-repair-focus]')).toBeFocused();
  await expect(page.locator('body')).not.toContainText('我要這個');
  await expect(page.locator('body')).not.toContainText('wǒ yào zhège');
  expect(answerRequests).toEqual([]);

  await page.locator('[data-action="reveal-answer"]').click();
  await expect(page.locator('[data-reveal-answer]')).toBeFocused();
  await expect(page.locator('[data-reveal-answer]')).toContainText('我要這個');
  expect(answerRequests).toEqual([ANSWER_PATH]);
  await expectViewportContainment(page);
  await expectNoBlockingAxeViolations(page);

  await page.locator('[data-action="retry"]').click();
  await expect(page.locator('body')).not.toContainText('我要這個');
  await expect(page.locator('body')).not.toContainText('wǒ yào zhège');
  for (const chunk of ['我', '要', '這個']) {
    await page.getByRole('button', { name: chunk, exact: true }).click();
  }
  await page.locator('[data-action="submit-retrieval"]').click();
  await expectStage(page, 'correct');
  await page.locator('[data-action="view-result"]').click();
  await expectStage(page, 'result');
  await expect(page.locator('[data-screen-heading]')).toBeFocused();
  await expect(page.getByRole('heading', { name: '今日できるようになったこと' })).toBeVisible();
  await expect(page.locator('.v2-evidence-list')).toContainText(
    '答えを確認したあと、正しい順番に組み立て直した',
  );
  await expect(page.locator('[data-v2-reference-root]')).not.toContainText(/XP|ストリーク|バッジ|%/);
  await expectViewportContainment(page);
  await expectNoBlockingAxeViolations(page);
  expect(externalRequests).toEqual(new Set());
});
