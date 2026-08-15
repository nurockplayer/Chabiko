/**
 * Bounded #360 teacher-review campaign configuration (Issue #363).
 *
 * This is deployment/campaign configuration, NOT user management or RBAC.
 * The designated reviewer identity/role mapping and the atomic v1 scope set
 * live here so the Pages Functions and the artifact builder agree on one
 * contract. The Access team domain and application AUD tag are environment
 * variables (Cloudflare dashboard settings), not source code.
 *
 * The Access application allow policy restricts who can reach the route at the
 * edge; this config additionally encodes that only explicitly configured
 * eligible reviewer emails may WRITE decisions (a maintainer may inspect or
 * export, but must never be silently treated as a language/teaching reviewer).
 */

import {
  TEACHER_REVIEW_CAMPAIGN_ID,
  type DecisionRecord,
} from '../../../src/domain/teacherReview';

/** The workflow role under which the v1 atomic decision is recorded. */
export const TEACHER_REVIEW_ROLE = 'human-language-reviewer';

/**
 * The #360 review scope types covered by the atomic v1 decision. The decision
 * is intentionally atomic: if any required teacher-reviewed dimension needs
 * correction, the reviewer chooses `Needs changes`. Scope types follow
 * docs/content/content-review-workflow.md §6.
 */
export const TEACHER_REVIEW_SCOPES = [
  'learner-facing-strings',
  'script-provenance',
  'teaching-accuracy',
  'regional-accuracy',
  'source-license',
  'pronunciation-guidance',
  'review-status',
  'scope-compliance',
] as const;

/**
 * The designated #360 reviewer email(s). Bound to the deployment; the Cloudflare
 * Access application must allow exactly these (plus any maintainers who may
 * inspect/export). Writes are refused for identities not listed here.
 */
export const TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS = [
  // Deployment-configured: replace with the real designated reviewer email
  // before production use (documented in the runbook).
  'reviewer@example.com',
] as const;

export function isEligibleReviewer(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return (TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS as readonly string[]).some(
    (configured) => configured.trim().toLowerCase() === normalized,
  );
}

export interface AccessEnv {
  /** e.g. `https://<team>.cloudflareaccess.com` */
  TEACHER_REVIEW_ACCESS_TEAM_DOMAIN?: string;
  /** The Access application AUD tag for the /teacher-review application. */
  TEACHER_REVIEW_ACCESS_AUD?: string;
}

/** Fail-closed config read: missing Access settings make the API boundary
 * unusable (401) rather than trusting an unauthenticated request. */
export function readAccessConfig(env: AccessEnv): {
  ok: true;
  teamDomain: string;
  aud: string;
} | { ok: false; reason: string } {
  const teamDomain = env.TEACHER_REVIEW_ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.TEACHER_REVIEW_ACCESS_AUD?.trim();
  if (!teamDomain) {
    return { ok: false, reason: 'TEACHER_REVIEW_ACCESS_TEAM_DOMAIN is not configured.' };
  }
  if (!/^https:\/\//.test(teamDomain)) {
    return { ok: false, reason: 'TEACHER_REVIEW_ACCESS_TEAM_DOMAIN must be an https URL.' };
  }
  if (!aud) {
    return { ok: false, reason: 'TEACHER_REVIEW_ACCESS_AUD is not configured.' };
  }
  return { ok: true, teamDomain, aud };
}

/** Persisted identity for a decision, from the validated Access JWT. */
export function reviewerIdentityOf(
  email: string,
  name: string,
): Pick<
  DecisionRecord,
  'reviewerEmail' | 'reviewerName' | 'reviewerIdentity' | 'reviewerRole'
> {
  return {
    reviewerEmail: email,
    reviewerName: name,
    reviewerIdentity: `${name} <${email}>`,
    reviewerRole: TEACHER_REVIEW_ROLE,
  };
}

export const CAMPAIGN_ID = TEACHER_REVIEW_CAMPAIGN_ID;
