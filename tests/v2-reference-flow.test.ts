import { describe, expect, it } from 'vitest';
import {
  createV2ReferenceFlowState,
  reduceV2ReferenceFlow,
  sequenceSignature,
  type V2ReferenceFlowConfig,
} from '../src/domain/v2ReferenceFlow';

const CONFIG: V2ReferenceFlowConfig = {
  availableChunkIds: ['v2-c42', 'v2-a91', 'v2-b07'],
  answerSignature: '2spt6r',
};

function selectChunks(
  state: ReturnType<typeof createV2ReferenceFlowState>,
  chunkIds: string[],
) {
  return chunkIds.reduce(
    (current, chunkId) =>
      reduceV2ReferenceFlow(current, { type: 'select-chunk', chunkId }, CONFIG),
    state,
  );
}

describe('V2 reference flow state', () => {
  it('moves through learning, failed retrieval, progressive repair, retry, and result', () => {
    let state = createV2ReferenceFlowState();

    state = reduceV2ReferenceFlow(state, { type: 'start-learning' }, CONFIG);
    expect(state.stage).toBe('learning');

    state = reduceV2ReferenceFlow(state, { type: 'audio-played' }, CONFIG);
    state = reduceV2ReferenceFlow(state, { type: 'start-retrieval' }, CONFIG);
    state = selectChunks(state, ['v2-c42', 'v2-a91', 'v2-b07']);
    state = reduceV2ReferenceFlow(state, { type: 'submit-retrieval' }, CONFIG);

    expect(state).toMatchObject({
      stage: 'repair',
      retrievalAttempts: 1,
      hintUsed: false,
      answerRevealed: false,
      submittedChunkIds: ['v2-c42', 'v2-a91', 'v2-b07'],
    });

    // Repair is deliberately progressive: reveal cannot skip the hint step.
    state = reduceV2ReferenceFlow(state, { type: 'reveal-answer' }, CONFIG);
    expect(state.answerRevealed).toBe(false);

    state = reduceV2ReferenceFlow(state, { type: 'show-hint' }, CONFIG);
    state = reduceV2ReferenceFlow(state, { type: 'reveal-answer' }, CONFIG);
    expect(state).toMatchObject({ hintUsed: true, answerRevealed: true });

    state = reduceV2ReferenceFlow(state, { type: 'retry' }, CONFIG);
    expect(state).toMatchObject({
      stage: 'retrieval',
      selectedChunkIds: [],
      retrievalAttempts: 1,
      hintUsed: true,
      answerRevealed: true,
    });

    state = selectChunks(state, ['v2-a91', 'v2-b07', 'v2-c42']);
    state = reduceV2ReferenceFlow(state, { type: 'submit-retrieval' }, CONFIG);
    expect(state).toMatchObject({ stage: 'correct', retrievalAttempts: 2 });

    state = reduceV2ReferenceFlow(state, { type: 'view-result' }, CONFIG);
    expect(state).toMatchObject({
      stage: 'result',
      audioPlayed: true,
      retrievalAttempts: 2,
      hintUsed: true,
      answerRevealed: true,
    });
  });

  it('ignores duplicate, unknown, and over-capacity chunk selection', () => {
    let state = reduceV2ReferenceFlow(
      createV2ReferenceFlowState(),
      { type: 'start-learning' },
      CONFIG,
    );
    state = reduceV2ReferenceFlow(state, { type: 'start-retrieval' }, CONFIG);
    state = selectChunks(state, [
      'v2-a91',
      'v2-a91',
      'not-allowed',
      'v2-b07',
      'v2-c42',
      'not-allowed-either',
    ]);

    expect(state.selectedChunkIds).toEqual(['v2-a91', 'v2-b07', 'v2-c42']);
  });

  it('does not submit an incomplete retrieval and supports removing a selection', () => {
    let state = reduceV2ReferenceFlow(
      createV2ReferenceFlowState(),
      { type: 'start-learning' },
      CONFIG,
    );
    state = reduceV2ReferenceFlow(state, { type: 'start-retrieval' }, CONFIG);
    state = selectChunks(state, ['v2-a91', 'v2-b07']);
    state = reduceV2ReferenceFlow(
      state,
      { type: 'remove-chunk', chunkId: 'v2-a91' },
      CONFIG,
    );

    expect(state.selectedChunkIds).toEqual(['v2-b07']);
    expect(
      reduceV2ReferenceFlow(state, { type: 'submit-retrieval' }, CONFIG),
    ).toEqual(state);
  });

  it('records an unaided first-try retrieval without inventing repair evidence', () => {
    let state = reduceV2ReferenceFlow(
      createV2ReferenceFlowState(),
      { type: 'start-learning' },
      CONFIG,
    );
    state = reduceV2ReferenceFlow(state, { type: 'start-retrieval' }, CONFIG);
    state = selectChunks(state, ['v2-a91', 'v2-b07', 'v2-c42']);
    state = reduceV2ReferenceFlow(state, { type: 'submit-retrieval' }, CONFIG);
    state = reduceV2ReferenceFlow(state, { type: 'view-result' }, CONFIG);

    expect(state).toMatchObject({
      stage: 'result',
      retrievalAttempts: 1,
      hintUsed: false,
      answerRevealed: false,
      audioPlayed: false,
    });
  });

  it('uses the frozen sequence signature expected by the safe bootstrap payload', () => {
    expect(sequenceSignature(['v2-a91', 'v2-b07', 'v2-c42'])).toBe('2spt6r');
    const incorrectPermutations = [
      ['v2-a91', 'v2-c42', 'v2-b07'],
      ['v2-b07', 'v2-a91', 'v2-c42'],
      ['v2-b07', 'v2-c42', 'v2-a91'],
      ['v2-c42', 'v2-a91', 'v2-b07'],
      ['v2-c42', 'v2-b07', 'v2-a91'],
    ];
    for (const permutation of incorrectPermutations) {
      expect(sequenceSignature(permutation)).not.toBe('2spt6r');
    }
  });
});
