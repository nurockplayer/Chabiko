import {
  FALLBACK_ANNOTATION,
  selectScript,
  type ScriptStatus,
} from '../domain/scriptSelection';
import { SCRIPT_PREFERENCE_EVENT } from './scriptPreferenceControl';
import type { ScriptPreference } from '../lib/scriptPreference';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** CSS class used for the #251 fallback annotation element. */
const FALLBACK_CLASS = 'script-fallback';

/** Selector for every kanji-bridge headword carrying per-form provenance. */
const HEADWORD_SELECTOR = '[data-script-path-default]';

// ─── Effective preference ──────────────────────────────────────────────────────

/**
 * Read and validate the root dataset value set by the BaseLayout pre-paint
 * bootstrap. Anything outside the three controlled values falls back to
 * `path-default` (Issue #251/#252).
 */
function readRootPreference(root: HTMLElement): ScriptPreference {
  const value = root.dataset.scriptPreference;
  if (value === 'path-default' || value === 'traditional' || value === 'simplified') {
    return value;
  }
  return 'path-default';
}

// ─── Per-field provenance ──────────────────────────────────────────────────────

interface FieldForms {
  pathDefault: string;
  pathDefaultStatus: ScriptStatus;
  traditional?: string;
  traditionalStatus?: ScriptStatus;
  simplified?: string;
  simplifiedStatus?: ScriptStatus;
}

/** Normalise a status attribute to the controlled statuses; anything else
 *  (missing or malformed) becomes absent. */
function readStatus(value: string | null): ScriptStatus | undefined {
  if (
    value === 'authored' ||
    value === 'verified' ||
    value === 'generated' ||
    value === 'unavailable' ||
    value === 'absent'
  ) {
    return value;
  }
  return undefined;
}

function readFieldForms(element: HTMLElement): FieldForms | null {
  const pathDefault = element.getAttribute('data-script-path-default');
  if (pathDefault === null) return null;
  const pathDefaultStatus =
    readStatus(element.getAttribute('data-script-path-default-status')) ??
    'authored';
  const explicitTraditional = element.getAttribute('data-script-traditional');
  const explicitTraditionalStatus = readStatus(
    element.getAttribute('data-script-traditional-status'),
  );
  return {
    pathDefault,
    pathDefaultStatus,
    traditional: explicitTraditional ?? pathDefault,
    traditionalStatus: explicitTraditionalStatus ?? pathDefaultStatus,
    simplified: element.getAttribute('data-script-simplified') ?? undefined,
    simplifiedStatus: readStatus(
      element.getAttribute('data-script-simplified-status'),
    ),
  };
}

// ─── Headword application ──────────────────────────────────────────────────────

/**
 * Apply the effective preference to one kanji-bridge headword. The headword is
 * the path-default Traditional form; every form in the current corpus is
 * `generated` (no authored/verified form exists), so `selectScript` returns
 * `{ status: 'unavailable' }` under every preference. Per the #235/#256
 * contract the headword ALWAYS keeps its static path-default Traditional text
 * (never blank, never fabricated) and ALWAYS shows the exact #251 fallback
 * annotation whenever the requested form is not directly selectable
 * (`isFallback` or `status: 'unavailable'`) — the annotation is therefore
 * present on every entry in every preference state. Updates only the visible
 * Chinese text, the `lang` attribute, and the annotation — never storage,
 * focus, order, the relation filter/URL, or the entry's examples.
 */
function applyHeadword(element: HTMLElement, preference: ScriptPreference): void {
  const forms = readFieldForms(element);
  if (forms === null) return;

  const result = selectScript(forms.pathDefault, forms.pathDefaultStatus, preference, {
    traditional: forms.traditional,
    traditionalStatus: forms.traditionalStatus,
    simplified: forms.simplified,
    simplifiedStatus: forms.simplifiedStatus,
  });

  // The headword keeps its static path-default text (never blank/fabricated).
  // The lang attribute follows the displayed form (always the Traditional
  // course standard for this corpus).
  element.lang = 'zh-Hant';

  const showAnnotation =
    result.status === 'unavailable' || result.isFallback === true;
  const existing = element.querySelector<HTMLElement>(`.${FALLBACK_CLASS}`);
  if (showAnnotation) {
    if (existing === null) {
      const span = document.createElement('span');
      span.className = FALLBACK_CLASS;
      span.lang = 'ja';
      span.textContent = FALLBACK_ANNOTATION;
      element.append(span);
    }
  } else {
    existing?.remove();
  }
}

// ─── Singleton controller ──────────────────────────────────────────────────────

interface ActiveBinding {
  cleanup: () => void;
}

/** A single active binding per page; re-init tears the previous one down. */
let active: ActiveBinding | null = null;

/**
 * Apply the global script preference to every kanji-bridge headword.
 *
 * Behavior contract (#256/#235):
 * - Reads ONLY the validated root dataset
 *   (`document.documentElement.dataset.scriptPreference`) and the #252
 *   `chabiko:script-preference-change` document event; never reads or writes
 *   storage, and never listens to storage or pageshow directly (the header
 *   control propagates external refreshes through the document event).
 * - Preference changes preserve the `?relation=` filter/URL, source order,
 *   scroll position, and focus; no storage writes happen beyond the global
 *   preference owner, and example forms stay unchanged.
 * - Re-initialization tears down the previous binding, so document listeners
 *   are never duplicated.
 *
 * @param root  the element whose dataset mirrors the frozen preference
 *   (defaults to `document.documentElement`).
 * @param scope  the subtree to scan for headwords (defaults to the whole
 *   document).
 * @returns a cleanup that removes this binding's document listener.
 */
export function initKanjiBridgeScriptPreference(
  root: HTMLElement = document.documentElement,
  scope: ParentNode = document,
): () => void {
  active?.cleanup();

  function apply(): void {
    const preference = readRootPreference(root);
    for (const field of Array.from(
      scope.querySelectorAll<HTMLElement>(HEADWORD_SELECTOR),
    )) {
      applyHeadword(field, preference);
    }
  }

  function onPreferenceChange(): void {
    apply();
  }

  document.addEventListener(SCRIPT_PREFERENCE_EVENT, onPreferenceChange);
  apply();

  const binding: ActiveBinding = {
    cleanup: () => {
      document.removeEventListener(SCRIPT_PREFERENCE_EVENT, onPreferenceChange);
      if (active === binding) active = null;
    },
  };
  active = binding;
  return binding.cleanup;
}
