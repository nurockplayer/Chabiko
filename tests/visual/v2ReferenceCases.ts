export const V2_REFERENCE_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

export const V2_REFERENCE_VISUAL_STATES = [
  'today',
  'learning',
  'retrieval',
  'repair',
  'result',
] as const;

export type V2ReferenceVisualState =
  (typeof V2_REFERENCE_VISUAL_STATES)[number];

export interface V2ReferenceVisualCase {
  snapshotName: string;
  state: V2ReferenceVisualState;
  viewport: (typeof V2_REFERENCE_VIEWPORTS)[number];
}

/** The five coherent V2 states captured at both reference mobile sizes. */
export const V2_REFERENCE_VISUAL_CASES: readonly V2ReferenceVisualCase[] =
  V2_REFERENCE_VIEWPORTS.flatMap((viewport) =>
    V2_REFERENCE_VISUAL_STATES.map((state) => ({
      snapshotName: `v2-reference-${state}-${viewport.width}x${viewport.height}.png`,
      state,
      viewport,
    })),
  );
