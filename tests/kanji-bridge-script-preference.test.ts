// @vitest-environment happy-dom

/**
 * Kanji-bridge script-preference client (Issue #235 / #256).
 *
 * Every form in the frozen kanji-bridge corpus is `generated`, so under every
 * preference `selectScript` returns `{ status: 'unavailable' }`. The frozen
 * #235/#256 contract therefore says: the headword ALWAYS keeps its static
 * path-default Traditional text (never blank, never fabricated), the `lang`
 * stays `zh-Hant`, and the exact #251 fallback annotation is ALWAYS shown once
 * per headword. The client reads ONLY the root dataset + the #252 document
 * event, never storage, and never touches the filter/URL, scroll, focus, order,
 * or the entry examples.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initKanjiBridgeFilter } from '../src/client/kanjiBridgeFilter';
import { initKanjiBridgeScriptPreference } from '../src/client/kanjiBridgeScriptPreference';
import { SCRIPT_PREFERENCE_EVENT } from '../src/client/scriptPreferenceControl';
import { FALLBACK_ANNOTATION } from '../src/domain/scriptSelection';
import type { ScriptPreference } from '../src/lib/scriptPreference';
import { loadKanjiBridge } from '../src/content/loadKanjiBridge';

const ENTRIES = loadKanjiBridge();
const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, '..', 'src/client/kanjiBridgeScriptPreference.ts'),
  'utf8',
);

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Build one headword card mirroring the KanjiBridgeEntry SSR markup. */
function headwordMarkup(entry: (typeof ENTRIES)[number], withAnnotation: boolean): string {
  const example = entry.examples[0];
  const annotation = withAnnotation
    ? `<span class="script-fallback" lang="ja">${FALLBACK_ANNOTATION}</span>`
    : '';
  return (
    `<article data-headword-card>` +
    `<h2 lang="zh-Hant" ` +
    `data-script-path-default="${escapeHtml(entry.traditional)}" ` +
    `data-script-path-default-status="${entry.traditionalStatus}" ` +
    `data-script-traditional="${escapeHtml(entry.traditional)}" ` +
    `data-script-traditional-status="${entry.traditionalStatus}" ` +
    `data-script-simplified="${escapeHtml(entry.simplified)}" ` +
    `data-script-simplified-status="${entry.simplifiedStatus}">` +
    `${escapeHtml(entry.traditional)}${annotation}` +
    `</h2>` +
    `<p class="kanji-bridge-entry__example-text" lang="zh-Hant">${escapeHtml(example.traditional)}</p>` +
    `<p class="kanji-bridge-entry__example-japanese" lang="ja">${escapeHtml(example.japanese)}</p>` +
    `</article>`
  );
}

function buildPage(withAnnotation = true): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = ENTRIES.map((entry) => headwordMarkup(entry, withAnnotation)).join('');
  return root;
}

function headwords(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-script-path-default]'));
}

/** The headword's own visible text: the leading text node, excluding the
 *  child fallback annotation span. */
function frontText(el: HTMLElement): string {
  const leading = el.childNodes[0];
  return leading?.textContent ?? '';
}

function fallbackAnnotations(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.script-fallback'));
}

function setPreference(preference: ScriptPreference): void {
  document.documentElement.dataset.scriptPreference = preference;
}

function clearPreference(): void {
  document.documentElement.removeAttribute('data-script-preference');
}

/** Dispatch the exact #252 document event after updating the root dataset. */
function changePreference(preference: ScriptPreference): void {
  setPreference(preference);
  document.dispatchEvent(
    new CustomEvent(SCRIPT_PREFERENCE_EVENT, {
      bubbles: true,
      detail: { preference },
    }),
  );
}

const PREFERENCES: ScriptPreference[] = ['path-default', 'traditional', 'simplified'];

let lastCleanup: (() => void) | null = null;

