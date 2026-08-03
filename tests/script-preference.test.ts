import { describe, expect, it } from 'vitest';
import {
  SCRIPT_PREFERENCE_STORAGE_KEY,
  ScriptPreferenceStore,
  parsePreference,
  type ScriptPreference,
  type ScriptPreferenceDocument,
  type StorageLike,
} from '../src/lib/scriptPreference';

type StorageDouble = StorageLike & { values: Map<string, string> };

function createStorage(initial: Record<string, string> = {}): StorageDouble {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('inaccessible');
    },
    setItem: () => {
      throw new Error('inaccessible');
    },
    removeItem: () => {
      throw new Error('inaccessible');
    },
  };
}

function quotaStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
    removeItem: (key) => values.delete(key),
  };
}

function document(
  version: number,
  preference: unknown,
): ScriptPreferenceDocument | Record<string, unknown> {
  return { version, preference };
}

describe('parsePreference', () => {
  it('returns path-default for null (missing key)', () => {
    expect(parsePreference(null)).toBe('path-default');
  });

  it('parses every valid document to its value', () => {
    const preferences: ScriptPreference[] = ['path-default', 'traditional', 'simplified'];
    for (const preference of preferences) {
      const raw = JSON.stringify(document(1, preference));
      expect(parsePreference(raw)).toBe(preference);
    }
  });

  it('returns path-default for malformed JSON', () => {
    expect(parsePreference('{not json')).toBe('path-default');
  });

  it('returns path-default for an unknown-version document', () => {
    expect(parsePreference(JSON.stringify(document(2, 'traditional')))).toBe(
      'path-default',
    );
  });

  it('returns path-default for unknown preference values', () => {
    expect(parsePreference(JSON.stringify(document(1, 'trad')))).toBe('path-default');
    expect(parsePreference(JSON.stringify(document(1, 42)))).toBe('path-default');
    expect(parsePreference(JSON.stringify(document(1, null)))).toBe('path-default');
  });

  it('returns path-default for wrong-shape documents', () => {
    expect(parsePreference('"traditional"')).toBe('path-default');
    expect(parsePreference('["traditional"]')).toBe('path-default');
    expect(parsePreference('null')).toBe('path-default');
    expect(parsePreference('{}')).toBe('path-default');
    expect(parsePreference(JSON.stringify({ preference: 'traditional' }))).toBe(
      'path-default',
    );
  });
});

