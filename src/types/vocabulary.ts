export type ReviewStatus = 'draft' | 'reviewed' | 'published';

export type HskStandardVersion = 'hsk-legacy-6-level' | 'hsk-3.0';

export type IntroducedAtLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface HskInfo {
  standardVersion: HskStandardVersion;
  /** Integer level 1–9, non-empty sourceLevelLabel */
  introducedAtLevel: IntroducedAtLevel;
  sourceLevelLabel: string;
}

export type VocabularyExample = {
  traditional: string;
  traditionalStatus: 'authored' | 'verified' | 'generated';
  pinyin: string;
  japanese: string;
} & (
  | { simplified?: never; simplifiedStatus?: never }
  | { simplified?: never; simplifiedStatus: 'unavailable' }
  | { simplified: string; simplifiedStatus: 'authored' | 'verified' | 'generated' }
);

export interface SourceInfo {
  type: string;
  note?: string;
}