function init(root: HTMLElement): void {
  lastCleanup?.();
  lastCleanup = initKanjiBridgeScriptPreference(
    document.documentElement,
    root,
  ) as () => void;
}

beforeEach(() => {
  clearPreference();
  document.body.replaceChildren();
});

afterEach(() => {
  lastCleanup?.();
  lastCleanup = null;
  clearPreference();
  document.body.replaceChildren();
});

// ─── Every preference keeps the Traditional headword + the exact annotation ────

describe('kanji-bridge script preference — headword contract', () => {
  it.each(PREFERENCES)(
    'keeps the path-default Traditional headword with lang zh-Hant under %s',
    (preference) => {
      setPreference(preference);
      const root = buildPage();
      document.body.append(root);
      init(root);

      for (const headword of headwords(root)) {
        expect(frontText(headword)).toBe(
          headword.getAttribute('data-script-path-default'),
        );
        expect(headword.lang).toBe('zh-Hant');
      }
    },
  );

  it('falls back to path-default behavior for an invalid root dataset value', () => {
    setPreference('garbage' as ScriptPreference);
    const root = buildPage();
    document.body.append(root);
    init(root);

    for (const headword of headwords(root)) {
      expect(frontText(headword)).toBe(
        headword.getAttribute('data-script-path-default'),
      );
      expect(headword.lang).toBe('zh-Hant');
    }
  });

  it('always shows the exact #251 fallback annotation once per headword', () => {
    const root = buildPage();
    document.body.append(root);
    init(root);

    expect(fallbackAnnotations(root)).toHaveLength(ENTRIES.length);
    for (const annotation of fallbackAnnotations(root)) {
      expect(annotation.lang).toBe('ja');
      expect(annotation.textContent).toBe(FALLBACK_ANNOTATION);
    }
  });

  it('adds the missing annotation exactly once when the SSR markup lacks it', () => {
    const root = buildPage(false);
    document.body.append(root);
    init(root);

    expect(fallbackAnnotations(root)).toHaveLength(ENTRIES.length);
    for (const annotation of fallbackAnnotations(root)) {
      expect(annotation.lang).toBe('ja');
      expect(annotation.textContent).toBe(FALLBACK_ANNOTATION);
    }
  });

  it('never duplicates the annotation across repeated preference changes', () => {
    const root = buildPage();
    document.body.append(root);
    init(root);

    for (const preference of [...PREFERENCES, 'path-default'] as ScriptPreference[]) {
      changePreference(preference);
    }

    // Exactly one annotation per headword, no matter how many changes.
    for (const headword of headwords(root)) {
      expect(
        headword.querySelectorAll('.script-fallback'),
      ).toHaveLength(1);
    }
    expect(fallbackAnnotations(root)).toHaveLength(ENTRIES.length);
  });
});

// ─── Preservation + isolation ──────────────────────────────────────────────────

