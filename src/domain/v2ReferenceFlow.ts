import referenceData from '../../data/v2-reference/reference.json' assert { type: 'json' };

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
  readonly referenceSchemaVersion: number;
  readonly sourceLessonId: string;
  readonly completedOn: string;
  readonly kind: 'first-try' | 'after-hint' | 'after-retry' | 'after-reveal';
  readonly attempt: number;
  readonly usedHint: boolean;
  readonly usedReveal: boolean;
}

const retrieval = referenceData.retrieval;
const tokenById = new Map(retrieval.tokens.map((token) => [token.id, token]));

export const V2_REFERENCE_EVIDENCE_STORAGE_KEY =
  'chabiko.v2-reference.evidence.v1';

const EVIDENCE_KEYS = [
  'attempt',
  'completedOn',
  'kind',
  'referenceSchemaVersion',
  'schemaVersion',
  'sourceLessonId',
  'usedHint',
  'usedReveal',
] as const;

function localDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('V2 reference evidence requires a valid completion date');
  }
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseV2ReferenceEvidence(
  value: unknown,
  today = new Date(),
): V2ReferenceEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<V2ReferenceEvidence>;
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== EVIDENCE_KEYS.length ||
    keys.some((key, index) => key !== EVIDENCE_KEYS[index])
  ) {
    return undefined;
  }

  if (
    candidate.schemaVersion !== 1 ||
    candidate.referenceSchemaVersion !== referenceData.schemaVersion ||
    candidate.sourceLessonId !== referenceData.sourceLessonId ||
    candidate.completedOn !== localDateKey(today) ||
    !Number.isInteger(candidate.attempt) ||
    (candidate.attempt ?? 0) < 1 ||
    typeof candidate.usedHint !== 'boolean' ||
    typeof candidate.usedReveal !== 'boolean'
  ) {
    return undefined;
  }

  const attempt = candidate.attempt as number;
  const validState =
    (candidate.kind === 'first-try' &&
      attempt === 1 &&
      candidate.usedHint === false &&
      candidate.usedReveal === false) ||
    (candidate.kind === 'after-retry' &&
      attempt >= 2 &&
      candidate.usedHint === false &&
      candidate.usedReveal === false) ||
    (candidate.kind === 'after-hint' &&
      attempt >= 2 &&
      candidate.usedHint === true &&
      candidate.usedReveal === false) ||
    (candidate.kind === 'after-reveal' &&
      attempt >= 2 &&
      candidate.usedReveal === true);

  return validState ? (candidate as V2ReferenceEvidence) : undefined;
}

export function summarizeV2ReferenceEvidence(
  evidence: V2ReferenceEvidence,
): string {
  switch (evidence.kind) {
    case 'first-try':
      return '答えを見ずに、最初の一回で語順を組み立てられました。';
    case 'after-retry':
      return 'もう一度試して、答えを見ずに語順を組み立てられました。';
    case 'after-hint':
      return 'ヒントを使って、語順を自分で組み立てられました。';
    case 'after-reveal':
      return '答えを確認したあと、もう一度自分で語順を組み立てられました。';
  }
}

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
  completedAt = new Date(),
): V2ReferenceEvidence {
  if (session.status !== 'correct') {
    throw new Error('V2 reference evidence requires a correct retrieval state');
  }

  const base = {
    schemaVersion: 1 as const,
    referenceSchemaVersion: referenceData.schemaVersion,
    sourceLessonId: referenceData.sourceLessonId,
    completedOn: localDateKey(completedAt),
    attempt: session.attempt,
  };
  const finalize = (evidence: V2ReferenceEvidence): V2ReferenceEvidence => {
    const validated = parseV2ReferenceEvidence(evidence, completedAt);
    if (!validated) {
      throw new Error('V2 reference evidence must be internally consistent');
    }
    return validated;
  };

  if (session.usedReveal) {
    return finalize({
      ...base,
      kind: 'after-reveal',
      usedHint: session.usedHint,
      usedReveal: true,
    });
  }

  if (session.usedHint) {
    return finalize({
      ...base,
      kind: 'after-hint',
      usedHint: true,
      usedReveal: false,
    });
  }

  if (session.attempt > 1) {
    return finalize({
      ...base,
      kind: 'after-retry',
      usedHint: false,
      usedReveal: false,
    });
  }

  return finalize({
    ...base,
    kind: 'first-try',
    usedHint: false,
    usedReveal: false,
  });
}
