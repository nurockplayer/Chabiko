// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import { buildTaiwanTravelQuestions } from '../src/domain/taiwanTravelAssessment';
import {
  buildTaiwanTravelAssessmentPayload,
  serializeTaiwanTravelAssessmentPayload,
} from '../src/content/taiwanTravelAssessmentPayload';
import { initTaiwanTravelQuiz } from '../src/client/taiwanTravelQuiz';
import {
  TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY,
  TaiwanTravelAssessmentStore,
} from '../src/lib/taiwanTravelAssessmentStore';

const LESSON_PROGRESS_KEY = 'chabiko_completed_lessons';

beforeEach(() => {
  window.localStorage.clear();
});

function createQuizRoot(lessonIds: string[]): HTMLElement {
  const root = document.createElement('section');
  root.dataset.taiwanTravelQuiz = '';
  root.innerHTML =
    '<nav><a href="/">back</a></nav>' +
    '<p data-quiz-total></p><p data-quiz-progress></p><p data-quiz-score></p>' +
    '<div data-quiz-card></div>' +
    `<script type="application/json" id="taiwan-travel-quiz-data">${JSON.stringify({ lessonIds })}</script>`;
  document.body.append(root);
  return root;
}

/** Click the option whose text matches the current question's correct answer,
 *  then submit, then advance. */
function answerCorrectly(
  root: HTMLElement,
  correctAnswer: string,
): void {
  const optionButtons = root.querySelectorAll<HTMLButtonElement>(
    '[data-action="select"]',
  );
  let target: HTMLButtonElement | null = null;
  optionButtons.forEach((button) => {
    if (button.textContent === correctAnswer) target = button;
  });
  expect(target, `expected an option labelled '${correctAnswer}'`).not.toBeNull();
  target!.click();
  const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
  submit.click();
  root.querySelector<HTMLButtonElement>('[data-action="next"]')!.click();
}

function driveFullAttempt(root: HTMLElement, correct: boolean): void {
  const questions = buildTaiwanTravelQuestions(loadAllRenderableLessons());
  for (let index = 0; index < questions.length; index++) {
    const optionButtons = root.querySelectorAll<HTMLButtonElement>(
      '[data-action="select"]',
    );
    if (correct) {
      answerCorrectly(root, questions[index].answerJa);
    } else {
      // Pick a guaranteed-wrong option: the first option that is not the answer.
      const wrong = [...optionButtons].find(
        (button) => button.textContent !== questions[index].answerJa,
      );
      expect(wrong).toBeDefined();
      wrong!.click();
      root.querySelector<HTMLButtonElement>('[data-action="submit"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-action="next"]')!.click();
    }
  }
}

