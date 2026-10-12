export const TONE_VISUAL_CASES = ['light', 'dark'].flatMap((theme) =>
  ['t1-high-flat', 't2-rising', 't3-dip-rise', 't4-falling', 'correct', 'incorrect'].map((state) => ({
    theme: theme as 'light' | 'dark',
    state,
    viewport: { width: 320, height: 800 },
    snapshotName: `tone-${theme}-${state}-320x800.png`,
  })),
);
