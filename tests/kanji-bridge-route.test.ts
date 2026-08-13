/**
 * Kanji-bridge loader + route contract (Issue #235).
 *
 * The deterministic loader loads exactly `kanji-bridge-001`..`050` in source
 * order and is fail-closed. The learner route at `/vocabulary/kanji-bridge/`
 * additionally applies the production-eligibility gate (content-review
 * contract): it shows only human-reviewed, authored/verified records. The
 * current corpus is entirely generated/draft, so the route server-renders its
 * pending state and never leaks unverified content to learners.
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
  isKanjiBridgeProductionEligible,
  loadEligibleKanjiBridge,
  loadKanjiBridge,
} from '../src/content/loadKanjiBridge';

const REPO_ROOT = resolve(__dirname, '..');
const ROUTE_SOURCE = resolve(
  REPO_ROOT,
  'src/pages/vocabulary/kanji-bridge/index.astro',
);
const COMPONENT_SOURCE = resolve(REPO_ROOT, 'src/components/KanjiBridgeEntry.astro');
const FILTER_CLIENT_PATH = resolve(REPO_ROOT, 'src/client/kanjiBridgeFilter.ts');
const SCRIPT_CLIENT_PATH = resolve(
  REPO_ROOT,
  'src/client/kanjiBridgeScriptPreference.ts',
);

// Unique per-run build + fixture directories, outside the repo and never shared.
const BUILD_DIR = mkdtempSync(join(tmpdir(), 'chabiko-kanji-bridge-route-'));
const FIXTURE_DIR = mkdtempSync(join(tmpdir(), 'chabiko-kanji-bridge-fixtures-'));
const BUILT_ROUTE = join(BUILD_DIR, 'vocabulary/kanji-bridge/index.html');

const routeSource = readFileSync(ROUTE_SOURCE, 'utf8');
const componentSource = readFileSync(COMPONENT_SOURCE, 'utf8');
const filterClientSource = readFileSync(FILTER_CLIENT_PATH, 'utf8');
const scriptClientSource = readFileSync(SCRIPT_CLIENT_PATH, 'utf8');

/** Full built HTML of the route, read after the fresh build. */
let builtHtml = '';

function expectedIds(): string[] {
  return Array.from({ length: 50 }, (_, i) =>
    `kanji-bridge-${String(i + 1).padStart(3, '0')}`,
  );
}

// ─── Temp fixture helpers (only this suite's files) ───────────────────────────

let fixtureCounter = 0;

function writeTemp(document: unknown): string {
  const path = join(FIXTURE_DIR, `vocabulary-${fixtureCounter++}.json`);
  writeFileSync(path, JSON.stringify(document), 'utf-8');
  return path;
}

/** A valid vocabulary document containing exactly the 50 kanji-bridge records. */
function baseVocabularyDocument(): { vocabulary: Record<string, unknown>[] } {
  const doc = JSON.parse(
    readFileSync(join(REPO_ROOT, 'data/examples/valid/vocabulary.json'), 'utf8'),
  ) as { vocabulary: Record<string, unknown>[] };
  return {
    vocabulary: doc.vocabulary.filter((entry) =>
      String(entry.id).startsWith('kanji-bridge-'),
    ),
  };
}

function cloneDocument(
  document: { vocabulary: Record<string, unknown>[] },
): { vocabulary: Record<string, unknown>[] } {
  return structuredClone(document);
}

// ─── Loader: exact corpus ──────────────────────────────────────────────────────

describe('loadKanjiBridge — exact deterministic corpus', () => {
  it('loads exactly 50 entries with the frozen ids in source order', () => {
    const entries = loadKanjiBridge();
    expect(entries).toHaveLength(50);
    expect(entries.map((entry) => entry.id)).toEqual(expectedIds());
  });

  it('maps only the surface fields and deep-freezes the result', () => {
    const entries = loadKanjiBridge();
    for (const entry of entries) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.examples)).toBe(true);
      expect(Object.isFrozen(entry.examples[0])).toBe(true);
      expect(entry.examples).toHaveLength(1);
      expect(typeof entry.traditional).toBe('string');
      expect(typeof entry.traditionalStatus).toBe('string');
      expect(typeof entry.simplified).toBe('string');
      expect(typeof entry.simplifiedStatus).toBe('string');
      expect(typeof entry.pinyin).toBe('string');
      expect(typeof entry.japanese).toBe('string');
      expect(typeof entry.kana).toBe('string');
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.similarityType).toBe('string');
      expect(typeof entry.toneNote).toBe('string');
      expect(typeof entry.reviewStatus).toBe('string');
      expect(entry.source).toBeTypeOf('object');
      expect(typeof entry.source.type).toBe('string');
    }
  });

  it('reflects the verified data facts: 20/15/15 relations and all generated/draft', () => {
    const entries = loadKanjiBridge();
    const byRelation = (relation: string): number =>
      entries.filter((entry) => entry.similarityType === relation).length;
    expect(byRelation('same-meaning')).toBe(20);
    expect(byRelation('partial-overlap')).toBe(15);
    expect(byRelation('false-friend')).toBe(15);
    for (const entry of entries) {
      expect(entry.traditionalStatus).toBe('generated');
      expect(entry.simplifiedStatus).toBe('generated');
      expect(entry.reviewStatus).toBe('draft');
      expect(entry.source.type).toBe('generated');
      expect(entry.examples[0].traditionalStatus).toBe('generated');
      expect(entry.examples[0].simplifiedStatus).toBe('generated');
    }
  });

  it('is deterministic and returns independent references across calls', () => {
    const first = loadKanjiBridge();
    const second = loadKanjiBridge();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first[0]).not.toBe(second[0]);
    expect(first[0].examples[0]).not.toBe(second[0].examples[0]);
  });
});

