# AGENTS.md

## Project

Chabiko | チャビコ is a public website for Japanese speakers learning Mandarin Chinese
for Taiwan travel. Keep the product focused on beginner-to-travel confidence, Traditional
Chinese, Japanese explanations, and fun content that people want to continue reading.

## GSD Workflow

- Treat `.planning/PROJECT.md` as the project context source of truth.
- Treat `.planning/REQUIREMENTS.md` as the checkable v1 scope.
- Treat `.planning/ROADMAP.md` as the phase boundary.
- Before implementing a phase, read that phase's `*-CONTEXT.md` if it exists.
- Do not add capabilities that are outside the current issue or phase. Open a new issue instead.

## Git And GitHub

- Use small PRs tied to GitHub issues.
- PRs must list source of truth, what changed, what is explicitly out of scope, and verification.
- Do not enable high-impact automation such as auto-close PRs or dependency auto-merge without explicit confirmation.
- Public repo content must avoid copying third-party lesson text, vocabulary databases, audio, or images unless license and attribution are verified.

## JavaScript Package Manager

- For this greenfield JS/TS/web project, prefer `pnpm`.
- Add `"packageManager": "pnpm@10"` when the app scaffold is created.
- Do not introduce `package-lock.json`, `yarn.lock`, `bun.lock`, or `bun.lockb`.
- Do not add package lifecycle enforcement such as `preinstall`.

## Frontend Guidance

- Before designing or redesigning frontend pages, use the local `design-taste-frontend` skill.
- This is a learning product, not a generic SaaS dashboard: design should feel playful, readable, mobile-first, and content-led.
- Do not build a landing-page-only shell. The first screen should quickly expose useful learning content.
- Use stable responsive dimensions for cards, lesson steps, quizzes, audio controls, and tables so text does not overlap.

## Content And Data Rules

- Use Traditional Chinese as the primary Chinese script for v1.
- Store content in structured, reviewable files rather than hard-coded component text.
- Every vocabulary item should support Chinese, pinyin, Japanese explanation, category, examples, and source/review metadata.
- Treat Mandarin/Japanese on-yomi similarity as a learning aid, not as an etymological claim unless a source supports it.
- Flag false friends and usage differences explicitly.

## Testing And Verification

- Content changes need review criteria, not only code tests.
- UI changes should be checked on mobile and desktop.
- Interactive practice should be tested for correct scoring, retry behavior, and persistence if local state is used.

