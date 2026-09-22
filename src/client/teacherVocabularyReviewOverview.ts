import {
  selectTeacherVocabularyReviewPage,
  type TeacherVocabularyDecisionFilter,
  type TeacherVocabularyPartOfSpeechFilter,
} from '../domain/teacherVocabularyReviewOverview';
import type { TeacherVocabularyReviewItem } from '../content/teacherVocabularyReviewOverview';

const cleanups = new WeakMap<HTMLElement, () => void>();

function readItems(root: HTMLElement): TeacherVocabularyReviewItem[] | null {
  const source = root.querySelector<HTMLScriptElement>('[data-teacher-vocabulary-review-data]');
  if (source?.textContent === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(source.textContent);
    if (!Array.isArray(parsed)) return null;
    return parsed as TeacherVocabularyReviewItem[];
  } catch {
    return null;
  }
}

function partOfSpeechLabel(value: TeacherVocabularyReviewItem['partOfSpeech']): string {
  return ({ noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞' })[value];
}

/** Browser binding for the protected, read-only vocabulary overview. */
export function initTeacherVocabularyReviewOverview(root: HTMLElement): () => void {
  cleanups.get(root)?.();
  const items = readItems(root);
  const search = root.querySelector<HTMLInputElement>('[data-tvro-search]');
  const sourceSheet = root.querySelector<HTMLSelectElement>('[data-tvro-source-sheet]');
  const partOfSpeech = root.querySelector<HTMLSelectElement>('[data-tvro-part-of-speech]');
  const decision = root.querySelector<HTMLSelectElement>('[data-tvro-decision]');
  const summary = root.querySelector<HTMLElement>('[data-tvro-summary]');
  const results = root.querySelector<HTMLElement>('[data-tvro-results]');
  const previous = root.querySelector<HTMLButtonElement>('[data-tvro-page="previous"]');
  const next = root.querySelector<HTMLButtonElement>('[data-tvro-page="next"]');
  const indicator = root.querySelector<HTMLElement>('[data-tvro-page-indicator]');
  if (items === null || !search || !sourceSheet || !partOfSpeech || !decision || !summary || !results || !previous || !next || !indicator) {
    if (summary) summary.textContent = '単語一覧を読み込めませんでした';
    return () => undefined;
  }

  let page = 1;
  const render = () => {
    const result = selectTeacherVocabularyReviewPage(items, {
      searchText: search.value,
      sourceSheet: sourceSheet.value,
      partOfSpeech: partOfSpeech.value as TeacherVocabularyPartOfSpeechFilter,
      decision: decision.value as TeacherVocabularyDecisionFilter,
      page,
    });
    page = result.page;
    summary.textContent = result.filteredCount === 0
      ? '条件に一致する単語がありません'
      : `全${result.totalCount}語中 ${result.filteredCount}語を表示 ・ 未確認 ${result.progress.unreviewed}語`;
    const fragment = document.createDocumentFragment();
    for (const item of result.items) {
      const row = document.createElement('li');
      row.className = 'teacher-vocabulary-review-row';
      row.dataset.tvroItemId = item.learnerId;
      const fields: Array<[string, string, string | undefined]> = [
        ['簡体字', 'simplified', item.simplified],
        ['繁体字', 'traditional', item.traditional ?? '—'],
        ['ピンイン', 'pinyin', item.pinyin ?? '—'],
        ['日本語', 'japanese', item.japanese ?? '—'],
        ['品詞', 'part-of-speech', partOfSpeechLabel(item.partOfSpeech)],
        ['出典', 'source', `${item.sourceSheet} / ${item.sourceRow} 行`],
        ['状態', 'decision', '未確認'],
        ['ID', 'id', item.learnerId],
      ];
      for (const [label, field, value] of fields) {
        const cell = document.createElement('span');
        cell.className = `teacher-vocabulary-review-cell teacher-vocabulary-review-cell--${field}`;
        const name = document.createElement('span');
        name.className = 'teacher-vocabulary-review-cell-label';
        name.textContent = label;
        const content = document.createElement('span');
        content.textContent = value ?? '';
        if (field === 'simplified') content.lang = 'zh-Hans';
        if (field === 'traditional') content.lang = 'zh-Hant';
        if (field === 'pinyin') content.lang = 'zh-Latn';
        if (field === 'japanese') content.lang = 'ja';
        cell.append(name, content);
        row.append(cell);
      }
      fragment.append(row);
    }
    results.replaceChildren(fragment);
    previous.disabled = result.page <= 1;
    next.disabled = result.page >= result.pageCount;
    indicator.textContent = `${result.page} / ${result.pageCount}`;
  };
  const reset = () => { page = 1; render(); };
  const goPrevious = () => { page -= 1; render(); };
  const goNext = () => { page += 1; render(); };
  search.addEventListener('input', reset);
  sourceSheet.addEventListener('change', reset);
  partOfSpeech.addEventListener('change', reset);
  decision.addEventListener('change', reset);
  previous.addEventListener('click', goPrevious);
  next.addEventListener('click', goNext);
  render();
  const cleanup = () => {
    search.removeEventListener('input', reset); sourceSheet.removeEventListener('change', reset);
    partOfSpeech.removeEventListener('change', reset); decision.removeEventListener('change', reset);
    previous.removeEventListener('click', goPrevious); next.removeEventListener('click', goNext);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
