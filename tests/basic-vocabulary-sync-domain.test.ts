// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  acknowledgeBasicVocabularyMutations,
  acknowledgeBasicVocabularyRemoteReset,
  beginBasicVocabularyLocalReset,
  createBasicVocabularySyncMeta,
  importBasicVocabularyGuestProgress,
  mergeBasicVocabularyCloudSnapshot,
  parseBasicVocabularySyncMeta,
  recordBasicVocabularyDirtyItem,
} from '../src/domain/basicVocabularySync';
import type {
  BasicVocabularyCloudItem,
  BasicVocabularyCloudSnapshot,
  BasicVocabularySyncMetaDocument,
} from '../src/domain/basicVocabularySync';
import { isValidSupabaseUserId } from '../src/domain/basicVocabularyProgressScope';
import type { BasicVocabularyProgressDocument } from '../src/domain/basicVocabularyProgress';
import type { VocabularyProgressEntry } from '../src/domain/vocabularyProgress';

const USER_ID = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
const RESET_ID = 'aaaa1111-2222-3333-4444-555566667777';
const OTHER_RESET_ID = 'bbbb2222-3333-4444-5555-666677778888';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function entry(
  status: VocabularyProgressEntry['status'],
  knownStreak: number,
): VocabularyProgressEntry {
  return { status, knownStreak };
}

function cloudItem(
  itemId: string,
  status: 'learning' | 'learned',
  knownStreak: number,
  reviewOrder: number,
  resetGeneration: number,
): BasicVocabularyCloudItem {
  return { itemId, status, knownStreak, reviewOrder, resetGeneration };
}

function snapshot(
  resetGeneration: number,
  items: readonly BasicVocabularyCloudItem[],
): BasicVocabularyCloudSnapshot {
  return { resetGeneration, items };
}

function cloudProgress(
  items: Record<string, VocabularyProgressEntry>,
): BasicVocabularyProgressDocument {
  return { version: 1, items };
}

/** Serialize a meta to its exact storage representation. */
function serialize(meta: BasicVocabularySyncMetaDocument): string {
  return JSON.stringify(meta);
}

/** Build a base meta with the given dirty items in insertion order. */
function metaWithDirty(
  dirtyItems: Array<[string, VocabularyProgressEntry]>,
  options?: {
    resetGeneration?: number;
    nextReviewOrder?: number;
    pendingResetId?: string | null;
    guestImportCompleted?: boolean;
  },
): BasicVocabularySyncMetaDocument {
  const meta = createBasicVocabularySyncMeta(USER_ID);
  let current = meta;
  if (options?.resetGeneration !== undefined) {
    current = { ...current, resetGeneration: options.resetGeneration };
  }
  if (options?.pendingResetId !== undefined) {
    current = { ...current, pendingResetId: options.pendingResetId };
  }
  if (options?.guestImportCompleted !== undefined) {
    current = { ...current, guestImportCompleted: options.guestImportCompleted };
  }
  for (const [id, e] of dirtyItems) {
    current = recordBasicVocabularyDirtyItem(current, id, e);
  }
  if (options?.nextReviewOrder !== undefined) {
    current = { ...current, nextReviewOrder: options.nextReviewOrder };
  }
  return current;
}

// ─── Creation and metadata keys ────────────────────────────────────────────────

describe('createBasicVocabularySyncMeta', () => {
  it('creates the exact initial document with the exact root keys', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(Object.keys(meta).sort()).toEqual([
      'dirtyItems',
      'guestImportCompleted',
      'nextReviewOrder',
      'pendingResetId',
      'resetGeneration',
      'userId',
      'version',
    ]);
    expect(meta).toEqual({
      version: 1,
      userId: USER_ID,
      resetGeneration: 0,
      nextReviewOrder: 0,
      pendingResetId: null,
      guestImportCompleted: false,
      dirtyItems: {},
    });
  });

  it('rejects a non-canonical user ID', () => {
    const invalid = [
      '',
      'not-a-uuid',
      USER_ID.toUpperCase(),
      ` ${USER_ID}`,
      'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1',
    ];
    for (const id of invalid) {
      expect(() => createBasicVocabularySyncMeta(id)).toThrow();
    }
  });
});

// ─── Strict metadata parsing ───────────────────────────────────────────────────

