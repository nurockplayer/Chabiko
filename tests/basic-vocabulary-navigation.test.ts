import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildLearnerSessionPayload,
  buildLearnerSessionPayloadFromItems,
  serializeLearnerSessionPayload,
} from '../src/content/learnerSessionPayload';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const studyRouteSource = readSource(
  '../src/pages/vocabulary/basic/index.astro',
);
const homeSource = readSource('../src/pages/index.astro');

describe('basic vocabulary navigation', () => {
  describe('study route catalog link', () => {
    it('contains exactly one native anchor to /vocabulary/basic/words/ with the exact text', () => {
      const matches =
        studyRouteSource.match(
          /<a\b[^>]*href="\/vocabulary\/basic\/words\/"[^>]*>単語一覧を見る<\/a>/g,
        ) ?? [];
      expect(matches).toHaveLength(1);
    });

    it('keeps one catalog CTA plus the track-local sibling nav without re-adding the home entry', () => {
      // Exactly one 単語一覧を見る CTA. The #366 track-local wayfinding contract
      // additionally exposes the real sibling modes 学ぶ/単語一覧/テスト via the
      // shared TrackNav component; its 単語一覧 item is the one other catalog
      // destination (distinct copy, one occurrence).
      const ctaMatches =
        studyRouteSource.match(
          /<a\b[^>]*href="\/vocabulary\/basic\/words\/"[^>]*>単語一覧を見る<\/a>/g,
        ) ?? [];
      expect(ctaMatches).toHaveLength(1);
      const navItems =
        studyRouteSource.match(
          /\{ label: '単語一覧', href: '\/vocabulary\/basic\/words\/' \}/g,
        ) ?? [];
      expect(navItems).toHaveLength(1);
      // The study route must not re-add the homepage entry or a second study CTA.
      expect(studyRouteSource).not.toContain('basic-vocabulary-entry');
      expect(studyRouteSource).not.toContain('単語学習を始める');
    });

    it('is a native anchor outside the BasicVocabularySession client-owned markup', () => {
      const linkStart = studyRouteSource.indexOf(
        'href="/vocabulary/basic/words/">単語一覧を見る',
      );
      const sessionStart = studyRouteSource.indexOf(
        '<BasicVocabularySession',
      );
      expect(linkStart).toBeGreaterThan(0);
      expect(sessionStart).toBeGreaterThan(0);
      // The CTA must be before the session component's opening tag, so it is
      // server-rendered and stays visible during active/completed session states.
      expect(linkStart).toBeLessThan(sessionStart);
    });

    it('is ordered between the h1 and the session component in source/focus order', () => {
      const h1Start = studyRouteSource.indexOf('<h1>');
      const h1End = studyRouteSource.indexOf('</h1>');
      const linkStart = studyRouteSource.indexOf(
        'href="/vocabulary/basic/words/">単語一覧を見る',
      );
      const sessionStart = studyRouteSource.indexOf(
        '<BasicVocabularySession',
      );
      expect(h1Start).toBeGreaterThan(0);
      expect(h1End).toBeGreaterThan(h1Start);
      expect(linkStart).toBeGreaterThan(0);
      expect(sessionStart).toBeGreaterThan(0);
      expect(h1End).toBeLessThan(linkStart);
      expect(linkStart).toBeLessThan(sessionStart);
    });

    it('is focusable (not inert, no disabled attribute) and has a visible focus style', () => {
      const linkMatch = studyRouteSource.match(
        /<a\b[^>]*href="\/vocabulary\/basic\/words\/"[^>]*>/,
      );
      expect(linkMatch).not.toBeNull();
      expect(linkMatch![0]).not.toMatch(/\btabindex="-1"\b/);
      expect(linkMatch![0]).not.toContain('disabled');
      const styleMatch = studyRouteSource.match(/<style>([\s\S]*?)<\/style>/);
      const styles = styleMatch?.[1] ?? '';
      const clean = styles.replace(/\/\*[\s\S]*?\*\//g, '');
      const rules = clean.split('}');
      const focusRule = rules.find(
        (r) => r.includes('catalog-link') && r.includes(':focus-visible'),
      );
      expect(focusRule).toBeDefined();
      expect(focusRule).not.toContain('outline');
    });

    it('is a 44px minimum target with wrapping-friendly spacing and no nowrap', () => {
      const styleMatch = studyRouteSource.match(/<style>([\s\S]*?)<\/style>/);
      const styles = styleMatch?.[1] ?? '';
      // Anchor on the exact base rule so the .__catalog-link-row wrapper rule
      // (whose class contains "catalog-link") is not picked up.
      const linkRule = styles.match(
        /\.basic-vocabulary-page__catalog-link\s*\{([\s\S]*?)\}/,
      );
      expect(linkRule).not.toBeNull();
      const declarations = linkRule![1];
      expect(declarations).toMatch(/min-height:\s*44px/);
      expect(declarations).not.toContain('nowrap');
    });
  });

  describe('session contract preserved', () => {
    it('keeps the existing h1 and the BasicVocabularySession component unchanged', () => {
      expect(studyRouteSource).toContain(
        '<h1>イラストで学ぶ基礎中国語</h1>',
      );
      expect(studyRouteSource).toContain(
        '<BasicVocabularySession payload={payload} payloadJson={payloadJson} />',
      );
      // Session still receives the same props — no new data access was added.
      expect(studyRouteSource.match(/payload={payload}/g)).toHaveLength(1);
      expect(studyRouteSource.match(/payloadJson={payloadJson}/g)).toHaveLength(
        1,
      );
    });

    it('loads and serializes the learner session payload exactly once as before', () => {
      expect(studyRouteSource.match(/buildLearnerSessionPayload\(\)/g)).toHaveLength(1);
      expect(studyRouteSource.match(/serializeLearnerSessionPayload\(payload\)/g)).toHaveLength(1);
      expect(studyRouteSource).toContain(
        "from '../../../content/learnerSessionPayload'",
      );
    });

    it('produces the identical payload as before the change', () => {
      const direct = buildLearnerSessionPayload();
      const fromItems = buildLearnerSessionPayloadFromItems(
        loadProductionLearnerCorpus(),
      );
      expect(direct).toEqual(fromItems);
      expect(serializeLearnerSessionPayload(direct)).toBe(
        serializeLearnerSessionPayload(fromItems),
      );
      expect(direct.totalCount).toBeGreaterThan(0);
    });

    it('adds no duplicate catalog link, script, storage access, or session action to the route', () => {
      expect(studyRouteSource).not.toContain('<script');
      expect(studyRouteSource).not.toMatch(/localStorage|sessionStorage|chabiko_/);
      // Only one catalog CTA; the only other catalog destination is the
      // track-local sibling nav (学ぶ/単語一覧/テスト).
      expect(
        studyRouteSource.match(
          /href="\/vocabulary\/basic\/words\/"[^>]*>単語一覧を見る/g,
        ),
      ).toHaveLength(1);
      // No unrelated session re-render or completion logic added.
      expect(studyRouteSource).not.toContain('sessionStorage');
      expect(studyRouteSource).not.toContain('getElementById');
    });
  });

  describe('home entry consistency', () => {
    it('home still exposes the exact two destinations and primary-first order', () => {
      expect(homeSource.match(/href="\/vocabulary\/basic\/"/g)).toHaveLength(1);
      expect(homeSource.match(/href="\/vocabulary\/basic\/words\/"/g)).toHaveLength(1);
      const studyIndex = homeSource.indexOf('単語学習を始める');
      const catalogIndex = homeSource.indexOf('単語一覧を見る');
      expect(studyIndex).toBeGreaterThan(0);
      expect(catalogIndex).toBeGreaterThan(0);
      expect(studyIndex).toBeLessThan(catalogIndex);
    });
  });
});
