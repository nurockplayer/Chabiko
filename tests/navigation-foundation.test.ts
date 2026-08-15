import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * #366 contextual-wayfinding foundation tests.
 *
 * Covers the shared breadcrumb / track-local-navigation contract (semantic,
 * keyboard-safe, theme-safe, non-colour current indicator, safe wrapping) and
 * its wiring into the 先生厳選単語 track surfaces that have real sibling modes
 * today. Pages with no real sibling destination omit local nav.
 */

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const breadcrumbSource = readSource('../src/components/Breadcrumb.astro');
const trackNavSource = readSource('../src/components/TrackNav.astro');
const studyRouteSource = readSource('../src/pages/vocabulary/basic/index.astro');
const catalogRouteSource = readSource(
  '../src/pages/vocabulary/basic/words/index.astro',
);
const quizRouteSource = readSource('../src/pages/vocabulary/basic/quiz/index.astro');
const detailRouteSource = readSource(
  '../src/pages/vocabulary/basic/words/[learnerId]/index.astro',
);
const hskSource = readSource('../src/pages/vocabulary/hsk/1/index.astro');
const toneSource = readSource('../src/pages/practice/tones/index.astro');
const phrasebookSource = readSource('../src/pages/phrasebook/index.astro');

describe('breadcrumb contract', () => {
  it('is a labelled landmark with a semantic ordered list', () => {
    expect(breadcrumbSource).toContain('<nav class="breadcrumb" aria-label={label}>');
    expect(breadcrumbSource).toContain('<ol class="breadcrumb__list">');
    expect(breadcrumbSource).toContain('<li class="breadcrumb__item">');
  });

  it('marks the current crumb with aria-current and a non-colour weight', () => {
    expect(breadcrumbSource).toContain(
      '<span class="breadcrumb__current" aria-current={isLast ? \'page\' : undefined}>',
    );
    expect(breadcrumbSource).toContain('font-weight: 700');
    // The current crumb is not a link: it is not focusable.
    expect(breadcrumbSource).toMatch(/span class="breadcrumb__current"/);
  });

  it('uses a decorative CSS separator and wraps long labels safely', () => {
    expect(breadcrumbSource).toContain("content: '›'");
    expect(breadcrumbSource).toContain('flex-wrap: wrap');
    expect(breadcrumbSource).toContain('overflow-wrap: anywhere');
  });

  it('keeps 44px minimum targets and is theme-safe', () => {
    expect(breadcrumbSource).toMatch(/\.breadcrumb__link\s*\{[\s\S]*?min-height:\s*44px/);
    expect(breadcrumbSource).toContain('var(--c-primary)');
    expect(breadcrumbSource).toContain('var(--c-text-muted)');
  });

  it('does not add an extra h1 to the page', () => {
    expect(breadcrumbSource).not.toContain('<h1');
  });
});

describe('track-local navigation contract', () => {
  it('is a labelled landmark with a semantic list of sibling modes', () => {
    expect(trackNavSource).toContain('<nav class="track-nav" aria-label={label}>');
    expect(trackNavSource).toContain('<ul class="track-nav__list">');
    expect(trackNavSource).toContain('<li class="track-nav__item">');
  });

  it('renders the current mode as a non-link span with aria-current="page"', () => {
    expect(trackNavSource).toContain(
      '<span class="track-nav__current" aria-current="page">',
    );
    expect(trackNavSource).toContain('font-weight: 700');
    // Sibling modes are native anchors (keyboard-safe, focusable).
    expect(trackNavSource).toMatch(/<a class="track-nav__link" href=\{item\.href\}>/);
  });

  it('keeps 44px targets, safe wrapping, and theme tokens', () => {
    expect(trackNavSource).toMatch(
      /\.track-nav__link,\s*\.track-nav__current\s*\{[\s\S]*?min-height:\s*44px/,
    );
    expect(trackNavSource).toContain('flex-wrap: wrap');
    expect(trackNavSource).toContain('overflow-wrap: anywhere');
    expect(trackNavSource).toContain('border-radius: var(--radius)');
    expect(trackNavSource).toContain('var(--c-border)');
    expect(trackNavSource).toContain('var(--c-slot-bg)');
  });

  it('does not add an extra h1 to the page', () => {
    expect(trackNavSource).not.toContain('<h1');
  });
});

describe('先生厳選単語 track wiring (real sibling modes)', () => {
  it('study route exposes the breadcrumb and 学ぶ/単語一覧/テスト sibling nav', () => {
    expect(studyRouteSource).toContain('Breadcrumb');
    expect(studyRouteSource).toContain('TrackNav');
    expect(studyRouteSource).toContain("label: '先生厳選単語'");
    expect(studyRouteSource).toContain("{ label: '学ぶ', href: '/vocabulary/basic/', current: true }");
    expect(studyRouteSource).toContain("{ label: '単語一覧', href: '/vocabulary/basic/words/' }");
    expect(studyRouteSource).toContain("{ label: 'テスト', href: '/vocabulary/basic/quiz/' }");
  });

  it('catalog route marks 単語一覧 as the current sibling and keeps the sibling set', () => {
    expect(catalogRouteSource).toContain('Breadcrumb');
    expect(catalogRouteSource).toContain('TrackNav');
    expect(catalogRouteSource).toContain("{ label: '単語一覧', href: '/vocabulary/basic/words/', current: true }");
    expect(catalogRouteSource).toContain("{ label: '学ぶ', href: '/vocabulary/basic/' }");
    expect(catalogRouteSource).toContain("{ label: 'テスト', href: '/vocabulary/basic/quiz/' }");
  });

  it('quiz route marks テスト as the current sibling and keeps the sibling set', () => {
    expect(quizRouteSource).toContain('Breadcrumb');
    expect(quizRouteSource).toContain('TrackNav');
    expect(quizRouteSource).toContain("{ label: 'テスト', href: '/vocabulary/basic/quiz/', current: true }");
    expect(quizRouteSource).toContain("{ label: '学ぶ', href: '/vocabulary/basic/' }");
    expect(quizRouteSource).toContain("{ label: '単語一覧', href: '/vocabulary/basic/words/' }");
  });

  it('detail route keeps a breadcrumb trail but omits local nav (drill-in surface)', () => {
    expect(detailRouteSource).toContain('Breadcrumb');
    expect(detailRouteSource).toContain("{ label: '単語一覧', href: '/vocabulary/basic/words/' }");
    expect(detailRouteSource).not.toContain('TrackNav');
  });
});

describe('pages without real sibling destinations omit local nav', () => {
  it('HSK, tone practice, and phrasebook omit the breadcrumb and track nav', () => {
    for (const source of [hskSource, toneSource, phrasebookSource]) {
      expect(source).not.toContain('Breadcrumb');
      expect(source).not.toContain('TrackNav');
    }
  });
});
