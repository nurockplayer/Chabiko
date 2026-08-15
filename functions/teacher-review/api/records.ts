/**
 * GET /teacher-review/api/records
 *
 * Returns the current #360 launch review target (sanitized for the teacher),
 * the current-version decisions, the authenticated reviewer identity, and
 * progress. Fails closed on campaign drift. The payload never exposes raw
 * fingerprints, SHAs, `reviewStatus`, or engineering-only schema; stale
 * decisions (fingerprint mismatch) are never surfaced.
 */

import { resolveCampaignOr500 } from './resolve-campaign';
import {
  computeReviewProgress,
  isDecisionValidForRecord,
  type DecisionRecord,
} from '../../../src/domain/teacherReview';
import {
  TEACHER_REVIEW_ROLE,
  TEACHER_REVIEW_SCOPES,
  isEligibleReviewer,
} from './campaign-config';
import { createD1TeacherReviewStore } from './d1-store';
import { json } from './http';
import type { TeacherReviewPagesFunction } from './types';

export const onRequestGet: TeacherReviewPagesFunction = async (context) => {
  const resolved = await resolveCampaignOr500();
  if ('response' in resolved) return resolved.response;
  const resolution = resolved.resolution;

  const store = createD1TeacherReviewStore(context.env.TEACHER_REVIEW_DB);
  const stored = await store.listDecisions(
    resolution.campaignId,
    resolution.records.map((record) => record.id),
  );

  const validByRecord = new Map<string, DecisionRecord>();
  for (const decision of stored) {
    const record = resolution.records.find((r) => r.id === decision.recordId);
    if (record && isDecisionValidForRecord(decision, record)) {
      validByRecord.set(record.id, decision);
    }
  }

  const reviewer = context.data.reviewer;
  return json({
    campaign: {
      id: resolution.campaignId,
      reviewerRole: TEACHER_REVIEW_ROLE,
      scopes: [...TEACHER_REVIEW_SCOPES],
    },
    reviewer: {
      email: reviewer.email,
      name: reviewer.name,
      isEligibleReviewer: isEligibleReviewer(reviewer.email),
    },
    records: resolution.records.map((record) => {
      const decision = validByRecord.get(record.id);
      return {
        id: record.id,
        type: record.type,
        scenario: record.scenario,
        content: record.content,
        decision: decision
          ? {
              outcome: decision.outcome,
              note: decision.note,
              updatedAt: decision.updatedAt,
              reviewerName: decision.reviewerName,
            }
          : null,
      };
    }),
    progress: computeReviewProgress(resolution.records, stored),
  });
};
