/**
 * Phrasebook loader + route contract (Issue #236, fail-closed rework per the
 * #349 kanji-bridge precedent).
 *
 * LAYER 1 — corpus validation (unchanged invariant): the deterministic loader
 * `loadPhrasebook()` loads exactly 30 phrases and 6 dialogs, validates
 * controlled scenario membership, form/review statuses, dialog turn structure,
 * and `relatedPhraseIds` (fail-closed on missing/cross-scenario references),
 * and deep-freezes its result.
 *
 * LAYER 2 — learner-facing production eligibility (fail-closed): the learner
 * route at `/phrasebook/` renders ONLY records whose record-level `reviewStatus`
 * is `reviewed`/`published` AND whose script forms are independently
 * authored/verified (see `isPhrasebookProductionEligible` /
 * `isPhrasebookDialogProductionEligible` / `loadEligiblePhrasebook`). The rest
 * (24 draft phrases + 6 draft dialogs) render as a truthful pending state and
 * never leak draft text into learner-facing HTML.
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
  isPhrasebookDialogProductionEligible,
  isPhrasebookProductionEligible,
  loadEligiblePhrasebook,
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

/** The reviewed, learner-eligible phrase ids in source order (verified facts). */
const ELIGIBLE_PHRASE_IDS = [
  'phrase-001',
  'phrase-airport-001',
  'phrase-airport-002',
  'phrase-airport-003',
  'phrase-airport-004',
  'phrase-airport-005',
];

/** Draft phrase/dialog text that must never reach learner-facing HTML. */
const DRAFT_PHRASE_TEXTS = [
  '不要辣，謝謝。',
  '我要去台北車站。',
  '這個多少錢？',
  '我有預約。',
  '請幫幫我。',
  '可以外帶嗎？',
];

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

// ─── Production-eligibility gate (content-review contract) ────────────────────

