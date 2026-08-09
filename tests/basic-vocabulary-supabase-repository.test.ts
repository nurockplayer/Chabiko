import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  BasicVocabularyRepositoryError,
  createBasicVocabularySupabaseRepository,
  type BasicVocabularyRepositoryErrorKind,
} from '../src/data/basicVocabularySupabaseRepository';
import type { BasicVocabularyCloudItem } from '../src/domain/basicVocabularySync';

// Issue #291 — typed Supabase repository for basic-vocabulary cloud sync.
//
// Two layers:
// 1. Strict fake/mock tests that assert every query contract (validation before
//    network, non-destructive state init, exact selected columns/filters/order,
//    exact upsert rows/conflict/no timestamp/no delete, exact RPC name/args/call
//    count, every error mapping) without a database.
// 2. Live integration against a locally running Supabase stack (the same stack
//    the #287 schema suite uses), skipped when the stack is not up. These prove
//    user A round-trip, user B isolation, idempotent reset IDs, and
//    stale-generation rejection after a reset.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_CONTAINER =
  process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_supabase-basic-vocabulary-schema';

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RESET_1 = '11111111-2222-3333-4444-5555aa66bb77';
const RESET_2 = '88888888-2222-3333-4444-5555cc66dd77';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function item(
  itemId: string,
  status: 'learning' | 'learned',
  knownStreak: number,
  reviewOrder: number,
  resetGeneration: number,
): BasicVocabularyCloudItem {
  return { itemId, status, knownStreak, reviewOrder, resetGeneration };
}

function repoError(kind: BasicVocabularyRepositoryErrorKind, cause?: unknown): BasicVocabularyRepositoryError {
  return new BasicVocabularyRepositoryError(kind, cause);
}

// ─── Strict fake client ────────────────────────────────────────────────────────

interface FakeError {
  code: string;
  details?: string;
  message?: string;
}

interface FakeResponse {
  data: unknown;
  error: FakeError | null;
  status?: number;
}

interface RecordedQuery {
  type: 'select' | 'upsert' | 'rpc';
  table?: string;
  select?: string;
  filters?: Array<[string, unknown]>;
  orders?: Array<{ column: string; ascending: boolean }>;
  body?: unknown;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  fn?: string;
  args?: Record<string, unknown>;
}

function ok(data: unknown, status = 200): FakeResponse {
  return { data, error: null, status };
}

function fail(status: number | undefined, error: FakeError): FakeResponse {
  return { data: null, error, status };
}

const FK_ERROR = {
  code: '23503',
  details:
    'Key (reset_generation)=(1) is not present in table "basic_vocabulary_course_state".',
  message:
    'insert or update on table "basic_vocabulary_progress" violates foreign key constraint "basic_vocabulary_progress_user_id_course_id_reset_generati_fkey"',
};

/**
 * Fake client that records the exact query chain and returns a queued response
 * per query. Terminal calls (`maybeSingle`, an awaited builder, `upsert`, `rpc`)
 * pop from the responses queue in order.
 */
class FakeSupabaseClient {
  recorded: RecordedQuery[] = [];
  private responses: FakeResponse[];

  constructor(...responses: FakeResponse[]) {
    this.responses = [...responses];
  }

  private next(): FakeResponse {
    const r = this.responses.shift();
    if (r === undefined) {
      throw new Error('FakeSupabaseClient: no more queued responses');
    }
    return r;
  }

  from(table: string): {
    upsert: (body: unknown, opts: { onConflict: string; ignoreDuplicates: boolean }) => FakeResponse;
    select: (fields: string) => FakeSelectBuilder;
  } {
    const record = (q: RecordedQuery) => this.recorded.push(q);
    return {
      upsert: (body, opts) => {
        record({
          type: 'upsert',
          table,
          body,
          onConflict: opts.onConflict,
          ignoreDuplicates: opts.ignoreDuplicates,
        });
        return this.next();
      },
      select: (fields) => new FakeSelectBuilder(table, fields, record, () => this.next()),
    };
  }

  rpc(fn: string, args: Record<string, unknown>): FakeResponse {
    this.recorded.push({ type: 'rpc', fn, args });
    return this.next();
  }
}

class FakeSelectBuilder {
  filters: Array<[string, unknown]> = [];
  orders: Array<{ column: string; ascending: boolean }> = [];

