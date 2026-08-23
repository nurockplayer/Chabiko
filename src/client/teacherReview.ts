/**
 * Teacher-review client (Issue #363).
 *
 * Renders the bounded one-record-at-a-time review UX into the static shell at
 * `/teacher-review/`. All record data comes from the same-origin Access-
 * protected API (`/teacher-review/api/*`); localStorage is never the source of
 * truth. Every decision is persisted server-side before the UI advances.
 */

import type {
  RecordViewState,
  ReviewUiRecord,
  ReviewUiState,
  ScenarioFilter,
} from '../domain/teacherReviewUi';
import {
  applyConfirmedDecision,
  createReviewUiState,
  navigateNext,
  navigatePrevious,
  selectRecord,
  setDraftNote,
  setScenarioFilter,
  snapshot,
  toggleNeedsChangesOnly,
} from '../domain/teacherReviewUi';
import type {
  ReviewOutcome,
  TeacherReviewScenario,
} from '../domain/teacherReview';
import type {
  TeacherFacingDialogContent,
  TeacherFacingPhraseContent,
  TeacherFacingReviewContent,
  TeacherFacingRoleplayContent,
  TeacherFacingTurn,
} from '../domain/teacherReviewPublic';

export interface RecordsPayload {
  campaign: {
    id: string;
  };
  reviewer: {
    email: string;
    name: string;
    isEligibleReviewer: boolean;
  };
  records: {
    id: string;
    type: ReviewUiRecord['type'];
    scenario: TeacherReviewScenario;
    content: TeacherFacingReviewContent;
    decision: {
      outcome: ReviewOutcome;
      note: string;
      updatedAt: string;
      reviewerName: string;
    } | null;
  }[];
  progress: {
    total: number;
    decided: number;
    accepted: number;
    needsChanges: number;
    unreviewed: number;
  };
}

const SCENARIO_LABELS: Record<TeacherReviewScenario, string> = {
  airport: '空港',
  transport: '交通',
  food: '食事',
  shopping: '買い物',
  hotel: 'ホテル',
  emergency: '緊急時',
};

