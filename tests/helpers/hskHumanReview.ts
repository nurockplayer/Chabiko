import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ReviewableRow {
  id: string;
  simplified?: string;
  pinyin: string;
  japanese: string;
  hsk: { introducedAtLevel: number };
}

interface ReviewArtifact {
  reviewerIdentity: string;
  reviewerRole: string;
  reviewDate: string;
  approvalScope: string[];
  rows: Array<{ decision: string; reviewVersion: string; after: ReviewableRow }>;
}

const ledgerPath = resolve('data/hsk-import/hearmandarin-hsk-2025-v1/human-reviews.json');
export const hasHskHumanReviews = existsSync(ledgerPath);
const artifacts: ReviewArtifact[] = hasHskHumanReviews
  ? JSON.parse(readFileSync(ledgerPath, 'utf8')).artifacts
  : [];

/** Independent check that a production row has exact, attributed gloss evidence. */
export function expectedHskReviewStatus(row: ReviewableRow): 'draft' | 'reviewed' {
  let latest: ReviewArtifact['rows'][number] | undefined;
  for (const artifact of artifacts) {
    if (!artifact.reviewerIdentity.trim() || artifact.reviewerRole !== 'human-language-reviewer'
      || !/^\d{4}-\d{2}-\d{2}$/.test(artifact.reviewDate)
      || new Date(artifact.reviewDate).toISOString().slice(0, 10) !== artifact.reviewDate
      || JSON.stringify(artifact.approvalScope) !== JSON.stringify(['japanese-gloss', 'review-status'])) {
      throw new Error('Invalid human HSK review artifact');
    }
    for (const decision of artifact.rows) {
      if (decision.after.id === row.id && decision.decision) latest = decision;
    }
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([
    row.id, row.simplified, row.pinyin, row.hsk.introducedAtLevel, row.japanese,
  ])).digest('hex');
  return latest && ['OK', '修正'].includes(latest.decision) && latest.reviewVersion === fingerprint
    ? 'reviewed' : 'draft';
}
