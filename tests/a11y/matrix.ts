export const A11Y_THEMES = ['light', 'dark'] as const;

/** The six learner surfaces/states required by Issue #71. */
export const A11Y_SURFACES = [
  'home',
  'lesson-reading',
  'practice-unanswered',
  'practice-correct',
  'practice-incorrect',
  'completion',
] as const;

export type A11yTheme = (typeof A11Y_THEMES)[number];
export type A11ySurface = (typeof A11Y_SURFACES)[number];

export interface A11yCase {
  theme: A11yTheme;
  surface: A11ySurface;
  caseName: string;
}

/** Full required matrix: 2 themes x 6 surfaces = 12 cases. */
export const A11Y_CASES: readonly A11yCase[] = A11Y_THEMES.flatMap(
  (theme) =>
    A11Y_SURFACES.map((surface) => ({
      theme,
      surface,
      caseName: `${theme}-${surface}`,
    })),
);

/** The lesson used to render the practice and completion surfaces. */
export const A11Y_LESSON_ID = 'lesson-001';
