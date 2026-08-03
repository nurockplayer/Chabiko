// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import {
  BasicVocabularyProgressStore,
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import type { StorageLike } from '../src/lib/progress';

const REAL_IDS = [
  'teacher-star-1-37e0eb213f0f',
  'teacher-star-1-a66948a76fda',
  'teacher-star-1-8b957a100bd4',
] as const;

const sessionCleanups = new Set<() => void>();

function rootWith(): HTMLElement {
  const root = document.createElement('section');
  root.dataset.basicVocabularyIds = JSON.stringify([...REAL_IDS]);
  root.innerHTML =
    '<p data-summary></p><p data-progress aria-live="polite"></p><div data-card></div><button data-action="reset">reset</button>';
  document.body.append(root);
  return root;
}

function initialize(root: HTMLElement): void {
  sessionCleanups.add(initBasicVocabularySession(root));
}

function reveal(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('[data-action="reveal"]')?.click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  root.querySelector<HTMLButtonElement>(`[data-rating="${rating}"]`)?.click();
}

function progressDocument(
  items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }>,
): string {
  return JSON.stringify({ version: 1, items });
}

afterEach(() => {
  for (const cleanup of sessionCleanups) cleanup();
  sessionCleanups.clear();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('authoritative external basic-vocabulary progress deletion', () => {
  it('drops failed pending state so the next successful rating cannot resurrect it', () => {
    const data = new Map<string, string>();
    let failWrites = true;
    const storage: StorageLike = {
      getItem(key) {
        return data.get(key) ?? null;
      },
      setItem(key, value) {
        if (failWrites) throw new Error('quota');
        data.set(key, value);
      },
      removeItem(key) {
        data.delete(key);
      },
    };
    const store = new BasicVocabularyProgressStore(storage);

    store.applyRating('a', 'known');
    expect(store.getKnownStreak('a')).toBe(1);
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();

    expect(store.acceptExternalClear()).toBe(true);
    expect(store.getStatus('a')).toBe('new');

    failWrites = false;
    store.applyRating('b', 'known');

    expect(store.getStatus('a')).toBe('new');
    expect(store.getKnownStreak('b')).toBe(1);
    expect(JSON.parse(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!)).toEqual({
      version: 1,
      items: {
        b: { status: 'learning', knownStreak: 1 },
      },
    });
  });

  it('keeps ordinary refresh fallback distinct from an explicit external clear', () => {
    const storage: StorageLike = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(storage);

    store.applyRating('a', 'known');
    store.refresh();
    expect(store.getKnownStreak('a')).toBe(1);

    expect(store.acceptExternalClear()).toBe(true);
    expect(store.getStatus('a')).toBe('new');
  });

  it('rejects a delayed deletion event after the key has been repopulated', () => {
    const stored = progressDocument({
      a: { status: 'learning', knownStreak: 1 },
    });
    const storage: StorageLike = {
      getItem(key) {
        return key === BASIC_VOCABULARY_PROGRESS_KEY ? stored : null;
      },
      setItem() {},
      removeItem() {},
    };
    const store = new BasicVocabularyProgressStore(storage);

    expect(store.acceptExternalClear()).toBe(false);
    expect(store.getKnownStreak('a')).toBe(1);
  });

  it('treats exact-key deletion as authoritative and rebuilds summary and order', () => {
    const stored = progressDocument({
      [REAL_IDS[1]]: { status: 'learning', knownStreak: 1 },
    });
    window.localStorage.setItem(BASIC_VOCABULARY_PROGRESS_KEY, stored);

    const root = rootWith();
    initialize(root);
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');

    window.localStorage.removeItem(BASIC_VOCABULARY_PROGRESS_KEY);
    window.dispatchEvent(new StorageEvent('storage', {
      key: BASIC_VOCABULARY_PROGRESS_KEY,
      oldValue: stored,
      newValue: null,
      storageArea: window.localStorage,
    }));

    expect(root.querySelector('[data-card]')?.textContent).toContain('大家');
    expect(root.querySelector('[data-progress]')?.textContent).toBe('0 / 3 語');
    expect(root.querySelector('[data-summary]')?.textContent)
      .toBe('新規 3語・学習中 0語・習得済み 0語');
  });

  it('treats localStorage.clear as authoritative even after the current tab rated', () => {
    const root = rootWith();
    initialize(root);

    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');
    expect(root.querySelector('[data-summary]')?.textContent).toContain('学習中 1語');

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', {
      key: null,
      storageArea: window.localStorage,
    }));

    expect(root.querySelector('[data-card]')?.textContent).toContain('大家');
    expect(root.querySelector('[data-progress]')?.textContent).toBe('0 / 3 語');
    expect(root.querySelector('[data-summary]')?.textContent)
      .toBe('新規 3語・学習中 0語・習得済み 0語');
  });

  it('preserves a newer current-tab write when a deletion event arrives late', () => {
    const root = rootWith();
    initialize(root);

    reveal(root);
    rate(root, 'known');
    const newerValue = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(newerValue).not.toBeNull();
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');

    window.dispatchEvent(new StorageEvent('storage', {
      key: BASIC_VOCABULARY_PROGRESS_KEY,
      oldValue: newerValue,
      newValue: null,
      storageArea: window.localStorage,
    }));

    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(newerValue);
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');
    expect(root.querySelector('[data-summary]')?.textContent).toContain('学習中 1語');
  });

  it('ignores sessionStorage.clear even though its storage-event key is null', () => {
    const root = rootWith();
    initialize(root);

    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-card]')?.textContent).toContain('人');

    window.dispatchEvent(new StorageEvent('storage', {
      key: null,
      storageArea: window.sessionStorage,
    }));

    expect(root.querySelector('[data-card]')?.textContent).toContain('人');
    expect(root.querySelector('[data-summary]')?.textContent).toContain('学習中 1語');
  });
});
