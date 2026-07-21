import type { ReviewStatus } from './vocabulary';

export type IllustrationMimeType = 'image/webp' | 'image/png';

export interface IllustrationRights {
  basis: 'commissioned-for-chabiko';
  publicWebDisplay: true;
  staticAssetRedistribution: true;
  modificationScope: 'technical-only';
  attributionRequired: boolean;
  attributionText?: string;
  reuseOutsideChabiko: 'not-granted' | 'granted';
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
  rights: IllustrationRights;
  reviewStatus: ReviewStatus;
}
