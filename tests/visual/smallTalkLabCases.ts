/** Deterministic /dev/small-talk visual evidence cases for Issue #469. */
export const SMALL_TALK_LAB_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

export const SMALL_TALK_LAB_STATES = [
  'mission',
  'active-baseline',
  'alternate-branch',
  'repair',
  'evidence-recap',
  'passport-replay',
  'seasonal-transfer',
] as const;

export type SmallTalkLabState = (typeof SMALL_TALK_LAB_STATES)[number];

export interface SmallTalkLabVisualCase {
  state: SmallTalkLabState;
  viewport: (typeof SMALL_TALK_LAB_VIEWPORTS)[number];
  snapshotName: string;
  captureHeight: number;
  scrollY: number;
}

export const SMALL_TALK_LAB_VISUAL_CASES: readonly SmallTalkLabVisualCase[] =
  [
    { state: 'mission', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-mission-375x812.png', captureHeight: 639, scrollY: 22 },
    { state: 'active-baseline', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-active-baseline-375x812.png', captureHeight: 670, scrollY: 377 },
    { state: 'alternate-branch', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-alternate-branch-375x812.png', captureHeight: 625, scrollY: 377 },
    { state: 'repair', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-repair-375x812.png', captureHeight: 711, scrollY: 377 },
    { state: 'evidence-recap', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-evidence-recap-375x812.png', captureHeight: 354, scrollY: 321 },
    { state: 'passport-replay', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-passport-replay-375x812.png', captureHeight: 434, scrollY: 789 },
    { state: 'seasonal-transfer', viewport: SMALL_TALK_LAB_VIEWPORTS[0], snapshotName: 'small-talk-seasonal-transfer-375x812.png', captureHeight: 668, scrollY: 377 },
    { state: 'mission', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-mission-1440x900.png', captureHeight: 560, scrollY: 0 },
    { state: 'active-baseline', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-active-baseline-1440x900.png', captureHeight: 442, scrollY: 353 },
    { state: 'alternate-branch', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-alternate-branch-1440x900.png', captureHeight: 449, scrollY: 137 },
    { state: 'repair', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-repair-1440x900.png', captureHeight: 449, scrollY: 337 },
    { state: 'evidence-recap', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-evidence-recap-1440x900.png', captureHeight: 346, scrollY: 213 },
    { state: 'passport-replay', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-passport-replay-1440x900.png', captureHeight: 271, scrollY: 412 },
    { state: 'seasonal-transfer', viewport: SMALL_TALK_LAB_VIEWPORTS[1], snapshotName: 'small-talk-seasonal-transfer-1440x900.png', captureHeight: 441, scrollY: 391 },
  ];
