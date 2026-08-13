// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadBasicVocabularyDetail,
  toBasicVocabularyDetailItem,
} from '../src/content/basicVocabularyDetail';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import type { ProductionLearnerItem } from '../src/types/learnerCorpus';

const alwaysTracked = () => true;

function corpusItem(overrides?: Partial<ProductionLearnerItem>): ProductionLearnerItem {
  const base = loadProductionLearnerCorpus({ assetTracked: alwaysTracked })[0];
  return { ...base, ...overrides };
}

describe('basic vocabulary detail loader (#342)', () => {
  it('maps the approved learner fields including the example sentence', () => {
    const item = corpusItem({ example: '我爱你' });
    const detail = toBasicVocabularyDetailItem(item);
    expect(detail.learnerId).toBe(item.learnerId);
    expect(detail.simplified).toBe(item.simplified);
    expect(detail.partOfSpeech).toBe(item.partOfSpeech);
    expect(detail.example).toBe('我爱你');
  });

  it('keeps a missing example as undefined (deliberate missing-example state)', () => {
    const item = corpusItem({ example: undefined });
    const detail = toBasicVocabularyDetailItem(item);
    expect(detail.example).toBeUndefined();
  });

  it('looks up a real corpus item by learner ID and returns null for unknown IDs', () => {
    const real = loadProductionLearnerCorpus({ assetTracked: alwaysTracked })[0];
    expect(loadBasicVocabularyDetail(real.learnerId)?.learnerId).toBe(real.learnerId);
    expect(loadBasicVocabularyDetail('not-a-real-id')).toBeNull();
  });
});

describe('basic vocabulary detail route (#342)', () => {
  it('generates one static page per corpus item keyed by the stable learner ID', async () => {
    const route = await readFile('src/pages/vocabulary/basic/words/[learnerId]/index.astro', 'utf8');
    expect(route).toContain('getStaticPaths');
    expect(route).toContain("from '../../../../../content/loadProductionLearnerCorpus'");
    expect(route).toContain('params: { learnerId: item.learnerId }');
    expect(route).toContain('toBasicVocabularyDetailItem');
    // The detail page is keyed by the opaque ID (the `[learnerId]` route
    // segment), never by surface text.
    expect(route).toContain('learnerId');
  });

  it('never fabricates an example in the detail layer and has an explicit unavailable state', async () => {
    const component = await readFile('src/components/vocabulary/BasicVocabularyDetail.astro', 'utf8');
    expect(component).toContain('item.example');
    expect(component).toContain('例文はまだありません。');
    // The component renders only the approved #340 contract field; no generation.
    expect(component).not.toMatch(/Math\.random|fetch\(|Date\b/);
  });

  it('adds the 例文を見る action to the learning card only when an example exists', async () => {
    const client = await readFile('src/client/basicVocabularySession.ts', 'utf8');
    expect(client).toContain('例文を見る');
    expect(client).toContain('entry.example');
    expect(client).toContain('example: row.example');
  });
});
