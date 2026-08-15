// @vitest-environment node
/**
 * Decision validation + D1 persistence adapter + staleness (Issue #363).
 *
 * `needs_changes` requires a non-empty note; `accepted` allows an optional
 * note; unknown records/outcomes and oversized notes are rejected. The store
 * persists one current decision per (campaign_id, record_id), and a decision
 * only counts while its semantic fingerprint still matches the current record.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  computeReviewProgress,
  isDecisionValidForRecord,
  REVIEWER_NOTE_MAX_LENGTH,
  validateDecisionInput,
  type CampaignRecord,
  type DecisionRecord,
} from '../src/domain/teacherReview';
import { resolveCurrentCampaign } from '../src/content/loadTeacherReviewCampaign';
import {
  createD1TeacherReviewStore,
  type D1DatabaseLike,
  type DecisionRow,
} from '../functions/teacher-review/api/d1-store';

async function loadRecords(): Promise<CampaignRecord[]> {
  const campaign = await resolveCurrentCampaign();
  return [...campaign.records];
}

function recordOf(records: CampaignRecord[]): CampaignRecord {
  return records.find((record) => record.type === 'phrase')!;
}

function makeDecision(
  record: CampaignRecord,
  overrides: Partial<DecisionRecord> = {},
): DecisionRecord {
  return {
    campaignId: 'issue-360-launch-v1',
    recordId: record.id,
    fingerprint: record.fingerprint,
    outcome: 'accepted',
    note: '',
    reviewerIdentity: 'Teacher Reviewer <reviewer@example.com>',
    reviewerEmail: 'reviewer@example.com',
    reviewerName: 'Teacher Reviewer',
    reviewerRole: 'human-language-reviewer',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateDecisionInput', () => {
  let records: CampaignRecord[];
  beforeAll(async () => {
    records = await loadRecords();
  });

  it('rejects a missing or non-string recordId', () => {
    expect(validateDecisionInput({ outcome: 'accepted' }, records).ok).toBe(false);
    expect(
      validateDecisionInput({ recordId: '', outcome: 'accepted' }, records).ok,
    ).toBe(false);
  });

  it('rejects an unknown recordId', () => {
    const result = validateDecisionInput(
      { recordId: 'roleplay-fixture-transport-001', outcome: 'accepted' },
      records,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid outcome', () => {
    const result = validateDecisionInput(
      { recordId: records[0].id, outcome: 'approved' },
      records,
    );
    expect(result.ok).toBe(false);
  });

  it('requires a non-empty note for needs_changes', () => {
    const empty = validateDecisionInput(
      { recordId: records[0].id, outcome: 'needs_changes', note: '   ' },
      records,
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatch(/non-empty/);

    const withNote = validateDecisionInput(
      { recordId: records[0].id, outcome: 'needs_changes', note: 'pinyin を確認' },
      records,
    );
    expect(withNote.ok).toBe(true);
  });

  it('accepts an optional note for accepted', () => {
    expect(
      validateDecisionInput({ recordId: records[0].id, outcome: 'accepted' }, records).ok,
    ).toBe(true);
    expect(
      validateDecisionInput(
        { recordId: records[0].id, outcome: 'accepted', note: 'OK' },
        records,
      ).ok,
    ).toBe(true);
  });

  it('rejects an oversized note', () => {
    const result = validateDecisionInput(
      {
        recordId: records[0].id,
        outcome: 'needs_changes',
        note: 'x'.repeat(REVIEWER_NOTE_MAX_LENGTH + 1),
      },
      records,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/);
  });

  it('normalizes the note to a trimmed string', () => {
    const result = validateDecisionInput(
      { recordId: records[0].id, outcome: 'accepted', note: '  OK  ' },
      records,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.decision.note).toBe('OK');
  });
});

describe('staleness and progress', () => {
  it('a decision with a mismatched fingerprint is stale and does not count', async () => {
    const records = await loadRecords();
    const record = recordOf(records);
    const fresh = makeDecision(record);
    expect(isDecisionValidForRecord(fresh, record)).toBe(true);

    const stale = makeDecision(record, { fingerprint: 'outdated-fingerprint' });
    expect(isDecisionValidForRecord(stale, record)).toBe(false);

    const progress = computeReviewProgress(records, [fresh, stale]);
    expect(progress.decided).toBe(1);
    expect(progress.accepted).toBe(1);
  });

  it('a decision from another campaign never counts', async () => {
    const records = await loadRecords();
    const record = recordOf(records);
    const otherCampaign = makeDecision(record, { campaignId: 'other-campaign' });
    expect(isDecisionValidForRecord(otherCampaign, record)).toBe(false);
  });
});

describe('D1 store adapter', () => {
  /** Minimal in-memory D1 fake that executes the adapter's SQL. */
  function createFakeD1(): D1DatabaseLike & { rows: DecisionRow[] } {
    const rows: DecisionRow[] = [];
    return {
      rows,
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async all<T>(): Promise<{ results: T[] }> {
                const placeholders = values.length;
                // Only the SELECT statement is exercised here; the upsert path
                // goes through `run`. The WHERE clause binds campaign + ids.
                if (!/SELECT/i.test(sql)) return { results: [] as T[] };
                const campaignId = String(values[0]);
                const ids = values.slice(1).map(String);
                const results = rows
                  .filter(
                    (row) =>
                      row.campaign_id === campaignId && ids.includes(row.record_id),
                  )
                  .map((row) => ({ ...row }));
                // Placeholder sanity: every id placeholder is bound.
                if (placeholders < 1) throw new Error('no binds');
                return { results: results as T[] };
              },
              async run(): Promise<unknown> {
                const [campaignId, recordId, fingerprint, outcome, note, reviewerIdentity, reviewerEmail, reviewerName, reviewerRole, updatedAt] = values.map(String);
                const existing = rows.findIndex(
                  (row) =>
                    row.campaign_id === campaignId && row.record_id === recordId,
                );
                const row: DecisionRow = {
                  campaign_id: campaignId,
                  record_id: recordId,
                  fingerprint,
                  outcome,
                  note,
                  reviewer_identity: reviewerIdentity,
                  reviewer_email: reviewerEmail,
                  reviewer_name: reviewerName,
                  reviewer_role: reviewerRole,
                  updated_at: updatedAt,
                };
                if (existing === -1) rows.push(row);
                else rows[existing] = row;
                return {};
              },
            };
          },
        };
      },
    };
  }

  it('upserts one decision per (campaign, record) and lists it back', async () => {
    const records = await loadRecords();
    const record = recordOf(records);
    const fake = createFakeD1();
    const store = createD1TeacherReviewStore(fake);

    const decision = makeDecision(record, { outcome: 'needs_changes', note: '確認事項' });
    await store.upsertDecision(decision);
    await store.upsertDecision(decision); // idempotent upsert

    expect(fake.rows).toHaveLength(1);
    const listed = await store.listDecisions(decision.campaignId, [record.id]);
    expect(listed).toHaveLength(1);
    expect(listed[0].recordId).toBe(record.id);
    expect(listed[0].outcome).toBe('needs_changes');
    expect(listed[0].note).toBe('確認事項');
    expect(listed[0].reviewerEmail).toBe('reviewer@example.com');
  });

  it('upsert replaces the previous decision for the same record', async () => {
    const records = await loadRecords();
    const record = recordOf(records);
    const fake = createFakeD1();
    const store = createD1TeacherReviewStore(fake);

    await store.upsertDecision(makeDecision(record, { outcome: 'needs_changes', note: 'v1' }));
    await store.upsertDecision(makeDecision(record, { outcome: 'accepted', note: 'v2' }));

    const listed = await store.listDecisions('issue-360-launch-v1', [record.id]);
    expect(listed).toHaveLength(1);
    expect(listed[0].outcome).toBe('accepted');
    expect(listed[0].note).toBe('v2');
  });

  it('returns no decisions for an empty id set', async () => {
    const fake = createFakeD1();
    const store = createD1TeacherReviewStore(fake);
    await expect(store.listDecisions('issue-360-launch-v1', [])).resolves.toEqual([]);
  });
});
