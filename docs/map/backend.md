---
area: backend
owner: chabiko
updated: 2026-11-27 JST
---
# Backend services

- `functions/teacher-review/` contains the Pages Functions API for teacher campaign access, records, decisions and export. Start at `api/_middleware.ts`; request handlers and D1 access are in `api/`.
- Teacher-review routes are exposed beneath `src/pages/teacher-review/`; access configuration is required for protected operations.
- `supabase/migrations/` defines the basic vocabulary progress tables and stale-generation policy; `supabase/config.toml` is local Supabase configuration.
- `src/client/basicVocabularyAccount.ts`, `basicVocabularySyncRuntime.ts` and related adapters connect learner sync; `src/domain/basicVocabularySync.ts` owns sync rules.
- `functions/tsconfig.json` is the Functions compiler project. Secrets/configuration are supplied by deployment environment.

Commands: `pnpm typecheck:functions` checks Functions; `pnpm typecheck` runs Astro and Functions checks.
