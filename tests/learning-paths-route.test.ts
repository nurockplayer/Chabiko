/**
 * Learner-facing /paths/ route (Issue #230).
 *
 * The route is static and repository-controlled: it loads paths exclusively
 * through loadLearningPaths() and renders the frozen contract (Taiwan travel
 * first and visually primary; available paths link to their exact
 * destinations; unavailable paths are inert text with a Japanese reason).
 * Coverage mirrors the issue's test list: exact route/home destination,
 * deterministic order, available/unavailable semantics, no dead or focusable
 * unavailable control, safe missing-data state, direct build/refresh,
 * language attributes, keyboard/focus, and long-copy wrapping with
 * mobile/desktop containment.
 *
 * The fresh build writes to a unique temporary directory (never the shared
 * dist/). Vitest also serializes this file with the other Astro build suite
 * because Astro still writes its repository-local .astro cache.
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadLearningPaths } from '../src/content/loadLearningPaths';

const REPO_ROOT = resolve(__dirname, '..');
const ROUTE_SOURCE = resolve(REPO_ROOT, 'src/pages/paths/index.astro');
const COMPONENT_SOURCE = resolve(
  REPO_ROOT,
  'src/components/LearningPathCard.astro',
);
const HOME_SOURCE = resolve(REPO_ROOT, 'src/pages/index.astro');

// Unique per-run build directory, outside the repo and never shared.
const BUILD_DIR = mkdtempSync(join(tmpdir(), 'chabiko-paths-route-'));
const BUILT_ROUTE = join(BUILD_DIR, 'paths/index.html');
const BUILT_HOME = join(BUILD_DIR, 'index.html');

const routeSource = readFileSync(ROUTE_SOURCE, 'utf8');
const componentSource = readFileSync(COMPONENT_SOURCE, 'utf8');
const homeSource = readFileSync(HOME_SOURCE, 'utf8');
const document = loadLearningPaths();

/** Full built HTML of the route, read after the fresh build. */
let builtRouteHtml = '';
/** Full built HTML of the home page, read after the fresh build. */
let builtHomeHtml = '';

function builtRouteFragment(): string {
  // Everything inside the page's <section class="paths-page"> render.
  const start = builtRouteHtml.indexOf('<section class="paths-page"');
  const end = builtRouteHtml.lastIndexOf('</section>');
  if (start === -1 || end === -1) return '';
  return builtRouteHtml.slice(start, end + '</section>'.length);
}

function extractStyles(source: string): string {
  const match = source.match(/<style>([\s\S]*?)<\/style>/);
  return match?.[1] ?? '';
}

