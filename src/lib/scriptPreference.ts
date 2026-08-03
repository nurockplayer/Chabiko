// ─── Public types ──────────────────────────────────────────────────────────────

export type ScriptPreference = 'path-default' | 'traditional' | 'simplified';

export interface ScriptPreferenceDocument {
  readonly version: 1;
  readonly preference: ScriptPreference;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** The only storage key this module ever reads or writes. */
export const SCRIPT_PREFERENCE_STORAGE_KEY = 'chabiko.script-preference.v1';

const CURRENT_SCHEMA_VERSION = 1;

const PROBE_KEY = '__chabiko_script_pref_probe__';

// ─── Pure parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a stored document string into a frozen preference value.
 * Missing, malformed, unknown-version, and wrong-shape documents all return
 * `path-default` without throwing.
 */
export function parsePreference(raw: string | null): ScriptPreference {
  if (raw === null) return 'path-default';
  try {
    const parsed: unknown = JSON.parse(raw);
    return documentToPreference(parsed);
  } catch {
    /* malformed JSON — fall back to path-default */
    return 'path-default';
  }
}

function documentToPreference(value: unknown): ScriptPreference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'path-default';
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== CURRENT_SCHEMA_VERSION) return 'path-default';
  const pref = obj.preference;
  if (pref === 'path-default' || pref === 'traditional' || pref === 'simplified') {
    return pref;
  }
  return 'path-default';
}

function preferenceToDocument(
  preference: ScriptPreference,
): ScriptPreferenceDocument {
  return { version: CURRENT_SCHEMA_VERSION, preference };
}

// ─── Default storage ───────────────────────────────────────────────────────────

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const prev = localStorage.getItem(PROBE_KEY);
      localStorage.setItem(PROBE_KEY, '1');
      localStorage.removeItem(PROBE_KEY);
      if (prev !== null) {
        localStorage.setItem(PROBE_KEY, prev);
      }
      return localStorage;
    }
  } catch {
    /* localStorage unavailable (SSR, private browsing, etc.) */
  }
  return null;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

/**
 * Isolated, versioned script-preference store.
 *
 * Frozen preference contract (Issue #251):
 * - Storage key: `chabiko.script-preference.v1`, document
 *   `{ "version": 1, "preference": "path-default" | "traditional" |
 *   "simplified" }`.
 * - Missing, malformed, unknown-version, unavailable, quota-failed, or
 *   inaccessible storage returns `path-default` without throwing.
 * - Writes touch only this key; the store never calls localStorage.clear() and
 *   never reads or writes any other key.
 * - Cross-tab merge is last-valid-document-wins; an external clear returns to
 *   `path-default`.
 *
 * The store is synchronous and pure with respect to the injected StorageLike:
 * no network, DOM, time, or randomness.
 */
export class ScriptPreferenceStore {
  private preference: ScriptPreference;
  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.preference = 'path-default';
    this.storage = storage !== undefined ? storage : getDefaultStorage();
    this.load();
  }

  /** Current preference, defaulting to `path-default` on any failure. */
  get(): ScriptPreference {
    return this.preference;
  }

  /**
   * Set the preference and persist only the script-preference key.
   * On a write failure (quota, unavailable storage) the in-memory value stays
   * authoritative for this page while reads still return it, and a later
   * cross-tab read can still see the last valid stored document.
   */
  set(preference: ScriptPreference): void {
    this.preference = preference;
    if (this.storage === null) return;
    try {
      this.storage.setItem(
        SCRIPT_PREFERENCE_STORAGE_KEY,
        JSON.stringify(preferenceToDocument(preference)),
      );
    } catch {
      /* quota or unavailable storage — keep in-memory state */
    }
  }

  /** Re-read storage. Call on `pageshow` or a storage event. */
  refresh(): void {
    this.load();
  }

  /**
   * Accept an explicit external clear (key deleted from another context) as
   * authoritative while the key remains absent, returning to `path-default`.
   * Returns false when a newer write has already repopulated the key and the
   * delayed deletion event is stale.
   */
  acceptExternalClear(): boolean {
    if (this.storage !== null) {
      try {
        if (this.storage.getItem(SCRIPT_PREFERENCE_STORAGE_KEY) !== null) {
          return false;
        }
      } catch {
        /* inaccessible storage — treat the clear signal as authoritative */
      }
    }
    this.preference = 'path-default';
    return true;
  }

  /** Reset only the script-preference key back to `path-default`. */
  reset(): void {
    this.preference = 'path-default';
    try {
      this.storage?.removeItem(SCRIPT_PREFERENCE_STORAGE_KEY);
    } catch {
      /* best-effort — in-memory preference is already reset */
    }
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(SCRIPT_PREFERENCE_STORAGE_KEY);
      this.preference = parsePreference(raw ?? null);
    } catch {
      /* inaccessible storage — default to path-default */
      this.preference = 'path-default';
    }
  }
}
