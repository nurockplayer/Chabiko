/** Deterministic /vocabulary/basic/ learner-route visual cases, separate from
 * the lesson-journey matrix. Each case captures the card front after reveal for
 * a representative item: a true complete-field item (pinyin + Japanese +
 * Traditional Chinese) and a missing-all-optional item, across the Issue #205
 * viewport set. */
export interface LearnerRouteCase {
  /** Opaque learnerId whose card front is captured. */
  learnerId: string;
  /** Number of leading manifest items persisted as learned so the bounded
   * session window lands on this item. */
  learnedCount: number;
  viewport: { width: number; height: number };
  /** Whether the captured state is after reveal (answer visible or absent). */
  revealed: boolean;
  snapshotName: string;
}

export const LEARNER_ROUTE_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

/** 大家 (true complete-field: pinyin + japanese + traditional), index 514. */
export const COMPLETE_FIELD_ID = 'teacher-star-1-37e0eb213f0f';
export const COMPLETE_FIELD_LEARNED_COUNT = 514;

/** 强调 (missing-all-optional: simplified + image only), manifest index 275. */
export const NO_OPTIONAL_ID = 'teacher-learner-ce0a85de48246f4b';
export const NO_OPTIONAL_LEARNED_COUNT = 275;

export const LEARNER_ROUTE_CASES: readonly LearnerRouteCase[] =
  LEARNER_ROUTE_VIEWPORTS.flatMap((viewport) => [
    {
      learnerId: COMPLETE_FIELD_ID,
      learnedCount: COMPLETE_FIELD_LEARNED_COUNT,
      viewport,
      revealed: true,
      snapshotName: `learner-route-complete-${viewport.width}x${viewport.height}.png`,
    },
    {
      learnerId: NO_OPTIONAL_ID,
      learnedCount: NO_OPTIONAL_LEARNED_COUNT,
      viewport,
      revealed: true,
      snapshotName: `learner-route-no-optional-${viewport.width}x${viewport.height}.png`,
    },
  ]);
