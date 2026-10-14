import { expect, test } from '@playwright/test';

test('answer audio is gesture-driven and keyboard accessible', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string; rate: number }[] = [];
    Object.assign(window, { __pronunciationSpoken: spoken });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => {}, addEventListener: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => {
        spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate });
        setTimeout(() => utterance.dispatchEvent(new Event('end')), 50);
      },
    } });
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/practice/tones/');
  const root = page.locator('[data-tone-practice]');
  await expect(root.locator('[data-pronunciation-button]:visible')).toHaveCount(0);
  await root.getByRole('button', { name: '第一声', exact: true }).click();
  await expect(root.locator('[data-pronunciation-button]:visible')).toHaveCount(0);
  await root.getByRole('button', { name: '答え合わせ', exact: true }).click();
  const audio = root.getByRole('button', { name: /^発音を聞く：/ });
  await expect(audio).toBeVisible();
  const box = await audio.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await audio.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pronunciationSpoken: unknown[] }).__pronunciationSpoken.length)).toBe(1);
  await expect(audio).not.toHaveAttribute('aria-busy');
  const spoken = await page.evaluate(() => (window as unknown as { __pronunciationSpoken: { lang: string; rate: number }[] }).__pronunciationSpoken[0]);
  expect(spoken.lang).toBe('zh-TW');
  expect(spoken.rate).toBeCloseTo(0.9, 6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('unsupported audio stays hidden while text and answer submission remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
  });
  await page.goto('/practice/tones/');
  const root = page.locator('[data-tone-practice]');
  await root.getByRole('button', { name: '第一声', exact: true }).click();
  await root.getByRole('button', { name: '答え合わせ', exact: true }).click();
  await expect(root.locator('[data-tone-hint]')).toBeVisible();
  await expect(root.locator('[data-pronunciation-button]:visible')).toHaveCount(0);
});
