// @vitest-environment happy-dom

/**
 * Phrasebook script-preference client (Issue #236, absorbs #257; fail-closed
 * rework per the #349 kanji-bridge precedent).
 *
 * The phrasebook surface mirrors the kanji-bridge script contract: every
 * learner-visible phrase headword carries `data-script-*` provenance and is an
 * annotation host. The surface is fail-closed — only production-eligible
 * records render (currently 6 reviewed phrases: airport 5 + food 1), so the
 * client only ever sees eligible fields. The client reads ONLY the root dataset
 * + `SCRIPT_PREFERENCE_EVENT`, applies `selectScript` per field, sets the
 * matching `lang`, and manages the exact #251 fallback annotation — never
 * storage, URL, focus, scroll, or the scenario filter.
 *
 * Every eligible field is `authored` (Traditional) / `verified` (Simplified),
 * so under every preference the directly-selectable form renders with the
 * correct `lang` and no annotation. Synthetic fixtures exercise the
 * generated/unavailable fallback branches.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPhrasebookScenarioFilter } from '../src/client/phrasebookScenarioFilter';
import { initPhrasebookScriptPreference } from '../src/client/phrasebookScriptPreference';
import { SCRIPT_PREFERENCE_EVENT } from '../src/client/scriptPreferenceControl';
import { selectScript, type ScriptStatus } from '../src/domain/scriptSelection';
import type { ScriptPreference } from '../src/lib/scriptPreference';
import {
  groupPhrasebookByScenario,
  loadEligiblePhrasebook,
  PHRASEBOOK_SCENARIOS,
} from '../src/content/loadPhrasebook';

const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, '..', 'src/client/phrasebookScriptPreference.ts'),
  'utf8',
);

// ─── Eligible real-corpus fields (SSR contract: path-default IS the
// ─── Traditional form). Only production-eligible records are learner-facing. ──

interface FieldFixture {
  id: string;
  kind: 'headword';
  traditional: string;
  traditionalStatus: ScriptStatus;
  simplified?: string;
  simplifiedStatus?: ScriptStatus;
}

const ELIGIBLE_GROUPS = groupPhrasebookByScenario(loadEligiblePhrasebook()).filter(
  (group) => group.phrases.length > 0,
);

/** Every learner-visible script field in source order (6 eligible headwords). */
const ALL_FIELDS: FieldFixture[] = [];
for (const group of ELIGIBLE_GROUPS) {
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

/** The /phrasebook/ eligible surface: scenario filter + the scenario groups
 *  that have eligible content, each with its eligible phrase headwords (no
 *  dialogs render while all dialogs are pending). */
function buildEligiblePage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    '<select id="phrasebook-scenario-filter" data-scenario-filter>' +
    '<option value="all">すべて</option>' +
    PHRASEBOOK_SCENARIOS.map(
      (scenario) => `<option value="${scenario}">${scenario}</option>`,
    ).join('') +
    '</select>' +
    `<p data-scenario-count>全${ALL_FIELDS.length}件</p>` +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    ELIGIBLE_GROUPS.map(
      (group) =>
        `<section data-phrasebook-scenario data-scenario="${group.scenario}">` +
        group.phrases
          .map((phrase) => {
            const field = ALL_FIELDS.find((f) => f.id === phrase.id)!;
            return `<article data-phrasebook-entry>${fieldMarkup(field)}</article>`;
          })
          .join('') +
        '</section>',
    ).join('');
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

// ─── Every eligible field under every preference (real corpus) ────────────────

describe('phrasebook script preference — every eligible headword', () => {
  it('covers all 6 eligible script fields (6 headwords, no dialog turns)', () => {
    expect(ALL_FIELDS).toHaveLength(6);
    expect(ALL_FIELDS.filter((field) => field.kind === 'headword')).toHaveLength(6);
    const root = buildEligiblePage();
    document.body.append(root);
    init(root);
    expect(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    ).toHaveLength(6);
  });

  it.each(PREFERENCES)(
    'applies selectScript + matching lang + annotation to all 6 fields under %s',
    (preference) => {
      setPreference(preference);
      const root = buildEligiblePage();
      document.body.append(root);
      init(root);

      const fields = Array.from(
        root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
      );
      expect(fields).toHaveLength(6);
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

  it('renders no fallback annotation under 簡体字 because every eligible form is verified', () => {
    setPreference('simplified');
    const root = buildEligiblePage();
    document.body.append(root);
    init(root);

    // All 6 eligible phrases carry authored Traditional + verified Simplified,
    // so no field ever needs the #251 fallback annotation.
    expect(fallbackAnnotations(root)).toHaveLength(0);
    expect(ALL_FIELDS.filter((field) => wantsAnnotation(field, 'simplified'))).toHaveLength(0);
  });

  it('applies the persisted root preference at init without reading storage (direct refresh)', () => {
    setPreference('simplified');
    const root = buildEligiblePage();
    document.body.append(root);
    const getSpy = vi.spyOn(window.localStorage, 'getItem');

    init(root);

    const fields = Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    );
    expect(fields).toHaveLength(6);
    expect(fields.every((el) => el.lang === 'zh-Hans')).toBe(true);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('falls back to path-default behavior for an invalid root dataset value', () => {
    setPreference('garbage' as ScriptPreference);
    const root = buildEligiblePage();
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
  it('does not touch the scenario filter/URL, count, order, or the eligible set', () => {
    const root = buildEligiblePage();
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
    const visibleEntries = (): number =>
      Array.from(
        root.querySelectorAll<HTMLElement>('[data-phrasebook-entry]'),
      ).filter((entry) => {
        const group = entry.closest('[data-phrasebook-scenario]') as HTMLElement | null;
        return group !== null && !group.hidden;
      }).length;
    const entriesBefore = visibleEntries();
    const orderBefore = Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    ).map((el) => el.getAttribute('data-script-path-default'));

    changePreference('traditional');
    changePreference('simplified');

    expect(window.location.search).toBe(urlBefore);
    expect(root.querySelector('[data-scenario-count]')?.textContent).toBe(
      countBefore,
    );
    // food keeps exactly its 1 eligible entry visible through preference churn.
    expect(entriesBefore).toBe(1);
    expect(visibleEntries()).toBe(1);
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

    const root = buildEligiblePage();
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
    const root = buildEligiblePage();
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
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('never duplicates the annotation across repeated preference changes', () => {
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
    expect(fallbackAnnotations(root)).toHaveLength(1);

    // End the sequence on 簡体字: the one field that wants an annotation must
    // never accumulate duplicates across repeated preference changes.
    for (const preference of ['traditional', 'simplified', 'path-default', 'simplified'] as ScriptPreference[]) {
      changePreference(preference);
    }
    expect(fallbackAnnotations(root)).toHaveLength(1);
  });

  it('cleanup removes the document listener', () => {
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
    expect(fallbackAnnotations(root)).toHaveLength(1);

    lastCleanup?.();
    lastCleanup = null;

    // Remove the annotation, then dispatch: the listener is gone, so the
    // annotation is NOT re-added.
    for (const annotation of fallbackAnnotations(root)) annotation.remove();
    expect(fallbackAnnotations(root)).toHaveLength(0);

    changePreference('traditional');
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });
});
