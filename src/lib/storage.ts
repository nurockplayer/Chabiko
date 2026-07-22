/**
 * Shared localStorage utilities.
 *
 * Centralises the storage-safety conventions reused by every progress store:
 * a non-destructive availability probe and cross-tab storage-event matching.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Return the browser localStorage when it is usable, otherwise null.
 *
 * Writes and removes a probe key to detect environments where localStorage
 * exists but throws on access (SSR, private browsing, quota errors). Restores
 * any pre-existing value stored under `probeKey` so the probe is
 * non-destructive.
 */
export function probeLocalStorage(probeKey: string): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const prev = localStorage.getItem(probeKey);
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      // Restore original value if it existed
      if (prev !== null) {
        localStorage.setItem(probeKey, prev);
      }
      return localStorage;
    }
  } catch {
    /* localStorage unavailable (SSR, private browsing, etc.) */
  }
  return null;
}

/**
 * Whether a Window storage event is relevant to the given progress key.
 *
 * Matches when the event targets `key` directly or when all storage is
 * cleared (`event.key === null`, e.g. `localStorage.clear()`).
 */
export function isRelevantStorageEvent(
  event: StorageEvent,
  key: string,
): boolean {
  return event.key === null || event.key === key;
}
