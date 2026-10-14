import type { StorageLike } from '../lib/progress';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VocabularyProgressStatus = 'new' | 'learning' | 'learned';

export interface VocabularyProgressEntry {
  readonly status: VocabularyProgressStatus;
  readonly knownStreak: number;
}

export interface VocabularyProgressDocument {
  readonly version: 1;
  readonly entries: Record<string, VocabularyProgressEntry>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const VOCABULARY_PROGRESS_KEY = 'chabiko:hsk-vocabulary-progress:v1';
const CURRENT_SCHEMA_VERSION = 1;
const PROBE_KEY = '__chabiko_vocab_probe__';

// ─── Initial values ───────────────────────────────────────────────────────────

export function emptyDocument(): VocabularyProgressDocument {
  return { version: 1, entries: {} };
}

// ─── Transitions ──────────────────────────────────────────────────────────────

/**
 * Compute the next progress entry after a rating.
 *
 * - again / unsure → status `learning`, knownStreak = 0
 * - known → increment knownStreak by 1
 * - knownStreak >= 2 → status `learned`
 * - first known (streak 1) → status `learning`
 */
export function applyRatingToProgress(
  current: VocabularyProgressEntry | undefined,
  rating: 'again' | 'unsure' | 'known',
): VocabularyProgressEntry {
  if (rating === 'again' || rating === 'unsure') {
    return { status: 'learning', knownStreak: 0 };
  }
  // rating === 'known'
  const prevStreak = current?.knownStreak ?? 0;
  const nextStreak = prevStreak + 1;
  return {
    status: nextStreak >= 2 ? 'learned' : 'learning',
    knownStreak: nextStreak,
  };
}

// ─── Priority ordering ────────────────────────────────────────────────────────

const STATUS_ORDER: Record<VocabularyProgressStatus, number> = {
  learning: 0,
  new: 1,
  learned: 2,
};

/**
 * Sort vocabulary IDs for a new session.
 * Priority: learning → new → learned.
 * Within each group, source order is preserved (stable sort).
 * Unknown IDs default to `new`.
 */
export function prioritizeVocabularyIds(
  ids: readonly string[],
  entries: Readonly<Record<string, VocabularyProgressEntry>>,
): string[] {
  const indexMap = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    indexMap.set(ids[i], i);
  }
  return [...ids].sort((a, b) => {
    const rankA = STATUS_ORDER[entries[a]?.status ?? 'new'];
    const rankB = STATUS_ORDER[entries[b]?.status ?? 'new'];
    if (rankA !== rankB) return rankA - rankB;
    return (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0);
  });
}

/**
 * Select a bounded, deterministic session window over the full corpus.
 *
 * Fairness rule (Issue #204): the window reserves a fixed quota for unseen
 * (`new`) items — at least `floor(sessionSize / 2)` slots, or all of them
 * when the corpus has fewer — so completed sessions always move the unseen
 * front forward and items beyond the first session eventually become
 * reachable. `learning` (`again`/`unsure`) items fill the remaining slots,
 * selected least-recently-reviewed first (by the persisted items key order,
 * tie-broken by source order) so a difficult item that keeps being answered
 * `again`/`unsure` is deprioritized for the next window instead of
 * permanently blocking the items behind it. `learned` items only fill slots
 * that neither unseen nor learning can fill, which guarantees a full window
 * whenever eligible IDs suffice. A single difficult item therefore never
 * starves the unseen corpus, and repeated completed sessions eventually reach
 * every eligible item.
 *
 * Deterministic: a pure function of the source-ordered corpus and the
 * progress entries; identical inputs always produce identical output.
 */
