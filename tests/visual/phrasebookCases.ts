/** Deterministic /phrasebook/ visual cases (Issue #236). The phrasebook
 *  surface has NO production-eligibility gate and NO pending state: every case
 *  captures the full first-release surface (all 30 phrases, all 6 dialogs) as a
 *  viewport-sized top-of-page screenshot across the Issue #205 viewport set.
 *  The scenario filter is URL-only, so the default unfiltered capture is the
 *  deterministic baseline for every viewport. */
export interface PhrasebookVisualCase {
  /** URL query applied to the route ('' = default unfiltered surface). */
  search: string;
  viewport: { width: number; height: number };
  snapshotName: string;
}

export const PHRASEBOOK_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

export const PHRASEBOOK_VISUAL_CASES: readonly PhrasebookVisualCase[] =
  PHRASEBOOK_VIEWPORTS.map((viewport) => ({
    search: '',
    viewport,
    snapshotName: `phrasebook-${viewport.width}x${viewport.height}.png`,
  }));
