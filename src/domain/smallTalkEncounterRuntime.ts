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
  readonly passportProjection: SmallTalkEncounter['passportProjection'];
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

function createActiveSession(
  familyId: string,
  encounter: SmallTalkEncounter,
  mode: SmallTalkRunMode,
  completedRuns: readonly SmallTalkRunSummary[],
): ActiveSmallTalkEncounterSession {
  return {
    status: 'active',
    familyId,
    encounterId: encounter.id,
    encounter,
    mode,
    currentBeatId: mode === 'initial' ? encounter.start.beatId : encounter.replay.start.beatId,
    currentOutcome: null,
    evidenceEvents: [],
    completedRuns,
    terminalPartnerReply: null,
    completionSummary: null,
  };
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
  return createActiveSession(family.id, encounter, 'initial', []);
}

/** Resolve the current authored Beat, failing closed if runtime state drifted. */
export function resolveCurrentSmallTalkBeat(
  state: SmallTalkEncounterSessionState,
): SmallTalkBeat {
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
): SmallTalkRuntimeEvidenceEvent {
  return {
    sequence: state.evidenceEvents.length + 1,
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
  state: ActiveSmallTalkEncounterSession,
  outcome: Exclude<ConversationOutcome, 'REPAIR'>,
  events: readonly SmallTalkRuntimeEvidenceEvent[],
): SmallTalkRunSummary {
  const contributions = new Set(events.map((event) => event.capabilityContribution));
  const repairCompleted =
    events.some((event) => event.outcome === 'REPAIR') &&
    contributions.has('REPAIR_AND_RETURN');
  const supportedCapabilities: Array<'KEEP_GOING' | 'REPAIR_AND_RETURN'> = [];
  if (contributions.has('KEEP_GOING')) supportedCapabilities.push('KEEP_GOING');
  if (repairCompleted) supportedCapabilities.push('REPAIR_AND_RETURN');

  return {
    familyId: state.familyId,
    encounterId: state.encounterId,
    mode: state.mode,
    outcome,
    evidenceEvents: events,
    supportedCapabilities,
    repairCompleted,
    passportProjection: state.encounter.passportProjection,
    replayAvailable: state.mode === 'initial',
  };
}

function applyStrategySelection(
  state: SmallTalkEncounterSessionState,
  strategyId: string,
): SmallTalkEncounterTransition {
  if (state.status === 'completed') {
    return { kind: 'rejected', reason: 'run-completed', state };
  }
  const beat = resolveCurrentSmallTalkBeat(state);
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
      state: {
        ...state,
        currentBeatId: nextBeat.id,
        currentOutcome: strategy.branch.outcome,
        evidenceEvents,
      },
    };
  }

  if (strategy.branch.outcome === 'REPAIR') {
    throw new Error('Small Talk runtime terminal branch cannot end with REPAIR');
  }
  const completionSummary = summarizeCompletedRun(
    state,
    strategy.branch.outcome,
    evidenceEvents,
  );
  return {
    kind: 'accepted',
    state: {
      ...state,
      status: 'completed',
      currentBeatId: null,
      currentOutcome: strategy.branch.outcome,
      evidenceEvents,
      completedRuns: [...state.completedRuns, completionSummary],
      terminalPartnerReply: strategy.branch.partnerReply,
      completionSummary,
    },
  };
}

/** Apply one pure authored runtime action. Rejected actions preserve identity. */
export function applySmallTalkEncounterAction(
  state: SmallTalkEncounterSessionState,
  action: SmallTalkEncounterAction,
): SmallTalkEncounterTransition {
  switch (action.kind) {
    case 'select-strategy':
      return applyStrategySelection(state, action.strategyId);
    case 'start-replay':
      if (state.status === 'active') {
        return { kind: 'rejected', reason: 'run-active', state };
      }
      if (state.mode === 'replay') {
        return { kind: 'rejected', reason: 'replay-already-completed', state };
      }
      return {
        kind: 'accepted',
        state: createActiveSession(state.familyId, state.encounter, 'replay', state.completedRuns),
      };
    case 'reset':
      return {
        kind: 'accepted',
        state: createActiveSession(state.familyId, state.encounter, 'initial', []),
      };
  }
}
