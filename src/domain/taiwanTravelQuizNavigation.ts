/**
 * Taiwan Travel comprehensive test navigation config (#376).
 *
 * The 総合テスト route and its single contextual entry from the existing
 * Taiwan Travel track context live here as track→route navigation config,
 * mirroring how dashboardProgress.ts owns track destinations. No page or
 * component hardcodes the route string or the track id; a path card renders
 * the entry only through {@link taiwanTravelQuizEntryForTrack}.
 */

/** The exact 総合テスト route (frozen V1 contract). */
export const TAIWAN_TRAVEL_ASSESSMENT_ROUTE = '/paths/taiwan-travel/quiz/';

/** The Taiwan Travel track id (its learning-path id). */
export const TAIWAN_TRAVEL_TRACK_ID = 'taiwan-travel';

/** Learner-facing label of the assessment entry. */
export const TAIWAN_TRAVEL_ASSESSMENT_LABEL_JA = '総合テスト';

export interface TaiwanTravelQuizEntry {
  readonly labelJa: string;
  readonly href: string;
}

/** The single truthful 総合テスト entry for the Taiwan Travel track, or null
 *  for any other track. No other track declares an assessment in V1. */
export function taiwanTravelQuizEntryForTrack(
  trackId: string,
): TaiwanTravelQuizEntry | null {
  return trackId === TAIWAN_TRAVEL_TRACK_ID
    ? { labelJa: TAIWAN_TRAVEL_ASSESSMENT_LABEL_JA, href: TAIWAN_TRAVEL_ASSESSMENT_ROUTE }
    : null;
}
