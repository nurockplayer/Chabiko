/** Real learner HSK study captures: all levels, both themes, mobile and desktop. */
export const HSK_STUDY_VISUAL_CASES = (['light', 'dark'] as const).flatMap((theme) =>
  [{ width: 320, height: 800 }, { width: 1440, height: 900 }].flatMap((viewport) =>
    ([1, 2, 3, 4] as const).map((level) => ({
      theme,
      viewport,
      captureWidth: viewport.width === 320 ? 280 : 640,
      level,
      setupSnapshot: `hsk-${level}-setup-${theme}-${viewport.width}.png`,
      answerSnapshot: `hsk-${level}-revealed-${theme}-${viewport.width}.png`,
    })),
  ),
);
