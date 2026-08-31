/** Deterministic /vocabulary/basic/ learner-route visual cases, separate from
 * the lesson-journey matrix. The full viewport set covers revealed items with
 * and without context; narrow and desktop cases also freeze the unrevealed and
 * longest approved raw-context states. */
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

/** 原来 (longest approved raw example string), manifest index 1518. */
export const LONG_EXAMPLE_ID = 'teacher-learner-156cf7b03e67d363';
export const LONG_EXAMPLE_LEARNED_COUNT = 1518;

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
    ...([320, 1440].includes(viewport.width)
      ? [
          {
            learnerId: COMPLETE_FIELD_ID,
            learnedCount: COMPLETE_FIELD_LEARNED_COUNT,
            viewport,
            revealed: false,
            snapshotName: `learner-route-unrevealed-${viewport.width}x${viewport.height}.png`,
          },
          {
            learnerId: LONG_EXAMPLE_ID,
            learnedCount: LONG_EXAMPLE_LEARNED_COUNT,
            viewport,
            revealed: true,
            snapshotName: `learner-route-long-context-${viewport.width}x${viewport.height}.png`,
          },
        ]
      : []),
  ]);
