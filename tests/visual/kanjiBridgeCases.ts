/** Deterministic /vocabulary/kanji-bridge/ visual cases (Issue #235). Each case
 * captures the top-of-page surface (header + toolbar + first cards) as a
 * viewport-sized screenshot. The default state shows the full 50-entry corpus
 * (`全50件`); the filtered state loads the shareable `?relation=false-friend`
 * URL and shows the 15-entry subset (`15件`). Together they exercise the
 * responsive toolbar/list layout across the Issue #205 viewport set. */
export interface KanjiBridgeVisualCase {
  /** URL query applied to the route ('' = default full corpus). */
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
  KANJI_BRIDGE_VIEWPORTS.flatMap((viewport) => [
    {
      search: '',
      viewport,
      snapshotName: `kanji-bridge-default-${viewport.width}x${viewport.height}.png`,
    },
    {
      search: '?relation=false-friend',
      viewport,
      snapshotName: `kanji-bridge-filtered-${viewport.width}x${viewport.height}.png`,
    },
  ]);
