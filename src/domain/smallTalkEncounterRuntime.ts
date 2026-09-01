/**
 * Pure deterministic executor for the isolated Small Talk Lab v0 fixtures.
 *
 * The runtime consumes the validated #466 graph and keeps all state in memory.
 * It has no DOM, storage, timer, random, date, network, account, or production
 * progress dependency. Authored strategy selection is the only transition
 * input; every outcome and evidence item is derived from the frozen graph.
 */

import { validateSmallTalkEncounterDocument } from '../content/loadSmallTalkEncounters';
import type {
  ConversationMove,
  ConversationOutcome,
  SmallTalkBeat,
  SmallTalkEncounter,
  SmallTalkEvidenceAnnotation,
  SmallTalkLocalizedText,
  SmallTalkStrategy,
} from '../types/smallTalkEncounter';

export type SmallTalkRunMode = 'initial' | 'replay';
export type SmallTalkCapabilityEvidence =
  | 'KEEP_GOING'
  | 'REPAIR_AND_RETURN'
  | 'neither';

export interface SmallTalkRuntimeEvidenceEvent {
  readonly sequence: number;
  readonly mode: SmallTalkRunMode;
  readonly familyId: string;
  readonly encounterId: string;
  readonly beatId: string;
  readonly cueId: string;
  readonly opportunityJa: string;
  readonly targetMovePattern: readonly ConversationMove[];
  readonly encounterTargetMovePattern: readonly ConversationMove[];
  readonly strategyId: string;
  readonly strategyLabelJa: string;
  readonly strategyFit: SmallTalkStrategy['fit'];
  readonly selectedMovePattern: readonly ConversationMove[];
  readonly realizations: SmallTalkStrategy['realizations'];
  readonly outcome: ConversationOutcome;
  readonly capabilityContribution: SmallTalkCapabilityEvidence;
  readonly evidenceRef: {
    readonly beatId: string;
    readonly strategyId: string;
  };
  readonly authoredEvidence: SmallTalkEvidenceAnnotation;
  readonly nextBeatId: string | null;
  readonly partnerReply: SmallTalkLocalizedText | null;
}

export interface SmallTalkRunSummary {
  readonly familyId: string;
  readonly encounterId: string;
  readonly mode: SmallTalkRunMode;
  readonly outcome: Exclude<ConversationOutcome, 'REPAIR'>;
  readonly evidenceEvents: readonly SmallTalkRuntimeEvidenceEvent[];
  readonly supportedCapabilities: readonly Exclude<SmallTalkCapabilityEvidence, 'neither'>[];
  readonly repairCompleted: boolean;
  readonly passportProjection: SmallTalkEncounter['passportProjection'] | null;
  readonly replayAvailable: boolean;
}

interface SmallTalkEncounterSessionBase {
  readonly familyId: string;
  readonly encounterId: string;
  readonly encounter: SmallTalkEncounter;
  readonly mode: SmallTalkRunMode;
  readonly evidenceEvents: readonly SmallTalkRuntimeEvidenceEvent[];
  readonly completedRuns: readonly SmallTalkRunSummary[];
}

export interface ActiveSmallTalkEncounterSession extends SmallTalkEncounterSessionBase {
  readonly status: 'active';
  readonly currentBeatId: string;
  readonly currentOutcome: ConversationOutcome | null;
  readonly terminalPartnerReply: null;
  readonly completionSummary: null;
}

export interface CompletedSmallTalkEncounterSession extends SmallTalkEncounterSessionBase {
  readonly status: 'completed';
  readonly currentBeatId: null;
  readonly currentOutcome: Exclude<ConversationOutcome, 'REPAIR'>;
  readonly terminalPartnerReply: SmallTalkLocalizedText;
  readonly completionSummary: SmallTalkRunSummary;
}

export type SmallTalkEncounterSessionState =
  | ActiveSmallTalkEncounterSession
  | CompletedSmallTalkEncounterSession;

export type SmallTalkEncounterAction =
  | { readonly kind: 'select-strategy'; readonly strategyId: string }
  | { readonly kind: 'start-replay' }
  | { readonly kind: 'reset' };

export type SmallTalkEncounterActionRejection =
  | 'unknown-strategy'
  | 'run-active'
  | 'run-completed'
  | 'replay-already-completed';

