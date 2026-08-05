import {
  SCRIPT_PREFERENCE_STORAGE_KEY,
  ScriptPreferenceStore,
  type ScriptPreference,
} from '../lib/scriptPreference';

// ─── Public constants ─────────────────────────────────────────────────────────

/** Bubbling document event dispatched exactly once per effective change. */
export const SCRIPT_PREFERENCE_EVENT = 'chabiko:script-preference-change';

/** The only select id this module binds. */
export const SCRIPT_PREFERENCE_CONTROL_ID = 'script-preference-select';

/** Exact visible label frozen in Issue #252. */
export const SCRIPT_PREFERENCE_LABEL = '漢字表記';

/** Exact option labels and values frozen in Issue #252. */
export const SCRIPT_PREFERENCE_OPTIONS: ReadonlyArray<{
  readonly label: string;
  readonly value: ScriptPreference;
}> = [
  { label: 'コース標準', value: 'path-default' },
  { label: '繁体字', value: 'traditional' },
  { label: '簡体字', value: 'simplified' },
];

function isControlledPreference(value: unknown): value is ScriptPreference {
  return (
    value === 'path-default' || value === 'traditional' || value === 'simplified'
  );
}

/**
 * Read and validate the root dataset value set by the BaseLayout pre-paint
 * bootstrap. Anything outside the three controlled values falls back to
 * `path-default`.
 */
function readRootPreference(root: HTMLElement): ScriptPreference {
  const value = root.dataset.scriptPreference;
  return isControlledPreference(value) ? value : 'path-default';
}

function dispatchPreferenceChange(preference: ScriptPreference): void {
  document.dispatchEvent(
    new CustomEvent<{ preference: ScriptPreference }>(SCRIPT_PREFERENCE_EVENT, {
      bubbles: true,
      detail: { preference },
    }),
  );
}

// ─── Singleton controller ──────────────────────────────────────────────────────

interface ActiveController {
  cleanup: () => void;
}

/** A single active controller per page; re-init tears the previous one down. */
let active: ActiveController | null = null;

/**
 * Bind the native script-preference `<select>` to the validated root dataset
 * and to the Issue #251 store.
 *
 * Behavior contract (Issue #252):
 * - Initializes from the validated `document.documentElement.dataset.
 *   scriptPreference` value and never writes storage or dispatches on init.
 * - Only a learner selection writes storage, and only through the
 *   {@link ScriptPreferenceStore}.
 * - Any effective-preference change through learner selection, a relevant
 *   `storage` event, `pageshow`, or an external clear updates the root
 *   dataset and the select and dispatches exactly one bubbling document
 *   event `chabiko:script-preference-change` carrying the effective
 *   preference.
 * - Storage/pageshow/external-clear refreshes never write storage.
 * - An external clear resets the root dataset/select to `path-default`.
 * - Re-initialization tears down the previous controller, so listeners,
 *   events, and writes are never duplicated.
 *
 * @param root  the element whose dataset mirrors the frozen preference
 *   (defaults to `document.documentElement`).
 * @param select  the native select to bind (defaults to the element with
 *   {@link SCRIPT_PREFERENCE_CONTROL_ID}).
 * @returns a cleanup that removes this controller's listeners.
 */
export function initScriptPreferenceControl(
  root: HTMLElement = document.documentElement,
  select: HTMLSelectElement | null = document.getElementById(
    SCRIPT_PREFERENCE_CONTROL_ID,
  ) as HTMLSelectElement | null,
): () => void {
  active?.cleanup();
  if (!(select instanceof HTMLSelectElement)) return () => undefined;
  const boundSelect: HTMLSelectElement = select;

  const store = new ScriptPreferenceStore();
  let applied: ScriptPreference = readRootPreference(root);

  function apply(preference: ScriptPreference, dispatchChange: boolean): void {
    const changed = preference !== applied;
    applied = preference;
    root.dataset.scriptPreference = preference;
    boundSelect.value = preference;
    if (changed && dispatchChange) dispatchPreferenceChange(preference);
  }

  function onChange(): void {
    const value = boundSelect.value;
    if (!isControlledPreference(value)) return;
    if (value === applied) return;
    // Learner selection is the only path that persists.
    store.set(value);
    apply(value, true);
  }

  function onStorage(event: StorageEvent): void {
    if (
      event.storageArea !== null &&
      event.storageArea !== window.localStorage
    ) {
      return;
    }
    if (event.key !== SCRIPT_PREFERENCE_STORAGE_KEY && event.key !== null) {
      return;
    }
    if (event.key === null || event.newValue === null) {
      if (store.acceptExternalClear()) {
        apply('path-default', true);
        return;
      }
    }
    store.refresh();
    apply(store.get(), true);
  }

  function onPageShow(): void {
    store.refresh();
    apply(store.get(), true);
  }

  boundSelect.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', onPageShow);

  // Initialize from the validated root dataset without writing or dispatching.
  apply(readRootPreference(root), false);

  const cleanup = (): void => {
    boundSelect.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', onPageShow);
    if (active === controller) active = null;
  };
  const controller: ActiveController = { cleanup };
  active = controller;
  return cleanup;
}
