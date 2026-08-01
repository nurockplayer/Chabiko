import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const baseLayoutSource = readSource('../src/layouts/BaseLayout.astro');
const headerSource = readSource('../src/components/Header.astro');
const homeSource = readSource('../src/pages/index.astro');
const goalPathSource = readSource('../src/components/GoalPathSlot.astro');
const lessonSource = readSource('../src/pages/lessons/[id].astro');
const practiceSource = readSource('../src/components/LessonPractice.astro');
const hskSource = readSource('../src/pages/vocabulary/hsk/1/index.astro');
const notFoundSource = readSource('../src/pages/404.astro');
const flashcardSource = readSource('../src/components/FlashcardSession.astro');
const basicVocabularySource = readSource(
  '../src/components/vocabulary/BasicVocabularySession.astro',
);

describe('Direction C production journey presentation', () => {
  it('uses coherent light and dark semantic tokens with the city-wayfinding shell', () => {
    expect(baseLayoutSource).toContain('--color-page: #f4f1ec');
    expect(baseLayoutSource).toContain('--color-primary: #1a2744');
    expect(baseLayoutSource).toContain('--color-accent: #d48c2b');
    expect(baseLayoutSource).toContain(
      ":root[data-theme-enabled='true'][data-theme='dark']",
    );
    expect(baseLayoutSource).toContain('--color-page: #11141c');
    expect(baseLayoutSource).toContain('--color-success-soft: #17322f');
    expect(baseLayoutSource).toContain('--color-error-soft: #3a2222');
    expect(baseLayoutSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(headerSource).toContain('class="brand-mark"');
    expect(goalPathSource).toContain('class="route-timeline"');
    expect(goalPathSource).toContain('aria-current="step"');
  });

  it('provides a keyboard-native theme toggle with isolated preference storage', () => {
    expect(headerSource).toContain('id="theme-toggle"');
    expect(headerSource).toContain('type="button"');
    expect(headerSource).toContain('aria-pressed="false"');
    expect(headerSource).toContain('ダークテーマに切り替える');
    expect(headerSource).toContain('ライトテーマに切り替える');
    expect(headerSource).toContain('THEME_STORAGE_KEY');
    expect(baseLayoutSource).toContain("const themeKey = 'chabiko_theme'");
    expect(baseLayoutSource).not.toContain('chabiko_completed_lessons');
    expect(headerSource).not.toContain('chabiko_completed_lessons');
  });

  it('limits the theme integration to the production learning journey', () => {
    expect(baseLayoutSource).toContain("data-theme-enabled={themeEnabled ? 'true' : undefined}");
    expect(baseLayoutSource).toContain(
      ":root[data-theme-enabled='true'][data-theme='dark']",
    );
    expect(homeSource).toContain('<BaseLayout title="ホーム" themeEnabled>');
    expect(homeSource).toContain('<Header themeEnabled />');
    expect(lessonSource).toContain('themeEnabled>');
    expect(lessonSource).toContain('<Header themeEnabled />');
    expect(hskSource).not.toContain('themeEnabled');
    expect(notFoundSource).not.toContain('themeEnabled');
  });

  it('keeps the production home loader, lesson order mapping, and destinations', () => {
    expect(homeSource).toContain('loadAllRenderableLessons()');
    expect(homeSource).toContain('lessons.map((lesson, index)');
    expect(homeSource).toContain('href={`/lessons/${lesson.id}/`}');
    expect(homeSource).toContain('data-lesson-id={lesson.id}');
    expect(homeSource).toContain('data-completable={hasUsableLessonPractice(lesson)');
  });

  it('keeps static lesson paths and production navigation destinations', () => {
    expect(lessonSource).toContain('export const getStaticPaths');
    expect(lessonSource).toContain('const lessons = loadAllRenderableLessons()');
    expect(lessonSource).toContain('params: { id: lesson.id }');
    expect(lessonSource).toContain('href={`/lessons/${prevLesson.id}/`}');
    expect(lessonSource).toContain('href={`/lessons/${nextLesson.id}/`}');
    expect(lessonSource).toContain('<LessonPractice lesson={lesson} />');
  });

  it('keeps Chinese, pinyin, Japanese, and route state semantics explicit', () => {
    expect(homeSource).toContain('lang="zh-Hant"');
    expect(homeSource).toContain('lang="zh-Latn"');
    expect(lessonSource).toContain('lang="zh-Hant"');
    expect(lessonSource).toContain('lang="zh-Latn"');
    expect(lessonSource).toContain('aria-current="step"');
    expect(lessonSource).toContain('aria-label="レッスンナビゲーション"');
  });

  it('adds non-colour practice states while preserving storage and lifecycle calls', () => {
    expect(practiceSource).toContain('practice-choice__indicator');
    expect(practiceSource).toContain('aria-label="回答を選択"');
    expect(practiceSource).toContain('role="status" aria-live="polite"');
    expect(practiceSource).toContain('store.markComplete(session.lessonId)');
    expect(practiceSource).toContain('timer.schedule(() => renderCompleted(), 1200)');
    expect(practiceSource).toContain('timer.schedule(() => render(), 1200)');
    expect(practiceSource).toContain('timer.schedule(() => render(), 2000)');
    expect(practiceSource).toContain("window.addEventListener('pageshow'");
    expect(practiceSource).toContain("window.addEventListener('storage'");
  });
});

describe('Direction C token scoping', () => {
  it('keeps a shared token baseline for routes that do not opt into theming', () => {
    expect(baseLayoutSource).toContain('--c-bg: #fafafa');
    expect(baseLayoutSource).toContain('--c-surface: #ffffff');
    expect(baseLayoutSource).toContain('--c-text: #1a1a1a');
    expect(baseLayoutSource).toContain('--c-accent: #2563eb');
    expect(baseLayoutSource).toContain('--radius: 8px');
    expect(baseLayoutSource).toContain('--max-w: 48rem');
  });

  it('scopes Direction C light tokens to theme-enabled routes', () => {
    const baseRootBlock = baseLayoutSource.slice(
      0,
      baseLayoutSource.indexOf(':root[data-theme-enabled=\'true\']'),
    );
    expect(baseRootBlock).not.toContain('--color-page: #f4f1ec');
    expect(baseRootBlock).not.toContain('--radius: 0');
    expect(baseRootBlock).not.toContain('--max-w: 80rem');
    expect(baseLayoutSource).toContain(
      ":root[data-theme-enabled='true']",
    );
    expect(baseLayoutSource).toContain(
      ":root[data-theme-enabled='true'][data-theme='dark']",
    );
  });

  it('defines --c-accent-hover for every shipped reference', () => {
    for (const source of [
      flashcardSource,
      basicVocabularySource,
      notFoundSource,
    ]) {
      const occurrences = source.match(/var\(--c-accent-hover\)/g) ?? [];
      expect(occurrences.length).toBeGreaterThan(0);
    }
    expect(baseLayoutSource).toContain('--c-accent-hover:');
    const refs = [
      flashcardSource,
      basicVocabularySource,
      notFoundSource,
    ].flatMap((source) => source.match(/var\(--c-accent-hover\)/g) ?? []);
    expect(refs.length).toBeGreaterThanOrEqual(4);
  });
});
