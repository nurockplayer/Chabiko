// @vitest-environment happy-dom

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTonePractice } from '../src/content/loadTonePractice';
import { mountTonePractice } from '../src/client/tonePractice';

const VALID_TONE = {
  id: 'practice-001',
  type: 'tone-discrimination',
  promptJa: '声調の形を見て、「媽 mā」に合うものを選んでください。',
  correctAnswer: '第一声',
  distractors: ['第二声', '第三声', '第四声'],
  contrastId: 'tone-t1-vs-t2-t3-t4',
  toneContourId: 't1-high-flat',
  toneContourHintJa: '第一声は高く平らに保ちます。',
  interferenceJa: '日本語話者は声の高さを平らに伸ばしやすいので、音の高さを意識しましょう。',
};

const VALID_TONE_2 = {
  id: 'practice-003',
  type: 'tone-discrimination',
  promptJa: '声調の形を見て、「麻 má」に合うものを選んでください。',
  correctAnswer: '第二声',
  distractors: ['第一声', '第三声', '第四声'],
  contrastId: 'tone-t2-vs-t1-t3-t4',
  toneContourId: 't2-rising',
  toneContourHintJa: '第二声は低くから上がります。',
  interferenceJa: '日本語話者は上がりを小さくしやすいので、しっかり上げましょう。',
};

function writeBundle(records: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'chabiko-tone-'));
  const file = join(dir, 'practice.json');
  writeFileSync(file, JSON.stringify({ practice: records }), 'utf8');
  return file;
}

let tempDirs: string[] = [];

function tempBundle(records: unknown[]): string {
  const file = writeBundle(records);
  tempDirs.push(dirname(file));
  return file;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  document.body.replaceChildren();
});

// ─── Loader: source order and validity ─────────────────────────────────────