describe('phrasebook production-eligibility gate (content-review contract)', () => {
  it('marks exactly the 6 reviewed phrases eligible and all 6 dialogs ineligible', () => {
    const data = loadPhrasebook();
    const eligiblePhrases = data.phrases.filter(isPhrasebookProductionEligible);
    expect(eligiblePhrases.map((phrase) => phrase.id)).toEqual(
      ELIGIBLE_PHRASE_IDS,
    );
    expect(data.dialogs.every((dialog) => !isPhrasebookDialogProductionEligible(dialog))).toBe(true);

    const eligible = loadEligiblePhrasebook();
    expect(eligible.phrases.map((phrase) => phrase.id)).toEqual(
      ELIGIBLE_PHRASE_IDS,
    );
    expect(eligible.dialogs).toHaveLength(0);
  });

  it('groups the eligible subset in controlled scenario order (airport 5, food 1)', () => {
    const groups = groupPhrasebookByScenario(loadEligiblePhrasebook()).filter(
      (group) => group.phrases.length > 0,
    );
    expect(groups.map((group) => group.scenario)).toEqual(['airport', 'food']);
    expect(groups[0].phrases.map((phrase) => phrase.id)).toEqual([
      'phrase-airport-001',
      'phrase-airport-002',
      'phrase-airport-003',
      'phrase-airport-004',
      'phrase-airport-005',
    ]);
    expect(groups[1].phrases.map((phrase) => phrase.id)).toEqual(['phrase-001']);
  });

  it('promotes a draft record to eligible once reviewed, in source order', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook.find((record) => record.id === 'phrase-food-002')!.reviewStatus =
      'reviewed';
    const eligible = loadEligiblePhrasebook(writeTemp('phrasebook', doc));
    expect(eligible.phrases.map((phrase) => phrase.id)).toEqual([
      'phrase-001',
      'phrase-airport-001',
      'phrase-airport-002',
      'phrase-airport-003',
      'phrase-airport-004',
      'phrase-airport-005',
      'phrase-food-002',
    ]);
    expect(eligible.phrases.every(isPhrasebookProductionEligible)).toBe(true);
  });

  it('requires reviewed/published AND an authored/verified traditional form', () => {
    // Reviewed but still generated traditional form → ineligible.
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook.find((record) => record.id === 'phrase-001')!.traditionalStatus =
      'generated';
    expect(
      loadEligiblePhrasebook(writeTemp('phrasebook', doc)).phrases.map((phrase) => phrase.id),
    ).not.toContain('phrase-001');

    // Verified traditional form but still draft → ineligible.
    const doc2 = cloneDocument(basePhrasebookDocument());
    doc2.phrasebook.find((record) => record.id === 'phrase-food-002')!.traditionalStatus =
      'verified';
    expect(
      loadEligiblePhrasebook(writeTemp('phrasebook', doc2)).phrases.map((phrase) => phrase.id),
    ).not.toContain('phrase-food-002');
  });

  it('excludes a reviewed phrase whose Simplified form is still generated (per-form gate)', () => {
    const doc = cloneDocument(basePhrasebookDocument());
    doc.phrasebook.find((record) => record.id === 'phrase-001')!.simplifiedStatus =
      'generated';
    const eligible = loadEligiblePhrasebook(writeTemp('phrasebook', doc));
    expect(eligible.phrases.map((phrase) => phrase.id)).not.toContain('phrase-001');
    expect(eligible.phrases).toHaveLength(5);
  });

  it('keeps a dialog eligible only when reviewed AND every present turn form is authored/verified', () => {
    const base = cloneDocument(baseDialogDocument());

    // Promote every dialog to reviewed: all present turn forms are already
    // authored/verified, so all 6 become eligible in source order.
    const reviewed = cloneDocument(base);
    for (const dialog of reviewed.phrasebookDialogs) {
      dialog.reviewStatus = 'reviewed';
    }
    expect(
      loadEligiblePhrasebook(undefined, writeTemp('phrasebookDialogs', reviewed)).dialogs.map(
        (dialog) => dialog.id,
      ),
    ).toEqual([
      'dialog-transport-001',
      'dialog-airport-001',
      'dialog-food-001',
      'dialog-shopping-001',
      'dialog-hotel-001',
      'dialog-emergency-001',
    ]);

    // A reviewed dialog with one generated traditional turn form → ineligible.
    const generatedTurn = cloneDocument(base);
    for (const dialog of generatedTurn.phrasebookDialogs) {
      dialog.reviewStatus = 'reviewed';
    }
    (
      generatedTurn.phrasebookDialogs.find(
        (dialog) => dialog.id === 'dialog-airport-001',
      )!.turns as { traditionalStatus: string }[]
    )[0].traditionalStatus = 'generated';
    const eligible = loadEligiblePhrasebook(
      undefined,
      writeTemp('phrasebookDialogs', generatedTurn),
    );
    expect(eligible.dialogs.map((dialog) => dialog.id)).not.toContain(
      'dialog-airport-001',
    );
    expect(eligible.dialogs).toHaveLength(5);
  });

  it('keeps a reviewed dialog eligible when a turn legitimately has no Simplified form', () => {
    // dialog-transport-001 turn[1] has no Simplified form; once reviewed it is
    // eligible because every PRESENT form is authored/verified.
    const doc = cloneDocument(baseDialogDocument());
    for (const dialog of doc.phrasebookDialogs) {
      dialog.reviewStatus = 'reviewed';
    }
    const dialogs = loadEligiblePhrasebook(
      undefined,
      writeTemp('phrasebookDialogs', doc),
    ).dialogs;
    expect(dialogs.find((dialog) => dialog.id === 'dialog-transport-001')).toBeDefined();
    expect(dialogs.every(isPhrasebookDialogProductionEligible)).toBe(true);
  });
});

// ─── Route: SSR surface (fresh build, fail-closed) ────────────────────────────

