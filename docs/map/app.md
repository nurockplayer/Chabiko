---
area: app
owner: chabiko
updated: 2026-11-27 JST
---
# App

Astro owns route rendering; browser behavior is split into UI components and client/domain modules.

- `src/pages/` — home, paths, lessons, phrasebook, roleplay, practice, vocabulary, teacher review, auth callback and JSON endpoints. Route file names map to URLs.
- `src/layouts/BaseLayout.astro` — shared page shell; `src/components/` — reusable Astro learner UI.
- `src/client/` — browser state, local progress, sessions, quizzes, preferences and remote sync adapters.
- `src/domain/` — framework-independent learning and progress rules.
- `src/lib/` — shared browser/service helpers; `src/types/` — shared data contracts.
- `src/content/` loads and assembles the content described in [content.md](content.md).
- `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts` configure the app and root tests.

Commands: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`.
