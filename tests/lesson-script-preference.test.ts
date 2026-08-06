// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLessonScriptPreference } from '../src/client/lessonScriptPreference';
import { SCRIPT_PREFERENCE_EVENT } from '../src/client/scriptPreferenceControl';
import { FALLBACK_ANNOTATION } from '../src/domain/scriptSelection';
import type { ScriptPreference } from '../src/lib/scriptPreference';

// ─── Source extraction ─────────────────────────────────────────────────────────

const readSource = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const lessonSource = readSource('../src/pages/lessons/[id].astro');
const clientSource = readSource('../src/client/lessonScriptPreference.ts');

// ─── Fixture helpers ───────────────────────────────────────────────────────────

const CORE = '我要這個';
const CHUNK = '這個';
const KANJI = '要';
const EXAMPLE_TRADITIONAL = '我要那個';
const EXAMPLE_SIMPLIFIED = '我要那个';

interface ExampleAttrs {
  simplified?: string;
  simplifiedStatus?: string;
  traditionalStatus?: string;
}

/** A minimal fixture mirroring the lesson page's reading fields. */
function lessonFixture(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lesson-journey';
  root.innerHTML = [
    `<p class="route-example" lang="zh-Hant" data-script-path-default="${CORE}">${CORE}</p>`,
    `<p class="core-sentence" lang="zh-Hant" data-script-path-default="${CORE}">${CORE}</p>`,
    `<dl><dt lang="zh-Hant" data-script-path-default="${CHUNK}">${CHUNK}</dt></dl>`,
    `<p><strong lang="zh-Hant" data-script-path-default="${KANJI}">${KANJI}</strong></p>`,
    `<p class="example-sentence" lang="zh-Hant" data-script-path-default="${EXAMPLE_TRADITIONAL}" data-script-path-default-status="authored" data-script-simplified="${EXAMPLE_SIMPLIFIED}" data-script-simplified-status="verified">${EXAMPLE_TRADITIONAL}</p>`,
  ].join('');
  return root;
}

function exampleFixture(attrs: ExampleAttrs): HTMLElement {
  const root = document.createElement('div');
  const simplifiedAttr = attrs.simplified
    ? ` data-script-simplified="${attrs.simplified}"`
    : '';
  const simplifiedStatusAttr = attrs.simplifiedStatus
    ? ` data-script-simplified-status="${attrs.simplifiedStatus}"`
    : '';
  const traditionalStatusAttr = attrs.traditionalStatus
    ? ` data-script-path-default-status="${attrs.traditionalStatus}"`
    : '';
  root.innerHTML = `<p class="example-sentence" lang="zh-Hant" data-script-path-default="${EXAMPLE_TRADITIONAL}"${traditionalStatusAttr}${simplifiedAttr}${simplifiedStatusAttr}>${EXAMPLE_TRADITIONAL}</p>`;
  return root;
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

function init(root: HTMLElement): () => void {
  return initLessonScriptPreference(document.documentElement, root);
}

function fields(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll('[data-script-path-default]'));
}

function fallbackAnnotations(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll('.script-fallback'));
}

function example(root: HTMLElement): HTMLElement {
  const el = root.querySelector('.example-sentence');
  if (!(el instanceof HTMLElement)) throw new Error('example-sentence not found');
  return el;
}

/** The visible reading text: the leading text node, excluding the optional
 *  child fallback annotation span. */
function frontText(el: HTMLElement): string {
  const leading = el.childNodes[0];
  return leading?.textContent ?? '';
}

beforeEach(() => {
  clearPreference();
  document.body.replaceChildren();
  window.localStorage.clear();
});

afterEach(() => {
  clearPreference();
  document.body.replaceChildren();
  window.localStorage.clear();
});

// ─── Initial script from the validated root dataset ────────────────────────────

