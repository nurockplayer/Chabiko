import type { ReviewStatus } from './vocabulary';

export type IllustrationMimeType = 'image/webp' | 'image/png';

/** Cleared illustration rights — formal permission granted. */
export interface IllustrationRights {
  basis: 'commissioned-for-chabiko';
  publicWebDisplay: true;
  staticAssetRedistribution: true;
  modificationScope: 'technical-only';
  attributionRequired: boolean;
  attributionText?: string;
  reuseOutsideChabiko: 'not-granted' | 'granted';
}

/** Provisional pending-rights draft — rights verification not yet complete.
 * Only valid when the illustration reviewStatus is 'draft'. */
export interface TeacherProvidedPendingRights {
  status: 'pending';
  source: 'teacher-provided';
  note: string;
}

/** Fields common to all illustration variants. */
interface IllustrationBase {
  id: string;
  vocabularyId: string;
  assetPath: string;
  sourceChecksumSha256: string;
  width: number;
  height: number;
  mimeType: IllustrationMimeType;
  fileSizeBytes: number;
  altJa: string;
}

/** Illustration whose rights are a discriminated union on reviewStatus.
 *
 * - `reviewStatus: 'draft'` permits either pending or cleared rights.
 * - `reviewStatus: 'reviewed' | 'published'` requires cleared rights only.
 */
export type Illustration = IllustrationBase & (
  | {
      reviewStatus: 'draft';
      rights: IllustrationRights | TeacherProvidedPendingRights;
    }
  | {
      reviewStatus: Exclude<ReviewStatus, 'draft'>;
      rights: IllustrationRights;
    }
);
