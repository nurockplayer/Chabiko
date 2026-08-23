/**
 * Bounded #360 teacher-review campaign configuration (Issue #363).
 *
 * This is deployment/campaign configuration, NOT user management or RBAC.
 * The designated reviewer identity/role mapping and the atomic v1 scope set
 * live here so the Pages Functions and the artifact builder agree on one
 * contract. The Access team domain, application AUD tag, and the eligible
 * reviewer email allowlist are all environment variables (Cloudflare dashboard
 * settings), not source code.
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
 * Eligible reviewer allowlist (Issue #390).
 *
 * The eligible reviewer addresses are supplied entirely at deployment time
 * through the Pages production variable `TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS`
 * (comma-separated), never committed to the repository. Missing, empty, or
 * malformed configuration fails closed: no identity may write a decision, and
 * an Access-authenticated maintainer is never silently treated as an eligible
 * teacher reviewer. The Cloudflare Access edge policy and this API-side
 * allowlist remain independent defense-in-depth layers.
 */
export const TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS_VAR =
  'TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS';

export interface ReviewerAllowlistEnv {
  TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS?: string;
}

/** Conservative deterministic email shape: one `@`, no whitespace, dotted domain. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ReviewAllowlistResult =
  | { ok: true; emails: readonly string[] }
  | { ok: false; reason: string };

/** Parse the deployment allowlist into normalized (trimmed, lowercased) emails.
 * Empty entries, duplicate/case variants collapse deterministically, and any
 * empty or malformed entry rejects the whole configuration so it can never
 * widen access. */
export function readEligibleReviewerAllowlist(
  env: ReviewerAllowlistEnv,
): ReviewAllowlistResult {
  const raw = env.TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS;
  if (raw === undefined) {
    return {
      ok: false,
      reason: `${TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS_VAR} is not configured.`,
    };
  }
  if (raw.trim().length === 0) {
    return {
      ok: false,
      reason: `${TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS_VAR} is empty.`,
    };
  }
  const emails: string[] = [];
  for (const token of raw.split(',')) {
    const email = token.trim().toLowerCase();
    if (email.length === 0) {
      return {
        ok: false,
        reason: `${TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS_VAR} contains an empty entry.`,
      };
    }
    if (!EMAIL_PATTERN.test(email)) {
      return {
        ok: false,
        reason: `${TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS_VAR} contains a malformed email: '${email}'.`,
      };
    }
    emails.push(email);
  }
  return { ok: true, emails: [...new Set(emails)] };
}

/** Fail-closed eligibility check against a parsed allowlist. Normalization
 * (trim + lowercase) is identical to the allowlist reader. */
export function isEligibleReviewer(
  email: string,
  allowlist: readonly string[],
): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return allowlist.includes(normalized);
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
