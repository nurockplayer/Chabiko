// @vitest-environment happy-dom
/** Teacher-review browser UX (Issue #363). */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initTeacherReview, type RecordsPayload } from '../src/client/teacherReview';
import type {
  TeacherFacingPhraseContent,
  TeacherFacingReviewContent,
} from '../src/domain/teacherReviewPublic';

function phraseContent(
  overrides: Partial<TeacherFacingPhraseContent> = {},
): TeacherFacingPhraseContent {
  return {
    traditional: '請問這附近有捷運站嗎？',
    simplified: '请问这附近有捷运站吗？',
    pinyin: 'Qǐngwèn zhè fùjìn yǒu jiéyùnzhàn ma?',
    japanese: 'すみません、この近くにMRTの駅はありますか？',
    usageNotesJa: '「捷運」は台湾でのMRT/地下鉄の呼称。',
    reviewContext: ['表記の確認情報: 人が作成した表記・人が確認済みの表記'],
    ...overrides,
  };
}

function makePayload(
  overrides: Partial<RecordsPayload> = {},
): RecordsPayload {
  return {
    campaign: { id: 'issue-360-launch-v1' },
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

function setupDom(): void {
  document.body.innerHTML =
    '<main class="teacher-review"><div data-teacher-review-root></div></main>';
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mockFetch(
  payload: RecordsPayload,
  decisions: Array<{ ok: boolean; error?: string }> = [],
) {
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
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      recordId: string;
      outcome: string;
      note: string;
    };
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
  it('renders review data and hides export until every record is decided', async () => {
    setupDom();
    const { fn } = mockFetch(makePayload());
    initTeacherReview({ fetchImpl: fn });
    await flush();

    expect(document.body.textContent).toContain('1 / 2');
    expect(document.body.textContent).toContain('phrase-transport-002');
    expect(document.body.textContent).toContain('人が作成した表記');
    const exportControl = document.querySelector<HTMLElement>('[data-tr-export]');
    expect(exportControl?.getAttribute('href')).toBeNull();
    expect(exportControl?.getAttribute('aria-disabled')).toBe('true');
  });

  it('enables artifact export after every record has a decision', async () => {
    setupDom();
    const payload = makePayload({
      records: makePayload().records.map((record) => ({
        ...record,
        decision:
          record.decision ?? {
            outcome: 'accepted' as const,
            note: '',
            updatedAt: '2026-08-15T00:00:00.000Z',
            reviewerName: 'Teacher Reviewer',
          },
      })),
      progress: { total: 2, decided: 2, accepted: 2, needsChanges: 0, unreviewed: 0 },
    });
    const { fn } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    expect(document.querySelector('[data-tr-export]')?.getAttribute('href')).toBe(
      '/teacher-review/api/export',
    );
  });

  it('narrows records by scenario', async () => {
    setupDom();
    const { fn } = mockFetch(makePayload());
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
    const { fn, calls } = mockFetch(makePayload());
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const note = document.querySelector<HTMLTextAreaElement>('[data-tr-note]')!;
    note.value = '   ';
    note.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('[data-tr-needs]')!.click();
    await flush();

    expect(document.querySelector<HTMLElement>('[data-tr-error]')?.hidden).toBe(false);
    expect(document.body.textContent).toMatch(/レビューメモが必要/);
    expect(calls.filter((call) => String(call.url).endsWith('/decisions'))).toHaveLength(0);
  });

  it('persists an accepted human decision before updating progress', async () => {
    setupDom();
    const { fn, calls } = mockFetch(makePayload());
    initTeacherReview({ fetchImpl: fn });
    await flush();

    document.querySelector<HTMLButtonElement>('[data-tr-accept]')!.click();
    await flush();

    const decisionCall = calls.find((call) => String(call.url).endsWith('/decisions'));
    expect(JSON.parse(String(decisionCall?.init?.body))).toEqual({
      recordId: 'phrase-transport-002',
      outcome: 'accepted',
      note: '',
    });
    expect(document.body.textContent).toContain('2 / 2');
  });

  it('shows a teacher-friendly Access error', async () => {
    setupDom();
    const fn = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Missing Cloudflare Access JWT.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    initTeacherReview({ fetchImpl: fn });
    await flush();

    expect(document.querySelector('[data-tr-error]')?.getAttribute('role')).toBe('alert');
    expect(document.body.textContent).toContain('アクセス認証が必要です');
    expect(document.body.textContent).not.toContain('Missing Cloudflare Access JWT');
  });

  it('renders dialogs as conversations without internal refs or provenance enums', async () => {
    setupDom();
    const content: TeacherFacingReviewContent = {
      turns: [
        {
          speaker: 'learner',
          traditional: '請問這附近有捷運站嗎？',
          pinyin: 'Qǐngwèn…',
          japanese: 'この近くに…',
        },
        {
          speaker: 'partner',
          traditional: '有，往前走。',
          pinyin: 'yǒu…',
          japanese: 'ありますよ。',
        },
      ],
      reviewContext: ['表記の確認情報: 人が作成した表記'],
    };
    const payload = makePayload({
      records: [
        {
          id: 'dialog-transport-001',
          type: 'dialog',
          scenario: 'transport',
          content,
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
    expect(document.body.textContent).not.toContain('relatedPhraseIds');
    expect(document.body.textContent).not.toContain('authored');
  });

  it('never lets a crafted speaker value break out of the class attribute', async () => {
    setupDom();
    const content = {
      turns: [
        {
          speaker: 'x" onmouseover="alert(1)',
          traditional: '測試',
          pinyin: 'cèshì',
          japanese: 'テスト',
        },
      ],
      reviewContext: [],
    } as unknown as TeacherFacingReviewContent;
    const payload = makePayload({
      records: [
        {
          id: 'dialog-transport-001',
          type: 'dialog',
          scenario: 'transport',
          content,
          decision: null,
        },
      ],
      progress: { total: 1, decided: 0, accepted: 0, needsChanges: 0, unreviewed: 1 },
    });
    const { fn } = mockFetch(payload);
    initTeacherReview({ fetchImpl: fn });
    await flush();

    const turn = document.querySelector<HTMLElement>('.tr-turn');
    expect(turn?.className).toBe('tr-turn tr-turn--partner');
    expect(turn?.hasAttribute('onmouseover')).toBe(false);
  });
});
