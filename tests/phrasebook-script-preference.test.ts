// @vitest-environment happy-dom

/**
 * Phrasebook script-preference client (Issue #236, absorbs #257).
 *
 * The phrasebook surface mirrors the kanji-bridge script contract: every phrase
 * headword AND every dialog turn line carries `data-script-*` provenance and is
 * an annotation host. The client reads ONLY the root dataset +
 * `SCRIPT_PREFERENCE_EVENT`, applies `selectScript` per field, sets the matching
 * `lang`, and manages the exact #251 fallback annotation — never storage, URL,
 * focus, scroll, or the scenario filter.
 *
 * The frozen corpus is entirely `authored` (Traditional) / `verified`
 * (Simplified), so under every preference the directly-selectable form renders
 * with the correct `lang` and no annotation, EXCEPT the one dialog turn that
 * lacks a Simplified form: under 簡体字 it keeps its path-default Traditional
 * text with `lang="zh-Hant"` and shows the exact fallback annotation once.
 * Synthetic fixtures exercise the generated/unavailable fallback branches.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPhrasebookScenarioFilter } from '../src/client/phrasebookScenarioFilter';
import { initPhrasebookScriptPreference } from '../src/client/phrasebookScriptPreference';
import { SCRIPT_PREFERENCE_EVENT } from '../src/client/scriptPreferenceControl';
import { selectScript, type ScriptStatus } from '../src/domain/scriptSelection';
import type { ScriptPreference } from '../src/lib/scriptPreference';
import { groupPhrasebookByScenario, loadPhrasebook } from '../src/content/loadPhrasebook';

const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, '..', 'src/client/phrasebookScriptPreference.ts'),
  'utf8',
);

// ─── Real corpus fields (SSR contract: path-default IS the Traditional form) ──

interface FieldFixture {
  id: string;
  kind: 'headword' | 'turn';
  traditional: string;
  traditionalStatus: ScriptStatus;
  simplified?: string;
  simplifiedStatus?: ScriptStatus;
}

const GROUPS = groupPhrasebookByScenario(loadPhrasebook());

/** Every script field in source order: 30 phrase headwords then 36 dialog turns. */
const ALL_FIELDS: FieldFixture[] = [];
for (const group of GROUPS) {
  for (const phrase of group.phrases) {
    ALL_FIELDS.push({
      id: phrase.id,
      kind: 'headword',
      traditional: phrase.traditional,
      traditionalStatus: phrase.traditionalStatus,
      simplified: phrase.simplified,
      simplifiedStatus: phrase.simplifiedStatus,
    });
  }
  if (group.dialog !== null) {
    for (const [turnIndex, turn] of group.dialog.turns.entries()) {
      ALL_FIELDS.push({
        id: `${group.dialog.id}#turn${turnIndex}`,
        kind: 'turn',
        traditional: turn.traditional,
        traditionalStatus: turn.traditionalStatus,
        simplified: turn.simplified,
        simplifiedStatus: turn.simplifiedStatus,
      });
    }
  }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** One phrasebook script field mirroring the SSR `data-script-*` contract. */
function fieldMarkup(field: FieldFixture): string {
  const simplifiedAttr =
    field.simplified !== undefined
      ? `data-script-simplified="${escapeHtml(field.simplified)}" ` +
        `data-script-simplified-status="${field.simplifiedStatus}" `
      : '';
  return (
    `<h3 lang="zh-Hant" data-field-id="${field.id}" ` +
    `data-script-annotation-host ` +
    `data-script-path-default="${escapeHtml(field.traditional)}" ` +
    `data-script-path-default-status="${field.traditionalStatus}" ` +
    `data-script-traditional="${escapeHtml(field.traditional)}" ` +
    `data-script-traditional-status="${field.traditionalStatus}" ` +
    simplifiedAttr +
    `>${escapeHtml(field.traditional)}</h3>`
  );
}

function syntheticMarkup(overrides: Omit<FieldFixture, 'kind'>): string {
  return fieldMarkup({ ...overrides, kind: 'headword' });
}

/** The full /phrasebook/ surface: scenario filter + six scenario groups, each
 *  with its phrase headwords, dialog turns, and related-phrase references. */
function buildFullPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    '<select id="phrasebook-scenario-filter" data-scenario-filter>' +
    '<option value="all">すべて</option>' +
    GROUPS.map((group) => `<option value="${group.scenario}">${group.scenario}</option>`).join('') +
    '</select>' +
    '<p data-scenario-count>全6件</p>' +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    GROUPS.map((group) => {
      const dialogMarkup =
        group.dialog === null
          ? ''
          : group.dialog.turns
              .map((_, turnIndex) => {
                const field = ALL_FIELDS.find(
                  (f) => f.id === `${group.dialog!.id}#turn${turnIndex}`,
                )!;
                return (
                  fieldMarkup(field) +
                  `<p data-phrasebook-reference>${field.traditional}</p>`
                );
              })
              .join('');
      return (
        `<section data-phrasebook-scenario data-scenario="${group.scenario}">` +
        group.phrases.map((phrase) => fieldMarkup(ALL_FIELDS.find((f) => f.id === phrase.id)!)).join('') +
        dialogMarkup +
        '</section>'
      );
    }).join('');
  return root;
}

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

