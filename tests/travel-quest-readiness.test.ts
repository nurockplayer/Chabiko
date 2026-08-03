import { describe, it, expect } from 'vitest';
import {
  evidenceKey,
  percent,
  evaluateTargetReadiness,
  evaluateTravelQuestReadiness,
} from '../src/domain/travelQuestReadiness';
import type {
  TravelQuestEvidenceSpec,
  TravelQuestReadinessInput,
} from '../src/types/travelQuestReadiness';

// ─── Helpers ────────────────────────────────────────────────────────────────

function input(
  completed: readonly string[] = [],
  unavailable: readonly string[] = [],
): TravelQuestReadinessInput {
  return {
    completed: new Set(completed),
    unavailable: new Set(unavailable),
  };
}

const lessonEvidence: TravelQuestEvidenceSpec = {
  type: 'completed-lesson-practice',
  id: 'lesson-001',
  labelJa: 'テスト',
};
const phraseEvidence: TravelQuestEvidenceSpec = {
  type: 'completed-phrase-practice',
  id: 'phrase-a',
  labelJa: 'テスト',
};
const roleplayEvidence: TravelQuestEvidenceSpec = {
  type: 'completed-roleplay-rehearsal',
  id: 'roleplay-a',
  labelJa: 'テスト',
};
const vocabularyEvidence: TravelQuestEvidenceSpec = {
  type: 'completed-vocabulary-session',
  id: 'teacher-star-1-bdc7865a507e',
  labelJa: 'テスト',
};

// ─── evidenceKey ─────────────────────────────────────────────────────────────

describe('evidenceKey', () => {
  it('formats type and id with a colon', () => {
    expect(evidenceKey(lessonEvidence)).toBe('completed-lesson-practice:lesson-001');
    expect(evidenceKey(vocabularyEvidence)).toBe('completed-vocabulary-session:teacher-star-1-bdc7865a507e');
  });
});

// ─── percent ─────────────────────────────────────────────────────────────────

describe('percent', () => {
  it('returns rounded integers 0–100', () => {
    expect(percent(0, 3)).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(3, 3)).toBe(100);
  });

  it('clamps out-of-range values', () => {
    expect(percent(-1, 3)).toBe(0);
    expect(percent(4, 3)).toBe(100);
  });

  it('returns 0 when denominator is zero', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 0)).toBe(0);
  });
});

// ─── evaluateTargetReadiness ─────────────────────────────────────────────────

describe('evaluateTargetReadiness', () => {
  const target = {
    id: 'target-a',
    evidence: [lessonEvidence, phraseEvidence, roleplayEvidence],
  };

  it('returns not-started with zero numerator when nothing is complete', () => {
    const r = evaluateTargetReadiness(target, input());
    expect(r).toEqual({
      targetId: 'target-a',
      numerator: 0,
      denominator: 3,
      percentage: 0,
      unavailableEvidence: [],
      status: 'not-started',
    });
  });

  it('returns in-progress with the correct fixed denominator for partial completion', () => {
    const r = evaluateTargetReadiness(
      target,
      input([evidenceKey(lessonEvidence)]),
    );
    expect(r.numerator).toBe(1);
    expect(r.denominator).toBe(3);
    expect(r.percentage).toBe(33);
    expect(r.status).toBe('in-progress');
  });

  it('reports unavailable evidence without counting it', () => {
    const r = evaluateTargetReadiness(
      target,
      input([], [evidenceKey(phraseEvidence)]),
    );
    expect(r.numerator).toBe(0);
    expect(r.denominator).toBe(3);
    expect(r.status).toBe('not-started');
    expect(r.unavailableEvidence).toEqual([evidenceKey(phraseEvidence)]);
  });

  it('returns ready only when every required evidence item is complete', () => {
    const all = target.evidence.map(evidenceKey);
    const r = evaluateTargetReadiness(target, input(all));
    expect(r.numerator).toBe(3);
    expect(r.denominator).toBe(3);
    expect(r.percentage).toBe(100);
    expect(r.status).toBe('ready');
    expect(r.unavailableEvidence).toEqual([]);
  });

  it('requires ALL declared evidence for ready (missing one is not ready)', () => {
    const r = evaluateTargetReadiness(
      target,
      input([evidenceKey(lessonEvidence), evidenceKey(roleplayEvidence)]),
    );
    expect(r.numerator).toBe(2);
    expect(r.status).toBe('in-progress');
  });

  it('deduplicates unavailable evidence', () => {
    // Duplicate spec keys in the target must not inflate the unavailable list.
    const r = evaluateTargetReadiness(
      { id: 'dup', evidence: [lessonEvidence, lessonEvidence, phraseEvidence] },
      input([], [evidenceKey(lessonEvidence)]),
    );
    expect(r.unavailableEvidence).toEqual([evidenceKey(lessonEvidence)]);
    expect(r.denominator).toBe(3);
    expect(r.numerator).toBe(0);
    expect(r.status).toBe('not-started');
  });

  it('is deterministic across repeated calls', () => {
    const first = evaluateTargetReadiness(target, input([evidenceKey(lessonEvidence)]));
    const second = evaluateTargetReadiness(target, input([evidenceKey(lessonEvidence)]));
    expect(first).toEqual(second);
  });
});

