export const V2_REFERENCE_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

export const V2_REFERENCE_SCREENS = [
  'today',
  'learning',
  'repair',
  'result',
] as const;

export type V2ReferenceScreen = (typeof V2_REFERENCE_SCREENS)[number];

export const V2_REFERENCE_VISUAL_CASES = V2_REFERENCE_VIEWPORTS.flatMap(
  (viewport) =>
    V2_REFERENCE_SCREENS.map((screen) => ({
      screen,
      viewport,
      snapshotName: `v2-reference-${screen}-${viewport.width}x${viewport.height}.png`,
    })),
);
