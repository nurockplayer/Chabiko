export const VISUAL_THEMES = ['light', 'dark'] as const;

export const VISUAL_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

export const VISUAL_STATES = [
  'home',
  'lesson-reading',
  'practice-unanswered',
  'practice-correct',
  'practice-incorrect',
  'completion',
] as const;

export type VisualTheme = (typeof VISUAL_THEMES)[number];
export type VisualViewport = (typeof VISUAL_VIEWPORTS)[number];
export type VisualState = (typeof VISUAL_STATES)[number];

export interface VisualCase {
  theme: VisualTheme;
  viewport: VisualViewport;
  state: VisualState;
  snapshotName: string;
}

export const VISUAL_CASES: readonly VisualCase[] = VISUAL_THEMES.flatMap(
  (theme) =>
    VISUAL_VIEWPORTS.flatMap((viewport) =>
      VISUAL_STATES.map((state) => ({
        theme,
        viewport,
        state,
        snapshotName: `${theme}-${state}-${viewport.width}x${viewport.height}.png`,
      })),
    ),
);
