/**
 * Lesson → phrasebook related link (Issue #239).
 *
 * The lesson route reads each lesson's `travelScenario` and renders exactly one
 * 「関連フレーズを見る」 link to `/phrasebook/?scenario={scenario}` ONLY when
 * that scenario has production-eligible phrasebook content (record-level
 * `reviewed`/`published` review status AND authored/verified script forms) —
 * the exact same determination as the `/phrasebook/` route. Missing, unknown,
 * or unavailable (draft-only) scenarios render no link and no placeholder.
 *
 * Verified current corpus facts (Issue #236): airport (5/5) and food (1/5) are
 * production-eligible; transport/shopping/hotel/emergency are all `draft` →
 * not production-eligible. A lesson with `travelScenario: transport` must
 * render NO link today.
 *
 * Direct-navigation assertion: the linked destination `/phrasebook/?scenario=X`
 * is recognized by the URL-based scenario filter (`readScenarioFromSearch`), and
 * the full init-level "direct refresh re-applies the filter from
 * `location.search`" behavior is covered by `tests/phrasebook-filter.test.ts`.
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
import { readScenarioFromSearch } from '../src/client/phrasebookScenarioFilter';
import {
  lessonPhrasebookDestination,
  loadProductionPhrasebookScenarios,
} from '../src/content/lessonPhrasebook';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import { PHRASEBOOK_SCENARIOS } from '../src/content/loadPhrasebook';

const REPO_ROOT = resolve(__dirname, '..');
const ROUTE_SOURCE = resolve(REPO_ROOT, 'src/pages/lessons/[id].astro');
const PHRASEBOOK_DATA = resolve(REPO_ROOT, 'data/examples/valid/phrasebook.json');
const DIALOG_DATA = resolve(
  REPO_ROOT,
  'data/examples/valid/phrasebook-dialogs.json',
);

// Unique per-run build + fixture directories, outside the repo and never shared.
const BUILD_DIR = mkdtempSync(join(tmpdir(), 'chabiko-lesson-phrasebook-link-'));
const FIXTURE_DIR = mkdtempSync(
  join(tmpdir(), 'chabiko-lesson-phrasebook-fixtures-'),
);

const routeSource = readFileSync(ROUTE_SOURCE, 'utf8');
const LINK_TEXT = '関連フレーズを見る';
const LINK_MARKER = 'data-phrasebook-link';

/** Built lesson HTML per lesson id, read after the fresh build. */
const builtLessonHtml = new Map<string, string>();

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

// ─── Production-eligibility determination ──────────────────────────────────────

describe('loadProductionPhrasebookScenarios — production-eligibility determination', () => {
  it('matches the verified corpus facts: only airport and food are eligible', () => {
    const scenarios = loadProductionPhrasebookScenarios();
    expect([...scenarios].sort()).toEqual(['airport', 'food']);
    for (const scenario of PHRASEBOOK_SCENARIOS) {
      expect(scenarios.has(scenario)).toBe(
        scenario === 'airport' || scenario === 'food',
      );
    }
  });

  it('never treats a draft-only scenario as eligible', () => {
    const scenarios = loadProductionPhrasebookScenarios();
    for (const scenario of ['transport', 'shopping', 'hotel', 'emergency']) {
      expect(scenarios.has(scenario)).toBe(false);
    }
  });

  it('includes a scenario whose only eligible content is a reviewed dialog', () => {
    const dialogs = cloneDocument(baseDialogDocument());
    // transport has no eligible phrases; promoting its dialog to reviewed makes
    // transport eligible through the dialog-only branch of the group filter.
    for (const dialog of dialogs.phrasebookDialogs) {
      if (dialog.id === 'dialog-transport-001') dialog.reviewStatus = 'reviewed';
    }
    const scenarios = loadProductionPhrasebookScenarios(
      writeTemp('phrasebook', basePhrasebookDocument()),
      writeTemp('phrasebookDialogs', dialogs),
    );
    expect(scenarios.has('transport')).toBe(true);
    expect(scenarios.has('airport')).toBe(true);
    expect(scenarios.has('food')).toBe(true);
  });

  it('excludes a scenario when its reviewed dialog form is generated only', () => {
    const dialogs = cloneDocument(baseDialogDocument());
    const transportDialog = dialogs.phrasebookDialogs.find(
      (dialog) => dialog.id === 'dialog-transport-001',
    ) as { reviewStatus: string; turns: { traditionalStatus: string }[] };
    transportDialog.reviewStatus = 'reviewed';
    transportDialog.turns[0].traditionalStatus = 'generated';
    const scenarios = loadProductionPhrasebookScenarios(
      writeTemp('phrasebook', basePhrasebookDocument()),
      writeTemp('phrasebookDialogs', dialogs),
    );
    expect(scenarios.has('transport')).toBe(false);
  });

  it('is deterministic across calls', () => {
    expect(loadProductionPhrasebookScenarios()).toEqual(
      loadProductionPhrasebookScenarios(),
    );
  });
});