// ─── evaluateTravelQuestReadiness (canonical document) ──────────────────────

describe('evaluateTravelQuestReadiness (canonical data contract)', () => {
  it('declares exactly the four frozen targets in order', () => {
    const results = evaluateTravelQuestReadiness(input());
    expect(results.map((r) => r.targetId)).toEqual([
      'navigate-arrival',
      'order-and-pay',
      'stay-and-ask',
      'recover-and-get-help',
    ]);
  });

  it('has non-empty evidence for every target', () => {
    for (const r of evaluateTravelQuestReadiness(input())) {
      expect(r.denominator).toBeGreaterThan(0);
    }
  });

  it('returns a fixed denominator independent of progress state', () => {
    const empty = evaluateTravelQuestReadiness(input());
    const full = evaluateTravelQuestReadiness(
      input(['completed-lesson-practice:lesson-001']),
    );
    empty.forEach((r, i) => {
      expect(r.denominator).toBe(full[i].denominator);
    });
  });

  it('never shrinks the denominator when evidence is unavailable or malformed', () => {
    const empty = evaluateTravelQuestReadiness(input());
    const degraded = evaluateTravelQuestReadiness(
      input(
        [],
        ['completed-phrase-practice:phrase-order-pay', 'completed-roleplay-rehearsal:roleplay-hotel-checkin'],
      ),
    );
    empty.forEach((r, i) => {
      expect(degraded[i].denominator).toBe(r.denominator);
    });
  });

  it('returns not-started for every target when nothing is complete', () => {
    const results = evaluateTravelQuestReadiness(input());
    for (const r of results) {
      expect(r.status).toBe('not-started');
      expect(r.numerator).toBe(0);
    }
  });

  it('reflects real lesson completion signals', () => {
    const results = evaluateTravelQuestReadiness(
      input(['completed-lesson-practice:lesson-001', 'completed-lesson-practice:lesson-002']),
    );
    const byId = new Map(results.map((r) => [r.targetId, r]));
    expect(byId.get('order-and-pay')?.numerator).toBe(2);
    expect(byId.get('order-and-pay')?.status).toBe('in-progress');
    expect(byId.get('navigate-arrival')?.numerator).toBe(0);
    expect(byId.get('navigate-arrival')?.status).toBe('not-started');
  });

  it('never counts a non-declared evidence key toward any target', () => {
    const results = evaluateTravelQuestReadiness(
      input(['completed-lesson-practice:does-not-exist']),
    );
    for (const r of results) {
      expect(r.numerator).toBe(0);
    }
  });

  it('never counts a passive view/open key (no completed-* prefix semantics)', () => {
    const results = evaluateTravelQuestReadiness(
      input(['viewed:lesson-001', 'opened:phrase-a']),
    );
    for (const r of results) {
      expect(r.numerator).toBe(0);
      expect(r.status).toBe('not-started');
    }
  });

  it('does not match a vocabulary session evidence against lesson IDs or vice versa', () => {
    // vocabulary evidence only matches the declared vocabulary session key.
    const phraseMatch = evaluateTravelQuestReadiness(
      input(['completed-vocabulary-session:phrase-order-pay']),
    );
    expect(phraseMatch[0].numerator).toBe(0);

    // lesson practice evidence only matches the declared lesson key.
    const lessonMatch = evaluateTravelQuestReadiness(
      input(['completed-lesson-practice:teacher-star-1-bdc7865a507e']),
    );
    expect(lessonMatch[0].numerator).toBe(0);
  });

  it('cross-type evidence cannot satisfy a different evidence type', () => {
    // Supplying a roleplay key where lesson practice is required changes nothing.
    const results = evaluateTravelQuestReadiness(
      input(['completed-roleplay-rehearsal:lesson-003']),
    );
    const byId = new Map(results.map((r) => [r.targetId, r]));
    expect(byId.get('navigate-arrival')?.numerator).toBe(0);
  });

  it('marks a vocabulary session complete when the mapped ID is complete', () => {
    const results = evaluateTravelQuestReadiness(
      input(['completed-vocabulary-session:teacher-star-1-bdc7865a507e']),
    );
    const byId = new Map(results.map((r) => [r.targetId, r]));
    expect(byId.get('order-and-pay')?.numerator).toBe(1);
    expect(byId.get('order-and-pay')?.status).toBe('in-progress');
    // A different vocabulary ID does not count.
    const other = evaluateTravelQuestReadiness(
      input(['completed-vocabulary-session:teacher-star-1-37e0eb213f0f']),
    );
    expect(other[1].numerator).toBe(0);
  });

  it('is immutable across repeated calls (no hidden state)', () => {
    const a = evaluateTravelQuestReadiness(input(['completed-lesson-practice:lesson-001']));
    const b = evaluateTravelQuestReadiness(input(['completed-lesson-practice:lesson-001']));
    expect(a).toEqual(b);
    expect(a).toEqual(evaluateTravelQuestReadiness(input(['completed-lesson-practice:lesson-001'])));
  });
});

