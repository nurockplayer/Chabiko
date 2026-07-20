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

export interface VocabularyBase {
  id: string;
  pinyin: string;
  japanese: string;
  similarityType?: string;
  toneNote?: string;
  caution?: string;
  travelScenario?: string;
  painPointTags?: string[];
  examples?: VocabularyExample[];
  reviewStatus: ReviewStatus;
}

/** Legacy Traditional-first vocabulary record (non-HSK) with both script forms. */
export interface LegacyVocabulary extends VocabularyBase {
  hsk?: never;
  traditional: string;
  traditionalStatus: 'authored' | 'verified' | 'generated';
  simplified: string;
  simplifiedStatus: 'authored' | 'verified' | 'generated';
  kana: string;
  category: string;
  source?: SourceInfo;
}

/** Non-HSK record with only Traditional form (Simplified confirmed unavailable). */
export interface LegacyVocabularyNoSimplified extends VocabularyBase {
  hsk?: never;
  traditional: string;
  traditionalStatus: 'authored' | 'verified' | 'generated';
  simplified?: never;
  simplifiedStatus?: 'unavailable';
  kana: string;
  category: string;
  source?: SourceInfo;
}

/** HSK Simplified-first vocabulary record. */
export interface HskVocabulary extends VocabularyBase {
  hsk: HskInfo;
  simplified: string;
  simplifiedStatus: 'authored' | 'verified';
  traditional?: never;
  traditionalStatus?: 'unavailable';
  kana?: string;
  category?: string;
  source: SourceInfo;
}

/** HSK record with reviewed Traditional form. */
export interface HskVocabularyWithTraditional extends VocabularyBase {
  hsk: HskInfo;
  simplified: string;
  simplifiedStatus: 'authored' | 'verified';
  traditional: string;
  traditionalStatus: 'authored' | 'verified';
  kana?: string;
  category?: string;
  source: SourceInfo;
}

export type HskVocabularyType = HskVocabulary | HskVocabularyWithTraditional;

export type Vocabulary = LegacyVocabulary | LegacyVocabularyNoSimplified | HskVocabularyType;

export interface VocabularyBundle {
  vocabulary: Vocabulary[];
}
