import { describe, expect, it } from 'vitest';
import {
  buildReadinessInput,
  pathProgressStateLabel,
  readinessStatusLabel,
  summarizePathProgress,
  type ProgressSignals,
} from '../src/domain/pathsProgress';
import { evaluateTravelQuestReadiness } from '../src/domain/travelQuestReadiness';
import type { LearningPathMemberRef } from '../src/types/learningPath';
import readinessData from '../data/travel-quest-readiness.json';
import type { TravelQuestReadinessDocument } from '../src/types/travelQuestReadiness';

// ─── Helpers ────────────────────────────────────────────────────────────────

function signals(
  completedLessons: readonly string[] = [],
  learnedVocabulary: readonly string[] = [],
): ProgressSignals {
  return {
    completedLessons: new Set(completedLessons),
    learnedVocabulary: new Set(learnedVocabulary),
  };
}

function member(
  type: LearningPathMemberRef['type'],
  id: string,
): LearningPathMemberRef {
  return { type, id };
}

const targets = (readinessData as TravelQuestReadinessDocument).targets;

// ─── buildReadinessInput ────────────────────────────────────────────────────

describe('buildReadinessInput', () => {
  it('marks completed lesson practice and learned vocabulary as complete', () => {
    const input = buildReadinessInput(
      targets,
      signals(
        ['lesson-001', 'lesson-002'],
        ['teacher-star-1-bdc7865a507e'],
      ),
    );
    expect(input.completed).toEqual(
      new Set([
        'completed-lesson-practice:lesson-001',
        'completed-lesson-practice:lesson-002',
        'completed-vocabulary-session:teacher-star-1-bdc7865a507e',
      ]),
    );
  });

  it('reports phrase-practice and roleplay-rehearsal evidence as unavailable', () => {
    const input = buildReadinessInput(targets, signals());
    expect(input.unavailable).toEqual(
      new Set([
        'completed-phrase-practice:phrase-transport-arrival',
        'completed-phrase-practice:phrase-order-pay',
        'completed-phrase-practice:phrase-hotel-checkin',
        'completed-phrase-practice:phrase-recover-help',
        'completed-roleplay-rehearsal:roleplay-transport-guide',
        'completed-roleplay-rehearsal:roleplay-order-food',
        'completed-roleplay-rehearsal:roleplay-hotel-checkin',
        'completed-roleplay-rehearsal:roleplay-recover-help',
      ]),
    );
    // Never inflated: unavailable keys never land in `completed`.
    expect(input.completed.size).toBe(0);
  });

  it('ignores duplicate, stale, and malformed evidence keys', () => {
    // Duplicate declared lesson-003 evidence in two targets only completes once;
    // a lesson ID used as vocabulary, and unknown IDs, never count.
    const input = buildReadinessInput(
      targets,
      signals(
        ['lesson-003', 'does-not-exist'],
        ['phrase-order-pay'],
      ),
    );
    expect(input.completed).toEqual(
      new Set(['completed-lesson-practice:lesson-003']),
    );
    // A lesson id supplied as learned vocabulary is not a completed lesson.
    expect(input.completed.has('completed-lesson-practice:does-not-exist')).toBe(false);
    // A phrase id supplied as learned vocabulary never completes a lesson key.
    expect(
      input.completed.has('completed-phrase-practice:phrase-order-pay'),
    ).toBe(false);
  });

  it('never shrinks the fixed denominator when evidence is unavailable', () => {
    const full = evaluateTravelQuestReadiness(buildReadinessInput(targets, signals()));
    const degraded = evaluateTravelQuestReadiness(
      buildReadinessInput(targets, signals(['lesson-001'])),
    );
    full.forEach((r, i) => {
      expect(degraded[i].denominator).toBe(r.denominator);
    });
  });

  it('is deterministic across repeated calls', () => {
    const a = buildReadinessInput(targets, signals(['lesson-003']));
    const b = buildReadinessInput(targets, signals(['lesson-003']));
    expect(a.completed).toEqual(b.completed);
    expect(a.unavailable).toEqual(b.unavailable);
  });
});

// ─── summarizePathProgress ───────────────────────────────────────────────────

describe('summarizePathProgress', () => {
  it('reports empty when nothing is complete', () => {
    const summary = summarizePathProgress(
      [member('lesson', 'lesson-001'), member('vocabulary', 'voc-001')],
      signals(),
    );
    expect(summary).toEqual({ completedCount: 0, totalCount: 2, state: 'empty' });
  });

  it('reports partial when some members are complete', () => {
    const summary = summarizePathProgress(
      [
        member('lesson', 'lesson-001'),
        member('lesson', 'lesson-002'),
        member('vocabulary', 'voc-001'),
      ],
      signals(['lesson-001']),
    );
    expect(summary).toEqual({ completedCount: 1, totalCount: 3, state: 'partial' });
  });

  it('reports complete only when every member has a real signal', () => {
    const summary = summarizePathProgress(
      [
        member('lesson', 'lesson-001'),
        member('vocabulary', 'voc-001'),
      ],
      signals(['lesson-001'], ['voc-001']),
    );
    expect(summary).toEqual({ completedCount: 2, totalCount: 2, state: 'complete' });
  });

  it('counts only lesson and learned-vocabulary members; phrase never counts', () => {
    const summary = summarizePathProgress(
      [
        member('lesson', 'lesson-001'),
        member('phrase', 'phrase-001'),
        member('vocabulary', 'voc-001'),
      ],
      signals(['lesson-001'], ['voc-001']),
    );
    // phrase-001 has no production completion signal and stays incomplete.
    expect(summary).toEqual({ completedCount: 2, totalCount: 3, state: 'partial' });
  });

  it('keeps the fixed total for an empty member list', () => {
    const summary = summarizePathProgress([], signals());
    expect(summary).toEqual({ completedCount: 0, totalCount: 0, state: 'empty' });
  });

  it('is deterministic', () => {
    const members = [member('lesson', 'lesson-003'), member('vocabulary', 'hsk-001')];
    const a = summarizePathProgress(members, signals(['lesson-003'], ['hsk-001']));
    const b = summarizePathProgress(members, signals(['lesson-003'], ['hsk-001']));
    expect(a).toEqual(b);
  });
});

// ─── Labels ──────────────────────────────────────────────────────────────────

describe('Japanese labels', () => {
  it('maps readiness statuses to the required labels', () => {
    expect(readinessStatusLabel('not-started')).toBe('未開始');
    expect(readinessStatusLabel('in-progress')).toBe('進行中');
    expect(readinessStatusLabel('ready')).toBe('準備OK');
  });

  it('maps path progress states to the required labels', () => {
    expect(pathProgressStateLabel('empty')).toBe('未開始');
    expect(pathProgressStateLabel('partial')).toBe('進行中');
    expect(pathProgressStateLabel('complete')).toBe('完了');
  });
});
