// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountRemoteFlashcardSession } from '../src/client/flashcardSession';
import { GET as getHskAnswers } from '../src/pages/data/hsk/[level].json';
import { VocabularyProgressStore } from '../src/domain/vocabularyProgress';

const syntheticPublication = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../src/content/loadHskVocabulary', () => ({
  loadHskPublication: () => syntheticPublication.current,
}));

interface SyntheticEntry {
  id: string;
  simplified: string;
  simplifiedStatus: 'authored' | 'verified';
  pinyin: string;
  japanese: string;
  traditional?: string;
  traditionalStatus?: 'authored' | 'verified' | 'generated' | 'unavailable' | 'absent';
}

function createRouteFixture(entryOrEntries: SyntheticEntry | SyntheticEntry[], newWordIds: string[] = []) {
  // Synthetic status/form inputs exercise transport only. The production HSK
  // loader currently excludes Traditional fields and all real HSK routes stay unavailable.
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  syntheticPublication.current = {
    pools: [{
      level: 1,
      status: 'partial',
      fullRange: entries,
      newWords: entries.filter((entry) => newWordIds.includes(entry.id)),
      counts: { fullRange: entries.length, newWords: newWordIds.length, expectedFullRange: entries.length, expectedNewWords: Math.max(newWordIds.length, 1) },
      missingEvidence: [],
    }],
    sourceNotice: null,
  };
}

function createSessionRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flashcard-session-root';
  root.setAttribute('data-session', JSON.stringify({ ids: ['synthetic-session-entry'] }));
  root.innerHTML = `
    <div id="setup-panel">
      <fieldset>
        <label class="setup-option setup-option--active" for="pool-full">
          <input id="pool-full" type="radio" name="pool" value="full" data-pool="full" checked />HSK 1 全範囲
        </label>
        <label class="setup-option" for="pool-new">
          <input id="pool-new" type="radio" name="pool" value="new" data-pool="new" />HSK 1 新出単語
        </label>
      </fieldset>
      <p id="setup-count"></p>
      <button id="btn-start" type="button" disabled></button>
      <p id="session-load-error" role="status" hidden></p>
    </div>
    <div id="session-area" class="hidden">
      <span data-progress-text></span>
      <button id="btn-reset-progress" type="button" hidden></button>
      <div class="flashcard-container">
        <div class="flashcard-card">
          <p data-front></p>
          <p data-prompt-fallback hidden></p>
          <div data-back class="hidden">
            <p data-pinyin></p>
            <p data-japanese></p>
            <p data-answer-fallback hidden></p>
            <p data-progress-hint></p>
          </div>
        </div>
        <div class="flashcard-actions">
          <button id="btn-reveal" type="button"></button>
          <div id="rating-actions" class="hidden">
            <button id="btn-again" type="button"></button>
            <button id="btn-unsure" type="button"></button>
            <button id="btn-known" type="button"></button>
          </div>
        </div>
      </div>
    </div>
    <template id="completion-template"><div><button id="btn-restart" type="button"></button></div></template>
  `;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.scriptPreference;
});

