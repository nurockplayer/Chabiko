// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCRIPT_PREFERENCE_STORAGE_KEY,
  type ScriptPreference,
} from '../src/lib/scriptPreference';
import {
  initScriptPreferenceControl,
  SCRIPT_PREFERENCE_CONTROL_ID,
  SCRIPT_PREFERENCE_EVENT,
  SCRIPT_PREFERENCE_LABEL,
  SCRIPT_PREFERENCE_OPTIONS,
} from '../src/client/scriptPreferenceControl';

// ─── Source extraction ─────────────────────────────────────────────────────────

const readSource = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const baseLayoutSource = readSource('../src/layouts/BaseLayout.astro');
const headerSource = readSource('../src/components/Header.astro');

/** The full inline bootstrap body as Astro renders it (including the wrapper). */
const prePaintBootstrap = extractInlineScript(
  baseLayoutSource,
  'chabiko.script-preference.v1',
);

function extractInlineScript(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex).toBeGreaterThan(-1);
  const scriptStart = source.lastIndexOf('<script is:inline>', markerIndex);
  expect(scriptStart).toBeGreaterThan(-1);
  const scriptEnd = source.indexOf('</script>', markerIndex);
  expect(scriptEnd).toBeGreaterThan(scriptStart);
  return source.slice(scriptStart + '<script is:inline>'.length, scriptEnd);
}

/** Execute the bootstrap against a fresh document and return root state. */
function runPrePaintBootstrap(
  options: { storage?: Record<string, string>; throwOnGet?: boolean } = {},
): { dataset: DOMStringMap; writeKeys: string[] } {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-script-preference');

  const writeKeys: string[] = [];
  const backing = new Map<string, string>(Object.entries(options.storage ?? {}));
  const getter = options.throwOnGet
    ? () => {
        throw new Error('inaccessible');
      }
    : (key: string) => backing.get(key) ?? null;
  const storageLike: Storage = {
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    getItem: getter,
    removeItem: (key: string) => backing.delete(key),
    setItem: (key: string, value: string) => {
      writeKeys.push(key);
      backing.set(key, value);
    },
  };

  // Replace the window localStorage for the duration of the bootstrap only, so
  // later tests always see a clean, non-throwing storage instance.
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'localStorage',
  );
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storageLike,
  });

  const fn = new Function('window', 'document', prePaintBootstrap) as (
    window: Window,
    document: Document,
  ) => void;
  try {
    fn(window, document);
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(window, 'localStorage', previousDescriptor);
    } else {
      delete (window as unknown as Record<string, unknown>).localStorage;
    }
  }
  return { dataset: document.documentElement.dataset, writeKeys };
}

// ─── Header control harness ────────────────────────────────────────────────────

const cleanups: Array<() => void> = [];

function makeHeaderMarkup(): string {
  return (
    '<div class="script-toggle-slot">' +
    `<label for="${SCRIPT_PREFERENCE_CONTROL_ID}">${SCRIPT_PREFERENCE_LABEL}</label>` +
    `<select id="${SCRIPT_PREFERENCE_CONTROL_ID}" class="script-preference-select">` +
    SCRIPT_PREFERENCE_OPTIONS.map(
      (option) => `<option value="${option.value}">${option.label}</option>`,
    ).join('') +
    '</select>' +
    '</div>'
  );
}

function seedStorage(preference: ScriptPreference): void {
  window.localStorage.setItem(
    SCRIPT_PREFERENCE_STORAGE_KEY,
    JSON.stringify({ version: 1, preference }),
  );
}

function clearStorage(): void {
  window.localStorage.clear();
}

function refreshStorage(preference: ScriptPreference): void {
  clearStorage();
  seedStorage(preference);
}

function storageValue(): string | null {
  return window.localStorage.getItem(SCRIPT_PREFERENCE_STORAGE_KEY);
}

