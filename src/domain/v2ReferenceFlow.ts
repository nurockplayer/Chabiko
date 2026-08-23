export type V2ReferenceStage =
  | 'today'
  | 'learning'
  | 'retrieval'
  | 'repair'
  | 'correct'
  | 'result';

export type V2ReferenceRepairSupport = 'none' | 'hint' | 'answer';

export interface V2ReferenceFlowConfig {
  availableChunkIds: readonly string[];
  answerSignature: string;
}

export interface V2ReferenceFlowState {
  stage: V2ReferenceStage;
  selectedChunkIds: string[];
  submittedChunkIds: string[];
  retrievalAttempts: number;
  repairSupport: V2ReferenceRepairSupport;
  hintUsed: boolean;
  answerRevealed: boolean;
  audioPlayed: boolean;
}

export type V2ReferenceFlowAction =
  | { type: 'start-learning' }
  | { type: 'audio-played' }
  | { type: 'start-retrieval' }
  | { type: 'select-chunk'; chunkId: string }
  | { type: 'remove-chunk'; chunkId: string }
  | { type: 'submit-retrieval' }
  | { type: 'show-hint' }
  | { type: 'reveal-answer' }
  | { type: 'retry' }
  | { type: 'view-result' }
  | { type: 'restart' };

export function createV2ReferenceFlowState(): V2ReferenceFlowState {
  return {
    stage: 'today',
    selectedChunkIds: [],
    submittedChunkIds: [],
    retrievalAttempts: 0,
    repairSupport: 'none',
    hintUsed: false,
    answerRevealed: false,
    audioPlayed: false,
  };
}

/**
 * Stable, non-cryptographic signature for comparing an ordered chunk sequence.
 * The safe bootstrap carries only this digest, never the canonical answer order.
 */
export function sequenceSignature(chunkIds: readonly string[]): string {
  let hash = 2166136261;
  for (const character of chunkIds.join('\u001f')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function reduceV2ReferenceFlow(
  state: V2ReferenceFlowState,
  action: V2ReferenceFlowAction,
  config: V2ReferenceFlowConfig,
): V2ReferenceFlowState {
  switch (action.type) {
    case 'start-learning':
      if (state.stage !== 'today' && state.stage !== 'result') return state;
      return {
        ...createV2ReferenceFlowState(),
        stage: 'learning',
      };

    case 'audio-played':
      if (state.stage !== 'learning') return state;
      return { ...state, audioPlayed: true };

    case 'start-retrieval':
      if (state.stage !== 'learning') return state;
      return {
        ...state,
        stage: 'retrieval',
        selectedChunkIds: [],
        submittedChunkIds: [],
        repairSupport: 'none',
      };

    case 'select-chunk': {
      if (state.stage !== 'retrieval') return state;
      if (!config.availableChunkIds.includes(action.chunkId)) return state;
      if (state.selectedChunkIds.includes(action.chunkId)) return state;
      if (state.selectedChunkIds.length >= config.availableChunkIds.length) return state;
      return {
        ...state,
        selectedChunkIds: [...state.selectedChunkIds, action.chunkId],
      };
    }

    case 'remove-chunk':
      if (state.stage !== 'retrieval') return state;
      if (!state.selectedChunkIds.includes(action.chunkId)) return state;
      return {
        ...state,
        selectedChunkIds: state.selectedChunkIds.filter(
          (chunkId) => chunkId !== action.chunkId,
        ),
      };

    case 'submit-retrieval': {
      if (state.stage !== 'retrieval') return state;
      if (state.selectedChunkIds.length !== config.availableChunkIds.length) return state;

      const submittedChunkIds = [...state.selectedChunkIds];
      const isCorrect = sequenceSignature(submittedChunkIds) === config.answerSignature;
      return {
        ...state,
        stage: isCorrect ? 'correct' : 'repair',
        submittedChunkIds,
        retrievalAttempts: state.retrievalAttempts + 1,
        repairSupport: 'none',
      };
    }

    case 'show-hint':
      if (state.stage !== 'repair' || state.repairSupport !== 'none') return state;
      return {
        ...state,
        repairSupport: 'hint',
        hintUsed: true,
      };

    case 'reveal-answer':
      if (state.stage !== 'repair' || state.repairSupport !== 'hint') return state;
      return {
        ...state,
        repairSupport: 'answer',
        answerRevealed: true,
      };

    case 'retry':
      if (state.stage !== 'repair' || state.repairSupport !== 'answer') return state;
      return {
        ...state,
        stage: 'retrieval',
        selectedChunkIds: [],
        submittedChunkIds: [],
        repairSupport: 'none',
      };

    case 'view-result':
      if (state.stage !== 'correct') return state;
      return { ...state, stage: 'result' };

    case 'restart':
      if (state.stage !== 'result') return state;
      return createV2ReferenceFlowState();
  }
}