// ─── Per-lesson destination predicate (controlled + missing/unknown matrix) ────

describe('lessonPhrasebookDestination — controlled scenario + missing/unknown matrix', () => {
  const eligible = new Set<string>(['airport', 'food']);

  it('returns the scenario for every production-eligible controlled scenario', () => {
    expect(lessonPhrasebookDestination('airport', eligible)).toBe('airport');
    expect(lessonPhrasebookDestination('food', eligible)).toBe('food');
  });

  it('returns null for controlled scenarios with only draft/pending content', () => {
    for (const scenario of ['transport', 'shopping', 'hotel', 'emergency']) {
      expect(lessonPhrasebookDestination(scenario, eligible)).toBeNull();
    }
  });

  it('returns null for a missing travelScenario', () => {
    expect(lessonPhrasebookDestination(undefined, eligible)).toBeNull();
  });

  it('returns null for unknown or empty travelScenario values', () => {
    expect(lessonPhrasebookDestination('garbage', eligible)).toBeNull();
    expect(lessonPhrasebookDestination('', eligible)).toBeNull();
    expect(lessonPhrasebookDestination('travel', eligible)).toBeNull();
  });

  it('returns null for a controlled scenario that is not production-eligible', () => {
    expect(lessonPhrasebookDestination('food', new Set(['airport']))).toBeNull();
  });

  it('never returns a scenario outside the frozen controlled set', () => {
    const result = lessonPhrasebookDestination('food', eligible);
    expect(PHRASEBOOK_SCENARIOS).toContain(result);
  });
});

// ─── Route source contract ─────────────────────────────────────────────────────

describe('lesson route source — related-link contract', () => {
  it('computes the eligible scenario set at build time from the loader surface', () => {
    expect(routeSource).toContain('loadProductionPhrasebookScenarios()');
    expect(routeSource).toContain('lessonPhrasebookDestination(');
    expect(routeSource).toContain(
      "import { loadAllRenderableLessons } from '../../content/loadLessons'",
    );
  });

  it('renders exactly one related link with the frozen text and derived destination', () => {
    expect(routeSource.match(new RegExp(LINK_TEXT, 'g'))).toHaveLength(1);
    expect(routeSource.match(new RegExp(LINK_MARKER, 'g'))).toHaveLength(1);
    expect(routeSource).toContain(
      'href={`/phrasebook/?scenario=${phrasebookScenario}`}',
    );
    // No placeholder/fallback renders for a missing or unavailable scenario.
    expect(routeSource).not.toMatch(
      /関連フレーズ[^<]*(準備中|利用できません|近日公開)/,
    );
  });

  it('reads no phrasebook data file directly and never hardcodes a scenario', () => {
    expect(routeSource).not.toMatch(
      /readFileSync|data\/examples\/valid\/phrasebook/,
    );
    expect(routeSource).not.toContain('href="/phrasebook/?scenario=airport"');
    expect(routeSource).not.toContain(
      'href={`/phrasebook/?scenario=${"airport"}`}',
    );
  });
});

// ─── Built route surface (fresh build, exact links) ────────────────────────────

