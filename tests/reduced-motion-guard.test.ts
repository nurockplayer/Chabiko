import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('applies the reduced-motion guard globally while preserving scoped theme styles', () => {
  const source = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
  const global = source.match(/<style is:global>([\s\S]*?)<\/style>/)?.[1];
  expect(global).toContain('@media (prefers-reduced-motion: reduce)');
  expect(global).toMatch(/\*,\s*\*::before,\s*\*::after/);
  for (const declaration of ['scroll-behavior: auto', 'transition-duration: 0.01ms', 'animation-duration: 0.01ms', 'animation-iteration-count: 1']) {
    expect(global).toContain(`${declaration} !important`);
  }
  expect(global).not.toContain('--paper');
  expect(source.match(/<style>([\s\S]*?)<\/style>/)?.[1]).toContain('--paper');
});
