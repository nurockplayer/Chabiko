import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BasicVocabularyCloudItem,
  BasicVocabularyCloudSnapshot,
} from '../domain/basicVocabularySync';
import { isValidSupabaseUserId } from '../domain/basicVocabularyProgressScope';

/**
 * Basic-vocabulary Supabase repository (Issue #291).
 *
 * One typed data adapter that translates the #287 schema (RLS-owned
 * `basic_vocabulary_*` tables, server-authored timestamps, idempotent
 * `reset_basic_vocabulary_progress` RPC) into the #289 cloud types
 * (`BasicVocabularyCloudSnapshot` / `BasicVocabularyCloudItem`).
 *
 * The repository:
 * - queries exclusively as the signed-in user against the pinned browser
 *   client; it never reads email, Google IDs, metadata, JWT payloads, provider
 *   claims, admin state, or service-role helpers;
 * - duplicates owner filters (`user_id`, fixed course id) on every table query
 *   even though RLS already enforces ownership;
 * - validates every row through the #289 invariants before returning it;
 * - supports idempotent reset IDs by calling the #287 RPC exactly once per
 *   invocation with exactly `{ p_reset_id }`;
 * - exposes controlled error categories via `BasicVocabularyRepositoryError`
 *   with a stable category message; the original error stays in `cause` and is
 *   never learner-facing.
 *
 * There is deliberately no UI, storage, retry, merge, online-listener, or
 * real-time subscription logic here.
 */

/**
 * Stable, learner-safe error categories exposed by the repository.
 *
 * The category message is the only error text a caller may surface; the
 * original error object is retained in `cause` and never shown to a learner.
 */
export type BasicVocabularyRepositoryErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'stale-generation'
  | 'invalid-data'
  | 'network'
  | 'unknown';

export class BasicVocabularyRepositoryError extends Error {
  readonly kind: BasicVocabularyRepositoryErrorKind;
  readonly cause?: unknown;

  constructor(kind: BasicVocabularyRepositoryErrorKind, cause?: unknown) {
    super(stableKindMessage(kind));
    this.name = 'BasicVocabularyRepositoryError';
    this.kind = kind;
    this.cause = cause;
  }
}

export interface BasicVocabularySupabaseRepository {
  loadSnapshot(userId: string): Promise<BasicVocabularyCloudSnapshot>;
  pushMutations(
    userId: string,
    generation: number,
    items: readonly BasicVocabularyCloudItem[],
  ): Promise<void>;
  reset(userId: string, resetId: string): Promise<number>;
}

export function createBasicVocabularySupabaseRepository(
  client: SupabaseClient,
): BasicVocabularySupabaseRepository {
  return new BasicVocabularySupabaseRepositoryImpl(client);
}

/** Fixed course id owned by this repository; every query filters it. */
const COURSE_ID = 'basic-vocabulary';

/**
 * The #287 foreign key that enforces the stale-generation contract: a progress
 * row references the exact state row `(user_id, course_id, reset_generation)`.
 * Inserting an old generation after a reset fails this FK.
 */
const STALE_GENERATION_FK =
  'basic_vocabulary_progress_user_id_course_id_reset_generati_fkey';

function toRepoError(
  kind: BasicVocabularyRepositoryErrorKind,
  cause: unknown,
): never {
  throw new BasicVocabularyRepositoryError(kind, cause);
}

function stableKindMessage(kind: BasicVocabularyRepositoryErrorKind): string {
  switch (kind) {
    case 'unauthenticated':
      return 'A signed-in user is required for this operation.';
    case 'forbidden':
      return 'The current user cannot access this basic-vocabulary progress.';
    case 'stale-generation':
      return 'Basic-vocabulary progress was reset and this change is stale.';
    case 'invalid-data':
      return 'The basic-vocabulary server response was invalid.';
    case 'network':
      return 'Could not reach the basic-vocabulary progress server.';
    default:
      return 'Basic-vocabulary progress could not be synced.';
  }
}

/**
 * Classify an arbitrary failure from a PostgREST query/RPC into a stable
 * category. The `error` object carries the SQLSTATE/code and details; the
 * HTTP status lives on the response, so it is passed in explicitly.
 *
 * Classification order (never raw English text):
 * 1. HTTP 401 → `unauthenticated` (absent/invalid auth; the SQLSTATE here is
 *    `42501`, so the status check must come first).
 * 2. SQLSTATE `42501` → `forbidden` (RLS/permission denial).
 * 3. SQLSTATE `23503` on the known stale-generation FK → `stale-generation`.
 * 4. No HTTP status (or status 0) and empty code → `network` (the SDK's
 *    transport-failure fallback shapes fetch rejections as `{ code: '' }`
 *    and reports the HTTP status as `0` when no response arrived).
 * 5. Otherwise → `unknown`.
 */
