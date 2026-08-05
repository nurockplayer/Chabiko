import type { StorageLike } from '../lib/progress';
import {
  applyRatingToProgress,
  prioritizeVocabularyIds,
  selectSessionItems,
} from './vocabularyProgress';
import type {
  VocabularyProgressEntry,
  VocabularyProgressStatus,
} from './vocabularyProgress';

// ─── Constants ──────────────────────────────────────────────────────────────────

export const BASIC_VOCABULARY_PROGRESS_KEY =
  'chabiko:basic-vocabulary-progress:v1';

const PROBE_KEY = '__chabiko_basic_vocab_probe__';
const CURRENT_SCHEMA_VERSION = 1;

// ─── Document types ─────────────────────────────────────────────────────────────

export interface BasicVocabularyProgressDocument {
  readonly version: 1;
  readonly items: Record<string, VocabularyProgressEntry>;
}

// ─── All-or-nothing validation ─────────────────────────────────────────────────

function parseDocument(raw: string): BasicVocabularyProgressDocument | null {
  try {
    const parsed = JSON.parse(raw);
    if (!isValidRoot(parsed)) return null;
    const items: Record<string, VocabularyProgressEntry> = {};
    for (const [id, entry] of Object.entries(parsed.items)) {
      if (typeof id !== 'string' || id === '') return null;
      if (!isValidItemEntry(entry)) return null;
      const e = entry as Record<string, unknown>;
      const status = String(e.status) as VocabularyProgressStatus;
      const knownStreak = Number(e.knownStreak);
      if (!isConsistent(status, knownStreak)) return null;
      items[id] = { status, knownStreak };
    }
    return { version: 1, items };
  } catch {
    return null;
  }
}

function isValidRoot(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 2) return false;
  if (obj.version !== CURRENT_SCHEMA_VERSION || typeof obj.version !== 'number') return false;
  if (obj.items === null || typeof obj.items !== 'object' || Array.isArray(obj.items)) return false;
  return true;
}

function isValidItemEntry(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 2) return false;
  if (obj.status !== 'new' && obj.status !== 'learning' && obj.status !== 'learned') return false;
  if (typeof obj.knownStreak !== 'number' || Number.isNaN(obj.knownStreak) || !Number.isInteger(obj.knownStreak) || obj.knownStreak < 0) return false;
  return true;
}

function isConsistent(status: VocabularyProgressStatus, knownStreak: number): boolean {
  if (status === 'new') return knownStreak === 0;
  if (status === 'learning') return knownStreak === 0 || knownStreak === 1;
  if (status === 'learned') return knownStreak >= 2;
  return false;
}

// ─── Default storage ────────────────────────────────────────────────────────────

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const prev = localStorage.getItem(PROBE_KEY);
      localStorage.setItem(PROBE_KEY, '1');
      localStorage.removeItem(PROBE_KEY);
      if (prev !== null) {
        localStorage.setItem(PROBE_KEY, prev);
      }
      return localStorage;
    }
  } catch {
    /* localStorage unavailable (SSR, private browsing, etc.) */
  }
  return null;
}

function emptyDocument(): BasicVocabularyProgressDocument {
  return { version: 1, items: {} };
}

// ─── Store ──────────────────────────────────────────────────────────────────────

/**
 * Crash-safe, isolated local progress store for the basic-vocabulary course.
 *
 * - Malformed JSON, wrong schema version, unavailable storage, quota errors all
 *   fall back to page-lifetime in-memory state.
 * - Re-reads storage before every write to prevent stale-instance resurrection
 *   and merge concurrent cross-tab writes.  When a previous write has failed,
 *   local pending changes are authoritative for their IDs while storage entries
 *   for other IDs are still merged in.
 * - Explicit cross-tab deletion is authoritative while the key remains absent,
 *   and clears stale in-memory progress plus pending write state.
 * - A failed resetAll (removeItem throws) prevents subsequent storage reads
 *   from resurrecting the old document.
 * - All-or-nothing read validation: any invalid field/version/item invalidates
 *   the entire stored document (falls back to empty in-memory).
 * - Never calls localStorage.clear() or touches lesson/HSK/theme keys.
 */
export class BasicVocabularyProgressStore {
  private document: BasicVocabularyProgressDocument;
  private storage: StorageLike | null;
  private readonly storageKey: string;
  private persistFailed = false;
  private pendingChanges = new Set<string>();
  private resetPending = false;

