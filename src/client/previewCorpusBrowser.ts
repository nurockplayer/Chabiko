/**
 * Browser-side filter and pagination for the static preview route.
 *
 * The deployed site is `output: 'static'`, so no server-side query-parameter
 * handling can paginate the corpus. This module runs in the browser against
 * the complete serialized corpus and keeps every row and every filter result
 * reachable without a page reload.
 */

import type {
  PreviewImageState,
  PreviewMissingField,
  PreviewPartOfSpeech,
  TeacherImageReconciliationRecord,
  TeacherVocabularyPreviewRow,
} from '../types/teacherVocabularyPreview';

export interface PreviewBrowserFilters {
  sourceSheet?: string;
  partOfSpeech?: PreviewPartOfSpeech;
  difficulty?: string;
  imageState?: PreviewImageState;
  missingField?: PreviewMissingField;
}

export interface PreviewBrowserData {
  rows: TeacherVocabularyPreviewRow[];
  flaggedSources: TeacherImageReconciliationRecord[];
}

export const PREVIEW_PAGE_SIZE = 50;

export function filterPreviewRows(
  rows: readonly TeacherVocabularyPreviewRow[],
  filters: PreviewBrowserFilters,
): TeacherVocabularyPreviewRow[] {
  return rows.filter((row) => {
    if (filters.sourceSheet && row.sourceSheet !== filters.sourceSheet) return false;
    if (filters.partOfSpeech && row.partOfSpeech !== filters.partOfSpeech) return false;
    if (filters.difficulty && row.difficulty !== filters.difficulty) return false;
    if (filters.imageState && row.image.state !== filters.imageState) return false;
    if (filters.missingField && !row.missingFields.includes(filters.missingField)) return false;
    return true;
  });
}

export function previewPageCount(total: number, pageSize: number = PREVIEW_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export interface PreviewPageRange {
  start: number;
  end: number;
}

export function previewPageRange(
  total: number,
  page: number,
  pageSize: number = PREVIEW_PAGE_SIZE,
): PreviewPageRange {
  const safeTotal = Math.max(0, total);
  const pageCount = previewPageCount(safeTotal, pageSize);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * pageSize;
  return { start, end: Math.min(start + pageSize, safeTotal) };
}

const POS_LABELS: Record<PreviewPartOfSpeech, string> = {
  noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
};

const IMAGE_LABELS: Record<PreviewImageState, string> = {
  'teacher-mapped': '教師提供の対応画像',
  'ai-generated': 'AI生成・暫定',
  'ai-pending': 'AI生成待ち',
  'text-only': '文字のみ',
  ambiguous: '対応が曖昧',
  unsuitable: '画像化しない',
  skipped: '除外',
};

const MISSING_LABELS: Record<PreviewMissingField, string> = {
  pinyin: 'ピンイン', japanese: '日本語', traditional: '繁体字', difficulty: '難易度',
};

export function mountPreviewBrowser(
  root: HTMLElement,
  data: PreviewBrowserData,
): void {
  let active: PreviewBrowserFilters = {};
  let page = 1;

  const render = (): void => {
    const rows = filterPreviewRows(data.rows, active);
    const pageCount = previewPageCount(rows.length);
    const safePage = Math.min(Math.max(page, 1), pageCount);
    const { start, end } = previewPageRange(rows.length, safePage);
    const pageRows = rows.slice(start, end);

    renderSummary(root, rows.length, start, end);
    renderRows(root, pageRows);
    renderEmpty(root, rows.length);
    renderPagination(root, pageCount, safePage, (nextPage) => {
      page = nextPage;
      render();
    });
    renderInventory(root, data.flaggedSources);
  };

  bindFilterChanges(root, () => {
    active = readActiveFilters(root);
    page = 1;
    render();
  });
  bindReset(root, () => {
    const selects = root.querySelectorAll<HTMLSelectElement>('[data-filter-sheet], [data-filter-pos], [data-filter-difficulty], [data-filter-image], [data-filter-missing]');
    for (const select of selects) select.selectedIndex = 0;
    active = {};
    page = 1;
    render();
  });

  render();
}

function bindFilterChanges(root: HTMLElement, onChange: () => void): void {
  const selectors = [
    '[data-filter-sheet]',
    '[data-filter-pos]',
    '[data-filter-difficulty]',
    '[data-filter-image]',
    '[data-filter-missing]',
  ];
  for (const selector of selectors) {
    const select = root.querySelector<HTMLSelectElement>(selector);
    select?.addEventListener('change', onChange);
  }
}

function bindReset(root: HTMLElement, onReset: () => void): void {
  root.querySelector<HTMLButtonElement>('[data-filter-reset]')?.addEventListener('click', onReset);
}

function readActiveFilters(root: HTMLElement): PreviewBrowserFilters {
  const read = <T extends string>(selector: string): T | undefined => {
    const value = root.querySelector<HTMLSelectElement>(selector)?.value;
    return value ? (value as T) : undefined;
  };
  return {
    sourceSheet: read('[data-filter-sheet]'),
    partOfSpeech: read<PreviewPartOfSpeech>('[data-filter-pos]'),
    difficulty: read('[data-filter-difficulty]'),
    imageState: read<PreviewImageState>('[data-filter-image]'),
    missingField: read<PreviewMissingField>('[data-filter-missing]'),
  };
}

function renderSummary(root: HTMLElement, total: number, start: number, end: number): void {
  const count = root.querySelector<HTMLElement>('[data-preview-total]');
  if (count) count.textContent = total.toLocaleString('ja-JP');
  const range = root.querySelector<HTMLElement>('[data-preview-range]');
  if (range) {
    const shown = total === 0 ? '0' : `${(start + 1).toLocaleString('ja-JP')} - ${end.toLocaleString('ja-JP')}`;
    range.textContent = shown;
  }
}

function renderEmpty(root: HTMLElement, total: number): void {
  const empty = root.querySelector<HTMLElement>('[data-preview-empty]');
  if (!empty) return;
  empty.hidden = total > 0;
}

function renderRows(root: HTMLElement, rows: TeacherVocabularyPreviewRow[]): void {
  const list = root.querySelector<HTMLOListElement>('[data-preview-rows]');
  if (!list) return;
  list.replaceChildren();
  for (const row of rows) {
    list.appendChild(renderRow(row));
  }
}

function renderRow(row: TeacherVocabularyPreviewRow): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row';
  li.id = row.id;
  li.appendChild(renderImageCell(row));
  li.appendChild(renderPrimaryCell(row));
  li.appendChild(renderMetadataCell(row));
  li.appendChild(renderStateCell(row));
  return li;
}