describe('parseBasicVocabularySyncMeta', () => {
  it('round-trips a serialized meta', () => {
    const meta = metaWithDirty([
      ['a', entry('learning', 1)],
      ['b', entry('learned', 3)],
    ]);
    expect(parseBasicVocabularySyncMeta(serialize(meta), USER_ID)).toEqual(meta);
  });

  it('round-trips a meta with a pending reset ID', () => {
    const meta = metaWithDirty([], { pendingResetId: RESET_ID });
    expect(parseBasicVocabularySyncMeta(serialize(meta), USER_ID)).toEqual(meta);
  });

  it('rejects unknown root keys', () => {
    const raw = JSON.stringify({
      version: 1,
      userId: USER_ID,
      resetGeneration: 0,
      nextReviewOrder: 0,
      pendingResetId: null,
      guestImportCompleted: false,
      extra: true,
    });
    expect(parseBasicVocabularySyncMeta(raw, USER_ID)).toBeNull();
  });

  it('requires the exact seven root keys', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const good = JSON.parse(serialize(meta)) as Record<string, unknown>;
    for (const key of Object.keys(good)) {
      const bad = { ...good };
      delete bad[key];
      expect(parseBasicVocabularySyncMeta(JSON.stringify(bad), USER_ID)).toBeNull();
    }
    for (const key of Object.keys(good)) {
      const bad = { ...good, [key + 'x']: true };
      expect(parseBasicVocabularySyncMeta(JSON.stringify(bad), USER_ID)).toBeNull();
    }
  });

  it('rejects wrong version, wrong user, and invalid user ID', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const good = JSON.parse(serialize(meta)) as Record<string, unknown>;

    expect(
      parseBasicVocabularySyncMeta(JSON.stringify({ ...good, version: 2 }), USER_ID),
    ).toBeNull();
    expect(
      parseBasicVocabularySyncMeta(JSON.stringify({ ...good, version: '1' }), USER_ID),
    ).toBeNull();
    expect(
      parseBasicVocabularySyncMeta(serialize(meta), 'bbbb2222-3333-4444-5555-666677778888'),
    ).toBeNull();
    expect(
      parseBasicVocabularySyncMeta(JSON.stringify({ ...good, userId: 'not-a-uuid' }), USER_ID),
    ).toBeNull();
  });

  it('rejects malformed generations and orders', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const good = JSON.parse(serialize(meta)) as Record<string, unknown>;
    for (const bad of [-1, 1.5, NaN, '0', true]) {
      expect(
        parseBasicVocabularySyncMeta(
          JSON.stringify({ ...good, resetGeneration: bad }),
          USER_ID,
        ),
      ).toBeNull();
      expect(
        parseBasicVocabularySyncMeta(
          JSON.stringify({ ...good, nextReviewOrder: bad }),
          USER_ID,
        ),
      ).toBeNull();
    }
  });

  it('rejects a malformed pending reset ID', () => {
    const meta = metaWithDirty([], { pendingResetId: RESET_ID });
    const good = JSON.parse(serialize(meta)) as Record<string, unknown>;
    for (const bad of ['not-a-uuid', '', RESET_ID.toUpperCase(), 42, {}]) {
      expect(
        parseBasicVocabularySyncMeta(
          JSON.stringify({ ...good, pendingResetId: bad }),
          USER_ID,
        ),
      ).toBeNull();
    }
  });

  it('rejects malformed dirty items and rejects violations of the order invariant', () => {
    const meta = metaWithDirty([['a', entry('learning', 1)]]);
    const good = JSON.parse(serialize(meta)) as Record<string, unknown>;
    const dirtyRaw = (good as { dirtyItems: Record<string, unknown> }).dirtyItems;

    // Wrong item keys.
    expect(
      parseBasicVocabularySyncMeta(
        JSON.stringify({
          ...good,
          dirtyItems: { a: { entry: { status: 'learning', knownStreak: 1 } } },
        }),
        USER_ID,
      ),
    ).toBeNull();
    expect(
      parseBasicVocabularySyncMeta(
        JSON.stringify({
          ...good,
          dirtyItems: { a: { entry: { status: 'learning', knownStreak: 1 }, reviewOrder: '1' } },
        }),
        USER_ID,
      ),
    ).toBeNull();
    // Inconsistent entry.
    expect(
      parseBasicVocabularySyncMeta(
        JSON.stringify({
          ...good,
          dirtyItems: {
            a: { entry: { status: 'new', knownStreak: 1 }, reviewOrder: 0 },
          },
        }),
        USER_ID,
      ),
    ).toBeNull();
    // Empty item ID.
    expect(
      parseBasicVocabularySyncMeta(
        JSON.stringify({
          ...good,
          dirtyItems: { '': dirtyRaw.a },
        }),
        USER_ID,
      ),
    ).toBeNull();
    // nextReviewOrder not strictly greater than a dirty order.
    expect(
      parseBasicVocabularySyncMeta(
        JSON.stringify({ ...good, nextReviewOrder: 0 }),
        USER_ID,
      ),
    ).toBeNull();
    // Non-boolean completion flag.
    expect(
      parseBasicVocabularySyncMeta(
        JSON.stringify({ ...good, guestImportCompleted: 'yes' }),
        USER_ID,
      ),
    ).toBeNull();
  });

  it('rejects a stored dirtyItems __proto__ key instead of writing through the prototype setter', () => {
    const raw = JSON.stringify({
      version: 1,
      userId: USER_ID,
      resetGeneration: 0,
      nextReviewOrder: 1,
      pendingResetId: null,
      guestImportCompleted: false,
      dirtyItems: {
        ['__proto__']: { entry: { status: 'learning', knownStreak: 1 }, reviewOrder: 0 },
      },
    });
    expect(parseBasicVocabularySyncMeta(raw, USER_ID)).toBeNull();
  });

  it('rejects a stored dirty entry in the implicit new state', () => {
    const raw = JSON.stringify({
      version: 1,
      userId: USER_ID,
      resetGeneration: 0,
      nextReviewOrder: 1,
      pendingResetId: null,
      guestImportCompleted: false,
      dirtyItems: {
        a: { entry: { status: 'new', knownStreak: 0 }, reviewOrder: 0 },
      },
    });
    expect(parseBasicVocabularySyncMeta(raw, USER_ID)).toBeNull();
  });

  it('is all-or-nothing on malformed JSON and array roots', () => {
    expect(parseBasicVocabularySyncMeta('not-json', USER_ID)).toBeNull();
    expect(parseBasicVocabularySyncMeta('[]', USER_ID)).toBeNull();
    expect(parseBasicVocabularySyncMeta('null', USER_ID)).toBeNull();
  });
});

