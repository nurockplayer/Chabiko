import {
  createV2ReferenceFlowState,
  reduceV2ReferenceFlow,
  sequenceSignature,
  type V2ReferenceFlowState,
} from '../domain/v2ReferenceFlow';
import type {
  V2ReferenceAnswerPayload,
  V2ReferenceBootstrap,
} from '../content/v2Reference';

export interface V2ReferenceFlowDependencies {
  speak?: (phrase: string, lang: string) => Promise<boolean>;
  fetchAnswer?: (source: string) => Promise<unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderScene(
  scene: V2ReferenceBootstrap['today']['scene'],
  variant: 'hero' | 'learning',
): string {
  return `
    <figure class="v2-scene v2-scene--${variant}">
      <img
        src="${escapeHtml(scene.src)}"
        width="${scene.width}"
        height="${scene.height}"
        alt="${escapeHtml(scene.altJa)}"
        decoding="async"
        ${variant === 'hero' ? 'fetchpriority="high"' : ''}
      />
      <figcaption>${escapeHtml(scene.locationJa)}</figcaption>
    </figure>
  `;
}

function renderBrandBar(contextJa: string): string {
  return `
    <header class="v2-brand-bar">
      <span class="v2-wordmark" aria-label="Chabiko">chabiko</span>
      <span class="v2-brand-context">${escapeHtml(contextJa)}</span>
    </header>
  `;
}

function renderFocusedBar(labelJa: string): string {
  return `
    <header class="v2-focused-bar">
      <span class="v2-focused-mark" aria-hidden="true"></span>
      <span>${escapeHtml(labelJa)}</span>
    </header>
  `;
}

function renderGlobalNavigation(
  current: 'today' | 'record',
  recordAvailable: boolean,
): string {
  return `
    <nav class="v2-bottom-nav" aria-label="メインナビゲーション">
      <button
        class="v2-nav-item"
        type="button"
        ${current === 'today' ? 'aria-current="page" disabled' : 'data-action="restart"'}
      >
        <span class="v2-nav-shape v2-nav-shape--today" aria-hidden="true"></span>
        <span>今日</span>
      </button>
      <button class="v2-nav-item" type="button" data-action="start-learning">
        <span class="v2-nav-shape v2-nav-shape--learn" aria-hidden="true"></span>
        <span>学ぶ</span>
      </button>
      <button
        class="v2-nav-item"
        type="button"
        ${current === 'record' ? 'aria-current="page" disabled' : ''}
        ${!recordAvailable ? 'disabled aria-disabled="true"' : ''}
      >
        <span class="v2-nav-shape v2-nav-shape--record" aria-hidden="true"></span>
        <span>記録</span>
      </button>
    </nav>
  `;
}

function renderToday(bootstrap: V2ReferenceBootstrap): string {
  return `
    <div class="v2-screen v2-screen--today">
      ${renderBrandBar('きょうの中国語')}
      <div class="v2-screen-scroll v2-screen-scroll--with-nav">
        ${renderScene(bootstrap.today.scene, 'hero')}
        <section class="v2-today-content" aria-labelledby="v2-today-title">
          <p class="v2-context-line">${escapeHtml(bootstrap.today.contextJa)}</p>
          <h1 id="v2-today-title" data-screen-heading tabindex="-1">${escapeHtml(bootstrap.today.titleJa)}</h1>
          <div class="v2-phrase-moment">
            <p class="v2-phrase" lang="zh-Hant">${escapeHtml(bootstrap.today.phrase)}</p>
            <p class="v2-pinyin" lang="zh-Latn">${escapeHtml(bootstrap.today.pinyin)}</p>
            <p class="v2-meaning">${escapeHtml(bootstrap.today.meaningJa)}</p>
          </div>
          <button class="v2-primary-button" type="button" data-action="start-learning">
            <span>${escapeHtml(bootstrap.today.primaryActionJa)}</span>
            <span class="v2-button-arrow" aria-hidden="true">→</span>
          </button>
        </section>
      </div>
      ${renderGlobalNavigation('today', false)}
    </div>
  `;
}

function renderLearning(bootstrap: V2ReferenceBootstrap): string {
  const chunkRows = bootstrap.learning.lessonChunks
    .map(
      (chunk) => `
        <div class="v2-support-row">
          <dt lang="zh-Hant">${escapeHtml(chunk.chunk)}</dt>
          <dd>${escapeHtml(chunk.meaning)}</dd>
        </div>
      `,
    )
    .join('');
  const soundRows = bootstrap.learning.soundFocus
    .map(
      (focus) => `
        <p><strong>${escapeHtml(focus.item)}</strong>${escapeHtml(focus.noteJa)}</p>
      `,
    )
    .join('');

  return `
    <div class="v2-screen v2-screen--learning">
      ${renderFocusedBar('台湾・夜市')}
      <div class="v2-screen-scroll v2-screen-scroll--with-command">
        ${renderScene(bootstrap.learning.scene, 'learning')}
        <section class="v2-learning-content" aria-labelledby="v2-learning-title">
          <p class="v2-context-line">指をさして、短く伝える</p>
          <h1 id="v2-learning-title" data-screen-heading tabindex="-1" class="v2-learning-phrase" lang="zh-Hant">${escapeHtml(bootstrap.learning.phrase)}</h1>
          <p class="v2-pinyin v2-pinyin--learning" lang="zh-Latn">${escapeHtml(bootstrap.learning.pinyin)}</p>
          <div class="v2-audio-row">
            <button class="v2-audio-button" type="button" data-action="play-audio">
              <span class="v2-wave" aria-hidden="true"><i></i><i></i><i></i></span>
              <span>${escapeHtml(bootstrap.learning.audio.labelJa)}</span>
            </button>
            <p class="v2-audio-status" data-audio-status role="status" aria-live="polite"></p>
          </div>
          <details class="v2-support-disclosure">
            <summary>意味を確認</summary>
            <div class="v2-support-body">
              <p class="v2-support-meaning">${escapeHtml(bootstrap.learning.meaningJa)}</p>
              <p>${escapeHtml(bootstrap.learning.canDoJa)}</p>
            </div>
          </details>
          <details class="v2-support-disclosure">
            <summary>ことばと音を分ける</summary>
            <div class="v2-support-body">
              <dl class="v2-support-list">${chunkRows}</dl>
              <div class="v2-sound-note">${soundRows}</div>
            </div>
          </details>
        </section>
      </div>
      <div class="v2-command-area">
        <button class="v2-primary-button" type="button" data-action="start-retrieval">
          <span>覚えた。ためす</span>
          <span class="v2-button-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  `;
}

function renderSelectedSlots(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
): string {
  const chunkById = new Map(bootstrap.retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  const slots = Array.from({ length: bootstrap.retrieval.chunks.length }, (_, index) => {
    const chunkId = state.selectedChunkIds[index];
    const chunk = chunkId ? chunkById.get(chunkId) : undefined;
    if (!chunk) {
      return `<span class="v2-answer-slot" aria-hidden="true"></span>`;
    }
    return `
      <button
        class="v2-selected-chunk"
        type="button"
        data-selected-chunk-id="${escapeHtml(chunk.id)}"
        aria-label="${escapeHtml(chunk.text)}を外す"
      >${escapeHtml(chunk.text)}</button>
    `;
  });
  return slots.join('');
}

function renderAvailableChunks(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
): string {
  return bootstrap.retrieval.chunks
    .filter((chunk) => !state.selectedChunkIds.includes(chunk.id))
    .map(
      (chunk) => `
        <button
          class="v2-chunk-button"
          type="button"
          data-chunk-id="${escapeHtml(chunk.id)}"
        >${escapeHtml(chunk.text)}</button>
      `,
    )
    .join('');
}

function renderRetrieval(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
): string {
  const ready = state.selectedChunkIds.length === bootstrap.retrieval.chunks.length;
  return `
    <div class="v2-screen v2-screen--retrieval">
      ${renderFocusedBar('思い出す')}
      <div class="v2-screen-scroll v2-screen-scroll--with-command">
        <section class="v2-retrieval-content" aria-labelledby="v2-retrieval-title">
          <div class="v2-situation-cue">
            <img
              src="${escapeHtml(bootstrap.learning.scene.src)}"
              width="${bootstrap.learning.scene.width}"
              height="${bootstrap.learning.scene.height}"
              alt=""
            />
            <p>${escapeHtml(bootstrap.retrieval.contextJa)}</p>
          </div>
          <h1 id="v2-retrieval-title" data-screen-heading tabindex="-1">${escapeHtml(bootstrap.retrieval.promptJa)}</h1>
          <div class="v2-answer-builder" role="group" aria-label="組み立てた中国語">
            ${renderSelectedSlots(bootstrap, state)}
          </div>
          <p class="v2-builder-help">選んだことばは、もう一度押すと外せます。</p>
          <div class="v2-chunk-bank" role="group" aria-label="使えることば">
            ${renderAvailableChunks(bootstrap, state)}
          </div>
          <p class="v2-retrieval-status" role="status" aria-live="polite">
            ${ready ? '順番を決めたら、下のボタンで伝えてみよう。' : 'ことばを順番に選んでください。'}
          </p>
        </section>
      </div>
      <div class="v2-command-area">
        <button
          class="v2-primary-button"
          type="button"
          data-action="submit-retrieval"
          ${ready ? '' : 'disabled'}
        >
          <span>これで伝える</span>
          <span class="v2-button-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  `;
}

function renderSubmittedAttempt(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
): string {
  const chunkById = new Map(bootstrap.retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  return state.submittedChunkIds
    .map((chunkId) => chunkById.get(chunkId)?.text ?? '')
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join('');
}

function renderRepair(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
  answer: V2ReferenceAnswerPayload | null,
  revealLoading: boolean,
  revealError: string | null,
): string {
  const support = state.repairSupport;
  const answerMarkup = support === 'answer' && answer
    ? `
      <div class="v2-reveal-card" data-reveal-answer tabindex="-1">
        <p class="v2-reveal-label">答えを確認</p>
        <p class="v2-reveal-phrase" lang="zh-Hant">${escapeHtml(answer.phrase)}</p>
        <p class="v2-pinyin" lang="zh-Latn">${escapeHtml(answer.pinyin)}</p>
        <p class="v2-meaning">${escapeHtml(answer.meaningJa)}</p>
      </div>
    `
    : '';
  const hintMarkup = support === 'hint'
    ? `
      <div class="v2-hint" data-repair-focus tabindex="-1" role="status">
        <span>ヒント</span>
        <p>${escapeHtml(bootstrap.retrieval.hintJa)}</p>
      </div>
      ${revealError ? `<p class="v2-inline-error" role="alert" tabindex="-1">${escapeHtml(revealError)}</p>` : ''}
    `
    : '';

  let command = `
    <button class="v2-support-button" type="button" data-action="show-hint">
      ヒントを見る
    </button>
  `;
  if (support === 'hint') {
    command = `
      <button class="v2-primary-button" type="button" data-action="reveal-answer" ${revealLoading ? 'disabled aria-busy="true"' : ''}>
        <span>${revealLoading ? '読み込み中' : '答えを見る'}</span>
        <span class="v2-button-arrow" aria-hidden="true">→</span>
      </button>
    `;
  } else if (support === 'answer') {
    command = `
      <button class="v2-primary-button" type="button" data-action="retry">
        <span>もう一度、自分で作る</span>
        <span class="v2-button-arrow" aria-hidden="true">↻</span>
      </button>
    `;
  }

  return `
    <div class="v2-screen v2-screen--repair">
      ${renderFocusedBar('組み直す')}
      <div class="v2-screen-scroll v2-screen-scroll--with-command">
        <section class="v2-repair-content" aria-labelledby="v2-repair-title">
          <p class="v2-repair-context">いま作った順番</p>
          <div class="v2-submitted-attempt" role="group" aria-label="選んだ順番">
            ${renderSubmittedAttempt(bootstrap, state)}
          </div>
          <div class="v2-repair-message" role="status">
            <span class="v2-repair-mark" aria-hidden="true">!</span>
            <div>
              <h1 id="v2-repair-title" data-screen-heading tabindex="-1">まだ伝わりにくい順番です。</h1>
              <p>少しずつ支えを増やして、もう一度作ってみよう。</p>
            </div>
          </div>
          ${hintMarkup}
          ${answerMarkup}
        </section>
      </div>
      <div class="v2-command-area">${command}</div>
    </div>
  `;
}

function renderCorrect(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
): string {
  const chunkById = new Map(bootstrap.retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  const phrase = state.submittedChunkIds
    .map((chunkId) => chunkById.get(chunkId)?.text ?? '')
    .join('');
  return `
    <div class="v2-screen v2-screen--correct">
      ${renderFocusedBar('思い出す')}
      <div class="v2-screen-scroll v2-screen-scroll--with-command">
        <section class="v2-correct-content" aria-labelledby="v2-correct-title">
          <div class="v2-correct-mark" aria-hidden="true"><span></span></div>
          <p class="v2-correct-context">夜市で指をさして</p>
          <p class="v2-correct-phrase" lang="zh-Hant">${escapeHtml(phrase)}</p>
          <h1 id="v2-correct-title" data-screen-heading tabindex="-1">通じる順番になりました。</h1>
          <p>このひと言を、自分で組み立てられました。</p>
        </section>
      </div>
      <div class="v2-command-area">
        <button class="v2-primary-button" type="button" data-action="view-result">
          <span>できたことを見る</span>
          <span class="v2-button-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  `;
}

function buildEvidence(state: V2ReferenceFlowState, phrase: string): string[] {
  const evidence = [`「${phrase}」を正しい順番で組み立てた`];
  if (state.answerRevealed) {
    evidence.push('答えを確認したあと、正しい順番に組み立て直した');
  } else if (state.hintUsed) {
    evidence.push('ヒントを使って、自分で正しい順番まで直した');
  } else if (state.retrievalAttempts === 1) {
    evidence.push('ヒントなしで、最初の一回で思い出した');
  } else {
    evidence.push('間違えた順番を見直して、自分で直した');
  }
  if (state.audioPlayed) {
    evidence.push('音声を聞いて、場面と表現を結びつけた');
  }
  return evidence;
}

function renderResult(
  bootstrap: V2ReferenceBootstrap,
  state: V2ReferenceFlowState,
): string {
  const evidence = buildEvidence(state, bootstrap.result.phrase)
    .map(
      (item) => `
        <li>
          <span class="v2-evidence-check" aria-hidden="true"></span>
          <span>${escapeHtml(item)}</span>
        </li>
      `,
    )
    .join('');
  return `
    <div class="v2-screen v2-screen--result">
      ${renderBrandBar('きょうの記録')}
      <div class="v2-screen-scroll v2-screen-scroll--with-nav">
        <section class="v2-result-content" aria-labelledby="v2-result-title">
          <div class="v2-result-scene">
            <img
              src="${escapeHtml(bootstrap.learning.scene.src)}"
              width="${bootstrap.learning.scene.width}"
              height="${bootstrap.learning.scene.height}"
              alt=""
            />
            <span aria-hidden="true"></span>
          </div>
          <h1 id="v2-result-title" data-screen-heading tabindex="-1">${escapeHtml(bootstrap.result.headingJa)}</h1>
          <p class="v2-result-can-do">${escapeHtml(bootstrap.result.canDoJa)}</p>
          <div class="v2-result-phrase">
            <p lang="zh-Hant">${escapeHtml(bootstrap.result.phrase)}</p>
            <span lang="zh-Latn">${escapeHtml(bootstrap.result.pinyin)}</span>
            <strong>${escapeHtml(bootstrap.result.meaningJa)}</strong>
          </div>
          <h2>今日の学習で確かめたこと</h2>
          <ul class="v2-evidence-list">${evidence}</ul>
          <button class="v2-secondary-button" type="button" data-action="start-learning">
            この場面をもう一度
          </button>
        </section>
      </div>
      ${renderGlobalNavigation('record', true)}
    </div>
  `;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAnswerPayload(
  value: unknown,
  bootstrap: V2ReferenceBootstrap,
): V2ReferenceAnswerPayload | null {
  if (!isRecord(value) || value.version !== 1 || value.lessonId !== bootstrap.lessonId) {
    return null;
  }
  if (
    !Array.isArray(value.chunks) ||
    typeof value.phrase !== 'string' ||
    value.phrase.length === 0 ||
    typeof value.pinyin !== 'string' ||
    value.pinyin.length === 0 ||
    typeof value.meaningJa !== 'string' ||
    value.meaningJa.length === 0
  ) {
    return null;
  }
  const chunks: Array<{ id: string; text: string }> = [];
  for (const rawChunk of value.chunks) {
    if (
      !isRecord(rawChunk) ||
      typeof rawChunk.id !== 'string' ||
      rawChunk.id.length === 0 ||
      typeof rawChunk.text !== 'string' ||
      rawChunk.text.length === 0
    ) {
      return null;
    }
    chunks.push({ id: rawChunk.id, text: rawChunk.text });
  }
  const canonicalChunkTextById = new Map(
    bootstrap.retrieval.chunks.map((chunk) => [chunk.id, chunk.text]),
  );
  if (
    chunks.length !== bootstrap.retrieval.chunks.length ||
    new Set(chunks.map((chunk) => chunk.id)).size !== chunks.length ||
    sequenceSignature(chunks.map((chunk) => chunk.id)) !== bootstrap.retrieval.answerSignature ||
    chunks.some((chunk) => canonicalChunkTextById.get(chunk.id) !== chunk.text) ||
    chunks.map((chunk) => chunk.text).join('') !== value.phrase ||
    value.phrase !== bootstrap.learning.phrase ||
    value.pinyin !== bootstrap.learning.pinyin ||
    value.meaningJa !== bootstrap.learning.meaningJa
  ) {
    return null;
  }
  return {
    version: 1,
    lessonId: value.lessonId as string,
    chunks,
    phrase: value.phrase,
    pinyin: value.pinyin,
    meaningJa: value.meaningJa,
  };
}

async function speakWithDeviceVoice(phrase: string, lang: string): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    typeof SpeechSynthesisUtterance === 'undefined'
  ) {
    return false;
  }

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = lang;
    utterance.rate = 0.82;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

async function fetchSameOriginAnswer(source: string): Promise<unknown> {
  const url = new URL(source, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error('V2 reference answer source must be same-origin');
  }
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`V2 reference answer request failed: ${response.status}`);
  return response.json();
}

export function mountV2ReferenceFlow(
  root: HTMLElement,
  bootstrap: V2ReferenceBootstrap,
  dependencies: V2ReferenceFlowDependencies = {},
): void {
  const config = {
    availableChunkIds: bootstrap.retrieval.chunks.map((chunk) => chunk.id),
    answerSignature: bootstrap.retrieval.answerSignature,
  };
  const speak = dependencies.speak ?? speakWithDeviceVoice;
  const fetchAnswer = dependencies.fetchAnswer ?? fetchSameOriginAnswer;
  let state = createV2ReferenceFlowState();
  let answer: V2ReferenceAnswerPayload | null = null;
  let revealLoading = false;
  let revealError: string | null = null;

  function render(focusSelector?: string): void {
    root.dataset.v2Stage = state.stage;
    switch (state.stage) {
      case 'today':
        root.innerHTML = renderToday(bootstrap);
        break;
      case 'learning':
        root.innerHTML = renderLearning(bootstrap);
        break;
      case 'retrieval':
        root.innerHTML = renderRetrieval(bootstrap, state);
        break;
      case 'repair':
        root.innerHTML = renderRepair(
          bootstrap,
          state,
          answer,
          revealLoading,
          revealError,
        );
        break;
      case 'correct':
        root.innerHTML = renderCorrect(bootstrap, state);
        break;
      case 'result':
        root.innerHTML = renderResult(bootstrap, state);
        break;
    }
    if (focusSelector) {
      root.querySelector<HTMLElement>(focusSelector)?.focus();
    }
  }

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled || !root.contains(button)) return;

    const action = button.dataset.action;
    const chunkId = button.dataset.chunkId;
    const selectedChunkId = button.dataset.selectedChunkId;

    if (chunkId) {
      state = reduceV2ReferenceFlow(state, { type: 'select-chunk', chunkId }, config);
      render(`[data-selected-chunk-id="${CSS.escape(chunkId)}"]`);
      return;
    }
    if (selectedChunkId) {
      state = reduceV2ReferenceFlow(
        state,
        { type: 'remove-chunk', chunkId: selectedChunkId },
        config,
      );
      render(`[data-chunk-id="${CSS.escape(selectedChunkId)}"]`);
      return;
    }

    switch (action) {
      case 'start-learning':
        state = reduceV2ReferenceFlow(state, { type: 'start-learning' }, config);
        answer = null;
        revealError = null;
        render('[data-screen-heading]');
        break;

      case 'play-audio': {
        const status = root.querySelector<HTMLElement>('[data-audio-status]');
        if (status) status.textContent = '再生中です。';
        const played = await speak(bootstrap.learning.phrase, bootstrap.learning.audio.lang);
        if (played) {
          state = reduceV2ReferenceFlow(state, { type: 'audio-played' }, config);
        }
        const currentStatus = root.querySelector<HTMLElement>('[data-audio-status]');
        if (currentStatus) {
          currentStatus.textContent = played
            ? '音声を再生しました。'
            : bootstrap.learning.audio.unavailableJa;
        }
        break;
      }

      case 'start-retrieval':
        state = reduceV2ReferenceFlow(state, { type: 'start-retrieval' }, config);
        render('[data-screen-heading]');
        break;

      case 'submit-retrieval':
        state = reduceV2ReferenceFlow(state, { type: 'submit-retrieval' }, config);
        render('[data-screen-heading]');
        break;

      case 'show-hint':
        state = reduceV2ReferenceFlow(state, { type: 'show-hint' }, config);
        render('[data-repair-focus]');
        break;

      case 'reveal-answer':
        if (revealLoading || state.stage !== 'repair' || state.repairSupport !== 'hint') {
          return;
        }
        revealLoading = true;
        revealError = null;
        render();
        try {
          const payload = validateAnswerPayload(
            await fetchAnswer(bootstrap.retrieval.answerSource),
            bootstrap,
          );
          if (!payload) throw new Error('Invalid V2 reference answer payload');
          answer = payload;
          state = reduceV2ReferenceFlow(state, { type: 'reveal-answer' }, config);
          revealLoading = false;
          render('[data-reveal-answer]');
        } catch {
          revealLoading = false;
          revealError = '答えを読み込めませんでした。もう一度お試しください。';
          render('[role="alert"]');
        }
        break;

      case 'retry':
        state = reduceV2ReferenceFlow(state, { type: 'retry' }, config);
        answer = null;
        revealError = null;
        render('[data-screen-heading]');
        break;

      case 'view-result':
        state = reduceV2ReferenceFlow(state, { type: 'view-result' }, config);
        render('[data-screen-heading]');
        break;

      case 'restart':
        state = reduceV2ReferenceFlow(state, { type: 'restart' }, config);
        answer = null;
        revealError = null;
        render('[data-screen-heading]');
        break;
    }
  });

  render();
}
