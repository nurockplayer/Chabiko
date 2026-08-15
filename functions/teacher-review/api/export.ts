/**
 * GET /teacher-review/api/export
 *
 * Exports repository-standard #360 human-review evidence only after every
 * current-version record has an explicit human decision. The designated
 * reviewer may act in multiple repository-defined roles, but the workflow
 * requires each role's findings to be recorded separately, so the export is a
 * bundle of role-scoped artifact sections rather than one over-broad approval.
 */

import { resolveCampaignOr500 } from './resolve-campaign';
import {
  buildReviewArtifact,
  computeReviewProgress,
} from '../../../src/domain/teacherReview';
import { TEACHER_REVIEW_ROLE_SCOPE_GROUPS } from './campaign-config';
import { createD1TeacherReviewStore } from './d1-store';
import { json } from './http';
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

  const progress = computeReviewProgress(resolution.records, decisions);
  if (progress.unreviewed > 0) {
    return json(
      {
        error:
          'Review entry is incomplete. Export is available only after every current-version record has a human decision.',
        unreviewed: progress.unreviewed,
      },
      409,
    );
  }

  const generatedAt = new Date().toISOString();
  const sections = TEACHER_REVIEW_ROLE_SCOPE_GROUPS.map((group) =>
    buildReviewArtifact({
      campaignId: resolution.campaignId,
      scopes: group.scopes,
      reviewerRole: group.role,
      records: resolution.records,
      decisions,
      generatedAt,
    }),
  );

  const artifact = [
    '# #360 Human Review Artifact Bundle',
    '',
    'The same designated human reviewer performed this atomic campaign review under the explicit repository-defined roles below. Each role is recorded separately as required by the content review workflow.',
    '',
    ...sections,
  ].join('\n');

  return new Response(artifact, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${resolution.campaignId}-review-artifact.md"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
