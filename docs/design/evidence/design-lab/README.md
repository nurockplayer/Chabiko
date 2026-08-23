# Design Lab Capture Evidence

Captured on 2026-08-24 from the built local Design Lab routes. These images
compare the same structured Chabiko fixture across five design grammars; they
are prototype evidence, not production visual-regression baselines.

## Rebuild command

Use Node 24 and the repository-installed Playwright dependency. Build first,
then start a local server in one terminal and run the capture in another:

```bash
pnpm build
pnpm preview --host 127.0.0.1 --port 4321
node scripts/capture-design-lab.ts
```

The capture defaults to `http://127.0.0.1:4321`. A task-owned loopback HTTP
server on another port can be selected without changing the manifest. External
and HTTPS origins are rejected:

```bash
DESIGN_LAB_BASE_URL=http://127.0.0.1:4328 node scripts/capture-design-lab.ts
```

The command first validates the rendered routes, then builds all owned evidence
in a task-owned staging directory. It publishes the candidate only after every
PNG, `capture.json`, and the generated README block agree. Publication uses a
directory swap with rollback; non-manifest files already in this directory are
copied byte-for-byte into the candidate. Chromium uses fixed locale, timezone,
color scheme, scale, reduced-motion, and font-rasterization settings. Animations,
transitions, and carets are disabled only for capture; hover, active, and focus
production styles remain available. Each file is staged only after two
consecutive screenshots of its rendered frame are byte-identical.

## Viewports and checks

- Individual captures: 390 x 844, viewport-only (`fullPage: false`).
- Comparison captures: 2000 x 934, viewport-only, with five complete 390 x 844
  iframe surfaces in one row.
- The responsive sweep covers widths 320, 375, 390, 430, 768, and 1440 at an
  844-pixel viewport height: five grammars by four views, or 120 states.
- Each state verifies exactly one selected tab and visible panel, horizontal
  overflow, CSS ancestor clipping and center-point overlap, active image
  integrity, accessible names, and practical mobile targets. Pure inline text
  links without the primary continuation contract are excluded from the
  44-pixel target rule.
- The 20 individual 390 x 844 evidence surfaces and the same 20 surfaces in
  comparison iframes additionally require every intersecting control to be
  fully inside the evidence viewport. Natural vertical continuation at other
  sweep widths is not classified as clipping.
- At 390 pixels, all 20 states run axe with zero serious or critical findings,
  verify measurable keyboard `:focus-visible` evidence, and confirm reduced
  motion leaves no running animations.
- Five real interaction scenarios verify initial and invalid queries, APG-style
  tab roving with ArrowLeft/ArrowRight wrap and Home/End, vocabulary reveal and
  rating, and incorrect/correct lesson status feedback.
- Every route waits for DOM content, fonts, and active-view images. Console and
  page errors fail the command, as do requests outside the selected origin.

## Generated capture results

The capture command rewrites this complete block from `capture.json`; the file
contains no capture timestamp so byte-identical repeated runs stay deterministic.

<!-- design-lab-capture:generated:start -->
<!-- Generated from capture.json by scripts/capture-design-lab.ts. Do not edit this block. -->

- Manifest entries: 24
- Manifest digest: `7f246fc1d850f2bfa177140918f5952aae90c42b0de9470f4a0e901806188da7`
- Rendered validation: 5 interaction scenarios, 120 responsive states, 20 axe scans, 20 focus-visible checks, and 20 reduced-motion checks
- Closest grayscale distance, Home: `0.1021` (notion/duolingo)
- Closest grayscale distance, Lesson: `0.1044` (notion/duolingo)

| Grammar | Home signature | Lesson signature |
| --- | --- | --- |
| Apple | `eeeeeeeeeeeeeeeee3e9ee2eeeeeeeeeeeeeeeee972333962253d28322dddddd` | `eeeeeeeeeeeeeeeeeeeeeeee98beeeee35ddaebeeeeeeeeeeeeeeeeedddd22dd` |
| Airbnb | `ffffffff2121222122542377e8edb8ee292f22ffeb9bdeeeffffffff55555555` | `ffffffff322113225664426a1157244322ffffffeeeeeeeeeeeeeeeeffffffff` |
| Notion | `ddddddddeeeedeaefffffffffffffffffffffffffffffffffff8efffffffffff` | `ddddddddeeeedeaeffffffffffffffffffffffffffffffffffffffff2f226fff` |
| Linear | `22222222111111111eeeee111111111111111111151111111111111111111111` | `2222222211111111e11b11111111111111111111111111111111111141111111` |
| Duolingo | `fffffffff2229f2ffffffffffffffffffd98effff8ffffffffffffffffffffff` | `ffffffffffffafffffffffffdeeeeeeefffffffffebfd99fffffffffffffffff` |
<!-- design-lab-capture:generated:end -->

The grayscale guard uses 8 x 8 luminance signatures for Home and Lesson.
Pairwise mean absolute luminance distance must be at least `0.035`. It detects
accidental structural convergence but does not replace manual inspection of the
individual and comparison captures.

## Fixed manifest

| View | Individual captures | Comparison |
| --- | --- | --- |
| Home | `apple-home.png`, `airbnb-home.png`, `notion-home.png`, `linear-home.png`, `duolingo-home.png` | `comparison-home.png` |
| Vocabulary | `apple-vocabulary.png`, `airbnb-vocabulary.png`, `notion-vocabulary.png`, `linear-vocabulary.png`, `duolingo-vocabulary.png` | `comparison-vocabulary.png` |
| Lesson | `apple-lesson.png`, `airbnb-lesson.png`, `notion-lesson.png`, `linear-lesson.png`, `duolingo-lesson.png` | `comparison-lesson.png` |
| Travel | `apple-travel.png`, `airbnb-travel.png`, `notion-travel.png`, `linear-travel.png`, `duolingo-travel.png` | `comparison-travel.png` |

## Isolation boundary

The capture reads only `/design-lab/` and its five prototype routes. It does
not change production routes, components, layouts, tokens, storage, progress
logic, package metadata, or `tests/visual/__screenshots__/`.