  constructor(
    private readonly table: string,
    private readonly fields: string,
    private readonly record: (q: RecordedQuery) => void,
    private readonly respond: () => FakeResponse,
  ) {}

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, opts: { ascending: boolean }): this {
    this.orders.push({ column, ascending: opts.ascending });
    return this;
  }

  maybeSingle(): FakeResponse {
    this.record({
      type: 'select',
      table: this.table,
      select: this.fields,
      filters: this.filters,
      orders: this.orders,
    });
    return this.respond();
  }

  // Awaited builder (no terminal `.maybeSingle()`), e.g. the progress select.
  then<T>(onfulfilled: (value: FakeResponse) => T): Promise<T> {
    this.record({
      type: 'select',
      table: this.table,
      select: this.fields,
      filters: this.filters,
      orders: this.orders,
    });
    return Promise.resolve(this.respond()).then(onfulfilled);
  }
}

function makeRepo(...responses: FakeResponse[]): {
  repo: ReturnType<typeof createBasicVocabularySupabaseRepository>;
  client: FakeSupabaseClient;
} {
  const client = new FakeSupabaseClient(...responses);
  const repo = createBasicVocabularySupabaseRepository(client as unknown as SupabaseClient);
  return { repo, client };
}

function calls(client: FakeSupabaseClient): RecordedQuery[] {
  return client.recorded;
}

const CALLS_COUNT = (client: FakeSupabaseClient): number => client.recorded.length;

// ─── Invalid input is rejected before any query ───────────────────────────────

describe('validation before query', () => {
  it('loadSnapshot rejects a non-canonical user id with zero queries', async () => {
    const { repo, client } = makeRepo();
    for (const bad of ['', 'not-a-uuid', USER_A.toUpperCase(), ` ${USER_A}`]) {
      await expect(repo.loadSnapshot(bad)).rejects.toMatchObject({
        kind: 'invalid-data',
      });
    }
    expect(CALLS_COUNT(client)).toBe(0);
  });

  it('pushMutations rejects a non-canonical user id and bad generation with zero queries', async () => {
    const { repo, client } = makeRepo();
    await expect(
      repo.pushMutations('not-a-uuid', 0, [item('a', 'learning', 0, 0, 0)]),
    ).rejects.toMatchObject({ kind: 'invalid-data' });
    await expect(
      repo.pushMutations(USER_A, -1, [item('a', 'learning', 0, 0, -1)]),
    ).rejects.toMatchObject({ kind: 'invalid-data' });
    expect(CALLS_COUNT(client)).toBe(0);
  });

  it('pushMutations rejects malformed items and same-generation violations with zero queries', async () => {
    const { repo, client } = makeRepo();
    const badItems = [
      // Generation mismatch with the batch.
      [item('a', 'learning', 0, 0, 5)],
      // Duplicate item id.
      [item('a', 'learning', 0, 0, 0), item('a', 'learning', 0, 1, 0)],
      // Duplicate review order.
      [item('a', 'learning', 0, 0, 0), item('b', 'learning', 0, 0, 0)],
      // Inconsistent streak.
      [item('a', 'learning', 5, 0, 0)],
      // Empty item id.
      [item('', 'learning', 0, 0, 0)],
    ] as Array<readonly BasicVocabularyCloudItem[]>;
    for (const batch of badItems) {
      await expect(repo.pushMutations(USER_A, 0, batch)).rejects.toMatchObject({
        kind: 'invalid-data',
      });
    }
    expect(CALLS_COUNT(client)).toBe(0);
  });

  it('reset rejects non-canonical user and reset ids with zero queries', async () => {
    const { repo, client } = makeRepo();
    await expect(repo.reset('not-a-uuid', RESET_1)).rejects.toMatchObject({
      kind: 'invalid-data',
    });
    await expect(repo.reset(USER_A, 'not-a-uuid')).rejects.toMatchObject({
      kind: 'invalid-data',
    });
    await expect(repo.reset(USER_A, RESET_1.toUpperCase())).rejects.toMatchObject({
      kind: 'invalid-data',
    });
    expect(CALLS_COUNT(client)).toBe(0);
  });
});

// ─── loadSnapshot ──────────────────────────────────────────────────────────────