describe('/phrasebook/ — SSR route surface (Issue #236, fail-closed)', () => {
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
    // The route loads through the full loader (for truthful pending counts) and
    // the eligible loader (for content), never reading the data files directly.
    expect(routeSource).toContain("from '../../content/loadPhrasebook'");
    expect(routeSource).toContain('groupPhrasebookByScenario');
    expect(routeSource).toContain('loadEligiblePhrasebook');
    expect(routeSource).not.toMatch(
      /readFileSync|data\/examples\/valid\/phrasebook/,
    );
  });

  it('renders exactly 6 eligible entries (airport 5 + food 1) with no dialogs and a pending notice', () => {
    const entryCount = builtHtml.match(/data-phrasebook-entry/g)?.length ?? 0;
    const dialogCount = builtHtml.match(/data-phrasebook-dialog(?!-turn)/g)?.length ?? 0;
    const turnCount = builtHtml.match(/data-phrasebook-dialog-turn/g)?.length ?? 0;
    expect(entryCount).toBe(6);
    expect(dialogCount).toBe(0);
    expect(turnCount).toBe(0);
    // Eligible reviewed phrase text is rendered.
    expect(builtHtml).toContain('我是來台灣旅遊的。');
    expect(builtHtml).toContain('我要一杯珍珠奶茶');
  });

  it('shows a truthful pending/under-review notice for the rest with real counts', () => {
    // The pending notice states the review in progress and the exact remaining
    // counts (24 phrases + 6 dialogs) derived from the loader.
    expect(builtHtml).toContain('data-phrasebook-pending');
    expect(builtHtml).toContain('このコンテンツは現在、内容の確認・レビューを進めています');
    expect(builtHtml).toContain('残り24件のフレーズと6件の会話');
    expect(routeSource).toMatch(
      /class="phrasebook-pending"[\s\S]*?role="status"[\s\S]*?data-phrasebook-pending/,
    );
  });

  it('leaks no draft phrase or dialog text into learner-facing HTML', () => {
    for (const draftText of DRAFT_PHRASE_TEXTS) {
      expect(builtHtml).not.toContain(draftText);
    }
    // A dialog-only draft line (dialog-airport-001 turn) must not appear.
    expect(builtHtml).not.toContain('你來台灣做什麼？');
    // No draft review-status label may reach the learner surface.
    expect(builtHtml).not.toContain('未レビュー');
    // No dialog affordance renders while all dialogs are pending.
    expect(builtHtml).not.toContain('関連フレーズ：');
    expect(builtHtml).not.toContain('data-phrasebook-dialog-turn');
  });

  it('renders only the eligible scenario sections in controlled order (airport, food)', () => {
    const scenarioTags = [
      ...builtHtml.matchAll(/data-scenario="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(scenarioTags).toEqual(['airport', 'food']);

    const headingRe =
      /phrasebook-scenario__heading"[^>]*>(空港|食事)<\/h2>/g;
    const headingLabels = [...builtHtml.matchAll(headingRe)].map(
      (match) => match[1],
    );
    expect(headingLabels).toEqual(['空港', '食事']);
  });

  it('renders truthful reviewed provenance and never a draft label', () => {
    // Every eligible record is reviewed with a source record → the truthful
    // reviewed provenance renders; draft records render nothing.
    expect(builtHtml).toContain('学習用データ（レビュー済み）');
    expect(builtHtml).not.toContain('学習用データ（未レビュー）');
  });

  it('includes the Header in the header slot with the global script-preference select', () => {
    expect(routeSource).toContain('<Header themeEnabled />');
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
    // The SSR default count reflects the 6 eligible entries.
    expect(builtHtml).toContain('全6件');
  });

  it('initializes the interactive clients when the scenario list is present', () => {
    expect(routeSource).toContain(
      "document.querySelector('[data-phrasebook-list]')",
    );
    expect(routeSource).toContain('initPhrasebookScenarioFilter()');
    expect(routeSource).toContain('initPhrasebookScriptPreference()');
    expect(filterClientSource).toContain('location.search');
    expect(filterClientSource).toContain('[data-phrasebook-entry]');
    expect(scriptClientSource).toContain('SCRIPT_PREFERENCE_EVENT');
  });

  it('carries per-field script provenance and lang on eligible headwords only', () => {
    // 6 eligible phrase headwords carry the script-provenance host contract
    // (no dialog turns render while all dialogs are pending). The exact
    // attribute name is matched (`=` suffix) so the
    // data-script-path-default-status attribute is not counted.
    const entryCount =
      builtHtml.match(/data-script-path-default="/g)?.length ?? 0;
    expect(entryCount).toBe(6);
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
