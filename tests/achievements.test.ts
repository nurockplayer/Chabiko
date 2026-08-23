import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  evaluateAchievement,
  evaluateAchievements,
  getAchievement,
  type AchievementEvaluation,
  type AchievementId,
} from '../src/domain/achievements';
import type { CrossTrackProgressSnapshot } from '../src/domain/crossTrackProgress';
import {
  buildBasicVocabularyTrackSummary,
  buildCrossTrackProgressSnapshot,
  buildHskTrackSummary,
  buildTaiwanTravelTrackSummary,
  type BasicVocabularyTrackScope,
  type HskTrackSummary,
} from '../src/domain/crossTrackProgress';
import type { VocabularyProgressEntry } from '../src/domain/vocabularyProgress';

// ─── Snapshot helpers (built through the real #372 adapters so the evidence
// ─── chain under test is the same one production produces) ────────────────

function basicVocabulary(
  learned: number,
  total: number,
  scope: BasicVocabularyTrackScope = { kind: 'guest' },
) {
  const progress: Record<string, VocabularyProgressEntry> = {};
  const corpusIds: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const id = `teacher-star-1-${i}`;
    corpusIds.push(id);
    if (i < learned) progress[id] = { status: 'learned', knownStreak: 2 };
  }
  return buildBasicVocabularyTrackSummary({
    progress,
    corpusIds: new Set(corpusIds),
    scope,
  });
}

function hsk(learned: number, total: number): HskTrackSummary {
  const progress: Record<string, VocabularyProgressEntry> = {};
  const ids: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const id = `hsk-1-${i}`;
    ids.push(id);
    if (i < learned) progress[id] = { status: 'learned', knownStreak: 2 };
  }
  return buildHskTrackSummary({ progress, levels: [{ level: 1, ids }] });
}

function taiwan(completed: number, total: number) {
  const ids = Array.from(
    { length: total },
    (_, i) => `lesson-${String(i).padStart(3, '0')}`,
  );
  return buildTaiwanTravelTrackSummary({
    completedLessonIds: new Set(ids.slice(0, completed)),
    completableLessonIds: ids,
  });
}

function snapshot(overrides: {
  basicVocabulary?: ReturnType<typeof basicVocabulary>;
  hsk?: HskTrackSummary;
  taiwanTravel?: ReturnType<typeof taiwan>;
} = {}): CrossTrackProgressSnapshot {
  return buildCrossTrackProgressSnapshot({
    basicVocabulary: overrides.basicVocabulary ?? basicVocabulary(0, 1),
    hsk: overrides.hsk ?? hsk(0, 0),
    taiwanTravel: overrides.taiwanTravel ?? taiwan(0, 0),
  });
}

function statusOf(
  evaluations: readonly AchievementEvaluation[],
  id: AchievementId,
): string {
  const evaluation = evaluations.find((e) => e.achievement.id === id);
  if (evaluation === undefined) throw new Error(`missing evaluation for ${id}`);
  return evaluation.status;
}

function unlockedIds(evaluations: readonly AchievementEvaluation[]): string[] {
  return evaluations
    .filter((e) => e.status === 'unlocked')
    .map((e) => e.achievement.id);
}

// ─── Catalog invariants ────────────────────────────────────────────────────────