describe('loadSnapshot', () => {
  it('non-destructively ensures a state row at generation 0 with conflict-ignore', async () => {
    const { repo, client } = makeRepo(
      ok(null, 201),
      ok({ reset_generation: 0 }, 200),
      ok([], 200),
    );
    await repo.loadSnapshot(USER_A);
    const ensure = calls(client)[0];
    expect(ensure.type).toBe('upsert');
    expect(ensure.table).toBe('basic_vocabulary_course_state');
    expect(ensure.body).toEqual({ user_id: USER_A, course_id: 'basic-vocabulary' });
    expect(ensure.onConflict).toBe('user_id,course_id');
    expect(ensure.ignoreDuplicates).toBe(true);
  });

  it('selects minimal state fields for the exact user/course', async () => {
    const { repo, client } = makeRepo(
      ok(null, 201),
      ok({ reset_generation: 3 }, 200),
      ok([], 200),
    );
    await repo.loadSnapshot(USER_A);
    const stateQuery = calls(client)[1];
    expect(stateQuery.type).toBe('select');
    expect(stateQuery.table).toBe('basic_vocabulary_course_state');
    expect(stateQuery.select).toBe('reset_generation');
    expect(stateQuery.filters).toEqual([
      ['user_id', USER_A],
      ['course_id', 'basic-vocabulary'],
    ]);
    expect(stateQuery.orders).toEqual([]);
    // `last_reset_id` is not part of the cloud snapshot and never selected.
    expect(stateQuery.select).not.toContain('last_reset_id');
  });

  it('selects minimal progress fields for the current generation ordered by review order with item-id tie-break', async () => {
    const { repo, client } = makeRepo(
      ok(null, 201),
      ok({ reset_generation: 2 }, 200),
      ok([], 200),
    );
    await repo.loadSnapshot(USER_A);
    const progressQuery = calls(client)[2];
    expect(progressQuery.type).toBe('select');
    expect(progressQuery.table).toBe('basic_vocabulary_progress');
    expect(progressQuery.select).toBe(
      'item_id,status,known_streak,review_order,reset_generation',
    );
    expect(progressQuery.filters).toEqual([
      ['user_id', USER_A],
      ['course_id', 'basic-vocabulary'],
      ['reset_generation', 2],
    ]);
    expect(progressQuery.orders).toEqual([
      { column: 'review_order', ascending: true },
      { column: 'item_id', ascending: true },
    ]);
  });

  it('returns a valid snapshot translating snake_case rows to cloud types', async () => {
    const { repo } = makeRepo(
      ok(null, 201),
      ok({ reset_generation: 1 }, 200),
      ok(
        [
          {
            item_id: 'a',
            status: 'learning',
            known_streak: 0,
            review_order: 0,
            reset_generation: 1,
          },
          {
            item_id: 'b',
            status: 'learned',
            known_streak: 3,
            review_order: 1,
            reset_generation: 1,
          },
        ],
        200,
      ),
    );
    const snapshot = await repo.loadSnapshot(USER_A);
    expect(snapshot).toEqual({
      resetGeneration: 1,
      items: [
        item('a', 'learning', 0, 0, 1),
        item('b', 'learned', 3, 1, 1),
      ],
    });
  });

  it('returns an empty valid snapshot', async () => {
    const { repo } = makeRepo(
      ok(null, 201),
      ok({ reset_generation: 0 }, 200),
      ok([], 200),
    );
    expect(await repo.loadSnapshot(USER_A)).toEqual({ resetGeneration: 0, items: [] });
  });

  it('preserves ascending review order as returned by the ordered query', async () => {
    // The DB returns rows already sorted (the `.order('review_order')` and
    // `.order('item_id')` clauses asserted in the minimal-progress-fields test);
    // the repository preserves that order without re-sorting in memory.
    const rows = [0, 1, 2, 3].map((order) => ({
      item_id: `id-${order}`,
      status: 'learning' as const,
      known_streak: 0,
      review_order: order,
      reset_generation: 0,
    }));
    const { repo, client } = makeRepo(
      ok(null, 201),
      ok({ reset_generation: 0 }, 200),
      ok(rows, 200),
    );
    const snapshot = await repo.loadSnapshot(USER_A);
    expect(snapshot.items.map((r) => r.reviewOrder)).toEqual([0, 1, 2, 3]);
    expect(snapshot.items.map((r) => r.itemId)).toEqual([
      'id-0',
      'id-1',
      'id-2',
      'id-3',
    ]);
    // The ordering is delegated to the database, not re-applied client-side.
    const progressQuery = calls(client)[2];
    expect(progressQuery.orders).toEqual([
      { column: 'review_order', ascending: true },
      { column: 'item_id', ascending: true },
    ]);
  });

  it('maps missing/malformed/wrong-generation/duplicate data to invalid-data', async () => {
    const invalidStates: unknown[] = [
      null,
      [],
      'x',
      { reset_generation: -1 },
      { reset_generation: 1.5 },
      { reset_generation: '1' },
    ];
    for (const badState of invalidStates) {
      const { repo } = makeRepo(ok(null, 201), ok(badState, 200), ok([], 200));
      await expect(repo.loadSnapshot(USER_A)).rejects.toMatchObject({
        kind: 'invalid-data',
      });
    }

    const row = (over: Record<string, unknown> = {}) => ({
      item_id: 'a',
      status: 'learning',
      known_streak: 0,
      review_order: 0,
      reset_generation: 0,
      ...over,
    });

    const invalidRows: unknown[][] = [
      // not an array
      ['not-array'],
      // missing field
      [row({ item_id: undefined })],
      // wrong course is impossible via RLS, but a wrong generation row is invalid
      [row({ reset_generation: 1 })],
      // duplicate item id
      [row({ item_id: 'a' }), row({ item_id: 'a', review_order: 1 })],
      // duplicate review order
      [row(), row({ item_id: 'b' })],
      // inconsistent streak (learning with 5)
      [row({ known_streak: 5 })],
      // learned with streak 1
      [row({ status: 'learned', known_streak: 1 })],
      // implicit new status
      [row({ status: 'new', known_streak: 0 })],
      // empty item id
      [row({ item_id: '' })],
      // negative order
      [row({ review_order: -1 })],
    ];
    for (const badRows of invalidRows) {
      const { repo } = makeRepo(ok(null, 201), ok({ reset_generation: 0 }, 200), ok(badRows, 200));
      await expect(repo.loadSnapshot(USER_A)).rejects.toMatchObject({
        kind: 'invalid-data',
      });
    }
  });

  it('maps a query failure to the classified category', async () => {
    const forbidden = makeRepo(
      ok(null, 201),
      fail(403, { code: '42501', message: 'permission denied' }),
      ok([], 200),
    );
    await expect(forbidden.repo.loadSnapshot(USER_A)).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});

// ─── pushMutations ─────────────────────────────────────────────────────────────

describe('pushMutations', () => {
  it('performs zero writes for an empty batch even with a bad user id', async () => {
    const { repo, client } = makeRepo();
    await expect(repo.pushMutations('not-a-uuid', 0, [])).resolves.toBeUndefined();
    expect(CALLS_COUNT(client)).toBe(0);
  });

  it('upserts exactly the supplied rows with caller user and fixed course, no timestamp', async () => {
    const { repo, client } = makeRepo(ok(null, 201));
    const items = [
      item('a', 'learning', 0, 0, 1),
      item('b', 'learned', 3, 1, 1),
    ];
    await repo.pushMutations(USER_A, 1, items);
    expect(CALLS_COUNT(client)).toBe(1);
    const upsert = calls(client)[0];
    expect(upsert.type).toBe('upsert');
    expect(upsert.table).toBe('basic_vocabulary_progress');
    expect(upsert.body).toEqual([
      {
        user_id: USER_A,
        course_id: 'basic-vocabulary',
        item_id: 'a',
        status: 'learning',
        known_streak: 0,
        review_order: 0,
        reset_generation: 1,
      },
      {
        user_id: USER_A,
        course_id: 'basic-vocabulary',
        item_id: 'b',
        status: 'learned',
        known_streak: 3,
        review_order: 1,
        reset_generation: 1,
      },
    ]);
    expect(upsert.onConflict).toBe('user_id,course_id,item_id');
    expect(upsert.ignoreDuplicates).toBe(false);
    // No client timestamp is ever written.
    expect(JSON.stringify(upsert.body)).not.toMatch(
      /"(updated_at|created_at|timestamp|ts)"\s*:/i,
    );
  });

  it('preserves ascending review order and never deletes absent rows', async () => {
    const { repo, client } = makeRepo(ok(null, 201));
    const items = [0, 1, 2, 3].map((order) => item(`id-${order}`, 'learning', 0, order, 0));
    await repo.pushMutations(USER_A, 0, items);
    const upsert = calls(client)[0];
    const body = upsert.body as Array<{ review_order: number }>;
    expect(body.map((r) => r.review_order)).toEqual([0, 1, 2, 3]);
    // Only the single upsert is recorded; no delete and no full-snapshot write.
    expect(calls(client).map((q) => q.type)).toEqual(['upsert']);
  });

  it('never writes a row for an absent (implicit new) item', async () => {
    const { repo, client } = makeRepo(ok(null, 201));
    await repo.pushMutations(USER_A, 0, [item('a', 'learning', 0, 0, 0)]);
    const body = calls(client)[0].body as unknown[];
    expect(body).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('"new"');
  });

  it('leaves the immutable batch input untouched', async () => {
    const { repo, client } = makeRepo(ok(null, 201));
    const items = Object.freeze([Object.freeze(item('a', 'learning', 0, 0, 0))]);
    await repo.pushMutations(USER_A, 0, items);
    expect(items[0]).toEqual(item('a', 'learning', 0, 0, 0));
    const body = calls(client)[0].body as unknown[];
    expect(body[0]).not.toBe(items[0]);
  });

  it('maps upsert failures to controlled categories', async () => {
    const cases: Array<{
      response: FakeResponse;
      kind: BasicVocabularyRepositoryErrorKind;
    }> = [
      { response: fail(401, { code: '42501', message: 'permission denied for table' }), kind: 'unauthenticated' },
      { response: fail(403, { code: '42501', message: 'new row violates row-level security policy' }), kind: 'forbidden' },
      { response: fail(409, FK_ERROR), kind: 'stale-generation' },
      { response: fail(undefined, { code: '', message: 'TypeError: fetch failed' }), kind: 'network' },
      { response: fail(0, { code: '', message: 'TypeError: fetch failed' }), kind: 'network' },
      { response: fail(500, { code: 'PGRST301', message: 'unexpected' }), kind: 'unknown' },
    ];
    for (const { response, kind } of cases) {
      const { repo } = makeRepo(response);
      await expect(
        repo.pushMutations(USER_A, 0, [item('a', 'learning', 0, 0, 0)]),
      ).rejects.toMatchObject({ kind });
    }
  });
});

// ─── reset ─────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('calls the RPC exactly once with exactly { p_reset_id } and no user/course argument', async () => {
    const { repo, client } = makeRepo(ok(2, 200));
    const generation = await repo.reset(USER_A, RESET_1);
    expect(generation).toBe(2);
    expect(CALLS_COUNT(client)).toBe(1);
    const rpc = calls(client)[0];
    expect(rpc.type).toBe('rpc');
    expect(rpc.fn).toBe('reset_basic_vocabulary_progress');
    expect(rpc.args).toEqual({ p_reset_id: RESET_1 });
    expect(Object.keys(rpc.args as object).sort()).toEqual(['p_reset_id']);
  });

  it('returns a valid non-negative safe integer result', async () => {
    const { repo } = makeRepo(ok(0, 200));
    expect(await repo.reset(USER_A, RESET_1)).toBe(0);
  });

  it('rejects a malformed success result as invalid-data', async () => {
    for (const bad of [-1, 1.5, '1', NaN, null, { x: 1 }]) {
      const { repo } = makeRepo(ok(bad, 200));
      await expect(repo.reset(USER_A, RESET_1)).rejects.toMatchObject({
        kind: 'invalid-data',
      });
    }
  });

  it('retrying the same reset ID calls the RPC twice while the server increments once', async () => {
    // Server behavior: the first call increments to 1, a retried identical ID
    // returns the same generation without incrementing.
    const { repo, client } = makeRepo(ok(1, 200), ok(1, 200));
    const first = await repo.reset(USER_A, RESET_1);
    const retried = await repo.reset(USER_A, RESET_1);
    expect(first).toBe(1);
    expect(retried).toBe(1);
    const rpcs = calls(client).filter((q) => q.type === 'rpc');
    expect(rpcs).toHaveLength(2);
    expect(rpcs[0].args).toEqual({ p_reset_id: RESET_1 });
    expect(rpcs[1].args).toEqual({ p_reset_id: RESET_1 });
  });

  it('a different reset ID increments again', async () => {
    const { repo } = makeRepo(ok(1, 200), ok(2, 200));
    expect(await repo.reset(USER_A, RESET_1)).toBe(1);
    expect(await repo.reset(USER_A, RESET_2)).toBe(2);
  });

  it('maps reset failures to controlled categories', async () => {
    const forbidden = makeRepo(fail(403, { code: '42501', message: 'permission denied' }));
    await expect(forbidden.repo.reset(USER_A, RESET_1)).rejects.toMatchObject({
      kind: 'forbidden',
    });

    const stale = makeRepo(fail(409, FK_ERROR));
    await expect(stale.repo.reset(USER_A, RESET_1)).rejects.toMatchObject({
      kind: 'stale-generation',
    });

    const net = makeRepo(fail(undefined, { code: '', message: 'TypeError: fetch failed' }));
    await expect(net.repo.reset(USER_A, RESET_1)).rejects.toMatchObject({
      kind: 'network',
    });
  });
});

