import { describe, expect, it, vi } from 'vitest';
import { ProgressStore, STORAGE_KEY, type StorageLike } from '../src/lib/progress';
import { handleProgressStorageEvent } from '../src/lib/progressSnapshot';
import {
  THEME_STORAGE_KEY,
  getNextTheme,
  resolveTheme,
} from '../src/lib/theme';

function createStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('theme preference', () => {
  it('uses a valid stored preference and otherwise follows the system preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('unexpected', true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('toggles only between the supported themes', () => {
    expect(getNextTheme('light')).toBe('dark');
    expect(getNextTheme('dark')).toBe('light');
    expect(getNextTheme(undefined)).toBe('dark');
  });

  it('keeps theme persistence isolated from learning progress and refresh events', () => {
    const storage = createStorage();
    const progress = new ProgressStore(storage);
    progress.markComplete('lesson-001');

    storage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(storage.getItem(STORAGE_KEY)).toBe('["lesson-001"]');
    expect(new ProgressStore(storage).isComplete('lesson-001')).toBe(true);

    const refreshProgress = vi.fn();
    handleProgressStorageEvent(
      { key: THEME_STORAGE_KEY } as StorageEvent,
      refreshProgress,
    );
    expect(refreshProgress).not.toHaveBeenCalled();
  });
});
