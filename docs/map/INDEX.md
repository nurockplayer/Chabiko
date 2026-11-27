---
area: index
owner: chabiko
updated: 2026-11-27 JST
---
# Chabiko project map

Read this page first, then the note for the area you are changing. Follow its entry points instead of scanning the repository.

`symbols.tsv` lists exported TypeScript functions, classes, types, constants, Astro components, and package scripts as `symbol<TAB>kind<TAB>path:line`. Find a symbol with `grep '^name<TAB>' docs/map/symbols.tsv`; refresh it with `pnpm map:symbols`.

Structural PRs update this index, the relevant area note, and `symbols.tsv` in the same change.

## Areas

| Area | Owns | Entry points and commands | Note |
|---|---|---|---|
| App | Astro routes, shared UI, client/domain logic | `src/pages/`, `src/components/`, `src/client/`, `src/domain/`; `pnpm dev`, `pnpm build` | [app.md](app.md) |
| Content | Structured learner content and loading/validation | `data/`, `src/content/`; `pnpm validate:content` | [content.md](content.md) |
| Backend | Teacher review Pages Functions, D1 and learner sync Supabase | `functions/`, `supabase/`; `pnpm typecheck:functions` | [backend.md](backend.md) |
| Scripts | Content, teacher tooling, Unicode workflows, audio, validation | `scripts/`, `src/scripts/`; `pnpm audio:generate`, `pnpm audio:compare`, `pnpm validate` | [scripts.md](scripts.md) |
| Tests and CI | Unit, integration, browser checks and CI validation tiers | `tests/`, `.github/workflows/ci.yml`; `pnpm test`, `pnpm validate` | [tests-ci.md](tests-ci.md) |
| Static assets | Shared fonts, audio and learner illustrations | `public/`, `src/assets/` where present | [assets.md](assets.md) |

## Common commands

- `pnpm typecheck` — Astro and Functions TypeScript checks.
- `pnpm lint` — ESLint over `src/`, `tests/`, and `functions/`.
- `pnpm validate` — change-sensitive validation tier; `validate:full` runs the full tier.
- `pnpm test:a11y` and `pnpm test:visual` — browser accessibility and visual checks.
