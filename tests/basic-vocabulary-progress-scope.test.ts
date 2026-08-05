// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BasicVocabularyProgressStore,
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import {
  BASIC_VOCABULARY_GUEST_SCOPE,
  getBasicVocabularyProgressStorageKey,
  isValidSupabaseUserId,
} from '../src/domain/basicVocabularyProgressScope';
import type { BasicVocabularyProgressScope } from '../src/domain/basicVocabularyProgressScope';
import type { StorageLike } from '../src/lib/progress';

const USER_ID = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
const USER_KEY = `chabiko:basic-vocabulary-progress:user:${USER_ID}:v1`;

// ─── Fake storage ───────────────────────────────────────────────────────────────

function fakeStorage(initial?: Record<string, string>): StorageLike {
  const data: Record<string, string> = { ...initial };
  return {
    getItem(key: string): string | null {
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      data[key] = value;
    },
    removeItem(key: string): void {
      delete data[key];
    },
  };
}

/** Like fakeStorage, but also records every key any operation touches. */
function trackingStorage(
  initial?: Record<string, string>,
): { storage: StorageLike; touchedKeys: () => string[] } {
  const data: Record<string, string> = { ...initial };
  const touched = new Set(Object.keys(data));
  const storage: StorageLike = {
    getItem(key: string): string | null {
      touched.add(key);
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      touched.add(key);
      data[key] = value;
    },
    removeItem(key: string): void {
      touched.add(key);
      delete data[key];
    },
  };
  return { storage, touchedKeys: () => [...touched] };
}

function progressDocument(
  items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }>,
): string {
  return JSON.stringify({ version: 1, items });
}

function readDoc(storage: StorageLike, key: string): Record<string, unknown> | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

// ─── Key contract ───────────────────────────────────────────────────────────────

describe('basic vocabulary progress scope keys', () => {
  it('guest key is exactly the legacy constant', () => {
    expect(BASIC_VOCABULARY_GUEST_SCOPE).toEqual({ kind: 'guest' });
    expect(getBasicVocabularyProgressStorageKey(BASIC_VOCABULARY_GUEST_SCOPE)).toBe(
      BASIC_VOCABULARY_PROGRESS_KEY,
    );
    expect(BASIC_VOCABULARY_PROGRESS_KEY).toBe(
      'chabiko:basic-vocabulary-progress:v1',
    );
  });

  it('valid canonical UUID produces the exact user key', () => {
    expect(isValidSupabaseUserId(USER_ID)).toBe(true);
    const scope: BasicVocabularyProgressScope = { kind: 'user', userId: USER_ID };
    expect(getBasicVocabularyProgressStorageKey(scope)).toBe(USER_KEY);
  });

  it('rejects uppercase, malformed, blank, whitespace-padded, path-like, and non-UUID IDs', () => {
    const invalid = [
      USER_ID.toUpperCase(),
      'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1',
      'not-a-uuid',
      '',
      '  ',
      ` ${USER_ID} `,
      `/users/${USER_ID}`,
      `user:${USER_ID}`,
      'email@example.com',
      '12345',
      'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e-extra',
    ];
    for (const id of invalid) {
      expect(isValidSupabaseUserId(id)).toBe(false);
    }
    for (const id of invalid) {
      expect(() =>
        getBasicVocabularyProgressStorageKey({ kind: 'user', userId: id }),
      ).toThrow();
    }
  });
});

// ─── Store key routing ──────────────────────────────────────────────────────────