export function selectSessionItems(
  ids: readonly string[],
  entries: Readonly<Record<string, VocabularyProgressEntry>>,
  sessionSize: number,
): string[] {
  if (sessionSize <= 0 || ids.length === 0) return [];

  const learning: string[] = [];
  const unseen: string[] = [];
  const learned: string[] = [];
  for (const id of ids) {
    const status = entries[id]?.status ?? 'new';
    if (status === 'learning') learning.push(id);
    else if (status === 'new') unseen.push(id);
    else learned.push(id);
  }

  // Learning items ordered least-recently-reviewed first. The store keeps the
  // persisted items object in review order (a reviewed item is re-inserted at
  // the end), so the front of `entries` is the least recently reviewed and the
  // back is the most recent. Source order breaks ties when key order cannot.
  const keyIndex = new Map<string, number>();
  let keyPos = 0;
  for (const key of Object.keys(entries)) {
    keyIndex.set(key, keyPos);
    keyPos++;
  }
  const orderedLearning = [...learning].sort((a, b) => {
    const idxA = keyIndex.has(a) ? keyIndex.get(a)! : Number.MAX_SAFE_INTEGER;
    const idxB = keyIndex.has(b) ? keyIndex.get(b)! : Number.MAX_SAFE_INTEGER;
    if (idxA !== idxB) return idxA - idxB;
    return ids.indexOf(a) - ids.indexOf(b);
  });

  // The unseen quota is fixed: learning can never consume it.
  const unseenQuota = Math.min(Math.floor(sessionSize / 2), unseen.length);
  const learningBudget = Math.min(sessionSize - unseenQuota, learning.length);

  const selected: string[] = [];
  if (learning.length <= learningBudget) {
    // Every learning item fits in the window — keep stable source order so a
    // restart immediately after completing a small session shows the first
    // item first (preserves the pre-#204 session contract).
    for (const id of learning) selected.push(id);
  } else {
    // Learning overflows the window: rotate least-recently-reviewed first so a
    // difficult prefix item cannot permanently block the items behind it.
    for (let i = 0; i < learningBudget && selected.length < sessionSize; i++) {
      selected.push(orderedLearning[i]);
    }
  }
  for (const id of unseen) {
    if (selected.length >= sessionSize) break;
    selected.push(id);
  }
  for (const id of learned) {
    if (selected.length >= sessionSize) break;
    selected.push(id);
  }
  return selected;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseDocument(raw: string): VocabularyProgressDocument | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      parsed.version !== CURRENT_SCHEMA_VERSION ||
      parsed.entries === null ||
      Array.isArray(parsed.entries) ||
      typeof parsed.entries !== 'object'
    ) {
      return null;
    }
    const entries: Record<string, VocabularyProgressEntry> = {};
    for (const [id, entry] of Object.entries(parsed.entries)) {
      if (isValidProgressEntry(entry)) {
        entries[id] = {
          status: String(
            (entry as Record<string, unknown>).status,
          ) as VocabularyProgressStatus,
          knownStreak: Number(
            (entry as Record<string, unknown>).knownStreak,
          ),
        };
      }
    }
    return { version: 1, entries };
  } catch {
    return null;
  }
}

