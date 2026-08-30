/**
 * Lesson → 台湾旅行 track wayfinding (Issue #368).
 *
 * Each Taiwan Travel lesson must visibly belong to the 台湾旅行 first-class
 * learning track through the #366 contextual breadcrumb `ホーム › 台湾旅行 › 第N課`
 * using real path/lesson labels, without changing route semantics. The lesson
 * interaction stays lesson-level `練習` (never the track-level `総合テスト`
 * owned by #376), and previous/next navigation carries clear direction labels
 * while preserving the frozen destinations.
 *
 * Source assertions freeze the route contract. A fresh build (unique temporary
 * directory, never the shared dist/) verifies the rendered breadcrumb, the
 * non-link current crumb, the preserved `練習` surface, and the navigation
 * labels on every lesson page. Vitest serializes this file with the other
 * Astro build suites because Astro still writes its repository-local .astro
 * cache.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAllRenderableLessons } from '../src/content/loadLessons';

const REPO_ROOT = resolve(__dirname, '..');
const ROUTE_SOURCE = resolve(REPO_ROOT, 'src/pages/lessons/[id].astro');

// Unique per-run build directory, outside the repo and never shared.
const BUILD_DIR = mkdtempSync(join(tmpdir(), 'chabiko-lesson-breadcrumb-'));

const routeSource = readFileSync(ROUTE_SOURCE, 'utf8');

/** Built lesson HTML per lesson id, read after the fresh build. */
const builtLessonHtml = new Map<string, string>();

describe('lesson route source — breadcrumb and hierarchy contract', () => {
  it('renders the 台湾旅行 track breadcrumb with real labels', () => {
    expect(routeSource).toContain("import Breadcrumb from '../../components/Breadcrumb.astro'");
    expect(routeSource).toContain(
      "import { TAIWAN_TRAVEL_PATH_ROUTE } from '../../domain/taiwanTravelQuizNavigation'",
    );
    expect(routeSource).toContain("<Breadcrumb");
    expect(routeSource).toContain("{ label: 'ホーム', href: '/' },");
    expect(routeSource).toContain(
      "{ label: '台湾旅行', href: TAIWAN_TRAVEL_PATH_ROUTE },",
    );
    expect(routeSource).not.toContain('/#taiwan-travel-path');
    // The current crumb is the real lesson label, non-link (rendered by the
    // shared Breadcrumb as a span with aria-current="page").
    expect(routeSource).toContain('{ label: `第${lessonNumber}課` }');
  });

  it('keeps the lesson interaction lesson-level 練習, never the track-level 総合テスト', () => {
    expect(routeSource).toContain('<LessonPractice lesson={lesson} />');
    expect(routeSource).not.toContain('総合テスト');
  });

  it('adds clear previous/next direction labels while keeping frozen destinations', () => {
    expect(routeSource).toContain('class="nav-direction">前のレッスン');
    expect(routeSource).toContain('class="nav-direction">次のレッスン');
    expect(routeSource).toContain('href={`/lessons/${prevLesson.id}/`}');
    expect(routeSource).toContain('href={`/lessons/${nextLesson.id}/`}');
    expect(routeSource).toContain(
      'class="nav-link nav-complete" href={TAIWAN_TRAVEL_PATH_ROUTE}',
    );
  });

  it('applies the semantic A1 radius tokens to boxed reading surfaces', () => {
    const radiusTokens: Record<string, string> = {
      '.can-do-section': 'var(--radius-content)',
      '.bridge-section': 'var(--radius-content)',
      '.travel-task': 'var(--radius-content)',
      '.related-phrasebook': 'var(--radius-content)',
      '.completion-badge': 'var(--radius-chip)',
    };
    for (const [selector, token] of Object.entries(radiusTokens)) {
      const escapedToken = token.replace(/[()]/g, '\\$&');
      expect(
        routeSource.match(
          new RegExp(`${selector}\\s*\\{[^}]*border-radius:\\s*${escapedToken}`),
        ),
        `${selector} should use ${token}`,
      ).not.toBeNull();
    }
  });
});

describe('/lessons/:id/ — built wayfinding surface (Issue #368)', () => {
  beforeAll(() => {
    execSync(`pnpm astro build --outDir ${BUILD_DIR}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 180_000,
    });
    for (const lesson of loadAllRenderableLessons()) {
      const html = readFileSync(
        join(BUILD_DIR, `lessons/${lesson.id}/index.html`),
        'utf8',
      );
      builtLessonHtml.set(lesson.id, html);
    }
  });

  afterAll(() => {
    // Clean only the directory this suite created.
    if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true, force: true });
  });

  it('renders exactly one 台湾旅行 breadcrumb for every lesson', () => {
    const lessons = loadAllRenderableLessons();
    lessons.forEach((lesson, index) => {
      const html = builtLessonHtml.get(lesson.id) ?? '';
      expect(html.match(/class="breadcrumb"/g), `${lesson.id} breadcrumb count`).toHaveLength(1);
      expect(html).toContain('href="/paths/taiwan-travel/"');
      expect(html).toContain('href="/"');
      // The current crumb is the real non-link lesson label.
      expect(html).toContain(`第${index + 1}課`);
      expect(html).toContain('aria-current="page"');
    });
  });

  it('keeps the lesson practice as 練習 on every built lesson page', () => {
    for (const lesson of loadAllRenderableLessons()) {
      const html = builtLessonHtml.get(lesson.id) ?? '';
      expect(html).toContain('確認クイズ');
      expect(html).toMatch(/practice-heading[^>]*>[^<]*練習[^<]*<\/h2>/);
      expect(html).not.toContain('総合テスト');
    }
  });

  it('renders previous/next direction labels on the built navigation', () => {
    // Lesson 1 has no previous lesson; the final lesson has no next lesson and
    // instead completes back to the track home.
    const first = builtLessonHtml.get('lesson-001') ?? '';
    expect(first).not.toContain('前のレッスン');
    expect(first).toContain('次のレッスン');
    const last = builtLessonHtml.get('lesson-024') ?? '';
    expect(last).toContain('前のレッスン');
    expect(last).not.toContain('次のレッスン');
    expect(last).toContain('台湾旅行パスを完了');
    expect(last).toContain('一覧に戻る');
    expect(last).toContain('href="/paths/taiwan-travel/"');
    // Interior lessons show both directions and keep frozen destinations.
    const middle = builtLessonHtml.get('lesson-005') ?? '';
    expect(middle).toContain('前のレッスン');
    expect(middle).toContain('次のレッスン');
    expect(middle).toContain('href="/lessons/lesson-004/"');
    expect(middle).toContain('href="/lessons/lesson-006/"');
  });

  it('renders the candidate review hook with an accessible heading', () => {
    const candidateLessons = loadAllRenderableLessons().filter((lesson) =>
      lesson.id >= 'lesson-011',
    );
    expect(candidateLessons).toHaveLength(14);
    for (const lesson of candidateLessons) {
      const html = builtLessonHtml.get(lesson.id) ?? '';
      expect(html).toContain('次の復習ポイント');
      expect(html).toContain(lesson.reviewHookJa);
      expect(html).toMatch(
        /<section class="review-hook" aria-labelledby="review-hook-heading"[^>]*>[\s\S]*<h2 id="review-hook-heading"[^>]*>次の復習ポイント<\/h2>/,
      );
    }
  });
});