// ─── Dirty mutations ───────────────────────────────────────────────────────────

describe('recordBasicVocabularyDirtyItem', () => {
  it('assigns the next order, increments exactly once, and preserves other state', () => {
    const before = createBasicVocabularySyncMeta(USER_ID);
    const a = recordBasicVocabularyDirtyItem(before, 'a', entry('learning', 1));
    expect(a.dirtyItems.a).toEqual({ entry: entry('learning', 1), reviewOrder: 0 });
    expect(a.nextReviewOrder).toBe(1);
    expect(a.resetGeneration).toBe(0);
    expect(a.pendingResetId).toBeNull();
    expect(a.guestImportCompleted).toBe(false);

    const b = recordBasicVocabularyDirtyItem(a, 'b', entry('learning', 0));
    expect(b.dirtyItems.b).toEqual({ entry: entry('learning', 0), reviewOrder: 1 });
    expect(b.nextReviewOrder).toBe(2);
  });

  it('moves a repeated dirty ID to the newest order with its latest entry', () => {
    const meta = metaWithDirty([
      ['a', entry('learning', 1)],
      ['b', entry('learned', 2)],
    ]);
    // a at order 0, b at order 1, next 2
    const updated = recordBasicVocabularyDirtyItem(meta, 'a', entry('learned', 3));
    expect(Object.keys(updated.dirtyItems)).toEqual(['b', 'a']);
    expect(updated.dirtyItems.b).toEqual({ entry: entry('learned', 2), reviewOrder: 1 });
    expect(updated.dirtyItems.a).toEqual({ entry: entry('learned', 3), reviewOrder: 2 });
    expect(updated.nextReviewOrder).toBe(3);
  });

  it('rejects empty item IDs and implicit new entries', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(() =>
      recordBasicVocabularyDirtyItem(meta, '', entry('learning', 1)),
    ).toThrow();
    expect(() =>
      recordBasicVocabularyDirtyItem(meta, 'a', entry('new', 0)),
    ).toThrow();
    // Inconsistent entry rejected as well.
    expect(() =>
      recordBasicVocabularyDirtyItem(meta, 'a', entry('new', 1)),
    ).toThrow();
  });

  it('rejects the __proto__ item ID instead of writing through the prototype setter', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(() =>
      recordBasicVocabularyDirtyItem(meta, '__proto__', entry('learning', 1)),
    ).toThrow();
  });

  it('rejects inconsistent entries', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(() =>
      recordBasicVocabularyDirtyItem(meta, 'a', entry('learned', 0)),
    ).toThrow();
    expect(() =>
      recordBasicVocabularyDirtyItem(meta, 'a', entry('learning', 5)),
    ).toThrow();
  });
});

// ─── Mutation acknowledgement ──────────────────────────────────────────────────

