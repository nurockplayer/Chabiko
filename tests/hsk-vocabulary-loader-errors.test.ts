import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHskVocabulary, loadHskLevelEntries } from '../src/content/loadHskVocabulary';

const tempDirs: string[] = [];

function writeTempFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'chabiko-hsk-'));
  tempDirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, contents, 'utf-8');
  return filePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadHskVocabulary error handling', () => {
  it('throws a descriptive error when the file is not valid JSON', () => {
    const path = writeTempFile('bad.json', '{ not valid json ');
    expect(() => loadHskVocabulary(path)).toThrow(/not valid JSON/);
    expect(() => loadHskVocabulary(path)).toThrow(path);
  });

  it('throws when the parsed value is not an object', () => {
    const path = writeTempFile('array.json', '[]');
    expect(() => loadHskVocabulary(path)).toThrow(/Invalid HSK vocabulary structure/);
  });

  it('throws when the parsed value is null', () => {
    const path = writeTempFile('null.json', 'null');
    expect(() => loadHskVocabulary(path)).toThrow(/Invalid HSK vocabulary structure/);
  });

  it('throws when the vocabulary field is missing or not an array', () => {
    const path = writeTempFile('no-vocab.json', JSON.stringify({ vocabulary: 'nope' }));
    expect(() => loadHskVocabulary(path)).toThrow(/expected \{vocabulary: \[\.\.\.\]\}/);
  });

  it('throws when the file does not exist', () => {
    expect(() => loadHskVocabulary('/nonexistent/path/to/hsk.json')).toThrow();
  });

  it('accepts a well-formed bundle', () => {
    const path = writeTempFile(
      'ok.json',
      JSON.stringify({ vocabulary: [] }),
    );
    expect(loadHskVocabulary(path)).toEqual({ vocabulary: [] });
  });
});

describe('loadHskLevelEntries filtering and mapping', () => {
  const bundle = {
    vocabulary: [
      {
        id: 'hsk-published-1',
        simplified: '你好',
        pinyin: 'nǐ hǎo',
        japanese: 'こんにちは',
        traditional: '你好',
        reviewStatus: 'published',
        simplifiedStatus: 'verified',
        source: { type: 'hsk' },
        hsk: { standardVersion: 'hsk-3.0', introducedAtLevel: 1, sourceLevelLabel: 'HSK1' },
      },
      {
        id: 'hsk-reviewed-1-no-traditional',
        simplified: '谢谢',
        pinyin: 'xièxie',
        japanese: 'ありがとう',
        reviewStatus: 'reviewed',
        simplifiedStatus: 'verified',
        source: { type: 'hsk' },
        hsk: { standardVersion: 'hsk-3.0', introducedAtLevel: 1, sourceLevelLabel: 'HSK1' },
      },
      {
        id: 'hsk-draft-1',
        simplified: '草稿',
        pinyin: 'cǎogǎo',
        japanese: 'ドラフト',
        reviewStatus: 'draft',
        simplifiedStatus: 'authored',
        source: { type: 'hsk' },
        hsk: { standardVersion: 'hsk-3.0', introducedAtLevel: 1, sourceLevelLabel: 'HSK1' },
      },
      {
        id: 'hsk-published-2',
        simplified: '再见',
        pinyin: 'zàijiàn',
        japanese: 'さようなら',
        reviewStatus: 'published',
        simplifiedStatus: 'verified',
        source: { type: 'hsk' },
        hsk: { standardVersion: 'hsk-3.0', introducedAtLevel: 2, sourceLevelLabel: 'HSK2' },
      },
    ],
  };

  function bundlePath(): string {
    return writeTempFile('level.json', JSON.stringify(bundle));
  }

  it('returns only reviewed/published entries for the requested level', () => {
    const entries = loadHskLevelEntries(1, bundlePath());
    expect(entries.map((e) => e.id).sort()).toEqual([
      'hsk-published-1',
      'hsk-reviewed-1-no-traditional',
    ]);
  });

  it('excludes draft entries', () => {
    const entries = loadHskLevelEntries(1, bundlePath());
    expect(entries.some((e) => e.id === 'hsk-draft-1')).toBe(false);
  });

  it('does not return entries from other levels', () => {
    const entries = loadHskLevelEntries(1, bundlePath());
    expect(entries.some((e) => e.id === 'hsk-published-2')).toBe(false);
  });

  it('maps traditional when present and omits it otherwise', () => {
    const entries = loadHskLevelEntries(1, bundlePath());
    const withTraditional = entries.find((e) => e.id === 'hsk-published-1');
    const withoutTraditional = entries.find(
      (e) => e.id === 'hsk-reviewed-1-no-traditional',
    );
    expect(withTraditional?.traditional).toBe('你好');
    expect(withoutTraditional?.traditional).toBeUndefined();
  });

  it('returns an empty array for a level with no matching entries', () => {
    expect(loadHskLevelEntries(9, bundlePath())).toEqual([]);
  });
});