// ─── Loader: fail-closed branches ──────────────────────────────────────────────

describe('loadKanjiBridge — fail-closed branches', () => {
  it('throws when the file does not exist', () => {
    expect(() =>
      loadKanjiBridge(join(FIXTURE_DIR, 'does-not-exist.json')),
    ).toThrow();
  });

  it('throws on invalid JSON', () => {
    const path = join(FIXTURE_DIR, 'malformed.json');
    writeFileSync(path, '{ not valid json', 'utf-8');
    expect(() => loadKanjiBridge(path)).toThrow(/Failed to parse vocabulary/);
  });

  it('throws on an invalid document structure', () => {
    const path = writeTemp({ foo: [] });
    expect(() => loadKanjiBridge(path)).toThrow(/Invalid vocabulary structure/);
  });

  it('throws when the corpus count is not exactly 50', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    doc.vocabulary.pop();
    expect(() => loadKanjiBridge(writeTemp(doc))).toThrow(
      /must contain exactly 50 entries, got 49/,
    );
  });

  it('throws on duplicate kanji-bridge ids', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    doc.vocabulary[1].id = 'kanji-bridge-001';
    expect(() => loadKanjiBridge(writeTemp(doc))).toThrow(
      /duplicate kanji-bridge id 'kanji-bridge-001'/,
    );
  });

  it('throws on an out-of-range id (kanji-bridge-051)', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    doc.vocabulary[49].id = 'kanji-bridge-051';
    expect(() => loadKanjiBridge(writeTemp(doc))).toThrow(
      /kanji-bridge id order violation: expected 'kanji-bridge-050'/,
    );
  });

  it('throws when entries are out of source order', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    const first = doc.vocabulary[0];
    doc.vocabulary[0] = doc.vocabulary[1];
    doc.vocabulary[1] = first;
    expect(() => loadKanjiBridge(writeTemp(doc))).toThrow(
      /kanji-bridge id order violation: expected 'kanji-bridge-001' at index 0, got 'kanji-bridge-002'/,
    );
  });

  it('throws on a missing required field', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    delete doc.vocabulary[0].toneNote;
    expect(() => loadKanjiBridge(writeTemp(doc))).toThrow(
      /missing or empty 'toneNote'/,
    );
  });

  it('throws on an invalid similarityType', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    doc.vocabulary[0].similarityType = 'garbage';
    expect(() => loadKanjiBridge(writeTemp(doc))).toThrow(
      /invalid similarityType 'garbage'/,
    );
  });
});

// ─── Production-eligibility gate (content-review contract) ─────────────────────

describe('kanji-bridge production-eligibility gate (content-review contract)', () => {
  it('excludes the entire current corpus (all generated/draft)', () => {
    const entries = loadKanjiBridge();
    expect(entries).toHaveLength(50);
    expect(entries.every(isKanjiBridgeProductionEligible)).toBe(false);
    expect(loadEligibleKanjiBridge()).toHaveLength(0);
  });

  it('loads every record once promoted to reviewed + verified, in source order', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    for (const record of doc.vocabulary) {
      record.reviewStatus = 'reviewed';
      record.traditionalStatus = 'verified';
      // Example forms must be promoted too (per-form provenance is a separate
      // fact the eligibility gate checks).
      (record.examples as { traditionalStatus: string }[])[0].traditionalStatus =
        'verified';
    }
    const eligible = loadEligibleKanjiBridge(writeTemp(doc));
    expect(eligible).toHaveLength(50);
    expect(eligible.map((entry) => entry.id)).toEqual(expectedIds());
    expect(eligible.every(isKanjiBridgeProductionEligible)).toBe(true);
  });

  it('keeps generated/draft records out even in a mixed corpus', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    doc.vocabulary[0].reviewStatus = 'reviewed';
    doc.vocabulary[0].traditionalStatus = 'verified';
    (doc.vocabulary[0].examples as { traditionalStatus: string }[])[0]
      .traditionalStatus = 'verified';
    const eligible = loadEligibleKanjiBridge(writeTemp(doc));
    expect(eligible.map((entry) => entry.id)).toEqual(['kanji-bridge-001']);
  });

  it('excludes a record whose example script form is still generated (per-form gate)', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    doc.vocabulary[0].reviewStatus = 'reviewed';
    doc.vocabulary[0].traditionalStatus = 'verified';
    // The example form is left generated → the whole record is ineligible.
    const eligible = loadEligibleKanjiBridge(writeTemp(doc));
    expect(eligible).toHaveLength(0);
  });

  it('requires reviewed/published AND an authored/verified traditional form', () => {
    const doc = cloneDocument(baseVocabularyDocument());
    // Reviewed but still generated traditional → not eligible.
    doc.vocabulary[0].reviewStatus = 'reviewed';
    expect(loadEligibleKanjiBridge(writeTemp(doc))).toHaveLength(0);

    const doc2 = cloneDocument(baseVocabularyDocument());
    // Verified traditional but still draft → not eligible.
    doc2.vocabulary[0].traditionalStatus = 'verified';
    expect(loadEligibleKanjiBridge(writeTemp(doc2))).toHaveLength(0);
  });
});

