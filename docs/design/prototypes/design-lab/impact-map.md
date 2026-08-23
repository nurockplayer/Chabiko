# Impact Map - Chabiko Design Lab Visual Prototypes

> Inventory basis: repository diff
> `709889127aaa64d24b68a3d649f30522203be045` through implementation candidate
> `8d0872a6655ede4c3801538ffa93e2f34221c4f4`. This document is the docs-only
> contract follow-up. A complete T3 integration run passed on candidate
> `9481a3b33e57c334b5d5c928f226ff5bd38ef0a4`; this validation-evidence update is
> followed by the same gate on its exact docs-only head before final review.

## Source of Truth and Scope

The user's 2026-08-24 request is the owning contract; no GitHub issue owns this
exploration. Repository rules and
`docs/engineering/cross-cutting-change-playbook.md` govern implementation and
evidence. Current structured content, loaders, schemas, and tests are the
implementation reality. `docs/design/prototypes/design-lab/README.md` freezes
the five exploratory grammars, while `docs/design/reference-family-389.md` is
read-only production context for the audit and isolation boundary.

In scope:

- Five isolated prototype routes plus one comparison route.
- One source-derived fixture, one root-owned transient interaction controller,
  one isolated layout, and five disjoint grammar components.
- Two prototype-only generated WebP assets and their portable provenance.
- A transactional browser-capture workflow, 24 committed screenshots,
  capture metadata, focused tests, and the classifier mapping for those tests.

Out of scope:

- Production routes, navigation, layouts, components, tokens, content schemas,
  loaders, learner progress, persistence, visual baselines, deployment
  configuration, and package metadata.
- Selecting a winning grammar or migrating any prototype into production.

This work is cross-cutting because it combines asset paths and generated output,
metadata/provenance, build and cleanup behavior, multiple runtime consumers,
and a large committed evidence set.

## Writers

| Surface | Writer and ownership |
| --- | --- |
| Canonical learner inputs | Existing content-authoring workflows own `data/examples/valid/lessons.json`, `data/examples/valid/vocabulary.json`, `data/travel-quest-readiness.json`, and `data/learning-paths.json`. This change only reads them and does not write or fork their content. |
| Prototype source | Manual repository edits own `src/content/designLabFixture.ts`, `src/layouts/DesignLabLayout.astro`, `src/client/designLabPrototype.ts`, the five `src/components/design-lab/*Prototype.astro` files, and the six `src/pages/design-lab/**/index.astro` routes. The fixture validates and projects canonical content; it does not serialize new content. |
| Transient learner state | `initDesignLabPrototype()` writes only DOM-local `hidden`, `aria-selected`, `tabIndex`, `aria-expanded`, `aria-pressed`, `disabled`, `data-lab-rating`, and quiz status text under the owning `[data-design-lab]` root. It has no LocalStorage, SessionStorage, cookie, network, or production-progress writer. |
| Generated photographs | OpenAI built-in image generation created two source PNG artifacts once; `cwebp` created the committed `public/assets/design-lab/*.webp` derivatives once. Source artifact IDs, source and derivative SHA-256 values, dimensions, prompts, rights basis, and consumer allowlists are frozen in `docs/design/prototypes/design-lab/assets.json`. |
| Build output | `pnpm build` lets Astro write disposable `dist/` output, including the six Design Lab routes and two public assets. No generated build output is committed by this contract. |
| Capture publication | `scripts/capture-design-lab.ts` owns exactly 24 manifest PNGs, `capture.json`, and only the generated marker block in the evidence README. It first writes a task-owned staging directory, validates the complete candidate, then swaps directories with rollback. Non-manifest files are copied forward byte-for-byte. |
| Capture self-test | `tests/design-lab-routes.test.ts` writes a test-owned OS temporary root, local HTTP fixture, candidate evidence, dirty-worktree sentinel, drifted metadata, and failure states. Its cleanup recursively removes only the explicit root it created. |
| Classifier self-tests | `tests/validation/classifier.test.ts` creates and removes its own temporary Git repositories when exercising the documented classification CLI. The shared mapping change is limited to `scripts/validation/classify.ts`. |
| Documentation | Humans own the design spec, plan, provenance record, and prose outside generated markers. The capture command alone owns the marked evidence-summary block. |

## Consumers and Validators

