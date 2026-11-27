---
area: tests-ci
owner: chabiko
updated: 2026-11-27 JST
---
# Tests and CI

- `tests/*.test.ts` and `tests/python/` cover UI behavior, domain rules, data contracts and pipelines; `vitest.config.ts` configures the root Vitest suite.
- `tests/visual/` and `tests/a11y/` hold browser validation runners; configs are `playwright.visual.config.ts` and `playwright.a11y.config.ts`.
- `scripts/validation/classify.ts` and `run.ts` select validation tiers from changed paths. `pnpm validate` is the local entry point.
- `.github/workflows/ci.yml` runs classify, lint, typecheck, selected Vitest, build and content validation; visual and accessibility jobs run when classified changes require them.
- CI uses pnpm 12.11.2 and installs from `pnpm-lock.yaml` with frozen lockfile.

Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm validate`, `pnpm test:a11y`, `pnpm test:visual`.
