import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadHskPublication } from '../src/content/loadHskVocabulary';

const pageSource = readFileSync(new URL('../src/pages/vocabulary/hsk/[level]/index.astro', import.meta.url), 'utf8');
const answerSource = readFileSync(new URL('../src/pages/data/hsk/[level].json.ts', import.meta.url), 'utf8');

describe('HSK level route contract', () => {
  it('generates exactly the four adapter levels through one static page pattern', () => {
    const { pools } = loadHskPublication();
    expect(pools.map((pool) => pool.level)).toEqual([1, 2, 3, 4]);
    expect(pageSource).toContain('export function getStaticPaths()');
    expect(pageSource).toContain('return pools.map((pool) => ({');
    expect(pageSource).toContain('params: { level: String(pool.level) }');
  });

  it('renders the current zero-row state without a session and keeps the unavailable copy noninteractive', () => {
    const { pools } = loadHskPublication();
    expect(pools.every((pool) => pool.status === 'unavailable' && pool.fullRange.length === 0)).toBe(true);
    expect(pageSource).toContain("pool.status === 'unavailable' || entries.length === 0");
    expect(pageSource).toContain('<h2 id="preparing-title">準備中</h2>');
    expect(pageSource).toContain('一部の単語を公開中です。');
    expect(pageSource).toContain('answerSource={`/data/hsk/${level}.json`}');
  });

  it('serves answer-side entries from admitted pools and carries validated notices as JSON metadata', () => {
    expect(answerSource).toContain('const { pools, sourceNotice } = loadHskPublication();');
    expect(answerSource).toContain('export function getStaticPaths()');
    expect(answerSource).toContain("pool.status === 'unavailable'");
    expect(answerSource).toContain('pool.fullRange.map');
    expect(answerSource).toContain('notice: sourceNotice');

    const notice = loadHskPublication().sourceNotice;
    expect(notice?.attribution).toContain('HearMandarin');
    expect(notice?.license).toBe('CC BY 4.0');
    expect(notice?.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(notice?.provenanceUrl).toBeTruthy();
    expect(notice?.disclaimerUrl).toBeTruthy();
    expect(notice?.modificationNotice).toContain('Modified by retaining only');
    expect(pageSource).toContain('sourceNotice.modificationNotice');
    expect(pageSource).toContain('sourceNotice.attribution');
  });
});
