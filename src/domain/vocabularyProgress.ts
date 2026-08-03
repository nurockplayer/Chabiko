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
 * Fairness rule (Issue #204): the window reserves `ceil(sessionSize / 2)`
 * slots for unseen (`new`) items, picked in source order, so completed
 * sessions always move the unseen front of the corpus forward and items
 * beyond the first session eventually become reachable. `learning`
 * (`again`/`unsure`) items consume at most
 * `min(ceil(sessionSize / 2), learningCount)` slots, picked in source order
 * so difficult items keep near-term review while releasing their slot as soon
 * as they are known. `learned` items only fill remaining slots. A single
 * difficult item can therefore never starve the unseen corpus, and repeated
 * completed sessions eventually reach every eligible item.
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

  const selected: string[] = [];
  const reviewBudget = Math.min(Math.ceil(sessionSize / 2), learning.length);
  for (let i = 0; i < reviewBudget && selected.length < sessionSize; i++) {
    selected.push(learning[i]);
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
    typeof e.status === 'string' && typeof e.knownStreak === 'number'
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
  } catch {
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
    this.document.entries[id] = applyRatingToProgress(current, rating);
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
  refresh(): void {
    if (this.storage !== null) {
      this.load();
    }
    /* storage === null: keep in-memory state */
  }

  /**
   * Reset only the HSK vocabulary progress key.
   * Never clears lesson completion or unrelated localStorage.
   */
  resetAll(): void {
    this.document = emptyDocument();
    try {
      this.storage?.removeItem(VOCABULARY_PROGRESS_KEY);
    } catch {
      /* best-effort */
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = this.storage?.getItem(VOCABULARY_PROGRESS_KEY);
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

  /**
   * Re-read the current storage state before a write, matching
   * the ProgressStore.markComplete cross-tab safety pattern.
   *
   * When storage is malformed, keeps existing in-memory state
   * so progress survives the active page lifetime.
   */
  private syncFromStorage(): void {
    if (this.storage === null) return;
    try {
      const raw = this.storage.getItem(VOCABULARY_PROGRESS_KEY);
      if (typeof raw === 'string') {
        const doc = parseDocument(raw);
        if (doc !== null) {
          this.document = doc;
        } else {
          // malformed — keep existing in-memory state
        }
      } else {
        // null / absent — storage was cleared (e.g. resetAll)
        this.document = emptyDocument();
      }
    } catch {
      /* storage malformed — keep existing in-memory state */
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        VOCABULARY_PROGRESS_KEY,
        JSON.stringify(this.document),
      );
    } catch {
      /* storage full or unavailable — keep in-memory state */
    }
  }
}
