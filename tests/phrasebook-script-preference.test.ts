// @vitest-environment happy-dom

/**
 * Phrasebook script-preference client (Issue #236, absorbs #257; fail-closed
 * rework per the #349 kanji-bridge precedent).
 *
 * The phrasebook surface mirrors the kanji-bridge script contract: every
 * learner-visible phrase headword, dialog turn, and dialog reference carries
 * `data-script-*` provenance and is an annotation host. Under #440 prelaunch,
 * the exact canonical 30 phrases + 6 dialogs render while each record keeps
 * truthful metadata. The client reads ONLY the root dataset +
 * `SCRIPT_PREFERENCE_EVENT`, applies `selectScript` per field, sets the
 * matching `lang`, and manages the exact #251 fallback annotation — never
 * storage, URL, focus, scroll, or the scenario filter.
 *
 * Canonical phrase forms and most dialog forms are `authored` (Traditional) /
 * `verified` (Simplified); the existing missing-Simplified dialog form keeps
 * the shared fallback behavior. Synthetic fixtures exercise the other
 * generated/unavailable branches.
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
  loadPrelaunchPhrasebook,
  PHRASEBOOK_SCENARIOS,
} from '../src/content/loadPhrasebook';

const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, '..', 'src/client/phrasebookScriptPreference.ts'),
  'utf8',
);

// ─── Exact #440 prelaunch real-corpus fields (SSR contract: path-default IS
// ─── the Traditional form; all fields preserve authored/verified provenance). ──

interface FieldFixture {
  id: string;
  kind: 'headword' | 'dialog-turn' | 'dialog-reference';
  traditional: string;
  traditionalStatus: ScriptStatus;
  simplified?: string;
  simplifiedStatus?: ScriptStatus;
}

const PRELAUNCH_GROUPS = groupPhrasebookByScenario(loadPrelaunchPhrasebook());

/** Every canonical phrase headword in source order (30 total). */
const ALL_HEADWORD_FIELDS: FieldFixture[] = [];
for (const group of PRELAUNCH_GROUPS) {
  for (const phrase of group.phrases) {
    ALL_HEADWORD_FIELDS.push({
      id: phrase.id,
      kind: 'headword',
      traditional: phrase.traditional,
      traditionalStatus: phrase.traditionalStatus,
      simplified: phrase.simplified,
      simplifiedStatus: phrase.simplifiedStatus,
    });
  }
}

/** Every canonical dialog turn and reference in rendered source order. */
const ALL_DIALOG_TURN_FIELDS: FieldFixture[] = [];
const ALL_DIALOG_REFERENCE_FIELDS: FieldFixture[] = [];
for (const group of PRELAUNCH_GROUPS) {
  if (group.dialog === null) continue;
  for (const [index, turn] of group.dialog.turns.entries()) {
    ALL_DIALOG_TURN_FIELDS.push({
      id: `${group.dialog.id}-turn-${index + 1}`,
      kind: 'dialog-turn',
      traditional: turn.traditional,
      traditionalStatus: turn.traditionalStatus,
      simplified: turn.simplified,
      simplifiedStatus: turn.simplifiedStatus,
    });
  }
  for (const [index, phraseId] of group.dialog.relatedPhraseIds.entries()) {
    const phrase = ALL_HEADWORD_FIELDS.find((field) => field.id === phraseId)!;
    ALL_DIALOG_REFERENCE_FIELDS.push({
      ...phrase,
      id: `${group.dialog.id}-reference-${index + 1}`,
      kind: 'dialog-reference',
    });
  }
}