describe('/lessons/:id/ — built related-link surface (Issue #239)', () => {
  beforeAll(() => {
    execSync(`pnpm astro build --outDir ${BUILD_DIR}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 180_000,
    });
    for (const lesson of loadAllRenderableLessons()) {
      const html = readFileSync(
        join(BUILD_DIR, `lessons/${lesson.id}/index.html`),
        'utf8',
      );
      builtLessonHtml.set(lesson.id, html);
    }
  });

  afterAll(() => {
    // Clean only the directories this suite created.
    for (const dir of [BUILD_DIR, FIXTURE_DIR]) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });

  const productionScenarios = loadProductionPhrasebookScenarios();

  it('renders exactly one link matching the loader-based determination for every lesson', () => {
    for (const lesson of loadAllRenderableLessons()) {
      const html = builtLessonHtml.get(lesson.id) ?? '';
      const expected = lessonPhrasebookDestination(
        lesson.travelScenario,
        productionScenarios,
      );
      const links = html.match(new RegExp(LINK_MARKER, 'g')) ?? [];
      expect(links, `${lesson.id} link count`).toHaveLength(
        expected === null ? 0 : 1,
      );
      if (expected !== null) {
        expect(html).toContain(`href="/phrasebook/?scenario=${expected}"`);
        expect(html).toContain(LINK_TEXT);
      } else {
        expect(html).not.toContain(LINK_TEXT);
      }
    }
  });

  it('verified current facts: food lessons link to food; draft-only scenario lessons do not link', () => {
    // food (1/5 eligible) → every food lesson gets exactly one link.
    for (const id of ['lesson-001', 'lesson-002', 'lesson-005', 'lesson-006']) {
      const html = builtLessonHtml.get(id) ?? '';
      expect(html.match(new RegExp(LINK_MARKER, 'g'))).toHaveLength(1);
      expect(html).toContain('href="/phrasebook/?scenario=food"');
      expect(html).toMatch(new RegExp(`${LINK_MARKER}[\\s\\S]*?${LINK_TEXT}`));
    }
    // transport/shopping/hotel/emergency are all draft-only → no link today.
    for (const id of [
      'lesson-003',
      'lesson-004',
      'lesson-007',
      'lesson-008',
      'lesson-009',
      'lesson-010',
    ]) {
      const html = builtLessonHtml.get(id) ?? '';
      expect(html.match(new RegExp(LINK_MARKER, 'g')) ?? []).toHaveLength(0);
      expect(html).not.toContain(LINK_TEXT);
    }
  });

  it('renders no duplicate or broken link and every destination is filter-recognized', () => {
    const phrasebookHtml = readFileSync(
      join(BUILD_DIR, 'phrasebook/index.html'),
      'utf8',
    );
    // The destination route exists and renders the URL-based scenario filter.
    expect(existsSync(join(BUILD_DIR, 'phrasebook/index.html'))).toBe(true);
    expect(phrasebookHtml).toContain('data-scenario-filter');
    expect(phrasebookHtml).toContain('data-phrasebook-list');

    for (const lesson of loadAllRenderableLessons()) {
      const html = builtLessonHtml.get(lesson.id) ?? '';
      const hrefs = [
        ...html.matchAll(
          new RegExp(`${LINK_MARKER}[^>]*href="([^"]+)"`, 'g'),
        ),
      ].map((match) => match[1]);
      expect(hrefs.length, `${lesson.id} link count`).toBeLessThanOrEqual(1);
      for (const href of hrefs) {
        // The destination is recognized by the URL-based filter (direct
        // navigation applies the scenario); the init-level application of that
        // filter on direct refresh is asserted in tests/phrasebook-filter.test.ts.
        const scenario = readScenarioFromSearch(
          new URL(href, 'http://chabiko.local').search,
        );
        expect(productionScenarios.has(scenario)).toBe(true);
      }
    }
  });

  it('preserves practice, travel task, and lesson navigation', () => {
    for (const lesson of loadAllRenderableLessons()) {
      const html = builtLessonHtml.get(lesson.id) ?? '';
      expect(html).toContain('class="lesson-practice"');
      expect(html).toContain('class="travel-task"');
      expect(html).toContain('class="lesson-nav"');
      expect(html).toContain(`/lessons/${lesson.id}/`);
    }
  });
});
