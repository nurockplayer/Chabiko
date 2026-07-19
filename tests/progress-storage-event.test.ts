import { describe, it, expect, vi } from 'vitest';
import { handleProgressStorageEvent } from '../src/lib/progressSnapshot';

describe('handleProgressStorageEvent', () => {
  it('calls callback when event key matches STORAGE_KEY', () => {
    const cb = vi.fn();
    handleProgressStorageEvent({ key: 'chabiko_completed_lessons' } as StorageEvent, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('calls callback when event key is null (storage clear)', () => {
    const cb = vi.fn();
    handleProgressStorageEvent({ key: null } as StorageEvent, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not call callback for unrelated key', () => {
    const cb = vi.fn();
    handleProgressStorageEvent({ key: 'some_other_key' } as StorageEvent, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not call callback for another app key', () => {
    const cb = vi.fn();
    handleProgressStorageEvent({ key: 'user_preferences' } as StorageEvent, cb);
    expect(cb).not.toHaveBeenCalled();
  });
});
