import type { StorageLike } from './progress';

export { type StorageLike };

export const ROLEPLAY_PROGRESS_KEY = 'chabiko.roleplay-progress.v1';
export const ROLEPLAY_PROGRESS_VERSION = 1;

export interface RoleplayProgressDocument {
  readonly version: 1;
  readonly completedCardIds: readonly string[];
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Parse only the versioned roleplay document; malformed values fail closed. */
export function parseRoleplayProgress(
  raw: string | null,
  knownCardIds?: ReadonlySet<string>,
): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (parsed as Record<string, unknown>).version !== ROLEPLAY_PROGRESS_VERSION ||
      !Array.isArray((parsed as Record<string, unknown>).completedCardIds)
    ) {
      return [];
    }
    const ids = (parsed as Record<string, unknown>).completedCardIds as unknown[];
    if (!ids.every((id): id is string => typeof id === 'string' && id.length > 0)) {
      return [];
    }
    const unique = [...new Set(ids)];
    return knownCardIds === undefined
      ? unique
      : unique.filter((id) => knownCardIds.has(id));
  } catch {
    return [];
  }
}

export class RoleplayProgressStore {
  private readonly storage: StorageLike | null;
  private readonly knownCardIds: ReadonlySet<string> | undefined;
  private completed: Set<string>;

  constructor(
    storage?: StorageLike | null,
    knownCardIds?: ReadonlySet<string>,
  ) {
    this.storage = storage === undefined ? safeStorage() : storage;
    this.knownCardIds = knownCardIds;
    this.completed = new Set<string>();
    this.refresh();
  }

  getCompletedCardIds(): string[] {
    return [...this.completed];
  }

  isComplete(cardId: string): boolean {
    return this.completed.has(cardId);
  }

  refresh(): void {
    if (this.storage === null) return;
    try {
      this.completed = new Set(
        parseRoleplayProgress(
          this.storage?.getItem(ROLEPLAY_PROGRESS_KEY) ?? null,
          this.knownCardIds,
        ),
      );
    } catch {
      // Keep the last known in-memory snapshot when storage is inaccessible.
    }
  }

  /** Persist exactly once for each newly completed known card. */
  markComplete(cardId: string): boolean {
    if (this.knownCardIds !== undefined && !this.knownCardIds.has(cardId)) return false;
    this.refresh();
    if (this.completed.has(cardId)) return false;
    this.completed.add(cardId);
    try {
      this.storage?.setItem(
        ROLEPLAY_PROGRESS_KEY,
        JSON.stringify({
          version: ROLEPLAY_PROGRESS_VERSION,
          completedCardIds: [...this.completed],
        } satisfies RoleplayProgressDocument),
      );
    } catch {
      // Keep the in-memory completion; storage may be unavailable or full.
    }
    return true;
  }
}