function isValidProgressEntry(entry: unknown): boolean {
  if (entry === null || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (
    (e.status === 'new' || e.status === 'learning' || e.status === 'learned') &&
    typeof e.knownStreak === 'number' && Number.isFinite(e.knownStreak) &&
    Number.isInteger(e.knownStreak) && e.knownStreak >= 0
  );
}

// ─── Storage probe ────────────────────────────────────────────────────────────

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
  } catch (error) {
    // Quota limits can block the probe while reads still work. Retain the
    // storage handle so existing progress loads and later writes can recover.
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'QuotaExceededError') {
      try { return localStorage; } catch { /* Storage access itself is denied. */ }
    }
    /* localStorage unavailable (SSR, private browsing, etc.) */
  }
  return null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Crash-safe vocabulary progress store.
 *
 * Reuses the storage safety conventions from ProgressStore (#49 / PR #53):
 * - Malformed JSON, wrong schema version, unavailable storage, quota errors
 *   all fall back to in-memory progress for the active page lifetime.
 * - Re-reads storage on writes to prevent stale-instance resurrection
 *   and merge concurrent cross-tab writes.
 */
export class VocabularyProgressStore {
  private document: VocabularyProgressDocument;
  private storage: StorageLike | null;
  private persistencePending = false;
  private pendingEntries: Record<string, VocabularyProgressEntry> = {};
  private resetPending = false;
  private resetEntryIds = new Set<string>();
  private resetSnapshotUnknown = false;
  private hasObservedStorageValue = false;
  private lastObservedStorageValue: string | null = null;

  constructor(storage?: StorageLike | null) {
    this.document = emptyDocument();
    this.storage = storage !== undefined ? storage : getDefaultStorage();
    this.load();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getStatus(id: string): VocabularyProgressStatus {
    return this.document.entries[id]?.status ?? 'new';
  }

  getKnownStreak(id: string): number {
    return this.document.entries[id]?.knownStreak ?? 0;
  }

  getAllEntries(): Readonly<Record<string, VocabularyProgressEntry>> {
    return this.document.entries;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Apply a revealed rating to a vocabulary ID and persist.
   *
   * Re-reads from storage first to prevent stale-instance resurrection
   * after reset, and to merge concurrent writes from other tabs.
   * Keeps existing in-memory state when storage is malformed.
   */
  applyRating(
    id: string,
    rating: 'again' | 'unsure' | 'known',
  ): void {
    this.syncFromStorage();
    const current = this.document.entries[id];
    // Reinsertion preserves least-recently-reviewed ordering for session fairness.
    delete this.document.entries[id];
    this.document.entries[id] = applyRatingToProgress(current, rating);
    this.pendingEntries[id] = this.document.entries[id];
    this.persist();
  }

  /**
   * Build a priority-ordered ID list for a new session.
   * Order: learning → new → learned, stable source order within groups.
   */
  prioritize(ids: readonly string[]): string[] {
    return prioritizeVocabularyIds(ids, this.document.entries);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Re-read progress from storage. Call on `pageshow`. */
  refresh(externalClear = false): void {
    if (this.storage !== null) {
      this.load(externalClear);
    }
    /* storage === null: keep in-memory state */
  }

  /**
   * Reset only the HSK vocabulary progress key.
   * Never clears lesson completion or unrelated localStorage.
   */
  resetAll(): void {
    const observed = this.syncFromStorage();
    this.resetSnapshotUnknown = this.resetSnapshotUnknown || !observed;
    // Retain exclusions across repeated failed resets, including disk changes
    // not yet observed by the page and newly accepted page-memory ratings.
    for (const id of Object.keys(this.document.entries)) this.resetEntryIds.add(id);
    this.document = emptyDocument();
    this.pendingEntries = {};
    this.resetPending = true;
    try {
      this.storage?.removeItem(VOCABULARY_PROGRESS_KEY);
      this.clearPending();
      this.rememberStorageValue(null);
    } catch {
      /* keep the reset in memory until storage can be reconciled */
      this.persistencePending = true;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private load(externalClear = false): void {
    this.syncFromStorage(externalClear);
  }

  private clearPending(): void {
    this.persistencePending = false;
    this.pendingEntries = {};
    this.resetPending = false;
    this.resetEntryIds.clear();
    this.resetSnapshotUnknown = false;
  }

  /** Reconcile valid disk data with accepted, unsaved page-memory ratings. */
  private syncFromStorage(externalClear = false): boolean {
    if (this.storage === null) return false;
    try {
      const raw = this.storage.getItem(VOCABULARY_PROGRESS_KEY);
      const doc = typeof raw === 'string' ? parseDocument(raw) : emptyDocument();
      if (doc === null) return false;
      // A confirmed deletion wins over pending ratings. Verify current storage
      // so a delayed deletion event cannot clear a newer persisted document.
      const disappeared = raw === null && this.hasObservedStorageValue && this.lastObservedStorageValue !== null;
      if (raw === null && (externalClear || disappeared)) {
        this.clearPending();
        this.document = emptyDocument();
      } else if (this.resetPending) {
        // An unreadable pre-reset snapshot cannot prove which disk entries
        // are newer. Keep the reset authoritative until a successful write or
        // deletion; known snapshots may still contribute unrelated new IDs.
        const entries = this.resetSnapshotUnknown ? {} : doc.entries;
        for (const id of this.resetEntryIds) delete entries[id];
        this.document = { version: 1, entries: { ...entries, ...this.pendingEntries } };
      } else if (this.persistencePending) {
        for (const [id, entry] of Object.entries(this.pendingEntries)) {
          delete doc.entries[id];
          doc.entries[id] = entry;
        }
        this.document = doc;
      } else {
        this.document = doc;
      }
      this.rememberStorageValue(raw);
      return true;
    } catch {
      /* Unreadable storage is not evidence of a reset. Keep page memory. */
      return false;
    }
  }

  private rememberStorageValue(raw: string | null): void {
    this.lastObservedStorageValue = raw;
    this.hasObservedStorageValue = true;
  }

  private persist(): void {
    if (this.storage === null) return;
    try {
      const raw = JSON.stringify(this.document);
      this.storage.setItem(VOCABULARY_PROGRESS_KEY, raw);
      this.clearPending();
      this.rememberStorageValue(raw);
    } catch {
      /* storage full or unavailable — keep in-memory state */
      this.persistencePending = true;
    }
  }
}
