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

/**
 * Per-surface axe include target. Each surface scans the region that holds its
 * distinct state: `lesson-reading` scans the lesson reading region,
 * `practice-unanswered`/`practice-correct`/`practice-incorrect`/`completion`
 * scan the practice region (which carries the question/feedback/completion
 * states), and `home` scans the whole home page (`undefined` = no include).
 * This makes the six surfaces genuinely distinct scans, not labels over the
 * same whole-page Axe run.
 */
export const A11Y_SURFACE_SCAN_TARGET: Readonly<Record<A11ySurface, string | undefined>> = {
  home: undefined,
  'lesson-reading':
    '.lesson-intro, .can-do-section, .core-section, .reading-section, .bridge-section, .travel-task',
  'practice-unanswered': '.lesson-practice',
  'practice-correct': '.lesson-practice',
  'practice-incorrect': '.lesson-practice',
  completion: '.lesson-practice',
};

/** The lesson used to render the practice and completion surfaces. */
export const A11Y_LESSON_ID = 'lesson-001';
