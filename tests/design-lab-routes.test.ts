// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { initDesignLabPrototype } from '../src/client/designLabPrototype';
import {
  buildDesignLabFixture,
  buildDesignLabFixtureFromSources,
} from '../src/content/designLabFixture';
import { loadLessonById } from '../src/content/loadLessons';
import learningPathsData from '../data/learning-paths.json';
import readinessData from '../data/travel-quest-readiness.json';
import vocabularyData from '../data/examples/valid/vocabulary.json';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixtureSources(): {
  lesson: ReturnType<typeof loadLessonById>;
  vocabularyDocument: unknown;
  readinessDocument: unknown;
  learningPathsDocument: unknown;
} {
  return {
    lesson: loadLessonById('lesson-001'),
    vocabularyDocument: clone(vocabularyData),
    readinessDocument: clone(readinessData),
    learningPathsDocument: clone(learningPathsData),
  };
}

function createDesignLabRoot(): HTMLElement {
  const root = document.createElement('main');
  root.setAttribute('data-design-lab', '');
  root.innerHTML = `
    <nav>
      <button type="button" data-lab-nav data-lab-target="home">Home</button>
      <button type="button" data-lab-nav data-lab-target="vocabulary">Vocabulary</button>
      <button type="button" data-lab-nav data-lab-target="lesson">Lesson</button>
      <button type="button" data-lab-nav data-lab-target="travel">Travel</button>
    </nav>
    <section data-lab-view="home">Home view</section>
    <section data-lab-view="vocabulary">
      <button type="button" data-lab-reveal>Reveal</button>
      <p data-lab-answer hidden>これ</p>
      <button type="button" data-lab-rating="again">Again</button>
      <button type="button" data-lab-rating="known">Known</button>
    </section>
    <section data-lab-view="lesson">
      <button type="button" data-lab-quiz-choice data-lab-correct="true">我要這個</button>
      <button type="button" data-lab-quiz-choice data-lab-correct="false">你要這個</button>
    </section>
    <section data-lab-view="travel">Travel view</section>
  `;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('design lab fixture', () => {
  test('derives the shared learner content from canonical structured sources', () => {
    const fixture = buildDesignLabFixture();

    expect(fixture.lesson.id).toBe('lesson-001');
    expect(fixture.lesson.coreSentence).toBe('我要這個');
    expect(fixture.vocabulary.id).toBe('voc-002');
    expect(fixture.travelTargets).toHaveLength(4);
  });

  test('rejects malformed required vocabulary fields and example metadata', () => {
    expect(buildDesignLabFixtureFromSources).toBeTypeOf('function');

    const invalidStatus = fixtureSources();
    const vocabularyWithInvalidStatus = invalidStatus.vocabularyDocument as {
      vocabulary: Array<Record<string, unknown>>;
    };
    vocabularyWithInvalidStatus.vocabulary.find((entry) => entry.id === 'voc-002')!.simplifiedStatus = 'unavailable';
    expect(() => buildDesignLabFixtureFromSources(invalidStatus)).toThrow();

    const invalidExample = fixtureSources();
    const vocabularyWithInvalidExample = invalidExample.vocabularyDocument as {
      vocabulary: Array<Record<string, unknown>>;
    };
    vocabularyWithInvalidExample.vocabulary.find((entry) => entry.id === 'voc-002')!.examples = [
      { traditional: '這個多少錢', traditionalStatus: 'authored', pinyin: 2, japanese: 'これはいくらですか？' },
    ];
    expect(() => buildDesignLabFixtureFromSources(invalidExample)).toThrow();
  });

  test('rejects malformed travel readiness documents, targets, and evidence', () => {
    const invalidDocument = fixtureSources();
    (invalidDocument.readinessDocument as { schemaVersion: unknown }).schemaVersion = 2;
    expect(() => buildDesignLabFixtureFromSources(invalidDocument)).toThrow();

    const invalidTarget = fixtureSources();
    const readinessWithInvalidTarget = invalidTarget.readinessDocument as {
      targets: Array<Record<string, unknown>>;
    };
    readinessWithInvalidTarget.targets[0].evidence = [];
    expect(() => buildDesignLabFixtureFromSources(invalidTarget)).toThrow();

    const invalidEvidence = fixtureSources();
    const readinessWithInvalidEvidence = invalidEvidence.readinessDocument as {
      targets: Array<{ evidence: Array<Record<string, unknown>> }>;
    };
    readinessWithInvalidEvidence.targets[0].evidence[0].type = 'opened-lesson';
    expect(() => buildDesignLabFixtureFromSources(invalidEvidence)).toThrow();
  });
});

describe('design lab layout isolation', () => {
  test('owns the baseline reset required by prototype routes', () => {
    const layout = readFileSync('src/layouts/DesignLabLayout.astro', 'utf8');

    expect(layout).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box;/);
    expect(layout).toMatch(/body\s*\{\s*margin:\s*0;/);
    expect(layout).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{\s*font:\s*inherit;/);
    expect(layout).toMatch(/img,\s*picture,\s*svg,\s*video,\s*canvas\s*\{[\s\S]*?display:\s*block;[\s\S]*?max-width:\s*100%;/);
  });
});

describe('design lab controller', () => {
  test('falls back from an invalid query and keeps exactly one selected view', () => {
    window.history.replaceState({}, '', '/design-lab/apple/?view=unknown');
    const root = createDesignLabRoot();

    initDesignLabPrototype(root);

    const visibleViews = [...root.querySelectorAll<HTMLElement>('[data-lab-view]')].filter(
      (view) => !view.hidden,
    );
    const selectedNav = [...root.querySelectorAll<HTMLElement>('[data-lab-nav]')].filter(
      (nav) => nav.getAttribute('aria-selected') === 'true',
    );
    expect(visibleViews.map((view) => view.dataset.labView)).toEqual(['home']);
    expect(selectedNav.map((nav) => nav.dataset.labTarget)).toEqual(['home']);
  });

  test('switches views and keeps prototype interactions local to the mounted root', () => {
    window.history.replaceState({}, '', '/design-lab/apple/?view=vocabulary');
    const root = createDesignLabRoot();
    const localGetItem = vi.spyOn(window.localStorage, 'getItem');
    const localSetItem = vi.spyOn(window.localStorage, 'setItem');
    const localRemoveItem = vi.spyOn(window.localStorage, 'removeItem');
    const localClear = vi.spyOn(window.localStorage, 'clear');
    const sessionGetItem = vi.spyOn(window.sessionStorage, 'getItem');
    const sessionSetItem = vi.spyOn(window.sessionStorage, 'setItem');
    const sessionRemoveItem = vi.spyOn(window.sessionStorage, 'removeItem');
    const sessionClear = vi.spyOn(window.sessionStorage, 'clear');

    initDesignLabPrototype(root);

    expect(root.querySelector<HTMLElement>('[data-lab-view="vocabulary"]')?.hidden).toBe(false);
    (root.querySelector<HTMLButtonElement>('[data-lab-reveal]') as HTMLButtonElement).click();
    expect(root.querySelector<HTMLElement>('[data-lab-answer]')?.hidden).toBe(false);

    (root.querySelector<HTMLButtonElement>('[data-lab-rating="known"]') as HTMLButtonElement).click();
    expect(root.dataset.labRating).toBe('known');

    (root.querySelector<HTMLButtonElement>('[data-lab-nav][data-lab-target="lesson"]') as HTMLButtonElement).click();
    expect(root.querySelector<HTMLElement>('[data-lab-view="lesson"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-lab-view="vocabulary"]')?.hidden).toBe(true);

    (root.querySelectorAll<HTMLButtonElement>('[data-lab-quiz-choice]')[0]).click();
    const feedback = root.querySelector<HTMLElement>('[data-lab-quiz-feedback]');
    expect(feedback?.getAttribute('role')).toBe('status');
    expect(feedback?.textContent).toBe('正解です');

    for (const storageApi of [
      localGetItem,
      localSetItem,
      localRemoveItem,
      localClear,
      sessionGetItem,
      sessionSetItem,
      sessionRemoveItem,
      sessionClear,
    ]) {
      expect(storageApi).not.toHaveBeenCalled();
    }
  });

  test('retains the current cleanup after a stale cleanup runs', () => {
    const root = createDesignLabRoot();
    const staleCleanup = initDesignLabPrototype(root);
    initDesignLabPrototype(root);
    staleCleanup();

    const homeNavigation = root.querySelector<HTMLElement>(
      '[data-lab-nav][data-lab-target="home"]',
    )!;
    const setAttribute = vi.spyOn(homeNavigation, 'setAttribute');
    initDesignLabPrototype(root);
    setAttribute.mockClear();

    homeNavigation.click();

    const selectedUpdates = setAttribute.mock.calls.filter(
      ([name]) => name === 'aria-selected',
    );
    expect(selectedUpdates).toHaveLength(1);
  });

  test('does not treat the undocumented data-correct alias as a correct answer', () => {
    const root = createDesignLabRoot();
    const aliasChoice = root.querySelectorAll<HTMLElement>('[data-lab-quiz-choice]')[1];
    aliasChoice.dataset.correct = 'true';

    initDesignLabPrototype(root);
    aliasChoice.click();

    expect(root.querySelector('[data-lab-quiz-feedback]')?.textContent).toBe(
      'もう一度試してみましょう',
    );
  });
});
