// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountV2ReferenceFlow } from '../src/client/v2ReferenceFlow';
import type {
  V2ReferenceAnswerPayload,
  V2ReferenceBootstrap,
} from '../src/content/v2Reference';

const BOOTSTRAP: V2ReferenceBootstrap = {
  version: 1,
  lessonId: 'lesson-001',
  today: {
    titleJa: '夜市で、指さし注文',
    contextJa: '台湾の夜市。食べたいものを見つけました。',
    primaryActionJa: 'この場面を練習',
    phrase: '我要這個',
    pinyin: 'wǒ yào zhège',
    meaningJa: 'これをください',
    scene: {
      src: '/assets/v2-reference/night-market-order-reference.webp',
      width: 1200,
      height: 900,
      altJa: '台湾の夜市の屋台で、食べたい料理を指さして注文する場面',
      locationJa: '台湾・夜市',
      provenance: {
        kind: 'ai-generated',
        generator: 'OpenAI built-in imagegen',
        sourceArtifactId: 'asset-test',
        generatedOn: '2026-08-23',
        transform: 'test fixture',
        rightsStatus: 'generated-for-project-reference',
        allowedUse: 'isolated-v2-reference-only',
        reviewStatus: 'reference-only',
      },
    },
  },
  learning: {
    phrase: '我要這個',
    pinyin: 'wǒ yào zhège',
    meaningJa: 'これをください',
    canDoJa: '台湾の夜市で簡単に食べ物を注文できる',
    learnerOutcomeJa: '指差し注文と基本表現「我要〜」が使える',
    lessonChunks: [
      {
        chunk: '我要',
        meaning: '私は〜が欲しい',
        notesJa: '日本語の「欲しい」と違い、中国語では「要」が意思を表す',
      },
      { chunk: '這個', meaning: 'これ' },
    ],
    kanjiBridgeNotes: [
      {
        kanji: '要',
        jpReading: 'よう',
        noteJa: '日本語の「要る」に近いが、中国語では欲求・意思を表す',
      },
    ],
    soundFocus: [
      { item: '要 yào', noteJa: '第四声。短く急降下。' },
    ],
    scene: {
      src: '/assets/v2-reference/night-market-order-reference.webp',
      width: 1200,
      height: 900,
      altJa: '台湾の夜市の屋台で、食べたい料理を指さして注文する場面',
      locationJa: '台湾・夜市',
      provenance: {
        kind: 'ai-generated',
        generator: 'OpenAI built-in imagegen',
        sourceArtifactId: 'asset-test',
        generatedOn: '2026-08-23',
        transform: 'test fixture',
        rightsStatus: 'generated-for-project-reference',
        allowedUse: 'isolated-v2-reference-only',
        reviewStatus: 'reference-only',
      },
    },
    audio: {
      kind: 'device-speech-synthesis',
      lang: 'zh-TW',
      labelJa: '音声を聞く',
      unavailableJa: 'この端末では音声を再生できません。',
      reviewStatus: 'reference-only',
      productionReplacement: 'reviewed-static-zh-TW-audio-required',
    },
  },
  retrieval: {
    promptJa: '「これをください」を中国語の順番に並べよう。',
    contextJa: '食べたいものを指さして、ひと言。',
    hintJa: '「私」を表すことばから始めます。',
    chunks: [
      { id: 'v2-c42', text: '這個' },
      { id: 'v2-a91', text: '我' },
      { id: 'v2-b07', text: '要' },
    ],
    answerSignature: '2spt6r',
    answerSource: '/v2-reference/data/lesson-001-answer.json',
  },
  result: {
    headingJa: '今日できるようになったこと',
    canDoJa: '台湾の夜市で簡単に食べ物を注文できる',
    phrase: '我要這個',
    pinyin: 'wǒ yào zhège',
    meaningJa: 'これをください',
  },
};

