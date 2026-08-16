/** Shared environment/data contract for the teacher-review Pages Functions
 * (Issue #363). `TEACHER_REVIEW_DB` is the D1 binding configured in the
 * Cloudflare dashboard (and wrangler.toml for local dev); Access settings are
 * bounded deployment variables. */

import type { AccessIdentity } from './access-jwt';

export interface TeacherReviewEnv {
  /** Cloudflare Access team domain, e.g. `https://<team>.cloudflareaccess.com`. */
  TEACHER_REVIEW_ACCESS_TEAM_DOMAIN?: string;
  /** Access application AUD tag for the /teacher-review application. */
  TEACHER_REVIEW_ACCESS_AUD?: string;
  /** Comma-separated eligible reviewer email allowlist (deployment-time). */
  TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS?: string;
  /** D1 database binding. */
  TEACHER_REVIEW_DB: D1Database;
}

/** Per-request data injected by the Access JWT middleware. */
export interface TeacherReviewData {
  reviewer: AccessIdentity;
  [key: string]: unknown;
}

export type TeacherReviewPagesFunction = PagesFunction<
  TeacherReviewEnv,
  string,
  TeacherReviewData
>;