describe('acknowledgeBasicVocabularyMutations', () => {
  it('clears exactly the sent IDs whose dirty row still matches the sent item', () => {
    const meta = metaWithDirty([
      ['a', entry('learning', 1)],
      ['b', entry('learned', 2)],
      ['c', entry('learning', 0)],
    ]);
    const sent = [
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learned', 2, 1, 0),
    ];
    const acknowledged = acknowledgeBasicVocabularyMutations(meta, sent);
    expect(acknowledged.dirtyItems).toEqual({
      c: { entry: entry('learning', 0), reviewOrder: 2 },
    });
    // Unchanged fields are preserved byte-for-byte.
    expect(acknowledged.nextReviewOrder).toBe(3);
    expect(acknowledged.resetGeneration).toBe(0);
    expect(acknowledged.pendingResetId).toBeNull();
  });

  it('preserves a newer same-ID mutation when an older batch is acknowledged', () => {
    const meta = metaWithDirty([
      ['a', entry('learning', 1)],
      ['b', entry('learning', 0)],
    ]);
    // Push the older batch [a@0, b@1], then mutate a again → a@2.
    const acknowledged = acknowledgeBasicVocabularyMutations(meta, [
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learning', 0, 1, 0),
    ]);
    const newer = recordBasicVocabularyDirtyItem(
      acknowledged,
      'a',
      entry('learned', 3),
    );
    // a is dirty again at the newest order; a new push of the old batch must not clear it.
    const pushed = acknowledgeBasicVocabularyMutations(newer, [
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learning', 0, 1, 0),
    ]);
    expect(pushed.dirtyItems).toEqual({
      a: { entry: entry('learned', 3), reviewOrder: 2 },
    });
    expect(pushed.nextReviewOrder).toBe(3);
  });

  it('is harmless for unknown and duplicate sent IDs after validation', () => {
    const meta = metaWithDirty([['a', entry('learning', 1)]]);
    const sent = [
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('a', 'learning', 1, 0, 0), // duplicate
      cloudItem('zz', 'learned', 2, 9, 0), // unknown
    ];
    const acknowledged = acknowledgeBasicVocabularyMutations(meta, sent);
    expect(acknowledged.dirtyItems).toEqual({});
  });

  it('does not clear an ID whose dirty entry or order differs from the sent item', () => {
    const meta = metaWithDirty([['a', entry('learning', 1)]]);
    // Same order but different entry.
    const wrongEntry = acknowledgeBasicVocabularyMutations(meta, [
      cloudItem('a', 'learned', 2, 0, 0),
    ]);
    expect(wrongEntry.dirtyItems).toEqual({
      a: { entry: entry('learning', 1), reviewOrder: 0 },
    });
    // Same entry but different order.
    const wrongOrder = acknowledgeBasicVocabularyMutations(meta, [
      cloudItem('a', 'learning', 1, 5, 0),
    ]);
    expect(wrongOrder.dirtyItems).toEqual({
      a: { entry: entry('learning', 1), reviewOrder: 0 },
    });
  });

  it('rejects malformed sent items', () => {
    const meta = metaWithDirty([['a', entry('learning', 1)]]);
    expect(() =>
      acknowledgeBasicVocabularyMutations(meta, [
        {
          itemId: 'a',
          status: 'new' as const,
          knownStreak: 0,
          reviewOrder: 0,
          resetGeneration: 0,
        } as unknown as BasicVocabularyCloudItem,
      ]),
    ).toThrow();
    expect(() =>
      acknowledgeBasicVocabularyMutations(meta, [
        cloudItem('a', 'learning', 1, 0, -1),
      ]),
    ).toThrow();
  });
});

// ─── Idempotent reset ──────────────────────────────────────────────────────────

describe('beginBasicVocabularyLocalReset', () => {
  it('clears dirty items, increments the generation once, resets the order, and keeps guest completion', () => {
    const meta = metaWithDirty(
      [
        ['a', entry('learning', 1)],
        ['b', entry('learned', 2)],
      ],
      { guestImportCompleted: true },
    );
    const reset = beginBasicVocabularyLocalReset(meta, RESET_ID);
    expect(reset).toEqual({
      version: 1,
      userId: USER_ID,
      resetGeneration: 1,
      nextReviewOrder: 0,
      pendingResetId: RESET_ID,
      guestImportCompleted: true,
      dirtyItems: {},
    });
  });

  it('is a byte-equivalent no-op for the same reset ID', () => {
    const meta = metaWithDirty([], { pendingResetId: RESET_ID, resetGeneration: 1 });
    expect(beginBasicVocabularyLocalReset(meta, RESET_ID)).toBe(meta);
  });

  it('rejects a different reset ID without replacing it or incrementing again', () => {
    const meta = metaWithDirty([], { pendingResetId: RESET_ID, resetGeneration: 1 });
    expect(() =>
      beginBasicVocabularyLocalReset(meta, OTHER_RESET_ID),
    ).toThrow();
    expect(meta.pendingResetId).toBe(RESET_ID);
    expect(meta.resetGeneration).toBe(1);
  });

  it('rejects a non-canonical reset ID', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    for (const bad of ['', 'not-a-uuid', RESET_ID.toUpperCase(), '  ']) {
      expect(() => beginBasicVocabularyLocalReset(meta, bad)).toThrow();
    }
  });

  it('ratings after begin-reset are dirty rows in the proposed generation', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const reset = beginBasicVocabularyLocalReset(meta, RESET_ID);
    const rated = recordBasicVocabularyDirtyItem(reset, 'a', entry('learning', 1));
    expect(rated.pendingResetId).toBe(RESET_ID);
    expect(rated.resetGeneration).toBe(1);
    expect(rated.nextReviewOrder).toBe(1);
    expect(rated.dirtyItems.a).toEqual({ entry: entry('learning', 1), reviewOrder: 0 });
  });
});

// ─── Reset acknowledgement ─────────────────────────────────────────────────────

