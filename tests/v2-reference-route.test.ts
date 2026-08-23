import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  new URL('../src/pages/v2-reference/index.astro', import.meta.url),
  'utf8',
);
const productionHomeSource = readFileSync(
  new URL('../src/pages/index.astro', import.meta.url),
  'utf8',
);
const productionHeaderSource = readFileSync(
  new URL('../src/components/Header.astro', import.meta.url),
  'utf8',
);

describe('isolated V2 reference route contract', () => {
  it('uses its own focused shell without V1 navigation composition', () => {
    expect(routeSource).toContain('data-v2-reference-root');
    expect(routeSource).toContain('robots="noindex, nofollow"');
    expect(routeSource).not.toMatch(/import\s+Header\s+from/);
    expect(routeSource).not.toMatch(/import\s+Breadcrumb\s+from/);
    expect(routeSource).not.toMatch(/import\s+TrackNav\s+from/);
    expect(routeSource).not.toContain('<Header');
    expect(routeSource).not.toContain('<Breadcrumb');
    expect(routeSource).not.toContain('<TrackNav');
  });

  it('removes the serialized bootstrap after mounting the client flow', () => {
    expect(routeSource).toContain('type="application/json"');
    expect(routeSource).toContain('bootstrapElement.remove()');
    expect(routeSource).toContain('mountV2ReferenceFlow(root, bootstrap)');
  });

  it('is not linked from production Home or the shared Header', () => {
    expect(productionHomeSource).not.toContain('/v2-reference/');
    expect(productionHeaderSource).not.toContain('/v2-reference/');
  });

  it('keeps all V2 presentation variables route-local', () => {
    expect(routeSource).toContain('--v2-shell:');
    expect(routeSource).not.toContain(':global(:root)');
    expect(routeSource).not.toContain('themeEnabled');
  });
});
