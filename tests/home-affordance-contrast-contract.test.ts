import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const homeSource = readFileSync(
  fileURLToPath(new URL('../src/pages/index.astro', import.meta.url)),
  'utf8',
);

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = homeSource.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('Home affordance contrast regression contract', () => {
  it('keeps the primary CTA on the AA-safe deep-coral pair during hover', () => {
    const hover = cssRule('.featured:hover .featured-action--primary');
    expect(hover).toContain('background: var(--coral-deep)');
    expect(hover).toContain('border-color: var(--coral-deep)');
    expect(hover).not.toContain('background: var(--coral);');
  });

  it('does not dim unavailable course-row text with whole-row opacity', () => {
    const unavailable = cssRule('.track-row--unavailable');
    expect(unavailable).toContain('cursor: default');
    expect(unavailable).not.toContain('opacity:');
  });

  it('keeps reset-button hover text on the AA-safe paper background', () => {
    const hover = cssRule('.reset-btn:hover');
    expect(hover).toContain('background: var(--paper)');
    expect(hover).toContain('color: var(--coral-deep)');
    expect(hover).not.toContain('background: var(--coral-soft)');
  });
});