const RECORD_TYPE_LABELS: Record<ReviewUiRecord['type'], string> = {
  phrase: 'フレーズ',
  dialog: '会話',
  roleplay: 'ロールプレイ',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTurn(turn: TeacherFacingTurn): string {
  const speakerClass = turn.speaker === 'learner' ? 'learner' : 'partner';
  return [
    `<li class="tr-turn tr-turn--${speakerClass}">`,
    `<span class="tr-turn__speaker">${
      turn.speaker === 'learner' ? '学習者' : '相手'
    }</span>`,
    `<span class="tr-turn__traditional" lang="zh-Hant">${escapeHtml(turn.traditional)}</span>`,
    turn.simplified
      ? `<span class="tr-turn__simplified" lang="zh-Hans">${escapeHtml(turn.simplified)}</span>`
      : '',
    `<span class="tr-turn__pinyin">${escapeHtml(turn.pinyin)}</span>`,
    `<span class="tr-turn__japanese" lang="ja">${escapeHtml(turn.japanese)}</span>`,
    '</li>',
  ].join('');
}

function renderConversation(turns: readonly TeacherFacingTurn[]): string {
  return `<ol class="tr-conversation">${turns.map(renderTurn).join('')}</ol>`;
}

function renderReviewContext(items: readonly string[]): string {
  if (items.length === 0) return '';
  return [
    '<aside class="tr-review-context" aria-label="確認のための補足情報">',
    '<h3>確認のための補足情報</h3>',
    '<ul>',
    ...items.map((item) => `<li>${escapeHtml(item)}</li>`),
    '</ul>',
    '</aside>',
  ].join('');
}

function renderContent(record: ReviewUiRecord): string {
  if (record.type === 'phrase') {
    const phrase = record.content as TeacherFacingPhraseContent;
    return [
      `<p class="tr-phrase__traditional" lang="zh-Hant">${escapeHtml(phrase.traditional)}</p>`,
      phrase.simplified
        ? `<p class="tr-phrase__simplified" lang="zh-Hans">${escapeHtml(phrase.simplified)}</p>`
        : '',
      `<p class="tr-phrase__pinyin">${escapeHtml(phrase.pinyin)}</p>`,
      `<p class="tr-phrase__japanese" lang="ja">${escapeHtml(phrase.japanese)}</p>`,
      `<p class="tr-phrase__usage" lang="ja">${escapeHtml(phrase.usageNotesJa)}</p>`,
      renderReviewContext(phrase.reviewContext),
    ].join('');
  }

  if (record.type === 'dialog') {
    const dialog = record.content as TeacherFacingDialogContent;
    return [
      renderConversation(dialog.turns),
      renderReviewContext(dialog.reviewContext),
    ].join('');
  }

  const roleplay = record.content as TeacherFacingRoleplayContent;
  return [
    `<p class="tr-roleplay__title" lang="ja">${escapeHtml(roleplay.titleJa)}</p>`,
    `<p class="tr-roleplay__goal" lang="ja">${escapeHtml(roleplay.goalJa)}</p>`,
    `<p class="tr-roleplay__guidance" lang="ja">${escapeHtml(roleplay.guidanceJa)}</p>`,
    renderConversation(roleplay.lines),
    renderReviewContext(roleplay.reviewContext),
  ].join('');
}

function decisionBadge(view: RecordViewState | undefined): string {
  if (!view || view.outcome === null) return '';
  return view.outcome === 'accepted'
    ? '<span class="tr-badge tr-badge--accepted">承認済み</span>'
    : '<span class="tr-badge tr-badge--needs">修正が必要</span>';
}

function statusLabel(view: RecordViewState | undefined): string {
  if (!view || view.outcome === null) return '未レビュー';
  return view.outcome === 'accepted' ? '承認済み' : '修正が必要';
}

export interface TeacherReviewController {
  getState(): ReviewUiState | null;
  rerender(): void;
  applyDecision(outcome: ReviewOutcome): Promise<void>;
}

export interface InitTeacherReviewOptions {
  fetchImpl?: typeof fetch;
  recordsUrl?: string;
  decisionsUrl?: string;
  exportUrl?: string;
}

const DEFAULT_URLS = {
  recordsUrl: '/teacher-review/api/records',
  decisionsUrl: '/teacher-review/api/decisions',
  exportUrl: '/teacher-review/api/export',
};

export function initTeacherReview(
  options: InitTeacherReviewOptions = {},
): TeacherReviewController | null {
  const rootElement = document.querySelector<HTMLElement>('[data-teacher-review-root]');
  if (!rootElement) return null;
  const root: HTMLElement = rootElement;

  const fetchImpl = options.fetchImpl ?? fetch;
  const urls = { ...DEFAULT_URLS, ...options };
  let state: ReviewUiState | null = null;
  let payload: RecordsPayload | null = null;
  let errorMessage = '';

  function statusEl(): HTMLElement | null {
    return root.querySelector('[data-tr-status]');
  }

  function announce(message: string): void {
    const status = statusEl();
    if (status) status.textContent = message;
  }

  function render(): void {
    if (!state) {
      root.innerHTML =
        '<div class="tr-status" data-tr-status role="status">読み込み中…</div>' +
        (errorMessage
          ? `<div class="tr-error" data-tr-error role="alert">${escapeHtml(errorMessage)}</div>`
          : '');
      return;
    }

    const snap = snapshot(state);
    const current = snap.current;
    const recordLabel = current
      ? `${RECORD_TYPE_LABELS[current.type]}（${SCENARIO_LABELS[current.scenario]}）`
      : '';

    const summaryRows = state.records
      .map((record) => {
        const view = state?.views.get(record.id);
        return [
          '<tr data-tr-summary-row data-record-id="',
          escapeHtml(record.id),
          '">',
          `<td>${SCENARIO_LABELS[record.scenario]}</td>`,
          `<td>${escapeHtml(record.id)}</td>`,
          `<td>${RECORD_TYPE_LABELS[record.type]}</td>`,
          `<td>${statusLabel(view)}</td>`,
          '</tr>',
        ].join('');
      })
      .join('');

    const scenarioOptions = [
      '<option value="all">すべて</option>',
      ...Object.entries(SCENARIO_LABELS).map(
        ([value, label]) =>
          `<option value="${value}"${
            snap.scenarioFilter === value ? ' selected' : ''
          }>${label}</option>`,
      ),
    ].join('');

    const exportControl =
      snap.progress.unreviewed === 0
        ? `<a class="tr-export" data-tr-export href="${escapeHtml(urls.exportUrl)}">レビュー成果物をエクスポート</a>`
        : '<span class="tr-export" data-tr-export aria-disabled="true">全件レビュー後に成果物をエクスポートできます</span>';

    root.innerHTML = [
      '<section class="tr-head">',
      '<h1>教師レビュー</h1>',
      `<p class="tr-head__campaign">${escapeHtml(payload?.campaign.id ?? '')}</p>`,
      `<p class="tr-head__reviewer" data-tr-reviewer>レビュアー: ${escapeHtml(
        payload?.reviewer.name ?? '',
      )} &lt;${escapeHtml(payload?.reviewer.email ?? '')}&gt;${
        payload && !payload.reviewer.isEligibleReviewer
          ? '（この ID は閲覧・エクスポートのみ可能です）'
          : ''
      }</p>`,
      `<p class="tr-progress" data-tr-progress role="status">${snap.progress.decided} / ${snap.progress.total} 件レビュー済み（承認 ${snap.progress.accepted}・修正 ${snap.progress.needsChanges}・未レビュー ${snap.progress.unreviewed}）</p>`,
      exportControl,
      '</section>',

      '<section class="tr-toolbar" aria-label="絞り込みと移動">',
      '<label class="tr-toolbar__label" for="tr-scenario-filter">場面で絞り込む</label>',
      `<select id="tr-scenario-filter" data-tr-scenario-filter>${scenarioOptions}</select>`,
      '<label class="tr-toolbar__needs">',
      '<input type="checkbox" data-tr-needs-only',
      snap.isNeedsChangesOnly ? ' checked' : '',
      '>',
      '修正が必要なレコードのみ',
      '</label>',
      `<p class="tr-toolbar__count" data-tr-count>${snap.visibleCount} 件表示</p>`,
      '<div class="tr-toolbar__nav">',
      '<button type="button" data-tr-prev class="tr-button">前へ</button>',
      '<button type="button" data-tr-next class="tr-button">次へ</button>',
      '</div>',
      '</section>',

      '<section class="tr-record" data-tr-record aria-label="レビュー対象" tabindex="-1">',
      current
        ? [
            `<h2 class="tr-record__heading" data-tr-record-heading tabindex="-1">${escapeHtml(recordLabel)}</h2>`,
            `<p class="tr-record__id" data-tr-record-id>${escapeHtml(current.id)}</p>`,
            decisionBadge(state.views.get(current.id)),
            `<div class="tr-record__content" data-tr-content>${renderContent(current)}</div>`,
            '<form class="tr-decision" data-tr-decision-form novalidate>',
            '<label class="tr-decision__label" for="tr-note">レビューメモ（「修正が必要」では必須）</label>',
            `<textarea id="tr-note" data-tr-note rows="3">${escapeHtml(state.draftNote)}</textarea>`,
            '<div class="tr-decision__actions">',
            '<button type="button" data-tr-accept class="tr-button tr-button--primary">承認</button>',
            '<button type="button" data-tr-needs class="tr-button tr-button--danger">修正が必要</button>',
            '</div>',
            '<p class="tr-decision__error" data-tr-error role="alert" hidden></p>',
            '</form>',
          ].join('')
        : '<p class="tr-record__empty">表示できるレコードがありません。</p>',
      '</section>',

      '<details class="tr-summary" data-tr-summary>',
      '<summary>サマリー（全レコード）</summary>',
      '<table class="tr-summary__table">',
      '<thead><tr><th scope="col">場面</th><th scope="col">ID</th><th scope="col">種別</th><th scope="col">状態</th></tr></thead>',
      `<tbody>${summaryRows}</tbody>`,
      '</table>',
      '</details>',

      '<div class="tr-status" data-tr-status role="status" aria-live="polite"></div>',
    ].join('');
    bindEvents();
  }

  function showError(message: string): void {
    errorMessage = message;
    render();
  }

  function focusRecord(): void {
    root.querySelector<HTMLElement>('[data-tr-record-heading]')?.focus();
  }

  function bindEvents(): void {
    root
      .querySelector<HTMLSelectElement>('[data-tr-scenario-filter]')
      ?.addEventListener('change', (event) => {
        if (!state) return;
        const value = (event.currentTarget as HTMLSelectElement).value as ScenarioFilter;
        state = setScenarioFilter(state, value);
        render();
      });

    root
      .querySelector<HTMLInputElement>('[data-tr-needs-only]')
      ?.addEventListener('change', () => {
        if (!state) return;
        state = toggleNeedsChangesOnly(state);
        render();
      });

    root
      .querySelector<HTMLButtonElement>('[data-tr-prev]')
      ?.addEventListener('click', () => {
        if (!state) return;
        state = navigatePrevious(state);
        render();
        focusRecord();
      });

    root
      .querySelector<HTMLButtonElement>('[data-tr-next]')
      ?.addEventListener('click', () => {
        if (!state) return;
        state = navigateNext(state);
        render();
        focusRecord();
      });

    root
      .querySelector<HTMLTextAreaElement>('[data-tr-note]')
      ?.addEventListener('input', (event) => {
        if (!state) return;
        state = setDraftNote(state, (event.currentTarget as HTMLTextAreaElement).value);
      });

    root.querySelectorAll<HTMLElement>('[data-tr-summary-row]').forEach((row) => {
      row.addEventListener('click', () => {
        if (!state) return;
        const recordId = row.dataset.recordId;
        if (!recordId) return;
        state = selectRecord(state, recordId);
        render();
        focusRecord();
      });
    });

    root
      .querySelector<HTMLButtonElement>('[data-tr-accept]')
      ?.addEventListener('click', () => void applyDecision('accepted'));
    root
      .querySelector<HTMLButtonElement>('[data-tr-needs]')
      ?.addEventListener('click', () => void applyDecision('needs_changes'));
  }

  async function applyDecision(outcome: ReviewOutcome): Promise<void> {
    if (!state) return;
    const current = snapshot(state).current;
    if (!current) return;
    const errorEl = root.querySelector<HTMLElement>('[data-tr-error]');
    const note = state.draftNote;

    if (outcome === 'needs_changes' && note.trim().length === 0) {
      if (errorEl) {
        errorEl.textContent = '「修正が必要」にはレビューメモが必要です。';
        errorEl.hidden = false;
      }
      return;
    }
    if (errorEl) errorEl.hidden = true;

    const response = await fetchImpl(urls.decisionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId: current.id, outcome, note: note.trim() }),
    });
    const body = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          error?: string;
          decision?: {
            outcome: ReviewOutcome;
            note: string;
            updatedAt: string;
            reviewerName: string;
          };
        }
      | null;

    if (!response.ok || !body?.ok) {
      const message = body?.error ?? '決定の保存に失敗しました。';
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
      return;
    }

    const saved = body.decision;
    if (!saved) return;
    state = applyConfirmedDecision(
      state,
      current.id,
      saved.outcome,
      saved.note,
      saved.updatedAt,
      saved.reviewerName,
    );
    announce(
      saved.outcome === 'accepted'
        ? `「${current.id}」を承認しました。`
        : `「${current.id}」を修正が必要と記録しました。`,
    );
    render();
  }

  async function load(): Promise<void> {
    let response: Response;
    try {
      response = await fetchImpl(urls.recordsUrl);
    } catch {
      showError('レビュー対象の取得に失敗しました。ネットワークを確認してください。');
      return;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 401 || response.status === 403) {
        showError('アクセス認証が必要です。Cloudflare Access での認証を確認してください。');
      } else {
        showError(body?.error ?? `レビュー対象の読み込みに失敗しました（HTTP ${response.status}）。`);
      }
      return;
    }

    const data = (await response.json()) as RecordsPayload;
    payload = data;
    state = createReviewUiState(
      data.records,
      data.records.map((record) =>
        record.decision
          ? {
              outcome: record.decision.outcome,
              note: record.decision.note,
              updatedAt: record.decision.updatedAt,
              reviewerName: record.decision.reviewerName,
            }
          : null,
      ),
    );
    render();
  }

  void load();

  return {
    getState: () => state,
    rerender: () => render(),
    applyDecision,
  };
}
