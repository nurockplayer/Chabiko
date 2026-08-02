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
import type { TeacherVocabularyPreviewRow } from '../src/types/teacherVocabularyPreview';

const preview = loadTeacherVocabularyPreview();
const reconciliation = loadTeacherImageReconciliation();

function createPreviewRoot(): HTMLElement {
  const root = document.createElement('section');
  root.id = 'preview-root';
  root.innerHTML = `
    <section class="summary">
      <dl>
        <div><dt>表示対象</dt><dd>0</dd></div>
        <div><dt>要確認画像</dt><dd data-inventory-count>0 件</dd></div>
      </dl>
    </section>
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

function inventoryCounts(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-inventory-count]')].map((el) => el.textContent ?? '');
}

function singleRowRoot(row: TeacherVocabularyPreviewRow): HTMLElement {
  const root = createPreviewRoot();
  mountPreviewBrowser(root, { rows: [row], flaggedSources: [] });
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

  it('updates every inventory count target from the serialized flagged-source length', () => {
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources });
      expect(inventoryCounts(root)).toEqual([String(flaggedSources.length), String(flaggedSources.length)]);
      expect(root.querySelectorAll<HTMLElement>('[data-inventory-list] li').length).toBe(flaggedSources.length);
    } finally {
      root.remove();
    }
  });

  it('both inventory count targets display the current real ambiguous/unmatched total of 90', () => {
    expect(flaggedSources.length).toBe(90);
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources });
      expect(inventoryCounts(root)).toEqual(['90', '90']);
    } finally {
      root.remove();
    }
  });

  it('a synthetic inventory with another length updates both targets without code changes', () => {
    const synthetic = flaggedSources.slice(0, 3);
    expect(synthetic).toHaveLength(3);
    const root = createPreviewRoot();
    try {
      mountPreviewBrowser(root, { rows: preview.rows, flaggedSources: synthetic });
      expect(inventoryCounts(root)).toEqual(['3', '3']);
      expect(root.querySelectorAll<HTMLElement>('[data-inventory-list] li').length).toBe(3);
    } finally {
      root.remove();
    }
  });

  it('teacher-mapped rows render the deployable image and teacher labels', () => {
    const row = preview.rows.find(
      (r) => r.image.state === 'teacher-mapped' && r.image.assetPath,
    );
    expect(row).toBeDefined();
    const root = singleRowRoot(row!);
    try {
      const img = root.querySelector<HTMLImageElement>('[data-preview-rows] .row__image__img');
      expect(img).not.toBeNull();
      expect(img?.src).toContain(row!.image.assetPath!);
      expect(root.querySelector<HTMLElement>('[data-preview-rows] .row__state .state')?.textContent).toBe('教師提供の対応画像');
      const provenance = root.querySelector<HTMLElement>('[data-preview-rows] .row__state span:not(.state)')?.textContent;
      expect(provenance).toBe('教師提供');
    } finally {
      root.remove();
    }
  });

  it('a teacher-mapped row keeps its image when the image fails to load', () => {
    const row = preview.rows.find(
      (r) => r.image.state === 'teacher-mapped' && r.image.assetPath,
    );
    expect(row).toBeDefined();
    const root = singleRowRoot(row!);
    try {
      const img = root.querySelector<HTMLImageElement>('[data-preview-rows] .row__image__img');
      expect(img).not.toBeNull();
      img!.dispatchEvent(new Event('error'));
      const imageCell = root.querySelector<HTMLElement>('[data-preview-rows] .row__image');
      expect(imageCell?.textContent).toBe('画像を読み込めません');
      expect(imageCell?.textContent).not.toBe('画像なし');
      expect(imageCell?.textContent).not.toBe('ローカル未生成');
    } finally {
      root.remove();
    }
  });

  it('text-only, ambiguous, unsuitable, and skipped rows retain their existing labels', () => {
    const expectedLabels: Record<string, string> = {
      'text-only': '文字のみ',
      ambiguous: '対応が曖昧',
      unsuitable: '画像化しない',
      skipped: '除外',
    };
    for (const [state, label] of Object.entries(expectedLabels)) {
      const row = preview.rows.find((r) => r.image.state === state);
      const subject = row ?? {
        id: `synthetic-${state}`,
        simplified: '合成',
        partOfSpeech: 'noun' as const,
        sourceSheet: '合成シート',
        sourceRow: 0,
        missingFields: [] as const,
        reviewStatus: 'draft' as const,
        image: { state: state as never, provenance: null, reviewStatus: 'not-applicable' },
      };
      const root = singleRowRoot(subject as TeacherVocabularyPreviewRow);
      try {
        const stateLabel = root.querySelector<HTMLElement>('[data-preview-rows] .row__state .state')?.textContent;
        expect(stateLabel).toBe(label);
        const cell = root.querySelector<HTMLElement>('[data-preview-rows] .row__image');
        expect(cell?.textContent).toBe('画像なし');
      } finally {
        root.remove();
      }
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
