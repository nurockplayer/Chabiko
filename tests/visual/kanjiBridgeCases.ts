/** Deterministic /vocabulary/kanji-bridge/ visual cases (Issue #235). The route
 * is fail-closed on the production-eligibility gate: with the current
 * all-generated/all-draft corpus it server-renders its pending state, so each
 * case captures that top-of-page surface (header + pending message) as a
 * viewport-sized screenshot across the Issue #205 viewport set. Once the corpus
 * is promoted, the eligibility gate lets the entry surface render here. */
export interface KanjiBridgeVisualCase {
  /** URL query applied to the route ('' = default). The pending surface does
   *  not vary by query. */
  search: string;
  viewport: { width: number; height: number };
  snapshotName: string;
}

export const KANJI_BRIDGE_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

export const KANJI_BRIDGE_VISUAL_CASES: readonly KanjiBridgeVisualCase[] =
  KANJI_BRIDGE_VIEWPORTS.map((viewport) => ({
    search: '',
    viewport,
    snapshotName: `kanji-bridge-pending-${viewport.width}x${viewport.height}.png`,
  }));
