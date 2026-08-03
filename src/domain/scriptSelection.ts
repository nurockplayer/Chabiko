import type { ScriptPreference } from '../lib/scriptPreference';

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * Directly selectable statuses. Only `authored` and `verified` are eligible;
 * `generated` and `unavailable` are never selected directly.
 */
export type DirectSelectableStatus = 'authored' | 'verified';

export type ScriptStatus =
  | DirectSelectableStatus
  | 'generated'
  | 'unavailable'
  | 'absent';

/**
 * Pure per-form status plus optional text. A status of `absent` means the form
 * does not exist (no text). Text is returned unchanged and is never converted
 * at runtime.
 */
export interface ScriptFormState {
  readonly traditional?: string;
  readonly traditionalStatus?: ScriptStatus;
  readonly simplified?: string;
  readonly simplifiedStatus?: ScriptStatus;
}

/** An available selection result: the script text plus the status that earned it. */
export interface AvailableScriptSelection {
  readonly preference: ScriptPreference;
  readonly script: string;
  readonly status: DirectSelectableStatus;
  /**
   * True when the requested form was not directly available and a different
   * form's text was returned instead.
   */
  readonly isFallback: boolean;
  /** Fallback reason label, exactly as frozen in the issue, when fallback. */
  readonly fallbackReason?: string;
}

/**
 * A stable result when no eligible form exists. Never fabricates script text.
 */
export interface UnavailableScriptSelection {
  readonly preference: ScriptPreference;
  readonly status: 'unavailable';
}

export type ScriptSelectionResult =
  | AvailableScriptSelection
  | UnavailableScriptSelection;

// ─── Domain constants ──────────────────────────────────────────────────────────

/** Fallback annotation, exactly as frozen in the issue contract. */
export const FALLBACK_ANNOTATION = 'この表記は未収録のため、コース標準を表示しています。';

// ─── Internal validation ───────────────────────────────────────────────────────

function isValidDirectStatus(value: unknown): value is DirectSelectableStatus {
  return value === 'authored' || value === 'verified';
}

/**
 * Structural validation of the input status. Only `authored`/`verified` are
 * directly selectable; `generated`/`unavailable` are recognised but not
 * selectable; anything else (including absent forms and garbage) normalises to
 * `absent`. Selection never throws and never trusts malformed input.
 */
function normalizeStatus(value: unknown, hasForm: boolean): ScriptStatus {
  if (!hasForm) return 'absent';
  if (isValidDirectStatus(value)) return value;
  if (value === 'generated' || value === 'unavailable' || value === 'absent') {
    return value;
  }
  return 'absent';
}

// ─── Selection API ─────────────────────────────────────────────────────────────

/**
 * Pure, synchronous script selection. Never converts script at runtime and
 * never reads or writes any storage, network, DOM, time, or randomness.
 *
 * Frozen selection contract (Issue #251):
 * - Directly selectable status is only `authored` or `verified`.
 * - A requested eligible form is returned unchanged.
 * - `path-default` returns the eligible path-default form.
 * - When the requested form is unavailable/generated, fall back first to the
 *   eligible path-default form, then to the other eligible form.
 * - The fallback annotation is exactly {@link FALLBACK_ANNOTATION}.
 * - If no eligible form exists, return a stable unavailable result rather than
 *   fabricated text.
 *
 * Interpretation note: for `path-default` preference with an ineligible
 * path-default form, the issue contract fixes only the order "eligible path
 * default → other eligible form" for the requested-form (Traditional/Simplified)
 * case. For the path-default edge the two remaining forms are tried in a fixed,
 * deterministic order (traditional, then simplified).
 *
 * @param pathDefault  the course-standard script text for the path.
 * @param pathDefaultStatus  status of the path-default form.
 * @param preference  the learner's frozen script preference.
 * @param forms  optional Traditional/Simplified forms with per-form status.
 */
export function selectScript(
  pathDefault: string,
  pathDefaultStatus: unknown,
  preference: ScriptPreference,
  forms: ScriptFormState,
): ScriptSelectionResult {
  const pathDefaultEligible = isValidDirectStatus(pathDefaultStatus);
  const traditionalStatus = normalizeStatus(
    forms.traditionalStatus,
    typeof forms.traditional === 'string',
  );
  const simplifiedStatus = normalizeStatus(
    forms.simplifiedStatus,
    typeof forms.simplified === 'string',
  );

  // Requested form + its status, and the "other" form + status.
  const requested =
    preference === 'traditional'
      ? {
          status: traditionalStatus,
          script: forms.traditional,
          otherStatus: simplifiedStatus,
          otherScript: forms.simplified,
        }
      : {
          status: simplifiedStatus,
          script: forms.simplified,
          otherStatus: traditionalStatus,
          otherScript: forms.traditional,
        };

  // `path-default` preference selects the path-default form directly.
  const isPathDefaultRequest = preference === 'path-default';

  if (isPathDefaultRequest) {
    if (pathDefaultEligible) {
      return {
        preference,
        script: pathDefault,
        status: pathDefaultStatus as DirectSelectableStatus,
        isFallback: false,
      };
    }
    // Path-default form ineligible: try the eligible path-default form first
    // (already done), then a deterministic "other eligible form" order.
    const candidate = eligibleForm(traditionalStatus, forms.traditional);
    const other = eligibleForm(simplifiedStatus, forms.simplified);
    const chosen = candidate ?? other;
    if (chosen !== null) {
      return {
        preference,
        script: chosen.text,
        status: chosen.status,
        isFallback: true,
        fallbackReason: FALLBACK_ANNOTATION,
      };
    }
    return unavailable(preference);
  }

  // Directly selectable requested form is returned unchanged.
  if (isValidDirectStatus(requested.status)) {
    return {
      preference,
      script: requested.script as string,
      status: requested.status,
      isFallback: false,
    };
  }

  // Fall back first to the eligible path-default form, then the other form.
  if (pathDefaultEligible) {
    return {
      preference,
      script: pathDefault,
      status: pathDefaultStatus as DirectSelectableStatus,
      isFallback: true,
      fallbackReason: FALLBACK_ANNOTATION,
    };
  }

  if (isValidDirectStatus(requested.otherStatus)) {
    return {
      preference,
      script: requested.otherScript as string,
      status: requested.otherStatus,
      isFallback: true,
      fallbackReason: FALLBACK_ANNOTATION,
    };
  }

  return unavailable(preference);
}

function eligibleForm(
  status: ScriptStatus,
  script: string | undefined,
): { status: DirectSelectableStatus; text: string } | null {
  if (isValidDirectStatus(status) && typeof script === 'string') {
    return { status, text: script };
  }
  return null;
}

function unavailable(preference: ScriptPreference): UnavailableScriptSelection {
  return { preference, status: 'unavailable' };
}
