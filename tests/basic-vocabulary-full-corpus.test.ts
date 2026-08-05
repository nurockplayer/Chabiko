// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import { buildLearnerSessionPayload, buildLearnerSessionPayloadFromItems } from '../src/content/learnerSessionPayload';
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

  it('a corpus item beyond the original 20 enters a bounded session after progress', () => {
    // Advance the first 20 items to learned so the next session window starts
    // at manifest index 20 — the first corpus item beyond the original 20.
    const payload = buildLearnerSessionPayload();
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    const firstTwenty = payload.ids.slice(0, 20);
    for (const id of firstTwenty) {
      store.applyRating(id, 'known');
      store.applyRating(id, 'known');
    }
    const window = store.selectSession(payload.ids, 10);
    // The window advances past the original 20 and every entry is a 21+ item.
    expect(window.every((id) => payload.ids.indexOf(id) >= 20)).toBe(true);
    expect(window).toHaveLength(10);
  });

  it('the client renders a corpus item beyond the original 20 with its image', () => {
    // Persist learned progress for the first 20 items so the client session
    // window fills with unseen items at manifest index >= 20; the client must
    // render the leading 21+ item with its deployed image.
    const payload = buildLearnerSessionPayload();
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);
    const firstTwenty = payload.ids.slice(0, 20);
    for (const id of firstTwenty) {
      store.applyRating(id, 'known');
      store.applyRating(id, 'known');
    }
    const raw = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;
    const root = sessionRoot(payload.ids, { ...payload.render });
    window.localStorage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, raw);

    initBasicVocabularySession(root);
    const simplified = root.querySelector('.basic-vocabulary-simplified');
    expect(simplified).not.toBeNull();
    const leadingId = payload.ids[20];
    expect(simplified?.textContent).toBe(
      manifest.rows.find((r) => r.learnerId === leadingId)!.simplified,
    );
    // The reached item carries its deployed image.
    expect(root.querySelector('img')).not.toBeNull();
  });

  it('a complete-field item reveals pinyin, japanese, and traditional answers', () => {
    // teacher-star-1-37e0eb213f0f (大家) carries pinyin, japanese, and
    // traditional; after reveal the answer container must hold all three.
    const payload = buildLearnerSessionPayload();
    const item = payload.ids.find((id) => id === 'teacher-star-1-37e0eb213f0f')!;
    const root = sessionRoot([item], { ...payload.render });
    initBasicVocabularySession(root);

    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    const answer = root.querySelector('.basic-vocabulary-answer');
    expect(answer).not.toBeNull();
    expect(answer?.querySelector('.basic-vocabulary-pinyin')).not.toBeNull();
    expect(answer?.querySelector('.basic-vocabulary-japanese')).not.toBeNull();
    expect(answer?.querySelector('.basic-vocabulary-traditional')).not.toBeNull();
    // Ratings remain operable after reveal.
    expect(root.querySelectorAll('[data-action="rate"]')).toHaveLength(3);
  });

  it('a partial-field item reveals only its truthful optional answers', () => {
    // teacher-learner-5762bc98cd920b67 (看) has pinyin + japanese but no
    // traditional; after reveal only those two appear — no fabricated field.
    const payload = buildLearnerSessionPayload();
    const item = payload.ids[0]; // 看, index 0
    const root = sessionRoot([item], { ...payload.render });
    initBasicVocabularySession(root);

    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    const answer = root.querySelector('.basic-vocabulary-answer');
    expect(answer).not.toBeNull();
    expect(answer?.querySelector('.basic-vocabulary-pinyin')).not.toBeNull();
    expect(answer?.querySelector('.basic-vocabulary-japanese')).not.toBeNull();
    expect(answer?.querySelector('.basic-vocabulary-traditional')).toBeNull();
    // Ratings remain operable after reveal.
    expect(root.querySelectorAll('[data-action="rate"]')).toHaveLength(3);
  });

  it('a missing-all-optional item reveals ratings but no blank answer container', () => {
    // 强调 (index 275) has only simplified + image metadata. After reveal the
    // answer container must not be created (no empty flex item / blank gap),
    // while the ratings row still appears and stays operable.
    const payload = buildLearnerSessionPayload();
    const item = payload.ids[275];
    const row = manifest.rows[275];
    expect(row.pinyin).toBeUndefined();
    expect(row.japanese).toBeUndefined();
    expect(row.traditional).toBeUndefined();
    const root = sessionRoot([item], { ...payload.render });
    initBasicVocabularySession(root);

    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    const answer = root.querySelector('.basic-vocabulary-answer');
    expect(answer).toBeNull();
    const ratings = root.querySelectorAll('[data-action="rate"]');
    expect(ratings).toHaveLength(3);
    // Rating an answer-less item still advances the session.
    (root.querySelector('[data-rating="known"]') as HTMLButtonElement).click();
    expect(root.textContent).toContain('今回の1語を完了しました');
  });

  it('a synthetic corpus change drives the production route payload instead of a hard-coded constant', () => {
    // Route counts must be derived from the loader corpus length, never a
    // hard-coded 1,582. Feed a real 3-item corpus through the same pure
    // production payload builder the route uses: totalCount/ids/render/first
    // must all track the input corpus.
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const synthetic = corpus.slice(0, 3);
    const payload = buildLearnerSessionPayloadFromItems(synthetic);
    expect(payload.totalCount).toBe(3);
    expect(payload.ids).toEqual(synthetic.map((item) => item.learnerId));
    expect(payload.ids).toHaveLength(3);
    for (const item of synthetic) {
      const r = payload.render[item.learnerId];
      expect(r).toBeDefined();
      expect(r.assetPath).toBe(item.illustration.assetPath);
    }
    expect(payload.first).toEqual({
      learnerId: synthetic[0].learnerId,
      simplified: synthetic[0].simplified,
      illustration: {
        assetPath: synthetic[0].illustration.assetPath,
        width: synthetic[0].illustration.width,
        height: synthetic[0].illustration.height,
        altJa: synthetic[0].illustration.altJa,
      },
    });

    // The client renders that derived total, not 1,582.
    const root = sessionRoot(payload.ids, { ...payload.render });
    initBasicVocabularySession(root);
    expect(root.querySelector<HTMLElement>('[data-total]')?.textContent).toContain('3');
    expect(root.querySelector('[data-progress]')?.textContent).toMatch(/^今回 0 \/ 3語/);
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
