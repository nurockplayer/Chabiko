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
import { loadTaiwanTravelPathModel } from '../src/content/taiwanTravelPath';

const REPO_ROOT = resolve(__dirname, '..');
const ROUTE_SOURCE = resolve(
  REPO_ROOT,
  'src/pages/paths/taiwan-travel/index.astro',
);
const BUILD_DIR = mkdtempSync(join(tmpdir(), 'chabiko-taiwan-path-route-'));
const BUILT_ROUTE = join(BUILD_DIR, 'paths/taiwan-travel/index.html');

let routeSource = '';
let builtRouteHtml = '';

describe('/paths/taiwan-travel/ direct-refresh landing', () => {
  beforeAll(() => {
    routeSource = readFileSync(ROUTE_SOURCE, 'utf8');
    execSync(`corepack pnpm@10.33.0 astro build --outDir ${BUILD_DIR}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 120_000,
    });
    builtRouteHtml = readFileSync(BUILT_ROUTE, 'utf8');
  });

  afterAll(() => {
    if (existsSync(BUILD_DIR)) {
      rmSync(BUILD_DIR, { recursive: true, force: true });
    }
  });

  it('builds a direct-refreshable static route from the narrow adapter only', () => {
    expect(existsSync(BUILT_ROUTE)).toBe(true);
    expect(routeSource).toContain(
      "import { loadTaiwanTravelPathModel } from '../../../content/taiwanTravelPath'",
    );
    expect(routeSource.match(/loadTaiwanTravelPathModel\(\)/g)).toHaveLength(1);
    expect(routeSource).not.toMatch(
      /readFileSync|data\/examples\/valid\/lessons\.json|data\/learning-paths\.json|fetch\(/,
    );
    expect(routeSource).not.toMatch(/lesson-00[1-9]|lesson-010/);
    expect(routeSource).not.toContain('<script>');
  });

  it('renders each canonical lesson once in order with derived title, outcome, and route', () => {
    const model = loadTaiwanTravelPathModel();
    const lessonLinks = [
      ...builtRouteHtml.matchAll(
        /<a[^>]*data-taiwan-lesson-link="([^"]+)"[^>]*href="([^"]+)"[^>]*>/g,
      ),
    ];
    expect(lessonLinks).toHaveLength(10);
    expect(lessonLinks.map((match) => match[1])).toEqual(
      model.lessons.map((lesson) => lesson.id),
    );
    expect(lessonLinks.map((match) => match[2])).toEqual(
      model.lessons.map((lesson) => lesson.href),
    );

    for (const lesson of model.lessons) {
      expect(builtRouteHtml).toContain(lesson.titleJa);
      expect(builtRouteHtml).toContain(lesson.canDoJa);
      expect(builtRouteHtml).toContain(
        `data-lesson-number="${lesson.lessonNumber}"`,
      );
    }
  });

  it('keeps the assessment separate from lesson numbering', () => {
    const listEnd = builtRouteHtml.indexOf('</ol>');
    const assessment = builtRouteHtml.indexOf(
      'href="/paths/taiwan-travel/quiz/"',
    );
    expect(listEnd).toBeGreaterThan(0);
    expect(assessment).toBeGreaterThan(listEnd);
    expect(builtRouteHtml.match(/href="\/paths\/taiwan-travel\/quiz\/"/g)).toHaveLength(1);
    expect(builtRouteHtml).toContain('総合テスト');
  });

  it('uses native anchors with visible focus, full targets, wrapping, and narrow containment', () => {
    expect(routeSource).not.toMatch(/role="button"|tabindex|aria-disabled/);
    expect(routeSource).toMatch(
      /\.taiwan-path-lesson\s*\{[^}]*min-height:\s*2\.75rem[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(routeSource).toMatch(
      /\.taiwan-path-lesson:focus-visible,\s*\.taiwan-path-assessment__link:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\)/,
    );
    expect(routeSource).toMatch(
      /\.taiwan-path-root\s*\{[^}]*width:\s*min\(100%, 56rem\)[^}]*min-width:\s*0/,
    );
    expect(routeSource).toMatch(
      /\.taiwan-path-lessons\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(routeSource).toMatch(
      /@media \(width >= 48rem\)[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(routeSource).not.toContain('white-space: nowrap');
  });

  it('keeps Japanese guidance, Traditional-first metadata, and theme support', () => {
    expect(builtRouteHtml).toContain('<html lang="ja"');
    expect(builtRouteHtml).toContain('繁体字');
    expect(routeSource).toContain('themeEnabled');
    expect(routeSource).toContain('<Header themeEnabled />');
  });
});