function classifyError(
  status: number | undefined,
  cause: unknown,
): BasicVocabularyRepositoryErrorKind {
  if (cause === null || cause === undefined || typeof cause !== 'object') {
    return 'unknown';
  }
  const err = cause as { code?: unknown; details?: unknown; message?: unknown };
  const code = typeof err.code === 'string' ? err.code : '';

  if (status === 401) return 'unauthenticated';
  if (code === '42501') return 'forbidden';
  if (code === '23503') {
    // Postgres reports the violated constraint name in `message` (and the key
    // details in `details`); match the known stale-generation FK in either.
    const message = typeof err.message === 'string' ? err.message : '';
    const details = typeof err.details === 'string' ? err.details : '';
    if (message.includes(STALE_GENERATION_FK) || details.includes(STALE_GENERATION_FK)) {
      return 'stale-generation';
    }
  }
  if (status === undefined || status === 0) {
    if (code === '') return 'network';
  }
  return 'unknown';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Validate a single progress row as returned by the database (snake_case).
 * `isValidCloudItemRow` narrows it to the camelCase cloud item; the return
 * value is the translated row, so no untranslated field can leak out.
 */
function parseCloudItemRow(
  value: unknown,
): BasicVocabularyCloudItem | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const { item_id, status, known_streak, review_order, reset_generation } = row;
  if (typeof item_id !== 'string' || item_id === '' || item_id === '__proto__') {
    return null;
  }
  if (status !== 'learning' && status !== 'learned') return null;
  if (!isNonNegativeInteger(known_streak)) return null;
  if (!isNonNegativeInteger(review_order)) return null;
  if (!isNonNegativeInteger(reset_generation)) return null;
  // #287 `basic_vocabulary_progress_streak_matches_status`: learning 0/1,
  // learned >= 2. A row violating it is corrupted data, not a real snapshot.
  if (status === 'learning') {
    if (known_streak !== 0 && known_streak !== 1) return null;
  } else if (known_streak < 2) {
    return null;
  }
  return {
    itemId: item_id,
    status,
    knownStreak: known_streak,
    reviewOrder: review_order,
    resetGeneration: reset_generation,
  };
}

/**
 * Validate an already-cloud-shaped item (camelCase) before a push. The cloud
 * type is the same #289 shape the merge layer consumes.
 */
function isValidCloudItem(value: unknown): value is BasicVocabularyCloudItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const { itemId, status, knownStreak, reviewOrder, resetGeneration } = obj;
  if (typeof itemId !== 'string' || itemId === '' || itemId === '__proto__') {
    return false;
  }
  if (status !== 'learning' && status !== 'learned') return false;
  if (!isNonNegativeInteger(knownStreak)) return false;
  if (!isNonNegativeInteger(reviewOrder)) return false;
  if (!isNonNegativeInteger(resetGeneration)) return false;
  if (status === 'learning') {
    if (knownStreak !== 0 && knownStreak !== 1) return false;
  } else if (knownStreak < 2) {
    return false;
  }
  return true;
}

/**
 * All-or-nothing validation of a loaded snapshot. Any missing/malformed row,
 * wrong generation, or duplicate id/order invalidates the whole snapshot and
 * maps to `invalid-data`. An empty valid snapshot is allowed. Rows are
 * translated from snake_case database fields to the #289 cloud item shape.
 */
function validateSnapshot(
  state: unknown,
  progress: readonly unknown[],
): BasicVocabularyCloudSnapshot {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return toRepoError('invalid-data', state);
  }
  const stateRow = state as Record<string, unknown>;
  const generation = stateRow.reset_generation;
  if (!isNonNegativeInteger(generation)) {
    return toRepoError('invalid-data', state);
  }
  if (!Array.isArray(progress)) {
    return toRepoError('invalid-data', progress);
  }

  const items: BasicVocabularyCloudItem[] = [];
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const raw of progress) {
    const parsed = parseCloudItemRow(raw);
    if (parsed === null) {
      return toRepoError('invalid-data', raw);
    }
    if (parsed.resetGeneration !== generation) {
      return toRepoError('invalid-data', raw);
    }
    if (seenIds.has(parsed.itemId)) {
      return toRepoError('invalid-data', raw);
    }
    if (seenOrders.has(parsed.reviewOrder)) {
      return toRepoError('invalid-data', raw);
    }
    seenIds.add(parsed.itemId);
    seenOrders.add(parsed.reviewOrder);
    items.push(parsed);
  }
  return { resetGeneration: generation, items };
}

/**
 * Validate a push batch before any network call. Generation and every item
 * must be valid and must share the batch generation; ids and orders must be
 * unique. Empty batches return before validation and never touch the network.
 */