// ─── Route: SSR surface (fresh build, fail-closed) ─────────────────────────────

describe('/vocabulary/kanji-bridge/ — SSR route surface (Issue #235, fail-closed)', () => {
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

  it('renders the exact Japanese title/h1 and loads through the eligible loader', () => {
    expect(existsSync(BUILT_ROUTE)).toBe(true);
    // Exact h1 markup is guaranteed in source; the built HTML (with Astro
    // scope ids) still carries the exact text.
    expect(routeSource).toContain('<h1>漢字ブリッジ 単語</h1>');
    expect(builtHtml).toContain('漢字ブリッジ 単語');
    expect(routeSource).toContain(
      "import { loadEligibleKanjiBridge } from '../../../content/loadKanjiBridge'",
    );
    // The route never reads the data file directly.
    expect(routeSource).not.toMatch(/readFileSync|data\/examples\/valid\/vocabulary\.json/);
  });

  it('renders the pending state and leaks no generated/draft content while the corpus is unapproved', () => {
    // The fail-closed pending state is server-rendered.
    expect(builtHtml).toContain('data-kanji-bridge-pending');
    expect(builtHtml).toContain('現在、内容の確認・レビューを進めています');
    // No entry cards, no toolbar, no filter, no provenance claims.
    expect(builtHtml).not.toMatch(/data-kanji-bridge-entry/);
    expect(builtHtml).not.toMatch(/data-script-path-default/);
    expect(builtHtml).not.toContain('kanji-bridge-relation-filter');
    expect(builtHtml).not.toContain('AI生成・未検証');
    expect(builtHtml).not.toContain('この表記は未収録のため');
  });

  it('includes the Header in the header slot with the global script-preference select', () => {
    expect(routeSource).toContain('<Header />');
    expect(routeSource).toContain('slot="header"');
    expect(builtHtml).toContain('id="script-preference-select"');
    // The #252 control renders the frozen コース標準 option label.
    expect(builtHtml).toContain('コース標準');
  });

  it('marks the dynamic filter count as a live status region (P2-4)', () => {
    // The count only renders once eligible content exists; assert the source
    // contract that it is an aria-live status region.
    expect(routeSource).toMatch(/data-relation-count[\s\S]*?role="status"/);
  });

  it('initializes the interactive clients only when eligible content is present', () => {
    expect(routeSource).toContain(
      "document.querySelector('[data-kanji-bridge-list]')",
    );
    expect(routeSource).toContain('initKanjiBridgeFilter()');
    expect(routeSource).toContain('initKanjiBridgeScriptPreference()');
    expect(filterClientSource).toContain('location.search');
    expect(scriptClientSource).toContain('SCRIPT_PREFERENCE_EVENT');
  });

  it('presents kana as a labeled headword reading, never appended to the gloss (P2-3)', () => {
    // The kana is the Japanese on-reading of the headword, not of the full
    // gloss; appending it after the gloss duplicated readings (e.g. 電話
    // （でんわ）（でんわ）) and mislabelled false friends. The component must
    // not append it to the gloss line, and shows a labeled 「日本語読み」
    // reading only when the gloss does not already contain the kana.
    expect(componentSource).not.toContain('（{entry.kana}）');
    expect(componentSource).not.toMatch(/kanji-bridge-entry__kana/);
    expect(componentSource).toContain('日本語読み：');
    expect(componentSource).toContain('glossIncludesKana');
    expect(componentSource).toMatch(/!glossIncludesKana/);
  });

  it('keeps overflow-safe wrapping declarations and mobile-first layouts', () => {
    const componentCss =
      componentSource.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(componentCss).toMatch(
      /\.kanji-bridge-entry\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(componentCss).toMatch(
      /\.kanji-bridge-entry__headword\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    // No nowrap on long text-bearing fields.
    expect(componentCss).not.toMatch(/white-space:\s*nowrap/);
    expect(routeSource).toMatch(/@media \(width >= 640px\)/);
  });
});
