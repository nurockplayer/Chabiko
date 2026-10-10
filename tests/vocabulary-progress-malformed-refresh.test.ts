import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  VocabularyProgressStore,
  VOCABULARY_PROGRESS_KEY,
} from '../src/domain/vocabularyProgress';

const savedEntries = { prior: { status: 'learned', knownStreak: 2 } };
const savedDocument = JSON.stringify({ version: 1, entries: savedEntries });
const invalidSnapshots = [
  { name: 'invalid JSON', raw: '{broken' },
  { name: 'unsupported schema version', raw: JSON.stringify({ version: 2, entries: {} }) },
  { name: 'invalid entries field', raw: JSON.stringify({ version: 1, entries: 'invalid' }) },
  { name: 'JSON null', raw: 'null' },
];

function createStorage(initial: string | null) {
  let raw = initial;
  let writes = 0;
  return {
    storage: {
      getItem(key: string): string | null {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        return raw;
      },
      setItem(key: string, value: string): void {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        writes += 1;
        raw = value;
      },
      removeItem(key: string): void {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        raw = null;
      },
    },
    external(value: string | null) { raw = value; },
    getRaw: () => raw,
    getWrites: () => writes,
  };
}

describe('vocabulary progress refresh with malformed storage', () => {
  for (const { name, raw } of invalidSnapshots) {
    it(`retains established progress through ${name} and the next rating`, () => {
      const fixture = createStorage(savedDocument);
      const store = new VocabularyProgressStore(fixture.storage);
      fixture.external(raw);
      store.refresh();
      store.refresh();
      assert.deepEqual(store.getAllEntries(), savedEntries);
      assert.deepEqual(store.prioritize(['prior', 'new']), ['new', 'prior']);
      assert.equal(fixture.getRaw(), raw);
      assert.equal(fixture.getWrites(), 0);
      store.applyRating('new', 'known');
      assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
        ...savedEntries,
        new: { status: 'learning', knownStreak: 1 },
      });
      assert.equal(fixture.getWrites(), 1);
    });
  }

  it('starts empty on malformed initial reads and accepts a valid later snapshot', () => {
    for (const { raw } of invalidSnapshots) {
      const fixture = createStorage(raw);
      const store = new VocabularyProgressStore(fixture.storage);
      assert.deepEqual(store.getAllEntries(), {});
      store.refresh();
      assert.deepEqual(store.getAllEntries(), {});
      fixture.external(savedDocument);
      store.refresh();
      assert.deepEqual(store.getAllEntries(), savedEntries);
      assert.equal(fixture.getWrites(), 0);
    }
  });

  for (const { name, raw } of [
    { name: 'removed storage key', raw: null },
    { name: 'valid empty document', raw: JSON.stringify({ version: 1, entries: {} }) },
  ]) {
    it(`honors an explicit reset via ${name} after malformed storage`, () => {
      const fixture = createStorage(savedDocument);
      const store = new VocabularyProgressStore(fixture.storage);
      fixture.external('{broken');
      store.refresh();
      fixture.external(raw);
      store.refresh();
      assert.deepEqual(store.getAllEntries(), {});
      assert.equal(fixture.getWrites(), 0);
      store.applyRating('after-reset', 'known');
      assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
        'after-reset': { status: 'learning', knownStreak: 1 },
      });
    });
  }

  it('accepts a valid replacement document after malformed storage without a write', () => {
    const fixture = createStorage(savedDocument);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.external('{broken');
    store.refresh();
    const replacement = { external: { status: 'learning', knownStreak: 1 } };
    fixture.external(JSON.stringify({ version: 1, entries: replacement }));
    store.refresh();
    assert.deepEqual(store.getAllEntries(), replacement);
    assert.equal(fixture.getWrites(), 0);
  });
});