describe('loadTonePractice — source order and validity', () => {
  it('loads only tone-discrimination records in source order', () => {
    const file = tempBundle([
      { ...VALID_TONE, id: 'practice-001' },
      { id: 'practice-word', type: 'word-order', promptJa: 'x', correctAnswer: 'y' },
      { ...VALID_TONE_2, id: 'practice-003' },
    ]);
    const items = loadTonePractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-001', 'practice-003']);
  });

  it('returns an empty array when no tone-discrimination records exist', () => {
    const file = tempBundle([
      { id: 'practice-word', type: 'word-order', promptJa: 'x', correctAnswer: 'y' },
    ]);
    expect(loadTonePractice(file)).toEqual([]);
  });

  it('returns an empty array for an empty bundle', () => {
    expect(loadTonePractice(tempBundle([]))).toEqual([]);
  });

  it('skips malformed records (missing or non-string fields)', () => {
    const file = tempBundle([
      { ...VALID_TONE, id: 'practice-good' },
      { id: 'practice-no-answer', type: 'tone-discrimination', promptJa: 'x' },
      { id: 'practice-null', type: 'tone-discrimination', promptJa: 'x', correctAnswer: null },
      { id: 'practice-no-distractors', type: 'tone-discrimination', promptJa: 'x', correctAnswer: '第一声' },
      { id: 42, type: 'tone-discrimination', promptJa: 'x', correctAnswer: '第一声' },
      null,
      'not-an-object',
    ]);
    const items = loadTonePractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-good']);
  });

  it('rejects an unknown correctAnswer or non-choice distractors', () => {
    const file = tempBundle([
      { ...VALID_TONE, id: 'practice-unknown-answer', correctAnswer: '軽声' },
      { ...VALID_TONE, id: 'practice-bad-distractor', distractors: ['軽声', '第三声', '第四声'] },
      { ...VALID_TONE, id: 'practice-good' },
    ]);
    const items = loadTonePractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-good']);
  });

  it('rejects a record whose controlled contour contradicts the correct tone', () => {
    const file = tempBundle([
      { ...VALID_TONE, id: 'practice-wrong-contour', toneContourId: 't2-rising' },
      { ...VALID_TONE, id: 'practice-unknown-contour', toneContourId: 't5-mystery' },
      { ...VALID_TONE, id: 'practice-good' },
    ]);
    const items = loadTonePractice(file);
    expect(items.map((i) => i.recordId)).toEqual(['practice-good']);
  });

  it('rejects a duplicate item whose answer and distractors repeat an earlier item', () => {
    const file = tempBundle([
      { ...VALID_TONE, id: 'practice-001' },
      { ...VALID_TONE, id: 'practice-001-copy' },
    ]);
    const items = loadTonePractice(file);
    // First occurrence wins; the duplicate is rejected, never patched.
    expect(items.map((i) => i.recordId)).toEqual(['practice-001']);
  });

  it('keeps an item with the same correct answer but distinct distractors', () => {
    const file = tempBundle([
      { ...VALID_TONE, id: 'practice-001' },
      {
        ...VALID_TONE,
        id: 'practice-004',
        promptJa: '声調の形を見て、「媽 mā」に合うものを選んでください。',
        correctAnswer: '第一声',
        distractors: ['第二声', '第四声', '第三声'],
        contrastId: 'tone-t1-vs-t2-t4-t3',
      },
    ]);
    const items = loadTonePractice(file);
    // Distinct distractor arrangement makes the four choices distinguishable.
    expect(items.map((i) => i.recordId)).toEqual(['practice-001', 'practice-004']);
  });

  it('preserves exact field values and the four named choices', () => {
    const file = tempBundle([VALID_TONE]);
    const items = loadTonePractice(file);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      recordId: 'practice-001',
      promptJa: VALID_TONE.promptJa,
      correctAnswer: '第一声',
      distractors: ['第二声', '第三声', '第四声'],
      contrastId: 'tone-t1-vs-t2-t3-t4',
      toneContourId: 't1-high-flat',
      toneContourHintJa: VALID_TONE.toneContourHintJa,
      interferenceJa: VALID_TONE.interferenceJa,
    });
    const shown = [items[0].correctAnswer, ...items[0].distractors];
    expect(shown).toHaveLength(4);
    expect(new Set(shown).size).toBe(4);
  });

  it('is deterministic across repeated loads', () => {
    const file = tempBundle([VALID_TONE, VALID_TONE_2]);
    const a = loadTonePractice(file);
    const b = loadTonePractice(file);
    expect(a).toEqual(b);
  });
});

describe('loadTonePractice — default source', () => {
  it('loads exactly one canonical item for each of the four tones', () => {
    const items = loadTonePractice();
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.correctAnswer)).toEqual([
      '第一声',
      '第二声',
      '第三声',
      '第四声',
    ]);
    expect(new Set(items.map((item) => item.toneContourId)).size).toBe(4);
  });
});

// ─── Route wiring: component, client, page ────────────────────────────────

function createPracticeHTML(data: { items: unknown[] }): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-tone-practice', '');
  root.setAttribute('data-tone-session', JSON.stringify(data));
  root.innerHTML =
    '<div class="tone-practice-header">' +
    '<p class="tone-practice-progress" data-tone-progress></p>' +
    '<p class="tone-practice-prompt" data-tone-prompt></p></div>' +
    '<div class="tone-contour" data-tone-contour aria-hidden="true">' +
    '<span class="tone-contour__label" data-tone-contour-label></span></div>' +
    '<p class="tone-hint" data-tone-hint></p>' +
    '<p class="tone-interference" data-tone-interference></p>' +
    '<div class="tone-choices" data-tone-choices role="group" aria-label="声調を選ぶ"></div>' +
    '<div class="tone-feedback" data-tone-feedback role="status" aria-live="polite" aria-atomic="true"></div>' +
    '<div class="tone-actions" data-tone-actions></div>';
  document.body.append(root);
  return root;
}