| Contract | Consumers / validators |
| --- | --- |
| Canonical content to fixture | `src/content/loadLessons.ts` reads Lesson 001; `src/content/designLabFixture.ts` reads and validates that lesson, vocabulary `voc-002`, four Travel Quest targets, and learning-path labels against existing TypeScript types. Malformed or missing required content fails closed. |
| Fixture to rendered routes | The Apple, Airbnb, Notion, Linear, and Duolingo route entries build one fixture each and pass it to the matching grammar component through `DesignLabLayout.astro`. All five components consume the complete same fixture rather than copying teaching content. |
| Interaction contract | All five components emit the shared `data-lab-*` contract. `src/client/designLabPrototype.ts` consumes only controls and panels owned by the closest prototype root. Native buttons, links, tabs, tabpanels, disclosures, and status regions remain the semantic surface. |
| Prototype assets | All five grammar components consume both `/assets/design-lab/*.webp` paths. `assets.json` lists the same five consumers for each asset, and the focused test checks the allowlist in both directions plus bytes, dimensions, and digests. |
| Comparison | `src/pages/design-lab/index.astro` consumes the five routes as labeled 390 x 844 iframes and applies one shared `view` query through its four-link toolbar. Unknown query values resolve to Home. |
| Capture and committed evidence | `scripts/capture-design-lab.ts` consumes the built loopback routes and comparison page. Reviewers and the prototype report consume the 20 individual PNGs, four comparison PNGs, `capture.json`, and `docs/design/evidence/design-lab/README.md`. |
| Focused validation | `tests/design-lab-routes.test.ts` validates fixture failure boundaries, layout isolation, root ownership, storage non-use, every route and surface, interaction semantics, asset provenance, grammar-specific review fixes, comparison behavior, canonical capture behavior, drift, rollback, and dirty-environment preservation. |
| Validation routing | `scripts/validation/classify.ts` maps the isolated fixture adapter to `tests/design-lab-routes.test.ts`; `tests/validation/classifier.test.ts` prevents that mapping from drifting. Learner-visible Astro and script changes still classify the complete candidate to T3. |
| Build and final gate | Astro lint/typecheck/build consume all source routes and assets. `pnpm validate` is the final T3 consumer and includes full Vitest, build, production visual regression, accessibility, and content validation. The candidate run is recorded below; the docs-only evidence head receives the same gate before review. |

## Legacy and Compatibility Paths

- There is no legacy Design Lab route, writer, asset path, migration, persisted
  state, storage key, route alias, or compatibility layer to preserve or prune.
- The prototypes use a dedicated layout and controller. They do not inherit or
  alter `BaseLayout.astro`, `Header.astro`, shared production tokens, learner
  loaders, production LocalStorage progress, or production navigation.
- Existing A1 Editorial Calm pages and `tests/visual/__screenshots__/` remain
  untouched. The Design Lab evidence directory is not a production visual
  baseline.
- Canonical content remains authoritative. Missing or malformed required data
  makes the fixture unavailable instead of triggering hard-coded fallback copy.
- The routes are exploratory and emit `noindex, nofollow`; this is an indexing
  boundary, not an authentication or deployment boundary.

## Canonical Workflows and Order

### Build and evidence capture

1. Run `pnpm build`.
2. Run `pnpm preview --host 127.0.0.1 --port 4321`.
3. Run `node scripts/capture-design-lab.ts`. A different task-owned loopback
   port may be supplied with `DESIGN_LAB_BASE_URL=http://127.0.0.1:<port>`.
4. The capture command validates interactions and rendered states, builds all
   owned output in staging, verifies stable PNG frames, dimensions, per-file
   digests, grayscale separation, canonical JSON, and README closure, then
   publishes by transactional directory swap.

The two generated photographs have no repository rebuild command. Image
generation plus `cwebp` was a one-time asset-writing step. The accepted state is
the committed WebP bytes plus the portable source/derivative records in
`assets.json`; regeneration would be a new provenance and review decision.

### Validation

1. Run `pnpm test tests/design-lab-routes.test.ts` for the directly coupled
   contract and canonical capture self-test.
2. Run `pnpm validate:classify`; the live candidate classifies to T3.
3. Run `pnpm validate` on the final exact head. Do not substitute a prior-head
   run or the focused suite for this final integration gate.
4. Run `rtk git --no-optional-locks diff --check` and verify the scoped path and
   package boundaries before review.

## Git, Build, Deployment, and Cleanup Boundaries

- Git scope is limited to Design Lab source/routes/assets/docs/evidence/tests
  plus the exact classifier mapping and its test. The base-to-candidate diff has
  no production page/component/data/type/style change.
- `package.json`, `pnpm-lock.yaml`, `.gitignore`, build configuration,
  deployment configuration, pruning behavior, and production snapshots are
  unchanged. No dependency was added.
- Astro emits the routes and public assets into disposable `dist/`, but the lab
  is absent from production navigation and cannot write production learner
  state. No deployment or public-state mutation is part of this task.
- Capture accepts loopback HTTP origins only and blocks off-origin requests.
  It never targets production routes or production visual-baseline paths.
- Publication owns only the fixed manifest, metadata, and marked README block.
  Existing non-manifest evidence files survive candidate construction and the
  directory swap. A failed validation never publishes a partial candidate.