/** Every script field in the exact prelaunch fixture page's DOM order (84). */
const ALL_FIELDS = PRELAUNCH_GROUPS.flatMap((group) => {
  const fields = group.phrases.map(
    (phrase) => ALL_HEADWORD_FIELDS.find((field) => field.id === phrase.id)!,
  );
  if (group.dialog === null) return fields;
  return [
    ...fields,
    ...group.dialog.turns.map(
      (_, index) =>
        ALL_DIALOG_TURN_FIELDS.find(
          (field) => field.id === `${group.dialog!.id}-turn-${index + 1}`,
        )!,
    ),
    ...group.dialog.relatedPhraseIds.map(
      (_, index) =>
        ALL_DIALOG_REFERENCE_FIELDS.find(
          (field) => field.id === `${group.dialog!.id}-reference-${index + 1}`,
        )!,
    ),
  ];
});

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** One phrasebook script field mirroring the SSR `data-script-*` contract. */
function fieldMarkup(field: FieldFixture, tag = 'h3'): string {
  const simplifiedAttr =
    field.simplified !== undefined
      ? `data-script-simplified="${escapeHtml(field.simplified)}" ` +
        `data-script-simplified-status="${field.simplifiedStatus}" `
      : '';
  return (
    `<${tag} lang="zh-Hant" data-field-id="${field.id}" ` +
    `data-script-annotation-host ` +
    `data-script-path-default="${escapeHtml(field.traditional)}" ` +
    `data-script-path-default-status="${field.traditionalStatus}" ` +
    `data-script-traditional="${escapeHtml(field.traditional)}" ` +
    `data-script-traditional-status="${field.traditionalStatus}" ` +
    simplifiedAttr +
    `>${escapeHtml(field.traditional)}</${tag}>`
  );
}

function syntheticMarkup(overrides: Omit<FieldFixture, 'kind'>): string {
  return fieldMarkup({ ...overrides, kind: 'headword' });
}

/** The exact #440 prelaunch surface: all 30 headwords, 36 dialog turns, and
 *  every canonical dialog reference carry the shared script-field contract. */
