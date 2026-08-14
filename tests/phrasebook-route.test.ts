/**
 * Phrasebook loader + route contract (Issue #236).
 *
 * The deterministic loader loads exactly 30 phrases and 6 dialogs, validates
 * controlled scenario membership, form/review statuses, dialog turn structure,
 * and `relatedPhraseIds` (fail-closed on missing/cross-scenario references),
 * and deep-freezes its result. Unlike kanji-bridge there is NO production
 * gate: every phrase/dialog form is authored/verified, so the learner route at
 * `/phrasebook/` server-renders all 30 phrases + 6 dialogs in the controlled
 * scenario order with each record's reviewStatus/provenance shown truthfully.
 *
 * The fresh build writes to a unique temporary directory (never the shared
 * dist/). Vitest serializes this file with the other Astro build suites because
 * Astro still writes its repository-local .astro cache.
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  groupPhrasebookByScenario,
  loadPhrasebook,
  PHRASEBOOK_DIALOG_COUNT,
  PHRASEBOOK_PHRASE_COUNT,
  PHRASEBOOK_SCENARIOS,
} from '../src/content/loadPhrasebook';

const REPO_ROOT = resolve(__dirname, '..');
const ROUTE_SOURCE = resolve(REPO_ROOT, 'src/pages/phrasebook/index.astro');
const COMPONENT_SOURCE = resolve(REPO_ROOT, 'src/components/PhrasebookScenario.astro');
const FILTER_CLIENT_PATH = resolve(REPO_ROOT, 'src/client/phrasebookScenarioFilter.ts');
const SCRIPT_CLIENT_PATH = resolve(
  REPO_ROOT,
  'src/client/phrasebookScriptPreference.ts',
);
const PHRASEBOOK_DATA = resolve(REPO_ROOT, 'data/examples/valid/phrasebook.json');
const DIALOG_DATA = resolve(REPO_ROOT, 'data/examples/valid/phrasebook-dialogs.json');

// Unique per-run build + fixture directories, outside the repo and never shared.
const BUILD_DIR = mkdtempSync(join(tmpdir(), 'chabiko-phrasebook-route-'));
const FIXTURE_DIR = mkdtempSync(join(tmpdir(), 'chabiko-phrasebook-fixtures-'));
const BUILT_ROUTE = join(BUILD_DIR, 'phrasebook/index.html');

const routeSource = readFileSync(ROUTE_SOURCE, 'utf8');
const componentSource = readFileSync(COMPONENT_SOURCE, 'utf8');
const filterClientSource = readFileSync(FILTER_CLIENT_PATH, 'utf8');
const scriptClientSource = readFileSync(SCRIPT_CLIENT_PATH, 'utf8');

/** Full built HTML of the route, read after the fresh build. */
let builtHtml = '';

/** Expected phrase ids in controlled scenario order (source order preserved). */
const EXPECTED_SCENARIO_PHRASE_IDS: Record<string, string[]> = {
  airport: [
    'phrase-airport-001',
    'phrase-airport-002',
    'phrase-airport-003',
    'phrase-airport-004',
    'phrase-airport-005',
  ],
  transport: [
    'phrase-002',
    'phrase-transport-002',
    'phrase-transport-003',
    'phrase-transport-004',
    'phrase-transport-005',
  ],
  food: [
    'phrase-001',
    'phrase-food-002',
    'phrase-food-003',
    'phrase-food-004',
    'phrase-food-005',
  ],
  shopping: [
    'phrase-shopping-001',
    'phrase-shopping-002',
    'phrase-shopping-003',
    'phrase-shopping-004',
    'phrase-shopping-005',
  ],
  hotel: [
    'phrase-hotel-001',
    'phrase-hotel-002',
    'phrase-hotel-003',
    'phrase-hotel-004',
    'phrase-hotel-005',
  ],
  emergency: [
    'phrase-emergency-001',
    'phrase-emergency-002',
    'phrase-emergency-003',
    'phrase-emergency-004',
    'phrase-emergency-005',
  ],
};

// ─── Temp fixture helpers (only this suite's files) ───────────────────────────

let fixtureCounter = 0;

