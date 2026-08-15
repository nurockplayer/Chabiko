/**
 * GET /teacher-review/api/export
 *
 * Returns the repository-standard #360 human-review artifact (markdown) built
 * from all current records, the current-version decisions, and the configured
 * scope set. Follows docs/content/content-review-workflow.md §3.1/§3.3 and
 * never equates review entry completion with PASS: any `needs_changes` record
 * keeps the overall outcome `needs-changes` and is listed as blocked content.
 * Reviewer identity comes from the persisted decisions (validated Access
 * identity), never from the exporter.
 */

import { resolveCampaignOr500 } from './resolve-campaign';
import { buildReviewArtifact } from '../../../src/domain/teacherReview';
import {
  TEACHER_REVIEW_ROLE,
  TEACHER_REVIEW_SCOPES,
} from './campaign-config';
import { createD1TeacherReviewStore } from './d1-store';
import type { TeacherReviewPagesFunction } from './types';

export const onRequestGet: TeacherReviewPagesFunction = async (context) => {
  const resolved = await resolveCampaignOr500();
  if ('response' in resolved) return resolved.response;
  const resolution = resolved.resolution;

  const store = createD1TeacherReviewStore(context.env.TEACHER_REVIEW_DB);
  const decisions = await store.listDecisions(
    resolution.campaignId,
    resolution.records.map((record) => record.id),
  );

  const artifact = buildReviewArtifact({
    campaignId: resolution.campaignId,
    scopes: TEACHER_REVIEW_SCOPES,
    reviewerRole: TEACHER_REVIEW_ROLE,
    records: resolution.records,
    decisions,
    generatedAt: new Date().toISOString(),
  });

  return new Response(artifact, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${resolution.campaignId}-review-artifact.md"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