describe('BasicVocabularyProgressStore scoped storage', () => {
  it('default constructor reads, writes, and removes only the guest key', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage);

    expect(store.getStorageKey()).toBe(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(store.isRelevantStorageKey(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(true);

    store.applyRating('a', 'known');
    expect(readDoc(storage, BASIC_VOCABULARY_PROGRESS_KEY)).toEqual(
      JSON.parse(progressDocument({ a: { status: 'learning', knownStreak: 1 } })),
    );
    expect(readDoc(storage, USER_KEY)).toBeNull();

    store.resetAll();
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();
    expect(storage.getItem(USER_KEY)).toBeNull();
  });

  it('explicit user store reads, writes, and removes only its own key', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage, USER_KEY);

    expect(store.getStorageKey()).toBe(USER_KEY);

    store.applyRating('a', 'known');
    expect(readDoc(storage, USER_KEY)).toEqual(
      JSON.parse(progressDocument({ a: { status: 'learning', knownStreak: 1 } })),
    );
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();

    store.resetAll();
    expect(storage.getItem(USER_KEY)).toBeNull();
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();
  });

  it('an empty physical key throws synchronously', () => {
    expect(() => new BasicVocabularyProgressStore(fakeStorage(), '')).toThrow();
  });

  it('isRelevantStorageKey matches exact key, unrelated key, and null clear', () => {
    const storage = fakeStorage();
    const guest = new BasicVocabularyProgressStore(storage);
    const user = new BasicVocabularyProgressStore(storage, USER_KEY);

    expect(guest.isRelevantStorageKey(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(true);
    expect(guest.isRelevantStorageKey(USER_KEY)).toBe(false);
    expect(guest.isRelevantStorageKey('other-key')).toBe(false);
    expect(guest.isRelevantStorageKey(null)).toBe(true);

    expect(user.isRelevantStorageKey(USER_KEY)).toBe(true);
    expect(user.isRelevantStorageKey(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(false);
    expect(user.isRelevantStorageKey('other-key')).toBe(false);
    expect(user.isRelevantStorageKey(null)).toBe(true);
  });

  it('two user stores and a guest store remain mutually isolated in one storage object', () => {
    const { storage, touchedKeys } = trackingStorage();
    const otherUserId = 'aaaa1111-2222-3333-4444-555566667777';
    const otherUserKey = `chabiko:basic-vocabulary-progress:user:${otherUserId}:v1`;
    const guest = new BasicVocabularyProgressStore(storage);
    const userA = new BasicVocabularyProgressStore(storage, USER_KEY);
    const userB = new BasicVocabularyProgressStore(storage, otherUserKey);

    guest.applyRating('g', 'known');
    userA.applyRating('a', 'known');
    userB.applyRating('b', 'known');

    expect(touchedKeys().sort()).toEqual(
      [BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY, otherUserKey].sort(),
    );
    expect(readDoc(storage, BASIC_VOCABULARY_PROGRESS_KEY)).toEqual(
      JSON.parse(progressDocument({ g: { status: 'learning', knownStreak: 1 } })),
    );
    expect(readDoc(storage, USER_KEY)).toEqual(
      JSON.parse(progressDocument({ a: { status: 'learning', knownStreak: 1 } })),
    );
    expect(readDoc(storage, otherUserKey)).toEqual(
      JSON.parse(progressDocument({ b: { status: 'learning', knownStreak: 1 } })),
    );

    const freshGuest = new BasicVocabularyProgressStore(storage);
    const freshUserA = new BasicVocabularyProgressStore(storage, USER_KEY);
    const freshUserB = new BasicVocabularyProgressStore(storage, otherUserKey);
    expect(freshGuest.getStatus('g')).toBe('learning');
    expect(freshGuest.getStatus('a')).toBe('new');
    expect(freshGuest.getStatus('b')).toBe('new');
    expect(freshUserA.getStatus('a')).toBe('learning');
    expect(freshUserA.getStatus('g')).toBe('new');
    expect(freshUserB.getStatus('b')).toBe('learning');
  });

  it('reset of one scope leaves the other two byte-identical', () => {
    const storage = fakeStorage();
    const otherUserId = 'bbbb2222-3333-4444-5555-666677778888';
    const otherUserKey = `chabiko:basic-vocabulary-progress:user:${otherUserId}:v1`;
    const guest = new BasicVocabularyProgressStore(storage);
    const userA = new BasicVocabularyProgressStore(storage, USER_KEY);
    const userB = new BasicVocabularyProgressStore(storage, otherUserKey);

    guest.applyRating('g', 'known');
    userA.applyRating('a', 'known');
    userA.applyRating('a', 'known');
    userB.applyRating('b', 'known');

    const guestDoc = storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!;
    const userBDoc = storage.getItem(otherUserKey)!;

    userA.resetAll();

    expect(storage.getItem(USER_KEY)).toBeNull();
    expect(storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBe(guestDoc);
    expect(storage.getItem(otherUserKey)).toBe(userBDoc);
  });

  it('v1 serialized document has exactly version and items, items exactly status/knownStreak', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage, USER_KEY);
    store.applyRating('a', 'known');

    const stored = storage.getItem(USER_KEY)!;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['version', 'items']);
    expect(parsed.version).toBe(1);

    const item = (parsed.items as Record<string, Record<string, unknown>>).a;
    expect(Object.keys(item)).toEqual(['status', 'knownStreak']);
    expect(item.status).toBe('learning');
    expect(item.knownStreak).toBe(1);

    // No scope, user ID, timestamps, review order, dirty flags, or sync metadata.
    expect(parsed).not.toHaveProperty('scope');
    expect(parsed).not.toHaveProperty('userId');
    expect(parsed).not.toHaveProperty('updatedAt');
    expect(parsed).not.toHaveProperty('reviewOrder');
    expect(parsed).not.toHaveProperty('dirty');
    expect(parsed).not.toHaveProperty('resetGeneration');
    expect(parsed).not.toHaveProperty('sync');
    expect(item).not.toHaveProperty('userId');
  });

  it('LRU order and selector output are unchanged under a scoped key', () => {
    const storage = fakeStorage();
    const store = new BasicVocabularyProgressStore(storage, USER_KEY);
    store.applyRating('b', 'known');
    store.applyRating('a', 'known');
    store.applyRating('c', 'unsure');

    // Persisted insertion order is the LRU rotation: least-recently-reviewed
    // first (Issue #204), exactly as under the guest key.
    const stored = JSON.parse(storage.getItem(USER_KEY)!) as {
      items: Record<string, unknown>;
    };
    expect(Object.keys(stored.items)).toEqual(['b', 'a', 'c']);

    // All three items are learning; when learning fits the window the selector
    // keeps stable source order, identical to the guest-key behavior.
    expect(store.selectSession(['b', 'a', 'c'], 3)).toEqual(['b', 'a', 'c']);
  });
});

// ─── Failure-path parity across guest and user keys ─────────────────────────────

describe('scoped store failure paths', () => {
  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'write failure keeps memory for %s',
    (key) => {
      const storage = fakeStorage();
      let failWrites = true;
      const quotaStorage: StorageLike = {
        getItem: (k) => storage.getItem(k),
        setItem: (k, v) => {
          if (failWrites) throw new Error('quota');
          storage.setItem(k, v);
        },
        removeItem: (k) => storage.removeItem(k),
      };
      const store = new BasicVocabularyProgressStore(quotaStorage, key);

      store.applyRating('a', 'known');
      expect(store.getKnownStreak('a')).toBe(1);
      expect(storage.getItem(key)).toBeNull();

      failWrites = false;
      store.applyRating('a', 'known');
      expect(store.getKnownStreak('a')).toBe(2);
      const stored = JSON.parse(storage.getItem(key)!) as {
        items: Record<string, { knownStreak: number }>;
      };
      expect(stored.items.a.knownStreak).toBe(2);
    },
  );

  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'failed write merges cross-tab IDs while keeping pending local state for %s',
    (key) => {
      const storage = fakeStorage();
      storage.setItem(
        key,
        progressDocument({ b: { status: 'learned', knownStreak: 2 } }),
      );
      const wrap: StorageLike = {
        getItem: (k) => storage.getItem(k),
        setItem() {
          throw new Error('quota');
        },
        removeItem: (k) => storage.removeItem(k),
      };
      const store = new BasicVocabularyProgressStore(wrap, key);

      store.applyRating('a', 'known');
      expect(store.getKnownStreak('a')).toBe(1);

      storage.setItem(
        key,
        progressDocument({
          b: { status: 'learned', knownStreak: 2 },
          c: { status: 'learning', knownStreak: 1 },
        }),
      );

      store.applyRating('a', 'known');
      expect(store.getStatus('a')).toBe('learned');
      expect(store.getKnownStreak('a')).toBe(2);
      expect(store.getStatus('c')).toBe('learning');
    },
  );

  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'explicit external clear drops failed pending state for %s',
    (key) => {
      const data = new Map<string, string>();
      let failWrites = true;
      const storage: StorageLike = {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => {
          if (failWrites) throw new Error('quota');
          data.set(k, v);
        },
        removeItem: (k) => {
          data.delete(k);
        },
      };
      const store = new BasicVocabularyProgressStore(storage, key);

      store.applyRating('a', 'known');
      expect(store.getKnownStreak('a')).toBe(1);
      expect(storage.getItem(key)).toBeNull();

      expect(store.acceptExternalClear()).toBe(true);
      expect(store.getStatus('a')).toBe('new');

      failWrites = false;
      store.applyRating('b', 'known');
      expect(store.getStatus('a')).toBe('new');
      expect(store.getKnownStreak('b')).toBe(1);
      expect(JSON.parse(data.get(key)!)).toEqual({
        version: 1,
        items: {
          b: { status: 'learning', knownStreak: 1 },
        },
      });
    },
  );

  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'stale delayed clear is rejected after the key is repopulated for %s',
    (key) => {
      const stored = progressDocument({
        a: { status: 'learning', knownStreak: 1 },
      });
      const storage: StorageLike = {
        getItem: (k) => (k === key ? stored : null),
        setItem() {},
        removeItem() {},
      };
      const store = new BasicVocabularyProgressStore(storage, key);

      expect(store.acceptExternalClear()).toBe(false);
      expect(store.getKnownStreak('a')).toBe(1);
    },
  );

  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'failed resetAll is never resurrected by refresh or rating for %s',
    (key) => {
      const storage = fakeStorage();
      storage.setItem(
        key,
        progressDocument({
          a: { status: 'learned', knownStreak: 2 },
          b: { status: 'learning', knownStreak: 1 },
        }),
      );
      let failRemove = true;
      const flakyStorage: StorageLike = {
        getItem: (k) => storage.getItem(k),
        setItem: (k, v) => {
          storage.setItem(k, v);
        },
        removeItem() {
          if (failRemove) throw new Error('denied');
        },
      };
      const store = new BasicVocabularyProgressStore(flakyStorage, key);

      expect(store.getStatus('a')).toBe('learned');
      store.resetAll();
      expect(store.getStatus('a')).toBe('new');

      store.refresh();
      expect(store.getStatus('a')).toBe('new');

      store.applyRating('c', 'known');
      expect(store.getStatus('a')).toBe('new');
      expect(store.getStatus('c')).toBe('learning');

      failRemove = false;
      store.applyRating('c', 'known');
      expect(store.getStatus('c')).toBe('learned');
      const stored = JSON.parse(storage.getItem(key)!) as {
        items: Record<string, unknown>;
      };
      expect(stored.items).not.toHaveProperty('a');
      expect(stored.items).not.toHaveProperty('b');
      expect(stored.items.c).toBeDefined();
    },
  );

  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'pageshow-style refresh after a failed write preserves memory for %s',
    (key) => {
      const quotaStorage: StorageLike = {
        getItem() {
          return null;
        },
        setItem() {
          throw new Error('quota');
        },
        removeItem() {},
      };
      const store = new BasicVocabularyProgressStore(quotaStorage, key);

      store.applyRating('a', 'known');
      expect(store.getKnownStreak('a')).toBe(1);

      store.refresh();
      expect(store.getKnownStreak('a')).toBe(1);

      store.applyRating('a', 'known');
      expect(store.getStatus('a')).toBe('learned');
      expect(store.getKnownStreak('a')).toBe(2);
    },
  );

  it.each([BASIC_VOCABULARY_PROGRESS_KEY, USER_KEY])(
    'malformed data falls back empty and keeps current in-memory state for %s',
    (key) => {
      const storage = fakeStorage();
      storage.setItem(key, 'corrupt');
      const store = new BasicVocabularyProgressStore(storage, key);
      expect(store.getStatus('x')).toBe('new');

      store.applyRating('a', 'known');
      expect(store.getStatus('a')).toBe('learning');

      storage.setItem(key, 'corrupt');
      store.applyRating('b', 'known');
      expect(store.getStatus('a')).toBe('learning');
      expect(store.getStatus('b')).toBe('learning');
    },
  );
});

