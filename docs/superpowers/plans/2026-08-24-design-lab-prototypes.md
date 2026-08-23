# Design Lab Prototypes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build five isolated, high-fidelity Chabiko prototype routes that render identical learner content through structurally different design grammars.

**Architecture:** A dedicated `DesignLabLayout` owns the noindex HTML shell and containment reset. A build-time fixture adapter selects existing structured Chabiko data. Five grammar components own disjoint markup and scoped CSS, while one small client controller provides the shared view, reveal, rating, and quiz state contract. A comparison route embeds all five routes at the same view and a bounded Playwright script captures evidence.

**Tech Stack:** Astro 7, TypeScript, native CSS, native DOM APIs, Vitest, Playwright, existing pnpm toolchain. No new dependencies.

**Spec:** `docs/design/prototypes/design-lab/README.md`

## Global Constraints

- Do not modify production UI, production routes, `BaseLayout.astro`, `Header.astro`, shared production tokens, loaders, progress logic, or existing visual snapshots.
- Use only existing structured Chabiko content through the fixture adapter.
- Routes are `/design-lab/apple/`, `/design-lab/airbnb/`, `/design-lab/notion/`, `/design-lab/linear/`, and `/design-lab/duolingo/`.
- Every route supports `view=home|vocabulary|lesson|travel`; an invalid value falls back to `home`.
- Every interactive target is practical at 44px, keyboard reachable, visibly focused, and has hover, active, and selected feedback.
- Mobile-first at 390px; verify 320, 375, 390, 430, 768, and 1440 widths without horizontal overflow.
- Use the two local prototype-only generated images. No external network assets, teaching content, or new dependency.
- Visible prototype copy contains no em-dash characters.

---

### Task 1: Freeze route, content, and interaction contracts

**Files:**
- Create: `tests/design-lab-routes.test.ts`
- Create: `src/content/designLabFixture.ts`
- Create: `src/layouts/DesignLabLayout.astro`
- Create: `src/client/designLabPrototype.ts`

**Interfaces:**
- Produces: `buildDesignLabFixture(): DesignLabFixture`.
- Produces: DOM contract `[data-design-lab]`, `[data-lab-view]`, `[data-lab-nav]`, `[data-lab-reveal]`, `[data-lab-answer]`, `[data-lab-rating]`, and `[data-lab-quiz-choice]`.
- Consumes: `loadLessonById('lesson-001')`, `data/examples/valid/vocabulary.json`, `data/travel-quest-readiness.json`, and `data/learning-paths.json`.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from 'vitest';
import { buildDesignLabFixture } from '../src/content/designLabFixture';

