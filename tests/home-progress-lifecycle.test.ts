// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { updateHomeProgressUI } from '../src/client/homeProgress';
import { ProgressStore, STORAGE_KEY } from '../src/lib/progress';
import { handleProgressStorageEvent } from '../src/lib/progressSnapshot';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function mountHome(): void {
  document.body.innerHTML = `
    <aside>
      <a
        class="path-card path-card--active"
        href="/#taiwan-travel-path"
        aria-current="step"
        data-goal-path-card
        data-route-name="台湾旅行で使える中国語"
        data-current-lesson-id="lesson-1"
      >
        <span data-goal-path-label>第一課</span>
        <span data-goal-path-example>第一句</span>
        <span class="path-status" data-goal-path-status>進行中</span>
      </a>
    </aside>
    <ol>
      <li
        class="lesson-list-item"
        data-route-lesson="lesson-1"
        data-route-title="第一課"
        data-route-example="第一句"
      >
        <a class="lesson-list-link" href="/lessons/lesson-1/">
          <span
            class="lesson-completion-status"
            data-lesson-id="lesson-1"
            data-completable="true"
          ></span>
        </a>
      </li>
      <li
        class="lesson-list-item"
        data-route-lesson="lesson-2"
        data-route-title="第二課"
        data-route-example="第二句"
      >
        <a class="lesson-list-link" href="/lessons/lesson-2/">
          <span
            class="lesson-completion-status"
            data-lesson-id="lesson-2"
            data-completable="true"
          ></span>
        </a>
      </li>
      <li
        class="lesson-list-item"
        data-route-lesson="lesson-draft"
        data-route-title="準備中の課"
        data-route-example=""
      >
        <a class="lesson-list-link" href="/lessons/lesson-draft/">
          <span
            class="lesson-completion-status"
            data-lesson-id="lesson-draft"
            data-completable="false"
          ></span>
        </a>
      </li>
    </ol>
    <span id="progress-summary"></span>
  `;
}

function currentMainLessonId(): string | null {
  return document
    .querySelector<HTMLElement>('[data-route-lesson] .lesson-list-link[aria-current="step"]')
    ?.closest<HTMLElement>('[data-route-lesson]')
    ?.dataset.routeLesson ?? null;
}

function sidebarCard(): HTMLAnchorElement {
  const card = document.querySelector<HTMLAnchorElement>('[data-goal-path-card]');
  if (!card) throw new Error('goal-path card is missing');
  return card;
}

function sidebarStatus(): string {
  return document.querySelector('[data-goal-path-status]')?.textContent ?? '';
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('shared home progress snapshot', () => {
  it('uses lesson 1 as the one logical current step for fresh progress', () => {
    mountHome();
    const snapshot = updateHomeProgressUI(document, new ProgressStore(null));

    expect(snapshot.currentLessonId).toBe('lesson-1');
    expect(snapshot.routeComplete).toBe(false);
    expect(currentMainLessonId()).toBe('lesson-1');
    expect(sidebarCard().dataset.currentLessonId).toBe('lesson-1');
    expect(sidebarCard().getAttribute('aria-current')).toBe('step');
    expect(document.querySelector('[data-goal-path-label]')?.textContent)
      .toBe('第一課');
    expect(document.querySelector('[data-goal-path-example]')?.textContent)
      .toBe('第一句');
    expect(sidebarStatus()).toBe('進行中');
    expect(document.querySelectorAll('.lesson-list-item--current')).toHaveLength(1);
  });

  it('moves both surfaces to the next incomplete completable lesson', () => {
    mountHome();
    const store = new ProgressStore(null);
    store.markComplete('lesson-1');

    const snapshot = updateHomeProgressUI(document, store);

    expect(snapshot.currentLessonId).toBe('lesson-2');
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.totalCount).toBe(2);
    expect(currentMainLessonId()).toBe('lesson-2');
    expect(sidebarCard().dataset.currentLessonId).toBe('lesson-2');
    expect(document.querySelector('[data-goal-path-label]')?.textContent)
      .toBe('第二課');
    expect(document.querySelector('[data-goal-path-example]')?.textContent)
      .toBe('第二句');
    expect(document.querySelector('[data-route-lesson="lesson-1"]')?.classList)
      .toContain('lesson-list-item--done');
    expect(document.getElementById('progress-summary')?.textContent)
      .toBe('1 / 2 レッスン完了');
  });

  it('shows a completed route with no stale current or in-progress state', () => {
    mountHome();
    const store = new ProgressStore(null);
    store.markComplete('lesson-1');
    store.markComplete('lesson-2');

    const snapshot = updateHomeProgressUI(document, store);
    const card = sidebarCard();
    const example = document.querySelector<HTMLElement>('[data-goal-path-example]');

    expect(snapshot.currentLessonId).toBeNull();
    expect(snapshot.routeComplete).toBe(true);
    expect(currentMainLessonId()).toBeNull();
    expect(document.querySelectorAll('.lesson-list-item--current')).toHaveLength(0);
    expect(card.hasAttribute('aria-current')).toBe(false);
    expect(card.dataset.currentLessonId).toBeUndefined();
    expect(card.classList).toContain('path-card--complete');
    expect(document.querySelector('[data-goal-path-label]')?.textContent)
      .toBe('台湾旅行で使える中国語');
    expect(example?.hidden).toBe(true);
    expect(sidebarStatus()).toBe('✓ 完了');
    expect(document.body.textContent).not.toContain('進行中');
    expect(document.getElementById('progress-summary')?.textContent)
      .toBe('2 / 2 レッスン完了');
  });

  it('never promotes an incomplete non-completable lesson to current', () => {
    mountHome();
    const store = new ProgressStore(null);
    store.markComplete('lesson-1');
    store.markComplete('lesson-2');

    const snapshot = updateHomeProgressUI(document, store);

    expect(snapshot.routeComplete).toBe(true);
    expect(snapshot.currentLessonId).toBeNull();
    expect(document.querySelector('[data-route-lesson="lesson-draft"] .lesson-completion-status')?.textContent)
      .toBe('このあと');
    expect(document.querySelector('[data-route-lesson="lesson-draft"] .lesson-list-link')?.hasAttribute('aria-current'))
      .toBe(false);
  });
});