describe('HSK answer transport and script selection', () => {
  it.each([
    { status: 'authored', traditional: '傳輸甲', expected: '傳輸甲', lang: 'zh-Hant', fallback: false },
    { status: 'verified', traditional: '傳輸乙', expected: '傳輸乙', lang: 'zh-Hant', fallback: false },
    { status: 'generated', traditional: '未審核字', expected: '简体', lang: 'zh-Hans', fallback: true },
    { status: 'unavailable', traditional: undefined, expected: '简体', lang: 'zh-Hans', fallback: true },
    { status: 'absent', traditional: undefined, expected: '简体', lang: 'zh-Hans', fallback: true },
    { status: undefined, traditional: '未標狀態', expected: '简体', lang: 'zh-Hans', fallback: true },
  ] as const)('serializes, parses, and renders $status Traditional status through the HSK endpoint', async ({ status, traditional, expected, lang, fallback }) => {
    const entry: SyntheticEntry = {
      id: `synthetic-${status ?? 'missing'}`,
      simplified: '简体',
      simplifiedStatus: 'verified',
      pinyin: 'jiǎntǐ',
      japanese: '合成テスト',
      ...(traditional === undefined ? {} : { traditional }),
      ...(status === undefined ? {} : { traditionalStatus: status }),
    };
    createRouteFixture(entry);

    const response = await getHskAnswers({ params: { level: '1' } } as never);
    const payload = await response.json() as {
      version: number;
      entries: Array<Record<string, unknown>>;
      notice: null;
    };
    expect(response.status).toBe(200);
    expect(payload.version).toBe(1);
    expect(payload.entries[0]).toMatchObject({
      id: entry.id,
      simplified: entry.simplified,
      simplifiedStatus: 'verified',
      traditionalStatus: status ?? 'unavailable',
    });
    expect(payload.entries[0]?.traditional).toBe(traditional);

    document.documentElement.dataset.scriptPreference = 'traditional';
    const root = createSessionRoot();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    })));

    const cleanup = await mountRemoteFlashcardSession({
      ids: [entry.id],
      newPoolIds: [],
      answerSource: '/data/hsk/1.json',
    });
    const start = root.querySelector('#btn-start') as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    start.click();

    const front = root.querySelector('[data-front]') as HTMLElement;
    const fallbackElement = root.querySelector('[data-prompt-fallback]') as HTMLElement;
    expect(front.textContent).toBe(expected);
    expect(front.lang).toBe(lang);
    expect(fallbackElement.hidden).toBe(!fallback);
    expect(fallbackElement.textContent).toBe(fallback
      ? 'この表記は未収録のため、コース標準を表示しています。'
      : '');
    cleanup();
  });

  it('preserves a native new-pool selection made while the answer response is pending', async () => {
    const entries: SyntheticEntry[] = [
      { id: 'synthetic-full-first', simplified: '全範囲先頭', simplifiedStatus: 'authored', pinyin: 'quán', japanese: '全範囲の先頭' },
      { id: 'synthetic-new-only', simplified: '新出単語先頭', simplifiedStatus: 'verified', pinyin: 'xīn', japanese: '新出単語の先頭' },
    ];
    createRouteFixture(entries, ['synthetic-new-only']);
    const response = await getHskAnswers({ params: { level: '1' } } as never);
    const body = await response.text();
    const root = createSessionRoot();

    let resolveResponse!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => pendingResponse));
    const pendingMount = mountRemoteFlashcardSession({
      ids: entries.map((entry) => entry.id),
      newPoolIds: ['synthetic-new-only'],
      answerSource: '/data/hsk/1.json',
    });

    const fullPool = root.querySelector('[data-pool="full"]') as HTMLInputElement;
    const newPool = root.querySelector('[data-pool="new"]') as HTMLInputElement;
    newPool.click();
    expect(newPool.checked).toBe(true);
    expect(fullPool.checked).toBe(false);
    expect((root.querySelector('#btn-start') as HTMLButtonElement).disabled).toBe(true);

    resolveResponse(new Response(body, { headers: { 'Content-Type': 'application/json' } }));
    const cleanup = await pendingMount;

    expect(newPool.checked).toBe(true);
    expect(fullPool.checked).toBe(false);
    expect(newPool.closest('label')?.classList.contains('setup-option--active')).toBe(true);
    expect(fullPool.closest('label')?.classList.contains('setup-option--active')).toBe(false);
    expect((root.querySelector('#setup-count') as HTMLElement).textContent)
      .toContain('利用可能な単語: 1語（セッション: 1語）');
    const start = root.querySelector('#btn-start') as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    start.click();
    expect((root.querySelector('[data-front]') as HTMLElement).textContent).toBe('新出単語先頭');
    expect((root.querySelector('[data-progress-text]') as HTMLElement).textContent).toBe('0 / 1');
    cleanup();
  });

  it('fails closed when endpoint IDs do not match the ordered bootstrap IDs', async () => {
    createRouteFixture({
      id: 'synthetic-route-id',
      simplified: '简体',
      simplifiedStatus: 'authored',
      pinyin: 'jiǎntǐ',
      japanese: '合成テスト',
    });
    const response = await getHskAnswers({ params: { level: '1' } } as never);
    const body = await response.text();
    createSessionRoot();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      headers: { 'Content-Type': 'application/json' },
    })));

    await mountRemoteFlashcardSession({
      ids: ['different-synthetic-id'],
      newPoolIds: [],
      answerSource: '/data/hsk/1.json',
    });

    expect((document.querySelector('#btn-start') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('#session-load-error')?.textContent).toContain('読み込めません');
  });

  it.each(['invalid payload', 'request failure'] as const)(
    'recovers the same root after an %s and mounts one usable session',
    async (failure) => {
      const entry: SyntheticEntry = {
        id: 'synthetic-recovery-entry',
        simplified: '回復成功',
        simplifiedStatus: 'verified',
        pinyin: 'huí fù chéng gōng',
        japanese: '復旧成功',
      };
      createRouteFixture(entry);
      const response = await getHskAnswers({ params: { level: '1' } } as never);
      const validBody = await response.text();
      const root = createSessionRoot();
      const bootstrap = {
        ids: [entry.id],
        newPoolIds: [],
        answerSource: '/data/hsk/1.json',
      };
      const fetchMock = vi.fn();
      if (failure === 'invalid payload') {
        fetchMock
          .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, entries: [] }), {
            headers: { 'Content-Type': 'application/json' },
          }))
          .mockResolvedValueOnce(new Response(validBody, {
            headers: { 'Content-Type': 'application/json' },
          }));
      } else {
        fetchMock
          .mockRejectedValueOnce(new Error('network unavailable'))
          .mockResolvedValueOnce(new Response(validBody, {
            headers: { 'Content-Type': 'application/json' },
          }));
      }
      vi.stubGlobal('fetch', fetchMock);

      await mountRemoteFlashcardSession(bootstrap);

      const start = root.querySelector('#btn-start') as HTMLButtonElement;
      const error = root.querySelector('#session-load-error') as HTMLElement;
      expect(start.disabled).toBe(true);
      expect(start.getAttribute('aria-busy')).toBeNull();
      expect(error.hidden).toBe(false);
      expect(error.textContent).toContain('読み込めません');

      const cleanup = await mountRemoteFlashcardSession(bootstrap);

      expect(document.querySelector('.flashcard-session-root')).toBe(root);
      expect(start.disabled).toBe(false);
      expect(start.getAttribute('aria-busy')).toBeNull();
      expect(error.hidden).toBe(true);
      expect(error.textContent).toBe('');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const applyRatingSpy = vi.spyOn(VocabularyProgressStore.prototype, 'applyRating');
      const setItemSpy = vi.spyOn(localStorage, 'setItem');
      start.click();
      expect((root.querySelector('[data-front]') as HTMLElement).textContent).toBe('回復成功');
      (root.querySelector('#btn-reveal') as HTMLButtonElement).click();
      expect((root.querySelector('[data-japanese]') as HTMLElement).textContent).toBe('復旧成功');
      (root.querySelector('#btn-known') as HTMLButtonElement).click();

      expect(applyRatingSpy).toHaveBeenCalledTimes(1);
      expect(root.querySelectorAll('#btn-restart')).toHaveLength(1);
      expect(setItemSpy.mock.calls.filter(([key]) => key === 'chabiko:hsk-vocabulary-progress:v1'))
        .toHaveLength(1);
      expect(localStorage.getItem('chabiko:hsk-vocabulary-progress:v1')).toContain(entry.id);
      cleanup();
    },
  );

  it.each(['invalid payload', 'request failure'] as const)(
    'restores Start focus after an active same-root remount recovers from an %s',
    async (failure) => {
      const entries: SyntheticEntry[] = [
        { id: 'synthetic-active-first', simplified: '復旧一語', simplifiedStatus: 'verified', pinyin: 'fù jiù yī', japanese: '復旧一語目' },
        { id: 'synthetic-active-second', simplified: '復旧二語', simplifiedStatus: 'authored', pinyin: 'fù jiù èr', japanese: '復旧二語目' },
      ];
      createRouteFixture(entries);
      const response = await getHskAnswers({ params: { level: '1' } } as never);
      const validBody = await response.text();
      const validResponse = () => new Response(validBody, {
        headers: { 'Content-Type': 'application/json' },
      });
      const root = createSessionRoot();
      const bootstrap = {
        ids: entries.map((entry) => entry.id),
        newPoolIds: [],
        answerSource: '/data/hsk/1.json',
      };
      const fetchMock = vi.fn();
      fetchMock.mockResolvedValueOnce(validResponse());
      if (failure === 'invalid payload') {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, entries: [] }), {
          headers: { 'Content-Type': 'application/json' },
        }));
      } else {
        fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
      }

      let resolveRetry!: (retryResponse: Response) => void;
      const pendingRetry = new Promise<Response>((resolve) => { resolveRetry = resolve; });
      fetchMock
        .mockImplementationOnce(() => pendingRetry)
        .mockImplementation(() => Promise.resolve(validResponse()));
      vi.stubGlobal('fetch', fetchMock);

      let cleanup = await mountRemoteFlashcardSession(bootstrap);
      const start = root.querySelector('#btn-start') as HTMLButtonElement;
      const again = root.querySelector('#btn-again') as HTMLButtonElement;
      const error = root.querySelector('#session-load-error') as HTMLElement;
      const sessionArea = root.querySelector('#session-area') as HTMLElement;
      const setupPanel = root.querySelector('#setup-panel') as HTMLElement;
      const applyRatingSpy = vi.spyOn(VocabularyProgressStore.prototype, 'applyRating');
      const progressWriteSpy = vi.spyOn(localStorage, 'setItem');

      expect(start.disabled).toBe(false);
      start.click();
      (root.querySelector('#btn-reveal') as HTMLButtonElement).click();
      again.focus();
      expect(document.activeElement).toBe(again);

      await mountRemoteFlashcardSession(bootstrap);
      expect(start.disabled).toBe(true);
      expect(start.getAttribute('aria-busy')).toBeNull();
      expect(error.hidden).toBe(false);
      expect(sessionArea.classList.contains('hidden')).toBe(false);

      const retryMount = mountRemoteFlashcardSession(bootstrap);
      expect(start.disabled).toBe(true);
      expect(document.querySelector('.flashcard-session-root')).toBe(root);
      expect(applyRatingSpy).not.toHaveBeenCalled();
      expect(progressWriteSpy.mock.calls.filter(([key]) => key === 'chabiko:hsk-vocabulary-progress:v1'))
        .toHaveLength(0);

      resolveRetry(validResponse());
      cleanup = await retryMount;

      expect(start.disabled).toBe(false);
      expect(start.getAttribute('aria-busy')).toBeNull();
      expect(error.hidden).toBe(true);
      expect(error.textContent).toBe('');
      expect(setupPanel.classList.contains('hidden')).toBe(false);
      expect(sessionArea.classList.contains('hidden')).toBe(true);
      expect(document.querySelector('.flashcard-session-root')).toBe(root);
      expect(document.activeElement).toBe(start);
      expect(applyRatingSpy).not.toHaveBeenCalled();
      expect(progressWriteSpy.mock.calls.filter(([key]) => key === 'chabiko:hsk-vocabulary-progress:v1'))
        .toHaveLength(0);

      start.click();
      expect((root.querySelector('[data-front]') as HTMLElement).textContent).toBe('復旧一語');
      (root.querySelector('#btn-reveal') as HTMLButtonElement).click();
      expect((root.querySelector('[data-japanese]') as HTMLElement).textContent).toBe('復旧一語目');
      (root.querySelector('#btn-known') as HTMLButtonElement).click();
      expect((root.querySelector('[data-progress-text]') as HTMLElement).textContent).toBe('1 / 2');
      expect(root.querySelector('#btn-restart')).toBeNull();
      expect(applyRatingSpy).toHaveBeenCalledTimes(1);
      expect(progressWriteSpy.mock.calls.filter(([key]) => key === 'chabiko:hsk-vocabulary-progress:v1'))
        .toHaveLength(1);

      const outsideButton = document.createElement('button');
      document.body.appendChild(outsideButton);
      outsideButton.focus();
      cleanup = await mountRemoteFlashcardSession(bootstrap);
      expect(document.activeElement).toBe(outsideButton);

      const fullPool = root.querySelector('[data-pool="full"]') as HTMLInputElement;
      fullPool.focus();
      expect(document.activeElement).toBe(fullPool);
      cleanup = await mountRemoteFlashcardSession(bootstrap);
      expect(document.activeElement).toBe(fullPool);
      expect(applyRatingSpy).toHaveBeenCalledTimes(1);
      expect(progressWriteSpy.mock.calls.filter(([key]) => key === 'chabiko:hsk-vocabulary-progress:v1'))
        .toHaveLength(1);
      cleanup();
    },
  );
});
