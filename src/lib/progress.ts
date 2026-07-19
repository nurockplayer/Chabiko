export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'chabiko_completed_lessons';

const PROBE_KEY = '__chabiko_probe__';

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const prev = localStorage.getItem(PROBE_KEY);
      localStorage.setItem(PROBE_KEY, '1');
      localStorage.removeItem(PROBE_KEY);
      // Restore original value if it existed
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

export class ProgressStore {
  private completed: Set<string>;
  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.completed = new Set<string>();
    this.storage = storage !== undefined ? storage : getDefaultStorage();
    this.load();
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.completed = new Set(
            parsed.filter((id): id is string => typeof id === 'string'),
          );
        }
      }
    } catch {
      this.completed = new Set<string>();
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.completed]));
    } catch {
      /* storage full or unavailable — keep in-memory state */
    }
  }

  isComplete(lessonId: string): boolean {
    return this.completed.has(lessonId);
  }

  markComplete(lessonId: string): void {
    // Sync in-memory state with current storage to prevent stale-instance
    // resurrection after reset, and to merge concurrent writes from other tabs.
    if (this.storage !== null) {
      try {
        const raw = this.storage.getItem(STORAGE_KEY);
        if (typeof raw === 'string') {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.completed = new Set(
              parsed.filter((id): id is string => typeof id === 'string'),
            );
          } else {
            this.completed = new Set<string>();
          }
        } else {
          // null / absent — storage was cleared (e.g. resetAll)
          this.completed = new Set<string>();
        }
      } catch {
        /* storage malformed — keep existing in-memory state */
      }
    } /* storage === null: keep existing in-memory state */
    this.completed.add(lessonId);
    this.persist();
  }

  resetAll(): void {
    this.completed.clear();
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      /* best-effort */
    }
  }

  getCompletedIds(): string[] {
    return [...this.completed];
  }
}