describe('acknowledgeBasicVocabularyRemoteReset', () => {
  it('retags post-reset dirty rows and clears the pending reset ID', () => {
    const meta = metaWithDirty([], { resetGeneration: 0, pendingResetId: RESET_ID });
    const rated = recordBasicVocabularyDirtyItem(meta, 'a', entry('learning', 1));
    const acknowledged = acknowledgeBasicVocabularyRemoteReset(rated, 1);
    expect(acknowledged.pendingResetId).toBeNull();
    expect(acknowledged.resetGeneration).toBe(1);
    // The retagged row keeps its dirty entry; the order is bumped past the
    // pending-reset orders so it can be pushed without clashing.
    expect(acknowledged.dirtyItems.a.entry).toEqual(entry('learning', 1));
    expect(acknowledged.dirtyItems.a.reviewOrder).toBe(1);
    expect(acknowledged.nextReviewOrder).toBe(2);
  });

  it('rejects rollback/equality that could revive old data', () => {
    // Pre-reset generation is 1, so the server must report at least 2.
    const meta = metaWithDirty([], { resetGeneration: 2, pendingResetId: RESET_ID });
    expect(() => acknowledgeBasicVocabularyRemoteReset(meta, 0)).toThrow();
    expect(() => acknowledgeBasicVocabularyRemoteReset(meta, 1)).toThrow();
    // A server generation above the pre-reset generation is accepted.
    expect(acknowledgeBasicVocabularyRemoteReset(meta, 2).resetGeneration).toBe(2);
  });

  it('rejects fractional or non-numeric server generations', () => {
    const meta = metaWithDirty([], { pendingResetId: RESET_ID });
    expect(() => acknowledgeBasicVocabularyRemoteReset(meta, 1.5)).toThrow();
    expect(() => acknowledgeBasicVocabularyRemoteReset(meta, NaN)).toThrow();
  });

  it('rejects acknowledgement without a pending reset', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(() => acknowledgeBasicVocabularyRemoteReset(meta, 1)).toThrow();
  });

  it('survives a lost response: same reset ID stays idempotent and can still be acknowledged', () => {
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const reset = beginBasicVocabularyLocalReset(meta, RESET_ID);
    const serialized = serialize(reset);
    // Reload from storage.
    const reloaded = parseBasicVocabularySyncMeta(serialized, USER_ID)!;
    expect(reloaded.pendingResetId).toBe(RESET_ID);
    expect(reloaded.resetGeneration).toBe(1);
    // Retry of the same reset is a no-op.
    expect(beginBasicVocabularyLocalReset(reloaded, RESET_ID)).toEqual(reloaded);
    // The server eventually acknowledges generation 1.
    const acknowledged = acknowledgeBasicVocabularyRemoteReset(reloaded, 1);
    expect(acknowledged.pendingResetId).toBeNull();
    expect(acknowledged.resetGeneration).toBe(1);
    expect(beginBasicVocabularyLocalReset(acknowledged, RESET_ID).resetGeneration).toBe(2);
  });
});

// ─── Cloud merge ───────────────────────────────────────────────────────────────