const ANSWER: V2ReferenceAnswerPayload = {
  version: 1,
  lessonId: 'lesson-001',
  chunks: [
    { id: 'v2-a91', text: '我' },
    { id: 'v2-b07', text: '要' },
    { id: 'v2-c42', text: '這個' },
  ],
  phrase: '我要這個',
  pinyin: 'wǒ yào zhège',
  meaningJa: 'これをください',
};

function getRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('[data-v2-reference-root]');
  if (!root) throw new Error('missing V2 root');
  return root;
}

function click(selector: string): void {
  const button = getRoot().querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`missing button: ${selector}`);
  button.click();
}

beforeEach(() => {
  document.body.innerHTML = '<main><div data-v2-reference-root></div></main>';
});

describe('V2 reference client flow', () => {
  it('runs today to learning to repair to result without leaking the ordered answer before reveal', async () => {
    const speak = vi.fn().mockResolvedValue(true);
    const fetchAnswer = vi.fn().mockResolvedValue(ANSWER);
    mountV2ReferenceFlow(getRoot(), BOOTSTRAP, { speak, fetchAnswer });

    expect(getRoot().dataset.v2Stage).toBe('today');
    expect(getRoot().textContent).toContain('我要這個');
    expect(getRoot().querySelector('[aria-label="メインナビゲーション"]')).not.toBeNull();
    expect(getRoot().querySelector('img')?.getAttribute('alt')).toBe(
      BOOTSTRAP.today.scene.altJa,
    );

    click('[data-action="start-learning"]');
    expect(getRoot().dataset.v2Stage).toBe('learning');
    expect(getRoot().querySelector('[aria-label="メインナビゲーション"]')).toBeNull();
    expect(getRoot().querySelector('details')).not.toBeNull();
    const progressiveSupport = getRoot().querySelectorAll('details')[1];
    expect(progressiveSupport?.textContent).toContain('日本語からつなぐ');
    expect(progressiveSupport?.textContent).toContain(
      '日本語の「欲しい」と違い、中国語では「要」が意思を表す',
    );
    expect(progressiveSupport?.textContent).toContain(
      '日本語の「要る」に近いが、中国語では欲求・意思を表す',
    );

    click('[data-action="play-audio"]');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledWith('我要這個', 'zh-TW'));

    click('[data-action="start-retrieval"]');
    expect(getRoot().dataset.v2Stage).toBe('retrieval');
    expect(getRoot().textContent).not.toContain('我要這個');
    expect(getRoot().textContent).not.toContain('wǒ yào zhège');
    expect(getRoot().querySelector('[aria-label="メインナビゲーション"]')).toBeNull();

    click('[data-chunk-id="v2-c42"]');
    click('[data-chunk-id="v2-a91"]');
    click('[data-chunk-id="v2-b07"]');
    click('[data-action="submit-retrieval"]');

    expect(getRoot().dataset.v2Stage).toBe('repair');
    expect(getRoot().textContent).not.toContain('我要這個');
    expect(getRoot().textContent).not.toContain('wǒ yào zhège');
    expect(getRoot().textContent).not.toContain(BOOTSTRAP.retrieval.hintJa);

    click('[data-action="show-hint"]');
    expect(getRoot().textContent).toContain(BOOTSTRAP.retrieval.hintJa);
    expect(getRoot().textContent).not.toContain('我要這個');

    click('[data-action="reveal-answer"]');
    await vi.waitFor(() => expect(fetchAnswer).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(getRoot().textContent).toContain('我要這個'));
    expect(getRoot().textContent).toContain('wǒ yào zhège');

    click('[data-action="retry"]');
    expect(getRoot().dataset.v2Stage).toBe('retrieval');
    expect(getRoot().textContent).not.toContain('我要這個');
    expect(getRoot().textContent).not.toContain('wǒ yào zhège');

    click('[data-chunk-id="v2-a91"]');
    click('[data-chunk-id="v2-b07"]');
    click('[data-chunk-id="v2-c42"]');
    click('[data-action="submit-retrieval"]');
    expect(getRoot().dataset.v2Stage).toBe('correct');

    click('[data-action="view-result"]');
    expect(getRoot().dataset.v2Stage).toBe('result');
    expect(getRoot().textContent).toContain('今日できるようになったこと');
    expect(getRoot().textContent).toContain(
      '答えを確認したあと、正しい順番に組み立て直した',
    );
    expect(getRoot().textContent).toContain(
      '音声を聞いて、場面と表現を結びつけた',
    );
    expect(getRoot().textContent).not.toMatch(/XP|streak|ストリーク|バッジ|%/i);
    expect(
      getRoot().querySelector('[aria-label="メインナビゲーション"] [aria-current="page"]')
        ?.textContent,
    ).toContain('記録');
  });

  it('reports device audio failure without blocking the learning flow', async () => {
    const speak = vi.fn().mockResolvedValue(false);
    mountV2ReferenceFlow(getRoot(), BOOTSTRAP, {
      speak,
      fetchAnswer: vi.fn().mockResolvedValue(ANSWER),
    });

    click('[data-action="start-learning"]');
    click('[data-action="play-audio"]');

    await vi.waitFor(() =>
      expect(getRoot().querySelector('[data-audio-status]')?.textContent).toContain(
        BOOTSTRAP.learning.audio.unavailableJa,
      ),
    );
    expect(getRoot().querySelector('[data-action="start-retrieval"]')).not.toBeNull();
  });

  it('derives result evidence from the structured result phrase', () => {
    const bootstrap = {
      ...BOOTSTRAP,
      result: { ...BOOTSTRAP.result, phrase: '我想這個' },
    };
    mountV2ReferenceFlow(getRoot(), bootstrap, {
      speak: vi.fn().mockResolvedValue(true),
      fetchAnswer: vi.fn().mockResolvedValue(ANSWER),
    });

    click('[data-action="start-learning"]');
    click('[data-action="start-retrieval"]');
    click('[data-chunk-id="v2-a91"]');
    click('[data-chunk-id="v2-b07"]');
    click('[data-chunk-id="v2-c42"]');
    click('[data-action="submit-retrieval"]');
    click('[data-action="view-result"]');

    expect(getRoot().textContent).toContain('「我想這個」を正しい順番で組み立てた');
    expect(getRoot().textContent).not.toContain('「我要這個」を正しい順番で組み立てた');
  });

  it.each([
    ['lesson identity drifts', { ...ANSWER, lessonId: 'wrong-lesson' }],
    [
      'chunk text and phrase drift together',
      {
        ...ANSWER,
        chunks: [
          { id: 'v2-a91', text: '你' },
          { id: 'v2-b07', text: '想' },
          { id: 'v2-c42', text: '那個' },
        ],
        phrase: '你想那個',
      },
    ],
    ['pinyin drifts', { ...ANSWER, pinyin: 'stale pinyin' }],
    ['Japanese meaning drifts', { ...ANSWER, meaningJa: '古い意味' }],
  ])('keeps the answer hidden when %s in the reveal payload', async (_case, payload) => {
    mountV2ReferenceFlow(getRoot(), BOOTSTRAP, {
      speak: vi.fn().mockResolvedValue(true),
      fetchAnswer: vi.fn().mockResolvedValue(payload),
    });

    click('[data-action="start-learning"]');
    click('[data-action="start-retrieval"]');
    click('[data-chunk-id="v2-c42"]');
    click('[data-chunk-id="v2-a91"]');
    click('[data-chunk-id="v2-b07"]');
    click('[data-action="submit-retrieval"]');
    click('[data-action="show-hint"]');
    click('[data-action="reveal-answer"]');

    await vi.waitFor(() => {
      const alert = getRoot().querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('答えを読み込めませんでした');
    });
    expect(getRoot().textContent).not.toContain('我要這個');
    expect(getRoot().textContent).not.toContain('wǒ yào zhège');
  });
});
