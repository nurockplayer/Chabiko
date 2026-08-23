// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { initDesignLabPrototype } from '../src/client/designLabPrototype';
import { buildDesignLabFixture } from '../src/content/designLabFixture';

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
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    initDesignLabPrototype(root);

    expect(root.querySelector<HTMLElement>('[data-lab-view="vocabulary"]')?.hidden).toBe(false);
    (root.querySelector<HTMLButtonElement>('[data-lab-reveal]') as HTMLButtonElement).click();
    expect(root.querySelector<HTMLElement>('[data-lab-answer]')?.hidden).toBe(false);

    (root.querySelector<HTMLButtonElement>('[data-lab-rating="known"]') as HTMLButtonElement).click();
    expect(root.dataset.labRating).toBe('known');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();

    (root.querySelector<HTMLButtonElement>('[data-lab-nav][data-lab-target="lesson"]') as HTMLButtonElement).click();
    expect(root.querySelector<HTMLElement>('[data-lab-view="lesson"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-lab-view="vocabulary"]')?.hidden).toBe(true);

    (root.querySelectorAll<HTMLButtonElement>('[data-lab-quiz-choice]')[0]).click();
    const feedback = root.querySelector<HTMLElement>('[data-lab-quiz-feedback]');
    expect(feedback?.getAttribute('role')).toBe('status');
    expect(feedback?.textContent).toBe('正解です');
  });
});