function mount(data: { items: unknown[] }): HTMLElement {
  const root = createPracticeHTML(data);
  mountTonePractice(root);
  return root;
}

describe('tone route wiring', () => {
  it('mounts the client on the component root and renders the first item', () => {
    const file = tempBundle([VALID_TONE]);
    const items = loadTonePractice(file);
    const root = mount({ items });
    expect(root.textContent).toContain(VALID_TONE.promptJa);
    expect(root.querySelector('[data-tone-progress]')?.textContent).toBe('1 / 1');
    // Four named choices, exactly once each.
    const choiceTexts = [...root.querySelectorAll<HTMLElement>('.tone-choice')].map(
      (el) => el.textContent,
    );
    expect(choiceTexts).toHaveLength(4);
    expect(choiceTexts).toEqual(expect.arrayContaining(['第一声', '第二声', '第三声', '第四声']));
    expect(new Set(choiceTexts).size).toBe(4);
    // The contour carries the controlled id and the existing hint and
    // interference guidance.
    const contour = root.querySelector<HTMLElement>('[data-tone-contour]');
    expect(contour?.dataset.contour).toBe('t1-high-flat');
    expect(root.querySelector('[data-tone-hint]')?.textContent).toBe(
      VALID_TONE.toneContourHintJa,
    );
    expect(root.querySelector('[data-tone-interference]')?.textContent).toBe(
      VALID_TONE.interferenceJa,
    );
    // No pre-solved answer in the markup; submit starts disabled.
    expect(root.querySelector('.tone-action--submit')?.hasAttribute('disabled')).toBe(true);
  });

  it('rejects mounting with no items', () => {
    const root = document.createElement('div');
    root.setAttribute('data-tone-practice', '');
    root.setAttribute('data-tone-session', JSON.stringify({ items: [] }));
    document.body.append(root);
    expect(() => mountTonePractice(root)).toThrow(/no items/);
  });

  it('announces feedback through a single polite live region', () => {
    const file = tempBundle([VALID_TONE]);
    const items = loadTonePractice(file);
    const root = mount({ items });
    const live = root.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('data-tone-feedback')).not.toBeNull();
  });
});

describe('tone route page structure', () => {
  it('page source renders a route shell with title, subtitle, and home breadcrumb', () => {
    const source = readAstroSource('src/pages/practice/tones/index.astro');
    expect(source).toMatch(/<BaseLayout title="声調練習" themeEnabled>/);
    expect(source).toMatch(/声調の形を見て、正しい声調を選びましょう/);
    // Auxiliary practice surface: a contextual home breadcrumb (not a
    // first-class track, so no TrackNav) replaces the old bare back link.
    expect(source).toContain('Breadcrumb');
    expect(source).toContain("{ label: 'ホーム', href: '/' }");
    expect(source).toContain("{ label: '声調練習' }");
    expect(source).not.toMatch(/ホームに戻る/);
  });

  it('page and component have no forbidden media or audio APIs', () => {
    const page = readAstroSource('src/pages/practice/tones/index.astro');
    const component = readAstroSource('src/components/TonePractice.astro');
    for (const source of [page, component]) {
      expect(source).not.toMatch(/Audio|speechSynthesis|SpeechSynthesis|webkitAudioContext|getUserMedia|MediaRecorder|canvas/i);
      expect(source).not.toMatch(/<audio|new Image|fetch\(|localStorage|sessionStorage|Math\.random|setTimeout/);
    }
  });

  it('route renders an empty fallback with no component when no items exist', () => {
    const source = readAstroSource('src/pages/practice/tones/index.astro');
    expect(source).toMatch(/items\.length > 0 \? \(/);
    expect(source).toMatch(/<TonePractice items=\{items\} \/>/);
    expect(source).toMatch(/empty-fallback/);
  });
});

function readAstroSource(relativePath: string): string {
  return readFileSync(relativePath, 'utf8');
}
