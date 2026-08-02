# Deterministic visual regression harness

Issue #70 uses Playwright Test `1.61.1` with its Chromium
`149.0.7827.55`. Both local runs and CI execute inside the official Playwright
`v1.61.1-noble` image pinned by immutable digest in
`tests/visual/run.ts`. The page is the production `astro build` served by
`astro preview`; the harness does not capture the development server.

## Commands

Verify the committed baselines without writing them:

```bash
pnpm test:visual
```

Intentionally recreate the managed baselines after reviewing an expected UI
change:

```bash
pnpm test:visual:update
```

The update command is never used by CI. It only writes snapshot names produced
by the explicit matrix under `tests/visual/__screenshots__/`; it does not prune
or clean other repository files. Review every changed PNG before committing.

Both commands require Docker. The first run downloads the digest-pinned image
and installs the frozen pnpm lockfile into an isolated container volume.

## Matrix

The committed matrix contains exactly 60 viewport screenshots:

- themes: light and dark;
- viewports: `320×800`, `375×812`, `390×844`, `768×1024`, and
  `1440×900`;
- states: home, lesson reading, unanswered practice, correct feedback,
  incorrect feedback, and completion.

Names use the fixed pattern
`<theme>-<state>-<width>x<height>.png`. The Vitest harness contract fails when
a case, unique name, or committed PNG is missing or stale.

## Determinism controls

- immutable official Playwright image and exact Playwright/Chromium versions;
- one Chromium worker, headless mode, CSS-pixel scale, device scale factor 1,
  sRGB, LCD text disabled, and font hinting disabled;
- OFL-1.1 `Noto Sans JP Variable` `5.3.0` loaded locally from the frozen pnpm
  dependency and forced only by the test helper;
- browser locale `ja-JP`, timezone `Asia/Tokyo`, reduced motion, and a fixed
  clock;
- one isolated browser context per case with explicit light/dark storage-state
  fixtures and assertions over the complete localStorage contents;
- explicit production routes, state assertions, semantic scroll anchors,
  viewport dimensions, theme state, font readiness, and horizontal-overflow
  checks before every capture;
- external requests are blocked and reported; service workers are disabled;
- exact pixel comparison (`threshold: 0`, `maxDiffPixels: 0`), no retries,
  masks, arbitrary sleeps, or automatic snapshot creation;
- animations and carets are disabled only by Playwright screenshot settings.

Practice transitions use Playwright's clock. Correct and incorrect feedback are
captured while their exact product timers are paused; completion advances the
clock by the production `1200 ms` transition rather than sleeping.

## Impact map

- Writers: only `pnpm test:visual:update` writes the 60 managed PNGs.
- Consumers: the visual spec, Playwright config, storage fixtures, CI, and the
  Vitest harness contract.
- Legacy: `docs/design/evidence/issue-162/` remains untouched historical manual
  evidence and is not a baseline source.
- Canonical workflow: digest-pinned container → frozen install → production
  build/preview → exact Playwright matrix.
- Boundaries: verification does not write baselines; updater does not delete
  stale or unrelated developer files; browser contexts isolate state.
- Rights/provenance: Playwright is Apache-2.0 and the fixed test font is
  OFL-1.1; no external learner content or production asset is imported.
- Clean/dirty behavior: the harness only writes ignored reports/results during
  verification and the allowlisted snapshot directory during explicit update.
  It performs no repository cleanup.

## Controlled mutation proof

The harness was exercised with a temporary test-only `12 px` magenta inset on
`#basic-vocabulary-entry`, restricted to the light `320×800` home case. Running
`pnpm test:visual` in verification mode failed only
`light-home-320x800.png`: Playwright reported 17,928 different pixels (ratio
`0.08`), while the other 59 snapshots passed. The mutation was removed without
running the update command, and the next verification run passed all 60 cases.
