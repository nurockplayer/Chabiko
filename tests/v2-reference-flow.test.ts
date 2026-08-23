import { describe, expect, it } from 'vitest';
import {
  buildV2ReferenceEvidence,
  createV2RetrievalSession,
  requestV2RetrievalHint,
  retryV2Retrieval,
  revealV2RetrievalAnswer,
  selectV2RetrievalToken,
  submitV2Retrieval,
} from '../src/domain/v2ReferenceFlow';

function choose(
  session: ReturnType<typeof createV2RetrievalSession>,
  tokenIds: readonly string[],
) {
  return tokenIds.reduce(selectV2RetrievalToken, session);
}

describe('V2 reference retrieval state machine', () => {
  it('keeps the answer out of the initial, incorrect, and hint states', () => {
    const initial = createV2RetrievalSession();
    const incorrect = submitV2Retrieval(
      choose(initial, ['zhege', 'wo', 'yao']),
    );
    const hinted = requestV2RetrievalHint(incorrect);

    expect(initial.status).toBe('retrieval');
    expect(initial.availableTokenIds).toEqual(['zhege', 'wo', 'yao']);
    expect('revealedAnswer' in initial).toBe(false);
    expect(incorrect.status).toBe('incorrect');
    expect('revealedAnswer' in incorrect).toBe(false);
    expect(hinted.status).toBe('hint');
    if (hinted.status !== 'hint') throw new Error('expected hint state');
    expect(hinted.hintJa).toBe(
      'まず「私」、次に「欲しい」、最後に「これ」。',
    );
    expect('revealedAnswer' in hinted).toBe(false);
  });

  it('reveals the exact answer only after an explicit reveal action', () => {
    const incorrect = submitV2Retrieval(
      choose(createV2RetrievalSession(), ['zhege', 'wo', 'yao']),
    );
    const revealed = revealV2RetrievalAnswer(incorrect);

    expect(revealed.status).toBe('revealed');
    if (revealed.status !== 'revealed') throw new Error('expected revealed state');
    expect(revealed.revealedAnswer).toBe('我要這個');
    expect(revealed.repairChunks).toEqual([
      { text: '我', meaningJa: '私' },
      { text: '要', meaningJa: '欲しい・したい' },
      { text: '這個', meaningJa: 'これ' },
    ]);
  });

  it('accepts only the reviewed token order and records a successful retry', () => {
    const incorrect = submitV2Retrieval(
      choose(createV2RetrievalSession(), ['zhege', 'wo', 'yao']),
    );
    const revealed = revealV2RetrievalAnswer(incorrect);
    const retry = retryV2Retrieval(revealed);
    const correct = submitV2Retrieval(choose(retry, ['wo', 'yao', 'zhege']));

    expect(retry.status).toBe('retrieval');
    expect(retry.attempt).toBe(2);
    expect(retry.usedReveal).toBe(true);
    expect(correct.status).toBe('correct');
    expect(correct.attempt).toBe(2);
  });

  it('builds truthful evidence that distinguishes blind recall from repair', () => {
    const firstTry = submitV2Retrieval(
      choose(createV2RetrievalSession(), ['wo', 'yao', 'zhege']),
    );
    const afterReveal = submitV2Retrieval(
      choose(
        retryV2Retrieval(
          revealV2RetrievalAnswer(
            submitV2Retrieval(
              choose(createV2RetrievalSession(), ['zhege', 'wo', 'yao']),
            ),
          ),
        ),
        ['wo', 'yao', 'zhege'],
      ),
    );

    expect(buildV2ReferenceEvidence(firstTry)).toMatchObject({
      kind: 'first-try',
      summaryJa: '答えを見ずに、最初の一回で語順を組み立てられました。',
    });
    expect(buildV2ReferenceEvidence(afterReveal)).toMatchObject({
      kind: 'after-reveal',
      summaryJa: '答えを確認したあと、もう一度自分で語順を組み立てられました。',
    });
  });
});
