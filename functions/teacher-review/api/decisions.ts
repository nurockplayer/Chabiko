/**
 * POST /teacher-review/api/decisions
 *
 * Upsert ONE human decision for a current campaign record. The server resolves
 * the record and its semantic fingerprint from the bundled content — a
 * client-supplied fingerprint or arbitrary record payload is never trusted.
 * Only an explicitly configured eligible reviewer may write; `needs_changes`
 * requires a non-empty note.
 */

import { resolveCampaignOr500 } from './resolve-campaign';
import {
  validateDecisionInput,
  type DecisionRecord,
} from '../../../src/domain/teacherReview';
import { isEligibleReviewer, readEligibleReviewerAllowlist, reviewerIdentityOf } from './campaign-config';
import { createD1TeacherReviewStore } from './d1-store';
import { json } from './http';
import type { TeacherReviewPagesFunction } from './types';

export const onRequestPost: TeacherReviewPagesFunction = async (context) => {
  const resolved = await resolveCampaignOr500();
  if ('response' in resolved) return resolved.response;
  const resolution = resolved.resolution;

  const reviewer = context.data.reviewer;

  const allowlist = readEligibleReviewerAllowlist(context.env);
  if (!allowlist.ok) {
    return json(
      {
        error: `Eligible reviewer configuration error: ${allowlist.reason}`,
      },
      500,
    );
  }
  if (!isEligibleReviewer(reviewer.email, allowlist.emails)) {
    return json(
      {
        error:
          'Authenticated identity is not an eligible #360 teacher reviewer; decisions cannot be recorded.',
      },
      403,
    );
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const validation = validateDecisionInput(body, resolution.records);
  if (!validation.ok) {
    return json({ error: validation.error }, 400);
  }

  const record = resolution.records.find(
    (r) => r.id === validation.decision.recordId,
  );
  if (!record) {
    return json({ error: `Unknown review record '${validation.decision.recordId}'.` }, 400);
  }

  const decision: DecisionRecord = {
    campaignId: resolution.campaignId,
    recordId: record.id,
    fingerprint: record.fingerprint,
    outcome: validation.decision.outcome,
    note: validation.decision.note,
    ...reviewerIdentityOf(reviewer.email, reviewer.name),
    updatedAt: new Date().toISOString(),
  };

  const store = createD1TeacherReviewStore(context.env.TEACHER_REVIEW_DB);
  await store.upsertDecision(decision);

  return json({
    ok: true,
    decision: {
      recordId: decision.recordId,
      outcome: decision.outcome,
      note: decision.note,
      updatedAt: decision.updatedAt,
      reviewerName: decision.reviewerName,
    },
  });
};
