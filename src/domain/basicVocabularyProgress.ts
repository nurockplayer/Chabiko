import type { StorageLike } from '../lib/progress';
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
 *   and merge concurrent cross-tab writes.
 * - All-or-nothing read validation: any invalid field/version/item invalidates
 *   the entire stored document (falls back to empty in-memory).
 * - Never calls localStorage.clear() or touches lesson/HSK/theme keys.
 */
export class BasicVocabularyProgressStore {
  private document: BasicVocabularyProgressDocument;
  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.document = emptyDocument();
    this.storage = storage !== undefined ? storage : getDefaultStorage();
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

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Apply a revealed rating and persist.
   * Re-reads current storage first to merge cross-tab changes.
   */
  applyRating(id: string, rating: 'again' | 'unsure' | 'known'): void {
    this.syncFromStorage();
    const current = this.document.items[id];
    const next = applyRatingToProgress(current, rating);
    // Immutably rebuild the items object preserving insertion order
    const nextItems: Record<string, VocabularyProgressEntry> = {};
    for (const [k, v] of Object.entries(this.document.items)) {
      nextItems[k] = k === id ? next : v;
    }
    if (!(id in this.document.items)) {
      nextItems[id] = next;
    }
    this.document = { version: 1, items: nextItems };
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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Re-read progress from storage. Call on `pageshow`. */
  refresh(): void {
    if (this.storage !== null) {
      this.load();
    }
    /* storage === null: keep in-memory state */
  }

  /**
   * Reset only the basic-vocabulary progress key.
   * Never calls localStorage.clear() or touches lesson/HSK/theme keys.
   */
  resetAll(): void {
    this.document = emptyDocument();
    try {
      this.storage?.removeItem(BASIC_VOCABULARY_PROGRESS_KEY);
    } catch {
      /* best-effort */
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = this.storage?.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
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
      const raw = this.storage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
      if (typeof raw === 'string') {
        const doc = parseDocument(raw);
        if (doc !== null) {
          this.document = doc;
        }
        // malformed — keep existing in-memory state
      } else {
        // absent — storage was cleared (e.g. resetAll)
        this.document = emptyDocument();
      }
    } catch {
      /* storage malformed — keep existing in-memory state */
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        BASIC_VOCABULARY_PROGRESS_KEY,
        JSON.stringify(this.document),
      );
    } catch {
      /* storage full or unavailable — keep in-memory state */
    }
  }
}

// ─── Pure helpers (reused from vocabularyProgress.ts contract) ──────────────────

function applyRatingToProgress(
  current: VocabularyProgressEntry | undefined,
  rating: 'again' | 'unsure' | 'known',
): VocabularyProgressEntry {
  if (rating === 'again' || rating === 'unsure') {
    return { status: 'learning', knownStreak: 0 };
  }
  const prevStreak = current?.knownStreak ?? 0;
  const nextStreak = prevStreak + 1;
  return {
    status: nextStreak >= 2 ? 'learned' : 'learning',
    knownStreak: nextStreak,
  };
}

const STATUS_ORDER: Record<VocabularyProgressStatus, number> = {
  learning: 0,
  new: 1,
  learned: 2,
};

function prioritizeVocabularyIds(
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