function writeTemp(pathName: string, document: unknown): string {
  const path = join(FIXTURE_DIR, `${pathName}-${fixtureCounter++}.json`);
  writeFileSync(path, JSON.stringify(document), 'utf-8');
  return path;
}

function basePhrasebookDocument(): { phrasebook: Record<string, unknown>[] } {
  return JSON.parse(readFileSync(PHRASEBOOK_DATA, 'utf8')) as {
    phrasebook: Record<string, unknown>[];
  };
}

function baseDialogDocument(): { phrasebookDialogs: Record<string, unknown>[] } {
  return JSON.parse(readFileSync(DIALOG_DATA, 'utf8')) as {
    phrasebookDialogs: Record<string, unknown>[];
  };
}

function cloneDocument<T>(document: T): T {
  return structuredClone(document);
}

// ─── Loader: exact deterministic corpus ───────────────────────────────────────

describe('loadPhrasebook — exact deterministic corpus', () => {
  it('loads exactly 30 phrases and 6 dialogs with the frozen scenario set', () => {
    const data = loadPhrasebook();
    expect(data.phrases).toHaveLength(PHRASEBOOK_PHRASE_COUNT);
    expect(data.dialogs).toHaveLength(PHRASEBOOK_DIALOG_COUNT);
    expect(PHRASEBOOK_PHRASE_COUNT).toBe(30);
    expect(PHRASEBOOK_DIALOG_COUNT).toBe(6);
    expect(PHRASEBOOK_SCENARIOS).toEqual([
      'airport',
      'transport',
      'food',
      'shopping',
      'hotel',
      'emergency',
    ]);
    const phraseIds = data.phrases.map((phrase) => phrase.id);
    expect(new Set(phraseIds).size).toBe(phraseIds.length);
    const dialogIds = data.dialogs.map((dialog) => dialog.id);
    expect(new Set(dialogIds).size).toBe(dialogIds.length);
  });

  it('groups phrases into the six scenarios in controlled order, 5 each, source order preserved', () => {
    const groups = groupPhrasebookByScenario(loadPhrasebook());
    expect(groups.map((group) => group.scenario)).toEqual([...PHRASEBOOK_SCENARIOS]);
    for (const group of groups) {
      expect(group.phrases.map((phrase) => phrase.id)).toEqual(
        EXPECTED_SCENARIO_PHRASE_IDS[group.scenario],
      );
      expect(group.phrases).toHaveLength(5);
      expect(group.dialog?.scenario).toBe(group.scenario);
    }
  });

  it('reflects the verified data facts: 5 per scenario, reviewed/draft split, authored/verified forms', () => {
    const data = loadPhrasebook();
    const byScenario = (scenario: string): number =>
      data.phrases.filter((phrase) => phrase.scenario === scenario).length;
    for (const scenario of PHRASEBOOK_SCENARIOS) {
      expect(byScenario(scenario)).toBe(5);
    }
    const reviewed = data.phrases.filter(
      (phrase) => phrase.reviewStatus === 'reviewed',
    );
    const draft = data.phrases.filter((phrase) => phrase.reviewStatus === 'draft');
    // phrase-001 + the five airport phrases are reviewed; the rest are draft.
    expect(reviewed).toHaveLength(6);
    expect(draft).toHaveLength(24);
    for (const phrase of data.phrases) {
      expect(phrase.traditionalStatus).toBe('authored');
      expect(phrase.simplifiedStatus).toBe('verified');
      expect(phrase.traditional.length).toBeGreaterThan(0);
      expect(phrase.pinyin.length).toBeGreaterThan(0);
      expect(phrase.japanese.length).toBeGreaterThan(0);
      expect(phrase.usageNotesJa.length).toBeGreaterThan(0);
    }
    for (const dialog of data.dialogs) {
      expect(dialog.turns.length).toBe(6);
      expect(dialog.reviewStatus).toBe('draft');
      for (const turn of dialog.turns) {
        expect(['learner', 'partner']).toContain(turn.speaker);
        expect(turn.traditionalStatus).toBe('authored');
        if (turn.simplified !== undefined) {
          expect(turn.simplifiedStatus).toBe('verified');
        } else {
          expect(turn.simplifiedStatus).toBeUndefined();
        }
      }
    }
  });

  it('resolves every dialog relatedPhraseId to a same-scenario phrase and deep-freezes results', () => {
    const data = loadPhrasebook();
    const phraseById = new Map(data.phrases.map((phrase) => [phrase.id, phrase]));
    for (const dialog of data.dialogs) {
      expect(dialog.relatedPhraseIds.length).toBeGreaterThan(0);
      for (const relatedId of dialog.relatedPhraseIds) {
        expect(phraseById.get(relatedId)?.scenario).toBe(dialog.scenario);
      }
    }
    for (const phrase of data.phrases) {
      expect(Object.isFrozen(phrase)).toBe(true);
    }
    for (const dialog of data.dialogs) {
      expect(Object.isFrozen(dialog)).toBe(true);
      expect(Object.isFrozen(dialog.turns)).toBe(true);
      expect(Object.isFrozen(dialog.relatedPhraseIds)).toBe(true);
      for (const turn of dialog.turns) expect(Object.isFrozen(turn)).toBe(true);
    }
  });

  it('is deterministic and returns independent references across calls', () => {
    const first = loadPhrasebook();
    const second = loadPhrasebook();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.phrases[0]).not.toBe(second.phrases[0]);
    expect(first.dialogs[0].turns[0]).not.toBe(second.dialogs[0].turns[0]);
  });
});

