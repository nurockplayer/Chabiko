import { VISUAL_THEMES } from './matrix';

export const TAIWAN_TRAVEL_PATH_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

export const TAIWAN_TRAVEL_PATH_VISUAL_CASES = VISUAL_THEMES.flatMap((theme) =>
  TAIWAN_TRAVEL_PATH_VIEWPORTS.map((viewport) => ({
    theme,
    viewport,
    snapshotName: `taiwan-travel-path-${theme}-${viewport.width}x${viewport.height}.png`,
  })),
);
