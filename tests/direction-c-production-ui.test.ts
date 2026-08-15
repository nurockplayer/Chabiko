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
const basicVocabularyPageSource = readSource(
  '../src/pages/vocabulary/basic/index.astro',
);
const basicVocabularyWordsSource = readSource(
  '../src/pages/vocabulary/basic/words/index.astro',
);
const basicVocabularyQuizSource = readSource(
  '../src/pages/vocabulary/basic/quiz/index.astro',
);
const pathsSource = readSource('../src/pages/paths/index.astro');
const phrasebookSource = readSource('../src/pages/phrasebook/index.astro');
const toneSource = readSource('../src/pages/practice/tones/index.astro');
const wordOrderSource = readSource('../src/pages/practice/word-order/index.astro');
const kanjiBridgeSource = readSource(
  '../src/pages/vocabulary/kanji-bridge/index.astro',
);
const basicPreviewDevSource = readSource(
  '../src/pages/dev/vocabulary/basic-preview/index.astro',
);
const teacherPreviewDevSource = readSource(
  '../src/pages/dev/vocabulary/teacher-preview/index.astro',
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

  it('makes the theme integration available to every learner route without a second mechanism', () => {
    expect(baseLayoutSource).toContain("data-theme-enabled={themeEnabled ? 'true' : undefined}");
    expect(baseLayoutSource).toContain(
      ":root[data-theme-enabled='true'][data-theme='dark']",
    );
    // The single BaseLayout theme mechanism is opt-in via the same themeEnabled
    // prop on every learner route: Dashboard, lessons, and all tracks/auxiliary
    // learner surfaces share the one pre-paint/storage bootstrap.
    expect(homeSource).toContain('<BaseLayout title="ホーム" themeEnabled>');
    expect(homeSource).toContain('<Header themeEnabled />');
    expect(lessonSource).toContain('themeEnabled>');
    expect(lessonSource).toContain('<Header themeEnabled />');
    for (const source of [
      hskSource,
      basicVocabularyPageSource,
      basicVocabularyWordsSource,
      basicVocabularyQuizSource,
      pathsSource,
      phrasebookSource,
      toneSource,
      wordOrderSource,
      kanjiBridgeSource,
    ]) {
      expect(source).toContain('themeEnabled');
    }
    // Non-learner surfaces (404, auth, dev previews, teacher portal) stay opt-out.
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
    // Answer/feedback focus management preserves the completion and next-question
    // lifecycle timers; renderCompleted and render are still scheduled after the
    // correct (1200ms) and incorrect (2000ms) feedback timeouts.
    expect(practiceSource).toContain('renderCompleted()');
    expect(practiceSource).toContain('}, 1200);');
    expect(practiceSource).toContain('}, 2000);');
    expect(practiceSource).toContain('feedback.focus();');
    expect(practiceSource).toContain("window.addEventListener('pageshow'");
    expect(practiceSource).toContain("window.addEventListener('storage'");
  });
});

describe('Direction C token scoping', () => {
  const rootBlock = (selector: string): string => {
    const start = baseLayoutSource.indexOf(`${selector} {`);
    if (start === -1) return '';
    let depth = 0;
    let i = start + selector.length + 1;
    for (; i < baseLayoutSource.length; i++) {
      if (baseLayoutSource[i] === '{') depth++;
      if (baseLayoutSource[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return baseLayoutSource.slice(start, i + 1);
  };

  const baseline = rootBlock(':root');
  const light = rootBlock(":root[data-theme-enabled='true']");
  const dark = rootBlock(":root[data-theme-enabled='true'][data-theme='dark']");

  it('keeps a shared token baseline for routes that do not opt into theming', () => {
    expect(baseline).toContain('--c-bg: #fafafa');
    expect(baseline).toContain('--c-surface: #ffffff');
    expect(baseline).toContain('--c-text: #1a1a1a');
    expect(baseline).toContain('--c-accent: #2563eb');
    expect(baseline).toContain('--radius: 4px');
    expect(baseline).toContain('--max-w: 48rem');
    expect(baseline).not.toContain('color-scheme');
  });

  it('opt-ins the theme on learner routes and keeps non-learner surfaces out', () => {
    expect(homeSource).toContain('<BaseLayout title="ホーム" themeEnabled>');
    expect(homeSource).toContain('<Header themeEnabled />');
    expect(lessonSource).toContain('themeEnabled>');
    expect(lessonSource).toContain('<Header themeEnabled />');
    for (const source of [
      hskSource,
      basicVocabularyPageSource,
      basicVocabularyWordsSource,
      basicVocabularyQuizSource,
      pathsSource,
      phrasebookSource,
      toneSource,
      wordOrderSource,
      kanjiBridgeSource,
    ]) {
      expect(source).toContain('themeEnabled');
    }
    for (const source of [
      notFoundSource,
      basicPreviewDevSource,
      teacherPreviewDevSource,
    ]) {
      expect(source).not.toContain('themeEnabled');
    }
  });

  it('keeps Direction C-only values out of the shared baseline', () => {
    expect(baseline).not.toContain('--color-page: #f4f1ec');
    expect(baseline).not.toContain('--radius: 0');
    expect(baseline).not.toContain('--max-w: 80rem');
    expect(baseline).not.toContain('#d48c2b');
    expect(baseline).not.toContain('#1a2744');
  });

  it('owns Direction C light tokens only in the light theme-enabled scope', () => {
    expect(light).toContain('--color-page: #f4f1ec');
    expect(light).toContain('--color-accent: #d48c2b');
    expect(light).toContain('--radius: 4px');
    expect(light).toContain('--max-w: 80rem');
    expect(light).toContain('color-scheme: light');
    expect(dark).not.toContain('--color-page: #f4f1ec');
  });

  it('owns Direction C dark tokens only in the dark theme-enabled scope', () => {
    expect(dark).toContain('--color-page: #11141c');
    expect(dark).toContain('color-scheme: dark');
    expect(light).not.toContain('--color-page: #11141c');
  });

  it('resolves --c-accent-hover without introducing an unauthorized color', () => {
    const shipped = [
      flashcardSource,
      basicVocabularySource,
      notFoundSource,
    ];
    for (const source of shipped) {
      const occurrences = source.match(/var\(--c-accent-hover\)/g) ?? [];
      expect(occurrences.length).toBeGreaterThan(0);
    }
    const hoverDef = (block: string) =>
      block.match(/--c-accent-hover:([^;]+)/)?.[1]?.trim();
    const baselineDef = hoverDef(baseline);
    const lightDef = hoverDef(light);
    const darkDef = hoverDef(dark);
    // Shared baseline may keep the pre-existing frozen value.
    expect(baselineDef).toBe('#1d4ed8');
    // Theme-enabled scopes must alias an existing token, not invent a colour.
    for (const def of [lightDef, darkDef]) {
      expect(def).toBeTruthy();
      expect(def).not.toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(def).toMatch(/var\(--c-accent\)|var\(--color-accent\)/);
    }
    expect(baseLayoutSource).not.toContain('#b97724');
    expect(baseLayoutSource).not.toContain('#d8993a');
  });
});