// ─── Loader: fail-closed branches ─────────────────────────────────────────────

describe('loadPhrasebook — fail-closed branches', () => {
  it('throws when a file does not exist', () => {
    expect(() =>
      loadPhrasebook(join(FIXTURE_DIR, 'does-not-exist.json')),
    ).toThrow();
    expect(() =>
      loadPhrasebook(undefined, join(FIXTURE_DIR, 'does-not-exist.json')),
    ).toThrow();
  });

  it('throws on invalid JSON', () => {
    const path = join(FIXTURE_DIR, 'malformed.json');
    writeFileSync(path, '{ not valid json', 'utf-8');
    expect(() => loadPhrasebook(path)).toThrow(/Failed to parse phrasebook/);
  });

  it('throws on an invalid document structure', () => {
    const path = writeTemp('phrasebook', { foo: [] });
    expect(() => loadPhrasebook(path)).toThrow(/Invalid phrasebook structure/);
  });

  it('throws when the phrase count is not exactly 30', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook.pop();
    const phrasePath = writeTemp('phrasebook', doc);
    expect(() => loadPhrasebook(phrasePath)).toThrow(
      /must contain exactly 30 phrases, got 29/,
    );
  });

  it('throws when the dialog count is not exactly 6', () => {
    const doc = cloneDocument(baseDialogDocument());
    doc.phrasebookDialogs.pop();
    const dialogPath = writeTemp('phrasebookDialogs', doc);
    expect(() => loadPhrasebook(undefined, dialogPath)).toThrow(
      /must contain exactly 6 dialogs, got 5/,
    );
  });

  it('throws on a duplicate phrase id', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook[1].id = doc.phrasebook[0].id;
    expect(() => loadPhrasebook(writeTemp('phrasebook', doc))).toThrow(
      /duplicate phrasebook id 'phrase-001'/,
    );
  });

  it('throws on a duplicate dialog id', () => {
    const doc = cloneDocument(baseDialogDocument());
    doc.phrasebookDialogs[1].id = doc.phrasebookDialogs[0].id;
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /duplicate phrasebook dialog id 'dialog-transport-001'/,
    );
  });

  it('throws on an invalid scenario', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook[0].scenario = 'garbage';
    expect(() => loadPhrasebook(writeTemp('phrasebook', doc))).toThrow(
      /invalid scenario 'garbage'/,
    );
  });

  it('throws on a missing required phrase field', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    delete doc.phrasebook[0].usageNotesJa;
    expect(() => loadPhrasebook(writeTemp('phrasebook', doc))).toThrow(
      /missing or empty 'usageNotesJa'/,
    );
  });

  it('throws on an invalid phrase form status', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook[0].traditionalStatus = 'garbage';
    expect(() => loadPhrasebook(writeTemp('phrasebook', doc))).toThrow(
      /invalid traditionalStatus 'garbage'/,
    );
  });

  it('throws on an invalid phrase reviewStatus', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook[0].reviewStatus = 'garbage';
    expect(() => loadPhrasebook(writeTemp('phrasebook', doc))).toThrow(
      /invalid reviewStatus 'garbage'/,
    );
  });

  it('throws on a dialog turn with an invalid speaker', () => {
    const doc = cloneDocument(baseDialogDocument());
    (doc.phrasebookDialogs[0].turns as { speaker: string }[])[0].speaker =
      'stranger';
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /invalid speaker 'stranger'/,
    );
  });

  it('throws when a turn has simplifiedStatus but no simplified form', () => {
    const doc = cloneDocument(baseDialogDocument());
    // dialog-transport-001 turn[1] has no simplified form; add a dangling status.
    (doc.phrasebookDialogs[0].turns as { simplifiedStatus?: string }[])[1]
      .simplifiedStatus = 'verified';
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /has simplifiedStatus without a simplified form/,
    );
  });

  it('throws when a dialog has no turns', () => {
    const doc = cloneDocument(baseDialogDocument());
    doc.phrasebookDialogs[0].turns = [];
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /must have at least one turn/,
    );
  });

  it('throws on an empty relatedPhraseIds list', () => {
    const doc = cloneDocument(baseDialogDocument());
    doc.phrasebookDialogs[0].relatedPhraseIds = [];
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /must have at least one relatedPhraseId/,
    );
  });

  it('throws when a relatedPhraseId references a missing phrase', () => {
    const doc = cloneDocument(baseDialogDocument());
    doc.phrasebookDialogs[0].relatedPhraseIds = ['phrase-does-not-exist'];
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /references missing phrase 'phrase-does-not-exist'/,
    );
  });

  it('throws when a relatedPhraseId references a cross-scenario phrase', () => {
    const doc = cloneDocument(baseDialogDocument());
    // dialog-transport-001 is transport; phrase-001 is food → cross-scenario.
    doc.phrasebookDialogs[0].relatedPhraseIds = ['phrase-001'];
    expect(() => loadPhrasebook(undefined, writeTemp('phrasebookDialogs', doc))).toThrow(
      /references cross-scenario phrase 'phrase-001'/,
    );
  });
});