function renderImageCell(row: TeacherVocabularyPreviewRow): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'row__image';
  if (!row.image.assetPath) {
    cell.classList.add('row__image--empty');
    cell.append(missingLabelSpan('画像なし'));
    return cell;
  }
  const img = document.createElement('img');
  img.className = 'row__image__img';
  img.src = row.image.assetPath;
  img.alt = '';
  img.loading = 'lazy';
  if (row.image.width !== undefined) img.width = row.image.width;
  if (row.image.height !== undefined) img.height = row.image.height;
  img.addEventListener('error', () => {
    cell.classList.add('row__image--missing');
    cell.replaceChildren(missingLabelSpan('画像を読み込めません'));
  });
  cell.appendChild(img);
  return cell;
}

function missingLabelSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function renderPrimaryCell(row: TeacherVocabularyPreviewRow): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'row__primary';
  const word = document.createElement('p');
  word.className = 'row__word';
  word.lang = 'zh-CN';
  word.textContent = row.simplified;
  const origin = document.createElement('p');
  origin.className = 'row__origin';
  origin.textContent = `${row.sourceSheet} / ${row.sourceRow} 行`;
  cell.append(word, origin);
  return cell;
}

function renderMetadataCell(row: TeacherVocabularyPreviewRow): HTMLElement {
  const cell = document.createElement('dl');
  cell.className = 'row__metadata';
  const textEntries: Array<[string, string, string | undefined]> = [
    ['ピンイン', 'zh-Latn', row.pinyin],
    ['日本語', 'ja', row.japanese],
    ['繁体字', 'zh-Hant', row.traditional],
  ];
  for (const [label, lang, value] of textEntries) {
    const wrapper = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.lang = lang;
    dd.textContent = value || '未記入（原簿）';
    wrapper.append(dt, dd);
    cell.appendChild(wrapper);
  }
  cell.appendChild(labeledValue('品詞', POS_LABELS[row.partOfSpeech]));
  cell.appendChild(labeledValue('難易度', row.difficulty || '未記入（原簿）'));
  return cell;
}

function labeledValue(label: string, value: string): HTMLElement {
  const wrapper = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  wrapper.append(dt, dd);
  return wrapper;
}

function renderStateCell(row: TeacherVocabularyPreviewRow): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'row__state';
  const state = document.createElement('span');
  state.className = `state state--${row.image.state}`;
  state.textContent = IMAGE_LABELS[row.image.state];
  cell.appendChild(state);
  const provenance = document.createElement('span');
  provenance.textContent =
    row.image.provenance === 'teacher-provided'
      ? '教師提供'
      : row.image.provenance === 'ai-generated'
        ? 'AI生成'
        : '画像なし';
  cell.appendChild(provenance);
  if (row.missingFields.length > 0) {
    const missing = document.createElement('span');
    missing.textContent = `欠損: ${row.missingFields.map((field) => MISSING_LABELS[field]).join('、')}`;
    cell.appendChild(missing);
  }
  if (row.image.note) {
    const note = document.createElement('span');
    note.textContent = row.image.note;
    cell.appendChild(note);
  }
  return cell;
}

function renderPagination(
  root: HTMLElement,
  pageCount: number,
  page: number,
  onPage: (nextPage: number) => void,
): void {
  const container = root.querySelector<HTMLElement>('[data-pagination]');
  if (!container) return;
  container.replaceChildren();
  const safePage = Math.min(Math.max(page, 1), pageCount);
  if (safePage > 1) {
    container.appendChild(paginationButton('前の50語', () => onPage(safePage - 1)));
  } else {
    container.appendChild(paginationSpan('前の50語'));
  }
  container.appendChild(paginationSpan(`${safePage} / ${pageCount}`));
  if (safePage < pageCount) {
    container.appendChild(paginationButton('次の50語', () => onPage(safePage + 1)));
  } else {
    container.appendChild(paginationSpan('次の50語'));
  }
}

function paginationSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function paginationButton(text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function renderInventory(
  root: HTMLElement,
  flaggedSources: TeacherImageReconciliationRecord[],
): void {
  const countTargets = root.querySelectorAll<HTMLElement>('[data-inventory-count]');
  for (const target of countTargets) target.textContent = String(flaggedSources.length);
  const list = root.querySelector<HTMLUListElement>('[data-inventory-list]');
  if (!list) return;
  list.replaceChildren();
  for (const item of flaggedSources) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = item.relativePath;
    const state = document.createElement('span');
    state.textContent = item.state === 'ambiguous' ? '対応が曖昧' : '未対応';
    li.append(code, state);
    list.appendChild(li);
  }
}