describe('mergeBasicVocabularyCloudSnapshot', () => {
  it('merges same-generation: cloud base, dirty overrides, dirty-only kept, cached-only dropped', () => {
    const local = cloudProgress({
      a: entry('learning', 1),
      b: entry('learned', 2),
      z: entry('learned', 3),
    });
    const meta = metaWithDirty([
      ['a', entry('learning', 1)],
      ['b', entry('learned', 2)],
    ]);
    const cloud = snapshot(0, [
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learning', 0, 1, 0),
      cloudItem('c', 'learned', 2, 2, 0),
    ]);
    const result = mergeBasicVocabularyCloudSnapshot(local, meta, cloud);
    expect(result.kind).toBe('merged');
    // b is dirty locally → overrides cloud; a matches cloud; c comes from cloud;
    // z is local-only and not dirty → disappears.
    expect(result.progress).toEqual(
      cloudProgress({
        a: entry('learning', 1),
        b: entry('learned', 2),
        c: entry('learned', 2),
      }),
    );
    expect(Object.keys(result.progress.items)).toEqual(['a', 'b', 'c']);
    expect(result.meta).toBe(meta);
    expect(result.mutationsToPush).toEqual([
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learned', 2, 1, 0),
    ]);
  });

  it('inserts merged output in effective review order and keeps dirty-only IDs', () => {
    const local = cloudProgress({});
    const meta = metaWithDirty([['d', entry('learning', 1)]]);
    // d is dirty-only: not in cloud and not cached locally, but it must
    // survive the merge.
    const cloud = snapshot(0, [
      cloudItem('a', 'learned', 2, 0, 0),
      cloudItem('b', 'learning', 0, 2, 0),
    ]);
    // Rebuild the meta so dirty d sits between a (0) and b (2) in effective
    // order, with a consistent next order.
    const constructed = {
      ...meta,
      dirtyItems: {
        d: { entry: entry('learning', 1), reviewOrder: 1 },
      },
      nextReviewOrder: 3,
    } as BasicVocabularySyncMetaDocument;
    const result = mergeBasicVocabularyCloudSnapshot(local, constructed, cloud);
    expect(result.kind).toBe('merged');
    expect(Object.keys(result.progress.items)).toEqual(['a', 'd', 'b']);
    expect(result.mutationsToPush).toEqual([
      cloudItem('d', 'learning', 1, 1, 0),
    ]);
  });

  it('rejects malformed cloud snapshots before touching local state', () => {
    const local = cloudProgress({ a: entry('learning', 1) });
    const meta = metaWithDirty([['a', entry('learning', 1)]]);
    const invalid: BasicVocabularyCloudSnapshot[] = [
      snapshot(-1, []),
      snapshot(0, [cloudItem('a', 'learning', 1, 0, 1)]), // row generation mismatch
      snapshot(0, [
        cloudItem('a', 'learning', 1, 0, 0),
        cloudItem('a', 'learned', 2, 1, 0), // duplicate ID
      ]),
      snapshot(0, [
        cloudItem('a', 'learning', 1, 0, 0),
        cloudItem('b', 'learning', 0, 0, 0), // duplicate order
      ]),
      snapshot(0, [
        {
          itemId: 'a',
          status: 'new' as const,
          knownStreak: 0,
          reviewOrder: 0,
          resetGeneration: 0,
        } as unknown as BasicVocabularyCloudItem,
      ]),
      snapshot(0, [cloudItem('a', 'learning', 1, -1, 0)]),
      snapshot(0, [cloudItem('', 'learning', 1, 0, 0)]),
      snapshot(0, [cloudItem('a', 'learned', 0, 0, 0)]), // inconsistent streak
      snapshot(0, [cloudItem('__proto__', 'learning', 1, 0, 0)]),
    ];
    for (const bad of invalid) {
      expect(() => mergeBasicVocabularyCloudSnapshot(local, meta, bad)).toThrow(
        TypeError,
      );
    }
    // Local state untouched by a failed merge.
    expect(local.items.a).toEqual(entry('learning', 1));
    expect(meta.dirtyItems.a).toEqual({ entry: entry('learning', 1), reviewOrder: 0 });
  });

  it('applies a newer remote generation by rebuilding from cloud rows in ascending order', () => {
    const local = cloudProgress({
      a: entry('learned', 2),
      b: entry('learning', 1),
    });
    const meta = metaWithDirty([['a', entry('learned', 2)]]);
    const cloud = snapshot(1, [
      cloudItem('x', 'learned', 2, 1, 1),
      cloudItem('y', 'learning', 0, 0, 1),
    ]);
    const result = mergeBasicVocabularyCloudSnapshot(local, meta, cloud);
    expect(result.kind).toBe('remote-reset-applied');
    expect(Object.keys(result.progress.items)).toEqual(['y', 'x']);
    expect(result.progress.items.y).toEqual(entry('learning', 0));
    expect(result.meta.resetGeneration).toBe(1);
    expect(result.meta.nextReviewOrder).toBe(2);
    expect(result.meta.dirtyItems).toEqual({});
    expect(result.meta.pendingResetId).toBeNull();
    expect(result.meta.guestImportCompleted).toBe(false);
    expect(result.mutationsToPush).toEqual([]);
  });

  it('rejects an older remote generation preserving local state byte-equivalently', () => {
    const local = cloudProgress({ a: entry('learned', 3) });
    const meta = metaWithDirty([['a', entry('learned', 3)]], { resetGeneration: 2 });
    const cloud = snapshot(1, [cloudItem('z', 'learning', 0, 0, 1)]);
    const result = mergeBasicVocabularyCloudSnapshot(local, meta, cloud);
    expect(result.kind).toBe('stale-remote-rejected');
    expect(result.progress).toBe(local);
    expect(result.meta).toBe(meta);
    expect(result.mutationsToPush).toEqual([]);
  });

  it('keeps local state authoritative while a reset is pending', () => {
    const local = cloudProgress({ a: entry('learning', 1) });
    const meta = metaWithDirty([['a', entry('learning', 1)]], {
      resetGeneration: 1,
      pendingResetId: RESET_ID,
    });
    const cloud = snapshot(3, [
      cloudItem('remote', 'learned', 5, 0, 3),
      cloudItem('a', 'learned', 5, 1, 3),
    ]);
    const result = mergeBasicVocabularyCloudSnapshot(local, meta, cloud);
    expect(result.kind).toBe('pending-local-reset');
    expect(result.progress).toBe(local);
    expect(result.meta).toBe(meta);
    expect(result.mutationsToPush).toEqual([]);
  });
});

// ─── One-time guest import ─────────────────────────────────────────────────────

