import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadSmallTalkEncounterDocument } from '../src/content/loadSmallTalkEncounters';
import {
  applySmallTalkEncounterAction,
  createSmallTalkEncounterSession,
  resolveCurrentSmallTalkBeat,
  type SmallTalkEncounterSessionState,
} from '../src/domain/smallTalkEncounterRuntime';
import type { SmallTalkEncounterDocument } from '../src/types/smallTalkEncounter';

const document = loadSmallTalkEncounterDocument();

function createSession(
  familyId = 'weekend-baseline',
  encounterId = 'weekend-micro',
): SmallTalkEncounterSessionState {
  return createSmallTalkEncounterSession(document, { familyId, encounterId });
}

function accept(
  state: SmallTalkEncounterSessionState,
  action:
    | { readonly kind: 'select-strategy'; readonly strategyId: string }
    | { readonly kind: 'start-replay' }
    | { readonly kind: 'reset' },
): SmallTalkEncounterSessionState {
  const result = applySmallTalkEncounterAction(state, action);
  expect(result.kind).toBe('accepted');
  return result.state;
}

function completeWithFirstStrategy(
  state: SmallTalkEncounterSessionState,
): SmallTalkEncounterSessionState {
  let next = state;
  while (next.status === 'active') {
    const beat = resolveCurrentSmallTalkBeat(next);
    next = accept(next, { kind: 'select-strategy', strategyId: beat.strategies[0].id });
  }
  return next;
}

function assertEveryReachablePathExecutes(state: SmallTalkEncounterSessionState): void {
  expect(state.status).toBe('active');
  if (state.status !== 'active') return;
  const beat = resolveCurrentSmallTalkBeat(state);
  for (const strategy of beat.strategies) {
    const result = applySmallTalkEncounterAction(state, {
      kind: 'select-strategy',
      strategyId: strategy.id,
    });
    expect(result.kind).toBe('accepted');
    if (result.state.status === 'active') assertEveryReachablePathExecutes(result.state);
    else expect(result.state.completionSummary?.outcome).toBe(strategy.branch.outcome);
  }
}