- The capture command removes only the staging root it created. If rollback
  itself cannot complete, it retains explicit recovery files and reports their
  path instead of deleting ambiguous state.
- Tests remove only their own named OS temporary roots. They never assume the
  repository or evidence directory is otherwise clean.

## Rights, License, and Provenance

- Both photos are OpenAI-generated outputs authorized by the requester for
  prototype-only Design Lab use. No external teaching content or third-party
  asset was imported.
- `assets.json` records the requester-account context, OpenAI Terms of Use and
  Services Agreement rights bases, allowed scope, prompt summaries, artifact
  IDs, source PNG digests, committed WebP digests and dimensions, consumer
  allowlists, and human review.
- Human review found no readable text, visible logo, or identifiable specific
  person. The record explicitly states that rights allocation is not a
  non-infringement guarantee.
- No in-product attribution is displayed for the generated images; the
  repository provenance record is mandatory and is validated against the
  committed bytes and runtime references.

## Clean and Dirty Environment Behavior

| Case | Required behavior and failure boundary |
| --- | --- |
| Clean checkout / absent evidence output | Build succeeds, capture creates its owned parent/staging/output, and publishes only after all 24 PNGs plus metadata and README validate. |
| Missing or malformed canonical content | `buildDesignLabFixture()` throws; no invented learner content is rendered. |
| Invalid base URL or external request | HTTPS/non-loopback capture origins are rejected; off-origin browser requests are blocked and fail diagnostics. |
| Broken image, overflow, clipping, overlap, missing accessible name, or undersized practical control | Rendered validation fails before publication. |
| Dirty evidence directory with developer-owned files | Candidate construction copies non-manifest files byte-for-byte; the regression sentinel survives repeated capture. |
| Failure after original evidence backup or after candidate publication | Transaction rollback restores the previous directory byte-for-byte; a rollback failure retains named recovery files and fails loudly. |
| Stale PNG, dimension, ordered digest, `capture.json`, or generated README block | `validateCapturePublication()` fails closed. No mismatched evidence set is accepted. |
| Scrolled comparison iframe or toolbar state drift | Capture fails before publication, preserving the prior evidence set. |
| Nested prototype roots or repeated initialization | The controller scopes queries to the closest owning root and removes stale handlers; parent actions cannot mutate nested state. |
| Dirty repository outside capture/test ownership | Capture and regression cleanup do not delete or rewrite those files; package metadata, production UI, data, and baselines stay outside the managed set. |

## Requirement -> Diff -> Test Evidence

Focused and capture results below were observed on the implementation candidate.
The first complete T3 result is recorded below; the final handoff records the
required exact-head rerun after this docs-only evidence update.

