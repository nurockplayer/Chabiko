export type UnicodeRecordCategory =
  | 'exact-same-scalar'
  | 'traditional-simplified'
  | 'compatibility-normalization'
  | 'variation-sequence'
  | 'visual-similarity';

export type UnicodeReviewStatus =
  | 'mechanical'
  | 'provisional'
  | 'reviewed'
  | 'rejected'
  | 'unsupported';

export type UnicodeSourceLanguage = 'zh-Hant' | 'zh-Hans' | 'ja' | 'mixed';

export interface UnicodeRecordProvenance {
  readonly method: 'mechanical-extraction' | 'deterministic-rendering';
  readonly sourceManifestId: string;
  readonly sourceManifestSha256: string;
  readonly unicodeVersion: string;
}

export interface UnicodeRecord {
  readonly id: string;
  readonly category: UnicodeRecordCategory;
  readonly leftText: string;
  readonly leftScalars: readonly number[];
  readonly leftNfcScalars: readonly number[];
  readonly leftNfkcScalars: readonly number[];
  readonly rightText: string;
  readonly rightScalars: readonly number[];
  readonly rightNfcScalars: readonly number[];
  readonly rightNfkcScalars: readonly number[];
  readonly evidenceRefs: readonly string[];
  readonly renderingEnvironmentRefs: readonly string[];
  readonly provenance: UnicodeRecordProvenance;
  readonly reviewStatus: UnicodeReviewStatus;
  readonly learnerEligible: boolean;
  readonly cautionJa: string | null;
}

export interface UnicodeSourceEvidence {
  readonly id: string;
  readonly sourceId: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly jsonPointer: string;
  readonly field: string;
  readonly language: UnicodeSourceLanguage;
  readonly scriptStatus: string | null;
  readonly text: string;
  readonly scalars: readonly number[];
  readonly nfcScalars: readonly number[];
  readonly nfkcScalars: readonly number[];
}

export interface UnicodeScalarOccurrence {
  readonly evidenceRef: string;
  readonly scalarIndex: number;
  readonly variationSelector?: number;
}

export interface UnicodeScalarInventoryRow {
  readonly id: string;
  readonly scalar: number;
  readonly hex: string;
  readonly character: string;
  readonly unicodeName: string;
  readonly firstOccurrenceRef: string;
  readonly occurrences: readonly UnicodeScalarOccurrence[];
}
