// @vitest-environment node
/**
 * Export endpoint contract (Issue #363, Findings 1 & 2).
 *
 * Export is only available after every current-version record has an explicit
 * human decision (incomplete entry → 409, never an approval/completion). The
 * exported artifact is a bundle with one section per configured repository-
 * defined human reviewer role, and the Review date comes from the valid human
 * decisions — never the export timestamp.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionRecord } from '../src/domain/teacherReview';
import { resolveCurrentCampaign } from '../src/content/loadTeacherReviewCampaign';
import {
  TEACHER_REVIEW_ROLE_SCOPE_GROUPS,
} from '../functions/teacher-review/api/campaign-config';
import type { TeacherReviewEnv, TeacherReviewData } from '../functions/teacher-review/api/types';

const mocks = vi.hoisted(() => ({
  resolveCampaignOr500: vi.fn(),
  createStore: vi.fn(),
}));

vi.mock('../functions/teacher-review/api/resolve-campaign', () => ({
  resolveCampaignOr500: mocks.resolveCampaignOr500,
}));
vi.mock('../functions/teacher-review/api/d1-store', () => ({
  createD1TeacherReviewStore: mocks.createStore,
}));

// Imported after the mocks are registered.
import { onRequestGet } from '../functions/teacher-review/api/export';

function makeDecision(recordId: string, fingerprint: string, updatedAt: string): DecisionRecord {
  return {
    campaignId: 'issue-360-launch-v1',
    recordId,
    fingerprint,
    outcome: 'accepted',
    note: '',
    reviewerIdentity: 'Teacher Reviewer <teacher@example.com>',
    reviewerEmail: 'teacher@example.com',
    reviewerName: 'Teacher Reviewer',
    reviewerRole: 'human-language-reviewer',
    updatedAt,
  };
}

function contextWithStore(listDecisions: (campaignId: string, ids: readonly string[]) => Promise<DecisionRecord[]>) {
  mocks.createStore.mockReturnValue({
    listDecisions,
    upsertDecision: vi.fn(),
  });
  return {
    env: { TEACHER_REVIEW_DB: {} } as unknown as TeacherReviewEnv,
    data: {} as TeacherReviewData,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.resolveCampaignOr500.mockReset();
  mocks.createStore.mockReset();
});

describe('GET /teacher-review/api/export', () => {
  it('returns 409 when the review entry is incomplete (no approval manufactured)', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });

    // Only some records decided → unreviewed > 0.
    const decisions = campaign.records
      .slice(0, 10)
      .map((record) => makeDecision(record.id, record.fingerprint, '2026-08-15T00:00:00.000Z'));
    const context = contextWithStore(async () => decisions);

    const response = await onRequestGet(context as Parameters<typeof onRequestGet>[0]);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/incomplete/i);
  });

  it('emits one artifact section per configured human reviewer role when complete', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const decisions = campaign.records.map((record) =>
      makeDecision(record.id, record.fingerprint, '2026-08-15T00:00:00.000Z'),
    );
    const context = contextWithStore(async () => decisions);

    const response = await onRequestGet(context as Parameters<typeof onRequestGet>[0]);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('# #360 Human Review Artifact Bundle');
    for (const group of TEACHER_REVIEW_ROLE_SCOPE_GROUPS) {
      expect(text).toContain(`**Reviewer role:** ${group.role}`);
    }
    // Each section is a separate artifact with its own scoped approval table.
    expect(text).toContain('| learner-facing-strings | accepted |');
    expect(text).toContain('| script-provenance | accepted |');
    // The exported Review date derives from the decisions, not the export time.
    expect(text).toContain('**Review date:** 2026-08-15');
  });

  it('stale decisions keep the entry incomplete (export blocked)', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    // All records decided, but one with a STALE fingerprint → that record is
    // unreviewed under the current version, so export must fail closed.
    const decisions = campaign.records.map((record, index) =>
      makeDecision(
        record.id,
        index === 0 ? 'stale-fingerprint' : record.fingerprint,
        '2026-08-15T00:00:00.000Z',
      ),
    );
    const context = contextWithStore(async () => decisions);

    const response = await onRequestGet(context as Parameters<typeof onRequestGet>[0]);
    expect(response.status).toBe(409);
  });
});