describe('design lab fixture', () => {
  test('derives the shared learner content from canonical structured sources', () => {
    const fixture = buildDesignLabFixture();
    expect(fixture.lesson.id).toBe('lesson-001');
    expect(fixture.lesson.coreSentence).toBe('我要這個');
    expect(fixture.vocabulary.id).toBe('voc-002');
    expect(fixture.travelTargets).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test tests/design-lab-routes.test.ts`

Expected: fail because `src/content/designLabFixture.ts` does not exist.

- [ ] **Step 3: Implement the fixture, isolated layout, and controller**

The fixture returns literal source-derived objects and throws when Lesson 001
or `voc-002` is unavailable. The controller validates the query value, applies
one active view, updates `aria-selected` and `hidden`, reveals the vocabulary
answer, records one local prototype rating, and renders quiz feedback with
`role="status"`. It does not read or write production storage.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test tests/design-lab-routes.test.ts`

Expected: pass.

### Task 2: Implement the five disjoint grammar surfaces

**Files:**
- Create: `src/components/design-lab/ApplePrototype.astro`
- Create: `src/components/design-lab/AirbnbPrototype.astro`
- Create: `src/components/design-lab/NotionPrototype.astro`
- Create: `src/components/design-lab/LinearPrototype.astro`
- Create: `src/components/design-lab/DuolingoPrototype.astro`
- Create: `src/pages/design-lab/apple/index.astro`
- Create: `src/pages/design-lab/airbnb/index.astro`
- Create: `src/pages/design-lab/notion/index.astro`
- Create: `src/pages/design-lab/linear/index.astro`
- Create: `src/pages/design-lab/duolingo/index.astro`

**Interfaces:**
- Consumes: `DesignLabFixture` from Task 1.
- Produces: the shared DOM interaction contract with unique structural markup
  and scoped styles per grammar.

- [ ] **Step 1: Extend the failing route contract**

```ts
const grammars = ['apple', 'airbnb', 'notion', 'linear', 'duolingo'] as const;
for (const grammar of grammars) {
  test(`${grammar} route exposes all four shared learner views`, () => {
    const source = readFileSync(`src/components/design-lab/${title(grammar)}Prototype.astro`, 'utf8');
    for (const view of ['home', 'vocabulary', 'lesson', 'travel']) {
      expect(source).toContain(`data-lab-view="${view}"`);
    }
  });
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test tests/design-lab-routes.test.ts`

Expected: fail because the five components and routes do not exist.

- [ ] **Step 3: Implement each grammar from the design spec**

Each component renders the same fixture fields and asset paths. Structural
signatures are mandatory: Apple focal stage, Airbnb photo itinerary, Notion
document flow, Linear command rail, Duolingo guided path. Keep per-component
CSS scoped and define explicit narrow-mobile and desktop adaptations.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test tests/design-lab-routes.test.ts`

Expected: pass.

### Task 3: Add live comparison and bounded evidence capture

**Files:**
- Create: `src/pages/design-lab/index.astro`
- Create: `scripts/capture-design-lab.ts`
- Create: `docs/design/evidence/design-lab/README.md`
- Generate: `docs/design/evidence/design-lab/*.png`

**Interfaces:**
- Consumes: the five routes and `view` query contract.
- Produces: 20 individual 390x844 captures and four side-by-side comparison
  captures for home, vocabulary, lesson, and travel.

- [ ] **Step 1: Add a failing comparison-route assertion**

```ts
test('comparison route embeds every grammar with the selected shared view', () => {
  const source = readFileSync('src/pages/design-lab/index.astro', 'utf8');
  for (const grammar of grammars) expect(source).toContain(`/design-lab/${grammar}/`);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test tests/design-lab-routes.test.ts`

Expected: fail because the comparison route does not exist.

- [ ] **Step 3: Implement comparison and capture tooling**

The comparison route uses labeled iframes with a fixed 390x844 internal
viewport and no prototype card styling. The capture script starts from an
already running local Astro server, writes only under its evidence directory,
and never updates production visual baselines.

- [ ] **Step 4: Run focused tests, build, and captures**

Run: `pnpm test tests/design-lab-routes.test.ts && pnpm build`

Then run the local server and `pnpm exec playwright test` only through the
repository-installed package or invoke `node scripts/capture-design-lab.ts`
with the existing Playwright dependency. Expected: all captures exist and no
route logs browser errors.

### Task 4: Validate interaction, accessibility, responsiveness, and anti-skin difference

**Files:**
- Modify: `tests/design-lab-routes.test.ts`
- Modify only as needed: design-lab files from Tasks 1-3

**Interfaces:**
- Consumes: rendered routes and evidence.
- Produces: final validation evidence and a structural-difference audit.

- [ ] **Step 1: Add browser assertions for the shared state contract**

Assert each route selects the requested view, navigates all four tabs by
keyboard, reveals the vocabulary answer, exposes rating feedback, renders
correct and incorrect quiz feedback, contains every visible control inside the
viewport, and has no horizontal overflow at required widths.

- [ ] **Step 2: Verify a deliberately missing state assertion fails**

Run the focused browser check before the last state implementation and confirm
the expected missing-state failure. Implement the smallest correction, then
rerun to green.

- [ ] **Step 3: Run repository validation**

Run: `pnpm validate:classify`, then the classifier-required `pnpm validate`
and `rtk git --no-optional-locks diff --check`.

- [ ] **Step 4: Inspect grayscale structure and refine similarities**

Compare all five home captures and all five lesson captures with color removed.
Apple must remain focal and airy, Airbnb image-led, Notion document-like,
Linear rail-and-stage, and Duolingo path-driven. Rework any pair that cannot be
identified from layout, density, geometry, and type alone.