function control(): HTMLSelectElement {
  const select = document.getElementById(
    SCRIPT_PREFERENCE_CONTROL_ID,
  ) as HTMLSelectElement | null;
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error('script-preference select not found');
  }
  return select;
}

function rootDataset(): Record<string, string | undefined> {
  return { ...document.documentElement.dataset };
}

function detailPreference(event: Event): ScriptPreference {
  return (event as CustomEvent<{ preference: ScriptPreference }>).detail
    .preference;
}

function dispatchStorage(key: string | null, newValue: string | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      oldValue: null,
      newValue,
      storageArea: window.localStorage,
    }),
  );
}

function init(root = document.documentElement): () => void {
  const cleanup = initScriptPreferenceControl(root);
  cleanups.push(cleanup);
  return cleanup;
}

function selectOption(preference: ScriptPreference): void {
  const select = control();
  select.value = preference;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function events(
  handler: (event: Event) => void,
): void {
  document.addEventListener(SCRIPT_PREFERENCE_EVENT, handler);
  cleanups.push(() =>
    document.removeEventListener(SCRIPT_PREFERENCE_EVENT, handler),
  );
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-script-preference');
  document.documentElement.removeAttribute('data-theme');
  window.localStorage.clear();
  cleanups.length = 0;
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-script-preference');
  document.documentElement.removeAttribute('data-theme');
  window.localStorage.clear();
});

// ─── Pre-paint bootstrap ───────────────────────────────────────────────────────

describe('BaseLayout pre-paint bootstrap', () => {
  it('renders the frozen storage key and only version 1 with the three controlled values', () => {
    expect(baseLayoutSource).toContain("const key = 'chabiko.script-preference.v1'");
    expect(prePaintBootstrap).toContain('parsed.version === 1');
    expect(prePaintBootstrap).toContain(
      "parsed.preference === 'path-default'",
    );
    expect(prePaintBootstrap).toContain("parsed.preference === 'traditional'");
    expect(prePaintBootstrap).toContain("parsed.preference === 'simplified'");
  });

  it('is an inline head script that runs before rendered content and never writes storage', () => {
    expect(baseLayoutSource).toContain('<script is:inline>');
    // It must appear before the <body> so it runs before content paints.
    expect(baseLayoutSource.indexOf(prePaintBootstrap)).toBeLessThan(
      baseLayoutSource.indexOf('<body>'),
    );
    const { writeKeys } = runPrePaintBootstrap();
    expect(writeKeys).toEqual([]);
    expect(document.documentElement.dataset.scriptPreference).toBe('path-default');
  });

  it('accepts each valid stored document', () => {
    for (const preference of ['path-default', 'traditional', 'simplified'] as const) {
      const { dataset } = runPrePaintBootstrap({
        storage: {
          [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify({
            version: 1,
            preference,
          }),
        },
      });
      expect(dataset.scriptPreference).toBe(preference);
    }
  });

  it('falls back to path-default for malformed JSON, wrong version, wrong shape, and unknown values', () => {
    const malformed: Array<Record<string, string>> = [
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: '{not json' },
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify({ version: 2, preference: 'traditional' }) },
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify({ preference: 'traditional' }) },
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify({ version: 1, preference: 'garbage' }) },
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: JSON.stringify({ version: 1, preference: 42 }) },
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: '"traditional"' },
      { [SCRIPT_PREFERENCE_STORAGE_KEY]: 'null' },
    ];
    for (const storage of malformed) {
      const { dataset } = runPrePaintBootstrap({ storage });
      expect(dataset.scriptPreference).toBe('path-default');
    }
  });

  it('falls back to path-default for missing and inaccessible storage without throwing', () => {
    expect(() => runPrePaintBootstrap()).not.toThrow();
    expect(() => runPrePaintBootstrap({ throwOnGet: true })).not.toThrow();
    const { dataset } = runPrePaintBootstrap({ throwOnGet: true });
    expect(dataset.scriptPreference).toBe('path-default');
  });
});

// ─── Header control markup and initial state ───────────────────────────────────

