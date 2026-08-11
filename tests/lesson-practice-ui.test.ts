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

  it('exposes Direction C answer and feedback states without changing answer actions', () => {
    expect(practiceComponentSource).toContain('role="group" aria-label="回答を選択"');
    expect(practiceComponentSource).toContain(
      'role="status" aria-live="polite" aria-atomic="true"',
    );
    expect(practiceComponentSource).toContain("btn.classList.add('practice-choice--correct')");
    expect(practiceComponentSource).toContain("btn.classList.add('practice-choice--incorrect')");
    // The answer handler still schedules the completion render after the
    // correct-answer timeout and the next render after the incorrect timeout.
    expect(practiceComponentSource).toContain('renderCompleted()');
    expect(practiceComponentSource).toContain('}, 1200);');
    expect(practiceComponentSource).toContain('}, 2000);');
  });

  it('manages focus after answering and after completion re-render (no focus loss)', () => {
    // The answer handler focuses the feedback status so keyboard and screen-reader
    // users hear the result and focus does not fall to the document body.
    expect(practiceComponentSource).toContain('feedback.tabIndex = -1;');
    expect(practiceComponentSource).toContain('feedback.focus();');
    // After the correct/completed re-render, focus moves to the completion status.
    expect(practiceComponentSource).toContain(
      "timer.schedule(() => {\n            renderCompleted();\n            const complete = root.querySelector('.practice-complete') as HTMLElement | null;\n            if (complete) complete.focus();\n          }, 1200);",
    );
    // After a non-completing correct answer or an incorrect answer, the next
    // question's first choice receives focus so the learner can continue.
    expect(practiceComponentSource).toContain(
      "const firstChoice = root.querySelector('.practice-choice') as HTMLButtonElement | null;\n            if (firstChoice) firstChoice.focus();",
    );
  });
});