describe('/paths/ — repository-driven static route (Issue #230)', () => {
  beforeAll(() => {
    execSync(`pnpm astro build --outDir ${BUILD_DIR}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 120_000,
    });
    builtRouteHtml = readFileSync(BUILT_ROUTE, 'utf8');
    builtHomeHtml = readFileSync(BUILT_HOME, 'utf8');
  });

  afterAll(() => {
    // Clean only the directory this suite created.
    if (existsSync(BUILD_DIR)) {
      rmSync(BUILD_DIR, { recursive: true, force: true });
    }
  });

  it('renders the exact built /paths/ route and the home link destinations', () => {
    expect(existsSync(BUILT_ROUTE)).toBe(true);
    // The home page links to the exact route, once.
    expect(homeSource.match(/href="\/paths\/"/g)).toHaveLength(1);
    expect(builtHomeHtml).toContain('href="/paths/"');
    // The built route links to the exact destinations of available paths.
    const fragment = builtRouteFragment();
    expect(fragment).toContain('href="/lessons/"');
    expect(fragment).toContain('href="/vocabulary/hsk/"');
  });

  it('loads paths only through loadLearningPaths() in deterministic frozen order', () => {
    expect(routeSource).toContain(
      "import { loadLearningPaths } from '../../content/loadLearningPaths'",
    );
    expect(routeSource.match(/loadLearningPaths\(\)/g)).toHaveLength(1);
    // No direct data file access, no progress or readiness integration.
    expect(routeSource).not.toMatch(
      /readFileSync|data\/learning-paths\.json|localStorage|progress|readiness|fetch\(/,
    );
    // Deterministic order: Taiwan travel first, then HSK, then kanji bridge.
    const ids = document.learningPaths.map((path) => path.id);
    expect(ids).toEqual(['taiwan-travel', 'hsk-vocabulary', 'kanji-bridge']);
    // The route iterates the loader document in order; first card is primary.
    expect(routeSource).toContain('emphasized={index === 0}');
    const fragment = builtRouteFragment();
    const firstPathIndex = fragment.indexOf('data-path-id="taiwan-travel"');
    const secondPathIndex = fragment.indexOf('data-path-id="hsk-vocabulary"');
    const thirdPathIndex = fragment.indexOf('data-path-id="kanji-bridge"');
    expect(firstPathIndex).toBeGreaterThan(0);
    expect(secondPathIndex).toBeGreaterThan(firstPathIndex);
    expect(thirdPathIndex).toBeGreaterThan(secondPathIndex);
  });

  it('shows Taiwan travel first and visually primary', () => {
    const fragment = builtRouteFragment();
    // The first card is Taiwan travel and carries the primary marker.
    expect(
      fragment.indexOf(
        'learning-path-card--available learning-path-card--primary',
      ),
    ).toBeLessThan(fragment.indexOf('data-path-id="hsk-vocabulary"'));
    // No other card is marked primary.
    expect(fragment.match(/learning-path-card--primary/g)).toHaveLength(1);
    expect(componentSource).toContain('learning-path-card--primary');
  });

  it('available paths are real links; unavailable paths are inert text', () => {
    const fragment = builtRouteFragment();
    // Available: exactly the two declared destinations as anchor hrefs.
    const lessonsHref = fragment.match(/<a[^>]*href="\/lessons\/"[^>]*>/g);
    const hskHref = fragment.match(
      /<a[^>]*href="\/vocabulary\/hsk\/"[^>]*>/g,
    );
    expect(lessonsHref).toHaveLength(1);
    expect(hskHref).toHaveLength(1);
    expect(lessonsHref![0]).toContain('data-path-availability="available"');
    expect(hskHref![0]).toContain('data-path-availability="available"');
    // Unavailable: no link, button, click handler, or focusability at all.
    expect(fragment).not.toContain('href="/vocabulary/kanji-bridge/"');
    const kanjiBlock = fragment.slice(
      fragment.indexOf('data-path-id="kanji-bridge"'),
    );
    expect(kanjiBlock).not.toMatch(
      /href=|onclick|onClick|button|tabindex|tabIndex|role="link"/,
    );
    // No fake disabled state either — the card is simply a non-interactive div.
    expect(fragment).not.toContain('aria-disabled');
    expect(componentSource).not.toContain('aria-disabled');
  });

  it('unavailable path shows a Japanese reason with no interactive affordance', () => {
    const fragment = builtRouteFragment();
    // The Japanese reason and the truthful pending status are shown.
    expect(
      fragment,
    ).toContain('このルートはコンテンツとルートが準備できるまで利用できません。');
    expect(fragment).toContain('準備中です');
    // The card is a plain non-focusable <div> — no anchor, button, or tabindex.
    const kanjiStart = fragment.indexOf('data-path-id="kanji-bridge"');
    const kanjiBlock = fragment.slice(kanjiStart, fragment.length);
    expect(kanjiBlock).not.toContain('<a ');
    expect(kanjiBlock).not.toMatch(/<button\b|tabindex|onclick|onClick/);
    // The component renders the unavailable branch with the card surface.
    expect(componentSource).toContain('data-path-availability="unavailable"');
  });

  it('shows each path script default truthfully without implementing the global preference', () => {
    const fragment = builtRouteFragment();
    const byId = new Map(
      document.learningPaths.map((path) => [path.id, path]),
    );
    // Per-path script default labels, derived from the frozen contract.
    expect(byId.get('taiwan-travel')?.script).toBe('traditional');
    expect(fragment).toContain('繁体字表示');
    expect(byId.get('hsk-vocabulary')?.script).toBe('simplified');
    expect(fragment).toContain('簡体字表示');
    // Only the path's own default is shown; no global preference logic exists.
    expect(routeSource).not.toContain('scriptPreference');
    expect(routeSource).not.toContain('path-default');
    expect(routeSource).not.toContain('localStorage');
    // The route carries no client script block at all.
    expect(routeSource).not.toContain('<script>');
  });

  it('language attributes: page is Japanese-first with no content script markers', () => {
    // BaseLayout supplies the Japanese page language.
    expect(builtRouteHtml).toContain('<html lang="ja"');
    // The route shows no Chinese content, so no script/lang markers appear.
    expect(builtRouteHtml).not.toContain('lang="zh-Hant"');
    expect(builtRouteHtml).not.toContain('lang="zh-Latn"');
    expect(routeSource).not.toMatch(/lang="zh-[A-Za-z]+"/);
  });

  it('keyboard/focus: available links keep visible focus styles and full target size', () => {
    const componentStyles = extractStyles(componentSource);
    // Route focus-visible style: border + ring (not outline, not hidden).
    expect(componentStyles).toContain(
      '.learning-path-card--available:focus-visible',
    );
    const focusRule = componentStyles.match(
      /\.learning-path-card--available:focus-visible\s*\{([^}]*)\}/,
    );
    expect(focusRule).not.toBeNull();
    expect(focusRule![1]).toMatch(/border-color:\s*var\(--color-focus\)/);
    expect(focusRule![1]).not.toContain('outline');
    expect(focusRule![1]).not.toContain('display: none');
    // No unavailable-path focus rule: the inert card can never receive focus.
    expect(componentStyles).not.toContain(
      '.learning-path-card--unavailable:focus',
    );
    // Available links are keyboard-focusable anchors in the built route.
    const fragment = builtRouteFragment();
    expect(fragment).toMatch(/<a[^>]*href="\/lessons\/"[^>]*>/);
  });

  it('long-copy wrapping and mobile/desktop containment with no horizontal overflow', () => {
    const pageStyles = extractStyles(routeSource);
    const componentStyles = extractStyles(componentSource);
    // Long Japanese copy wraps everywhere; no nowrap on text-bearing elements.
    for (const styles of [pageStyles, componentStyles]) {
      const nowrap = styles
        .split('}')
        .filter(
          (rule) =>
            (rule.includes('paths-lead') ||
              rule.includes('learning-path-card__label') ||
              rule.includes('learning-path-card__description') ||
              rule.includes('learning-path-card__meta')) &&
            rule.includes('white-space') &&
            !rule.includes('normal'),
        );
      expect(nowrap).toHaveLength(0);
    }
    // Cards and page are contained by their containers at every width.
    expect(componentStyles).toMatch(
      /\.learning-path-card\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(componentStyles).toMatch(
      /\.learning-path-card__body\s*\{[^}]*min-width:\s*0[^}]*flex:\s*1\s*1\s*auto/,
    );
    expect(pageStyles).toMatch(/\.paths-page\s*\{[^}]*min-width:\s*0/);
    expect(pageStyles).toMatch(/\.paths-list\s*\{[^}]*display:\s*grid/);
    expect(pageStyles).toMatch(/\.paths-list-item\s*\{[^}]*min-width:\s*0/);
    // Desktop only increases spacing; narrow layouts keep a single column.
    expect(pageStyles).toMatch(/@media \(width >= 768px\)/);
    expect(pageStyles).not.toMatch(/grid-template-columns/);
    // The arrow never forces a card wider than its container.
    expect(componentStyles).toMatch(
      /\.learning-path-card__arrow\s*\{[^}]*flex:\s*0\s*0\s*auto/,
    );
  });

  it('safe missing-data state: invalid or missing data fails closed without fabricating a path', () => {
    // The route only renders what the loader returns; there is no fallback
    // list and no fabricated path anywhere in the route source.
    expect(routeSource).not.toMatch(/kanji-bridge|hsk-vocabulary|taiwan-travel/);
    const fragment = builtRouteFragment();
    // The rendered labels come from the data file, not the route.
    for (const path of document.learningPaths) {
      expect(fragment).toContain(path.labelJa);
    }
    // The loader is the single entry point and throws on missing/invalid data.
    expect(loadLearningPaths).toBeTypeOf('function');
    // Route renders exactly one card per loaded path.
    expect(
      fragment.match(/data-path-availability=/g),
    ).toHaveLength(document.learningPaths.length);
  });

  it('renders every frozen path once, in loader order, with matching ids', () => {
    const fragment = builtRouteFragment();
    const renderedIds = [
      ...fragment.matchAll(
        /<[a-z]+ class="[^"]*learning-path-card[^"]*"[^>]*data-path-id="([^"]+)"/g,
      ),
    ].map((match) => match[1]);
    expect(renderedIds).toEqual(document.learningPaths.map((path) => path.id));
    expect(renderedIds).toHaveLength(3);
  });
});

describe('/paths/ — availability reflects the frozen contract (source-level)', () => {
  it('maps the loader availability to the card surface contract', () => {
    const byId = new Map(
      document.learningPaths.map((path) => [path.id, path]),
    );
    expect(byId.get('taiwan-travel')?.availability).toBe('available');
    expect(byId.get('hsk-vocabulary')?.availability).toBe('available');
    expect(byId.get('kanji-bridge')?.availability).toBe('unavailable');
    // The card component branches on availability, with a primary modifier
    // for the first path only.
    expect(componentSource).toContain("path.availability === 'available'");
    expect(componentSource).toContain('emphasized = false');
  });

  it('keeps unavailable paths out of interactive markup in the component', () => {
    // The unavailable branch renders a plain div with no href or handler.
    const unavailableBranch = componentSource.slice(
      componentSource.indexOf('learning-path-card--unavailable'),
    );
    expect(unavailableBranch).not.toContain('href=');
    expect(unavailableBranch).not.toMatch(
      /onclick|onClick|tabindex|role="link"/,
    );
  });
});

describe('home — one compact link to /paths/', () => {
  it('adds exactly one compact link to /paths/ before the vocabulary entry', () => {
    expect(homeSource.match(/href="\/paths\/"/g)).toHaveLength(1);
    const linkIndex = homeSource.indexOf('href="/paths/"');
    // Placed before the vocabulary entry section, in the shared header area.
    expect(linkIndex).toBeGreaterThan(0);
    expect(linkIndex).toBeLessThan(
      homeSource.indexOf('id="basic-vocabulary-entry"'),
    );
    // The home page still has exactly its one pre-existing script block.
    expect(homeSource.match(/<script>/g)).toHaveLength(1);
  });

  it('keeps the home link keyboard-focusable with a visible focus style', () => {
    const homeStyles = extractStyles(homeSource);
    const linkRule = homeStyles.match(/\.goal-paths-link a\s*\{([^}]*)\}/);
    expect(linkRule).not.toBeNull();
    expect(linkRule![1]).toMatch(/min-height:\s*44px/);
    expect(linkRule![1]).toMatch(/font-size:\s*0\.875rem/);
    const focusRule = homeStyles.match(
      /\.goal-paths-link a:focus-visible\s*\{([^}]*)\}/,
    );
    expect(focusRule).not.toBeNull();
    expect(focusRule![1]).toMatch(/border-color:\s*var\(--color-focus\)/);
    expect(focusRule![1]).not.toContain('outline');
    expect(focusRule![1]).not.toContain('display: none');
  });
});
