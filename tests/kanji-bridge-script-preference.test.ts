// @vitest-environment happy-dom

/**
 * Kanji-bridge script-preference client (Issue #235 / #256).
 *
 * Every form in the frozen kanji-bridge corpus is `generated`, so under every
 * preference `selectScript` returns `{ status: 'unavailable' }`. For those
 * records the headword keeps its static path-default Traditional text (never
 * blank, never fabricated), `lang` stays `zh-Hant`, and the exact #251
 * fallback annotation shows once per headword. Once the content-review
 * workflow promotes a record to `authored`/`verified`, the client applies the
 * directly-selectable form to the headword AND the example text with the
 * matching `lang` (post-review promotion path, P2-1/P2-2). The client reads
 * ONLY the root dataset + the #252 document event, never storage, and never
 * touches the filter/URL, scroll, focus, or order.
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
    `data-script-annotation-host ` +
    `data-script-path-default="${escapeHtml(entry.traditional)}" ` +
    `data-script-path-default-status="${entry.traditionalStatus}" ` +
    `data-script-traditional="${escapeHtml(entry.traditional)}" ` +
    `data-script-traditional-status="${entry.traditionalStatus}" ` +
    `data-script-simplified="${escapeHtml(entry.simplified)}" ` +
    `data-script-simplified-status="${entry.simplifiedStatus}">` +
    `${escapeHtml(entry.traditional)}${annotation}` +
    `</h2>` +
    `<p class="kanji-bridge-entry__example-text" lang="zh-Hant" ` +
    `data-script-path-default="${escapeHtml(example.traditional)}" ` +
    `data-script-path-default-status="${example.traditionalStatus}" ` +
    `data-script-traditional="${escapeHtml(example.traditional)}" ` +
    `data-script-traditional-status="${example.traditionalStatus}" ` +
    `data-script-simplified="${escapeHtml(example.simplified)}" ` +
    `data-script-simplified-status="${example.simplifiedStatus}">` +
    `${escapeHtml(example.traditional)}</p>` +
    `<p class="kanji-bridge-entry__example-japanese" lang="ja">${escapeHtml(example.japanese)}</p>` +
    `</article>`
  );
}

/** Build a card whose Traditional and Simplified forms are promoted to the
 *  given statuses (used to exercise the post-review script-selection path). */
function promotedMarkup(overrides: {
  traditional: string;
  traditionalStatus: 'authored' | 'verified';
  simplified: string;
  simplifiedStatus: 'authored' | 'verified' | 'generated';
  simplifiedPref?: ScriptPreference;
}): string {
  const status = (value: string): string => value;
  return (
    `<article data-headword-card>` +
    `<h2 lang="zh-Hant" ` +
    `data-script-annotation-host ` +
    `data-script-path-default="${escapeHtml(overrides.traditional)}" ` +
    `data-script-path-default-status="${status(overrides.traditionalStatus)}" ` +
    `data-script-traditional="${escapeHtml(overrides.traditional)}" ` +
    `data-script-traditional-status="${status(overrides.traditionalStatus)}" ` +
    `data-script-simplified="${escapeHtml(overrides.simplified)}" ` +
    `data-script-simplified-status="${status(overrides.simplifiedStatus)}">` +
    `${escapeHtml(overrides.traditional)}` +
    `</h2>` +
    `<p class="kanji-bridge-entry__example-text" lang="zh-Hant" ` +
    `data-script-path-default="我打個電話" ` +
    `data-script-path-default-status="verified" ` +
    `data-script-traditional="我打個電話" ` +
    `data-script-traditional-status="verified" ` +
    `data-script-simplified="我打个电话" ` +
    `data-script-simplified-status="verified">我打個電話</p>` +
    `</article>`
  );
}

function buildPage(withAnnotation = true): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = ENTRIES.map((entry) => headwordMarkup(entry, withAnnotation)).join('');
  return root;
}

/** The headword elements (annotation hosts), NOT the example texts which also
 *  carry `data-script-path-default`. */
function headwords(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
  );
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

// ─── Promoted forms apply the selected script (post-review path) ──────────────

describe('kanji-bridge script preference — promoted forms apply the selected script', () => {
  it('applies the verified Simplified headword + zh-Hans under 簡体字 and hides the annotation', () => {
    setPreference('simplified');
    const root = document.createElement('section');
    root.innerHTML = promotedMarkup({
      traditional: '電話',
      traditionalStatus: 'verified',
      simplified: '电话',
      simplifiedStatus: 'verified',
    });
    document.body.append(root);
    init(root);

    const headword = headwords(root)[0];
    expect(frontText(headword)).toBe('电话');
    expect(headword.lang).toBe('zh-Hans');
    expect(headword.querySelector('.script-fallback')).toBeNull();
  });

  it('keeps the Traditional headword + zh-Hant under path-default and 繁体字', () => {
    for (const preference of ['path-default', 'traditional'] as ScriptPreference[]) {
      setPreference(preference);
      const root = document.createElement('section');
      root.innerHTML = promotedMarkup({
        traditional: '電話',
        traditionalStatus: 'verified',
        simplified: '电话',
        simplifiedStatus: 'verified',
      });
      document.body.append(root);
      init(root);

      const headword = headwords(root)[0];
      expect(frontText(headword)).toBe('電話');
      expect(headword.lang).toBe('zh-Hant');
      expect(headword.querySelector('.script-fallback')).toBeNull();
      document.body.replaceChildren();
    }
  });

  it('falls back to path-default + annotation when the requested form is still generated', () => {
    // Traditional is verified but Simplified is generated: 簡体字 is not
    // directly selectable, so the headword keeps path-default + annotation.
    setPreference('simplified');
    const root = document.createElement('section');
    root.innerHTML = promotedMarkup({
      traditional: '電話',
      traditionalStatus: 'verified',
      simplified: '电话',
      simplifiedStatus: 'generated',
    });
    document.body.append(root);
    init(root);

    const headword = headwords(root)[0];
    expect(frontText(headword)).toBe('電話');
    expect(headword.lang).toBe('zh-Hant');
    expect(headword.querySelector('.script-fallback')).not.toBeNull();
  });

  it('applies the selected script to the example text + lang (P2-2)', () => {
    setPreference('simplified');
    const root = document.createElement('section');
    root.innerHTML = promotedMarkup({
      traditional: '電話',
      traditionalStatus: 'verified',
      simplified: '电话',
      simplifiedStatus: 'verified',
    });
    document.body.append(root);
    init(root);

    const example = root.querySelector<HTMLElement>(
      '.kanji-bridge-entry__example-text',
    );
    expect(example?.textContent).toBe('我打个电话');
    expect(example?.lang).toBe('zh-Hans');
  });

  it('keeps the example Traditional text + zh-Hant when the preference is not selectable', () => {
    setPreference('traditional');
    const root = document.createElement('section');
    root.innerHTML = promotedMarkup({
      traditional: '電話',
      traditionalStatus: 'verified',
      simplified: '电话',
      simplifiedStatus: 'verified',
    });
    document.body.append(root);
    init(root);

    const example = root.querySelector<HTMLElement>(
      '.kanji-bridge-entry__example-text',
    );
    expect(example?.textContent).toBe('我打個電話');
    expect(example?.lang).toBe('zh-Hant');
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
