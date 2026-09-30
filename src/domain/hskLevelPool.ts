import type { HskVocabularyType } from '../types/vocabulary';

export type HskPoolStatus = 'available' | 'partial' | 'unavailable';

export interface HskLevelPool {
  readonly level: 1 | 2 | 3 | 4;
  readonly status: HskPoolStatus;
  readonly fullRange: readonly HskVocabularyType[];
  readonly newWords: readonly HskVocabularyType[];
  readonly counts: {
    readonly fullRange: number;
    readonly newWords: number;
    readonly expectedFullRange: number;
    readonly expectedNewWords: number;
  };
  readonly missingEvidence: readonly string[];
}

export type HskLevelPools = readonly HskLevelPool[];

const LEVELS = [1, 2, 3, 4] as const;

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

/** Derive cumulative and newly introduced pools without changing source order. */
export function buildHskLevelPools(
  admittedEntries: readonly HskVocabularyType[],
  expectedNewWordCounts: Readonly<Record<1 | 2 | 3 | 4, number>>,
  sourceDiagnostic?: string,
): HskLevelPools {
  const ids = new Set<string>();
  for (const entry of admittedEntries) {
    if (!entry.id || ids.has(entry.id)) throw new Error('HSK pool input contains an empty or duplicate ID');
    if (!Number.isInteger(entry.hsk.introducedAtLevel) || entry.hsk.introducedAtLevel < 1 || entry.hsk.introducedAtLevel > 4) {
      throw new Error(`HSK pool input has an out-of-level entry '${entry.id}'`);
    }
    ids.add(entry.id);
  }
  for (const level of LEVELS) {
    if (!Number.isSafeInteger(expectedNewWordCounts[level]) || expectedNewWordCounts[level] < 0) {
      throw new Error(`HSK expected count for level ${level} is invalid`);
    }
  }
  const pools = LEVELS.map((level) => {
    const fullRange = admittedEntries.filter(
      (entry) => entry.hsk.introducedAtLevel <= level,
    );
    const newWords = admittedEntries.filter(
      (entry) => entry.hsk.introducedAtLevel === level,
    );
    const expectedNewWords = expectedNewWordCounts[level];
    const expectedFullRange = LEVELS
      .filter((candidate) => candidate <= level)
      .reduce((sum, candidate) => sum + expectedNewWordCounts[candidate], 0);
    const missingEvidence = sourceDiagnostic ? [sourceDiagnostic] : [];
    if (fullRange.length < expectedFullRange) {
      missingEvidence.push(`Level ${level} full range: expected ${expectedFullRange}, admitted ${fullRange.length}`);
    }
    if (newWords.length < expectedNewWords) {
      missingEvidence.push(`Level ${level} new words: expected ${expectedNewWords}, admitted ${newWords.length}`);
    }
    let status: HskPoolStatus;
    if (
      sourceDiagnostic || fullRange.length === 0 || fullRange.length > expectedFullRange ||
      newWords.length > expectedNewWords
    ) {
      status = 'unavailable';
    } else if (fullRange.length === expectedFullRange && newWords.length === expectedNewWords) {
      status = 'available';
    } else {
      status = 'partial';
    }
    return {
      level,
      status,
      fullRange,
      newWords,
      counts: {
        fullRange: fullRange.length,
        newWords: newWords.length,
        expectedFullRange,
        expectedNewWords,
      },
      missingEvidence,
    };
  });
  return freezeDeep(pools);
}
