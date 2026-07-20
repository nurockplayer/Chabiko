/** Controlled values for HSK standard version. */
export type HskStandardVersion = 'hsk-legacy-6-level' | 'hsk-3.0';

/** Controlled values for script form provenance. */
export type ScriptStatus = 'authored' | 'verified' | 'generated' | 'unavailable';

/** HSK-specific metadata attached to a Vocabulary record. */
export interface HskInfo {
  /** The versioned HSK standard this record belongs to. */
  standardVersion: HskStandardVersion;
  /** The level at which this vocabulary item is introduced (1–9). */
  introducedAtLevel: number;
  /** Original source label from the workbook, preserved for auditability. */
  sourceLevelLabel: string;
}

/**
 * Vocabulary record (non-HSK, Traditional-first contract).
 *
 * - `traditional` is required
 * - `traditionalStatus` is required
 * - `simplified` is optional
 * - All legacy fields (`kana`, `category`) are present
 */
export interface NonHskVocabulary {
  id: string;
  traditional: string;
  traditionalStatus: ScriptStatus;
  simplified?: string;
  simplifiedStatus?: ScriptStatus;
  pinyin: string;
  japanese: string;
  kana?: string;
  category?: string;
  similarityType?: string;
  toneNote?: string;
  caution?: string;
  travelScenario?: string;
  painPointTags?: string[];
  examples?: string[];
  source?: string;
  reviewStatus: string;
  hsk?: undefined;
}

/**
 * Vocabulary record (HSK, Simplified-first contract).
 *
 * - `simplified` + `simplifiedStatus` (`authored`/`verified`) are required
 * - `traditional` is optional; when present `traditionalStatus` must be `authored`/`verified`
 * - `kana` and `category` are optional
 */
export interface HskVocabulary {
  id: string;
  traditional?: string;
  traditionalStatus?: 'unavailable' | ScriptStatus;
  simplified: string;
  simplifiedStatus: 'authored' | 'verified';
  pinyin: string;
  japanese: string;
  kana?: string;
  category?: string;
  similarityType?: string;
  toneNote?: string;
  caution?: string;
  travelScenario?: string;
  painPointTags?: string[];
  examples?: string[];
  source: string;
  reviewStatus: string;
  hsk: HskInfo;
}

export type Vocabulary = NonHskVocabulary | HskVocabulary;
