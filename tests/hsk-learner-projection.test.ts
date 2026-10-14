import { describe, expect, it } from 'vitest';
import {
  buildHskLearnerProjection,
  type HskProjectionEntry,
} from '../src/domain/hskLearnerProjection';

function entry(
  id: string,
  level: number,
  reviewStatus: string,
): HskProjectionEntry {
  return {
    id,
    reviewStatus,
    hsk: { introducedAtLevel: level },
  };
}

describe('HSK learner projection', () => {
  it('projects disclosed drafts and reviewed entries across all four released levels', () => {
    const projection = buildHskLearnerProjection([
      entry('hsk-001', 1, 'draft'),
      entry('hsk-002', 1, 'reviewed'),
      entry('hsk-003', 1, 'draft'),
      entry('hsk-004', 4, 'draft'),
      entry('hsk-005', 1, 'published'),
    ]);

    expect(projection).toEqual({
      availability: 'available',
      destination: '/vocabulary/hsk/1/',
      statusLabelJa: '利用できます',
      eligibleIds: ['hsk-001', 'hsk-002', 'hsk-003', 'hsk-005', 'hsk-004'],
      levels: [{ level: 1, ids: ['hsk-001', 'hsk-002', 'hsk-003', 'hsk-005'] }, { level: 2, ids: [] }, { level: 3, ids: [] }, { level: 4, ids: ['hsk-004'] }],
    });
  });

  it('fails closed when no entry is production eligible', () => {
    const projection = buildHskLearnerProjection([
      entry('hsk-001', 1, 'invalid'),
    ]);

    expect(projection).toEqual({
      availability: 'unavailable',
      destination: null,
      statusLabelJa: '準備中です',
      eligibleIds: [],
      levels: [1, 2, 3, 4].map((level) => ({ level, ids: [] })),
    });
  });

  it('routes to the first available released level', () => {
    const projection = buildHskLearnerProjection([
      entry('hsk-999', 2, 'published'),
    ]);

    expect(projection.availability).toBe('available');
    expect(projection.destination).toBe('/vocabulary/hsk/2/');
    expect(projection.eligibleIds).toEqual(['hsk-999']);
    expect(projection.levels).toEqual([1, 2, 3, 4].map((level) => ({ level, ids: level === 2 ? ['hsk-999'] : [] })));
  });

  it('returns a deeply immutable deterministic contract', () => {
    const entries = [entry('hsk-002', 1, 'reviewed')];
    const first = buildHskLearnerProjection(entries);
    const second = buildHskLearnerProjection(entries);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.eligibleIds)).toBe(true);
    expect(Object.isFrozen(first.levels)).toBe(true);
    expect(Object.isFrozen(first.levels[0])).toBe(true);
    expect(Object.isFrozen(first.levels[0].ids)).toBe(true);
  });
});
