// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountRemoteFlashcardSession } from '../src/client/flashcardSession';
import { GET as getHskAnswers } from '../src/pages/data/hsk/[level].json';

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

function createRouteFixture(entry: SyntheticEntry) {
  // Synthetic status/form inputs exercise transport only. The production HSK
  // loader currently excludes Traditional fields and all real HSK routes stay unavailable.
  syntheticPublication.current = {
    pools: [{
      level: 1,
      status: 'partial',
      fullRange: [entry],
      newWords: [],
      counts: { fullRange: 1, newWords: 0, expectedFullRange: 1, expectedNewWords: 1 },
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
});
