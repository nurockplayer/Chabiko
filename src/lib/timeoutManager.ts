/**
 * Manages a single pending timeout. On each schedule, the previous timeout
 * is cleared so stale callbacks cannot fire after reset or pageshow.
 */
export function createTimeoutManager() {
  let id: ReturnType<typeof setTimeout> | null = null;

  function schedule(fn: () => void, delay: number): void {
    clear();
    id = setTimeout(() => {
      id = null;
      fn();
    }, delay);
  }

  function clear(): void {
    if (id !== null) {
      clearTimeout(id);
      id = null;
    }
  }

  function isPending(): boolean {
    return id !== null;
  }

  return { schedule, clear, isPending };
}
