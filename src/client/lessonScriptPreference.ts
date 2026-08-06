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

/** Selector for every reading field carrying per-form provenance. */
const SCRIPT_FIELD_SELECTOR = '[data-script-path-default]';

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
  const pathDefaultStatus = readStatus(
    element.getAttribute('data-script-path-default-status'),
  ) ?? 'authored';
  // A lesson route's path default is Traditional (Issue #253 frozen behavior).
  // When a field does not carry an explicit traditional form, its authored
  // path-default form IS the traditional form, so a `traditional` preference
  // selects it directly instead of showing a fallback.
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

/**
 * Apply the effective preference to one lesson reading field. Updates only the
 * visible Chinese text, the `lang` attribute, and the optional #251 fallback
 * annotation — never storage, focus, practice, answers, or navigation.
 */
function applyField(element: HTMLElement, preference: ScriptPreference): void {
  const forms = readFieldForms(element);
  if (forms === null) return;

  const result = selectScript(
    forms.pathDefault,
    forms.pathDefaultStatus,
    preference,
    {
      traditional: forms.traditional,
      traditionalStatus: forms.traditionalStatus,
      simplified: forms.simplified,
      simplifiedStatus: forms.simplifiedStatus,
    },
  );

  const annotation = element.querySelector<HTMLElement>(`.${FALLBACK_CLASS}`);

  if (result.status === 'unavailable') {
    // No eligible form exists: keep the static path-default text already in the
    // markup (never blank or fabricate reading content) and clear any prior
    // annotation.
    annotation?.remove();
    return;
  }

  // The script tag follows the actually-displayed form: the simplified form is
  // rendered as zh-Hans, and any other displayed text (the authored
  // path-default Traditional form, or a fallback to it) as zh-Hant. This holds
  // for direct selections and for fallbacks — e.g. when the Traditional form
  // is generated/unavailable/absent but the simplified form is authored/
  // verified, the simplified text is displayed and must be labeled zh-Hans,
  // not zh-Hant.
  const lang = result.script === forms.simplified ? 'zh-Hans' : 'zh-Hant';

  // Update only the leading text node so any child annotation is preserved.
  const leading = element.firstChild;
  if (leading !== null && leading.nodeType === Node.TEXT_NODE) {
    leading.textContent = result.script;
  } else {
    element.insertBefore(
      document.createTextNode(result.script),
      element.firstChild,
    );
  }
  element.lang = lang;

  if (result.isFallback) {
    if (annotation === null) {
      const span = document.createElement('span');
      span.className = FALLBACK_CLASS;
      span.lang = 'ja';
      span.textContent = FALLBACK_ANNOTATION;
      element.append(span);
    }
  } else {
    annotation?.remove();
  }
}

// ─── Singleton controller ──────────────────────────────────────────────────────

interface ActiveBinding {
  cleanup: () => void;
}

/** A single active binding per page; re-init tears the previous one down. */
let active: ActiveBinding | null = null;

/**
 * Apply the global script preference to every lesson reading field that carries
 * per-form provenance on a lesson route.
 *
 * Behavior contract (Issue #253):
 * - Reads ONLY the validated root dataset
 *   (`document.documentElement.dataset.scriptPreference`) and the #252
 *   `chabiko:script-preference-change` document event; never reads or writes
 *   storage, and never listens to storage or pageshow directly (the header
 *   control propagates external refreshes through the document event).
 * - Only the visible Chinese text, `lang` (`zh-Hant`/`zh-Hans`), and the exact
 *   #251 fallback annotation change — no focus movement, practice, answers,
 *   progress, or navigation changes.
 * - Re-initialization tears down the previous binding, so document listeners
 *   are never duplicated.
 *
 * @param root  the element whose dataset mirrors the frozen preference
 *   (defaults to `document.documentElement`).
 * @param scope  the subtree to scan for reading fields (defaults to the whole
 *   document).
 * @returns a cleanup that removes this binding's document listener.
 */
export function initLessonScriptPreference(
  root: HTMLElement = document.documentElement,
  scope: ParentNode = document,
): () => void {
  active?.cleanup();

  function apply(): void {
    const preference = readRootPreference(root);
    for (const field of Array.from(
      scope.querySelectorAll<HTMLElement>(SCRIPT_FIELD_SELECTOR),
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