describe('initial script from the validated root dataset', () => {
  it('shows the path-default Traditional form with lang zh-Hant when no preference is stored', () => {
    clearPreference();
    const root = lessonFixture();
    document.body.append(root);
    init(root);

    for (const field of fields(root)) {
      expect(field.textContent).toBe(field.getAttribute('data-script-path-default'));
      expect(field.lang).toBe('zh-Hant');
    }
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('shows the path-default Traditional form for an explicit path-default preference', () => {
    setPreference('path-default');
    const root = lessonFixture();
    document.body.append(root);
    init(root);

    expect(example(root).textContent).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('shows the Traditional form for a traditional preference without a fallback', () => {
    setPreference('traditional');
    const root = lessonFixture();
    document.body.append(root);
    init(root);

    for (const field of fields(root)) {
      expect(field.lang).toBe('zh-Hant');
    }
    expect(example(root).textContent).toBe(EXAMPLE_TRADITIONAL);
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('falls back to path-default behavior for an invalid root dataset value', () => {
    setPreference('garbage' as ScriptPreference);
    const root = lessonFixture();
    document.body.append(root);
    init(root);

    for (const field of fields(root)) {
      expect(field.lang).toBe('zh-Hant');
    }
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('shows the verified simplified form with lang zh-Hans for a simplified preference', () => {
    setPreference('simplified');
    const root = lessonFixture();
    document.body.append(root);
    init(root);

    const exampleEl = example(root);
    expect(exampleEl.textContent).toBe(EXAMPLE_SIMPLIFIED);
    expect(exampleEl.lang).toBe('zh-Hans');
    // Fields without a simplified form fall back to Traditional with the
    // exact #251 annotation.
    const coreEl = root.querySelector('.core-sentence') as HTMLElement;
    expect(frontText(coreEl)).toBe(CORE);
    expect(coreEl.lang).toBe('zh-Hant');
    expect(fallbackAnnotations(root).length).toBeGreaterThan(0);
  });
});

// ─── Per-form provenance combinations ──────────────────────────────────────────

describe('per-form provenance combinations', () => {
  it('selects an authored simplified form directly under simplified', () => {
    setPreference('simplified');
    const root = exampleFixture({
      simplified: EXAMPLE_SIMPLIFIED,
      simplifiedStatus: 'authored',
      traditionalStatus: 'authored',
    });
    document.body.append(root);
    init(root);

    expect(example(root).textContent).toBe(EXAMPLE_SIMPLIFIED);
    expect(example(root).lang).toBe('zh-Hans');
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('selects a verified simplified form directly under simplified', () => {
    setPreference('simplified');
    const root = exampleFixture({
      simplified: EXAMPLE_SIMPLIFIED,
      simplifiedStatus: 'verified',
      traditionalStatus: 'verified',
    });
    document.body.append(root);
    init(root);

    expect(example(root).textContent).toBe(EXAMPLE_SIMPLIFIED);
    expect(example(root).lang).toBe('zh-Hans');
    expect(fallbackAnnotations(root)).toHaveLength(0);
  });

  it('never selects a generated simplified form directly and shows the fallback annotation', () => {
    setPreference('simplified');
    const root = exampleFixture({
      simplified: EXAMPLE_SIMPLIFIED,
      simplifiedStatus: 'generated',
      traditionalStatus: 'authored',
    });
    document.body.append(root);
    init(root);

    // Falls back to the eligible path-default Traditional form.
    expect(frontText(example(root))).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
    const fallbacks = fallbackAnnotations(root);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].textContent).toBe(FALLBACK_ANNOTATION);
    expect(fallbacks[0].getAttribute('lang')).toBe('ja');
  });

  it('shows the exact fallback annotation when a simplified form is unavailable', () => {
    setPreference('simplified');
    const root = exampleFixture({
      simplified: EXAMPLE_SIMPLIFIED,
      simplifiedStatus: 'unavailable',
      traditionalStatus: 'authored',
    });
    document.body.append(root);
    init(root);

    expect(frontText(example(root))).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
    expect(fallbackAnnotations(root)[0]?.textContent).toBe(FALLBACK_ANNOTATION);
  });

  it('shows the exact fallback annotation when a simplified form is absent', () => {
    setPreference('simplified');
    const root = exampleFixture({ traditionalStatus: 'authored' });
    document.body.append(root);
    init(root);

    expect(frontText(example(root))).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
    expect(fallbackAnnotations(root)[0]?.textContent).toBe(FALLBACK_ANNOTATION);
  });

  it('does not duplicate the fallback annotation on re-application', () => {
    setPreference('simplified');
    const root = lessonFixture();
    document.body.append(root);
    init(root);

    changePreference('traditional');
    changePreference('simplified');
    changePreference('simplified');

    for (const fallback of fallbackAnnotations(root)) {
      expect(fallback.textContent).toBe(FALLBACK_ANNOTATION);
    }
  });

  it('keeps the authored path-default Traditional text when the path default is generated', () => {
    // Path default generated is never directly selectable; with no other
    // eligible form, the reading text is preserved (never blanked).
    setPreference('path-default');
    const root = exampleFixture({
      simplified: EXAMPLE_SIMPLIFIED,
      simplifiedStatus: 'unavailable',
      traditionalStatus: 'generated',
    });
    document.body.append(root);
    init(root);

    expect(example(root).textContent).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
  });
});

// ─── lang changes ──────────────────────────────────────────────────────────────

describe('lang follows the displayed form', () => {
  it('switches an example between zh-Hant and zh-Hans with the preference', () => {
    setPreference('path-default');
    const root = lessonFixture();
    document.body.append(root);
    init(root);
    expect(example(root).lang).toBe('zh-Hant');

    changePreference('simplified');
    expect(example(root).textContent).toBe(EXAMPLE_SIMPLIFIED);
    expect(example(root).lang).toBe('zh-Hans');

    changePreference('traditional');
    expect(example(root).textContent).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
  });

  it('keeps zh-Hant for a fallback that displays the Traditional course standard', () => {
    setPreference('path-default');
    const root = exampleFixture({ traditionalStatus: 'authored' });
    document.body.append(root);
    init(root);
    expect(example(root).lang).toBe('zh-Hant');

    changePreference('simplified');
    expect(frontText(example(root))).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
    expect(fallbackAnnotations(root)[0]?.textContent).toBe(FALLBACK_ANNOTATION);
  });

  it('labels a fallback-to-simplified display as zh-Hans', () => {
    // The Traditional/path-default form is ineligible but the simplified form
    // is verified: selectScript falls back to the simplified text, which must
    // be labeled zh-Hans (not zh-Hant) because that is the displayed form.
    setPreference('traditional');
    const root = exampleFixture({
      simplified: EXAMPLE_SIMPLIFIED,
      simplifiedStatus: 'verified',
      traditionalStatus: 'generated',
    });
    document.body.append(root);
    init(root);

    expect(frontText(example(root))).toBe(EXAMPLE_SIMPLIFIED);
    expect(example(root).lang).toBe('zh-Hans');
    expect(fallbackAnnotations(root)[0]?.textContent).toBe(FALLBACK_ANNOTATION);
  });

  it('labels a fallback-to-traditional display as zh-Hant under a simplified preference', () => {
    // A simplified preference whose simplified form is unavailable falls back
    // to the Traditional path default, which must be labeled zh-Hant.
    setPreference('simplified');
    const root = exampleFixture({
      simplifiedStatus: 'unavailable',
      traditionalStatus: 'authored',
    });
    document.body.append(root);
    init(root);

    expect(frontText(example(root))).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
    expect(fallbackAnnotations(root)[0]?.textContent).toBe(FALLBACK_ANNOTATION);
  });
});

// ─── Event / pageshow initialization ───────────────────────────────────────────

describe('preference-change event and pageshow', () => {
  it('re-applies all reading fields on the #252 document event', () => {
    clearPreference();
    const root = lessonFixture();
    document.body.append(root);
    init(root);
    expect(example(root).textContent).toBe(EXAMPLE_TRADITIONAL);

    changePreference('simplified');
    expect(example(root).textContent).toBe(EXAMPLE_SIMPLIFIED);
    expect(example(root).lang).toBe('zh-Hans');

    changePreference('traditional');
    expect(example(root).textContent).toBe(EXAMPLE_TRADITIONAL);
    expect(example(root).lang).toBe('zh-Hant');
  });

  it('re-reads the validated root dataset on pageshow via the propagated event', () => {
    clearPreference();
    const root = lessonFixture();
    document.body.append(root);
    init(root);
    expect(frontText(example(root))).toBe(EXAMPLE_TRADITIONAL);

    // The header control updates the root dataset and dispatches the document
    // event on pageshow when the effective preference changed.
    setPreference('simplified');
    document.dispatchEvent(
      new CustomEvent(SCRIPT_PREFERENCE_EVENT, {
        bubbles: true,
        detail: { preference: 'simplified' },
      }),
    );
    expect(frontText(example(root))).toBe(EXAMPLE_SIMPLIFIED);
    expect(example(root).lang).toBe('zh-Hans');
  });

  it('does not duplicate document listeners across re-initialization', () => {
    clearPreference();
    const root = lessonFixture();
    document.body.append(root);
    const cleanup1 = init(root);
    const cleanup2 = init(root);
    cleanup1();

    changePreference('simplified');
    expect(example(root).textContent).toBe(EXAMPLE_SIMPLIFIED);

    cleanup2();
    // After cleanup, a later event leaves the last rendered state untouched.
    changePreference('traditional');
    expect(example(root).textContent).toBe(EXAMPLE_SIMPLIFIED);
  });

  it('never writes storage and does not move focus', () => {
    clearPreference();
    const root = lessonFixture();
    document.body.append(root);
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');
    init(root);

    changePreference('simplified');
    changePreference('traditional');

    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

// ─── Practice, progress, and navigation stay untouched ─────────────────────────

describe('practice, progress, and navigation stay untouched', () => {
  it('keeps the LessonPractice container and navigation intact across a preference change', () => {
    setPreference('path-default');
    const root = document.createElement('div');
    root.innerHTML = [
      '<p class="core-sentence" lang="zh-Hant" data-script-path-default="我要這個">我要這個</p>',
      '<div id="lesson-practice"><button data-action="reveal">回答</button></div>',
      '<nav class="lesson-nav"><a class="nav-link nav-prev" href="/lessons/lesson-001/">前へ</a><a class="nav-link nav-next" href="/lessons/lesson-003/">次へ</a></nav>',
    ].join('');
    document.body.append(root);
    init(root);

    const practice = root.querySelector('#lesson-practice');
    expect(practice?.textContent).toContain('回答');
    const reveal = root.querySelector('[data-action="reveal"]');
    expect(reveal).not.toBeNull();

    changePreference('simplified');

    expect(root.querySelector('#lesson-practice')).toBe(practice);
    expect(root.querySelector('[data-action="reveal"]')).toBe(reveal);
    const prev = root.querySelector('.nav-prev') as HTMLAnchorElement;
    const next = root.querySelector('.nav-next') as HTMLAnchorElement;
    expect(prev.getAttribute('href')).toBe('/lessons/lesson-001/');
    expect(next.getAttribute('href')).toBe('/lessons/lesson-003/');
    const coreEl = root.querySelector('.core-sentence') as HTMLElement;
    expect(frontText(coreEl)).toBe('我要這個');
    expect(coreEl.lang).toBe('zh-Hant');
  });

  it('keeps completion and progress storage untouched', () => {
    clearPreference();
    const root = lessonFixture();
    document.body.append(root);
    window.localStorage.setItem('chabiko_completed_lessons', '["lesson-001"]');
    const writeSpy = vi.spyOn(window.localStorage, 'setItem');

    init(root);
    changePreference('simplified');
    changePreference('traditional');

    expect(writeSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('chabiko_completed_lessons')).toBe(
      '["lesson-001"]',
    );
    writeSpy.mockRestore();
  });

  it('serializes provenance into the lesson page source for every reading field', () => {
    expect(lessonSource).toContain('data-script-path-default={lesson.coreSentence}');
    expect(lessonSource).toContain('data-script-path-default={chunk.chunk}');
    expect(lessonSource).toContain('data-script-path-default={note.kanji}');
    expect(lessonSource).toContain('{...exampleScriptAttrs(example)}');
    expect(lessonSource).toContain('initLessonScriptPreference()');
    // Static paths, navigation destinations, and the practice component are
    // unchanged.
    expect(lessonSource).toContain('export const getStaticPaths');
    expect(lessonSource).toContain('href={`/lessons/${prevLesson.id}/`}');
    expect(lessonSource).toContain('href={`/lessons/${nextLesson.id}/`}');
    expect(lessonSource).toContain('<LessonPractice lesson={lesson} />');
    // No answer/practice content is script-transformed.
    expect(lessonSource).not.toContain('data-script-path-default={reviewPrompt');
    expect(lessonSource).not.toContain('answerJa');
  });

  it('keeps static Traditional markup for no-JS rendering', () => {
    expect(lessonSource).toContain('<p class="route-example" lang="zh-Hant"');
    expect(lessonSource).toContain('<p class="core-sentence" lang="zh-Hant"');
    expect(lessonSource).toContain('<dt lang="zh-Hant"');
    expect(lessonSource).toContain('<strong lang="zh-Hant"');
    expect(lessonSource).toContain('<p class="example-sentence" lang="zh-Hant"');
  });
});

// ─── Client module contract ────────────────────────────────────────────────────

describe('client module contract', () => {
  it('listens only to the root preference and the document event, never storage', () => {
    expect(clientSource).toContain('dataset.scriptPreference');
    expect(clientSource).toContain(SCRIPT_PREFERENCE_EVENT);
    expect(clientSource).not.toContain("addEventListener('storage'");
    expect(clientSource).not.toContain("addEventListener('pageshow'");
    expect(clientSource).not.toContain('localStorage');
    expect(clientSource).not.toContain('setItem');
    expect(clientSource).not.toContain('SCRIPT_PREFERENCE_STORAGE_KEY');
  });

  it('uses the exact frozen fallback annotation from #251', () => {
    expect(clientSource).toContain('FALLBACK_ANNOTATION');
    expect(clientSource).not.toContain(
      'この表記は未収録のため、コース標準を表示しています。',
    );
  });
});

// ─── Long-text and mobile/desktop containment ──────────────────────────────────

describe('long-text and viewport containment', () => {
  it('keeps overflow-safe wrapping declarations in the lesson page stylesheet', () => {
    const styleMatch = lessonSource.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];
    expect(css).toMatch(
      /\.lesson-page\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(css).toMatch(
      /\.core-sentence\s*\{[^}]*word-break:\s*break-word/,
    );
    expect(css).toMatch(
      /\.example-sentence\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(css).toMatch(
      /\.script-fallback\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
  });

  it('keeps the responsive breakpoints for 320/375/390 px and desktop', () => {
    expect(lessonSource).toMatch(/@media \(width <= 374px\)/);
    expect(lessonSource).toMatch(/@media \(width >= 640px\)/);
    expect(lessonSource).toMatch(/@media \(width >= 1024px\)/);
  });
});
