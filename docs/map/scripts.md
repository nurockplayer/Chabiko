---
area: scripts
owner: chabiko
updated: 2026-11-27 JST
---
# Scripts and pipelines

- `scripts/validation/` classifies changes and runs the selected validation tier (`pnpm validate`, `validate:affected`, `validate:integration`, `validate:full`).
- `scripts/audio/generate.ts` creates pronunciation assets; `compare-voices.ts` runs voice comparison (`pnpm audio:generate`, `pnpm audio:compare`).
- `scripts/review/` imports and exports HSK review workbooks.
- Root `scripts/` includes HSK imports, teacher vocabulary/phrase projection, preview/manifest construction, Unicode review and content validators.
- `scripts/map/generate-symbols.mjs` refreshes the symbol index with `pnpm map:symbols`.
- `src/scripts/` contains browser-side scripts used by rendered pages, not command-line pipeline entry points.

Inspect each script's adjacent input/output names before running it; many build or publish content artifacts.