  /**
   * @param storage   Optional storage-like backend. Defaults to
   *                  localStorage when available, otherwise null.
   * @param storageKey Optional physical key. Defaults to the legacy guest key
   *                  `BASIC_VOCABULARY_PROGRESS_KEY`. Pass the result of
   *                  `getBasicVocabularyProgressStorageKey(scope)` to operate
   *                  against a user-scoped key. An empty key throws.
   */
  constructor(storage?: StorageLike | null, storageKey?: string) {
    if (storageKey !== undefined && storageKey === '') {
      throw new Error(
        'BasicVocabularyProgressStore storageKey must not be empty',
      );
    }
    this.document = emptyDocument();
    this.storage = storage !== undefined ? storage : getDefaultStorage();
    this.storageKey =
      storageKey !== undefined ? storageKey : BASIC_VOCABULARY_PROGRESS_KEY;
    this.load();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getStatus(id: string): VocabularyProgressStatus {
    return this.document.items[id]?.status ?? 'new';
  }

  getKnownStreak(id: string): number {
    return this.document.items[id]?.knownStreak ?? 0;
  }

  getAllItems(): Readonly<Record<string, VocabularyProgressEntry>> {
    return this.document.items;
  }

  /**
   * Accept synthetic events with an unknown area and real events from the
   * exact storage object owned by this store. Reject other storage areas.
   */
  isRelevantStorageArea(storageArea: StorageLike | null): boolean {
    return storageArea === null || storageArea === this.storage;
  }

  /** The exact physical storage key this store reads, writes, and removes. */
  getStorageKey(): string {
    return this.storageKey;
  }

  /**
   * Whether a storage event key affects this store. `null` represents a
   * storage-wide clear and is relevant; otherwise only exact equality with the
   * instance key is relevant.
   */
  isRelevantStorageKey(key: string | null): boolean {
    return key === null || key === this.storageKey;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Apply a revealed rating and persist.
   * Re-reads current storage first to merge cross-tab changes.
   * Local pending changes (from prior write failures) override storage for
   * their IDs; storage entries for other IDs are still merged in.
   *
   * The rated item is re-inserted at the end of the items object. The object
   * key insertion order is the persisted LRU rotation state (Issue #204):
   * the least-recently-reviewed items sit at the front and are picked first
   * by the canonical selector. The item shape itself stays `{status,
   * knownStreak}`, so legacy v1 readers parse documents written here
   * losslessly.
   */
  applyRating(id: string, rating: 'again' | 'unsure' | 'known'): void {
    this.syncFromStorage();
    const current = this.document.items[id];
    const next = applyRatingToProgress(current, rating);
    // Immutably rebuild the items object: move the rated item to the end so
    // the front of the object is the least-recently-reviewed set.
    const nextItems: Record<string, VocabularyProgressEntry> = {};
    for (const [k, v] of Object.entries(this.document.items)) {
      if (k !== id) nextItems[k] = v;
    }
    nextItems[id] = next;
    this.document = { version: 1, items: nextItems };
    this.pendingChanges.add(id);
    this.persist();
  }

  /**
   * Build a priority-ordered ID list for a new session.
   * Priority: learning → new → learned, stable source order within groups.
   * Stored unknown IDs are ignored for selection/count display but remain
   * untouched in storage unless reset.
   */
  prioritize(ids: readonly string[]): string[] {
    return prioritizeVocabularyIds(ids, this.document.items);
  }

  /**
   * Select a canonical bounded session window over the full corpus.
   * Delegate for the shared full-corpus fairness rule (Issue #204):
   * bounded near-term review of learning items plus an unseen-progress
   * window, so every eligible item is eventually reachable. Deterministic
   * for identical corpus and progress state.
   */
  selectSession(ids: readonly string[], sessionSize: number): string[] {
    return selectSessionItems(ids, this.document.items, sessionSize);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Re-read progress from storage. Call on `pageshow`. */
  refresh(): void {
    this.syncFromStorage();
    /* storage === null: keep in-memory state (syncFromStorage returns early) */
  }

  /**
   * Accept an explicit deletion from another browsing context as authoritative
   * only while the storage key is still absent. Returns false when a newer write
   * has already repopulated the key and the delayed deletion event is stale.
   *
   * This is separate from refresh() so an ordinary pageshow can still preserve
   * page-lifetime progress after a local write failure.
   */
  acceptExternalClear(): boolean {
    if (this.storage !== null) {
      try {
        if (this.storage.getItem(this.storageKey) !== null) {
          return false;
        }
      } catch {
        /* The explicit deletion event remains the best available signal. */
      }
    }

    this.document = emptyDocument();
    this.persistFailed = false;
    this.pendingChanges.clear();
    this.resetPending = false;
    return true;
  }

  /**
   * Reset only the basic-vocabulary progress key.
   * Never calls localStorage.clear() or touches lesson/HSK/theme keys.
   * When removeItem fails, the resetPending flag prevents subsequent
   * storage reads from resurrecting the old document.
   */
  resetAll(): void {
    this.document = emptyDocument();
    this.pendingChanges.clear();
    try {
      this.storage?.removeItem(this.storageKey);
      this.resetPending = false;
    } catch {
      this.resetPending = true;
      /* best-effort — resetPending prevents storage resurrection */
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (typeof raw === 'string') {
        const doc = parseDocument(raw);
        if (doc !== null) {
          this.document = doc;
          return;
        }
      }
    } catch {
      /* keep defaults */
    }
    this.document = emptyDocument();
  }

  private syncFromStorage(): void {
    if (this.storage === null) return;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (typeof raw === 'string') {
        const doc = parseDocument(raw);
        if (doc !== null) {
          if (this.resetPending) {
            // A prior resetAll failed to removeItem; keep empty in-memory state.
            return;
          }
          if (this.persistFailed && this.pendingChanges.size > 0) {
            // Merge: local pending entries are authoritative for their IDs and
            // keep their local LRU order (they were reviewed most recently and
            // must stay at the end of the rotation), while storage entries for
            // other IDs keep their stored order and cross-tab IDs are merged.
            const merged: Record<string, VocabularyProgressEntry> = {};
            for (const [k, v] of Object.entries(doc.items)) {
              if (!(this.pendingChanges.has(k) && k in this.document.items)) {
                merged[k] = v;
              }
            }
            for (const [k, v] of Object.entries(this.document.items)) {
              if (this.pendingChanges.has(k)) {
                merged[k] = v;
              }
            }
            this.document = { version: 1, items: merged };
            return;
          }
          this.document = doc;
          this.persistFailed = false;
        }
        // malformed — keep existing in-memory state
      } else {
        // absent key
        if (this.resetPending) return;
        if (this.persistFailed) return;
        this.document = emptyDocument();
      }
    } catch {
      /* storage malformed — keep existing in-memory state */
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        this.storageKey,
        JSON.stringify(this.document),
      );
      this.persistFailed = false;
      this.resetPending = false;
      this.pendingChanges.clear();
    } catch {
      this.persistFailed = true;
      /* storage full or unavailable — keep in-memory state */
    }
  }
}
