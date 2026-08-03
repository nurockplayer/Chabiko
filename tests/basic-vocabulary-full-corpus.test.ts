// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import { buildLearnerSessionPayload } from '../src/content/learnerSessionPayload';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
} from '../src/domain/basicVocabularyProgress';
import type { LearnerManifest } from '../src/types/learnerManifest';
import type { StorageLike } from '../src/lib/progress';

const alwaysTracked = () => true;

const manifest: LearnerManifest = JSON.parse(
  readFileSync('data/teacher-vocabulary-preview/learner-manifest.json', 'utf8'),
);

function fakeStorage(initial?: Record<string, string>): StorageLike {
  const data: Record<string, string> = { ...initial };
  return {
    getItem(key: string): string | null {
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      data[key] = value;
    },
    removeItem(key: string): void {
      delete data[key];
    },
  };
}

function sessionRoot(
  ids: readonly string[],
  render: Record<string, unknown>,
  sizeAttr = '10',
): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyIds = JSON.stringify([...ids]);
  root.dataset.basicVocabularySessionSize = sizeAttr;
  root.innerHTML =
    '<p data-total></p><p data-summary></p><p data-progress aria-live="polite"></p><div data-card></div><button data-action="reset">reset</button>' +
    `<script type="application/json" id="basic-vocabulary-data">${JSON.stringify({
      totalCount: ids.length,
      render,
    })}</script>`;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe('full production corpus integration', () => {
  it('the route payload carries every eligible manifest row, untruncated', () => {
    const payload = buildLearnerSessionPayload();
    expect(payload.totalCount).toBe(manifest.totals.eligible);
    expect(payload.ids).toHaveLength(manifest.totals.eligible);
    expect(payload.ids).toEqual(manifest.rows.map((row) => row.learnerId));
    // The text-only production row stays out of the image-learning route.
    expect(payload.ids).not.toContain('teacher-star-1-8b957a100bd4');
  });

  it('the render map covers every eligible row with deployed asset metadata', () => {
    const payload = buildLearnerSessionPayload();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(Object.keys(payload.render)).toHaveLength(payload.totalCount);
    for (const item of corpus) {
      const r = payload.render[item.learnerId];
      expect(r).toBeDefined();
      expect(r.assetPath).toBe(item.illustration.assetPath);
      expect(r.width).toBe(item.illustration.width);
      expect(r.height).toBe(item.illustration.height);
      expect(r.altJa).toBe(item.illustration.altJa);
    }
  });

  it('the payload never serializes hidden answers (pinyin/japanese/traditional)', () => {
    const payload = buildLearnerSessionPayload();
    const json = JSON.stringify({ ids: payload.ids, render: payload.render });
    const rowWithPinyin = manifest.rows.find((row) => row.pinyin !== undefined)!;
    const rowWithJapanese = manifest.rows.find((row) => row.japanese !== undefined)!;
    const rowWithTraditional = manifest.rows.find((row) => row.traditional !== undefined)!;
    expect(json).not.toContain(rowWithPinyin.pinyin);
    expect(json).not.toContain(rowWithJapanese.japanese);
    expect(json).not.toContain(rowWithTraditional.traditional);
    // Only opaque learner IDs and render metadata are serialized.
    expect(json).not.toContain('pinyin');
    expect(json).not.toContain('japanese');
    expect(json).not.toContain('traditional');
  });

  it('a non-prefix corpus item is reachable and enters a session after unseen progress', () => {
    // Simulate a learner who already completed the first 10 unseen items:
    // persist progress so the next session window advances past position 10.
    const payload = buildLearnerSessionPayload();
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    const firstTen = payload.ids.slice(0, 10);
    for (const id of firstTen) store.applyRating(id, 'known');
    const second = store.selectSession(payload.ids, 10);
    expect(second).not.toEqual(firstTen);
    expect(second.some((id) => payload.ids.indexOf(id) >= 10)).toBe(true);
  });

  it('the client session can render a non-prefix item reached through progress', () => {
    // Advance the first 10 items to learned (two known each) so the next
    // session window fills with unseen items starting past position 10; the
    // client must then render that non-prefix item with its deployed image.
    const payload = buildLearnerSessionPayload();
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    const firstTen = payload.ids.slice(0, 10);
    for (const id of firstTen) {
      store.applyRating(id, 'known');
      store.applyRating(id, 'known');
    }
    const raw = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;
    const root = sessionRoot(payload.ids, { ...payload.render });
    window.localStorage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, raw);

    initBasicVocabularySession(root);
    const simplified = root.querySelector('.basic-vocabulary-simplified');
    expect(simplified).not.toBeNull();
    const firstNonPrefixId = payload.ids[10];
    expect(simplified?.textContent).toBe(
      manifest.rows.find((r) => r.learnerId === firstNonPrefixId)!.simplified,
    );
    // The reached item carries its deployed image.
    expect(root.querySelector('img')).not.toBeNull();
  });

  it('keeps the batch-01 loader contract intact as a legacy adapter', async () => {
    // loadTeacherVocabulary must still return the original 20 production rows
    // for any caller not yet migrated, untouched by this change.
    const { loadTeacherVocabulary } = await import('../src/content/loadTeacherVocabulary');
    const legacy = loadTeacherVocabulary();
    expect(legacy).toHaveLength(20);
    expect(legacy[0].vocabulary.id).toBe('teacher-star-1-37e0eb213f0f');
  });
});
