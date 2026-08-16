# Chabiko — Agent Guidelines

## Technical Language Policy

English is the canonical language for repository technical artifacts. Follow `docs/engineering/repository-language-policy.md`.

Use English for committed technical documentation, code comments/docstrings, developer-facing errors/logs, tests whose text is not product behavior, implementation plans, review findings, validation notes, GitHub technical details, and agent/contributor instructions.

A team-facing issue or pull request may include an optional Japanese summary, but the detailed technical contract and evidence remain canonical in English. Agent chat may follow an explicit user's language preference.

Preserve Japanese/Chinese where language is product behavior or evidence: learner-facing copy, localization, learning content, pinyin/kana/examples, language-learning fixtures and test data, and exact human-review/source evidence. Do not rename routes, APIs, schema fields, persisted keys, database fields, external identifiers, or other established contracts solely for language consistency.

Legacy technical material is touch-to-migrate unless it is maintenance-critical or explicitly in scope. Historical commits, closed GitHub history, and immutable evidence are not rewritten for language consistency.

## Product Positioning

Chabiko | チャビコ is a website for Japanese speakers learning Mandarin Chinese. The goal is to take complete beginners from “I can recognize some kanji” to “I can use simple Chinese while traveling in Taiwan.”

Product core:

- Chinese content is dual-script. Taiwan-travel paths are Traditional-first; HSK, school-study, and general Mandarin paths may default to Simplified. Product UI and explanations remain Japanese-first.
- Prefer Japanese explanations for Japanese-speaking learners.
- Content should be interesting, concise, and easy to continue reading.
- Use Chinese/Japanese character and on-yomi similarity to lower the entry barrier, while clearly marking false friends, tone differences, and Taiwan usage.
- Express learning outcomes as Travel Quest / scenario readiness, not only completed-lesson counts.

## Source of Truth

Before implementation, read the current GitHub issue body, then read only the source-of-truth material directly relevant to the current scope.

Conflict precedence:

1. The user's explicit instruction for the current task
2. The current GitHub issue body
3. Merged phase context that is still active
4. `.planning/REQUIREMENTS.md` — v1 acceptance requirements
5. `.planning/ROADMAP.md` — phase boundaries and issue mapping
6. `.planning/PROJECT.md` — product positioning, core value, constraints, and decisions
7. Strategy, draft, or research documents

Do not read all planning documents merely to confirm a simple task.

If documents conflict in a way that affects correctness, stop expanding implementation and report the conflict. Unless the user explicitly asks, do not independently update a source of truth or create an issue.

## Shell Commands

- Git/gh shell commands must use `rtk` to reduce output tokens.
- Do not prefix non-git commands with `rtk`, including `sed`, `grep`, `find`, `pnpm`, `node`, `pytest`, and `make`.

Examples:

```bash
rtk git --no-optional-locks status
rtk git diff --stat
rtk gh issue view 12
pnpm test
sed -n '1,120p' AGENTS.md
```

## Technical Baseline

The project currently uses:

- Astro
- TypeScript
- pnpm
- Vitest
- Structured content files
- uv + Python 3.14+ validation tooling
- LocalStorage-based v1 progress

The existing architecture, schemas, and tests are the implementation baseline. Unless the issue explicitly requires it, do not reselect the stack, replace the framework, or rebuild the scaffold.

## Scope Boundaries

- A PR must do only the work explicitly listed by its GitHub issue.
- Do not bundle unrequested features, refactors, or future work into the same change.
- When you discover out-of-scope needs or technical debt, do not insert them into the current PR. Mention them briefly as deferred findings only when relevant.
- If a change requires a new dependency, architecture adjustment, or wider functional scope, explain the reason, alternatives, and risks first.
- High-impact automation such as automatic PR closing or dependency auto-merge is prohibited by default unless the user explicitly approves it.

## Pre-Implementation Checks

These rules come from repeated Issue #193 review loops and must be checked before implementation to avoid the same defects:

- Before removing or narrowing any safety mechanism (build guard, `.gitignore` rule, validation gate), identify every writer to the affected path and every consumer depending on the mechanism. Change it only after confirming no other writer remains.
- When changing a cross-file contract (rights, state, schema, data structure), enumerate the complete consumer set (data, loader, validator, UI, tests) and update all of them in the same change. Do not add one side and defer the rest.
- A documented workflow command must have a self-test that asserts the command's behavior, not only the functions it calls.
- Regression-test cleanup may delete only files/directories created by that test. Assume a working tree can contain another developer's files; never assume a clean environment.

