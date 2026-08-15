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

/**
 * The designated teacher performs the fixed #360 review under these explicit
 * repository-defined human roles. A single person may act in multiple roles,
 * but content-review-workflow.md requires each role's findings to be recorded
 * separately. Export therefore emits one repository-standard artifact section
 * per role group rather than attributing every scope to one generic role.
 *
 * `review-status` and `scope-compliance` are intentionally absent: those are
 * maintainer/mechanical publication concerns and are not silently approved by
 * the teacher portal.
 *
 * This mapping is frozen for campaign `issue-360-launch-v1`. If the role/scope
 * contract changes, create a new campaign id rather than reinterpreting stored
 * human decisions under a different authority model.
 */
export const TEACHER_REVIEW_ROLE_SCOPE_GROUPS = [
  {
    role: 'human-language-reviewer',
    scopes: ['learner-facing-strings'],
  },
  {
    role: 'human-script-verifier',
    scopes: ['script-provenance'],
  },
  {
    role: 'human-teaching-reviewer',
    scopes: ['teaching-accuracy', 'pronunciation-guidance'],
  },
  {
    role: 'human-regional-reviewer',
    scopes: ['regional-accuracy'],
  },
  {
    role: 'human-source-reviewer',
    scopes: ['source-license'],
  },
] as const;

/** Primary persisted role for the decision row; the complete frozen role/scope
 * mapping is recorded by the exported artifact bundle above. */
export const TEACHER_REVIEW_ROLE = TEACHER_REVIEW_ROLE_SCOPE_GROUPS[0].role;

export const TEACHER_REVIEW_SCOPES = TEACHER_REVIEW_ROLE_SCOPE_GROUPS.flatMap(
  (group) => [...group.scopes],
);

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