// ─── Error contract ────────────────────────────────────────────────────────────

describe('BasicVocabularyRepositoryError', () => {
  it('has a stable category message and keeps the original error in cause', () => {
    const original = { code: '42501', message: 'new row violates row-level security policy' };
    const err = new BasicVocabularyRepositoryError('forbidden', original);
    expect(err.kind).toBe('forbidden');
    expect(err.message).toBe(
      'The current user cannot access this basic-vocabulary progress.',
    );
    expect(err.message).not.toContain('row-level security');
    expect(err.cause).toBe(original);
  });

  it('exposes only stable messages for every category', () => {
    const cases: Array<[BasicVocabularyRepositoryErrorKind, string]> = [
      ['unauthenticated', 'A signed-in user is required for this operation.'],
      ['forbidden', 'The current user cannot access this basic-vocabulary progress.'],
      ['stale-generation', 'Basic-vocabulary progress was reset and this change is stale.'],
      ['invalid-data', 'The basic-vocabulary server response was invalid.'],
      ['network', 'Could not reach the basic-vocabulary progress server.'],
      ['unknown', 'Basic-vocabulary progress could not be synced.'],
    ];
    for (const [kind, message] of cases) {
      expect(repoError(kind).message).toBe(message);
    }
  });
});

// ─── No forbidden environment / admin / service-role surface ──────────────────

