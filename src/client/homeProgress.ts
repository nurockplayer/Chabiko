import type { ProgressStore } from '../lib/progress';
import {
  buildProgressSnapshot,
  type LessonProgressEntry,
  type ProgressSnapshot,
} from '../lib/progressSnapshot';

interface LessonUIEntry extends LessonProgressEntry {
  readonly statusElement: HTMLElement;
  readonly routeItem: HTMLElement | null;
  readonly link: HTMLAnchorElement | null;
}

function collectLessonEntries(root: ParentNode): LessonUIEntry[] {
  const entries: LessonUIEntry[] = [];

  for (const statusElement of root.querySelectorAll<HTMLElement>(
    '.lesson-completion-status',
  )) {
    const id = statusElement.dataset.lessonId ?? '';
    if (!id) continue;

    const routeItem = statusElement.closest<HTMLElement>('[data-route-lesson]');
    const link = routeItem?.querySelector<HTMLAnchorElement>(
      '.lesson-list-link',
    ) ?? null;

    entries.push({
      id,
      completable: statusElement.dataset.completable === 'true',
      statusElement,
      routeItem,
      link,
    });
  }

  return entries;
}

function updateLessonList(
  entries: readonly LessonUIEntry[],
  store: ProgressStore,
  snapshot: ProgressSnapshot,
): void {
  for (const entry of entries) {
    const done = store.isComplete(entry.id);
    const current = entry.id === snapshot.currentLessonId;

    entry.routeItem?.classList.toggle('lesson-list-item--done', done);
    entry.routeItem?.classList.toggle('lesson-list-item--current', current);

    if (current) {
      entry.link?.setAttribute('aria-current', 'step');
    } else {
      entry.link?.removeAttribute('aria-current');
    }

    if (done) {
      entry.statusElement.textContent = '✓ 完了';
      entry.statusElement.className =
        'lesson-completion-status lesson-completion-status--done';
    } else if (current) {
      entry.statusElement.textContent = '進行中';
      entry.statusElement.className =
        'lesson-completion-status lesson-completion-status--current';
    } else {
      entry.statusElement.textContent = 'このあと';
      entry.statusElement.className = 'lesson-completion-status';
    }
  }
}

function updateGoalPath(
  root: ParentNode,
  entries: readonly LessonUIEntry[],
  snapshot: ProgressSnapshot,
): void {
  const card = root.querySelector<HTMLAnchorElement>('[data-goal-path-card]');
  if (!card) return;

  const label = card.querySelector<HTMLElement>('[data-goal-path-label]');
  const example = card.querySelector<HTMLElement>('[data-goal-path-example]');
  const status = card.querySelector<HTMLElement>('[data-goal-path-status]');
  if (!label || !example || !status) return;

  card.classList.remove(
    'path-card--active',
    'path-card--complete',
    'path-card--disabled',
  );
  status.className = 'path-status';

  const currentEntry = entries.find(
    (entry) => entry.id === snapshot.currentLessonId,
  );

  if (currentEntry) {
    const title = currentEntry.routeItem?.dataset.routeTitle ?? '';
    const sentence = currentEntry.routeItem?.dataset.routeExample ?? '';

    card.classList.add('path-card--active');
    card.setAttribute('aria-current', 'step');
    card.dataset.currentLessonId = currentEntry.id;
    label.textContent = title;
    example.textContent = sentence;
    example.hidden = sentence === '';
    status.textContent = '進行中';
    return;
  }

  card.removeAttribute('aria-current');
  delete card.dataset.currentLessonId;
  label.textContent = card.dataset.routeName ?? '';
  example.textContent = '';
  example.hidden = true;

  if (snapshot.routeComplete) {
    card.classList.add('path-card--complete');
    status.className = 'path-status path-status--done';
    status.textContent = '✓ 完了';
  } else {
    card.classList.add('path-card--disabled');
    status.className = 'path-status path-status--pending';
    status.textContent = '準備中';
  }
}

/**
 * Render every home progress surface from one progress snapshot.
 * Returns the snapshot so lifecycle tests and future consumers can inspect the
 * same state that drove both the lesson list and the goal-path sidebar.
 */
export function updateHomeProgressUI(
  root: ParentNode,
  store: ProgressStore,
): ProgressSnapshot {
  const entries = collectLessonEntries(root);
  const snapshot = buildProgressSnapshot(store, entries);

  updateLessonList(entries, store, snapshot);
  updateGoalPath(root, entries, snapshot);

  const summary = root.querySelector<HTMLElement>('#progress-summary');
  if (summary) {
    summary.textContent = snapshot.summaryText;
  }

  return snapshot;
}