describe('header script-preference control', () => {
  it('renders the frozen exact visible label and options', () => {
    expect(headerSource).toContain(
      `<label for="${SCRIPT_PREFERENCE_CONTROL_ID}">${SCRIPT_PREFERENCE_LABEL}</label>`,
    );
    expect(headerSource).toContain(
      `<select id="${SCRIPT_PREFERENCE_CONTROL_ID}" class="script-preference-select">`,
    );
    for (const option of SCRIPT_PREFERENCE_OPTIONS) {
      expect(headerSource).toContain(
        `<option value="${option.value}">${option.label}</option>`,
      );
    }
    expect(SCRIPT_PREFERENCE_OPTIONS).toEqual([
      { label: 'コース標準', value: 'path-default' },
      { label: '繁体字', value: 'traditional' },
      { label: '簡体字', value: 'simplified' },
    ]);
  });

  it('wires the control and the frozen event name in the header script', () => {
    expect(headerSource).toContain('initScriptPreferenceControl()');
  });

  it('initializes from the validated root dataset without writing storage or dispatching', () => {
    document.documentElement.dataset.scriptPreference = 'traditional';
    document.body.innerHTML = makeHeaderMarkup();
    const onEvent = vi.fn();
    events(onEvent);

    init();

    expect(control().value).toBe('traditional');
    expect(rootDataset().scriptPreference).toBe('traditional');
    expect(storageValue()).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('falls back to path-default when the root dataset is unset or invalid', () => {
    document.body.innerHTML = makeHeaderMarkup();
    init();
    expect(control().value).toBe('path-default');
    expect(rootDataset().scriptPreference).toBe('path-default');

    document.documentElement.dataset.scriptPreference = 'garbage';
    init();
    expect(control().value).toBe('path-default');
  });
});

// ─── Learner selection ─────────────────────────────────────────────────────────

describe('learner selection', () => {
  it('persists exactly once and dispatches exactly one event per change', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    expect(storageValue()).toBe(
      JSON.stringify({ version: 1, preference: 'path-default' }),
    );

    const onEvent = vi.fn();
    events(onEvent);

    selectOption('simplified');
    expect(storageValue()).toBe(
      JSON.stringify({ version: 1, preference: 'simplified' }),
    );
    expect(rootDataset().scriptPreference).toBe('simplified');
    expect(control().value).toBe('simplified');
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(detailPreference(onEvent.mock.calls[0][0])).toBe('simplified');

    selectOption('traditional');
    expect(storageValue()).toBe(
      JSON.stringify({ version: 1, preference: 'traditional' }),
    );
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('dispatches no event and does not rewrite storage when the value is unchanged', () => {
    seedStorage('simplified');
    document.documentElement.dataset.scriptPreference = 'simplified';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    const storedBefore = storageValue();
    const onEvent = vi.fn();
    events(onEvent);

    selectOption('simplified');

    expect(storageValue()).toBe(storedBefore);
    expect(onEvent).not.toHaveBeenCalled();
  });
});

// ─── Storage / pageshow / external clear ───────────────────────────────────────

describe('storage, pageshow, and external-clear refreshes', () => {
  it('applies a relevant storage write with one event and zero writes', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    const onEvent = vi.fn();
    events(onEvent);

    // Simulate an external tab writing a new preference.
    refreshStorage('traditional');
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');
    dispatchStorage(SCRIPT_PREFERENCE_STORAGE_KEY, storageValue());

    expect(rootDataset().scriptPreference).toBe('traditional');
    expect(control().value).toBe('traditional');
    // The refresh itself never writes storage.
    expect(writeSpy).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(detailPreference(onEvent.mock.calls[0][0])).toBe('traditional');
    writeSpy.mockRestore();
  });

  it('applies an external clear with one event and zero writes, resetting to path-default', () => {
    seedStorage('simplified');
    document.documentElement.dataset.scriptPreference = 'simplified';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    expect(control().value).toBe('simplified');

    const onEvent = vi.fn();
    events(onEvent);

    window.localStorage.removeItem(SCRIPT_PREFERENCE_STORAGE_KEY);
    dispatchStorage(SCRIPT_PREFERENCE_STORAGE_KEY, null);

    expect(rootDataset().scriptPreference).toBe('path-default');
    expect(control().value).toBe('path-default');
    expect(storageValue()).toBeNull();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(detailPreference(onEvent.mock.calls[0][0])).toBe('path-default');
  });

  it('applies a storage clear (key null) with one event and zero writes', () => {
    seedStorage('traditional');
    document.documentElement.dataset.scriptPreference = 'traditional';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    const onEvent = vi.fn();
    events(onEvent);

    window.localStorage.clear();
    dispatchStorage(null, null);

    expect(rootDataset().scriptPreference).toBe('path-default');
    expect(control().value).toBe('path-default');
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('applies a relevant pageshow refresh with one event and zero writes', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    const onEvent = vi.fn();
    events(onEvent);

    // Simulate another tab persisting a preference before pageshow.
    refreshStorage('simplified');
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');
    window.dispatchEvent(new PageTransitionEvent('pageshow'));

    expect(rootDataset().scriptPreference).toBe('simplified');
    expect(control().value).toBe('simplified');
    // The pageshow refresh never writes storage.
    expect(writeSpy).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
  });

  it('dispatches no event when a refresh leaves the effective preference unchanged', () => {
    seedStorage('traditional');
    document.documentElement.dataset.scriptPreference = 'traditional';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    const onEvent = vi.fn();
    events(onEvent);

    window.dispatchEvent(new PageTransitionEvent('pageshow'));
    refreshStorage('traditional');
    dispatchStorage(SCRIPT_PREFERENCE_STORAGE_KEY, storageValue());

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('ignores storage events for other keys and other storage areas', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();
    const onEvent = vi.fn();
    events(onEvent);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'chabiko_theme',
        oldValue: null,
        newValue: 'dark',
        storageArea: window.localStorage,
      }),
    );

    const foreign = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: SCRIPT_PREFERENCE_STORAGE_KEY,
        oldValue: null,
        newValue: 'x',
        storageArea: foreign,
      }),
    );

    expect(rootDataset().scriptPreference).toBe('path-default');
    expect(control().value).toBe('path-default');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('keeps the event bubbling through the document', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();

    const onWindow = vi.fn();
    const onDoc = vi.fn();
    window.addEventListener(SCRIPT_PREFERENCE_EVENT, onWindow);
    document.addEventListener(SCRIPT_PREFERENCE_EVENT, onDoc);
    cleanups.push(() => window.removeEventListener(SCRIPT_PREFERENCE_EVENT, onWindow));
    cleanups.push(() => document.removeEventListener(SCRIPT_PREFERENCE_EVENT, onDoc));

    selectOption('traditional');

    expect(onWindow).toHaveBeenCalledTimes(1);
    expect(onDoc).toHaveBeenCalledTimes(1);
  });
});