describe('importBasicVocabularyGuestProgress', () => {
  it('is a byte-equivalent no-op once completed', () => {
    const guest = cloudProgress({ a: entry('learned', 3) });
    const meta = metaWithDirty([], { guestImportCompleted: true });
    const result = importBasicVocabularyGuestProgress(
      guest,
      snapshot(0, []),
      meta,
    );
    expect(result.progress).toBe(guest);
    expect(result.meta).toBe(meta);
  });

  it('marks completion exactly once even for an empty guest', () => {
    const guest = cloudProgress({});
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const result = importBasicVocabularyGuestProgress(
      guest,
      snapshot(0, []),
      meta,
    );
    expect(result.progress).toEqual(cloudProgress({}));
    expect(result.meta.guestImportCompleted).toBe(true);
    expect(result.meta.dirtyItems).toEqual({});
    expect(result.meta.nextReviewOrder).toBe(0);
    // A second call is a no-op.
    expect(
      importBasicVocabularyGuestProgress(guest, snapshot(0, []), result.meta),
    ).toEqual({ progress: guest, meta: result.meta });
  });

  it('imports only non-new guest entries in guest insertion order', () => {
    const guest = cloudProgress({
      a: entry('new', 0),
      b: entry('learning', 1),
      c: entry('learned', 2),
      d: entry('new', 0),
      e: entry('learning', 0),
    });
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const result = importBasicVocabularyGuestProgress(
      guest,
      snapshot(0, []),
      meta,
    );
    expect(Object.keys(result.progress.items)).toEqual(['b', 'c', 'e']);
    expect(result.meta.dirtyItems).toEqual({
      b: { entry: entry('learning', 1), reviewOrder: 0 },
      c: { entry: entry('learned', 2), reviewOrder: 1 },
      e: { entry: entry('learning', 0), reviewOrder: 2 },
    });
    expect(result.meta.nextReviewOrder).toBe(3);
    expect(result.meta.guestImportCompleted).toBe(true);
    // Guest input is never deleted or mutated.
    expect(guest.items.a).toEqual(entry('new', 0));
    expect(guest.items.d).toEqual(entry('new', 0));
  });

  it('with a non-empty cloud, imports only guest IDs absent from the cloud; cloud wins overlaps', () => {
    const guest = cloudProgress({
      a: entry('learned', 2),
      b: entry('learning', 1),
      c: entry('learned', 3),
    });
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const cloud = snapshot(1, [
      cloudItem('a', 'learning', 0, 0, 1),
      cloudItem('x', 'learned', 2, 1, 1),
    ]);
    const result = importBasicVocabularyGuestProgress(guest, cloud, meta);
    // a is in the cloud → cloud wins; b and c are imported after the highest
    // cloud order (1), preserving guest order.
    expect(Object.keys(result.progress.items)).toEqual(['a', 'x', 'b', 'c']);
    expect(result.progress.items.a).toEqual(entry('learning', 0));
    expect(result.progress.items.x).toEqual(entry('learned', 2));
    expect(result.meta.dirtyItems).toEqual({
      b: { entry: entry('learning', 1), reviewOrder: 2 },
      c: { entry: entry('learned', 3), reviewOrder: 3 },
    });
    expect(result.meta.nextReviewOrder).toBe(4);
    expect(result.meta.guestImportCompleted).toBe(true);
    expect(result.meta.resetGeneration).toBe(0);
  });

  it('keeps imported rows dirty after the highest cloud order even with no cloud items', () => {
    const guest = cloudProgress({ a: entry('learned', 2) });
    const meta = createBasicVocabularySyncMeta(USER_ID);
    const result = importBasicVocabularyGuestProgress(
      guest,
      snapshot(0, []),
      meta,
    );
    expect(result.meta.dirtyItems.a.reviewOrder).toBe(0);
    expect(result.meta.nextReviewOrder).toBe(1);
  });

  it('rejects malformed cloud snapshots', () => {
    const guest = cloudProgress({ a: entry('learning', 1) });
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(() =>
      importBasicVocabularyGuestProgress(
        guest,
        snapshot(0, [cloudItem('a', 'learning', 1, 0, 5)]),
        meta,
      ),
    ).toThrow(TypeError);
  });

  it('rejects a __proto__ guest item key instead of dropping the row', () => {
    const guest = {
      version: 1 as const,
      items: { ['__proto__']: entry('learning', 1) },
    } as BasicVocabularyProgressDocument;
    const meta = createBasicVocabularySyncMeta(USER_ID);
    expect(() =>
      importBasicVocabularyGuestProgress(guest, snapshot(0, []), meta),
    ).toThrow();
  });
});

// ─── Deep purity for every public function ─────────────────────────────────────

