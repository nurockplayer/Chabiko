# Chabiko — Agent Guidelines

Chabiko | チャビコ is a commissioned Mandarin-learning website for Japanese speakers, built for a Chinese teacher. Production: https://chabiko.pages.dev (Cloudflare Pages, deployed automatically from `main`).

The goal is a complete, usable product for real learners. Prefer shipping working learner value over process, documentation, or PR count.

## Product

- Three learner tracks: `先生厳選単語` (teacher-curated vocabulary), `HSK` (HSK 3.0 levels 1–4), `台湾旅行` (Taiwan travel lessons, phrasebook, roleplay), plus tone and word-order practice.
- Learner UI and explanations are Japanese. Chinese is dual-script: Taiwan travel is Traditional-first; HSK defaults to Simplified.
- The first screen shows real learning content, not a landing page. Mobile-first; verify no overlap/truncation at 375px.
- V1 progress is local (localStorage). Accounts are not part of V1.
- Pronunciation: static pre-generated audio when present, otherwise browser speech synthesis (decision record: issue #522).
- Content lives in structured data files under `data/`, not hard-coded in pages.

## Non-negotiable safeguards

These are the only hard gates. Everything else is engineering judgment.

1. **Content rights.** Do not import third-party text, dictionary data, audio, images, or example sentences unless the license permits our use; keep required attribution visible and recorded with the data.
2. **Evidence integrity.** Never fabricate human approvals, reviewer identities, review outcomes, or user-research results. AI-authored content stays truthfully marked (`reviewStatus: draft`, `humanReview: false`, or equivalent). AI-provisional content may be shown to learners when it carries an honest disclosure.
3. **Security.** No secrets in the repository or logs. Keys come from the environment. Protected surfaces (e.g. `/teacher-review/`) must fail closed when their access configuration is missing.
4. **Supply chain.** Use pnpm 12.11.2 (the `packageManager` pin). No `npm`/`yarn`/`bun` lockfiles, no `preinstall` enforcement scripts. Add dependencies only when they clearly pay for themselves, and say so in the PR.

## How work flows

- **Lead:** Claude (Opus) owns product decisions, integration, merges, deploys, and GitHub records.
- **Implementation:** delegated to Codex (`gpt-6-astra` by default; `gpt-6.1-sol` for hard reasoning or high-accuracy content work), each task in its own git worktree and branch.
- **Review:** one fresh, read-only Codex session reviews each PR diff before merge. It reports blocking findings or `No blocking findings.` The implementer never reviews its own work. Non-blocking findings are noted, not chased.
- **Merge gate:** CI green + independent review with no blocking findings. Squash-merge. A stale base alone is not a reason to rebase; update the branch only on conflicts or failing CI.
- **Issues:** an issue is useful when it records a decision, a bug, or work that cannot happen now (e.g. waiting on the teacher). Do not create tracking-only or ceremony issues. Record significant product/architecture decisions as GitHub issues labelled `decision`.
- **Scope:** keep PRs focused on one outcome, but fix small adjacent problems you find instead of filing issues for them.

## Human review of content

The teacher reviews learner content after release, not before. Review state is tracked in data (`reviewStatus`, review artifacts) and in the teacher-review issues. Never flip content to reviewed/approved without a real review record from a real person.

## Validation

- Local: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. `pnpm validate` picks the tier for your diff automatically.
- Learner-visible UI changes: update and inspect visual snapshots with `pnpm test:visual:update` (pinned Playwright container; needs Docker), then `pnpm test:visual` and `pnpm test:a11y`.
- Content data: `pnpm validate:content`.
- Report the validation you actually ran. Do not claim results you did not observe.

## Conventions

- English for code, comments, docs, commit messages, and GitHub technical content (see `docs/engineering/repository-language-policy.md`). Japanese/Chinese where they are product content.
- Branches: `<purpose>/<short-description>`. Commits: concise imperative English.
- Never `git add -A` in a shared or dirty worktree; stage only what you changed.
- Do not rename routes, persisted localStorage keys, or data IDs without a migration.
- `.planning/` and old strategy docs are historical context, not current requirements.
