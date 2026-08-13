/**
 * Kanji-bridge loader + route contract (Issue #235).
 *
 * The route is a static Astro build that loads exactly `kanji-bridge-001`..`050`
 * through loadKanjiBridge() and server-renders the 50 cards in source order with
 * the truthful generated/draft provenance. The loader is deterministic and
 * fail-closed, and each load returns independent, deeply frozen references.
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
import { loadKanjiBridge } from '../src/content/loadKanjiBridge';

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

// ─── Route: SSR surface (fresh build) ──────────────────────────────────────────

describe('/vocabulary/kanji-bridge/ — SSR route surface (Issue #235)', () => {
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

  it('renders the exact Japanese title/h1 and loads through the loader', () => {
    expect(existsSync(BUILT_ROUTE)).toBe(true);
    // Exact h1 markup is guaranteed in source; the built HTML (with Astro
    // scope ids) still carries the exact text.
    expect(routeSource).toContain('<h1>漢字ブリッジ 単語</h1>');
    expect(builtHtml).toContain('漢字ブリッジ 単語');
    expect(routeSource).toContain(
      "import { loadKanjiBridge } from '../../../content/loadKanjiBridge'",
    );
    expect(routeSource.match(/loadKanjiBridge\(\)/g)).toHaveLength(1);
    // The route never reads the data file directly.
    expect(routeSource).not.toMatch(/readFileSync|data\/examples\/valid\/vocabulary\.json/);
  });

  it('fails loudly when the corpus is empty', () => {
    expect(routeSource).toContain('kanji bridge vocabulary is empty');
  });

  it('includes the Header in the header slot with the global script-preference select', () => {
    expect(routeSource).toContain('<Header />');
    expect(routeSource).toContain('slot="header"');
    expect(builtHtml).toContain('id="script-preference-select"');
    // The #252 control renders the frozen コース標準 option label.
    expect(builtHtml).toContain('コース標準');
  });

  it('server-renders all 50 entry cards in loader order', () => {
    const headwords = [
      ...builtHtml.matchAll(/data-script-path-default="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(headwords).toHaveLength(50);
    expect(headwords).toEqual(loadKanjiBridge().map((entry) => entry.traditional));
    // Cards appear strictly in source order.
    const cardStarts = [
      ...builtHtml.matchAll(/<li class="kanji-bridge-entry"/g),
    ].map((match) => match.index ?? 0);
    expect(cardStarts).toHaveLength(50);
    for (let i = 1; i < cardStarts.length; i += 1) {
      expect(cardStarts[i]).toBeGreaterThan(cardStarts[i - 1]);
    }
  });

  it('exposes the deterministic result count and the no-match state', () => {
    expect(builtHtml).toContain('>全50件</p>');
    expect(builtHtml).toContain('該当する単語がありません。');
  });

  it('renders the relation filter as a native labelled select with a native reset link', () => {
    expect(routeSource).toContain(
      '<select\n        id="kanji-bridge-relation-filter"',
    );
    expect(builtHtml).toMatch(/<select[^>]*id="kanji-bridge-relation-filter"/);
    expect(builtHtml).toContain('for="kanji-bridge-relation-filter"');
    for (const [value, label] of [
      ['all', 'すべて'],
      ['same-meaning', '同じ意味'],
      ['partial-overlap', '一部が重なる'],
      ['false-friend', '見せかけの同義語'],
    ] as const) {
      // Astro injects scope ids between the option attributes; assert value
      // and rendered label independently of attribute order.
      expect(builtHtml).toContain(`value="${value}"`);
      expect(builtHtml).toContain(`${label}</option>`);
    }
    expect(builtHtml).toContain('href="/vocabulary/kanji-bridge/"');
    expect(builtHtml).not.toContain('href="#"');
  });

  it('entry cards carry the exact lang attributes and truthful provenance', () => {
    // Chinese headword/example labelled Traditional, pinyin Latin, Japanese ja.
    expect(builtHtml).toContain('lang="zh-Hant"');
    expect(builtHtml).toContain('lang="zh-Latn"');
    expect(builtHtml).toContain('lang="ja"');
    // The provenance line is generated/draft: never claims reviewed/published.
    expect(builtHtml).toContain('AI生成・未検証（未レビュー）');
    expect(builtHtml).not.toContain('（レビュー済み）');
    expect(builtHtml).not.toContain('（公開済み）');
  });

  it('never presents a generated-only form as reviewed (fallback annotation present)', () => {
    // Every headword carries the exact #251 fallback annotation in the SSR
    // markup because every form is generated/unavailable.
    const annotationCount = builtHtml.split(
      'この表記は未収録のため、コース標準を表示しています。',
    ).length - 1;
    expect(annotationCount).toBe(50);
    // No card claims an authored/verified status anywhere in the markup.
    expect(builtHtml).not.toMatch(/data-script-(?:traditional|simplified|path-default)-status="(?:authored|verified)"/);
  });

  it('initializes the filter and script-preference clients on the route', () => {
    expect(routeSource).toContain('initKanjiBridgeFilter()');
    expect(routeSource).toContain('initKanjiBridgeScriptPreference()');
    expect(filterClientSource).toContain('location.search');
    expect(scriptClientSource).toContain('SCRIPT_PREFERENCE_EVENT');
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