describe('purity', () => {
  const frozenMeta = () => metaWithDirty([
    ['a', entry('learning', 1)],
    ['b', entry('learned', 2)],
  ]);

  it('leaves inputs deeply unchanged for every public function', () => {
    const base = frozenMeta();

    const metaA = createBasicVocabularySyncMeta(USER_ID);
    const dirty = recordBasicVocabularyDirtyItem(metaA, 'x', entry('learning', 0));
    expect(metaA.dirtyItems).toEqual({});
    expect(dirty.dirtyItems.x).toBeDefined();

    const metaB = frozenMeta();
    const reset = beginBasicVocabularyLocalReset(metaB, RESET_ID);
    expect(metaB.dirtyItems).toEqual({
      a: { entry: entry('learning', 1), reviewOrder: 0 },
      b: { entry: entry('learned', 2), reviewOrder: 1 },
    });
    expect(reset.dirtyItems).toEqual({});

    const metaC = metaWithDirty([], { resetGeneration: 1, pendingResetId: RESET_ID });
    const acked = acknowledgeBasicVocabularyRemoteReset(metaC, 2);
    expect(metaC.pendingResetId).toBe(RESET_ID);
    expect(metaC.resetGeneration).toBe(1);
    expect(acked.pendingResetId).toBeNull();

    const metaD = frozenMeta();
    const sent = [
      cloudItem('a', 'learning', 1, 0, 0),
      cloudItem('b', 'learned', 2, 1, 0),
    ];
    const cleared = acknowledgeBasicVocabularyMutations(metaD, sent);
    expect(metaD.dirtyItems).toEqual({
      a: { entry: entry('learning', 1), reviewOrder: 0 },
      b: { entry: entry('learned', 2), reviewOrder: 1 },
    });
    expect(cleared.dirtyItems).toEqual({});

    const guest = cloudProgress({ g: entry('learned', 2) });
    const metaE = createBasicVocabularySyncMeta(USER_ID);
    const imported = importBasicVocabularyGuestProgress(guest, snapshot(0, []), metaE);
    expect(metaE.guestImportCompleted).toBe(false);
    expect(metaE.dirtyItems).toEqual({});
    expect(guest.items.g).toEqual(entry('learned', 2));
    expect(imported.meta.guestImportCompleted).toBe(true);

    const local = cloudProgress({ a: entry('learning', 1) });
    const metaF = frozenMeta();
    const cloud = snapshot(0, [cloudItem('a', 'learning', 1, 0, 0)]);
    const merged = mergeBasicVocabularyCloudSnapshot(local, metaF, cloud);
    expect(metaF.dirtyItems).toEqual({
      a: { entry: entry('learning', 1), reviewOrder: 0 },
      b: { entry: entry('learned', 2), reviewOrder: 1 },
    });
    expect(merged.meta).toBe(metaF);
    expect(local.items.a).toEqual(entry('learning', 1));

    const raw = JSON.parse(serialize(base)) as BasicVocabularySyncMetaDocument;
    const parsed = parseBasicVocabularySyncMeta(serialize(base), USER_ID)!;
    expect(parsed).toEqual(base);
    expect(raw.dirtyItems.a.entry).toEqual(entry('learning', 1));
    expect(raw.dirtyItems.a.reviewOrder).toBe(0);
  });
});

// ─── Canonical UUID reuse ──────────────────────────────────────────────────────

describe('canonical UUID reuse', () => {
  it('reuses the #288 canonical validator for user and reset IDs', () => {
    expect(isValidSupabaseUserId(USER_ID)).toBe(true);
    expect(isValidSupabaseUserId(RESET_ID)).toBe(true);
    expect(createBasicVocabularySyncMeta(USER_ID).userId).toBe(USER_ID);
    expect(
      beginBasicVocabularyLocalReset(createBasicVocabularySyncMeta(USER_ID), RESET_ID)
        .pendingResetId,
    ).toBe(RESET_ID);
  });
});

// ─── No storage/DOM/network/clock/timer/randomness/Supabase/locale ────────────

describe('sync domain has no environment dependencies', () => {
  it('imports no Supabase SDK, storage, DOM, network, or timer APIs', async () => {
    const sources = [
      'src/domain/basicVocabularySync.ts',
      'tests/basic-vocabulary-sync-domain.test.ts',
    ];
    // Tokens are assembled from fragments so this checker never contains the
    // full banned identifiers contiguously, which would otherwise make its
    // own scan fail.
    const banned: readonly string[] = [
      '@' + 'supabase',
      'supabase' + '.co',
      'create' + 'Client(',
      'local' + 'Storage',
      'session' + 'Storage',
      'indexed' + 'DB',
      'docu' + 'ment.',
      'win' + 'dow.',
      'HTML' + 'Element',
      'Math.' + 'random',
      'set' + 'Timeout',
      'set' + 'Interval',
      'request' + 'AnimationFrame',
      'fe' + 'tch(',
      'XMLHttp' + 'Request',
      'Web' + 'Socket',
      'send' + 'Beacon',
      'toLocale' + 'String(',
      'locale' + 'Compare(',
      'In' + 'tl.',
      'auth.get' + 'User',
      'get' + 'Session',
      'onAuth' + 'StateChange',
      'access_' + 'token',
      'refresh_' + 'token',
    ];
    const wholeWordDate = new RegExp('\\bD' + 'ate\\b');
    for (const path of sources) {
      const source = await readFile(path, 'utf8');
      for (const token of banned) {
        expect(source).not.toContain(token);
      }
      expect(source).not.toMatch(wholeWordDate);
    }
  });

  it('serializes deterministically with no randomness or timestamps', () => {
    const meta = metaWithDirty([
      ['b', entry('learning', 1)],
      ['a', entry('learned', 2)],
    ]);
    const first = serialize(meta);
    const second = serialize(meta);
    expect(first).toBe(second);
    expect(first).not.toMatch(/"(time|date|ts|createdAt|updatedAt)"\s*:/i);
  });
});
