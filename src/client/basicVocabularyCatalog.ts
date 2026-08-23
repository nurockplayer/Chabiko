import {
  BasicVocabularyProgressStore,
} from '../domain/basicVocabularyProgress';
import { getBasicVocabularyProgressCoordinator } from './basicVocabularyProgressCoordinator';
import {
  selectBasicVocabularyCatalogPage,
  type BasicVocabularyCatalogStatusFilter,
} from '../domain/basicVocabularyCatalog';
import type { BasicVocabularyCatalogItem } from '../content/basicVocabularyCatalog';
import type { VocabularyProgressStatus } from '../domain/vocabularyProgress';

/** Read-only browser controller for the full-word catalog at
 * `/vocabulary/basic/words/`. Binds the #278 pure domain selection logic to
 * the DOM and to the local progress store, so every render is a truthful
 * snapshot of `store.getStatus()` — search, status filter, and page are
 * page-memory only. The catalog is never mutated and progress is never
 * written here. */
export function initBasicVocabularyCatalog(root: HTMLElement): () => void {
  cleanups.get(root)?.();

  const parsed = readCatalogPayload(root);
  if (parsed === null) {
    setControlsDisabled(root, true);
    const summary = root.querySelector<HTMLElement>('[data-catalog-summary]');
    if (summary) summary.textContent = '単語一覧を読み込めませんでした';
    const results = root.querySelector<HTMLElement>('[data-catalog-results]');
    if (results) results.replaceChildren();
    return () => undefined;
  }
  const items = parsed;

  /** The coordinator runtime store when present (Issue #293), read-only. When
   * the account coordinator is not installed, fall back to a direct guest
   * store so the catalog route keeps its pre-#293 behavior. */
  const coordinator = getBasicVocabularyProgressCoordinator();
  const directStore =
    coordinator === null ? new BasicVocabularyProgressStore() : null;
  let store: BasicVocabularyProgressStore =
    coordinator !== null ? coordinator.getStore() : directStore!;

  const searchInput = root.querySelector<HTMLInputElement>('[data-catalog-search]');
  const statusSelect = root.querySelector<HTMLSelectElement>('[data-catalog-status]');
  const summaryElement = root.querySelector<HTMLElement>('[data-catalog-summary]');
  const resultsList = root.querySelector<HTMLElement>('[data-catalog-results]');
  const previousButton = root.querySelector<HTMLButtonElement>('[data-catalog-page="previous"]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-catalog-page="next"]');
  const indicatorElement = root.querySelector<HTMLElement>('[data-catalog-page-indicator]');

  let statusFilter: BasicVocabularyCatalogStatusFilter = 'all';
  let searchText = '';
  let page = 1;

  function readStatusMap(): Record<string, VocabularyProgressStatus> {
    const statusById: Record<string, VocabularyProgressStatus> = {};
    for (const item of items) statusById[item.learnerId] = store.getStatus(item.learnerId);
    return statusById;
  }

  function statusLabel(status: VocabularyProgressStatus): string {
    if (status === 'learning') return '学習中';
    if (status === 'learned') return '習得済み';
    return '新規';
  }

  function buildCard(pageItem: {
    item: BasicVocabularyCatalogItem;
    status: VocabularyProgressStatus;
  }): HTMLLIElement {
    const item = pageItem.item;
    const card = document.createElement('li');
    card.className = 'basic-vocabulary-catalog-card';

    const illustration = document.createElement('div');
    illustration.className = 'basic-vocabulary-catalog-illustration';
    const image = document.createElement('img');
    image.src = item.illustration.assetPath;
    image.width = item.illustration.width;
    image.height = item.illustration.height;
    image.alt = item.illustration.altJa;
    image.loading = 'lazy';
    image.decoding = 'async';
    illustration.append(image);
    card.append(illustration);

    const body = document.createElement('div');
    body.className = 'basic-vocabulary-catalog-body';

    const heading = document.createElement('h3');
    heading.className = 'basic-vocabulary-catalog-simplified';
    heading.lang = 'zh-Hans';
    heading.textContent = item.simplified;
    body.append(heading);

    if (item.traditional !== undefined) {
      const traditional = document.createElement('p');
      traditional.className = 'basic-vocabulary-catalog-traditional';
      traditional.lang = 'zh-Hant';
      traditional.textContent = item.traditional;
      body.append(traditional);
    }
    if (item.pinyin !== undefined) {
      const pinyin = document.createElement('p');
      pinyin.className = 'basic-vocabulary-catalog-pinyin';
      pinyin.lang = 'zh-Latn';
      pinyin.textContent = item.pinyin;
      body.append(pinyin);
    }
    if (item.japanese !== undefined) {
      const japanese = document.createElement('p');
      japanese.className = 'basic-vocabulary-catalog-japanese';
      japanese.lang = 'ja';
      japanese.textContent = item.japanese;
      body.append(japanese);
    }

    const badge = document.createElement('span');
    badge.className = 'basic-vocabulary-catalog-badge';
    badge.dataset.status = pageItem.status;
    badge.textContent = statusLabel(pageItem.status);
    body.append(badge);

    card.append(body);
    return card;
  }

  function render(): void {
    const statusById = readStatusMap();
    const result = selectBasicVocabularyCatalogPage(items, statusById, {
      searchText,
      status: statusFilter,
      page,
    });
    page = result.page;

    if (summaryElement) {
      summaryElement.textContent =
        result.filteredCount === 0
          ? '条件に一致する単語がありません'
          : `全${result.totalCount}語中 ${result.filteredCount}語を表示`;
    }

    if (resultsList) {
      const fragment = document.createDocumentFragment();
      for (const pageItem of result.items) fragment.append(buildCard(pageItem));
      resultsList.replaceChildren(fragment);
    }

    if (previousButton) previousButton.disabled = result.page <= 1;
    if (nextButton) nextButton.disabled = result.page >= result.pageCount;
    if (indicatorElement) {
      indicatorElement.textContent = `${result.page} / ${result.pageCount}`;
    }
  }

  function handleSearchInput(): void {
    const value = searchInput ? searchInput.value : '';
    if (value === searchText) return;
    searchText = value;
    page = 1;
    render();
  }

  function handleStatusChange(): void {
    const value = statusSelect ? (statusSelect.value as BasicVocabularyCatalogStatusFilter) : 'all';
    if (value === statusFilter) return;
    statusFilter = value;
    page = 1;
    render();
  }

  function handlePage(direction: 'previous' | 'next'): void {
    const target =
      direction === 'previous'
        ? { searchText, status: statusFilter, page: page - 1 }
        : { searchText, status: statusFilter, page: page + 1 };
    const statusById = readStatusMap();
    const result = selectBasicVocabularyCatalogPage(items, statusById, target);
    if (result.page === page) return;
    page = result.page;
    render();
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>('[data-catalog-page]');
    if (!control || !root.contains(control)) return;
    handlePage(control.dataset.catalogPage as 'previous' | 'next');
  }

  function refreshFromStore(): void {
    store.refresh();
    render();
  }

  function onPageShow(): void {
    refreshFromStore();
  }

  function onStorage(event: StorageEvent): void {
    if (!store.isRelevantStorageArea(event.storageArea)) return;
    if (!store.isRelevantStorageKey(event.key)) return;
    if (event.key === null || event.newValue === null) {
      if (store.acceptExternalClear()) {
        render();
        return;
      }
    }
    refreshFromStore();
  }

  // Coordinator bridge (Issue #293): an identity or sync refresh recomputes the
  // status badges while preserving search/filter/page/focus except a required
  // page clamp. Browsing never creates a rating/reset/dirty mutation or a
  // network request, and can never leak another identity's status.
  let unsubscribeCoordinator: () => void = () => undefined;
  function onCoordinatorSnapshot(): void {
    if (coordinator === null) return;
    store = coordinator.getStore();
    render();
  }
  if (coordinator !== null) {
    unsubscribeCoordinator = coordinator.subscribe(onCoordinatorSnapshot);
  }

  root.addEventListener('click', onClick);
  searchInput?.addEventListener('input', handleSearchInput);
  statusSelect?.addEventListener('change', handleStatusChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);

  render();

  const cleanup = (): void => {
    unsubscribeCoordinator();
    root.removeEventListener('click', onClick);
    searchInput?.removeEventListener('input', handleSearchInput);
    statusSelect?.removeEventListener('change', handleStatusChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('storage', onStorage);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const cleanups = new WeakMap<HTMLElement, () => void>();

function readCatalogPayload(root: HTMLElement): readonly BasicVocabularyCatalogItem[] | null {
  const script = root.querySelector<HTMLElement>('#basic-vocabulary-catalog-data');
  if (!script || !script.textContent) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(script.textContent);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  if (!parsed.every(isValidCatalogItem)) return null;
  return parsed as readonly BasicVocabularyCatalogItem[];
}

function isValidCatalogItem(value: unknown): value is BasicVocabularyCatalogItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.learnerId !== 'string' || item.learnerId === '') return false;
  if (typeof item.simplified !== 'string' || item.simplified === '') return false;
  if (item.traditional !== undefined && typeof item.traditional !== 'string') return false;
  if (item.pinyin !== undefined && typeof item.pinyin !== 'string') return false;
  if (item.japanese !== undefined && typeof item.japanese !== 'string') return false;
  if (item.partOfSpeech !== 'noun' && item.partOfSpeech !== 'verb' &&
      item.partOfSpeech !== 'adjective' && item.partOfSpeech !== 'adverb') return false;
  if (item.difficulty !== undefined && typeof item.difficulty !== 'string') return false;
  const illustration = item.illustration;
  if (illustration === null || typeof illustration !== 'object' || Array.isArray(illustration)) {
    return false;
  }
  const ill = illustration as Record<string, unknown>;
  if (typeof ill.assetPath !== 'string' || ill.assetPath === '') return false;
  if (typeof ill.width !== 'number' || !Number.isFinite(ill.width) || ill.width <= 0) return false;
  if (typeof ill.height !== 'number' || !Number.isFinite(ill.height) || ill.height <= 0) return false;
  if (typeof ill.altJa !== 'string') return false;
  return true;
}

function setControlsDisabled(root: HTMLElement, disabled: boolean): void {
  const controls = root.querySelectorAll<HTMLElement>(
    '[data-catalog-search], [data-catalog-status], [data-catalog-page]',
  );
  for (const control of controls) {
    (control as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = disabled;
  }
}
