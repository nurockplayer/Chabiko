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

/**
 * Selector for every kanji-bridge field carrying per-form provenance: the
 * headword AND each example text. The headword is additionally marked
 * `data-script-annotation-host` because only it shows the #251 fallback
 * annotation.
 */
const FIELD_SELECTOR = '[data-script-path-default]';

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

// ─── Field application ─────────────────────────────────────────────────────────

/** Replace the element's leading non-empty text node with the selected form. */
function setLeadingText(element: HTMLElement, text: string): void {
  const leading = Array.from(element.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== '',
  );
  if (leading !== undefined) leading.textContent = text;
}

/**
 * Apply the effective preference to one kanji-bridge field (a headword or an
 * example text element).
 *
 * - When `selectScript` returns an available form (post-promotion: the
 *   requested script is authored/verified), the leading text node is updated
 *   to that form and `lang` is set to `zh-Hans` (Simplified) or `zh-Hant`
 *   (Traditional) accordingly.
 * - When no eligible form exists (`status: 'unavailable'`), the static
 *   path-default SSR text and its `lang` are kept — the runtime never
 *   fabricates or converts a script form.
 * - The #251 fallback annotation is managed ONLY on headword hosts
 *   (`data-script-annotation-host`); example texts follow the preference
 *   without their own annotation.
 *
 * Updates only the visible text, `lang`, and (for headwords) the annotation —
 * never storage, focus, order, the relation filter/URL, or the example set.
 */
function applyField(element: HTMLElement, preference: ScriptPreference): void {
  const forms = readFieldForms(element);
  if (forms === null) return;

  const result = selectScript(forms.pathDefault, forms.pathDefaultStatus, preference, {
    traditional: forms.traditional,
    traditionalStatus: forms.traditionalStatus,
    simplified: forms.simplified,
    simplifiedStatus: forms.simplifiedStatus,
  });

  // An available result carries the directly-selectable form's status
  // ('authored' | 'verified'); 'unavailable' means no eligible form exists.
  if (result.status !== 'unavailable') {
    setLeadingText(element, result.script);
    // Lang follows the displayed form: a direct Simplified selection is
    // zh-Hans; everything else (Traditional/path-default, or a fallback to the
    // path-default Traditional form) is zh-Hant. Comparing the script text is
    // unreliable for characters identical in both scripts (交通, 銀行, …).
    element.lang =
      preference === 'simplified' && result.isFallback === false
        ? 'zh-Hans'
        : 'zh-Hant';
  }

  // The annotation is a headword-only affordance.
  if (!element.hasAttribute('data-script-annotation-host')) return;

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
 * Apply the global script preference to every kanji-bridge field (headword
 * texts and example texts).
 *
 * Behavior contract (#256/#235):
 * - Reads ONLY the validated root dataset
 *   (`document.documentElement.dataset.scriptPreference`) and the #252
 *   `chabiko:script-preference-change` document event; never reads or writes
 *   storage, and never listens to storage or pageshow directly (the header
 *   control propagates external refreshes through the document event).
 * - Preference changes preserve the `?relation=` filter/URL, source order,
 *   scroll position, and focus; no storage writes happen beyond the global
 *   preference owner.
 * - Re-initialization tears down the previous binding, so document listeners
 *   are never duplicated.
 *
 * @param root  the element whose dataset mirrors the frozen preference
 *   (defaults to `document.documentElement`).
 * @param scope  the subtree to scan for fields (defaults to the whole
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
      scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
    )) {
      applyField(field, preference);
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