## Cross-Cutting Change Gate

An issue is cross-cutting when it affects at least two of these areas. Produce a concise Impact Map before implementation:

- asset paths, generated files, or migration;
- schema, state, or metadata contracts;
- generator, importer, rebuild script, or legacy compatibility paths;
- build, deployment, pruning, `.gitignore`, or cleanup behavior;
- rights, license, attribution, or provenance;
- multiple runtime consumers (loader, UI, API, validator, tests);
- large committed generated output.

The Impact Map must freeze these surfaces. If any is unknown or still requires a product decision, stop implementation and report it rather than guessing:

- all writers to affected paths/data/state;
- all consumers and validators;
- legacy writers and compatibility paths;
- canonical rebuild or migration command;
- Git, build, deployment, and cleanup boundaries;
- rights/license/provenance requirements;
- clean- and dirty-environment failure cases.

The template, Requirement → Diff → Test Evidence matrix, and complete workflow are in `docs/engineering/cross-cutting-change-playbook.md`. Ordinary single-file or local changes are not cross-cutting and do not need an Impact Map.

## Cross-Cutting Completion Report and Final Review

A cross-cutting completion report must map each frozen requirement to:

- the changed file or generated artifact;
- the corresponding focused test or validation;
- the observed result.

Do not claim a requirement is complete without matching diff/evidence.

The final read-only reviewer must inspect the complete contract surface, not only the last follow-up diff. At minimum verify all known writers and consumers, stale paths/state/metadata/documentation, canonical rebuild/migration workflow, destructive cleanup and dirty-environment behavior, rights/license/provenance consistency, generated output versus committed metadata, negative drift tests, and fail-closed behavior.

Except for an immediate P0/P1 safety or data-loss interruption, the reviewer should finish the complete contract-surface scan and aggregate all findings into one review result or follow-up plan. The coordinator then groups findings by root cause, implementation mechanism, primary files, and validation boundary:

- Findings may share one bounded implementation cycle only when they meet the Flash Task-Size Gate merge criteria: same root cause, primary files, implementation mechanism, and validation boundary.
- Unrelated findings must be handled as separate bounded cycles on the same branch/PR.

## Flash Task-Size Gate

This section applies to DeepSeek V4 Flash or other low-cost implementation models and also constrains coordinators generating implementation or review-fix prompts.

- Review findings are not an executable task that may be delegated wholesale. Group them first by root cause and implementation mechanism.
- Each implementation cycle may have only one primary mechanism plus directly coupled targeted tests.
- One cycle must not combine production logic/architecture changes, test-harness/mocking/fixture redesign, and GitHub/CI/review-thread/PR cleanup.
- Multiple findings may be combined only when root cause, primary files, implementation mechanism, and validation boundary all match.
- Otherwise split the work into sequential bounded cycles on the same branch/PR: production correctness, failure-path tests/test harness, then final integration/delivery cleanup.
- A non-final cycle stops after targeted validation and a concise report. Full validation, reviewer rerun, thread resolution, PR-body update, and CI confirmation belong only in the final integration cycle.
- If a prompt contains more than one independent primary mechanism, the coordinator must split it before delegation. If an implementer receives a task that violates this gate, it must stop before modification and report the recommended split.
- Prompt length must match task size and must not repeat requirements already stated by the Issue, `AGENTS.md`, or `CLAUDE.md`.
- Completion of a single cycle must not be described as the entire PR being merge-ready unless final integration, complete validation, and the reviewer gate have all completed.

## Model Routing / Sol Budget Gate

This section is the repository's canonical model-routing policy. `CLAUDE.md` and GitHub issues reference it and must not maintain divergent rules. This section defines roles and Sol escalation; the Flash Task-Size Gate defines task grouping, bounded cycles, and merge criteria. Apply both together.

### Roles

- **Flash (DeepSeek V4 Flash)** — default bounded implementation model. Implements directly from an established contract, validation requirements, and issue scope, and runs targeted validation. No Sol consultation is required first.
- **Pro (DeepSeek V4 Pro)** — diagnosis, reviewer, and arbiter model. Handles review, diagnosis, and focused decision points under existing reviewer policy.
- **Sol** — scarce architecture/concurrency/security/correctness reasoning resource. Use it only to resolve a specific decision question, not to implement an entire ticket end-to-end.

### Sol usage

