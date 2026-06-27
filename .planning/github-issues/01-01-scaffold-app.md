## Goal

Create the first runnable Chabiko web app scaffold with the correct package manager baseline.

## Scope

- Choose and initialize the static-first web framework.
- Add `packageManager` with pnpm.
- Add initial app directories and a minimal first screen that can later render real learning content.
- Add basic lint/typecheck/test scripts appropriate to the chosen stack.
- Confirm no npm/yarn/bun lockfiles are introduced.

## Out of scope

- Full visual design.
- Full curriculum content.
- Accounts, backend persistence, or CMS.

## Acceptance criteria

- [ ] App can install and run locally with pnpm.
- [ ] Repo contains `packageManager` using pnpm.
- [ ] No `package-lock.json`, `yarn.lock`, `bun.lock`, or `bun.lockb` exists.
- [ ] First screen is a usable app shell, not a marketing-only placeholder.
- [ ] Basic lint/typecheck/test command exists or a documented reason is provided.

## Source of truth

- `.planning/ROADMAP.md` Phase 1, plan 01-01.
- `.planning/phases/01-foundation-content-model/01-CONTEXT.md`.
- `docs/decisions/adr-0001-static-first-v1.md`.