| # | Frozen requirement | Changed file / artifact | Validation | Observed result |
| --- | --- | --- | --- | --- |
| 1 | Audit the repository, current UI, learner flows, and tokens before prototyping. | `docs/design/prototypes/design-lab/README.md` | Manual source and existing issue-398 evidence audit; base-to-candidate isolation scan. | Recorded A1 Editorial Calm's paper/serif/jade-coral/hairline grammar and the preserved Chinese-first continuation, vocabulary, lesson-loop, and Travel Quest flows. |
| 2 | Use the same Chabiko content and core UX in every grammar. | `src/content/designLabFixture.ts`; five grammar components | Focused fixture and complete-consumer contract tests. | 58/58 focused tests passed; all versions use Lesson 001, vocabulary `voc-002`, four readiness targets, path labels, reveal/rating, quiz, and continuation behavior from canonical inputs. |
| 3 | Provide five isolated routes with genuinely different design grammars. | Five `src/pages/design-lab/<grammar>/index.astro` routes; five `src/components/design-lab/*Prototype.astro` components | Route contract tests; Astro build; manual comparison review. | Apple focal stage, Airbnb image itinerary, Notion document flow, Linear precision rail, and Duolingo guided path remain structurally identifiable; build emitted 1,615 pages including all routes. |
| 4 | Cover Home, vocabulary, lesson/practice, and Taiwan travel on the same surface contract. | Five grammar components; `src/client/designLabPrototype.ts` | Per-grammar four-panel/tab contract tests; rendered capture sweep. | Four labeled tabpanels and one active view per grammar; 20 individual route/view states captured. |
| 5 | Remain distinct without color and avoid skin-only variation. | Five grammar components; `capture.json`; Home/Lesson comparison PNGs | Automated 8 x 8 grayscale signatures plus manual side-by-side inspection. | Closest Home distance `0.1021` and Lesson distance `0.1044`, both above the frozen `0.035` threshold. |
| 6 | Be mobile-first at 375-430px while remaining valid on narrow mobile and desktop. | Scoped responsive CSS in five grammar components | Canonical rendered sweep at 320, 375, 390, 430, 768, and 1440px. | 120/120 responsive states passed without horizontal overflow, broken active images, control clipping, center-point overlap, or ancestor clipping. |
| 7 | Provide clear affordance and polished hover, pressed, active, selected, focus, and reduced-motion behavior. | Five grammar components; `src/client/designLabPrototype.ts`; comparison route | Five browser interaction scenarios, 20 axe scans, 20 focus-visible checks, 20 reduced-motion checks; focused controller tests. | All checks passed; tabs support ArrowLeft/ArrowRight wrap and Home/End, practical mobile targets meet 44px, vocabulary and quiz feedback update visibly and semantically. |
| 8 | Keep production UI and learner state untouched. | `DesignLabLayout.astro`; Design Lab-only routes/controller/assets | Base-to-candidate scoped diff; storage API spies; noindex route contract. | No production page/component/token/data/progress/baseline or storage write changed; LocalStorage and SessionStorage reads/writes remained zero. |
| 9 | Freeze generated-asset rights and provenance. | `assets.json`; two committed WebPs | Focused provenance, byte digest, dimension, closed inventory, and bidirectional consumer tests. | Both 1536 x 1024 WebPs match recorded SHA-256 values and exactly five allowed runtime consumers; prototype-only rights decision is portable and qualified. |
| 10 | Prevent a mounted prototype from mutating nested prototype roots or retaining stale handlers. | `src/client/designLabPrototype.ts` | Nested-root, stale-cleanup, and repeated-initialization focused tests. | Parent navigation/reveal/rating/quiz actions leave nested state unchanged; only the current handler set remains active. |
| 11 | Make the comparison toolbar a complete interaction surface, not capture-only chrome. | `src/pages/design-lab/index.astro`; `scripts/capture-design-lab.ts` | Canonical toolbar validation and failure-drift self-test. | Four 44px links expose current, hover, active, and measurable focus states without pill geometry; five 390 x 844 iframes stay labeled, selected, contained, and unscrolled. |
| 12 | Publish evidence transactionally and preserve unrelated dirty-worktree files. | `scripts/capture-design-lab.ts`; capture self-test in `tests/design-lab-routes.test.ts` | Real subprocess capture, repeated-run byte comparison, dirty sentinel, late-swap failpoint, scroll drift, toolbar drift, and metadata drift tests. | Candidate validates before swap; repeated owned output is byte-identical; sentinel survives; injected failures restore the prior directory and never publish a partial set. |
| 13 | Refocus Duolingo Travel on visible readiness progression. | `DuolingoPrototype.astro`; `duolingo-travel.png`; `comparison-travel.png` | Source-order/state regression test; canonical browser capture; manual visual review. | Readiness appears before supporting imagery and distinguishes current/next state, keeping progression visible in the 390 x 844 evidence viewport. |
| 14 | Remove Linear's broken category wrapping and internal-tool chrome. | `LinearPrototype.astro`; four Linear and four comparison PNGs | Japanese-semantics and category-grid regression tests; responsive capture. | Learner-facing Japanese labels lead the interface; category metadata reserves 118px and does not arbitrarily split words. |
| 15 | Flatten Airbnb's nested travel evidence surfaces while retaining tactile itinerary structure. | `AirbnbPrototype.astro`; refreshed capture set | Flat-row CSS regression test; canonical browser capture; manual visual review. | One outer tactile target card remains; evidence uses transparent divider rows with no nested radius/card surface. |
| 16 | Close the 24-image evidence set over dimensions, bytes, and metadata. | 20 individual PNGs; four comparison PNGs; `capture.json`; evidence README generated block | Canonical capture plus `validateCapturePublication()`. | 20 files are exactly 390 x 844, four are exactly 2000 x 934, every SHA/dimension matches metadata, and the ordered manifest digest is `9ff613552937f607cec81e8ec6b0bfd1de51ed0ec404b65dbefea4c5fb99f08e`. |
| 17 | Add no dependency or package-manager change. | No `package.json` or `pnpm-lock.yaml` diff | Base-to-candidate path scan; build with repository-installed dependencies. | No dependency, lockfile, package-manager, lifecycle, or external runtime asset change. |
| 18 | Pass the classifier-required validation on the final exact head. | Entire scoped candidate | `pnpm validate:classify`, then final exact-head `pnpm validate`. | Candidate `9481a3b33e57c334b5d5c928f226ff5bd38ef0a4` classified T3 and passed lint, typecheck, full Vitest, a 1,615-page build, 109/109 visual gates, 40/40 accessibility gates, and content validation. Because recording that observation changes the docs-only head, the same gate is rerun on the resulting exact head before review and reported in the final handoff. |
