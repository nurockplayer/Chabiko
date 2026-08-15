// @vitest-environment happy-dom
/**
 * Teacher-review client UX (Issue #363).
 *
 * The static shell renders the loaded records one at a time, supports scenario
 * and needs-changes-only filtering, requires a note for `Needs changes`, and
 * persists every decision server-side before updating the UI. The export link
 * points at the Access-protected artifact endpoint.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initTeacherReview, type RecordsPayload } from '../src/client/teacherReview';
import type { ReviewContent } from '../src/domain/teacherReview';

function phraseContent(overrides: Partial<Record<string, string>> = {}): ReviewContent {
  return {
    traditional: '請問這附近有捷運站嗎？',
    simplified: '请问这附近有捷运站吗？',
    pinyin: 'Qǐngwèn zhè fùjìn yǒu jiéyùnzhàn ma?',
    japanese: 'すみません、この近くにMRTの駅はありますか？',
    usageNotesJa: '「捷運」は台湾でのMRT/地下鉄の呼称。',
    traditionalStatus: 'authored',
    simplifiedStatus: 'verified',
    painPointTags: ['taiwan-mainland-usage'],
    ...overrides,
  } as unknown as ReviewContent;
}

function makePayload(
  overrides: Partial<RecordsPayload> = {},
): RecordsPayload {
  return {
    campaign: {
      id: 'issue-360-launch-v1',
      reviewerRole: 'human-language-reviewer',
      scopes: ['learner-facing-strings'],
    },
    reviewer: {
      email: 'teacher@example.com',
      name: 'Teacher Reviewer',
      isEligibleReviewer: true,
    },
    records: [
      {
        id: 'phrase-transport-002',
        type: 'phrase',
        scenario: 'transport',
        content: phraseContent(),
        decision: null,
      },
      {
        id: 'phrase-food-002',
        type: 'phrase',
        scenario: 'food',
        content: phraseContent({ traditional: '我要一份牛肉麵。' }),
        decision: {
          outcome: 'accepted',
          note: '',
          updatedAt: '2026-08-15T00:00:00.000Z',
          reviewerName: 'Teacher Reviewer',
        },
      },
    ],
    progress: { total: 2, decided: 1, accepted: 1, needsChanges: 0, unreviewed: 1 },
    ...overrides,
  };
}

function setupDom(): HTMLElement {
  document.body.innerHTML =
    '<main class="teacher-review"><div data-teacher-review-root></div></main>';
  return document.querySelector<HTMLElement>('[data-teacher-review-root]')!;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mockFetch(payload: RecordsPayload, decisions: Array<{ ok: boolean; error?: string }> = []) {
  const calls: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url, init });
    if (String(url).endsWith('/records')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = decisions.shift() ?? { ok: true };
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(
      JSON.stringify({
        ok: true,
        decision: {
          recordId: body.recordId,
          outcome: body.outcome,
          note: body.note,
          updatedAt: '2026-08-15T00:00:00.000Z',
          reviewerName: 'Teacher Reviewer',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  return { fn, calls };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('initTeacherReview', () => {
  it('renders the loaded records and progress after fetch', async () => {
    setupDom();
    const payload = makePayload();
    const { fn } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    expect(document.body.textContent).toContain('1 / 2');
    expect(document.body.textContent).toContain('phrase-transport-002');
    expect(document.querySelector('[data-tr-record-heading]')?.textContent).toContain('交通');
    expect(document.querySelector('[data-tr-export]')?.getAttribute('href')).toBe(
      '/teacher-review/api/export',
    );
  });

  it('narrows the record list via the scenario filter', async () => {
    setupDom();
    const payload = makePayload();
    const { fn } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const select = document.querySelector<HTMLSelectElement>('[data-tr-scenario-filter]')!;
    select.value = 'food';
    select.dispatchEvent(new Event('change'));

    expect(document.querySelector('[data-tr-count]')?.textContent).toContain('1 件表示');
    expect(document.querySelector('[data-tr-record-heading]')?.textContent).toContain('食事');
  });

  it('requires a note before saving Needs changes', async () => {
    setupDom();
    const payload = makePayload();
    const { fn, calls } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const note = document.querySelector<HTMLTextAreaElement>('[data-tr-note]')!;
    note.value = '   ';
    note.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('[data-tr-needs]')!.click();
    await flush();

    const error = document.querySelector<HTMLElement>('[data-tr-error]');
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toMatch(/レビューメモが必要/);
    expect(calls.filter((c) => String(c.url).endsWith('/decisions'))).toHaveLength(0);
  });

  it('persists an accepted decision and updates the UI state', async () => {
    setupDom();
    const payload = makePayload();
    const { fn, calls } = mockFetch(payload);
    const controller = initTeacherReview({ fetchImpl: fn });
    await flush();

    document.querySelector<HTMLButtonElement>('[data-tr-accept]')!.click();
    await flush();

    const decisionCall = calls.find((c) => String(c.url).endsWith('/decisions'));
    expect(decisionCall).toBeTruthy();
    const body = JSON.parse(String(decisionCall?.init?.body));
    expect(body).toEqual({ recordId: 'phrase-transport-002', outcome: 'accepted', note: '' });

    expect(document.body.textContent).toContain('2 / 2');
    expect(controller?.getState()).not.toBeNull();
  });

  it('persists a Needs changes decision with its note', async () => {
    setupDom();
    const payload = makePayload();
    const { fn, calls } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const note = document.querySelector<HTMLTextAreaElement>('[data-tr-note]')!;
    note.value = '台湾の言い回しを確認';
    note.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('[data-tr-needs]')!.click();
    await flush();

    const decisionCall = calls.find((c) => String(c.url).endsWith('/decisions'));
    const body = JSON.parse(String(decisionCall?.init?.body));
    expect(body).toEqual({
      recordId: 'phrase-transport-002',
      outcome: 'needs_changes',
      note: '台湾の言い回しを確認',
    });
    expect(document.body.textContent).toContain('修正が必要');
  });

  it('shows an accessible error when the API requires Access authentication', async () => {
    setupDom();
    const fn = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Missing Cloudflare Access JWT.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const error = document.querySelector<HTMLElement>('[data-tr-error]');
    expect(error).not.toBeNull();
    expect(error?.getAttribute('role')).toBe('alert');
    expect(document.body.textContent).toContain('アクセス認証が必要です');
  });

  it('renders a dialog as a conversation', async () => {
    setupDom();
    const payload = makePayload({
      records: [
        {
          id: 'dialog-transport-001',
          type: 'dialog',
          scenario: 'transport',
          content: {
            turns: [
              {
                speaker: 'learner',
                traditional: '請問這附近有捷運站嗎？',
                pinyin: 'Qǐngwèn…',
                japanese: 'この近くに…',
                traditionalStatus: 'authored',
              },
              {
                speaker: 'partner',
                traditional: '有，往前走。',
                pinyin: 'yǒu…',
                japanese: 'ありますよ。',
                traditionalStatus: 'authored',
              },
            ],
            relatedPhraseIds: ['phrase-002'],
          } as unknown as ReviewContent,
          decision: null,
        },
      ],
      progress: { total: 1, decided: 0, accepted: 0, needsChanges: 0, unreviewed: 1 },
    });
    const { fn } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    expect(document.querySelectorAll('.tr-turn')).toHaveLength(2);
    expect(document.querySelector('.tr-turn--learner')).not.toBeNull();
    expect(document.querySelector('.tr-turn--partner')).not.toBeNull();
  });

  it('never lets a crafted speaker value break out of the class attribute', async () => {
    setupDom();
    const payload = makePayload({
      records: [
        {
          id: 'dialog-transport-001',
          type: 'dialog',
          scenario: 'transport',
          content: {
            turns: [
              {
                // A hostile runtime value must render as a controlled class.
                speaker: 'x" onmouseover="alert(1)',
                traditional: '測試',
                pinyin: 'cèshì',
                japanese: 'テスト',
                traditionalStatus: 'authored',
              },
            ],
            relatedPhraseIds: ['phrase-002'],
          } as unknown as ReviewContent,
          decision: null,
        },
      ],
      progress: { total: 1, decided: 0, accepted: 0, needsChanges: 0, unreviewed: 1 },
    });
    const { fn } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const turn = document.querySelector<HTMLElement>('.tr-turn');
    expect(turn).not.toBeNull();
    // The class list must contain only the controlled class; the hostile value
    // must NOT inject an onmouseover attribute.
    expect(turn?.className).toBe('tr-turn tr-turn--partner');
    expect(turn?.hasAttribute('onmouseover')).toBe(false);
    expect(document.querySelector('script[src]')).toBeNull();
  });
});