function buildPrelaunchPage(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML =
    '<select id="phrasebook-scenario-filter" data-scenario-filter>' +
    '<option value="all">すべて</option>' +
    PHRASEBOOK_SCENARIOS.map(
      (scenario) => `<option value="${scenario}">${scenario}</option>`,
    ).join('') +
    '</select>' +
    `<p data-scenario-count>全${ALL_HEADWORD_FIELDS.length}件</p>` +
    '<p data-phrasebook-no-match hidden>該当する場面がありません。</p>' +
    PRELAUNCH_GROUPS.map(
      (group) =>
        `<section data-phrasebook-scenario data-scenario="${group.scenario}">` +
        group.phrases
          .map((phrase) => {
            const field = ALL_HEADWORD_FIELDS.find((f) => f.id === phrase.id)!;
            return `<article data-phrasebook-entry>${fieldMarkup(field)}</article>`;
          })
          .join('') +
        (group.dialog === null
          ? ''
          : `<div data-phrasebook-dialog><ol>` +
            group.dialog.turns
            .map((_, index) => {
                const field = ALL_DIALOG_TURN_FIELDS.find(
                  (candidate) => candidate.id === `${group.dialog!.id}-turn-${index + 1}`,
                )!;
                return `<li data-phrasebook-dialog-turn>${fieldMarkup(field, 'p')}</li>`;
              })
              .join('') +
            `</ol><p class="phrasebook-dialog__references">` +
            group.dialog.relatedPhraseIds
            .map((_, index) => {
                const field = ALL_DIALOG_REFERENCE_FIELDS.find(
                  (candidate) =>
                    candidate.id === `${group.dialog!.id}-reference-${index + 1}`,
                )!;
                return `${fieldMarkup(field, 'span')}${index < group.dialog!.relatedPhraseIds.length - 1 ? '、' : ''}`;
              })
              .join('') +
            `</p></div>`
          ) +
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

// ─── Every canonical field under every preference (real prelaunch corpus) ────

describe('phrasebook script preference — exact prelaunch corpus', () => {
  it('covers 30 headwords, 36 dialog turns, and every dialog reference', () => {
    expect(ALL_HEADWORD_FIELDS).toHaveLength(30);
    expect(ALL_DIALOG_TURN_FIELDS).toHaveLength(36);
    expect(ALL_DIALOG_REFERENCE_FIELDS).toHaveLength(18);
    expect(ALL_FIELDS).toHaveLength(84);
    const root = buildPrelaunchPage();
    document.body.append(root);
    init(root);
    expect(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    ).toHaveLength(84);
  });

  it.each(PREFERENCES)(
    'applies selectScript + matching lang + annotation to all 84 fields under %s',
    (preference) => {
      setPreference(preference);
      const root = buildPrelaunchPage();
      document.body.append(root);
      init(root);

      const fields = Array.from(
        root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
      );
      expect(fields).toHaveLength(84);
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

  it.each(PREFERENCES)(
    'keeps exactly two related-phrase separators outside replaceable text under %s',
    (preference) => {
      setPreference(preference);
      const root = buildPrelaunchPage();
      document.body.append(root);
      init(root);

      const assertReferences = (activePreference: ScriptPreference): void => {
        const references = Array.from(
          root.querySelectorAll<HTMLElement>('.phrasebook-dialog__references'),
        );
        expect(references).toHaveLength(6);
        for (const referenceBlock of references) {
          const fields = Array.from(
            referenceBlock.querySelectorAll<HTMLElement>(
              '[data-script-annotation-host]',
            ),
          ).map(
            (field) =>
              ALL_DIALOG_REFERENCE_FIELDS.find(
                (candidate) => candidate.id === field.dataset.fieldId,
              )!,
          );
          expect(fields).toHaveLength(3);
          for (const [index, fieldElement] of Array.from(
            referenceBlock.querySelectorAll<HTMLElement>(
              '[data-script-annotation-host]',
            ),
          ).entries()) {
            const field = fields[index];
            const result = expected(field, activePreference);
            expect(frontText(fieldElement)).toBe(
              result.status === 'unavailable' ? field.traditional : result.script,
            );
          }
          expect(
            Array.from(referenceBlock.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent),
          ).toEqual(['、', '、']);
        }
      };

      assertReferences(preference);
      changePreference('traditional');
      assertReferences('traditional');
      changePreference('simplified');
      assertReferences('simplified');
    },
  );

  it('renders no fallback annotation under 簡体字 because every canonical form is verified', () => {
    setPreference('simplified');
    const root = buildPrelaunchPage();
    document.body.append(root);
    init(root);

    // One existing dialog turn has no Simplified form; it keeps the shared
    // Traditional fallback annotation while all other canonical fields select
    // their verified Simplified form directly.
    expect(fallbackAnnotations(root)).toHaveLength(1);
    expect(ALL_FIELDS.filter((field) => wantsAnnotation(field, 'simplified'))).toHaveLength(1);
  });

  it('applies the persisted root preference at init without reading storage (direct refresh)', () => {
    setPreference('simplified');
    const root = buildPrelaunchPage();
    document.body.append(root);
    const getSpy = vi.spyOn(window.localStorage, 'getItem');

    init(root);

    const fields = Array.from(
      root.querySelectorAll<HTMLElement>('[data-script-annotation-host]'),
    );
    expect(fields).toHaveLength(84);
    expect(fields.filter((el) => el.lang === 'zh-Hans')).toHaveLength(83);
    expect(fields.filter((el) => el.lang === 'zh-Hant')).toHaveLength(1);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('falls back to path-default behavior for an invalid root dataset value', () => {
    setPreference('garbage' as ScriptPreference);
    const root = buildPrelaunchPage();
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
    const root = buildPrelaunchPage();
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
    // food keeps exactly its 5 canonical entries visible through preference churn.
    expect(entriesBefore).toBe(5);
    expect(visibleEntries()).toBe(5);
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

    const root = buildPrelaunchPage();
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
    const root = buildPrelaunchPage();
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
    expect(fallbackAnnotations(root)).toHaveLength(1);
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
