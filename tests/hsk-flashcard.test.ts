import { describe, it, expect } from 'vitest';
import { loadHskLevelEntries, loadHskVocabulary } from '../src/content/loadHskVocabulary';

// ─── Loader ───────────────────────────────────────────────────────────────────

describe('loadHskVocabulary', () => {
  it('loads the production HSK bundle from the production batch path', () => {
    const bundle = loadHskVocabulary();
    expect(bundle).toBeDefined();
    expect(Array.isArray(bundle.vocabulary)).toBe(true);
  });

  it('production HSK slice is truthfully empty until a real workbook is imported', () => {
    // No real HSK workbook exists in the repository (Issue #81). Synthetic or
    // self-test content is never promoted into the production boundary, so the
    // production HSK vocabulary is deterministically empty. This is the
    // truthful unavailable state until a real workbook is imported and its
    // rows reviewed.
    const bundle = loadHskVocabulary();
    expect(bundle.vocabulary).toEqual([]);
  });

  it('every entry has a valid hsk object', () => {
    const bundle = loadHskVocabulary();
    for (const entry of bundle.vocabulary) {
      expect(entry.id).toBeTruthy();
      expect(entry.simplified).toBeTruthy();
      expect(entry.pinyin).toBeTruthy();
      expect(entry.japanese).toBeTruthy();
      expect(entry.hsk).toBeDefined();
      expect(typeof entry.hsk.introducedAtLevel).toBe('number');
    }
  });
});

describe('loadHskLevelEntries', () => {
  it('returns only production-eligible entries for the requested level', () => {
    const entries = loadHskLevelEntries(1);
    for (const entry of entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.simplified).toBeTruthy();
      expect(entry.pinyin).toBeTruthy();
      expect(entry.japanese).toBeTruthy();
    }
  });

  it('returns empty array while the production slice has no reviewed content', () => {
    // The production HSK vocabulary is truthfully empty until a real workbook
    // is imported and rows are reviewed. The loader only renders
    // reviewed/published rows, so the level-1 slice is deterministically empty.
    expect(loadHskLevelEntries(1)).toEqual([]);
  });

  it('is deterministic: same input produces same result', () => {
    const a = loadHskLevelEntries(1);
    const b = loadHskLevelEntries(1);
    expect(a).toEqual(b);
  });

  it('returns empty array for level with no production entries', () => {
    const entries = loadHskLevelEntries(99);
    expect(entries).toEqual([]);
  });

  it('each returned entry has required renderable fields', () => {
    const entries = loadHskLevelEntries(1);
    for (const entry of entries) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.simplified).toBe('string');
      expect(typeof entry.pinyin).toBe('string');
      expect(typeof entry.japanese).toBe('string');
      expect(entry.simplified.length).toBeGreaterThan(0);
      expect(entry.pinyin.length).toBeGreaterThan(0);
      expect(entry.japanese.length).toBeGreaterThan(0);
    }
  });
});
