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
}

export const SMALL_TALK_LAB_VISUAL_CASES: readonly SmallTalkLabVisualCase[] =
  SMALL_TALK_LAB_VIEWPORTS.flatMap((viewport) =>
    SMALL_TALK_LAB_STATES.map((state) => ({
      state,
      viewport,
      snapshotName: `small-talk-${state}-${viewport.width}x${viewport.height}.png`,
    })),
  );
