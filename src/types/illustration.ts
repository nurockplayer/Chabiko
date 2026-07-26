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

export interface Illustration {
  id: string;
  vocabularyId: string;
  assetPath: string;
  sourceChecksumSha256: string;
  width: number;
  height: number;
  mimeType: IllustrationMimeType;
  fileSizeBytes: number;
  altJa: string;
  rights: IllustrationRights | TeacherProvidedPendingRights;
  reviewStatus: ReviewStatus;
}