- Every Sol invocation must target a specific decision question and include collected evidence plus narrowed viable options.
- Do not use Sol for broad repository exploration, file discovery, routine tests/lint, boilerplate, or mechanical refactoring.
- Invoke Sol only for architecture/concurrency/security/correctness ambiguity that remains after cheap evidence gathering.
- Default difficult flow: cheap repository evidence collection → narrowly scoped Sol decision → Flash implementation → Pro review → Sol re-entry only if unresolved.
- `Sol-assisted` means on-demand escalation, not mandatory Sol preflight. If Flash can implement unambiguously from the issue contract, existing architecture, and repository evidence, continue without calling Sol.
- A `Sol` classification does not mean the whole ticket is implemented by Sol. Flash still owns implementation; Sol enters only at decision points.

### `Sol-assisted`

- Meaning: Flash is the primary implementer and the ticket predefines decision points that may require Sol judgment; execution follows those decisions.
- Escalation: Flash escalates at a decision point when reasoning judgment is required. After Sol responds, Flash resumes implementation and Pro performs independent final review.
- Typical use: most difficult vertical-slice tickets currently marked for Sol involvement.

### `Sol-led reasoning`

- Meaning: the ticket's core output is a correctness/security reasoning result or acceptance verdict, not a bounded implementation. Sol leads that reasoning only after the decision question has been narrowed. Any implementation immediately following the reasoning still belongs to Flash and is reviewed by Pro.
- Escalation: explicit. Sol enters only at the defined decision phase and does not perform routine implementation.
- Typical use: integration/release acceptance and security-critical correctness convergence, such as #267 and #294.

### Issue routing

- Issue routing labels describe model roles and Sol escalation semantics only. They do not change issue scope, acceptance criteria, or dependencies.
- `Routing: Sol-assisted` and `Routing: Sol-led reasoning` are the only valid Sol routing labels on an issue. `Implementation: Sol` means the entire ticket is implemented by Sol and must not be used unless this section explicitly allows it.
- A coordinator must not delegate an entire Sol-assisted/Sol-led ticket to Sol for implementation. Sol handles only predefined decision questions.

## Git Rules

- Branch names use `<agent-or-purpose>/<short-description>` unless the user or current workflow specifies a more specific convention.
- Commit messages use concise English imperative wording or `<type>: <short description>`.
- In a mixed worktree, never use `git add -A` or `git add .`; stage only files required by the current task.
- Do not revert changes the user did not ask to revert.
- GitHub/git commands must be non-interactive.
- A PR must list its source of truth, changes, explicit non-goals, and validation results.

## Issue Implementation and Coordinator Worktree Rules

This section applies to every GitHub issue implemented by an agent or workflow. It prevents accidental worktree deletion, incorrect resume paths, and merged PRs that leave issues open.

- The Coordinator creates an isolated worktree for issue implementation before the implementing agent starts. The executing agent receives the absolute worktree path and does not rely on an isolation wrapper.
- The agent must not create, switch, rename, or delete worktrees itself.
- The Coordinator may clean up a worktree only after the PR exists and the remote commit is safe.
- If an issue-reviewer ends without a verdict (`BLOCKED_REVIEW`, turn limit, timeout, interruption), fix any clear environment problem first, then start a fresh issue-reviewer instance on the same exact head. Do not resume the same reviewer.
- Only if the fresh issue-reviewer still returns no verdict may an unused, fresh, read-only general-purpose reviewer be used. The fallback reviewer receives read-only tools only.
- A fallback reviewer must still report the exact reviewed head and blocking findings, or `No blocking findings.`
- Controller validation cannot substitute for a reviewer verdict. Review is complete only when a reviewer explicitly returns a verdict.
- The PR must contain `Closes #<issue>` and list scope, changed files, validation, and non-goals. A bare issue number is not sufficient.

## Review and Merge Policy (Concurrent Sub-Agent Throughput Aware)

This section is the sole canonical policy for PR review and merge eligibility. The `Reviewer Gate` section in root `CLAUDE.md` and `.github/pull_request_template.md` reference this policy and must not maintain divergent rules. The goal is wide implementation and narrow integration:

```text
parallel isolated implementation
→ bounded review queue
→ independent exact-head review
→ sequential integration against latest main
```

### Reviewer roles