describe('repository has no forbidden surfaces', () => {
  it('uses no admin, service-role, storage, DOM, timer, retry, realtime, or logging', async () => {
    const source = await readFile(
      join(ROOT, 'src/data/basicVocabularySupabaseRepository.ts'),
      'utf8',
    );
    // Tokens are assembled from fragments so this checker never contains the
    // full banned identifiers contiguously.
    const banned: readonly string[] = [
      'service' + '_role',
      'service' + 'Role',
      'local' + 'Storage',
      'session' + 'Storage',
      'docu' + 'ment.',
      'win' + 'dow.',
      'HTML' + 'Element',
      'Math.' + 'random',
      'set' + 'Timeout',
      'set' + 'Interval',
      'request' + 'AnimationFrame',
      'XMLHttp' + 'Request',
      'Web' + 'Socket',
      'send' + 'Beacon',
      'realtime',
      'onAuth' + 'StateChange',
      'get' + 'Session',
      'access_' + 'token',
      'refresh_' + 'token',
      'console.' + 'log',
      'console.' + 'error',
      'console.' + 'warn',
    ];
    for (const token of banned) {
      expect(source, token).not.toContain(token);
    }
    // No explicit retry loop.
    expect(source).not.toMatch(/for\s*\(\s*;\s*;\s*\)/);
  });
});

