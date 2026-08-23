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

The capture defaults to `http://127.0.0.1:4321`. A task-owned server on another
port can be selected without changing the manifest:

```bash
DESIGN_LAB_BASE_URL=http://127.0.0.1:4328 node scripts/capture-design-lab.ts
```

The command overwrites only the 24 filenames listed below. It does not delete
or prune this directory, and it blocks requests outside the selected local
origin.

## Viewports and checks

- Individual captures: 390 x 844, viewport-only (`fullPage: false`).
- Comparison captures: 2000 x 934, viewport-only, with five complete 390 x 844
  iframe surfaces in one row.
- Every route waits for DOM content, fonts, and active-view images.
- Every capture verifies the selected view, broken active-view images, and
  horizontal overflow, and collects console and page errors.
- The 2026-08-24 run produced all 24 files with no browser, image, overflow, or
  external-request errors.

Task 4 follow-up: the Airbnb Home control labelled `レッスンを続ける` intersects
the bottom boundary of the 390 x 844 viewport. This evidence task records the
finding and does not modify the grammar component.

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
