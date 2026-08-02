// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  filterPreviewRows,
  mountPreviewBrowser,
  previewPageCount,
  previewPageRange,
} from '../src/client/previewCorpusBrowser';
import { loadTeacherImageReconciliation, loadTeacherVocabularyPreview } from '../src/content/loadTeacherVocabularyPreview';

const preview = loadTeacherVocabularyPreview();
const reconciliation = loadTeacherImageReconciliation();

function createPreviewRoot(): HTMLElement {
  const root = document.createElement('section');
  root.id = 'preview-root';
  root.innerHTML = `
    <p class="result-count"><span data-preview-total>0</span> 語中 <span data-preview-range>0</span> 語を表示</p>
    <div class="filters">
      <label>シート<select data-filter-sheet></select></label>
      <label>品詞<select data-filter-pos></select></label>
      <label>難易度<select data-filter-difficulty></select></label>
      <label>画像状態<select data-filter-image></select></label>
      <label>欠損<select data-filter-missing></select></label>
      <button type="button" data-filter-reset>リセット</button>
    </div>
    <ol class="rows" data-preview-rows></ol>
    <p class="empty" data-preview-empty hidden>条件に一致する語彙はありません。</p>
    <nav class="pagination" data-pagination></nav>
    <details class="inventory"><summary>インベントリ (<span data-inventory-count>0</span>)</summary><ul data-inventory-list></ul></details>
  `;
  document.body.appendChild(root);
  return root;
}

const flaggedSources = reconciliation.filter(
  (item) => item.state === 'ambiguous' || item.state === 'unmatched',
);

describe('static preview filter/pagination (browser side)', () => {
  it('reaches rows beyond the first 50 without a server round-trip', () => {
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources });
      const rows = root.querySelectorAll<HTMLElement>('[data-preview-rows] .row');
      expect(rows.length).toBe(50);
      // Page 2 via the next button
      const next = [...root.querySelectorAll<HTMLButtonElement>('[data-pagination] button')].find((b) => b.textContent?.includes('次'));
      expect(next).toBeDefined();
      next?.click();
      const pageTwoRows = root.querySelectorAll<HTMLElement>('[data-preview-rows] .row');
      expect(pageTwoRows.length).toBe(50);
      const range = root.querySelector<HTMLElement>('[data-preview-range]')?.textContent;
      expect(range).toContain('51');
    } finally {
      root.remove();
    }
  });

  it('page count matches the corpus at 50 rows per page', () => {
    expect(previewPageCount(preview.rows.length)).toBe(Math.ceil(preview.rows.length / 50));
    expect(previewPageCount(preview.rows.length)).toBeGreaterThan(1);
  });

  it('page range clamps invalid pages and returns a slice within bounds', () => {
    const { start, end } = previewPageRange(preview.rows.length, 999);
    expect(end).toBeLessThanOrEqual(preview.rows.length);
    expect(start).toBeLessThan(end);
    expect(end - start).toBeLessThanOrEqual(50);
  });

  it('each filter preserves the correct complete result set', () => {
    for (const state of Object.keys(preview.totals.byImageState)) {
      const rows = filterPreviewRows(preview.rows, { imageState: state as never });
      expect(rows.length).toBe(preview.totals.byImageState[state as keyof typeof preview.totals.byImageState]);
    }
    for (const sheet of Object.keys(preview.totals.bySourceSheet)) {
      expect(filterPreviewRows(preview.rows, { sourceSheet: sheet })).toHaveLength(preview.totals.bySourceSheet[sheet]);
    }
  });

  it('combining a filter and pagination keeps every filtered row reachable', () => {
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources });
      const imageSelect = root.querySelector<HTMLSelectElement>('[data-filter-image]');
      imageSelect!.innerHTML = '';
      for (const [value, label] of Object.entries({
        'teacher-mapped': '教師', 'ai-generated': 'AI',
        'text-only': '文字', ambiguous: '曖昧', unsuitable: '不可', skipped: '除外', 'ai-pending': '待ち',
      })) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        imageSelect!.appendChild(option);
      }
      imageSelect!.value = 'ai-generated';
      imageSelect!.dispatchEvent(new Event('change'));
      const rows = root.querySelectorAll<HTMLElement>('[data-preview-rows] .row');
      expect(rows.length).toBe(Math.min(50, preview.totals.byImageState['ai-generated']));
      const count = root.querySelector<HTMLElement>('[data-preview-total]')?.textContent;
      expect(Number(count)).toBe(preview.totals.byImageState['ai-generated']);
    } finally {
      root.remove();
    }
  });

  it('reset returns to the complete corpus first page', () => {
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources });
      const imageSelect = root.querySelector<HTMLSelectElement>('[data-filter-image]');
      imageSelect!.innerHTML = '<option value="">すべて</option><option value="ai-generated">AI</option>';
      imageSelect!.value = 'ai-generated';
      imageSelect!.dispatchEvent(new Event('change'));
      expect(root.querySelector<HTMLElement>('[data-preview-total]')?.textContent).toBe(String(preview.totals.byImageState['ai-generated']));
      root.querySelector<HTMLButtonElement>('[data-filter-reset]')?.click();
      expect(root.querySelector<HTMLElement>('[data-preview-total]')?.textContent).toBe(preview.rows.length.toLocaleString('ja-JP'));
    } finally {
      root.remove();
    }
  });

  it('inventory lists every ambiguous and unmatched source image', () => {
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources });
      expect(root.querySelector<HTMLElement>('[data-inventory-count]')?.textContent).toBe(String(flaggedSources.length));
      expect(root.querySelectorAll('[data-inventory-list] li').length).toBe(flaggedSources.length);
    } finally {
      root.remove();
    }
  });

  it('serialized payload does not reference local absolute paths', () => {
    const payload = JSON.stringify({ rows: preview.rows, flaggedSources });
    expect(payload).not.toContain('/Users/');
    expect(payload).not.toContain('词汇表/单词表(带图).xlsx');
  });

  it('build script validates source checksums and dimensions before exporting teacher derivatives', () => {
    const script = readFileSync('scripts/build-teacher-vocabulary-complete-preview.py', 'utf8');
    expect(script).toContain('verify_source_matches_mapping');
    expect(script).toContain('checksum drift');
    expect(script).toContain('dimension drift');
    // Fail-closed: the verification must run immediately before derivative export.
    expect(script).toMatch(/verify_source_matches_mapping[\s\S]{0,400}export_derivative/);
  });
});