/** Expected result for one field under one preference (frozen selectScript). */
function expected(field: FieldFixture, preference: ScriptPreference) {
  return selectScript(field.traditional, field.traditionalStatus, preference, {
    traditional: field.traditional,
    traditionalStatus: field.traditionalStatus,
    simplified: field.simplified,
    simplifiedStatus: field.simplifiedStatus,
  });
}

function wantsAnnotation(field: FieldFixture, preference: ScriptPreference): boolean {
  const r = expected(field, preference);
  return r.status === 'unavailable' || r.isFallback === true;
}

const PREFERENCES: ScriptPreference[] = ['path-default', 'traditional', 'simplified'];

let lastCleanup: (() => void) | null = null;

function init(root: HTMLElement): void {
  lastCleanup?.();
  lastCleanup = initPhrasebookScriptPreference(
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

// ─── Every field under every preference (real corpus) ──────────────────────────

describe('phrasebook script preference — every scenario and dialog line', () => {
  it('covers all 66 script fields (30 headwords + 36 dialog turns)', () => {
    expect(ALL_FIELDS).toHaveLength(66);
    const root = buildFullPage();
    document.body.append(root);
    init(root);
    expect(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    ).toHaveLength(66);
  });

  it.each(PREFERENCES)(
    'applies selectScript + matching lang + annotation to all 66 fields under %s',
    (preference) => {
      setPreference(preference);
      const root = buildFullPage();
      document.body.append(root);
      init(root);

      const fields = Array.from(
        root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
      );
      for (const [index, el] of fields.entries()) {
        const field = ALL_FIELDS[index];
        const r = expected(field, preference);

        const wantText =
          r.status === 'unavailable' ? field.traditional : r.script;
        expect(frontText(el), field.id).toBe(wantText);

        const wantLang =
          preference === 'simplified' &&
          r.status !== 'unavailable' &&
          r.isFallback === false
            ? 'zh-Hans'
            : 'zh-Hant';
        expect(el.lang, field.id).toBe(wantLang);

        expect(
          el.querySelectorAll('.script-fallback').length,
          field.id,
        ).toBe(wantsAnnotation(field, preference) ? 1 : 0);
      }
    },
  );

  it('falls back to path-default Traditional + the exact annotation on the one turn lacking Simplified, under 簡体字', () => {
    setPreference('simplified');
    const root = buildFullPage();
    document.body.append(root);
    init(root);

    const annotations = fallbackAnnotations(root);
    expect(annotations).toHaveLength(1);

    const expectedIds = ALL_FIELDS.filter((field) =>
      wantsAnnotation(field, 'simplified'),
    ).map((field) => field.id);
    expect(expectedIds).toHaveLength(1);

    const host = annotations[0].closest('[data-script-annotation-host]');
    expect((host as HTMLElement)?.getAttribute('data-field-id')).toBe(
      expectedIds[0],
    );
    for (const annotation of annotations) {
      expect(annotation.lang).toBe('ja');
      expect(annotation.textContent).toBe(
        'この表記は未収録のため、コース標準を表示しています。',
      );
    }
  });

  it('applies the persisted root preference at init without reading storage (direct refresh)', () => {
    setPreference('simplified');
    const root = buildFullPage();
    document.body.append(root);
    const getSpy = vi.spyOn(window.localStorage, 'getItem');

    init(root);

    const fields = Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    );
    expect(fields).toHaveLength(66);
    expect(fields.some((el) => el.lang === 'zh-Hans')).toBe(true);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('never duplicates the annotation across repeated preference changes', () => {
    setPreference('simplified');
    const root = buildFullPage();
    document.body.append(root);
    init(root);

    // End the sequence on 簡体字: only the one turn lacking Simplified wants an
    // annotation, and repeated changes must never duplicate it.
    for (const preference of ['traditional', 'simplified', 'path-default', 'simplified'] as ScriptPreference[]) {
      changePreference(preference);
    }

    // Exactly one annotation per field that needs it, never duplicates.
    const fields = Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    );
    expect(fallbackAnnotations(root)).toHaveLength(
      ALL_FIELDS.filter((field) => wantsAnnotation(field, 'simplified')).length,
    );
    fields.forEach((el, index) => {
      expect(el.querySelectorAll('.script-fallback')).toHaveLength(
        wantsAnnotation(ALL_FIELDS[index], 'simplified') ? 1 : 0,
      );
    });
  });

  it('falls back to path-default behavior for an invalid root dataset value', () => {
    setPreference('garbage' as ScriptPreference);
    const root = buildFullPage();
    document.body.append(root);
    init(root);

    for (const [index, el] of Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    ).entries()) {
      expect(frontText(el), ALL_FIELDS[index].id).toBe(
        el.getAttribute('data-script-path-default'),
      );
      expect(el.lang).toBe('zh-Hant');
    }
  });
});

// ─── Synthetic fallback branches (generated / unavailable) ─────────────────────

describe('phrasebook script preference — generated / unavailable fallback', () => {
  it('selects the verified Simplified form + zh-Hans and hides the annotation', () => {
    setPreference('simplified');
    const root = document.createElement('section');
    root.innerHTML = syntheticMarkup({
      id: 'synthetic-verified',
      traditional: '電話',
      traditionalStatus: 'authored',
      simplified: '电话',
      simplifiedStatus: 'verified',
    });
    document.body.append(root);
    init(root);

    const field = root.querySelector<HTMLElement>('[data-script-annotation-host]')!;
    expect(frontText(field)).toBe('电话');
    expect(field.lang).toBe('zh-Hans');
    expect(field.querySelector('.script-fallback')).toBeNull();
  });

  it('falls back to path-default Traditional + annotation when Simplified is still generated', () => {
    setPreference('simplified');
    const root = document.createElement('section');
    root.innerHTML = syntheticMarkup({
      id: 'synthetic-generated-simplified',
      traditional: '電話',
      traditionalStatus: 'verified',
      simplified: '电话',
      simplifiedStatus: 'generated',
    });
    document.body.append(root);
    init(root);

    const field = root.querySelector<HTMLElement>('[data-script-annotation-host]')!;
    expect(frontText(field)).toBe('電話');
    expect(field.lang).toBe('zh-Hant');
    const annotation = field.querySelector('.script-fallback');
    expect(annotation).not.toBeNull();
    expect(annotation?.textContent).toBe(
      'この表記は未収録のため、コース標準を表示しています。',
    );
  });

  it('keeps Traditional + zh-Hant without annotation under 繁体字 when Simplified is generated', () => {
    for (const preference of ['path-default', 'traditional'] as ScriptPreference[]) {
      setPreference(preference);
      const root = document.createElement('section');
      root.innerHTML = syntheticMarkup({
        id: 'synthetic-generated-simplified',
        traditional: '電話',
        traditionalStatus: 'verified',
        simplified: '电话',
        simplifiedStatus: 'generated',
      });
      document.body.append(root);
      init(root);

      const field = root.querySelector<HTMLElement>('[data-script-annotation-host]')!;
      expect(frontText(field)).toBe('電話');
      expect(field.lang).toBe('zh-Hant');
      expect(field.querySelector('.script-fallback')).toBeNull();
      document.body.replaceChildren();
    }
  });

  it('keeps the static path-default text + annotation when every form is generated', () => {
    for (const preference of PREFERENCES) {
      setPreference(preference);
      const root = document.createElement('section');
      root.innerHTML = syntheticMarkup({
        id: 'synthetic-all-generated',
        traditional: '電話',
        traditionalStatus: 'generated',
        simplified: '电话',
        simplifiedStatus: 'generated',
      });
      document.body.append(root);
      init(root);

      const field = root.querySelector<HTMLElement>('[data-script-annotation-host]')!;
      // No eligible form: never blank, never fabricated — keep SSR text + lang.
      expect(frontText(field)).toBe('電話');
      expect(field.lang).toBe('zh-Hant');
      expect(field.querySelector('.script-fallback')).not.toBeNull();
      document.body.replaceChildren();
    }
  });
});

// ─── Preservation + isolation ──────────────────────────────────────────────────

describe('phrasebook script preference — preserves surrounding state', () => {
  it('does not touch the scenario filter/URL, count, order, or references', () => {
    const root = buildFullPage();
    document.body.append(root);
    const filterCleanup = initPhrasebookScenarioFilter(root);
    init(root);

    const select = root.querySelector<HTMLSelectElement>(
      '[data-scenario-filter]',
    )!;
    select.value = 'food';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const urlBefore = window.location.search;
    const countBefore = root.querySelector('[data-scenario-count]')?.textContent;
    const visibleBefore = Array.from(
      root.querySelectorAll<HTMLElement>('[data-phrasebook-scenario]'),
    ).filter((group) => !group.hidden).length;
    const referencesBefore = Array.from(
      root.querySelectorAll<HTMLElement>('[data-phrasebook-reference]'),
    ).map((el) => el.textContent);
    const orderBefore = Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    ).map((el) => el.getAttribute('data-script-path-default'));

    changePreference('traditional');
    changePreference('simplified');

    expect(window.location.search).toBe(urlBefore);
    expect(root.querySelector('[data-scenario-count]')?.textContent).toBe(
      countBefore,
    );
    expect(visibleBefore).toBe(1);
    expect(
      Array.from(
        root.querySelectorAll<HTMLElement>('[data-phrasebook-scenario]'),
      ).filter((group) => !group.hidden).length,
    ).toBe(1);
    expect(
      Array.from(
        root.querySelectorAll<HTMLElement>('[data-phrasebook-reference]'),
      ).map((el) => el.textContent),
    ).toEqual(referencesBefore);
    expect(
      Array.from(
        root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
      ).map((el) => el.getAttribute('data-script-path-default')),
    ).toEqual(orderBefore);
    filterCleanup();
  });
});

// ─── Storage + singleton ───────────────────────────────────────────────────────

describe('phrasebook script preference — storage-free, singleton lifecycle', () => {
  it('never reads or writes storage and never moves focus, scroll, or URL', () => {
    expect(CLIENT_SOURCE).not.toMatch(/localStorage|sessionStorage|setItem|removeItem|getItem/);
    expect(CLIENT_SOURCE).not.toMatch(/addEventListener\('storage'/);
    expect(CLIENT_SOURCE).not.toMatch(/\.focus\(|\.blur\(|scrollTo|scrollIntoView/);
    expect(CLIENT_SOURCE).not.toMatch(/replaceState/);

    const root = buildFullPage();
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
    const root = buildFullPage();
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
    expect(fallbackAnnotations(root)).toHaveLength(
      ALL_FIELDS.filter((field) => wantsAnnotation(field, 'simplified')).length,
    );
  });

  it('cleanup removes the document listener', () => {
    setPreference('simplified');
    const root = buildFullPage();
    document.body.append(root);
    init(root);
    expect(fallbackAnnotations(root)).toHaveLength(
      ALL_FIELDS.filter((field) => wantsAnnotation(field, 'simplified')).length,
    );

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