describe('kanji-bridge script preference — preserves surrounding state', () => {
  it('does not touch the relation filter/URL, examples, or source order', () => {
    const root = buildPage();
    document.body.append(root);
    init(root);

    const orderBefore = headwords(root).map(
      (headword) => headword.getAttribute('data-script-path-default'),
    );
    const exampleTextsBefore = Array.from(
      root.querySelectorAll('.kanji-bridge-entry__example-text'),
    ).map((el) => el.textContent);
    const exampleLangsBefore = Array.from(
      root.querySelectorAll('.kanji-bridge-entry__example-text'),
    ).map((el) => (el as HTMLElement).lang);
    const urlBefore = window.location.search;

    changePreference('traditional');
    changePreference('simplified');

    expect(window.location.search).toBe(urlBefore);
    expect(
      headwords(root).map(
        (headword) => headword.getAttribute('data-script-path-default'),
      ),
    ).toEqual(orderBefore);
    expect(
      Array.from(root.querySelectorAll('.kanji-bridge-entry__example-text')).map(
        (el) => el.textContent,
      ),
    ).toEqual(exampleTextsBefore);
    expect(
      Array.from(root.querySelectorAll('.kanji-bridge-entry__example-text')).map(
        (el) => (el as HTMLElement).lang,
      ),
    ).toEqual(exampleLangsBefore);
  });

  it('works alongside the relation filter without disturbing its counts', () => {
    const root = document.createElement('section');
    root.innerHTML =
      '<select id="kanji-bridge-relation-filter" data-relation-filter>' +
      '<option value="all">すべて</option>' +
      '<option value="same-meaning">同じ意味</option>' +
      '<option value="partial-overlap">一部が重なる</option>' +
      '<option value="false-friend">見せかけの同義語</option>' +
      '</select>' +
      '<p data-relation-count>全50件</p>' +
      '<p data-kanji-bridge-no-match hidden></p>' +
      ENTRIES.map(
        (entry) =>
          `<article data-kanji-bridge-entry data-relation="${entry.similarityType}">${headwordMarkup(entry, true)}</article>`,
      ).join('');
    document.body.append(root);

    const filterCleanup = initKanjiBridgeFilter(root);
    init(root);

    const select = root.querySelector<HTMLSelectElement>('[data-relation-filter]')!;
    select.value = 'same-meaning';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const countBefore = root.querySelector('[data-relation-count]')?.textContent;

    changePreference('traditional');

    const visibleAfter = Array.from(
      root.querySelectorAll<HTMLElement>('[data-kanji-bridge-entry]'),
    ).filter((card) => !card.hidden);
    expect(visibleAfter).toHaveLength(20);
    expect(root.querySelector('[data-relation-count]')?.textContent).toBe(
      countBefore,
    );
    filterCleanup();
  });
});

// ─── Storage + singleton ───────────────────────────────────────────────────────

describe('kanji-bridge script preference — storage-free, singleton lifecycle', () => {
  it('never reads or writes storage and never moves focus or scroll', () => {
    expect(CLIENT_SOURCE).not.toMatch(/localStorage|sessionStorage|setItem|removeItem|getItem/);
    expect(CLIENT_SOURCE).not.toMatch(/addEventListener\('storage'/);
    expect(CLIENT_SOURCE).not.toMatch(/\.focus\(|\.blur\(|scrollTo|scrollIntoView/);
    expect(CLIENT_SOURCE).not.toMatch(/replaceState/);

    const root = buildPage();
    document.body.append(root);
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');
    const removeSpy = vi.spyOn(window.localStorage, 'removeItem');

    init(root);
    changePreference('traditional');

    expect(writeSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('re-initialization tears down the previous binding (no duplicated listeners)', () => {
    const eventSpy = vi.spyOn(document, 'addEventListener');
    const root = buildPage();
    document.body.append(root);

    init(root);
    const addsAfterFirst = eventSpy.mock.calls.filter(
      ([type]) => type === SCRIPT_PREFERENCE_EVENT,
    ).length;

    init(root);
    const addsAfterSecond = eventSpy.mock.calls.filter(
      ([type]) => type === SCRIPT_PREFERENCE_EVENT,
    ).length;
    expect(addsAfterSecond - addsAfterFirst).toBe(1);

    // A single event must not double-apply.
    changePreference('simplified');
    expect(fallbackAnnotations(root)).toHaveLength(ENTRIES.length);
  });

  it('cleanup removes the document listener', () => {
    const root = buildPage(false);
    document.body.append(root);
    init(root);
    expect(fallbackAnnotations(root)).toHaveLength(ENTRIES.length);

    lastCleanup?.();
    lastCleanup = null;

    // Remove every annotation, then dispatch: the listener is gone, so the
    // annotations are NOT re-added.
    for (const annotation of fallbackAnnotations(root)) annotation.remove();
    expect(fallbackAnnotations(root)).toHaveLength(0);

    changePreference('traditional');
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });
});
