import { VISUAL_THEMES } from './matrix';

export const TAIWAN_TRAVEL_PATH_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

export const TAIWAN_TRAVEL_PATH_VISUAL_STATES = ['top', 'end'] as const;

export const TAIWAN_TRAVEL_PATH_VISUAL_CASES = VISUAL_THEMES.flatMap((theme) =>
  TAIWAN_TRAVEL_PATH_VIEWPORTS.flatMap((viewport) =>
    TAIWAN_TRAVEL_PATH_VISUAL_STATES.map((state) => ({
      theme,
      viewport,
      state,
      snapshotName: `taiwan-travel-path-${state}-${theme}-${viewport.width}x${viewport.height}.png`,
    })),
  ),
);
