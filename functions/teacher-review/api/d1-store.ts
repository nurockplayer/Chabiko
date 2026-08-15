/**
 * D1 persistence adapter for teacher-review decisions (Issue #363).
 *
 * One current decision per `(campaign_id, record_id)` — no audit history, no
 * CMS tables. The schema lives in `d1/migrations/0001_teacher_review_decisions.sql`;
 * this adapter is the only runtime writer to D1, and it writes HUMAN decisions
 * only. The structural `D1DatabaseLike` type lets tests exercise the SQL
 * boundary with a fake without pulling Workers types into the vitest config.
 */

import type {
  DecisionRecord,
  TeacherReviewStore,
} from '../../../src/domain/teacherReview';

/** Minimal structural surface of the Workers `D1Database` the adapter uses. */
export interface D1DatabaseLike {
  prepare(sql: string): {
    bind(...values: unknown[]): D1PreparedStatementLike;
  };
}

export interface D1PreparedStatementLike {
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface DecisionRow {
  campaign_id: string;
  record_id: string;
  fingerprint: string;
  outcome: string;
  note: string;
  reviewer_identity: string;
  reviewer_email: string;
  reviewer_name: string;
  reviewer_role: string;
  updated_at: string;
}

export function rowToDecision(row: DecisionRow): DecisionRecord {
  return {
    campaignId: row.campaign_id,
    recordId: row.record_id,
    fingerprint: row.fingerprint,
    outcome: row.outcome === 'needs_changes' ? 'needs_changes' : 'accepted',
    note: row.note,
    reviewerIdentity: row.reviewer_identity,
    reviewerEmail: row.reviewer_email,
    reviewerName: row.reviewer_name,
    reviewerRole: row.reviewer_role,
    updatedAt: row.updated_at,
  };
}

/** Chunk ids so the `IN (...)` bind list stays under D1's 100-bind limit. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function createD1TeacherReviewStore(db: D1DatabaseLike): TeacherReviewStore {
  return {
    async listDecisions(campaignId, recordIds) {
      if (recordIds.length === 0) return [];
      const rows: DecisionRow[] = [];
      for (const ids of chunk(recordIds, 90)) {
        const placeholders = ids.map(() => '?').join(',');
        const statement = db
          .prepare(
            `SELECT campaign_id, record_id, fingerprint, outcome, note,
                    reviewer_identity, reviewer_email, reviewer_name,
                    reviewer_role, updated_at
             FROM teacher_review_decisions
             WHERE campaign_id = ? AND record_id IN (${placeholders})`,
          )
          .bind(campaignId, ...ids);
        const result = await statement.all<DecisionRow>();
        rows.push(...result.results);
      }
      return rows.map(rowToDecision);
    },

    async upsertDecision(decision) {
      await db
        .prepare(
          `INSERT INTO teacher_review_decisions
             (campaign_id, record_id, fingerprint, outcome, note,
              reviewer_identity, reviewer_email, reviewer_name, reviewer_role, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (campaign_id, record_id) DO UPDATE SET
             fingerprint = excluded.fingerprint,
             outcome = excluded.outcome,
             note = excluded.note,
             reviewer_identity = excluded.reviewer_identity,
             reviewer_email = excluded.reviewer_email,
             reviewer_name = excluded.reviewer_name,
             reviewer_role = excluded.reviewer_role,
             updated_at = excluded.updated_at`,
        )
        .bind(
          decision.campaignId,
          decision.recordId,
          decision.fingerprint,
          decision.outcome,
          decision.note,
          decision.reviewerIdentity,
          decision.reviewerEmail,
          decision.reviewerName,
          decision.reviewerRole,
          decision.updatedAt,
        )
        .run();
    },
  };
}
