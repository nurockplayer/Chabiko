import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  VocabularyProgressStore,
  VOCABULARY_PROGRESS_KEY,
} from '../src/domain/vocabularyProgress';

function createTransientStorage(initial: string | null = null) {
  let raw = initial;
  let unavailable = false;
  let writes = 0;
  return {
    storage: {
      getItem(key: string): string | null {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        if (unavailable) throw new Error('Storage temporarily unavailable');
        return raw;
      },
      setItem(key: string, value: string): void {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        writes += 1;
        if (unavailable) throw new Error('Storage temporarily unavailable');
        raw = value;
      },
      removeItem(key: string): void {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        if (unavailable) throw new Error('Storage temporarily unavailable');
        raw = null;
      },
    },
    setUnavailable(value: boolean) { unavailable = value; },
    external(value: string | null) { raw = value; },
    getRaw: () => raw,
    getWrites: () => writes,
  };
}

const savedProgress = JSON.stringify({
  version: 1,
  entries: { prior: { status: 'learned', knownStreak: 2 } },
});

describe('vocabulary progress through temporary storage read failures', () => {
  it('starts empty when the initial read fails and accepts readable storage later', () => {
    const fixture = createTransientStorage(savedProgress);
    fixture.setUnavailable(true);
    const store = new VocabularyProgressStore(fixture.storage);
    assert.deepEqual(store.getAllEntries(), {});
    store.refresh();
    assert.deepEqual(store.getAllEntries(), {});
    fixture.setUnavailable(false);
    store.refresh();
    assert.equal(store.getKnownStreak('prior'), 2);
    assert.equal(fixture.getWrites(), 0);
  });

  it('preserves successfully persisted progress and priority through repeated failed refreshes', () => {
    const fixture = createTransientStorage();
    const store = new VocabularyProgressStore(fixture.storage);
    store.applyRating('prior', 'known');
    store.applyRating('prior', 'known');
    const persisted = fixture.getRaw();
    fixture.setUnavailable(true);
    store.refresh();
    store.refresh();
    assert.equal(store.getKnownStreak('prior'), 2);
    assert.equal(store.getStatus('prior'), 'learned');
    assert.deepEqual(store.prioritize(['prior', 'new']), ['new', 'prior']);
    assert.equal(fixture.getRaw(), persisted);
    assert.equal(fixture.getWrites(), 2);
  });

  it('retains unrelated saved entries when a rating fails to persist and storage recovers', () => {
    const fixture = createTransientStorage(savedProgress);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.setUnavailable(true);
    store.refresh();
    store.applyRating('new', 'known');
    store.refresh();
    assert.equal(store.getKnownStreak('prior'), 2);
    assert.equal(store.getKnownStreak('new'), 1);
    assert.equal(fixture.getRaw(), savedProgress);
    assert.equal(fixture.getWrites(), 1);
    fixture.setUnavailable(false);
    store.applyRating('new', 'known');
    assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
      prior: { status: 'learned', knownStreak: 2 },
      new: { status: 'learned', knownStreak: 2 },
    });
    assert.equal(fixture.getWrites(), 2);
  });

  it('honors an observed external reset after temporary read failure and a pending rating', () => {
    const fixture = createTransientStorage(savedProgress);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.setUnavailable(true);
    store.refresh();
    store.applyRating('new', 'known');
    fixture.external(null);
    fixture.setUnavailable(false);
    store.refresh();
    assert.deepEqual(store.getAllEntries(), {});
    assert.equal(fixture.getRaw(), null);
    assert.equal(fixture.getWrites(), 1);
    store.applyRating('after-reset', 'known');
    assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
      'after-reset': { status: 'learning', knownStreak: 1 },
    });
  });

  it('accepts a changed external document after temporary read failure without another write', () => {
    const fixture = createTransientStorage(savedProgress);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.setUnavailable(true);
    store.refresh();
    const external = { other: { status: 'learning', knownStreak: 1 } };
    fixture.external(JSON.stringify({ version: 1, entries: external }));
    fixture.setUnavailable(false);
    store.refresh();
    assert.deepEqual(store.getAllEntries(), external);
    assert.equal(fixture.getWrites(), 0);
  });
});
