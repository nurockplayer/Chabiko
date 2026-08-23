import {
  V2_REFERENCE_EVIDENCE_STORAGE_KEY,
  buildV2ReferenceEvidence,
  createV2RetrievalSession,
  removeV2RetrievalToken,
  requestV2RetrievalHint,
  retryV2Retrieval,
  revealV2RetrievalAnswer,
  selectV2RetrievalToken,
  submitV2Retrieval,
} from '../domain/v2ReferenceFlow';

interface SafeRetrievalPayload {
  readonly promptJa: string;
  readonly tokens: readonly { readonly id: string; readonly text: string }[];
}

type FocusTarget =
  | {
      readonly kind: 'token';
      readonly tokenId: string;
      readonly location: 'answer' | 'pool';
    }
  | { readonly kind: 'command' };

function parsePayload(root: HTMLElement): SafeRetrievalPayload {
  const payloadElement = root.querySelector<HTMLScriptElement>(
    '[data-v2-retrieval-payload]',
  );
  if (!payloadElement?.textContent) {
    throw new Error('V2 retrieval payload is missing');
  }

  const payload = JSON.parse(payloadElement.textContent) as SafeRetrievalPayload;
  if (
    typeof payload?.promptJa !== 'string' ||
    !Array.isArray(payload.tokens) ||
    payload.tokens.length !== 3 ||
    payload.tokens.some(
      (token) =>
        typeof token?.id !== 'string' || typeof token?.text !== 'string',
    )
  ) {
    throw new Error('V2 retrieval payload is invalid');
  }
  return payload;
}

function makeButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function mountV2ReferenceRetrieval(root: HTMLElement): void {
  if (root.dataset.v2RetrievalMounted === 'true') return;
  root.dataset.v2RetrievalMounted = 'true';

  const payload = parsePayload(root);
  const tokenById = new Map(payload.tokens.map((token) => [token.id, token]));
  const answer = root.querySelector<HTMLElement>('[data-v2-answer]');
  const pool = root.querySelector<HTMLElement>('[data-v2-token-pool]');
  const feedback = root.querySelector<HTMLElement>('[data-v2-feedback]');
  const command = root.querySelector<HTMLElement>('[data-v2-command]');
  const attempt = root.querySelector<HTMLElement>('[data-v2-attempt]');
  if (!answer || !pool || !feedback || !command || !attempt) {
    throw new Error('V2 retrieval mount points are incomplete');
  }
  const answerRoot = answer;
  const poolRoot = pool;
  const feedbackRoot = feedback;
  const commandRoot = command;
  const attemptRoot = attempt;

  let session = createV2RetrievalSession();

  function renderToken(
    tokenId: string,
    location: 'answer' | 'pool',
  ): HTMLElement {
    const token = tokenById.get(tokenId);
    if (!token) throw new Error(`Unknown V2 reference token '${tokenId}'`);

    if (session.status !== 'retrieval') {
      const staticToken = document.createElement('span');
      staticToken.className =
        `v2-token v2-token--${location} v2-token--static`;
      staticToken.lang = 'zh-Hant';
      staticToken.textContent = token.text;
      staticToken.dataset.v2TokenId = tokenId;
      staticToken.dataset.v2TokenLocation = location;
      return staticToken;
    }

    const button = makeButton(
      token.text,
      `v2-token v2-token--${location}`,
      () => {
        session =
          location === 'pool'
            ? selectV2RetrievalToken(session, tokenId)
            : removeV2RetrievalToken(session, tokenId);
        if (location === 'answer') {
          render({ kind: 'token', tokenId, location: 'pool' });
          return;
        }

        const nextTokenId = session.availableTokenIds[0];
        render(
          nextTokenId
            ? { kind: 'token', tokenId: nextTokenId, location: 'pool' }
            : { kind: 'command' },
        );
      },
    );
    button.lang = 'zh-Hant';
    button.setAttribute(
      'aria-label',
      `${token.text}${location === 'pool' ? 'を選ぶ' : 'を戻す'}`,
    );
    button.dataset.v2TokenId = tokenId;
    button.dataset.v2TokenLocation = location;
    return button;
  }

  function renderFeedback(): void {
    feedbackRoot.replaceChildren();
    feedbackRoot.className = 'v2-retrieval-feedback';

    if (session.status === 'retrieval') return;

    if (session.status === 'incorrect') {
      feedbackRoot.classList.add('v2-retrieval-feedback--error');
      const heading = document.createElement('strong');
      heading.textContent = 'あと一歩です';
      const copy = document.createElement('p');
      copy.textContent = session.feedbackJa;
      feedbackRoot.append(heading, copy);
      return;
    }

    if (session.status === 'hint') {
      feedbackRoot.classList.add('v2-retrieval-feedback--hint');
      const heading = document.createElement('strong');
      heading.textContent = '語順の手がかり';
      const copy = document.createElement('p');
      copy.textContent = session.hintJa;
      feedbackRoot.append(heading, copy);
      return;
    }

    if (session.status === 'revealed') {
      feedbackRoot.classList.add('v2-retrieval-feedback--repair');
      const heading = document.createElement('p');
      heading.className = 'v2-repair-label';
      heading.textContent = '答えを確認して、つながりを直す';
      const revealedAnswer = document.createElement('strong');
      revealedAnswer.className = 'v2-revealed-answer';
      revealedAnswer.dataset.v2RevealedAnswer = '';
      revealedAnswer.lang = 'zh-Hant';
      revealedAnswer.textContent = session.revealedAnswer;
      const chunks = document.createElement('div');
      chunks.className = 'v2-repair-chunks';
      for (const chunk of session.repairChunks) {
        const item = document.createElement('div');
        const chinese = document.createElement('span');
        chinese.lang = 'zh-Hant';
        chinese.textContent = chunk.text;
        const meaning = document.createElement('small');
        meaning.textContent = chunk.meaningJa;
        item.append(chinese, meaning);
        chunks.append(item);
      }
      feedbackRoot.append(heading, revealedAnswer, chunks);
      return;
    }

    feedbackRoot.classList.add('v2-retrieval-feedback--success');
    const heading = document.createElement('strong');
    heading.textContent = '自分で作れました';
    const copy = document.createElement('p');
    copy.textContent = session.feedbackJa;
    feedbackRoot.append(heading, copy);
  }

  function renderCommand(): void {
    commandRoot.replaceChildren();
    commandRoot.className = 'v2-fixed-command';

    if (session.status === 'retrieval') {
      const submit = makeButton(
        'この語順で確認する',
        'v2-command-primary',
        () => {
          session = submitV2Retrieval(session);
          if (session.status === 'correct') {
            try {
              sessionStorage.setItem(
                V2_REFERENCE_EVIDENCE_STORAGE_KEY,
                JSON.stringify(buildV2ReferenceEvidence(session)),
              );
            } catch {
              // The result route fails honestly to its empty evidence state.
            }
          }
          render({ kind: 'command' });
        },
      );
      submit.disabled = session.selectedTokenIds.length !== payload.tokens.length;
      commandRoot.append(submit);
      return;
    }

    if (session.status === 'incorrect' || session.status === 'hint') {
      commandRoot.classList.add('v2-fixed-command--split');
      const hintOrRetry = makeButton(
        session.status === 'incorrect' ? 'ヒントを見る' : 'もう一度試す',
        'v2-command-secondary',
        () => {
          const wasHint = session.status === 'hint';
          session =
            session.status === 'incorrect'
              ? requestV2RetrievalHint(session)
              : retryV2Retrieval(session);
          const firstTokenId = session.availableTokenIds[0];
          render(
            wasHint && firstTokenId
              ? { kind: 'token', tokenId: firstTokenId, location: 'pool' }
              : { kind: 'command' },
          );
        },
      );
      const reveal = makeButton(
        '答えを見て直す',
        'v2-command-primary',
        () => {
          session = revealV2RetrievalAnswer(session);
          render({ kind: 'command' });
        },
      );
      commandRoot.append(hintOrRetry, reveal);
      return;
    }

    if (session.status === 'revealed') {
      commandRoot.append(
        makeButton(
          'もう一度、自分で作る',
          'v2-command-primary',
          () => {
            session = retryV2Retrieval(session);
            const firstTokenId = session.availableTokenIds[0];
            render(
              firstTokenId
                ? { kind: 'token', tokenId: firstTokenId, location: 'pool' }
                : { kind: 'command' },
            );
          },
        ),
      );
      return;
    }

    const resultLink = document.createElement('a');
    resultLink.className = 'v2-command-primary';
    resultLink.href = '/v2-reference/result/';
    resultLink.textContent = '今日の結果を見る';
    commandRoot.append(resultLink);
  }

  function focusAfterRender(target?: FocusTarget): void {
    if (!target) return;
    if (target.kind === 'command') {
      commandRoot
        .querySelector<HTMLElement>('button:not(:disabled), a[href]')
        ?.focus({ preventScroll: true });
      return;
    }

    const tokenRoot = target.location === 'answer' ? answerRoot : poolRoot;
    const tokenButton = [...tokenRoot.querySelectorAll<HTMLButtonElement>(
      'button[data-v2-token-id][data-v2-token-location]',
    )].find(
      (button) =>
        button.dataset.v2TokenId === target.tokenId &&
        button.dataset.v2TokenLocation === target.location,
    );
    tokenButton?.focus({ preventScroll: true });
  }

  function render(focusTarget?: FocusTarget): void {
    attemptRoot.textContent = `${session.attempt}回目`;
    answerRoot.replaceChildren();
    poolRoot.replaceChildren();

    if (session.selectedTokenIds.length === 0) {
      const placeholder = document.createElement('p');
      placeholder.className = 'v2-answer-placeholder';
      placeholder.textContent = '下のことばを順にタップ';
      answerRoot.append(placeholder);
    } else {
      for (const tokenId of session.selectedTokenIds) {
        answerRoot.append(renderToken(tokenId, 'answer'));
      }
    }

    for (const tokenId of session.availableTokenIds) {
      poolRoot.append(renderToken(tokenId, 'pool'));
    }

    renderFeedback();
    renderCommand();
    focusAfterRender(focusTarget);
  }

  render();
}
