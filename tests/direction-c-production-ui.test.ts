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

describe('Direction C production journey presentation', () => {
  it('uses the approved light palette and city-wayfinding shell', () => {
    expect(baseLayoutSource).toContain('--c-bg: #f4f1ec');
    expect(baseLayoutSource).toContain('--c-primary: #1a2744');
    expect(baseLayoutSource).toContain('--c-accent: #d48c2b');
    expect(headerSource).toContain('class="brand-mark"');
    expect(goalPathSource).toContain('class="route-timeline"');
    expect(goalPathSource).toContain('aria-current="step"');
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
    expect(practiceSource).toContain("window.addEventListener('pageshow'");
    expect(practiceSource).toContain("window.addEventListener('storage'");
  });
});