// ─── Reinitialization and teardown ─────────────────────────────────────────────

describe('reinitialization and teardown', () => {
  it('repeated init tears down prior listeners: one write and one event per selection', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    const onEvent = vi.fn();
    events(onEvent);

    init();
    init();
    init();

    selectOption('simplified');

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(storageValue()).toBe(
      JSON.stringify({ version: 1, preference: 'simplified' }),
    );
  });

  it('cleanup removes listeners so later selections do not persist or dispatch', () => {
    seedStorage('path-default');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    const onEvent = vi.fn();
    events(onEvent);

    const storedBefore = storageValue();
    const cleanup = init();
    cleanup();

    selectOption('simplified');

    // No write (storage stays at the pre-cleanup value) and no event.
    expect(storageValue()).toBe(storedBefore);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('returns a no-op cleanup when the select is missing', () => {
    const cleanup = init();
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('dispatches nothing on the init that follows an external clear', () => {
    seedStorage('simplified');
    document.documentElement.dataset.scriptPreference = 'simplified';
    document.body.innerHTML = makeHeaderMarkup();
    const onEvent = vi.fn();
    events(onEvent);

    init();
    window.localStorage.removeItem(SCRIPT_PREFERENCE_STORAGE_KEY);
    dispatchStorage(SCRIPT_PREFERENCE_STORAGE_KEY, null);
    expect(onEvent).toHaveBeenCalledTimes(1);

    // A fresh init reads the validated root dataset and does not dispatch.
    init();
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});

// ─── Isolation ─────────────────────────────────────────────────────────────────

describe('isolation', () => {
  it('touches only the script-preference storage key on learner selection', () => {
    seedStorage('path-default');
    window.localStorage.setItem('chabiko_theme', 'dark');
    window.localStorage.setItem('chabiko_completed_lessons', '["lesson-001"]');
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();

    selectOption('traditional');

    expect(window.localStorage.getItem('chabiko_theme')).toBe('dark');
    expect(window.localStorage.getItem('chabiko_completed_lessons')).toBe(
      '["lesson-001"]',
    );
    expect(window.localStorage.getItem(SCRIPT_PREFERENCE_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, preference: 'traditional' }),
    );
  });

  it('leaves the theme bootstrap and control behavior unchanged', () => {
    expect(baseLayoutSource).toContain("const themeKey = 'chabiko_theme'");
    expect(baseLayoutSource).toContain("data-theme-enabled={themeEnabled ? 'true' : undefined}");
    expect(headerSource).toContain('id="theme-toggle"');
    expect(headerSource).toContain('THEME_STORAGE_KEY');
    expect(headerSource).toContain('aria-pressed');
    // The theme pre-paint script still precedes the script-preference script.
    expect(
      baseLayoutSource.indexOf("const themeKey = 'chabiko_theme'"),
    ).toBeLessThan(baseLayoutSource.indexOf("chabiko.script-preference.v1"));
  });
});

// ─── Keyboard, focus, and accessible name ──────────────────────────────────────

describe('keyboard, focus, and accessible name', () => {
  it('uses a native select: keyboard-native, focusable, with a visible 44px target', () => {
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();

    const select = control();
    expect(select.tagName).toBe('SELECT');
    expect(select.id).toBe(SCRIPT_PREFERENCE_CONTROL_ID);
    expect(select.tabIndex).toBe(0);
    // The style contract enforces the 44px touch target in Header.astro.
    expect(headerSource).toContain(
      '.script-preference-select {\n    min-height: 44px;',
    );
    expect(select.labels[0]).toBeInstanceOf(HTMLLabelElement);
    expect(select.labels[0].htmlFor).toBe(SCRIPT_PREFERENCE_CONTROL_ID);

    // Focus the control via the label association and confirm it is reachable.
    select.focus();
    expect(document.activeElement).toBe(select);
  });

  it('derives the Japanese accessible name from the exact visible label', () => {
    document.documentElement.dataset.scriptPreference = 'path-default';
    document.body.innerHTML = makeHeaderMarkup();
    init();

    const select = control();
    const accessibleName = select.labels[0]?.textContent?.trim() ?? '';
    expect(accessibleName).toBe(SCRIPT_PREFERENCE_LABEL);
    expect(accessibleName).toBe('漢字表記');
  });

  it('marks the control as focusable and keeps a visible focus indicator style', () => {
    expect(headerSource).toContain('.script-preference-select:focus-visible');
    expect(headerSource).toContain('outline: 2px solid var(--c-accent)');
  });
});

// ─── Container rules referenced from Header.astro style contract ───────────────

describe('Header.astro style contract', () => {
  it('keeps the theme toggle and brand/navigation rules unchanged', () => {
    expect(headerSource).toContain('min-height: 44px');
    expect(headerSource).toContain('.brand:focus-visible');
    expect(headerSource).toContain('id="theme-toggle"');
  });
});
