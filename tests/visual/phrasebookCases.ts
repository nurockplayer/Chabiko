/** Deterministic /phrasebook/ visual cases (#440 prelaunch, preserving the
 *  #236/#349 fail-closed contracts). The learner surface renders ONLY the
 *  exact canonical 30 phrases + 6 dialogs, preserving truthful review status
 *  and provenance. Overview cases capture the bounded launch surface as
 *  viewport-sized top-of-page screenshots across the Issue #205 viewport set.
 *  Emergency cases use the fixed `?scenario=emergency` URL and separate,
 *  viewport-sized fragment states: the later scenario heading, the dialog
 *  heading plus first complete turn, and the related-reference line. The
 *  dialog is intentionally not claimed to fit as a whole on mobile. */
export interface PhrasebookVisualCase {
  /** URL query applied to the route ('' = default unfiltered surface). */
  search: string;
  viewport: { width: number; height: number };
  snapshotName: string;
  capture:
    | 'overview'
    | 'emergency-heading'
    | 'emergency-dialog'
    | 'emergency-reference';
}

export const PHRASEBOOK_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

export const PHRASEBOOK_VISUAL_CASES: readonly PhrasebookVisualCase[] = [
  ...PHRASEBOOK_VIEWPORTS.map((viewport) => ({
    search: '',
    viewport,
    snapshotName: `phrasebook-${viewport.width}x${viewport.height}.png`,
    capture: 'overview' as const,
  })),
  ...PHRASEBOOK_VIEWPORTS.map((viewport) => ({
    search: '?scenario=emergency',
    viewport,
    snapshotName: `phrasebook-emergency-heading-${viewport.width}x${viewport.height}.png`,
    capture: 'emergency-heading' as const,
  })),
  ...PHRASEBOOK_VIEWPORTS.map((viewport) => ({
    search: '?scenario=emergency',
    viewport,
    snapshotName: `phrasebook-emergency-dialog-${viewport.width}x${viewport.height}.png`,
    capture: 'emergency-dialog' as const,
  })),
  ...PHRASEBOOK_VIEWPORTS.map((viewport) => ({
    search: '?scenario=emergency',
    viewport,
    snapshotName: `phrasebook-emergency-reference-${viewport.width}x${viewport.height}.png`,
    capture: 'emergency-reference' as const,
  })),
];
