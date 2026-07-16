export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'chabiko_completed_lessons';

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__chabiko_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
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
