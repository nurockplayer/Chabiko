import { describe, expect, it } from 'vitest';
import { loadPrelaunchRoleplayCards, loadRoleplayCards, ROLEPLAY_LAUNCH_CARD_IDS } from '../src/content/loadRoleplayCards';
import { applyRoleplayRehearsalAction, createRoleplayRehearsal } from '../src/domain/roleplayRehearsal';
import { ROLEPLAY_PROGRESS_KEY, RoleplayProgressStore, type StorageLike } from '../src/lib/roleplayProgress';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { writes: string[] } {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    writes,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); writes.push(`${key}:${value}`); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('roleplay prelaunch loader', () => {
  it('keeps the full corpus for legacy consumers but exposes exactly six launch cards', () => {
    expect(loadRoleplayCards()).toHaveLength(7);
    expect(loadPrelaunchRoleplayCards().map((card) => card.id)).toEqual([...ROLEPLAY_LAUNCH_CARD_IDS]);
    expect(loadPrelaunchRoleplayCards().every((card) => card.reviewStatus === 'draft')).toBe(true);
    expect(loadPrelaunchRoleplayCards().some((card) => card.id === 'roleplay-fixture-transport-001')).toBe(false);
  });
});

describe('roleplay rehearsal transitions', () => {
  it('requires reveal before next and completes only after every learner turn', () => {
    const card = loadPrelaunchRoleplayCards()[0];
    let state = createRoleplayRehearsal([card]);
    state = applyRoleplayRehearsalAction(state, { kind: 'select-card', cardId: card.id }).state;
    state = applyRoleplayRehearsalAction(state, { kind: 'start' }).state;
    expect(applyRoleplayRehearsalAction(state, { kind: 'next' }).effect).toBe('noop');
    for (let index = 0; index < 3; index += 1) {
      state = applyRoleplayRehearsalAction(state, { kind: 'reveal' }).state;
      state = applyRoleplayRehearsalAction(state, { kind: 'next' }).state;
    }
    expect(state.phase).toBe('completed');
    expect(state.revealedLearnerLineIndexes).toHaveLength(3);
  });
});

describe('roleplay progress isolation', () => {
  it('rejects a mixed malformed completion document atomically', () => {
    const storage = memoryStorage({
      [ROLEPLAY_PROGRESS_KEY]: JSON.stringify({
        version: 1,
        completedCardIds: ['roleplay-airport-001', 42],
      }),
    });
    const store = new RoleplayProgressStore(
      storage,
      new Set(['roleplay-airport-001']),
    );

    expect(store.getCompletedCardIds()).toEqual([]);
  });

  it('parses safely, ignores unknown IDs, and writes once per new card', () => {
    const storage = memoryStorage({ [ROLEPLAY_PROGRESS_KEY]: '{bad' });
    const store = new RoleplayProgressStore(storage, new Set(['roleplay-airport-001']));
    expect(store.getCompletedCardIds()).toEqual([]);
    expect(store.markComplete('unknown')).toBe(false);
    expect(store.markComplete('roleplay-airport-001')).toBe(true);
    expect(store.markComplete('roleplay-airport-001')).toBe(false);
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]).toContain(ROLEPLAY_PROGRESS_KEY);
  });

  it('does not touch unrelated keys when storage is available', () => {
    const storage = memoryStorage({ other: 'keep' });
    const store = new RoleplayProgressStore(storage, new Set(['roleplay-food-001']));
    store.markComplete('roleplay-food-001');
    expect(storage.getItem('other')).toBe('keep');
    expect(storage.writes.every((write) => write.startsWith(`${ROLEPLAY_PROGRESS_KEY}:`))).toBe(true);
  });
});
