-- Teacher-review portal decisions (Issue #363).
--
-- One current decision per (campaign_id, record_id) — campaign-specific and
-- small. No audit history, no CMS tables. The semantic fingerprint binds the
-- decision to the exact reviewed record version: a review-relevant content
-- change produces a different fingerprint and the record becomes unreviewed
-- until re-reviewed. Only human decisions are ever written to this table.
--
-- Apply to the production D1 database:
--   wrangler d1 migrations apply teacher-review --remote
-- (or execute this file from the D1 console). See
-- docs/engineering/teacher-review-deployment-runbook.md.

CREATE TABLE IF NOT EXISTS teacher_review_decisions (
  campaign_id        TEXT NOT NULL,
  record_id          TEXT NOT NULL,
  fingerprint        TEXT NOT NULL,
  outcome            TEXT NOT NULL CHECK (outcome IN ('accepted', 'needs_changes')),
  note               TEXT NOT NULL DEFAULT '',
  reviewer_identity  TEXT NOT NULL,
  reviewer_email     TEXT NOT NULL,
  reviewer_name      TEXT NOT NULL,
  reviewer_role      TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  PRIMARY KEY (campaign_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_review_decisions_record
  ON teacher_review_decisions (record_id);