describe('achievement catalog', () => {
  it('defines a stable canonical catalog and preserves its ordering', () => {
    expect(ACHIEVEMENT_CATALOG.map((a) => a.id)).toEqual([
      'first-learning-activity',
      'vocabulary-first-word',
      'vocabulary-5',
      'vocabulary-10',
      'vocabulary-25',
      'hsk-start',
      'hsk-complete',
      'taiwan-first-lesson',
      'taiwan-lessons-3',
      'taiwan-path-complete',
    ]);
  });

  it('uses unique stable ids with non-empty Japanese copy', () => {
    const ids = ACHIEVEMENT_CATALOG.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const achievement of ACHIEVEMENT_CATALOG) {
      expect(achievement.title.length).toBeGreaterThan(0);
      expect(achievement.description.length).toBeGreaterThan(0);
    }
  });

  it('declares only positive integer thresholds', () => {
    for (const achievement of ACHIEVEMENT_CATALOG) {
      if ('threshold' in achievement.kind) {
        expect(Number.isInteger(achievement.kind.threshold)).toBe(true);
        expect(achievement.kind.threshold).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is a deeply frozen catalog', () => {
    expect(Object.isFrozen(ACHIEVEMENT_CATALOG)).toBe(true);
    for (const achievement of ACHIEVEMENT_CATALOG) {
      expect(Object.isFrozen(achievement)).toBe(true);
      expect(Object.isFrozen(achievement.kind)).toBe(true);
    }
  });

  it('looks up catalog definitions by stable id', () => {
    expect(getAchievement('vocabulary-5').title).toBe('先生厳選単語 5 語');
    expect(getAchievement('vocabulary-5').kind).toEqual({
      type: 'vocabulary-threshold',
      threshold: 5,
    });
  });

  it('fails closed on an unknown achievement id', () => {
    expect(() => getAchievement('xp-bonus' as AchievementId)).toThrow(
      /Unknown achievement id/,
    );
  });
});

// ─── Boundary / threshold transitions ──────────────────────────────────────────

describe('achievement unlock boundaries', () => {
  it('unlocks nothing when there is no completed evidence at all', () => {
    expect(unlockedIds(evaluateAchievements(snapshot()))).toEqual([]);
  });

  it('never treats passive viewing or not-yet-learned evidence as completion', () => {
    const viewedSnap = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {
          'teacher-star-1-0': { status: 'learning', knownStreak: 1 },
          'teacher-star-1-1': { status: 'new', knownStreak: 0 },
        },
        corpusIds: new Set(['teacher-star-1-0', 'teacher-star-1-1']),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({
        progress: { 'hsk-1-0': { status: 'learning', knownStreak: 1 } },
        levels: [{ level: 1, ids: ['hsk-1-0'] }],
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(),
        completableLessonIds: ['lesson-000'],
      }),
    });
    expect(unlockedIds(evaluateAchievements(viewedSnap))).toEqual([]);
  });

  it('never lets stale or corrupt learned evidence unlock anything', () => {
    const staleSnap = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {
          'not-in-corpus': { status: 'learned', knownStreak: 3 },
          'teacher-star-1-0': { status: 'learned', knownStreak: 0 },
        },
        corpusIds: new Set(['teacher-star-1-0']),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({
        progress: { 'hsk-999': { status: 'learned', knownStreak: 2 } },
        levels: [{ level: 1, ids: ['hsk-1-0'] }],
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(['lesson-999']),
        completableLessonIds: ['lesson-000'],
      }),
    });
    expect(unlockedIds(evaluateAchievements(staleSnap))).toEqual([]);
  });

  it('first learning activity unlocks on any single completed activity', () => {
    const viaVocab = snapshot({ basicVocabulary: basicVocabulary(1, 30) });
    const viaHsk = snapshot({ hsk: hsk(1, 5) });
    const viaTaiwan = snapshot({ taiwanTravel: taiwan(1, 10) });
    expect(statusOf(evaluateAchievements(viaVocab), 'first-learning-activity')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(viaHsk), 'first-learning-activity')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(viaTaiwan), 'first-learning-activity')).toBe('unlocked');
  });

  it('first learning activity stays locked with no completed evidence', () => {
    expect(
      statusOf(evaluateAchievements(snapshot()), 'first-learning-activity'),
    ).toBe('locked');
  });

  it('vocabulary thresholds unlock exactly at the declared count', () => {
    const at4 = snapshot({ basicVocabulary: basicVocabulary(4, 30) });
    const at5 = snapshot({ basicVocabulary: basicVocabulary(5, 30) });
    const at9 = snapshot({ basicVocabulary: basicVocabulary(9, 30) });
    const at10 = snapshot({ basicVocabulary: basicVocabulary(10, 30) });
    const at24 = snapshot({ basicVocabulary: basicVocabulary(24, 30) });
    const at25 = snapshot({ basicVocabulary: basicVocabulary(25, 30) });

    expect(statusOf(evaluateAchievements(at4), 'vocabulary-5')).toBe('locked');
    expect(statusOf(evaluateAchievements(at5), 'vocabulary-5')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(at9), 'vocabulary-10')).toBe('locked');
    expect(statusOf(evaluateAchievements(at10), 'vocabulary-10')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(at24), 'vocabulary-25')).toBe('locked');
    expect(statusOf(evaluateAchievements(at25), 'vocabulary-25')).toBe('unlocked');
    // The first-word threshold unlocks at 1 and is cumulative with higher tiers.
    const at1 = snapshot({ basicVocabulary: basicVocabulary(1, 30) });
    const evals = evaluateAchievements(at1);
    expect(statusOf(evals, 'vocabulary-first-word')).toBe('unlocked');
    expect(statusOf(evals, 'vocabulary-5')).toBe('locked');
  });

  it('vocabulary achievements stay locked when nothing is learned', () => {
    const evals = evaluateAchievements(
      snapshot({ basicVocabulary: basicVocabulary(0, 30) }),
    );
    expect(unlockedIds(evals)).toEqual([]);
  });

  it('taiwan lesson thresholds unlock exactly at the declared count', () => {
    const at2 = snapshot({ taiwanTravel: taiwan(2, 10) });
    const at3 = snapshot({ taiwanTravel: taiwan(3, 10) });
    expect(statusOf(evaluateAchievements(at2), 'taiwan-lessons-3')).toBe('locked');
    expect(statusOf(evaluateAchievements(at3), 'taiwan-lessons-3')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(at3), 'taiwan-first-lesson')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(at3), 'taiwan-path-complete')).toBe('locked');
  });

  it('taiwan path completes only when every completable lesson is done', () => {
    const partial = snapshot({ taiwanTravel: taiwan(9, 10) });
    const complete = snapshot({ taiwanTravel: taiwan(10, 10) });
    expect(
      statusOf(evaluateAchievements(partial), 'taiwan-path-complete'),
    ).toBe('locked');
    expect(
      statusOf(evaluateAchievements(complete), 'taiwan-path-complete'),
    ).toBe('unlocked');
  });

  it('hsk milestones require an available track and truthful learned evidence', () => {
    const none = snapshot({ hsk: hsk(0, 5) });
    const started = snapshot({ hsk: hsk(1, 5) });
    const partial = snapshot({ hsk: hsk(4, 5) });
    const complete = snapshot({ hsk: hsk(5, 5) });

    expect(statusOf(evaluateAchievements(none), 'hsk-start')).toBe('locked');
    expect(statusOf(evaluateAchievements(started), 'hsk-start')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(partial), 'hsk-start')).toBe('unlocked');
    expect(statusOf(evaluateAchievements(partial), 'hsk-complete')).toBe('locked');
    expect(statusOf(evaluateAchievements(complete), 'hsk-complete')).toBe('unlocked');
  });

  it('hsk milestones stay locked when no HSK content is published', () => {
    const noContent = snapshot({ hsk: hsk(0, 0) });
    const evals = evaluateAchievements(noContent);
    expect(statusOf(evals, 'hsk-start')).toBe('locked');
    expect(statusOf(evals, 'hsk-complete')).toBe('locked');
  });

  it('never trusts HSK counts when the track is unavailable (incomplete publication)', () => {
    // A defensive shape the real adapters never produce (counts with an
    // unavailable track): the achievement layer must still fail closed.
    const defensive: CrossTrackProgressSnapshot = {
      schemaVersion: 1,
      tracks: {
        'basic-vocabulary': {
          trackId: 'basic-vocabulary',
          availability: 'available',
          scope: { kind: 'guest' },
          learnedCount: 0,
          learningCount: 0,
          totalCount: 1,
          status: 'not-started',
        },
        hsk: {
          trackId: 'hsk',
          availability: 'unavailable',
          learnedCount: 3,
          learningCount: 0,
          totalCount: 0,
          status: 'in-progress',
          levels: [],
        },
        'taiwan-travel': {
          trackId: 'taiwan-travel',
          availability: 'available',
          completedLessons: 0,
          totalLessons: 1,
          status: 'not-started',
        },
      },
    };
    const evals = evaluateAchievements(defensive);
    expect(statusOf(evals, 'hsk-start')).toBe('locked');
    expect(statusOf(evals, 'hsk-complete')).toBe('locked');
  });
});

