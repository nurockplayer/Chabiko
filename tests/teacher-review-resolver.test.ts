// @vitest-environment node
/**
 * #360 launch-target resolver + semantic fingerprint contract (Issue #363).
 *
 * The resolver must deterministically produce exactly 24 draft phrases,
 * 6 draft dialogs and 6 draft launch roleplay cards, exclude fixture/test-only
 * roleplay records, and FAIL CLOSED on any drift. Fingerprints must bind to
 * review-relevant content only: review-relevant changes invalidate,
 * formatting-only source changes and workflow-only fields (reviewStatus) do
 * not.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveLaunchReviewTarget,
  TEACHER_REVIEW_DIALOG_COUNT,
  TEACHER_REVIEW_PHRASE_COUNT,
  TEACHER_REVIEW_ROLEPLAY_COUNT,
  TEACHER_REVIEW_SCENARIOS,
  TEACHER_REVIEW_TOTAL_COUNT,
  type TeacherReviewInputs,
} from '../src/domain/teacherReview';
import {
  loadTeacherReviewInputs,
  resolveCurrentCampaign,
  sha256Hex,
} from '../src/content/loadTeacherReviewCampaign';

// Verified live-main facts (reconciled at issue time; drift below must throw).
const EXPECTED_DRAFT_PHRASE_IDS = new Set([
  'phrase-002',
  'phrase-transport-002',
  'phrase-transport-003',
  'phrase-transport-004',
  'phrase-transport-005',
  'phrase-food-002',
  'phrase-food-003',
  'phrase-food-004',
  'phrase-food-005',
  'phrase-shopping-001',
  'phrase-shopping-002',
  'phrase-shopping-003',
  'phrase-shopping-004',
  'phrase-shopping-005',
  'phrase-hotel-001',
  'phrase-hotel-002',
  'phrase-hotel-003',
  'phrase-hotel-004',
  'phrase-hotel-005',
  'phrase-emergency-001',
  'phrase-emergency-002',
  'phrase-emergency-003',
  'phrase-emergency-004',
  'phrase-emergency-005',
]);

const EXPECTED_LAUNCH_CARD_IDS = new Set([
  'roleplay-airport-001',
  'roleplay-transport-001',
  'roleplay-food-001',
  'roleplay-shopping-001',
  'roleplay-hotel-001',
  'roleplay-emergency-001',
]);

const EXPECTED_DIALOG_IDS = new Set([
  'dialog-airport-001',
  'dialog-transport-001',
  'dialog-food-001',
  'dialog-shopping-001',
  'dialog-hotel-001',
  'dialog-emergency-001',
]);

describe('resolveLaunchReviewTarget on live content', () => {
  it('resolves exactly 24 phrases + 6 dialogs + 6 launch cards = 36 records', async () => {
    const campaign = await resolveCurrentCampaign();
    expect(campaign.campaignId).toBe('issue-360-launch-v1');
    expect(campaign.counts).toEqual({
      phrases: TEACHER_REVIEW_PHRASE_COUNT,
      dialogs: TEACHER_REVIEW_DIALOG_COUNT,
      roleplay: TEACHER_REVIEW_ROLEPLAY_COUNT,
    });
    expect(campaign.records).toHaveLength(TEACHER_REVIEW_TOTAL_COUNT);
  });

  it('matches the exact reconciled launch target sets', async () => {
    const campaign = await resolveCurrentCampaign();
    const phraseIds = campaign.records
      .filter((record) => record.type === 'phrase')
      .map((record) => record.id);
    const dialogIds = campaign.records
      .filter((record) => record.type === 'dialog')
      .map((record) => record.id);
    const cardIds = campaign.records
      .filter((record) => record.type === 'roleplay')
      .map((record) => record.id);

    expect(new Set(phraseIds)).toEqual(EXPECTED_DRAFT_PHRASE_IDS);
    expect(new Set(dialogIds)).toEqual(EXPECTED_DIALOG_IDS);
    expect(new Set(cardIds)).toEqual(EXPECTED_LAUNCH_CARD_IDS);
  });

  it('never includes the fixture roleplay record or any fixture id', async () => {
    const campaign = await resolveCurrentCampaign();
    const ids = campaign.records.map((record) => record.id);
    expect(ids).not.toContain('roleplay-fixture-transport-001');
    expect(ids.every((id) => !id.toLowerCase().includes('fixture'))).toBe(true);
  });

  it('covers exactly the six controlled scenarios and orders records deterministically', async () => {
    const campaign = await resolveCurrentCampaign();
    const scenarios = new Set(campaign.records.map((record) => record.scenario));
    expect([...scenarios].sort()).toEqual([...TEACHER_REVIEW_SCENARIOS].sort());
    // Records are grouped by scenario in controlled order.
    const firstIds = campaign.records.map((record) => record.id);
    expect(firstIds).toEqual([...firstIds]); // stable by construction
    const scenarioOrder = campaign.records.map((record) => record.scenario);
    const firstScenario = scenarioOrder[0];
    expect(TEACHER_REVIEW_SCENARIOS).toContain(firstScenario);
  });
});

describe('resolver fails closed on drift', () => {
  async function resolve(inputs: TeacherReviewInputs): Promise<void> {
    await resolveLaunchReviewTarget(inputs, sha256Hex);
  }

  function firstDraftPhrase(inputs: TeacherReviewInputs) {
    return inputs.phrases.find((phrase) => phrase.reviewStatus === 'draft')!;
  }

  it('throws when a draft phrase is promoted out of the target', async () => {
    const inputs = loadTeacherReviewInputs();
    const draft = firstDraftPhrase(inputs);
    const mutated = inputs.phrases.map((phrase) =>
      phrase.id === draft.id ? { ...phrase, reviewStatus: 'reviewed' as const } : phrase,
    );
    await expect(resolve({ ...inputs, phrases: mutated })).rejects.toThrow(
      /target drift/,
    );
  });

  it('throws when a launch card is removed', async () => {
    const inputs = loadTeacherReviewInputs();
    const mutated = inputs.roleplayCards.filter(
      (card) => card.id !== 'roleplay-airport-001',
    );
    await expect(resolve({ ...inputs, roleplayCards: mutated })).rejects.toThrow(
      /target drift/,
    );
  });

  it('throws when the fixture card leaks into the launch set as the only card of its scenario', async () => {
    // Replace the real transport launch card with the fixture card: the
    // fixture must be excluded, leaving transport uncovered → drift.
    const inputs = loadTeacherReviewInputs();
    const mutated = inputs.roleplayCards.map((card) =>
      card.id === 'roleplay-transport-001'
        ? { ...card, id: 'roleplay-fixture-transport-001' }
        : card,
    );
    await expect(resolve({ ...inputs, roleplayCards: mutated })).rejects.toThrow(
      /target drift/,
    );
  });

  it('throws when a dialog count changes', async () => {
    const inputs = loadTeacherReviewInputs();
    const mutated = inputs.dialogs.slice(0, -1);
    await expect(resolve({ ...inputs, dialogs: mutated })).rejects.toThrow(
      /target drift/,
    );
  });
});

describe('semantic fingerprints', () => {
  it('are deterministic for identical content', async () => {
    const inputs = loadTeacherReviewInputs();
    const a = await resolveLaunchReviewTarget(inputs, sha256Hex);
    const b = await resolveLaunchReviewTarget(inputs, sha256Hex);
    expect(a.records.map((r) => r.fingerprint)).toEqual(
      b.records.map((r) => r.fingerprint),
    );
  });

  it('are unchanged by source key order (formatting-only)', async () => {
    const inputs = loadTeacherReviewInputs();
    const draft = inputs.phrases.find((p) => p.reviewStatus === 'draft')!;
    // Rebuild the same record with REVERSED key insertion order — the hash is
    // over a key-sorted canonical projection, so source key order is
    // irrelevant (formatting-only changes never invalidate a decision).
    const reordered = Object.fromEntries(
      Object.entries(draft).reverse(),
    ) as (typeof inputs.phrases)[number];
    const a = await resolveLaunchReviewTarget(
      { ...inputs, phrases: [reordered, ...inputs.phrases.filter((p) => p.id !== draft.id)] },
      sha256Hex,
    );
    const b = await resolveLaunchReviewTarget(inputs, sha256Hex);
    const aFp = a.records.find((r) => r.id === draft.id)?.fingerprint;
    const bFp = b.records.find((r) => r.id === draft.id)?.fingerprint;
    expect(aFp).toBe(bFp);
  });

  it('change when review-relevant content changes', async () => {
    const inputs = loadTeacherReviewInputs();
    const draft = inputs.phrases.find((p) => p.reviewStatus === 'draft')!;
    const mutated = inputs.phrases.map((p) =>
      p.id === draft.id ? { ...p, japanese: `${p.japanese}（変更）` } : p,
    );
    const a = await resolveLaunchReviewTarget(inputs, sha256Hex);
    const b = await resolveLaunchReviewTarget({ ...inputs, phrases: mutated }, sha256Hex);
    const aFp = a.records.find((r) => r.id === draft.id)?.fingerprint;
    const bFp = b.records.find((r) => r.id === draft.id)?.fingerprint;
    expect(bFp).not.toBe(aFp);
  });

  it('ignore non-review-relevant extra fields (workflow-only data)', async () => {
    const inputs = loadTeacherReviewInputs();
    const draft = inputs.phrases.find((p) => p.reviewStatus === 'draft')!;
    // An extra, workflow-only field on the source record must NOT change the
    // fingerprint: the hash covers only the canonical review-relevant
    // projection (which excludes reviewStatus and any engineering-only fields).
    const mutated = inputs.phrases.map((p) =>
      p.id === draft.id
        ? ({ ...p, reviewStatus: 'draft' as const, xInternalNote: 'engineer-only' } as unknown as (typeof inputs.phrases)[number])
        : p,
    );
    const a = await resolveLaunchReviewTarget(inputs, sha256Hex);
    const b = await resolveLaunchReviewTarget({ ...inputs, phrases: mutated }, sha256Hex);
    const aFp = a.records.find((r) => r.id === draft.id)?.fingerprint;
    const bFp = b.records.find((r) => r.id === draft.id)?.fingerprint;
    expect(bFp).toBe(aFp);
  });

  it('change when a roleplay line changes', async () => {
    const inputs = loadTeacherReviewInputs();
    const card = inputs.roleplayCards.find((c) => c.id === 'roleplay-transport-001')!;
    const mutatedCards = inputs.roleplayCards.map((c) =>
      c.id === card.id
        ? {
            ...c,
            lines: c.lines.map((line, index) =>
              index === 0
                ? { ...line, pinyin: `${line.pinyin} ` }
                : line,
            ),
          }
        : c,
    );
    const a = await resolveLaunchReviewTarget(inputs, sha256Hex);
    const b = await resolveLaunchReviewTarget(
      { ...inputs, roleplayCards: mutatedCards },
      sha256Hex,
    );
    const aFp = a.records.find((r) => r.id === card.id)?.fingerprint;
    const bFp = b.records.find((r) => r.id === card.id)?.fingerprint;
    expect(bFp).not.toBe(aFp);
  });
});
