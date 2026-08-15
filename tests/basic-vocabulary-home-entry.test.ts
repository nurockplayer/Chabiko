import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDashboardProgressPayload } from '../src/content/dashboardPayload';
import { DASHBOARD_TRACK_ORDER } from '../src/domain/dashboardProgress';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const homeSource = readSource('../src/pages/index.astro');
const studyRouteSource = readSource('../src/pages/vocabulary/basic/index.astro');
const domainSource = readSource('../src/domain/dashboardProgress.ts');

// Issue #374 intentionally replaces the old static home-entry composition
// (the `#basic-vocabulary-entry` section at an exact source position) with the
// three-track learner Dashboard. The basic-vocabulary capability and its
// destinations are preserved: the Dashboard track card leads to the study
// route, and the study route keeps the catalog CTA. This suite is the
// intentional migration of the former source-placement contract into an
// equivalent discoverability contract.

describe('basic-vocabulary home entry (Dashboard migration)', () => {
  describe('the static entry is replaced by the Dashboard', () => {
    it('no longer places a #basic-vocabulary-entry section on the home page', () => {
      expect(homeSource).not.toContain('basic-vocabulary-entry');
      expect(homeSource).not.toContain('class="home-journey"');
      expect(homeSource).not.toContain('単語一覧を見る');
    });

    it('renders exactly the three first-class track cards in canonical order', () => {
      expect(DASHBOARD_TRACK_ORDER).toEqual([
        'basic-vocabulary',
        'hsk',
        'taiwan-travel',
      ]);
      expect(homeSource).toContain('DASHBOARD_TRACK_ORDER.map');
      expect(homeSource).toContain('data-dashboard-track={trackId}');
    });

    it('uses the exact 先生厳選単語 track label', () => {
      expect(domainSource).toContain("'先生厳選単語'");
    });
  });

  describe('equivalent discoverability', () => {
    it('keeps the study route as the Dashboard track destination (single source)', () => {
      // The domain derivation owns the one real destination; the home page
      // renders the card link from it (never a second hard-coded href).
      expect(domainSource).toContain("'/vocabulary/basic/'");
      expect(homeSource).not.toContain('href="/vocabulary/basic/"');
      expect(studyRouteSource).toContain('イラストで学ぶ基礎中国語');
    });

    it('keeps the catalog CTA reachable from the study route, not duplicated on home', () => {
      expect(
        studyRouteSource.match(
          /href="\/vocabulary\/basic\/words\/"[^>]*>単語一覧を見る/g,
        ),
      ).toHaveLength(1);
      expect(homeSource).not.toContain('/vocabulary/basic/words/');
    });
  });

  describe('production corpus integrity', () => {
    it('derives the Dashboard payload from the full learner manifest corpus', () => {
      const payload = buildDashboardProgressPayload();
      expect(payload.basicVocabularyCorpusIds.length).toBeGreaterThan(0);
    });
  });

  describe('no unrelated content leaks into the track entry', () => {
    it('does not hard-code the 1,582 total anywhere', () => {
      expect(homeSource).not.toContain('1582');
      expect(domainSource).not.toContain('1582');
    });

    it('keeps HSK as its own first-class track card, not basic-vocabulary copy', () => {
      const basicDescription = domainSource.match(
        /DASHBOARD_TRACK_DESCRIPTIONS[\s\S]*?'basic-vocabulary':\s*'([^']*)'/,
      );
      expect(basicDescription).not.toBeNull();
      expect(basicDescription![1]).not.toMatch(/HSK|hsk/i);
    });
  });

  describe('the Dashboard shell preserves learner controls', () => {
    it('keeps the Taiwan progress reset control on the home page', () => {
      expect(homeSource).toContain('id="reset-progress-btn"');
      expect(homeSource).toContain('進捗をリセット');
    });
  });
});