// ─── Malformed / degenerate inputs ───────────────────────────────────────────

describe('malformed or degenerate evidence inputs', () => {
  const target = {
    id: 't',
    evidence: [lessonEvidence, phraseEvidence],
  };

  it('malformed keys (no colon) never count', () => {
    const r = evaluateTargetReadiness(target, input(['completed-lesson-practice:lesson-001junk']));
    expect(r.numerator).toBe(0);
    expect(r.status).toBe('not-started');
  });

  it('missing evidence keys never count', () => {
    const r = evaluateTargetReadiness(target, input());
    expect(r.numerator).toBe(0);
    expect(r.denominator).toBe(2);
  });

  it('an incomplete-but-listed unavailable key stays incomplete', () => {
    const r = evaluateTargetReadiness(
      target,
      input([], [evidenceKey(lessonEvidence), evidenceKey(lessonEvidence)]),
    );
    expect(r.numerator).toBe(0);
    expect(r.status).toBe('not-started');
    expect(r.unavailableEvidence).toEqual([evidenceKey(lessonEvidence)]);
  });

  it('stale keys (prefixed differently) never count', () => {
    const r = evaluateTargetReadiness(
      target,
      input(['lesson-practice:lesson-001', 'completed-phrase:phrase-a']),
    );
    expect(r.numerator).toBe(0);
  });

  it('an empty completed input yields zero for every target', () => {
    const r = evaluateTargetReadiness(target, input());
    expect(r).toEqual({
      targetId: 't',
      numerator: 0,
      denominator: 2,
      percentage: 0,
      unavailableEvidence: [],
      status: 'not-started',
    });
  });
});