describe('Small Talk Encounter deterministic runtime', () => {
  it('initializes every #466 fixture at its authored initial Beat and cue', () => {
    for (const family of document.families) {
      for (const encounter of family.encounters) {
        const state = createSmallTalkEncounterSession(document, {
          familyId: family.id,
          encounterId: encounter.id,
        });

        expect(state).toMatchObject({
          status: 'active',
          mode: 'initial',
          familyId: family.id,
          encounterId: encounter.id,
          currentBeatId: encounter.start.beatId,
          currentOutcome: null,
          evidenceEvents: [],
          completedRuns: [],
          completionSummary: null,
          terminalPartnerReply: null,
        });
        expect(resolveCurrentSmallTalkBeat(state).partnerCue.id).toBe(
          encounter.beats.find((beat) => beat.id === encounter.start.beatId)?.partnerCue.id,
        );
      }
    }
  });

  it('executes a multi-Beat KEEP_GOING path and emits inspectable authored evidence', () => {
    let state = createSession('weekend-baseline', 'weekend-medium');
    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'weekend-medium-connect-experience',
    });

    expect(state).toMatchObject({
      status: 'active',
      currentBeatId: 'weekend-medium-follow-up',
      currentOutcome: 'CONTINUE',
    });
    expect(state.evidenceEvents[0]).toMatchObject({
      sequence: 1,
      mode: 'initial',
      familyId: 'weekend-baseline',
      encounterId: 'weekend-medium',
      beatId: 'weekend-medium-opening',
      cueId: 'weekend-medium-trip',
      strategyId: 'weekend-medium-connect-experience',
      strategyFit: 'acceptable',
      selectedMovePattern: ['REACT', 'CONNECT', 'ADD', 'INVITE'],
      encounterTargetMovePattern: ['REACT', 'ADD', 'INVITE'],
      outcome: 'CONTINUE',
      capabilityContribution: 'KEEP_GOING',
      nextBeatId: 'weekend-medium-follow-up',
      partnerReply: null,
      evidenceRef: {
        beatId: 'weekend-medium-opening',
        strategyId: 'weekend-medium-connect-experience',
      },
    });
    expect(state.evidenceEvents[0].authoredEvidence.explanationJa).toContain('相手の評価');
    expect(state.evidenceEvents[0].realizations).not.toHaveLength(0);

    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'weekend-medium-follow-detail',
    });

    expect(state.status).toBe('completed');
    expect(state.currentBeatId).toBeNull();
    expect(state.currentOutcome).toBe('CONTINUE');
    expect(state.terminalPartnerReply?.traditional).toContain('牛肉麵');
    expect(state.completionSummary).toMatchObject({
      mode: 'initial',
      outcome: 'CONTINUE',
      supportedCapabilities: ['KEEP_GOING'],
      replayAvailable: true,
      passportProjection: state.encounter.passportProjection,
    });
    expect(state.completionSummary?.evidenceEvents).toHaveLength(2);
    expect(state.completedRuns).toEqual([state.completionSummary]);
  });

  it('preserves alternate acceptable and deliberate STALL paths without ideal-answer scoring', () => {
    const alternate = accept(createSession(), {
      kind: 'select-strategy',
      strategyId: 'weekend-micro-preference-and-invite',
    });
    expect(alternate).toMatchObject({
      status: 'completed',
      currentOutcome: 'CONTINUE',
      completionSummary: {
        supportedCapabilities: ['KEEP_GOING'],
      },
    });

    const stalled = accept(createSession(), {
      kind: 'select-strategy',
      strategyId: 'weekend-micro-reaction-only',
    });
    expect(stalled).toMatchObject({
      status: 'completed',
      currentOutcome: 'STALL',
      completionSummary: {
        supportedCapabilities: [],
      },
    });
    expect(stalled.evidenceEvents[0].capabilityContribution).toBe('neither');
    expect(Object.keys(stalled.completionSummary ?? {})).not.toEqual(
      expect.arrayContaining(['score', 'confidence', 'personality', 'ability']),
    );
  });

  it('treats authored CLOSE as healthy completion without mislabeling the close event', () => {
    let state = createSession('weekend-baseline', 'weekend-medium');
    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'weekend-medium-preference-path',
    });
    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'weekend-medium-close-well',
    });

    expect(state).toMatchObject({
      status: 'completed',
      currentOutcome: 'CLOSE',
      completionSummary: {
        outcome: 'CLOSE',
        supportedCapabilities: ['KEEP_GOING'],
      },
    });
    expect(state.evidenceEvents.at(-1)?.capabilityContribution).toBe('neither');
  });

  it('requires the bounded REPAIR entry to return through an acceptable CONTINUE event', () => {
    let state = createSession('mid-autumn-2026-transfer', 'mid-autumn-2026-medium');
    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'mid-autumn-share-preference',
    });
    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'mid-autumn-repair-kaorou',
    });

    expect(state).toMatchObject({
      status: 'active',
      currentBeatId: 'mid-autumn-repair-return',
      currentOutcome: 'REPAIR',
    });
    expect(resolveCurrentSmallTalkBeat(state).kind).toBe('repair-return');
    expect(state.evidenceEvents.at(-1)?.capabilityContribution).toBe('neither');

    state = accept(state, {
      kind: 'select-strategy',
      strategyId: 'mid-autumn-confirm-and-return',
    });

    expect(state).toMatchObject({
      status: 'completed',
      currentOutcome: 'CONTINUE',
      completionSummary: {
        supportedCapabilities: ['KEEP_GOING', 'REPAIR_AND_RETURN'],
      },
    });
    expect(state.evidenceEvents.at(-1)?.capabilityContribution).toBe('REPAIR_AND_RETURN');
    expect(state.completionSummary?.repairCompleted).toBe(true);
  });

  it('starts replay only after initial completion at the controlled alternate root', () => {
    const active = createSession();
    expect(applySmallTalkEncounterAction(active, { kind: 'start-replay' })).toMatchObject({
      kind: 'rejected',
      reason: 'run-active',
      state: active,
    });

    const completed = accept(active, {
      kind: 'select-strategy',
      strategyId: 'weekend-micro-share-and-follow',
    });
    const replay = accept(completed, { kind: 'start-replay' });

    expect(replay).toMatchObject({
      status: 'active',
      mode: 'replay',
      currentBeatId: 'weekend-micro-brief-replay',
      currentOutcome: null,
      evidenceEvents: [],
      completionSummary: null,
    });
    expect(resolveCurrentSmallTalkBeat(replay).partnerCue.id).toBe('weekend-micro-brief');
    expect(resolveCurrentSmallTalkBeat(replay).targetMovePattern).toEqual(
      replay.encounter.targetMovePattern,
    );
    expect(replay.completedRuns).toEqual(completed.completedRuns);

    const replayCompleted = accept(replay, {
      kind: 'select-strategy',
      strategyId: 'weekend-micro-home-share-and-invite',
    });
    expect(replayCompleted.completionSummary).toMatchObject({
      mode: 'replay',
      replayAvailable: false,
    });
    expect(replayCompleted.completedRuns).toHaveLength(2);
    expect(applySmallTalkEncounterAction(replayCompleted, { kind: 'start-replay' })).toMatchObject({
      kind: 'rejected',
      reason: 'replay-already-completed',
    });
  });

  it('resets to a clean in-memory initial session and touches no production state API', () => {
    const getItem = vi.fn();
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem, setItem, removeItem });

    let state = completeWithFirstStrategy(createSession());
    state = accept(state, { kind: 'start-replay' });
    state = accept(state, { kind: 'reset' });

    expect(state).toMatchObject({
      status: 'active',
      mode: 'initial',
      currentBeatId: 'weekend-micro-opening',
      currentOutcome: null,
      evidenceEvents: [],
      completedRuns: [],
      completionSummary: null,
    });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('fails closed on invalid definitions or corrupted runtime state', () => {
    const invalid = structuredClone(document) as SmallTalkEncounterDocument;
    const branch = invalid.families[0].encounters[1].beats[0].strategies[0].branch;
    if (branch.kind !== 'beat') throw new Error('fixture must contain a Beat branch');
    (branch as { beatId: string }).beatId = 'missing-beat';
    expect(() =>
      createSmallTalkEncounterSession(invalid, {
        familyId: 'weekend-baseline',
        encounterId: 'weekend-medium',
      }),
    ).toThrow("references unknown Beat 'missing-beat'");

    expect(() =>
      createSmallTalkEncounterSession(document, {
        familyId: 'missing-family',
        encounterId: 'weekend-micro',
      }),
    ).toThrow("unknown family 'missing-family'");

    const corrupted = {
      ...createSession(),
      currentBeatId: 'missing-beat',
    } as SmallTalkEncounterSessionState;
    expect(() => resolveCurrentSmallTalkBeat(corrupted)).toThrow(
      "runtime state references unknown Beat 'missing-beat'",
    );
    expect(() =>
      applySmallTalkEncounterAction(corrupted, {
        kind: 'select-strategy',
        strategyId: 'anything',
      }),
    ).toThrow("runtime state references unknown Beat 'missing-beat'");
  });

  it('rejects unknown or out-of-order strategy actions without mutating state', () => {
    const active = createSession();
    const unknown = applySmallTalkEncounterAction(active, {
      kind: 'select-strategy',
      strategyId: 'missing-strategy',
    });
    expect(unknown).toEqual({ kind: 'rejected', reason: 'unknown-strategy', state: active });

    const completed = completeWithFirstStrategy(active);
    expect(
      applySmallTalkEncounterAction(completed, {
        kind: 'select-strategy',
        strategyId: 'weekend-micro-share-and-follow',
      }),
    ).toEqual({ kind: 'rejected', reason: 'run-completed', state: completed });
  });

  it('executes every authored initial and replay path through one runtime contract', () => {
    for (const family of document.families) {
      for (const encounter of family.encounters) {
        const initial = createSmallTalkEncounterSession(document, {
          familyId: family.id,
          encounterId: encounter.id,
        });
        assertEveryReachablePathExecutes(initial);

        const initialComplete = completeWithFirstStrategy(initial);
        const replay = accept(initialComplete, { kind: 'start-replay' });
        assertEveryReachablePathExecutes(replay);
      }
    }
  });

  it('is deterministic and has no storage, network, clock, or random dependency', () => {
    function run(): SmallTalkEncounterSessionState {
      let state = createSession('mid-autumn-2026-transfer', 'mid-autumn-2026-medium');
      state = accept(state, {
        kind: 'select-strategy',
        strategyId: 'mid-autumn-share-preference',
      });
      return accept(state, {
        kind: 'select-strategy',
        strategyId: 'mid-autumn-react-to-choice',
      });
    }
    expect(run()).toEqual(run());

    const source = readFileSync(
      join(process.cwd(), 'src/domain/smallTalkEncounterRuntime.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/localStorage|sessionStorage|fetch\(|Math\.random|Date\.|new Date/);
    expect(source).not.toMatch(/from ['"].*(progress|account|sync|roleplay)/i);
  });
});
