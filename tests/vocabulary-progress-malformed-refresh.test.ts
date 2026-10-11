import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  VocabularyProgressStore,
  VOCABULARY_PROGRESS_KEY,
} from '../src/domain/vocabularyProgress';

const savedEntries = { prior: { status: 'learned', knownStreak: 2 } };
const savedDocument = JSON.stringify({ version: 1, entries: savedEntries });
const arraySnapshots = [
  { name: 'empty entries array', raw: JSON.stringify({ version: 1, entries: [] }) },
  { name: 'populated entries array', raw: JSON.stringify({ version: 1, entries: [savedEntries.prior] }) },
];
const invalidSnapshots = [
  { name: 'invalid JSON', raw: '{broken' },
  { name: 'unsupported schema version', raw: JSON.stringify({ version: 2, entries: {} }) },
  { name: 'invalid entries field', raw: JSON.stringify({ version: 1, entries: 'invalid' }) },
  { name: 'JSON null', raw: 'null' },
  ...arraySnapshots,
];

function createStorage(initial: string | null) {
  let raw = initial;
  let writes = 0;
  let failWrites = false;
  let failRemovals = false;
  return {
    storage: {
      getItem(key: string): string | null {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        return raw;
      },
      setItem(key: string, value: string): void {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        writes += 1;
        if (failWrites) throw new Error('Storage write failed');
        raw = value;
      },
      removeItem(key: string): void {
        assert.equal(key, VOCABULARY_PROGRESS_KEY);
        if (failRemovals) throw new Error('Storage removal failed');
        raw = null;
      },
    },
    external(value: string | null) { raw = value; },
    setWriteFailure(value: boolean) { failWrites = value; },
    setRemovalFailure(value: boolean) { failRemovals = value; },
    getRaw: () => raw,
    getWrites: () => writes,
  };
}

describe('vocabulary progress refresh with malformed storage', () => {
  for (const { name, raw } of arraySnapshots) {
    it(`preserves saved progress through a pre-rating ${name}`, () => {
      const fixture = createStorage(savedDocument);
      const store = new VocabularyProgressStore(fixture.storage);
      fixture.external(raw);
      store.applyRating('new', 'known');
      assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
        ...savedEntries,
        new: { status: 'learning', knownStreak: 1 },
      });
      assert.equal(fixture.getWrites(), 1);
    });

    it(`keeps a pending rating across a ${name} roundtrip`, () => {
      const fixture = createStorage(savedDocument);
      const store = new VocabularyProgressStore(fixture.storage);
      fixture.setWriteFailure(true);
      store.applyRating('new', 'known');
      fixture.external(raw);
      store.refresh();
      fixture.external(savedDocument);
      store.refresh();
      assert.deepEqual(store.getAllEntries(), {
        ...savedEntries,
        new: { status: 'learning', knownStreak: 1 },
      });
      assert.equal(fixture.getWrites(), 1);
    });

    it(`does not resurrect a failed reset across a ${name} roundtrip`, () => {
      const fixture = createStorage(savedDocument);
      const store = new VocabularyProgressStore(fixture.storage);
      fixture.setRemovalFailure(true);
      store.resetAll();
      fixture.external(raw);
      store.refresh();
      fixture.external(savedDocument);
      store.refresh();
      assert.deepEqual(store.getAllEntries(), {});
      assert.equal(fixture.getWrites(), 0);
    });
  }

  it('accepts object-map entries with numeric-looking keys', () => {
    const numericEntries = { '0': savedEntries.prior };
    const fixture = createStorage(JSON.stringify({ version: 1, entries: numericEntries }));
    const store = new VocabularyProgressStore(fixture.storage);
    assert.deepEqual(store.getAllEntries(), numericEntries);
    store.applyRating('new', 'known');
    assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
      ...numericEntries,
      new: { status: 'learning', knownStreak: 1 },
    });
    assert.equal(fixture.getWrites(), 1);
  });

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

  it('keeps a pending rating when malformed storage returns to its last valid snapshot', () => {
    const fixture = createStorage(savedDocument);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.setWriteFailure(true);
    store.applyRating('new', 'known');
    fixture.external('{broken');
    store.refresh();
    fixture.external(savedDocument);
    store.refresh();
    assert.equal(store.getKnownStreak('new'), 1);
    assert.equal(store.getKnownStreak('prior'), 2);
    assert.equal(fixture.getWrites(), 1);
    fixture.setWriteFailure(false);
    store.applyRating('new', 'known');
    assert.deepEqual(JSON.parse(fixture.getRaw()!).entries, {
      ...savedEntries,
      new: { status: 'learned', knownStreak: 2 },
    });
  });

  it('does not resurrect a failed reset after a malformed-to-original snapshot roundtrip', () => {
    const fixture = createStorage(savedDocument);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.setRemovalFailure(true);
    store.resetAll();
    fixture.external('{broken');
    store.refresh();
    fixture.external(savedDocument);
    store.refresh();
    assert.deepEqual(store.getAllEntries(), {});
    assert.equal(fixture.getRaw(), savedDocument);
    assert.equal(fixture.getWrites(), 0);
    fixture.external(JSON.stringify({ version: 1, entries: { external: savedEntries.prior } }));
    store.refresh();
    assert.deepEqual(store.getAllEntries(), { external: savedEntries.prior });
  });

  it('does not replace the valid pending-write baseline with a malformed pre-rating read', () => {
    const fixture = createStorage(savedDocument);
    const store = new VocabularyProgressStore(fixture.storage);
    fixture.setWriteFailure(true);
    store.applyRating('new', 'known');
    fixture.external('{broken');
    store.applyRating('new', 'known');
    fixture.external(savedDocument);
    store.refresh();
    assert.equal(store.getKnownStreak('new'), 2);
    assert.equal(store.getKnownStreak('prior'), 2);
    assert.equal(fixture.getWrites(), 2);
    fixture.external(null);
    store.refresh();
    assert.deepEqual(store.getAllEntries(), {});
  });
});
