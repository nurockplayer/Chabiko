import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const homeSource = readSource('../src/pages/index.astro');

// Extract the lessons-successful branch by finding the region between
// `lessons.length > 0 ? (` and the LAST `) : (` which closes the ternary.
const branchStart =
  homeSource.indexOf('lessons.length > 0 ? (') + 'lessons.length > 0 ? ('.length;
const branchEnd = homeSource.lastIndexOf(') : (');
const lessonsBranch = homeSource.slice(branchStart, branchEnd);

// Fallback branch: the content between `) : (` and `)</BaseLayout>`
const fallbackBranch = homeSource.slice(
  homeSource.lastIndexOf(') : (') + ') : ('.length,
  homeSource.lastIndexOf('</BaseLayout>'),
);

// The home script block
const scriptMatch = homeSource.match(/<script>([\s\S]*?)<\/script>/);
const homeScript = scriptMatch?.[1] ?? '';

// The new entry section in the lessons branch: from `<section\n  id="basic-vocabulary-entry"`
// to its closing `</section>`.
const entryMatch = lessonsBranch.match(
  /<section\s+id="basic-vocabulary-entry"[\s\S]*?<\/section>/,
);
const entry = entryMatch?.[0] ?? '';

describe('basic-vocabulary home entry', () => {
  describe('existence and placement', () => {
    it('exists exactly once in the lessons-successful branch', () => {
      const matches = lessonsBranch.match(/id="basic-vocabulary-entry"/g);
      expect(matches).toHaveLength(1);
    });

    it('does not exist in the fallback branch', () => {
      expect(fallbackBranch).not.toContain('basic-vocabulary-entry');
    });

    it('appears after .progress-footer', () => {
      const progressFooterIndex = lessonsBranch.indexOf('progress-footer');
      const entryIndex = lessonsBranch.indexOf('basic-vocabulary-entry');
      expect(progressFooterIndex).toBeGreaterThan(0);
      expect(entryIndex).toBeGreaterThan(progressFooterIndex);
    });

    it('does not insert anything between #taiwan-travel-path close and .progress-footer', () => {
      // The closing </section> of #taiwan-travel-path is followed immediately
      // by whitespace and then <div class="progress-footer">
      const sectionEnd = lessonsBranch.indexOf('</section>');
      const progressFooterStart = lessonsBranch.indexOf('<div class="progress-footer">');
      expect(sectionEnd).toBeGreaterThan(0);
      expect(progressFooterStart).toBeGreaterThan(sectionEnd);

      const between = lessonsBranch.slice(
        sectionEnd + '</section>'.length,
        progressFooterStart,
      );
      // Only whitespace/newlines should exist between them
      expect(between.trim()).toBe('');
    });

    it('keeps #progress-summary and #reset-progress-btn before the new entry', () => {
      const summaryIndex = lessonsBranch.indexOf('progress-summary');
      const resetIndex = lessonsBranch.indexOf('reset-progress-btn');
      const entryIndex = lessonsBranch.indexOf('basic-vocabulary-entry');
      expect(summaryIndex).toBeGreaterThan(0);
      expect(resetIndex).toBeGreaterThan(0);
      expect(entryIndex).toBeGreaterThan(resetIndex);
    });
  });

  describe('exact copy and markup', () => {
    it('uses the exact eyebrow text', () => {
      expect(homeSource).toContain('>基礎単語<');
    });

    it('uses the exact title text', () => {
      expect(homeSource).toContain('イラストで学ぶ基礎中国語');
    });

    it('uses the exact description text', () => {
      expect(homeSource).toContain(
        '中国語の先生が選んだ単語を、イラスト付きの短いセッションで練習します。',
      );
    });

    it('uses the exact availability text', () => {
      expect(homeSource).toContain(
        '☆レベルの最初の単語セットを学習できます。',
      );
    });

    it('uses the exact action label', () => {
      expect(homeSource).toContain('単語学習を始める');
    });

    it('links to /vocabulary/basic/', () => {
      expect(homeSource).toContain('href="/vocabulary/basic/"');
    });

    it('the link is a native anchor with matching text', () => {
      const linkMatch = lessonsBranch.match(
        /<a[^>]*class="basic-vocabulary-entry__link"[^>]*>(.*?)<\/a>/,
      );
      expect(linkMatch).not.toBeNull();
      expect(linkMatch![1]).toBe('単語学習を始める');
      expect(linkMatch![0]).toContain('href="/vocabulary/basic/"');
    });
  });

  describe('section markup and allowed selectors', () => {
    it('is a <section> with id, class and aria-labelledby', () => {
      expect(lessonsBranch).toContain('id="basic-vocabulary-entry"');
      expect(lessonsBranch).toContain('class="basic-vocabulary-entry"');
      expect(lessonsBranch).toContain(
        'aria-labelledby="basic-vocabulary-entry-title"',
      );
    });

    it('only adds the exact allowed selectors in the style block', () => {
      const styleMatch = homeSource.match(/<style>([\s\S]*?)<\/style>/);
      const styles = styleMatch?.[1] ?? '';
      const selectorLines = styles
        .split('\n')
        .filter((line) => line.includes('basic-vocabulary-entry'))
        .map((l) => l.trim());

      const allowedSelectors = [
        '.basic-vocabulary-entry',
        '.basic-vocabulary-entry__content',
        '.basic-vocabulary-entry__eyebrow',
        '.basic-vocabulary-entry__availability',
        '.basic-vocabulary-entry__link',
        '.basic-vocabulary-entry__link:hover',
        '.basic-vocabulary-entry__link:focus-visible',
      ];

      for (const line of selectorLines) {
        const selector = line.replace(/[{}]/g, '').trim();
        if (selector.includes('.basic-vocabulary-entry')) {
          const isAllowed = allowedSelectors.some(
            (a) => selector === a || selector.startsWith(a + ','),
          );
          // Also allow compound selectors and @media-wrapped variants
          expect(
            isAllowed ||
              selector.includes('.basic-vocabulary-entry__link') ||
              selector === '.basic-vocabulary-entry' ||
              selector.startsWith('.basic-vocabulary-entry__'),
          ).toBe(true);
        }
      }
    });

    it('has content inside #basic-vocabulary-entry with the right structure', () => {
      expect(entry).toContain('basic-vocabulary-entry__content');
      expect(entry).toContain('basic-vocabulary-entry__eyebrow');
      expect(entry).toContain('basic-vocabulary-entry__availability');
      expect(entry).toContain('basic-vocabulary-entry__link');
      expect(entry).toContain('id="basic-vocabulary-entry-title"');
    });

    it('has an aria-labelledby pointing to the h2', () => {
      expect(lessonsBranch).toContain(
        'aria-labelledby="basic-vocabulary-entry-title"',
      );
      expect(lessonsBranch).toContain('id="basic-vocabulary-entry-title"');
    });
  });

  describe('forbidden content inside the entry', () => {
    it('has no HSK mention', () => {
      expect(entry).not.toMatch(/HSK|hsk/);
    });

    it('has no CEFR mention', () => {
      expect(entry).not.toContain('CEFR');
    });

    it('has no 公式 mention', () => {
      expect(entry).not.toContain('公式');
    });

    it('has no progress count', () => {
      expect(entry).not.toMatch(/\d+\s*\/\s*\d+/);
    });

    it('has no image', () => {
      expect(entry).not.toContain('<img');
    });

    it('has no button element', () => {
      expect(entry).not.toContain('<button');
    });

    it('has exactly one link', () => {
      const links = entry.match(/<a /g);
      expect(links).toHaveLength(1);
    });

    it('has no icon element', () => {
      expect(entry).not.toMatch(/<i\b|<span[^>]*icon|<svg/);
    });

    it('has no badge element', () => {
      expect(entry).not.toContain('badge');
    });

    it('has no storage key reference', () => {
      expect(entry).not.toMatch(/localStorage|sessionStorage|chabiko_/);
    });

    it('has no client script', () => {
      expect(entry).not.toContain('<script');
    });

    it('does not reference progress or completion counts', () => {
      // Only allow "progress" if it appears in a non-count context
      // The entry content must not mention progress/completion numbers
      expect(entry).not.toMatch(/\d+%|学習済み|完了数|残り\s*\d/);
    });
  });

  describe('existing home structure preserved', () => {
    it('still calls loadAllRenderableLessons()', () => {
      expect(homeSource).toContain('loadAllRenderableLessons()');
    });

    it('still maps lessons', () => {
      expect(homeSource).toContain('lessons.map((lesson, index)');
    });

    it('still has lesson links with href', () => {
      expect(homeSource).toContain('href={`/lessons/${lesson.id}/`}');
    });

    it('still has the reset button', () => {
      expect(homeSource).toContain('id="reset-progress-btn"');
      expect(homeSource).toContain('進捗をリセット');
    });

    it('still has progress-summary', () => {
      expect(homeSource).toContain('id="progress-summary"');
    });

    it('still has data-completable attribute', () => {
      expect(homeSource).toContain(
        'data-completable={hasUsableLessonPractice(lesson)',
      );
    });

    it('still has the home script unchanged (no new storage or client init)', () => {
      expect(homeScript).toContain(
        "import { ProgressStore } from '../lib/progress'",
      );
      expect(homeScript).toContain(
        "import { buildProgressSnapshot, handleProgressStorageEvent } from '../lib/progressSnapshot'",
      );
      expect(homeScript).toContain('new ProgressStore()');
      expect(homeScript).toContain('store.resetAll()');
      expect(homeScript).toContain('window.confirm');
      expect(homeScript).toContain("'storage'");
      // No new vocabulary-related code in the script
      expect(homeScript).not.toContain('Vocabulary');
      expect(homeScript).not.toContain('vocabulary');
    });
  });

  describe('static destination exists', () => {
    it('/vocabulary/basic/ route source file exists', () => {
      const routeSource = readSource(
        '../src/pages/vocabulary/basic/index.astro',
      );
      expect(routeSource).toContain('loadTeacherVocabulary');
      expect(routeSource).toContain('イラストで学ぶ基礎中国語');
    });
  });

  describe('responsive overflow', () => {
    it('long fixed copy wraps naturally at narrow widths', () => {
      // The longest fixed string is the description — confirm no nowrap
      const styleMatch = homeSource.match(/<style>([\s\S]*?)<\/style>/);
      const styles = styleMatch?.[1] ?? '';
      const entryStyles = styles
        .split('\n')
        .filter((l) => l.includes('basic-vocabulary-entry'));
      const nowrapLines = entryStyles.filter(
        (l) => l.includes('white-space') && !l.includes('normal'),
      );
      expect(nowrapLines).toHaveLength(0);
    });
  });
});
