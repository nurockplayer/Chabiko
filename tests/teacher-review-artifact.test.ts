// @vitest-environment node
/**
 * Repository-standard review artifact export (Issue #363).
 *
 * Follows docs/content/content-review-workflow.md §3.1/§3.3 required fields and
 * never equates review entry completion with PASS: any `needs_changes` keeps
 * the outcome `needs-changes` and lists blocked content; unreviewed/stale
 * records keep the entry incomplete; reviewer identity comes from the
 * persisted decisions.
 */

import { describe, expect, it } from 'vitest';
import {
  buildReviewArtifact,
  summarizeReviewArtifact,
  type CampaignRecord,
  type DecisionRecord,
  type ReviewArtifactParams,
} from '../src/domain/teacherReview';
import { resolveCurrentCampaign } from '../src/content/loadTeacherReviewCampaign';
import {
  TEACHER_REVIEW_ROLE,
  TEACHER_REVIEW_SCOPES,
} from '../functions/teacher-review/api/campaign-config';

async function loadRecords(): Promise<CampaignRecord[]> {
  const campaign = await resolveCurrentCampaign();
  return [...campaign.records];
}

function makeDecision(
  record: CampaignRecord,
  outcome: DecisionRecord['outcome'],
  note = '',
  overrides: Partial<DecisionRecord> = {},
): DecisionRecord {
  return {
    campaignId: 'issue-360-launch-v1',
    recordId: record.id,
    fingerprint: record.fingerprint,
    outcome,
    note,
    reviewerIdentity: 'Teacher Reviewer <teacher@example.com>',
    reviewerEmail: 'teacher@example.com',
    reviewerName: 'Teacher Reviewer',
    reviewerRole: TEACHER_REVIEW_ROLE,
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function params(
  records: CampaignRecord[],
  decisions: DecisionRecord[],
  generatedAt = '2026-08-15T12:00:00.000Z',
): ReviewArtifactParams {
  return {
    campaignId: 'issue-360-launch-v1',
    scopes: TEACHER_REVIEW_SCOPES,
    reviewerRole: TEACHER_REVIEW_ROLE,
    records,
    decisions,
    generatedAt,
  };
}

describe('summarizeReviewArtifact', () => {
  it('is incomplete when some records have no valid decision', async () => {
    const records = await loadRecords();
    const summary = summarizeReviewArtifact(params(records, []));
    expect(summary.reviewEntryComplete).toBe(false);
    expect(summary.overallOutcome).toBe('incomplete');
    expect(summary.blockedRecordIds).toHaveLength(records.length);
  });

  it('is accepted only when every current-version record is accepted', async () => {
    const records = await loadRecords();
    const decisions = records.map((record) => makeDecision(record, 'accepted'));
    const summary = summarizeReviewArtifact(params(records, decisions));
    expect(summary.reviewEntryComplete).toBe(true);
    expect(summary.overallOutcome).toBe('accepted');
    expect(summary.blockedRecordIds).toHaveLength(0);
  });

  it('stays needs-changes when any record needs changes and lists blocked content', async () => {
    const records = await loadRecords();
    const decisions = records.map((record, index) =>
      index === 0
        ? makeDecision(record, 'needs_changes', 'pinyin の声調を再確認')
        : makeDecision(record, 'accepted'),
    );
    const summary = summarizeReviewArtifact(params(records, decisions));
    expect(summary.reviewEntryComplete).toBe(true);
    expect(summary.overallOutcome).toBe('needs_changes');
    expect(summary.blockedRecordIds).toEqual([records[0].id]);
    expect(summary.unresolvedNotes).toContain('pinyin の声調を再確認');
  });

  it('never counts stale decisions', async () => {
    const records = await loadRecords();
    const stale = makeDecision(records[0], 'accepted');
    const staleDecision: DecisionRecord = { ...stale, fingerprint: 'old-fingerprint' };
    const summary = summarizeReviewArtifact(params(records, [staleDecision]));
    expect(summary.reviewEntryComplete).toBe(false);
    expect(summary.blockedRecordIds).toContain(records[0].id);
  });
});

describe('buildReviewArtifact', () => {
  it('emits every required artifact field', async () => {
    const records = await loadRecords();
    const decisions = records.map((record) => makeDecision(record, 'accepted'));
    const artifact = buildReviewArtifact(params(records, decisions));

    expect(artifact).toContain('## Review Artifact');
    expect(artifact).toContain('**Reviewer identity:** Teacher Reviewer <teacher@example.com>');
    expect(artifact).toContain(`**Reviewer role:** ${TEACHER_REVIEW_ROLE}`);
    expect(artifact).toContain('**Review date:** 2026-08-15');
    expect(artifact).toContain('**Overall review outcome:** accepted');
    expect(artifact).toContain('### Approval Scope');
    for (const scope of TEACHER_REVIEW_SCOPES) {
      expect(artifact).toContain(`| ${scope} | accepted |`);
    }
    expect(artifact).toContain('### Blocked Content');
    expect(artifact).toContain('None.');
    expect(artifact).toContain('### Unresolved Issues');
    // All 36 records appear in the per-record decision table.
    for (const record of records) {
      expect(artifact).toContain(`| ${record.id} |`);
    }
    // Fingerprints are the review version.
    expect(artifact).toContain(records[0].fingerprint);
  });

  it('does not equate incomplete entry with PASS', async () => {
    const records = await loadRecords();
    const artifact = buildReviewArtifact(params(records, []));
    expect(artifact).toContain('**Overall review outcome:** needs-changes');
    expect(artifact).toMatch(/NOT a PASS/);
  });

  it('records needs-changes records as blocked content and resolves issues from notes', async () => {
    const records = await loadRecords();
    const decisions = [
      makeDecision(records[0], 'needs_changes', '台湾の言い回しを確認'),
      ...records.slice(1).map((record) => makeDecision(record, 'accepted')),
    ];
    const artifact = buildReviewArtifact(params(records, decisions));
    expect(artifact).toContain('**Overall review outcome:** needs-changes');
    expect(artifact).toContain('### Blocked Content');
    expect(artifact).toContain(records[0].id);
    expect(artifact).toContain('台湾の言い回しを確認');
  });

  it('reflects only the valid decisions reviewer identity when a maintainer exports', async () => {
    const records = await loadRecords();
    const decisions = [makeDecision(records[0], 'accepted')];
    const artifact = buildReviewArtifact(params(records, decisions));
    // The exporter is irrelevant; the artifact carries the reviewer who decided.
    expect(artifact).toContain('Teacher Reviewer <teacher@example.com>');
    expect(artifact).toContain(`**Review entry:** Incomplete`);
  });
});

describe('Review date (Issue #363 Finding 2)', () => {
  it('derives the review date from the latest valid human decision, not the export time', async () => {
    const records = await loadRecords();
    const decisions = records.map((record, index) =>
      makeDecision(record, 'accepted', '', {
        updatedAt: `2026-08-${String(10 + (index % 5)).padStart(2, '0')}T12:00:00.000Z`,
      }),
    );
    // Export is performed several days later; the date must still be the
    // review completion date (the latest decision), not the export timestamp.
    const artifact = buildReviewArtifact(
      params(records, decisions, '2026-09-01T08:00:00.000Z'),
    );
    expect(artifact).toContain('**Review date:** 2026-08-14');
    expect(artifact).toContain('**Artifact generated at:** 2026-09-01T08:00:00.000Z');
  });

  it('is stable across repeated exports (export time never changes it)', async () => {
    const records = await loadRecords();
    const decisions = records.map((record) =>
      makeDecision(record, 'accepted', '', { updatedAt: '2026-08-20T09:30:00.000Z' }),
    );
    const first = buildReviewArtifact(params(records, decisions, '2026-08-21T10:00:00.000Z'));
    const later = buildReviewArtifact(params(records, decisions, '2026-08-25T10:00:00.000Z'));
    const dateOf = (artifact: string) =>
      artifact.match(/\*\*Review date:\*\* ([^\n]+)/)?.[1];
    expect(dateOf(first)).toBe('2026-08-20');
    expect(dateOf(later)).toBe('2026-08-20');
  });

  it('does not borrow the export timestamp as a human review date when incomplete', async () => {
    const records = await loadRecords();

    // No human decisions at all → no human review date exists.
    const empty = buildReviewArtifact(
      params(records, [], '2026-08-30T10:00:00.000Z'),
    );
    expect(empty).toContain('**Review date:** （未完成 — 尚無完成的人類 review 日期）');
    expect(empty).not.toContain('**Review date:** 2026-08-30');

    // Partial entry → the date is the latest valid decision date, never the
    // export timestamp.
    const partial = buildReviewArtifact(
      params(records, [makeDecision(records[0], 'accepted')], '2026-08-30T10:00:00.000Z'),
    );
    expect(partial).toContain('**Review date:** 2026-08-15');
    expect(partial).not.toContain('**Review date:** 2026-08-30');
  });

  it('excludes stale decisions when deriving the review date', async () => {
    const records = await loadRecords();
    const fresh = records.map((record, index) =>
      index === 0
        ? makeDecision(record, 'accepted', '', { updatedAt: '2026-08-10T00:00:00.000Z' })
        : makeDecision(record, 'accepted', '', { updatedAt: '2026-08-18T00:00:00.000Z' }),
    );
    // A stale decision dated later must not move the completion date.
    const stale = { ...fresh[0], fingerprint: 'old-fingerprint', updatedAt: '2026-08-25T00:00:00.000Z' };
    const artifact = buildReviewArtifact(params(records, [stale, ...fresh.slice(1)]));
    expect(artifact).toContain('**Review date:** 2026-08-18');
    expect(artifact).not.toContain('**Review date:** 2026-08-25');
  });
});