function validateBatch(
  userId: string,
  generation: number,
  items: readonly BasicVocabularyCloudItem[],
): void {
  if (!isValidSupabaseUserId(userId)) {
    toRepoError('invalid-data', `Invalid user id "${userId}"`);
  }
  if (!isNonNegativeInteger(generation)) {
    toRepoError('invalid-data', `Invalid generation ${generation}`);
  }
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const item of items) {
    if (!isValidCloudItem(item)) {
      toRepoError('invalid-data', item);
    }
    if (item.resetGeneration !== generation) {
      toRepoError('invalid-data', item);
    }
    if (seenIds.has(item.itemId)) {
      toRepoError('invalid-data', item);
    }
    if (seenOrders.has(item.reviewOrder)) {
      toRepoError('invalid-data', item);
    }
    seenIds.add(item.itemId);
    seenOrders.add(item.reviewOrder);
  }
}

class BasicVocabularySupabaseRepositoryImpl implements BasicVocabularySupabaseRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadSnapshot(
    userId: string,
  ): Promise<BasicVocabularyCloudSnapshot> {
    if (!isValidSupabaseUserId(userId)) {
      toRepoError('invalid-data', `Invalid user id "${userId}"`);
    }

    try {
      // Non-destructive state init: a missing state row is created at
      // generation 0 with a conflict-ignore, so the first load is a clean
      // empty snapshot and an existing row is never overwritten.
      const ensure = await this.client
        .from('basic_vocabulary_course_state')
        .upsert(
          { user_id: userId, course_id: COURSE_ID },
          { onConflict: 'user_id,course_id', ignoreDuplicates: true },
        );
      if (ensure.error) {
        toRepoError(classifyError(ensure.status, ensure.error), ensure.error);
      }

      // Minimal state fields; `last_reset_id` is not part of the cloud
      // snapshot and is not exposed to the runtime.
      const state = await this.client
        .from('basic_vocabulary_course_state')
        .select('reset_generation')
        .eq('user_id', userId)
        .eq('course_id', COURSE_ID)
        .maybeSingle();
      if (state.error) {
        toRepoError(classifyError(state.status, state.error), state.error);
      }

      // A valid signed-in user always has a state row after the ensure above;
      // a missing row is still guarded rather than silently coerced.
      if (!isNonNegativeInteger(state.data?.reset_generation)) {
        toRepoError('invalid-data', state.data);
      }

      // Minimal progress fields for the exact user/course/current generation,
      // ordered by review order with a defensive item-id tie-break.
      const progress = await this.client
        .from('basic_vocabulary_progress')
        .select('item_id,status,known_streak,review_order,reset_generation')
        .eq('user_id', userId)
        .eq('course_id', COURSE_ID)
        .eq('reset_generation', state.data?.reset_generation)
        .order('review_order', { ascending: true })
        .order('item_id', { ascending: true });
      if (progress.error) {
        toRepoError(classifyError(progress.status, progress.error), progress.error);
      }

      return validateSnapshot(state.data, progress.data);
    } catch (error) {
      if (error instanceof BasicVocabularyRepositoryError) throw error;
      toRepoError('unknown', error);
    }
  }

  async pushMutations(
    userId: string,
    generation: number,
    items: readonly BasicVocabularyCloudItem[],
  ): Promise<void> {
    // Zero-write contract: an empty batch never touches the network.
    if (items.length === 0) return;

    // Validate generation/items and the same-generation batch before any
    // network call, so a bad batch can never reach the database.
    validateBatch(userId, generation, items);

    try {
      const rows = items.map((item) => ({
        user_id: userId,
        course_id: COURSE_ID,
        item_id: item.itemId,
        status: item.status,
        known_streak: item.knownStreak,
        review_order: item.reviewOrder,
        reset_generation: item.resetGeneration,
      }));
      const result = await this.client
        .from('basic_vocabulary_progress')
        .upsert(rows, {
          onConflict: 'user_id,course_id,item_id',
          ignoreDuplicates: false,
        });
      if (result.error) {
        toRepoError(classifyError(result.status, result.error), result.error);
      }
    } catch (error) {
      if (error instanceof BasicVocabularyRepositoryError) throw error;
      toRepoError('unknown', error);
    }
  }

  async reset(userId: string, resetId: string): Promise<number> {
    if (!isValidSupabaseUserId(userId)) {
      toRepoError('invalid-data', `Invalid user id "${userId}"`);
    }
    if (!isValidSupabaseUserId(resetId)) {
      toRepoError('invalid-data', `Invalid reset id "${resetId}"`);
    }

    try {
      // Call the RPC exactly once with exactly `{ p_reset_id }`; no user or
      // course argument can be selected through the parameters. The RPC reads
      // `auth.uid()` itself, so the user is never caller-controllable here.
      const result = await this.client.rpc('reset_basic_vocabulary_progress', {
        p_reset_id: resetId,
      });
      if (result.error) {
        toRepoError(classifyError(result.status, result.error), result.error);
      }
      const generation = result.data;
      if (!isNonNegativeInteger(generation)) {
        toRepoError('invalid-data', generation);
      }
      return generation;
    } catch (error) {
      if (error instanceof BasicVocabularyRepositoryError) throw error;
      toRepoError('unknown', error);
    }
  }
}
