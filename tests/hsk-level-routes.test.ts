import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { loadHskPublication } from '../src/content/loadHskVocabulary';

const pageSource = readFileSync(new URL('../src/pages/vocabulary/hsk/[level]/index.astro', import.meta.url), 'utf8');
const answerSource = readFileSync(new URL('../src/pages/data/hsk/[level].json.ts', import.meta.url), 'utf8');
const sessionSource = readFileSync(new URL('../src/components/FlashcardSession.astro', import.meta.url), 'utf8');

function loadNewPoolOptionDecision() {
  const helperSource = sessionSource.match(/function getNewPoolOption\([\s\S]*?\n\}/)?.[0];
  if (!helperSource) throw new Error('Missing component pool-option decision helper');
  const compiled = transpileModule(
    `${helperSource}\nglobalThis.getNewPoolOption = getNewPoolOption;`,
    { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } },
  );
  const context: { getNewPoolOption?: (level: number, fullIds: string[], newIds: string[]) => unknown } = {};
  runInNewContext(compiled.outputText, context);
  if (!context.getNewPoolOption) throw new Error('Could not load component pool-option decision helper');
  return context.getNewPoolOption;
}

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

  it('passes the ordered full and new-word pool IDs into page-memory session setup', () => {
    expect(pageSource).toContain('entries={entries.map((entry) => ({');
    expect(pageSource).toContain('newPoolIds={pool.newWords.map((entry) => entry.id)}');
    expect(sessionSource).toContain('ids: fullPoolIds');
    expect(sessionSource).toContain('newPoolIds,');
    expect(sessionSource).toContain('HSK {level} 全範囲');
    expect(sessionSource).toContain('HSK {level} 新出単語');
    expect(sessionSource).toContain('newPoolOption.render && (');
    expect(sessionSource).toContain('disabled={newPoolOption.disabled}');
    expect(sessionSource).not.toContain('localStorage');
    expect(sessionSource).not.toContain('URLSearchParams');
  });

  it('keeps duplicate New options for HSK2–4, suppresses HSK1 duplicates, and disables empty pools', () => {
    const getOption = loadNewPoolOptionDecision();
    const identical = ['hsk-002'];

    expect(getOption(1, identical, identical)).toEqual({ render: false, disabled: false });
    for (const level of [2, 3, 4]) {
      expect(getOption(level, identical, identical)).toEqual({ render: true, disabled: false });
      expect(getOption(level, identical, [])).toEqual({ render: true, disabled: true });
    }
  });

  it('serves answer-side entries from admitted pools and carries validated notices as JSON metadata', () => {
    expect(answerSource).toContain('const { pools, sourceNotice } = loadHskPublication();');
    expect(answerSource).toContain('export function getStaticPaths()');
    expect(answerSource).toContain("pool.status === 'unavailable'");
    expect(answerSource).toContain('pool.fullRange.map');
    expect(answerSource).toContain('notice: sourceNotice');
    expect(answerSource).toContain('simplifiedStatus: entry.simplifiedStatus');
    expect(answerSource).toContain('traditionalStatus: entry.traditionalStatus ?? \'unavailable\'');
    expect(pageSource).not.toContain('traditional:');

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