describe('ScriptPreferenceStore', () => {
  it('defaults to path-default on a missing key', () => {
    const store = new ScriptPreferenceStore(createStorage());
    expect(store.get()).toBe('path-default');
  });

  it('reads a valid stored preference', () => {
    const storage = createStorage({
      [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify(
        document(1, 'simplified'),
      ),
    });
    expect(new ScriptPreferenceStore(storage).get()).toBe('simplified');
  });

  it('falls back to path-default for malformed or unknown-version storage', () => {
    for (const raw of [
      '{malformed',
      JSON.stringify(document(2, 'traditional')),
      JSON.stringify({ version: 1, preference: 'garbage' }),
    ]) {
      const storage = createStorage({ [SCRIPT_PREFERENCE_STORAGE_KEY]: raw });
      expect(new ScriptPreferenceStore(storage).get()).toBe('path-default');
    }
  });

  it('falls back to path-default for throwing (inaccessible) storage', () => {
    const store = new ScriptPreferenceStore(throwingStorage());
    expect(store.get()).toBe('path-default');
  });

  it('writes the versioned document and only this key', () => {
    const storage = createStorage();
    const store = new ScriptPreferenceStore(storage);
    store.set('traditional');
    expect(JSON.parse(storage.getItem(SCRIPT_PREFERENCE_STORAGE_KEY) as string)).toEqual(
      { version: 1, preference: 'traditional' },
    );
    // No probe key or any other key remains behind.
    expect([...storage.values.keys()].filter((k) => k.startsWith('chabiko'))).toEqual([
      SCRIPT_PREFERENCE_STORAGE_KEY,
    ]);
  });

  it('touches only its own key during writes and reads', () => {
    const storage = createStorage({
      'chabiko_completed_lessons': '["lesson-001"]',
      'chabiko_theme': 'dark',
      'chabiko:basic-vocabulary-progress:v1': '{"version":1,"items":{}}',
    });
    const store = new ScriptPreferenceStore(storage);
    store.set('simplified');
    expect(storage.getItem('chabiko_completed_lessons')).toBe('["lesson-001"]');
    expect(storage.getItem('chabiko_theme')).toBe('dark');
    expect(storage.getItem('chabiko:basic-vocabulary-progress:v1')).toBe(
      '{"version":1,"items":{}}',
    );
  });

  it('keeps in-memory preference authoritative on quota failure and does not throw', () => {
    const store = new ScriptPreferenceStore(quotaStorage());
    expect(() => store.set('traditional')).not.toThrow();
    expect(store.get()).toBe('traditional');
  });

  it('cross-tab merge: last valid document wins', () => {
    const storage = createStorage();
    const tabA = new ScriptPreferenceStore(storage);
    const tabB = new ScriptPreferenceStore(storage);
    tabA.set('simplified');
    tabB.refresh();
    expect(tabB.get()).toBe('simplified');
    tabB.set('traditional');
    tabA.refresh();
    expect(tabA.get()).toBe('traditional');
    expect(tabB.get()).toBe('traditional');
  });

  it('reset clears only the preference key and returns to path-default', () => {
    const storage = createStorage({
      'chabiko_theme': 'dark',
      [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify(document(1, 'simplified')),
    });
    const store = new ScriptPreferenceStore(storage);
    store.reset();
    expect(store.get()).toBe('path-default');
    expect(storage.getItem(SCRIPT_PREFERENCE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('chabiko_theme')).toBe('dark');
  });

  it('acceptExternalClear returns to path-default when the key is gone', () => {
    const storage = createStorage();
    const store = new ScriptPreferenceStore(storage);
    store.set('simplified');
    storage.removeItem(SCRIPT_PREFERENCE_STORAGE_KEY);
    expect(store.acceptExternalClear()).toBe(true);
    expect(store.get()).toBe('path-default');
  });

  it('acceptExternalClear is rejected when a newer write repopulated the key', () => {
    const storage = createStorage();
    const store = new ScriptPreferenceStore(storage);
    store.set('simplified');
    storage.removeItem(SCRIPT_PREFERENCE_STORAGE_KEY);
    // A newer write from another tab repopulates the key before the stale
    // deletion event arrives.
    storage.setItem(
      SCRIPT_PREFERENCE_STORAGE_KEY,
      JSON.stringify(document(1, 'traditional')),
    );
    expect(store.acceptExternalClear()).toBe(false);
    expect(store.get()).toBe('simplified');
  });

  it('acceptExternalClear on inaccessible storage treats the clear as authoritative', () => {
    const store = new ScriptPreferenceStore(throwingStorage());
    expect(store.acceptExternalClear()).toBe(true);
    expect(store.get()).toBe('path-default');
  });

  it('refresh reloads the latest valid document from storage', () => {
    const storage = createStorage();
    const store = new ScriptPreferenceStore(storage);
    store.set('simplified');
    // Storage cleared externally.
    storage.removeItem(SCRIPT_PREFERENCE_STORAGE_KEY);
    store.refresh();
    expect(store.get()).toBe('path-default');
    // A later external write is picked up.
    storage.setItem(
      SCRIPT_PREFERENCE_STORAGE_KEY,
      JSON.stringify(document(1, 'traditional')),
    );
    store.refresh();
    expect(store.get()).toBe('traditional');
  });

  it('a null storage never throws and keeps the in-memory preference', () => {
    const store = new ScriptPreferenceStore(null);
    expect(store.get()).toBe('path-default');
    expect(() => store.set('simplified')).not.toThrow();
    expect(store.get()).toBe('simplified');
  });
});