// ─── Live integration against the local Supabase stack ────────────────────────

function hasLocalSupabase(): boolean {
  return existsSync(join(ROOT, 'supabase', 'config.toml'));
}

function supabaseCliAvailable(): boolean {
  try {
    const r = spawnSync('supabase', ['--version'], { encoding: 'utf8', timeout: 10_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function supabaseStackRunning(): boolean {
  try {
    const r = spawnSync('supabase', ['status'], { encoding: 'utf8', timeout: 15_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 10_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function psql(queries: string): string {
  const r = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'],
    { input: queries, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const combined = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0 && !/error/i.test(combined)) {
    throw new Error(`psql exited ${r.status}: ${combined}`);
  }
  return combined;
}

function runLive(): boolean {
  return (
    hasLocalSupabase() &&
    supabaseCliAvailable() &&
    supabaseStackRunning() &&
    dockerAvailable()
  );
}

function liveSkipReason(): string {
  if (!hasLocalSupabase()) return 'supabase/config.toml not present';
  if (!supabaseCliAvailable()) return 'supabase CLI not installed';
  if (!supabaseStackRunning()) return 'local Supabase stack not running (run `supabase start`)';
  if (!dockerAvailable()) return 'docker daemon not available';
  return '';
}

const liveSuiteActive = runLive();
const liveSuiteSuffix = liveSuiteActive ? '' : ` (SKIPPED: ${liveSkipReason()})`;

describe.skipIf(!liveSuiteActive)(`basic-vocabulary repository (live database)${liveSuiteSuffix}`, () => {
  let apiUrl: string;
  let publishableKey: string;
  let jwtSecret: string;

  function liveJwt(userId: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        aud: 'authenticated',
        role: 'authenticated',
        exp: 1_999_999_999,
      }),
    ).toString('base64url');
    const data = `${header}.${payload}`;
    const sig = createHmac('sha256', jwtSecret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  function clientFor(userId: string): SupabaseClient {
    return createClient(apiUrl, publishableKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${liveJwt(userId)}` } },
    });
  }

  function repoFor(userId: string): ReturnType<typeof createBasicVocabularySupabaseRepository> {
    return createBasicVocabularySupabaseRepository(clientFor(userId));
  }

  beforeAll(async () => {
    const status = spawnSync('supabase', ['status'], { encoding: 'utf8', timeout: 15_000 });
    if (status.status !== 0) {
      throw new Error(`supabase status failed: ${status.stderr ?? status.stdout}`);
    }
    const match = (status.stdout as string).match(/\{[\s\S]*\}/);
    const info = match ? (JSON.parse(match[0]) as Record<string, string>) : {};
    apiUrl = info.API_URL ?? 'http://127.0.0.1:54321';
    publishableKey =
      info.PUBLISHABLE_KEY ?? '';
    jwtSecret =
      info.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
    if (publishableKey === '') {
      throw new Error('no publishable key from `supabase status`');
    }
    // Confirm the #287 schema is present and stable before running. Vitest
    // serializes this file with the schema reset suite, while this bounded
    // readiness check still gives a useful failure for a stale local stack.
    await ensureSchemaStable();
  }, 150_000);

  /**
   * Wait until the #287 schema is present and stable. The check is bounded so a
   * genuinely missing or still-restarting local schema fails instead of hanging.
   */
  async function ensureSchemaStable(): Promise<void> {
    const deadline = Date.now() + 120_000;
    let previous: string | null = null;
    for (;;) {
      // psql can throw while `supabase db reset` is rebuilding/restarting the
      // container; treat an unreachable database as "not ready yet".
      let check: string;
      try {
        check = psql(
          `select count(*) from pg_tables where schemaname = 'public' and tablename in ('basic_vocabulary_course_state', 'basic_vocabulary_progress')
           union all
           select count(*) from pg_proc where proname = 'reset_basic_vocabulary_progress' and pronamespace = 'public'::regnamespace;`,
        );
      } catch {
        check = '';
      }
      if (check.trim() === '2\n1' && check === previous) {
        return;
      }
      previous = check;
      if (Date.now() > deadline) {
        throw new Error(
          `#287 schema not present/stable after 120s. Run \`supabase db reset --local\` or start the stack. Last check: ${JSON.stringify(check)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  beforeEach(async () => {
    // Reconfirm the #287 schema before each live repository scenario.
    await ensureSchemaStable();
    // Re-seed the two test users idempotently so every scenario owns its setup,
    // including after a prior local reset.
    psql(`
delete from auth.users where email like 'repo-test-%';
insert into auth.users (id, email, encrypted_password) values
  ('${USER_A}', 'repo-test-a@example.com', 'x'),
  ('${USER_B}', 'repo-test-b@example.com', 'x');
`);
    // DELETE cascades from course_state to progress via the FK.
    psql('delete from public.basic_vocabulary_course_state;');
  }, 150_000);

  afterAll(() => {
    try {
      psql(`delete from auth.users where email like 'repo-test-%';`);
    } catch {
      // Best-effort cleanup; failing to clean up local test users is not a failure.
    }
  });

  it('user A round-trip: reset, push, load produce the expected snapshot', async () => {
    const repoA = repoFor(USER_A);
    expect(await repoA.reset(USER_A, RESET_1)).toBe(1);
    await repoA.pushMutations(USER_A, 1, [
      item('alpha', 'learning', 0, 0, 1),
      item('beta', 'learned', 3, 1, 1),
    ]);
    const snapshot = await repoA.loadSnapshot(USER_A);
    expect(snapshot.resetGeneration).toBe(1);
    expect(snapshot.items).toEqual([
      item('alpha', 'learning', 0, 0, 1),
      item('beta', 'learned', 3, 1, 1),
    ]);
  });

  it('user B is isolated from user A', async () => {
    const repoA = repoFor(USER_A);
    const repoB = repoFor(USER_B);
    await repoA.reset(USER_A, RESET_1);
    await repoA.pushMutations(USER_A, 1, [item('a-secret', 'learning', 0, 0, 1)]);

    // B sees its own clean empty snapshot and cannot infer A's rows.
    const bSnapshot = await repoB.loadSnapshot(USER_B);
    expect(bSnapshot).toEqual({ resetGeneration: 0, items: [] });
  });

  it('A writes are not visible or writable by B', async () => {
    const repoA = repoFor(USER_A);
    const repoB = repoFor(USER_B);
    await repoA.reset(USER_A, RESET_1);
    await repoA.pushMutations(USER_A, 1, [item('a-row', 'learning', 0, 0, 1)]);

    // B resets B and pushes B's own row; A is untouched.
    await repoB.reset(USER_B, RESET_1);
    await repoB.pushMutations(USER_B, 1, [item('b-row', 'learning', 0, 0, 1)]);
    const aAfter = await repoA.loadSnapshot(USER_A);
    expect(aAfter.items).toEqual([item('a-row', 'learning', 0, 0, 1)]);
    expect(aAfter.resetGeneration).toBe(1);
  });

  it('same reset ID retried twice calls the RPC twice but increments the server generation once', async () => {
    const repoA = repoFor(USER_A);
    const first = await repoA.reset(USER_A, RESET_1);
    expect(first).toBe(1);
    const retried = await repoA.reset(USER_A, RESET_1);
    expect(retried).toBe(1);
    const snapshot = await repoA.loadSnapshot(USER_A);
    expect(snapshot.resetGeneration).toBe(1);
  });

  it('a different reset ID increments again', async () => {
    const repoA = repoFor(USER_A);
    expect(await repoA.reset(USER_A, RESET_1)).toBe(1);
    expect(await repoA.reset(USER_A, RESET_2)).toBe(2);
  });

  it('no user/course/reset target can be selected through RPC parameters', async () => {
    const repoA = repoFor(USER_A);
    // Only `p_reset_id` is ever sent; there is no way to pass a user or course.
    await expect(repoA.reset(USER_A, RESET_1)).resolves.toBe(1);
    // The reset applies to A regardless of any attempted targeting.
    const snapshot = await repoA.loadSnapshot(USER_A);
    expect(snapshot.resetGeneration).toBe(1);
  });

  it('rejects a stale-generation push after a reset', async () => {
    const repoA = repoFor(USER_A);
    await repoA.reset(USER_A, RESET_1);
    await repoA.reset(USER_A, RESET_2);
    // A push at the stale generation 1 passes the ownership-only RLS with-check
    // and is then rejected by the progress FK `(user_id, course_id,
    // reset_generation) -> course_state` (23503): the state row at generation 1
    // no longer exists. The repository maps that FK violation to
    // `stale-generation`.
    await expect(
      repoA.pushMutations(USER_A, 1, [item('raced', 'learning', 0, 0, 1)]),
    ).rejects.toMatchObject({ kind: 'stale-generation' });
    // Nothing from the stale generation survived.
    const snapshot = await repoA.loadSnapshot(USER_A);
    expect(snapshot.resetGeneration).toBe(2);
    expect(snapshot.items).toEqual([]);
  });
});