describe('home progress lifecycle', () => {
  it('refreshes both surfaces from a cross-tab storage event', () => {
    mountHome();
    const storage = createStorage();
    let store = new ProgressStore(storage);
    updateHomeProgressUI(document, store);

    const otherTab = new ProgressStore(storage);
    otherTab.markComplete('lesson-1');

    let refreshCount = 0;
    handleProgressStorageEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: storage.getItem(STORAGE_KEY),
      }),
      () => {
        refreshCount++;
        store = new ProgressStore(storage);
        updateHomeProgressUI(document, store);
      },
    );

    expect(refreshCount).toBe(1);
    expect(currentMainLessonId()).toBe('lesson-2');
    expect(sidebarCard().dataset.currentLessonId).toBe('lesson-2');
    expect(document.getElementById('progress-summary')?.textContent)
      .toBe('1 / 2 レッスン完了');
  });

  it('refreshes both surfaces from a new pageshow store snapshot', () => {
    mountHome();
    const storage = createStorage();
    updateHomeProgressUI(document, new ProgressStore(storage));

    const otherPage = new ProgressStore(storage);
    otherPage.markComplete('lesson-1');

    const pageshowStore = new ProgressStore(storage);
    updateHomeProgressUI(document, pageshowStore);

    expect(currentMainLessonId()).toBe('lesson-2');
    expect(sidebarCard().dataset.currentLessonId).toBe('lesson-2');
  });

  it('resets both surfaces together', () => {
    mountHome();
    const storage = createStorage();
    const store = new ProgressStore(storage);
    store.markComplete('lesson-1');
    updateHomeProgressUI(document, store);
    expect(currentMainLessonId()).toBe('lesson-2');

    store.resetAll();
    const snapshot = updateHomeProgressUI(document, store);

    expect(snapshot.completedCount).toBe(0);
    expect(snapshot.currentLessonId).toBe('lesson-1');
    expect(currentMainLessonId()).toBe('lesson-1');
    expect(sidebarCard().dataset.currentLessonId).toBe('lesson-1');
    expect(document.getElementById('progress-summary')?.textContent).toBe('');
  });

  it('keeps the production pageshow, storage, and reset paths on the same renderer', () => {
    const source = readFileSync(
      new URL('../src/pages/index.astro', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { updateHomeProgressUI } from '../client/homeProgress'");
    expect(source).toMatch(/function updateCompletionUI\(\)\s*{\s*updateHomeProgressUI\(document, store\);\s*}/);
    expect(source).toMatch(/function refreshUI\(\)[\s\S]*?new ProgressStore\(\);[\s\S]*?updateCompletionUI\(\);/);
    expect(source).toContain("window.addEventListener('pageshow', refreshUI)");
    expect(source).toContain('handleProgressStorageEvent(event, refreshUI)');
    expect(source).toMatch(/store\.resetAll\(\);\s*updateCompletionUI\(\);/);
  });

  it('is safe when the no-lessons fallback exposes no progress surfaces', () => {
    document.body.innerHTML = '<article>レッスンを読み込めませんでした</article>';

    const snapshot = updateHomeProgressUI(document, new ProgressStore(null));

    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.currentLessonId).toBeNull();
    expect(snapshot.routeComplete).toBe(false);
  });
});