describe('taiwan travel assessment route', () => {
  it('routes to /paths/taiwan-travel/quiz/ with the #366 breadcrumb and TrackNav', async () => {
    const route = await readFile('src/pages/paths/taiwan-travel/quiz/index.astro', 'utf8');
    const component = await readFile('src/components/TaiwanTravelQuiz.astro', 'utf8');
    const client = await readFile('src/client/taiwanTravelQuiz.ts', 'utf8');

    expect(route).toContain('buildTaiwanTravelAssessmentPayload()');
    expect(route).toContain("{ label: 'ホーム', href: '/' },");
    expect(route).toContain("{ label: '台湾旅行', href: '/#taiwan-travel-path' },");
    expect(route).toContain('{ label: \'総合テスト\' }');
    // The quiz route is imported from the single navigation-config source,
    // never hardcoded in the page.
    expect(route).toContain('TAIWAN_TRAVEL_ASSESSMENT_ROUTE');
    expect(route).not.toContain("'/paths/taiwan-travel/quiz/'");
    expect(route).toContain('総合テスト');

    // The image-free guarantee is structural: no image is ever emitted.
    expect(route).not.toContain('<img');
    expect(component).not.toContain('<img');
    expect(client).not.toMatch(/createElement\(['"]img['"]\)|querySelector\(['"]img['"]\)/);

    // Deterministic client: no randomness, no time, no fetch, no lesson-progress
    // writes. The isolated assessment store is the only storage interaction.
    expect(client).not.toMatch(/Math\.random|Date\b|fetch\(/);
    expect(client).not.toContain(LESSON_PROGRESS_KEY);
  });

  it('builds a payload of exactly the ten ordered lesson ids', () => {
    const payload = buildTaiwanTravelAssessmentPayload();
    expect(payload.lessonIds).toEqual([
      'lesson-001',
      'lesson-002',
      'lesson-003',
      'lesson-004',
      'lesson-005',
      'lesson-006',
      'lesson-007',
      'lesson-008',
      'lesson-009',
      'lesson-010',
    ]);
    const serialized = serializeTaiwanTravelAssessmentPayload(payload);
    expect(serialized).not.toContain('promptJa');
    expect(serialized).not.toContain('answerJa');
  });
});

describe('taiwan travel assessment route — containment and focus contract', () => {
  async function readSource(): Promise<{ route: string; component: string }> {
    return {
      route: await readFile('src/pages/paths/taiwan-travel/quiz/index.astro', 'utf8'),
      component: await readFile('src/components/TaiwanTravelQuiz.astro', 'utf8'),
    };
  }

  it('bounds the page and card with no horizontal overflow at narrow widths', async () => {
    const { route, component } = await readSource();
    // Page width is bounded by the container; every card surface keeps
    // min-width: 0 so nothing escapes at 320px.
    expect(route).toMatch(/\.taiwan-travel-quiz-page\s*\{[^}]*width:\s*min\(100%, 44rem\)/);
    expect(route).toMatch(/\.taiwan-travel-quiz-page\s*\{[^}]*min-width:\s*0/);
    expect(component).toMatch(/\.taiwan-travel-quiz\s*\{[^}]*min-width:\s*0/);
    expect(component).toMatch(/\.taiwan-travel-quiz-card\s*\{[^}]*min-width:\s*0/);
    // Long Japanese copy and option text wrap instead of overflowing.
    for (const selector of [
      '.taiwan-travel-quiz-prompt',
      '.taiwan-travel-quiz-option',
      '.taiwan-travel-quiz-answer',
    ]) {
      expect(
        component.match(
          new RegExp(`${selector}\\s*\\{[^}]*overflow-wrap:\\s*anywhere`),
        ),
        `${selector} should wrap long text`,
      ).not.toBeNull();
    }
    // No nowrap on text-bearing elements.
    for (const styles of [route, component]) {
      const nowrap = styles
        .split('}')
        .filter(
          (rule) =>
            (rule.includes('__lead') ||
              rule.includes('__prompt') ||
              rule.includes('__option') ||
              rule.includes('__answer') ||
              rule.includes('__completion-')) &&
            rule.includes('white-space') &&
            !rule.includes('normal'),
        );
      expect(nowrap).toHaveLength(0);
    }
  });

  it('keeps every interactive control a native focusable target with a visible focus style', async () => {
    const { component } = await readSource();
    expect(component).toContain('outline: 3px solid var(--c-accent);');
    expect(component).toMatch(
      /\.taiwan-travel-quiz-option:focus-visible,\s*\.taiwan-travel-quiz-action:focus-visible/,
    );
    // Native buttons, >=44px targets, never outline:hidden/display:none.
    expect(component).toContain('min-height: 2.75rem;');
    expect(component).not.toContain('outline: none');
    expect(component).not.toContain('display: none');
  });
});

describe('taiwan travel assessment client', () => {
  it('exposes only the source prompt and option buttons before commitment (answer-safe)', () => {
    const payload = buildTaiwanTravelAssessmentPayload();
    const root = createQuizRoot(payload.lessonIds as string[]);
    initTaiwanTravelQuiz(root);

    expect(root.querySelectorAll('img')).toHaveLength(0);
    const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
    expect(card.querySelector('.taiwan-travel-quiz-prompt')).not.toBeNull();

    const optionButtons = card.querySelectorAll<HTMLButtonElement>(
      '[data-action="select"]',
    );
    expect(optionButtons.length).toBeGreaterThanOrEqual(2);
    for (const option of optionButtons) {
      expect(option.tagName).toBe('BUTTON');
      expect(option.type).toBe('button');
    }

    // No answer/feedback/correctness leak before commitment.
    expect(card.querySelector('.taiwan-travel-quiz-feedback')).toBeNull();
    expect(card.querySelector('.taiwan-travel-quiz-answer')).toBeNull();
    expect(card.querySelectorAll('[data-correct="true"]')).toHaveLength(0);
    expect(card.textContent).not.toContain('正解：');

    // Submit is disabled until a choice is made.
    const submit = card.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    expect(submit.disabled).toBe(true);

    // No storage write before a full attempt completes.
    expect(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LESSON_PROGRESS_KEY)).toBeNull();
  });

  it('reveals feedback and the source-backed answer only after commitment', () => {
    const payload = buildTaiwanTravelAssessmentPayload();
    const root = createQuizRoot(payload.lessonIds as string[]);
    initTaiwanTravelQuiz(root);

    const questions = buildTaiwanTravelQuestions(loadAllRenderableLessons());
    const first = questions[0];
    const optionButtons = root.querySelectorAll<HTMLButtonElement>(
      '[data-action="select"]',
    );
    const correct = [...optionButtons].find(
      (button) => button.textContent === first.answerJa,
    );
    correct!.click();
    const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    expect(submit.disabled).toBe(false);
    submit.click();

    const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
    expect(card.querySelector('.taiwan-travel-quiz-feedback')).not.toBeNull();
    expect(card.querySelectorAll('[data-correct="true"]')).toHaveLength(1);
    expect(card.textContent).toContain(`正解：${first.answerJa}`);
    for (const option of card.querySelectorAll<HTMLButtonElement>('[data-action="select"]')) {
      expect(option.disabled).toBe(true);
    }
    // The next action exists and receives focus after submit.
    const next = card.querySelector<HTMLButtonElement>('[data-action="next"]')!;
    expect(document.activeElement).toBe(next);

    // Still no storage write mid-attempt.
    expect(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)).toBeNull();
  });

  it('advances through all ten questions, shows 10問中 X問正解, and writes once', () => {
    const payload = buildTaiwanTravelAssessmentPayload();
    const root = createQuizRoot(payload.lessonIds as string[]);

    // The client records the completed attempt exactly once per attempt via
    // the isolated store; the spy proves the write-once contract without
    // relying on the host localStorage implementation.
    const recordSpy = vi.spyOn(
      TaiwanTravelAssessmentStore.prototype,
      'recordCompletedAttempt',
    );
    initTaiwanTravelQuiz(root);

    driveFullAttempt(root, true);

    const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
    expect(card.querySelector('.taiwan-travel-quiz-completion-title')).not.toBeNull();
    expect(card.textContent).toContain(`10問中 10問正解`);
    expect(root.querySelector('[data-quiz-progress]')?.textContent).toBe('10 / 10');
    expect(root.querySelector('[data-quiz-score]')?.textContent).toBe('正解 10 / 10');

    // Written exactly once for the attempt, with the completed score as the
    // max best score.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(10);
    expect(
      JSON.parse(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)!),
    ).toEqual({ version: 1, bestScore: 10 });
    expect(window.localStorage.getItem(LESSON_PROGRESS_KEY)).toBeNull();
    recordSpy.mockRestore();
  });

  it('records max best score across attempts and preserves it on restart', () => {
    const payload = buildTaiwanTravelAssessmentPayload();
    const root = createQuizRoot(payload.lessonIds as string[]);
    initTaiwanTravelQuiz(root);

    // First attempt: all wrong → best score 0.
    driveFullAttempt(root, false);
    expect(
      JSON.parse(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)!),
    ).toEqual({ version: 1, bestScore: 0 });

    // Restart keeps the best score (0 is already stored).
    const restart = root.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
    restart.click();
    expect(root.querySelector('.taiwan-travel-quiz-completion-title')).toBeNull();
    expect(root.querySelectorAll<HTMLButtonElement>('[data-action="select"]').length).toBeGreaterThanOrEqual(2);
    expect(
      JSON.parse(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)!),
    ).toEqual({ version: 1, bestScore: 0 });

    // Second attempt: all correct → best score rises to 10, never decreases.
    driveFullAttempt(root, true);
    expect(
      JSON.parse(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)!),
    ).toEqual({ version: 1, bestScore: 10 });
    expect(root.querySelector<HTMLElement>('[data-quiz-card]')!.textContent).toContain('ベストスコア 10 / 10');
  });

  it('fails safe on a malformed payload by showing the unavailable state', () => {
    const root = document.createElement('section');
    root.dataset.taiwanTravelQuiz = '';
    root.innerHTML =
      '<div data-quiz-card></div>' +
      `<script type="application/json" id="taiwan-travel-quiz-data">{not json</script>`;
    document.body.append(root);
    initTaiwanTravelQuiz(root);
    expect(root.querySelector('.taiwan-travel-quiz-unavailable')).not.toBeNull();
    expect(window.localStorage.getItem(TAIWAN_TRAVEL_ASSESSMENT_STORAGE_KEY)).toBeNull();
  });

  it('fails safe when the payload no longer matches the production lessons', () => {
    const root = createQuizRoot(['lesson-001', 'lesson-999']);
    initTaiwanTravelQuiz(root);
    expect(root.querySelector('.taiwan-travel-quiz-unavailable')).not.toBeNull();
  });
});