// ─── Route: SSR surface (fresh build, no production gate) ─────────────────────

describe('/phrasebook/ — SSR route surface (Issue #236)', () => {
  beforeAll(() => {
    execSync(`pnpm astro build --outDir ${BUILD_DIR}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 180_000,
    });
    builtHtml = readFileSync(BUILT_ROUTE, 'utf8');
  });

  afterAll(() => {
    // Clean only the directories this suite created.
    for (const dir of [BUILD_DIR, FIXTURE_DIR]) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders the exact Japanese h1/subtitle and loads through the loader', () => {
    expect(existsSync(BUILT_ROUTE)).toBe(true);
    expect(routeSource).toContain('<h1>台湾旅行フレーズ集</h1>');
    expect(builtHtml).toContain('台湾旅行フレーズ集');
    // The route loads through the loader (multiline import in source), never
    // reading the data file directly.
    expect(routeSource).toContain("from '../../content/loadPhrasebook'");
    expect(routeSource).toContain('groupPhrasebookByScenario');
    expect(routeSource).not.toMatch(
      /readFileSync|data\/examples\/valid\/phrasebook/,
    );
  });

  it('server-renders all 30 phrases and all 6 dialogs (no pending state, no gate)', () => {
    const entryCount = builtHtml.match(/data-phrasebook-entry/g)?.length ?? 0;
    const dialogCount = builtHtml.match(/data-phrasebook-dialog(?!-turn)/g)?.length ?? 0;
    const turnCount = builtHtml.match(/data-phrasebook-dialog-turn/g)?.length ?? 0;
    expect(entryCount).toBe(30);
    expect(dialogCount).toBe(6);
    expect(turnCount).toBe(36);
    // Unlike kanji-bridge, the phrasebook surface has NO pending state.
    expect(builtHtml).not.toMatch(/data-phrasebook-pending/);
    expect(builtHtml).not.toContain('現在、内容の確認・レビューを進めています');
    // Known authored/verified phrase text is rendered.
    expect(builtHtml).toContain('我是來台灣旅遊的。');
  });

  it('renders scenario sections in the controlled order (airport … emergency)', () => {
    const scenarioTags = [
      ...builtHtml.matchAll(/data-scenario="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(scenarioTags).toEqual([...PHRASEBOOK_SCENARIOS]);

    // The scenario headings appear in the same controlled order. The built
    // HTML carries a scoped-style data-astro-cid attribute on the heading, so
    // capture the label text through the attribute to assert order by label.
    const headingRe =
      /phrasebook-scenario__heading"[^>]*>(空港|交通|食事|買い物|ホテル|緊急時)<\/h2>/g;
    const headingLabels = [...builtHtml.matchAll(headingRe)].map(
      (match) => match[1],
    );
    expect(headingLabels).toEqual(['空港', '交通', '食事', '買い物', 'ホテル', '緊急時']);
  });

  it('renders truthful provenance/status labels for reviewed and draft records', () => {
    // Reviewed records show the reviewed provenance (phrase-airport-001 has a
    // source and is reviewed; phrase-001 too).
    expect(builtHtml).toContain('学習用データ（レビュー済み）');
    // Draft records show the draft review label.
    expect(builtHtml).toContain('学習用データ（未レビュー）');
  });

  it('renders dialog turns with related-phrase references resolved on-page', () => {
    // Related-phrase references render the actual referenced phrase text.
    expect(builtHtml).toContain('関連フレーズ：');
    // dialog-airport-001 references phrase-airport-004 (請問機場捷運在哪裡？).
    expect(builtHtml).toContain('請問機場捷運在哪裡？');
  });

  it('includes the Header in the header slot with the global script-preference select', () => {
    expect(routeSource).toContain('<Header />');
    expect(routeSource).toContain('slot="header"');
    expect(builtHtml).toContain('id="script-preference-select"');
    expect(builtHtml).toContain('コース標準');
  });

  it('provides the native scenario filter with the six controlled values and a reset link', () => {
    expect(routeSource).toContain('data-scenario-filter');
    for (const value of ['airport', 'transport', 'food', 'shopping', 'hotel', 'emergency']) {
      expect(routeSource).toContain(`<option value="${value}">`);
    }
    expect(builtHtml).toContain('id="phrasebook-scenario-filter"');
    expect(routeSource).toContain('href="/phrasebook/"');
  });

  it('marks the dynamic filter count as a live status region and renders a no-match state', () => {
    expect(routeSource).toMatch(/data-scenario-count[\s\S]*?role="status"/);
    expect(routeSource).toContain('data-phrasebook-no-match');
    expect(routeSource).toContain('該当する場面がありません。');
  });

  it('initializes the interactive clients when the scenario list is present', () => {
    expect(routeSource).toContain(
      "document.querySelector('[data-phrasebook-list]')",
    );
    expect(routeSource).toContain('initPhrasebookScenarioFilter()');
    expect(routeSource).toContain('initPhrasebookScriptPreference()');
    expect(filterClientSource).toContain('location.search');
    expect(scriptClientSource).toContain('SCRIPT_PREFERENCE_EVENT');
  });

  it('carries per-field script provenance and lang on headwords and dialog turns', () => {
    // 30 phrase headwords + 36 dialog turns (related references are plain text).
    // The exact attribute name is matched (`=` suffix) so the
    // data-script-path-default-status attribute is not counted.
    const entryCount =
      builtHtml.match(/data-script-path-default="/g)?.length ?? 0;
    expect(entryCount).toBe(66);
    expect(componentSource).toContain('data-script-annotation-host');
    expect(componentSource).toContain('data-script-simplified');
    expect(componentSource).toContain('data-script-simplified-status');
  });

  it('keeps overflow-safe wrapping declarations and mobile-first layouts', () => {
    const componentCss =
      componentSource.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(componentCss).toMatch(
      /\.phrasebook-phrase\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(componentCss).toMatch(
      /\.phrasebook-phrase__headword\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(componentCss).toMatch(
      /\.phrasebook-dialog__line\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    // No nowrap on long text-bearing fields.
    expect(componentCss).not.toMatch(/white-space:\s*nowrap/);
    expect(routeSource).toMatch(/@media \(width >= 640px\)/);
  });
});
