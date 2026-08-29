export const DESIGN_LAB_VIEWS = ['home', 'vocabulary', 'lesson', 'travel'] as const;

export type DesignLabView = (typeof DESIGN_LAB_VIEWS)[number];

const DESIGN_LAB_VIEW_SET = new Set<string>(DESIGN_LAB_VIEWS);
const cleanups = new WeakMap<HTMLElement, () => void>();

type OwnedQueries = {
  all<T extends Element>(selector: string): T[];
  first<T extends Element>(selector: string): T | null;
};

function createOwnedQueries(root: HTMLElement): OwnedQueries {
  const all = <T extends Element>(selector: string): T[] => [
    ...root.querySelectorAll<T>(selector),
  ].filter((element) => element.closest('[data-design-lab]') === root);

  return {
    all,
    first: <T extends Element>(selector: string): T | null => all<T>(selector)[0] ?? null,
  };
}

function isDesignLabView(value: string | null): value is DesignLabView {
  return value !== null && DESIGN_LAB_VIEW_SET.has(value);
}

function initialView(): DesignLabView {
  const value = new URLSearchParams(window.location.search).get('view');
  return isDesignLabView(value) ? value : 'home';
}

function setButtonDisabled(element: HTMLElement, disabled: boolean): void {
  if (element instanceof HTMLButtonElement) element.disabled = disabled;
}

/**
 * Activate design-lab controls for a single mounted prototype. This controller
 * stores short-lived prototype state only on the root element and never reads
 * or writes production learner storage.
 */
export function initDesignLabPrototype(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const owned = createOwnedQueries(root);
  const views = owned.all<HTMLElement>('[data-lab-view]');
  const navigation = owned.all<HTMLElement>('[data-lab-nav]');
  const removers: Array<() => void> = [];

  function applyView(requested: DesignLabView): void {
    const active = views.some((view) => view.dataset.labView === requested)
      ? requested
      : 'home';
    let activeAssigned = false;

    for (const view of views) {
      const isVisible: boolean = !activeAssigned && view.dataset.labView === active;
      view.hidden = !isVisible;
      activeAssigned = activeAssigned || isVisible;
    }
    for (const item of navigation) {
      const isActive = item.dataset.labTarget === active;
      item.setAttribute(
        'aria-selected',
        String(isActive),
      );
      item.tabIndex = isActive ? 0 : -1;
    }
  }

  for (const [index, item] of navigation.entries()) {
    const onClick = (): void => {
      const target = item.dataset.labTarget ?? null;
      if (isDesignLabView(target)) applyView(target);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      let targetIndex: number;
      switch (event.key) {
        case 'ArrowRight':
          targetIndex = (index + 1) % navigation.length;
          break;
        case 'ArrowLeft':
          targetIndex = (index - 1 + navigation.length) % navigation.length;
          break;
        case 'Home':
          targetIndex = 0;
          break;
        case 'End':
          targetIndex = navigation.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const targetItem = navigation[targetIndex];
      targetItem.focus();
      const target = targetItem.dataset.labTarget ?? null;
      if (isDesignLabView(target)) applyView(target);
    };
    item.addEventListener('click', onClick);
    item.addEventListener('keydown', onKeyDown);
    removers.push(() => item.removeEventListener('click', onClick));
    removers.push(() => item.removeEventListener('keydown', onKeyDown));
  }

  for (const reveal of owned.all<HTMLElement>('[data-lab-reveal]')) {
    const onClick = (): void => {
      for (const answer of owned.all<HTMLElement>('[data-lab-answer]')) {
        answer.hidden = false;
      }
      reveal.hidden = true;
      reveal.setAttribute('aria-expanded', 'true');
    };
    reveal.addEventListener('click', onClick);
    removers.push(() => reveal.removeEventListener('click', onClick));
  }

  const ratings = owned.all<HTMLElement>('[data-lab-rating]');
  for (const rating of ratings) {
    const onClick = (): void => {
      if (root.dataset.labRating) return;
      const value = rating.dataset.labRating;
      if (!value) return;

      root.dataset.labRating = value;
      for (const option of ratings) {
        const selected = option === rating;
        option.setAttribute('aria-pressed', String(selected));
        setButtonDisabled(option, true);
      }
    };
    rating.addEventListener('click', onClick);
    removers.push(() => rating.removeEventListener('click', onClick));
  }

  const quizChoices = owned.all<HTMLElement>('[data-lab-quiz-choice]');
  let quizFeedback = owned.first<HTMLElement>('[data-lab-quiz-feedback]');
  if (quizChoices.length > 0 && !quizFeedback) {
    quizFeedback = document.createElement('p');
    quizFeedback.setAttribute('data-lab-quiz-feedback', '');
    quizChoices[0].closest<HTMLElement>('[data-lab-view]')?.append(quizFeedback);
  }
  if (quizFeedback) {
    quizFeedback.setAttribute('role', 'status');
    quizFeedback.setAttribute('aria-live', 'polite');
  }
  for (const choice of quizChoices) {
    const onClick = (): void => {
      const correct = choice.dataset.labCorrect === 'true';
      for (const option of quizChoices) {
        option.setAttribute('aria-pressed', String(option === choice));
      }
      if (quizFeedback) quizFeedback.textContent = correct ? '正解です' : 'もう一度試してみましょう';
    };
    choice.addEventListener('click', onClick);
    removers.push(() => choice.removeEventListener('click', onClick));
  }

  applyView(initialView());

  const cleanup = (): void => {
    for (const remove of removers) remove();
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
