import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lessonPageSource = readFileSync(
  new URL('../src/pages/lessons/[id].astro', import.meta.url),
  'utf8',
);
const practiceComponentSource = readFileSync(
  new URL('../src/components/LessonPractice.astro', import.meta.url),
  'utf8',
);

describe('lesson practice answer visibility', () => {
  it('uses LessonPractice as the only learner-facing review prompt UI', () => {
    expect(lessonPageSource).toContain('<LessonPractice lesson={lesson} />');
    expect(lessonPageSource).not.toContain('reviewPrompts.map');
    expect(lessonPageSource).not.toContain('prompt.answerJa');
    expect(lessonPageSource).not.toContain('id="review-heading"');
  });

  it('does not include the expected answer in the initial question markup', () => {
    const questionMarkupStart = practiceComponentSource.indexOf(
      "'<div class=\"practice-question\">'",
    );
    const answerHandlerStart = practiceComponentSource.indexOf(
      'function handleAnswer',
    );

    expect(questionMarkupStart).toBeGreaterThan(-1);
    expect(answerHandlerStart).toBeGreaterThan(questionMarkupStart);

    const initialQuestionMarkup = practiceComponentSource.slice(
      questionMarkupStart,
      answerHandlerStart,
    );
    expect(initialQuestionMarkup).not.toContain('q.correctAnswer');
    expect(initialQuestionMarkup).not.toContain('正解：');
  });

  it('reveals the expected answer from the incorrect-answer branch', () => {
    const answerHandlerStart = practiceComponentSource.indexOf(
      'function handleAnswer',
    );
    const escapeHelperStart = practiceComponentSource.indexOf(
      'function escapeHtml',
    );

    expect(answerHandlerStart).toBeGreaterThan(-1);
    expect(escapeHelperStart).toBeGreaterThan(answerHandlerStart);

    const answerHandler = practiceComponentSource.slice(
      answerHandlerStart,
      escapeHelperStart,
    );
    expect(answerHandler).toContain('result.feedback.kind');
    expect(answerHandler).toContain('正解：');
    expect(answerHandler).toContain('result.feedback.correctAnswer');
  });

  it('presents selected, correct, and incorrect states without relying on colour alone', () => {
    expect(practiceComponentSource).toContain('practice-choice-indicator');
    expect(practiceComponentSource).toContain("btn.classList.add('practice-choice--selected')");
    expect(practiceComponentSource).toContain("btn.classList.add('practice-choice--correct')");
    expect(practiceComponentSource).toContain("btn.classList.add('practice-choice--incorrect')");
    expect(practiceComponentSource).toContain('role="status" aria-live="polite"');
    expect(practiceComponentSource).toContain('feedback-icon');
  });

  it('preserves the production feedback and retry timings', () => {
    expect(practiceComponentSource).toContain(
      'timer.schedule(() => renderCompleted(true), 1200)',
    );
    expect(practiceComponentSource).toContain(
      'timer.schedule(() => render(true), 1200)',
    );
    expect(practiceComponentSource).toContain(
      'timer.schedule(() => render(true), 2000)',
    );
  });

  it('keeps the route presentation in sync when local progress is reset', () => {
    expect(practiceComponentSource).toContain(
      "routeStation?.classList.remove('route-station--complete')",
    );
    expect(practiceComponentSource).toContain(
      "if (routeStatus) routeStatus.textContent = '進行中'",
    );
  });

  it('keeps lesson sections and navigation explicitly labelled', () => {
    expect(lessonPageSource).toContain('aria-labelledby="core-heading"');
    expect(lessonPageSource).toContain('aria-labelledby="chunks-heading"');
    expect(lessonPageSource).toContain('aria-labelledby="examples-heading"');
    expect(lessonPageSource).toContain(
      '<nav class="lesson-nav" aria-label="レッスンナビゲーション">',
    );
  });
});