- The implementing agent must not be the sole reviewer of its own work. Every PR needs at least one independent reviewer who did not participate in implementation.
- Every PR requires at least one independent reviewer verdict against the exact current head.
- CodeRabbit is advisory by default. A pending, delayed, skipped, disabled, quota-limited, cancelled, or no-op CodeRabbit run does not by itself block merge.
- A successful CodeRabbit check is not reviewer approval unless it includes a real verdict or concrete findings for the current exact head.
- CodeRabbit findings must be classified as blocking, valid non-blocking, or incorrect/irrelevant. Only unresolved blocking findings block merge.

### Risk tiers

Risk-tier classification must be deterministic and checkable. The PR template must state the tier and rationale.

- **Low risk:** documentation, tests, copy, isolated maintenance, or changes that do not alter production behavior. Independent review + required CI is sufficient.
- **Medium risk:** ordinary product behavior, state management, API integration, build configuration, or persistent data access. Requires independent exact-head review + required CI. Include CodeRabbit feedback when available, but do not wait solely for completion.
- **High risk:** authentication, authorization, secrets, destructive operations, migrations, payments/economy, deployment, concurrency, queue correctness, or core architecture. Requires two independent review signals. CodeRabbit may count as one signal, or an equivalent independent reviewer may replace it.

### Throughput limits

- At most 4 implementation PRs may wait concurrently in the active review queue.
- At most 2 PRs may be in final review concurrently.
- Merge only one PR at a time, against the latest `main`.
- Additional completed agent work remains in the implementation-ready queue instead of opening an unlimited number of PRs.
- After another PR merges, reevaluate integration order and dependency constraints against latest `main`. **A stale base SHA alone is not a blocker** and does not justify requiring a rebase, force push, or branch rewrite.
- Require a branch update and rerun required gates only when at least one condition applies: merge conflict; changed-file overlap requiring reintegration; dependency/API/schema/contract changed; required validation fails on the temporary integration result; branch protection explicitly requires an up-to-date branch.
- Otherwise keep the reviewed PR head unchanged. Create a temporary merge/integration tree from latest `origin/main` plus the PR exact head, validate merge-tree/dependency/scope/required gates, and squash-merge in latest-main order when integration passes. Do not rerun the complete exact-head review merely because the base advanced.

### Merge gate

All conditions below must be true before merge:

- required CI and repository validation gates are green on the exact head;
- the independent reviewer count required by the risk tier reports `No blocking findings.`;
- no unresolved non-outdated blocking review thread remains;
- reviewed head SHA is unchanged;
- scope matches the owning issue with no unrelated work bundled;
- integration order and dependency constraints remain valid against latest `main`.

A reviewer verdict is bound to the actual reviewed candidate (the reviewed head SHA). Merge is not a review and cannot fill a missing verdict. Only rewriting the PR head to create a new candidate invalidates the prior exact-head verdict and requires re-review. Temporary merge/integration-tree validation, or another PR merging, does not itself count as review.

An unfinished CodeRabbit run is not an independent merge blocker unless the PR is explicitly high risk and CodeRabbit was selected as one of its required review signals.

## JavaScript Package Manager

- Use pnpm.
- Use the exact `packageManager` version already in `package.json`. Do not downgrade, upgrade, or rewrite it unless the issue explicitly requires that change.
- Do not introduce `package-lock.json`, `yarn.lock`, `bun.lock`, or `bun.lockb`.
- Do not add `preinstall`.
- Do not use a lifecycle script to force the package manager.

## Supply-Chain Safety

- Do not add dependencies unless the task requires them and the reason has been explained.
- Do not execute remote just-in-time commands such as `npx`, `pnpm dlx`, `npm exec`, `curl | bash`, or `wget | sh` unless the user explicitly approves it.
- Any `package.json` or lockfile change must be called out explicitly in the report.
- Do not import external teaching material, dictionary data, audio, images, or example sentences until license, attribution, and allowed use are documented.

## Frontend Quality Priorities

- Before designing or redesigning a frontend page, use `design-taste-frontend`.
- The first screen should show real learning content or practice quickly, not a landing page.
- UI should be mobile-first, content-driven, light but not childish.
- Use Japanese for learner explanations; use Traditional Chinese for target-language content where the path requires it. Technical/developer interfaces follow the repository technical-language policy.
- Lesson pages should clearly present: hook, can-do goal, core sentence, chunk breakdown, kanji bridge, sound focus, mini practice, and travel task.
- Prefer Travel Quest / scenario readiness over generic streak mechanics.
- On mobile and desktop, verify that text does not overlap or truncate, especially long Japanese sentences, pinyin, Traditional-Chinese cards, and buttons.

## JS-Free Interaction and Browser Evidence

JS-free interaction work must:

- use native controls and native browser semantics, for example `details`/`summary`, radio inputs, `<a href="#id">`, and `<button type="button">`;
- not simulate buttons with focusable labels, generic elements, or inert anchors, and not imitate mutable native state with static ARIA state;
- produce browser interaction, accessible-name, focus, viewport, and screenshot evidence before read-only arbiter review;
- confirm every required evidence element and every visible interactive control in a screenshot fragment is fully inside the viewport.

For the interaction decision table, per-control contract, browser smoke-test matrix, screenshot/viewport evidence rules, arbiter capability boundary, and review/merge rules, see `docs/engineering/frontend-interaction-evidence-playbook.md`.

## Content and Data Rules

- Content and data support Simplified/Traditional display. Taiwan-travel paths are Traditional-first; HSK, school-study, and general Mandarin paths may default to Simplified.
- Content must live in structured, reviewable data files. Do not hard-code it in Astro pages, UI components, or rendering logic.
- Each vocabulary entry must support at least: Traditional Chinese, pinyin, Japanese explanation, category, example sentence, tone note, and caution/source/review metadata.
- Every core lesson must follow the lesson loop in `docs/strategy/learning-and-motivation-strategy.md`.
- Chinese/Japanese on-yomi similarity may be used only as a learning bridge. Do not make etymological or pronunciation-equivalence claims without a source.
- Clearly mark false friends, tone traps, and Taiwan-usage differences.

## Tests and Validation

Before claiming completion, report the validation actually executed.
Run only targeted validation directly relevant to the current change; do not unconditionally run every test category for a bounded change.
If a change crosses shared domain, schema, build configuration, or package metadata, expand to the corresponding full validation.

Prioritize tests for:

- content-schema validation;
- lesson-loop field completeness;
- caution/source/review metadata for on-yomi bridge vocabulary;
- practice scoring, retry, and local progress;
- Travel Quest readiness calculation;
- overlap/truncation on major mobile/desktop screens;
- pnpm lockfile policy.

## Risk-Based Validation Ladder

The minimum validation tier for a bounded cycle is determined by change risk, not by the model. The executable classifier is `scripts/validation/classify.ts`; it maps changed files to a minimum tier. Agents use these stable commands. Each command guarantees at least its named tier and automatically escalates when the classifier requires a higher tier. Do not hand-pick a lower suite:

- `pnpm validate` — classify the current diff against `origin/main` and execute the required tier.
- `pnpm validate:affected` — T1 Affected: affected-domain tests + lint + typecheck.
- `pnpm validate:integration` — T2 Integration: full Vitest + lint + typecheck + build.
- `pnpm validate:full` — T3 Full Gate: T2 + visual + accessibility + content.
- `pnpm validate:classify` — report tier and reasons only; do not execute tests.

Minimum tier definitions:

- **T0 Smoke** — directly coupled focused test/validator during implementation; no repo-wide command.
- **T1 Affected** — affected-domain tests + minimum static checks (lint, typecheck).
- **T2 Integration** — full Vitest + lint + typecheck + build before final review.
- **T3 Full Gate** — T2 + visual regression + accessibility + content/cross-cutting checks for merge-ready, high-risk, and `main`.

Classification uses the maximum tier across all changed files. It drops to a lower tier only when every file is low risk. These surfaces conservatively escalate: schema/repository contracts (`src/types`, `src/data`); auth/account/Supabase; generators/build/CI/`scripts`; `package.json`/lockfile/config; generated data (`data/**/generated`, `data/unicode`); learner-visible UI/components (`src/components`, `src/pages`, `src/layouts`, `.astro`) because layout or keyboard focus order may change and therefore requires visual regression and accessibility. Unknown files fail safe to T3; pushes to `main` always use T3. PR CI uses the same classifier to skip irrelevant expensive jobs, while high-risk/unknown changes still run the full gate. The risk-class → tier mapping and affected-test selection in `scripts/validation/classify.ts` are canonical and guarded by `tests/validation/classifier.test.ts`, including coverage that every domain source has an affected-test mapping.

## Reporting Format

Keep reports concise:

- List only key changes: filename + one sentence.
- Report test results as pass/fail plus the failure reason; do not paste complete logs.
- Explicitly report any new dependency, package-manager, license, or external-data risk.
- If an error can be safely fixed within the current issue scope, diagnose it, make the smallest correction, and rerun validation before reporting.
- Stop for a user decision only when the fix would expand scope, change architecture, add dependencies, break compatibility, or require a product decision.
