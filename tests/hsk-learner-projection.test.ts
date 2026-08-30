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
  it('projects only the current two production-eligible level-1 entries', () => {
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
      eligibleIds: ['hsk-002', 'hsk-005'],
      levels: [{ level: 1, ids: ['hsk-002', 'hsk-005'] }],
    });
  });

  it('fails closed when no entry is production eligible', () => {
    const projection = buildHskLearnerProjection([
      entry('hsk-001', 1, 'draft'),
    ]);

    expect(projection).toEqual({
      availability: 'unavailable',
      destination: null,
      statusLabelJa: '準備中です',
      eligibleIds: [],
      levels: [{ level: 1, ids: [] }],
    });
  });

  it('does not fabricate level 1 when only another level is eligible', () => {
    const projection = buildHskLearnerProjection([
      entry('hsk-999', 2, 'published'),
    ]);

    expect(projection.availability).toBe('unavailable');
    expect(projection.destination).toBeNull();
    expect(projection.eligibleIds).toEqual([]);
    expect(projection.levels).toEqual([{ level: 1, ids: [] }]);
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