// ─── Determinism, identity, and immutability ───────────────────────────────────

describe('achievement evaluation semantics', () => {
  it('re-evaluating identical evidence returns identical results and ordering', () => {
    const snap = snapshot({
      basicVocabulary: basicVocabulary(7, 30),
      hsk: hsk(2, 5),
      taiwanTravel: taiwan(2, 10),
    });
    const first = evaluateAchievements(snap);
    const second = evaluateAchievements(snap);
    expect(second).toEqual(first);
    expect(second.map((e) => e.achievement.id)).toEqual(
      first.map((e) => e.achievement.id),
    );
    // Fresh derived values each call: no hidden state, cache, or persistence.
    expect(second).not.toBe(first);
  });

  it('orders results exactly as the canonical catalog', () => {
    const snap = snapshot({ basicVocabulary: basicVocabulary(1, 30) });
    expect(evaluateAchievements(snap).map((e) => e.achievement.id)).toEqual(
      ACHIEVEMENT_CATALOG.map((a) => a.id),
    );
  });

  it('evaluation depends only on evidence, never on identity scope', () => {
    const userId = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    const guest = snapshot({
      basicVocabulary: basicVocabulary(2, 30, { kind: 'guest' }),
    });
    const user = snapshot({
      basicVocabulary: basicVocabulary(2, 30, { kind: 'user', userId }),
    });
    expect(evaluateAchievements(user)).toEqual(evaluateAchievements(guest));
  });

  it('re-evaluates from the active snapshot on identity switch with no leakage', () => {
    const userA = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';

    // Guest evidence: 2 learned words.
    const guestSnap = snapshot({ basicVocabulary: basicVocabulary(2, 30) });
    const guestEvals = evaluateAchievements(guestSnap);
    expect(statusOf(guestEvals, 'vocabulary-first-word')).toBe('unlocked');
    expect(statusOf(guestEvals, 'vocabulary-5')).toBe('locked');

    // Signed in as A with an empty scoped store: guest evidence never leaks.
    const userASnap = snapshot({
      basicVocabulary: basicVocabulary(0, 30, { kind: 'user', userId: userA }),
    });
    const userAEvals = evaluateAchievements(userASnap);
    expect(statusOf(userAEvals, 'vocabulary-first-word')).toBe('locked');

    // A learns one word: only A's new snapshot reflects it.
    const userAProgressSnap = snapshot({
      basicVocabulary: basicVocabulary(1, 30, { kind: 'user', userId: userA }),
    });
    expect(
      statusOf(evaluateAchievements(userAProgressSnap), 'vocabulary-first-word'),
    ).toBe('unlocked');
  });

  it('evaluates without mutating the snapshot and returns frozen results', () => {
    const snap = snapshot({
      basicVocabulary: basicVocabulary(5, 30),
      hsk: hsk(1, 5),
      taiwanTravel: taiwan(2, 10),
    });
    const before = JSON.stringify(snap);
    const evals = evaluateAchievements(snap);
    expect(JSON.stringify(snap)).toBe(before);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(evals)).toBe(true);
    for (const evaluation of evals) {
      expect(Object.isFrozen(evaluation)).toBe(true);
      expect(Object.isFrozen(evaluation.achievement)).toBe(true);
      expect(Object.isFrozen(evaluation.achievement.kind)).toBe(true);
    }
  });

  it('single-achievement evaluation matches the full evaluator', () => {
    const snap = snapshot({ basicVocabulary: basicVocabulary(5, 30) });
    expect(evaluateAchievement('vocabulary-5', snap)).toEqual(
      evaluateAchievements(snap).find((e) => e.achievement.id === 'vocabulary-5'),
    );
    expect(Object.isFrozen(evaluateAchievement('vocabulary-5', snap))).toBe(true);
  });
});