export type SmallTalkEncounterTransition =
  | {
      readonly kind: 'accepted';
      readonly state: SmallTalkEncounterSessionState;
    }
  | {
      readonly kind: 'rejected';
      readonly reason: SmallTalkEncounterActionRejection;
      readonly state: SmallTalkEncounterSessionState;
    };

export interface SmallTalkEncounterSelection {
  readonly familyId: string;
  readonly encounterId: string;
}

interface SmallTalkRuntimeAuthority {
  readonly familyId: string;
  readonly encounterId: string;
  readonly encounter: SmallTalkEncounter;
}

const runtimeAuthorityByState = new WeakMap<
  SmallTalkEncounterSessionState,
  SmallTalkRuntimeAuthority
>();

function createActiveSession(
  authority: SmallTalkRuntimeAuthority,
  mode: SmallTalkRunMode,
  completedRuns: readonly SmallTalkRunSummary[],
): ActiveSmallTalkEncounterSession {
  return freezeAuthoritativeState({
    status: 'active',
    familyId: authority.familyId,
    encounterId: authority.encounterId,
    encounter: authority.encounter,
    mode,
    currentBeatId: mode === 'initial'
      ? authority.encounter.start.beatId
      : authority.encounter.replay.start.beatId,
    currentOutcome: null,
    evidenceEvents: [],
    completedRuns,
    terminalPartnerReply: null,
    completionSummary: null,
  }, authority);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function freezeAuthoritativeState<T extends SmallTalkEncounterSessionState>(
  state: T,
  authority: SmallTalkRuntimeAuthority,
): T {
  const frozen = deepFreeze(state);
  runtimeAuthorityByState.set(frozen, authority);
  return frozen;
}

function requireRuntimeAuthority(
  state: SmallTalkEncounterSessionState,
): SmallTalkRuntimeAuthority {
  const authority = runtimeAuthorityByState.get(state);
  if (!authority) {
    throw new Error('Small Talk runtime state is not owned by its constructor-selected authority');
  }
  if (
    state.familyId !== authority.familyId ||
    state.encounterId !== authority.encounterId ||
    state.encounter !== authority.encounter
  ) {
    throw new Error('Small Talk runtime state does not match its constructor-selected authority');
  }
  return authority;
}

/**
 * Validate and select one authored Encounter. Unknown selectors and invalid
 * graph/content definitions throw before a runtime state can be created.
 */
export function createSmallTalkEncounterSession(
  input: unknown,
  selection: SmallTalkEncounterSelection,
): ActiveSmallTalkEncounterSession {
  const document = validateSmallTalkEncounterDocument(input);
  const family = document.families.find((entry) => entry.id === selection.familyId);
  if (!family) throw new RangeError(`Small Talk runtime received unknown family '${selection.familyId}'`);
  const encounter = family.encounters.find((entry) => entry.id === selection.encounterId);
  if (!encounter) {
    throw new RangeError(
      `Small Talk runtime received unknown Encounter '${selection.encounterId}' in family '${selection.familyId}'`,
    );
  }
  const encounterSnapshot = deepFreeze(structuredClone(encounter));
  const authority = {
    familyId: family.id,
    encounterId: encounterSnapshot.id,
    encounter: encounterSnapshot,
  };
  return createActiveSession(authority, 'initial', []);
}

/** Resolve the current authored Beat, failing closed if runtime state drifted. */
export function resolveCurrentSmallTalkBeat(
  state: SmallTalkEncounterSessionState,
): SmallTalkBeat {
  assertCausalRuntimeState(state);
  return findCurrentBeat(state);
}

function findCurrentBeat(state: SmallTalkEncounterSessionState): SmallTalkBeat {
  if (state.currentBeatId === null) {
    throw new Error('Small Talk runtime state has no active Beat');
  }
  const beat = state.encounter.beats.find((entry) => entry.id === state.currentBeatId);
  if (!beat) {
    throw new Error(`Small Talk runtime state references unknown Beat '${state.currentBeatId}'`);
  }
  return beat;
}

function containsMovePatternInOrder(
  candidate: readonly ConversationMove[],
  required: readonly ConversationMove[],
): boolean {
  let requiredIndex = 0;
  for (const move of candidate) {
    if (move === required[requiredIndex]) requiredIndex += 1;
  }
  return requiredIndex === required.length;
}

function capabilityContribution(
  beat: SmallTalkBeat,
  strategy: SmallTalkStrategy,
): SmallTalkCapabilityEvidence {
  if (strategy.fit !== 'acceptable') return 'neither';
  if (beat.kind === 'repair-return' && strategy.branch.outcome === 'CONTINUE') {
    return 'REPAIR_AND_RETURN';
  }
  if (
    strategy.branch.outcome === 'CONTINUE' &&
    containsMovePatternInOrder(strategy.movePattern, beat.targetMovePattern)
  ) {
    return 'KEEP_GOING';
  }
  return 'neither';
}

function createEvidenceEvent(
  state: ActiveSmallTalkEncounterSession,
  beat: SmallTalkBeat,
  strategy: SmallTalkStrategy,
  sequence = state.evidenceEvents.length + 1,
): SmallTalkRuntimeEvidenceEvent {
  return {
    sequence,
    mode: state.mode,
    familyId: state.familyId,
    encounterId: state.encounterId,
    beatId: beat.id,
    cueId: beat.partnerCue.id,
    opportunityJa: beat.opportunityJa,
    targetMovePattern: beat.targetMovePattern,
    encounterTargetMovePattern: state.encounter.targetMovePattern,
    strategyId: strategy.id,
    strategyLabelJa: strategy.labelJa,
    strategyFit: strategy.fit,
    selectedMovePattern: strategy.movePattern,
    realizations: strategy.realizations,
    outcome: strategy.branch.outcome,
    capabilityContribution: capabilityContribution(beat, strategy),
    evidenceRef: { beatId: beat.id, strategyId: strategy.id },
    authoredEvidence: strategy.evidence,
    nextBeatId: strategy.branch.kind === 'beat' ? strategy.branch.beatId : null,
    partnerReply: strategy.branch.kind === 'terminal' ? strategy.branch.partnerReply : null,
  };
}

function summarizeCompletedRun(
  familyId: string,
  encounter: SmallTalkEncounter,
  mode: SmallTalkRunMode,
  outcome: Exclude<ConversationOutcome, 'REPAIR'>,
  events: readonly SmallTalkRuntimeEvidenceEvent[],
): SmallTalkRunSummary {
  const contributions = new Set(events.map((event) => event.capabilityContribution));
  const runSupportsEvidence = outcome !== 'STALL';
  const repairCompleted = runSupportsEvidence &&
    events.some((event) => event.outcome === 'REPAIR') &&
    contributions.has('REPAIR_AND_RETURN');
  const supportedCapabilities: Array<'KEEP_GOING' | 'REPAIR_AND_RETURN'> = [];
  if (runSupportsEvidence && contributions.has('KEEP_GOING')) {
    supportedCapabilities.push('KEEP_GOING');
  }
  if (repairCompleted) supportedCapabilities.push('REPAIR_AND_RETURN');

  const projectionRequiresRepair = encounter.beats.some(
    (beat) => beat.kind === 'repair-return',
  );
  const projectionEvidenceSupported = supportedCapabilities.includes('KEEP_GOING') &&
    (!projectionRequiresRepair || supportedCapabilities.includes('REPAIR_AND_RETURN'));

  return {
    familyId,
    encounterId: encounter.id,
    mode,
    outcome,
    evidenceEvents: events,
    supportedCapabilities,
    repairCompleted,
    passportProjection: projectionEvidenceSupported
      ? encounter.passportProjection
      : null,
    replayAvailable: mode === 'initial',
  };
}

interface ReplayedTrace {
  readonly currentBeatId: string | null;
  readonly currentOutcome: ConversationOutcome | null;
  readonly terminalPartnerReply: SmallTalkLocalizedText | null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireSameValue(actual: unknown, expected: unknown, message: string): void {
  if (!sameValue(actual, expected)) throw new Error(message);
}

function replayEvidenceTrace(
  state: Pick<
    ActiveSmallTalkEncounterSession,
    'familyId' | 'encounterId' | 'encounter' | 'mode' | 'evidenceEvents' | 'completedRuns'
  >,
  mode: SmallTalkRunMode,
  events: readonly SmallTalkRuntimeEvidenceEvent[],
): ReplayedTrace {
  let currentBeatId: string | null = mode === 'initial'
    ? state.encounter.start.beatId
    : state.encounter.replay.start.beatId;
  let currentOutcome: ConversationOutcome | null = null;
  let terminalPartnerReply: SmallTalkLocalizedText | null = null;

  for (const [index, event] of events.entries()) {
    if (currentBeatId === null) {
      throw new Error('Small Talk runtime causal trace contains evidence after a terminal branch');
    }
    const beat = state.encounter.beats.find((entry) => entry.id === currentBeatId);
    if (!beat) {
      throw new Error(`Small Talk runtime causal trace references unknown Beat '${currentBeatId}'`);
    }
    const strategy = beat.strategies.find((entry) => entry.id === event.strategyId);
    if (!strategy) {
      throw new Error(
        `Small Talk runtime causal trace references unknown strategy '${event.strategyId}' on Beat '${beat.id}'`,
      );
    }
    const expectedEvent = createEvidenceEvent(
      {
        status: 'active',
        familyId: state.familyId,
        encounterId: state.encounterId,
        encounter: state.encounter,
        mode,
        currentBeatId,
        currentOutcome,
        evidenceEvents: events.slice(0, index),
        completedRuns: state.completedRuns,
        terminalPartnerReply: null,
        completionSummary: null,
      },
      beat,
      strategy,
      index + 1,
    );
    requireSameValue(
      event,
      expectedEvent,
      `Small Talk runtime causal trace evidence ${index + 1} does not match its authored Beat and strategy`,
    );

    currentOutcome = strategy.branch.outcome;
    if (strategy.branch.kind === 'beat') {
      const nextBeatId = strategy.branch.beatId;
      if (!state.encounter.beats.some((entry) => entry.id === nextBeatId)) {
        throw new Error(`Small Talk runtime causal trace references unknown Beat '${nextBeatId}'`);
      }
      currentBeatId = nextBeatId;
      terminalPartnerReply = null;
    } else {
      currentBeatId = null;
      terminalPartnerReply = strategy.branch.partnerReply;
    }
  }

  return { currentBeatId, currentOutcome, terminalPartnerReply };
}

function validateRunSummary(
  state: SmallTalkEncounterSessionState,
  summary: SmallTalkRunSummary,
  expectedMode: SmallTalkRunMode,
): void {
  if (summary.familyId !== state.familyId || summary.encounterId !== state.encounterId) {
    throw new Error('Small Talk runtime completed-run history has mismatched identity');
  }
  if (summary.mode !== expectedMode) {
    throw new Error('Small Talk runtime completed-run history has invalid mode ordering');
  }
  const trace = replayEvidenceTrace(state, summary.mode, summary.evidenceEvents);
  if (trace.currentBeatId !== null || trace.currentOutcome === null || trace.currentOutcome === 'REPAIR') {
    throw new Error('Small Talk runtime completed-run history does not end at a terminal branch');
  }
  const expectedSummary = summarizeCompletedRun(
    state.familyId,
    state.encounter,
    summary.mode,
    trace.currentOutcome,
    summary.evidenceEvents,
  );
  requireSameValue(
    summary,
    expectedSummary,
    'Small Talk runtime completed-run history does not match its causal evidence',
  );
}

function assertCompletedRunHistory(state: SmallTalkEncounterSessionState): void {
  const expectedCount = state.mode === 'initial'
    ? (state.status === 'completed' ? 1 : 0)
    : (state.status === 'completed' ? 2 : 1);
  if (state.completedRuns.length !== expectedCount) {
    throw new Error('Small Talk runtime completed-run history has an invalid run count');
  }
  for (const [index, summary] of state.completedRuns.entries()) {
    validateRunSummary(state, summary, index === 0 ? 'initial' : 'replay');
  }
}

function assertCausalRuntimeState(
  state: SmallTalkEncounterSessionState,
): SmallTalkRuntimeAuthority {
  const authority = requireRuntimeAuthority(state);
  if (state.encounter.id !== state.encounterId) {
    throw new Error('Small Talk runtime state Encounter identity does not match encounterId');
  }
  assertCompletedRunHistory(state);
  const trace = replayEvidenceTrace(state, state.mode, state.evidenceEvents);

  if (state.status === 'active') {
    if (trace.currentBeatId === null) {
      throw new Error('Small Talk runtime causal trace ended at a terminal branch while state is active');
    }
    if (state.currentBeatId !== trace.currentBeatId) {
      throw new Error(
        `Small Talk runtime causal trace current Beat must be '${trace.currentBeatId}', received '${state.currentBeatId}'`,
      );
    }
    if (state.currentOutcome !== trace.currentOutcome) {
      throw new Error('Small Talk runtime causal trace outcome does not match active state');
    }
    if (state.terminalPartnerReply !== null || state.completionSummary !== null) {
      throw new Error('Small Talk runtime active state must not carry terminal output');
    }
    return authority;
  }

  if (trace.currentBeatId !== null || trace.currentOutcome === null || trace.currentOutcome === 'REPAIR') {
    throw new Error('Small Talk runtime causal trace is not terminal while state is completed');
  }
  if (state.currentBeatId !== null || state.currentOutcome !== trace.currentOutcome) {
    throw new Error('Small Talk runtime causal trace outcome does not match completed state');
  }
  requireSameValue(
    state.terminalPartnerReply,
    trace.terminalPartnerReply,
    'Small Talk runtime terminal reply does not match its causal trace',
  );
  const expectedSummary = summarizeCompletedRun(
    state.familyId,
    state.encounter,
    state.mode,
    trace.currentOutcome,
    state.evidenceEvents,
  );
  requireSameValue(
    state.completionSummary,
    expectedSummary,
    'Small Talk runtime completion summary does not match its causal trace',
  );
  requireSameValue(
    state.completedRuns.at(-1),
    state.completionSummary,
    'Small Talk runtime completed-run history is missing the current summary',
  );
  return authority;
}

function applyStrategySelection(
  state: SmallTalkEncounterSessionState,
  strategyId: string,
  authority: SmallTalkRuntimeAuthority,
): SmallTalkEncounterTransition {
  if (state.status === 'completed') {
    return { kind: 'rejected', reason: 'run-completed', state };
  }
  const beat = findCurrentBeat(state);
  const strategy = beat.strategies.find((entry) => entry.id === strategyId);
  if (!strategy) return { kind: 'rejected', reason: 'unknown-strategy', state };

  const event = createEvidenceEvent(state, beat, strategy);
  const evidenceEvents = [...state.evidenceEvents, event];
  if (strategy.branch.kind === 'beat') {
    const nextBeatId = strategy.branch.beatId;
    const nextBeat = state.encounter.beats.find((entry) => entry.id === nextBeatId);
    if (!nextBeat) {
      throw new Error(
        `Small Talk runtime branch references unknown Beat '${nextBeatId}'`,
      );
    }
    return {
      kind: 'accepted',
      state: freezeAuthoritativeState({
        ...state,
        currentBeatId: nextBeat.id,
        currentOutcome: strategy.branch.outcome,
        evidenceEvents,
      }, authority),
    };
  }

  if (strategy.branch.outcome === 'REPAIR') {
    throw new Error('Small Talk runtime terminal branch cannot end with REPAIR');
  }
  const completionSummary = summarizeCompletedRun(
    state.familyId,
    state.encounter,
    state.mode,
    strategy.branch.outcome,
    evidenceEvents,
  );
  return {
    kind: 'accepted',
    state: freezeAuthoritativeState({
      ...state,
      status: 'completed',
      currentBeatId: null,
      currentOutcome: strategy.branch.outcome,
      evidenceEvents,
      completedRuns: [...state.completedRuns, completionSummary],
      terminalPartnerReply: strategy.branch.partnerReply,
      completionSummary,
    }, authority),
  };
}

/** Apply one pure authored runtime action. Rejected actions preserve identity. */
export function applySmallTalkEncounterAction(
  state: SmallTalkEncounterSessionState,
  action: SmallTalkEncounterAction,
): SmallTalkEncounterTransition {
  const authority = assertCausalRuntimeState(state);
  switch (action.kind) {
    case 'select-strategy':
      return applyStrategySelection(state, action.strategyId, authority);
    case 'start-replay':
      if (state.status === 'active') {
        return { kind: 'rejected', reason: 'run-active', state };
      }
      if (state.mode === 'replay') {
        return { kind: 'rejected', reason: 'replay-already-completed', state };
      }
      return {
        kind: 'accepted',
        state: createActiveSession(authority, 'replay', state.completedRuns),
      };
    case 'reset':
      return {
        kind: 'accepted',
        state: createActiveSession(authority, 'initial', []),
      };
  }
}
