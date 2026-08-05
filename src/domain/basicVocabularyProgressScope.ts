import { BASIC_VOCABULARY_PROGRESS_KEY } from './basicVocabularyProgress';

/**
 * Identity scope for local basic-vocabulary progress.
 *
 * Only two scopes exist: the legacy guest scope (all visitors share one
 * physical key) and a user scope pinned to a validated Supabase user ID.
 * The user ID is derived from a single canonical source (the Supabase auth
 * identity), never from an email, Google subject, display name, provider
 * metadata, hash, or random device ID.
 */
export type BasicVocabularyProgressScope =
  | { readonly kind: 'guest' }
  | { readonly kind: 'user'; readonly userId: string };

/** Guest scope: progress is stored under the legacy guest key. */
export const BASIC_VOCABULARY_GUEST_SCOPE: BasicVocabularyProgressScope = {
  kind: 'guest',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Accept only canonical lowercase v1 UUID strings (e.g. Supabase `auth.users.id`).
 *
 * Rejects, rather than normalizes, uppercase, malformed, blank, whitespace-
 * padded, path-like, and non-UUID values so a bad identifier can never collide
 * with or corrupt the guest key space.
 */
export function isValidSupabaseUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Resolve a scope to the exact physical local-storage key.
 *
 * The guest scope returns the legacy `BASIC_VOCABULARY_PROGRESS_KEY`
 * byte-for-byte; the user scope returns the exact scoped key
 * `chabiko:basic-vocabulary-progress:user:{userId}:v1`. Calling this with an
 * invalid user ID throws instead of silently writing to a corrupt key.
 */
export function getBasicVocabularyProgressStorageKey(
  scope: BasicVocabularyProgressScope,
): string {
  if (scope.kind === 'guest') return BASIC_VOCABULARY_PROGRESS_KEY;
  if (!isValidSupabaseUserId(scope.userId)) {
    throw new Error(
      `Invalid Supabase user ID for basic-vocabulary progress scope: "${scope.userId}"`,
    );
  }
  return `chabiko:basic-vocabulary-progress:user:${scope.userId}:v1`;
}