// ─── No external identity/network dependency ────────────────────────────────────

describe('scoped progress has no Supabase or identity dependency', () => {
  it('imports no Supabase SDK, network API, Auth state, email, token, or user metadata', async () => {
    const sources = [
      'src/domain/basicVocabularyProgress.ts',
      'src/domain/basicVocabularyProgressScope.ts',
    ];
    for (const path of sources) {
      const source = await readFile(path, 'utf8');
      expect(source).not.toMatch(/from ['"]@supabase\/supabase-js['"]/);
      expect(source).not.toMatch(/@supabase|supabase\.co|createClient\(/);
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
      expect(source).not.toMatch(/auth\.getUser|getSession|onAuthStateChange/);
      expect(source).not.toMatch(/access_token|refresh_token/);
      expect(source).not.toMatch(/\.email\b/);
    }
  });

  it('defines scope resolution purely in terms of the legacy guest key and canonical UUIDs', async () => {
    const scopeSource = await readFile(
      'src/domain/basicVocabularyProgressScope.ts',
      'utf8',
    );

    // The guest key resolves to the legacy constant and the user key follows
    // the frozen template — the physical key is derived only from a canonical
    // UUID, never from email, subject, display name, provider metadata, hash,
    // or device ID.
    expect(getBasicVocabularyProgressStorageKey(BASIC_VOCABULARY_GUEST_SCOPE)).toBe(
      BASIC_VOCABULARY_PROGRESS_KEY,
    );
    expect(getBasicVocabularyProgressStorageKey({ kind: 'user', userId: USER_ID })).toBe(
      USER_KEY,
    );
    expect(USER_KEY).toBe(
      'chabiko:basic-vocabulary-progress:user:f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e:v1',
    );
    expect(scopeSource).toContain(
      "import { BASIC_VOCABULARY_PROGRESS_KEY } from './basicVocabularyProgress';",
    );
    // The user key is a template that interpolates only the validated userId.
    expect(scopeSource).toContain(
      'return `chabiko:basic-vocabulary-progress:user:${scope.userId}:v1`;',
    );
  });
});
