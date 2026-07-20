import { describe, it, expect } from 'vitest';
import { loadHskLevelEntries, loadHskVocabulary } from '../src/content/loadHskVocabulary';

// ─── Loader ───────────────────────────────────────────────────────────────────

describe('loadHskVocabulary', () => {
  it('loads the default HSK vocabulary fixture', () => {
    const bundle = loadHskVocabulary();
    expect(bundle).toBeDefined();
    expect(Array.isArray(bundle.vocabulary)).toBe(true);
    expect(bundle.vocabulary.length).toBeGreaterThan(0);
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
