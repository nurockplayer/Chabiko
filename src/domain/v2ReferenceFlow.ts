import referenceData from '../../data/v2-reference/reference.json';

interface RetrievalBase {
  readonly availableTokenIds: readonly string[];
  readonly selectedTokenIds: readonly string[];
  readonly attempt: number;
  readonly usedHint: boolean;
  readonly usedReveal: boolean;
}

export type V2RetrievalSession = RetrievalBase &
  (
    | { readonly status: 'retrieval' }
    | { readonly status: 'incorrect'; readonly feedbackJa: string }
    | { readonly status: 'hint'; readonly hintJa: string }
    | {
        readonly status: 'revealed';
        readonly revealedAnswer: string;
        readonly repairChunks: readonly {
          readonly text: string;
          readonly meaningJa: string;
        }[];
      }
    | { readonly status: 'correct'; readonly feedbackJa: string }
  );

export interface V2ReferenceEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'first-try' | 'after-hint' | 'after-retry' | 'after-reveal';
  readonly attempt: number;
  readonly usedHint: boolean;
  readonly usedReveal: boolean;
  readonly summaryJa: string;
}

const retrieval = referenceData.retrieval;
const tokenById = new Map(retrieval.tokens.map((token) => [token.id, token]));

export const V2_REFERENCE_EVIDENCE_STORAGE_KEY =
  'chabiko.v2-reference.evidence.v1';

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function createV2RetrievalSession(): V2RetrievalSession {
  return {
    status: 'retrieval',
    availableTokenIds: [...retrieval.initialOrder],
    selectedTokenIds: [],
    attempt: 1,
    usedHint: false,
    usedReveal: false,
  };
}

export function selectV2RetrievalToken(
  session: V2RetrievalSession,
  tokenId: string,
): V2RetrievalSession {
  if (session.status !== 'retrieval' || !session.availableTokenIds.includes(tokenId)) {
    return session;
  }

  return {
    ...session,
    availableTokenIds: session.availableTokenIds.filter((id) => id !== tokenId),
    selectedTokenIds: [...session.selectedTokenIds, tokenId],
  };
}

export function removeV2RetrievalToken(
  session: V2RetrievalSession,
  tokenId: string,
): V2RetrievalSession {
  if (session.status !== 'retrieval' || !session.selectedTokenIds.includes(tokenId)) {
    return session;
  }

  return {
    ...session,
    availableTokenIds: [...session.availableTokenIds, tokenId],
    selectedTokenIds: session.selectedTokenIds.filter((id) => id !== tokenId),
  };
}

export function submitV2Retrieval(
  session: V2RetrievalSession,
): V2RetrievalSession {
  if (
    session.status !== 'retrieval' ||
    session.selectedTokenIds.length !== retrieval.correctOrder.length
  ) {
    return session;
  }

  if (sameOrder(session.selectedTokenIds, retrieval.correctOrder)) {
    return {
      ...session,
      status: 'correct',
      feedbackJa: retrieval.correctJa,
    };
  }

  return {
    ...session,
    status: 'incorrect',
    feedbackJa: retrieval.incorrectJa,
  };
}

export function requestV2RetrievalHint(
  session: V2RetrievalSession,
): V2RetrievalSession {
  if (session.status === 'correct' || session.status === 'revealed') return session;

  return {
    ...session,
    status: 'hint',
    usedHint: true,
    hintJa: retrieval.hintJa,
  };
}

export function revealV2RetrievalAnswer(
  session: V2RetrievalSession,
): V2RetrievalSession {
  if (session.status === 'correct' || session.status === 'revealed') return session;

  return {
    ...session,
    status: 'revealed',
    usedReveal: true,
    revealedAnswer: retrieval.correctOrder
      .map((id) => tokenById.get(id)?.text ?? '')
      .join(''),
    repairChunks: retrieval.correctOrder.map((id) => {
      const token = tokenById.get(id);
      if (!token) throw new Error(`Unknown V2 reference token '${id}'`);
      return { text: token.text, meaningJa: token.meaningJa };
    }),
  };
}

export function retryV2Retrieval(
  session: V2RetrievalSession,
): V2RetrievalSession {
  if (session.status === 'correct') return session;

  return {
    status: 'retrieval',
    availableTokenIds: [...retrieval.initialOrder],
    selectedTokenIds: [],
    attempt: session.attempt + 1,
    usedHint: session.usedHint,
    usedReveal: session.usedReveal,
  };
}

export function buildV2ReferenceEvidence(
  session: V2RetrievalSession,
): V2ReferenceEvidence {
  if (session.status !== 'correct') {
    throw new Error('V2 reference evidence requires a correct retrieval state');
  }

  if (session.usedReveal) {
    return {
      schemaVersion: 1,
      kind: 'after-reveal',
      attempt: session.attempt,
      usedHint: session.usedHint,
      usedReveal: true,
      summaryJa: '答えを確認したあと、もう一度自分で語順を組み立てられました。',
    };
  }

  if (session.usedHint) {
    return {
      schemaVersion: 1,
      kind: 'after-hint',
      attempt: session.attempt,
      usedHint: true,
      usedReveal: false,
      summaryJa: 'ヒントを使って、語順を自分で組み立てられました。',
    };
  }

  if (session.attempt > 1) {
    return {
      schemaVersion: 1,
      kind: 'after-retry',
      attempt: session.attempt,
      usedHint: false,
      usedReveal: false,
      summaryJa: 'もう一度試して、答えを見ずに語順を組み立てられました。',
    };
  }

  return {
    schemaVersion: 1,
    kind: 'first-try',
    attempt: 1,
    usedHint: false,
    usedReveal: false,
    summaryJa: '答えを見ずに、最初の一回で語順を組み立てられました。',
  };
}
