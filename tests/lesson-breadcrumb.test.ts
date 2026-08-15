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
    expect(routeSource).toContain("<Breadcrumb");
    expect(routeSource).toContain("{ label: 'ホーム', href: '/' },");
    expect(routeSource).toContain("{ label: '台湾旅行', href: '/#taiwan-travel-path' },");
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
  });

  it('applies the #366 micro-radius token to boxed reading surfaces', () => {
    for (const selector of [
      '.can-do-section',
      '.core-card',
      '.bridge-section',
      '.travel-task',
      '.related-phrasebook',
      '.nav-link',
      '.completion-badge',
    ]) {
      expect(
        routeSource.match(
          new RegExp(`${selector}\\s*\\{[^}]*border-radius:\\s*var\\(--radius\\)`),
        ),
        `${selector} should use var(--radius)`,
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
      expect(html).toContain('href="/#taiwan-travel-path"');
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
    const last = builtLessonHtml.get('lesson-010') ?? '';
    expect(last).toContain('前のレッスン');
    expect(last).not.toContain('次のレッスン');
    expect(last).toContain('台湾旅行パスを完了');
    expect(last).toContain('一覧に戻る');
    // Interior lessons show both directions and keep frozen destinations.
    const middle = builtLessonHtml.get('lesson-005') ?? '';
    expect(middle).toContain('前のレッスン');
    expect(middle).toContain('次のレッスン');
    expect(middle).toContain('href="/lessons/lesson-004/"');
    expect(middle).toContain('href="/lessons/lesson-006/"');
  });
});
