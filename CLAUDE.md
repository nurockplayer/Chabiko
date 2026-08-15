# Chabiko — Claude Agent Guidelines

@~/.claude/CLAUDE.md

This file defines Claude Code-specific behavior only.

All repository-wide development, scope, Git, package-manager, supply-chain safety, validation, and reporting rules are defined canonically in root `AGENTS.md`. Do not duplicate those rules here.

When rules conflict, use this precedence:

1. The user's explicit instruction for the current task
2. The current GitHub issue body
3. `AGENTS.md`
4. This file

## Language

- Repository technical artifacts follow the English-first policy in `AGENTS.md` and `docs/engineering/repository-language-policy.md`.
- Agent conversation, progress updates, and final chat responses may follow an explicit user's language preference; this does not change the language of committed technical artifacts.
- Learner-facing content, examples, UI copy, grammar explanations, and other text for Japanese learners may use Japanese.
- Target-language Chinese follows the product path's Traditional/Simplified contract.

## Before Implementation

Before making changes:

1. Read root `AGENTS.md`.
2. Read the current GitHub issue body.
3. Confirm issue scope, acceptance criteria, dependencies, and allowed modification surface.
4. Read only the code, schemas, validators, fixtures, tests, and source-of-truth material required for the task.
5. Check working-tree state so unrelated changes are not overwritten or mixed in.
6. Follow the `Pre-Implementation Checks` in `AGENTS.md` (safety-mechanism writers, cross-file contract synchronization, documented-command tests, cleanup assumptions).
7. Determine whether the issue is a cross-cutting change under `AGENTS.md`; if so, complete an Impact Map before implementation.

Do not rely on an implementation snapshot in this file. Current `main` code/tests and the current GitHub issue/PR are authoritative for live state.

## Implementation Principles

- Handle only what the current issue explicitly requires.
- Prefer the smallest direct and verifiable change.
- Do not opportunistically refactor, expand scope, or auto-fix non-blocking findings.
- Report out-of-scope problems only as concise deferred findings when necessary.
- Do not trust a PR body, old summary, or another agent's claim that work is complete; verify it independently.
- Validation level is determined by the `Risk-Based Validation Ladder` in root `AGENTS.md` (`scripts/validation/classify.ts`) and executed through `pnpm validate`, `validate:affected`, `validate:integration`, or `validate:full`. Do not manually select a lower suite.

## Subagents

- Do not start a subagent for ordinary file reads, searches, implementation, or routine judgment.
- Do not run overlapping-purpose subagents concurrently.
- A subagent task must be narrow, explicit, and have a clear stop condition.
- A subagent must not spawn another agent.
- Do not assign broad repository audits to background agents.

`arbiter` is only for a clearly defined difficult technical decision. Do not use it for routine implementation, routine review, or repository exploration.

## Model Routing

Sol is a scarce reasoning resource, not the default end-to-end implementer for difficult tickets. The canonical Flash/Pro/Sol role split, `Sol-assisted` / `Sol-led reasoning` meanings, and escalation conditions are defined only in `AGENTS.md` under `Model Routing / Sol Budget Gate`. Do not maintain a divergent copy here.

If a current issue explicitly declares Sol unavailable and provides an alternative routing contract, follow that newer issue contract rather than stopping on an obsolete Sol reference.

## Reviewer Gate

Start an independent `reviewer` only after implementation and the required local validation are complete.

- Each implementation cycle may have at most one reviewer.
- For an ordinary bounded cycle, the reviewer checks the current issue, acceptance criteria, and the current staged diff only.
- A reviewer must not edit files, create work items, spawn agents, or perform a broad repository audit.
- A non-blocking finding is reported only; it must not block delivery or automatically trigger more investigation.
- A blocking finding receives the smallest correction, followed by affected validation and re-review.
- Ordinary bounded-cycle re-review checks the corrected diff and prior blockers instead of re-exploring the whole repository.
- A cross-cutting final integration review, as classified by the `Cross-Cutting Change Gate` in `AGENTS.md`, is a complete-surface review: current issue, Impact Map, full PR diff, and applicable contract surfaces including writers, consumers, stale assumptions, canonical workflows, cleanup, rights/provenance, generated output, and negative-drift behavior. This exception applies only to cross-cutting final integration review and does not turn routine review into a broad repository audit.
- After blocking fixes in a cross-cutting change, the final merge-readiness pass must still verify the complete surface on the latest head, not only the latest patch.
- When the reviewer explicitly returns `No blocking findings.`, stop the review loop.

Only after the reviewer returns `No blocking findings.` and required validation passes may commit/push/PR/merge actions proceed when the user has authorized those actions.

Unless the user explicitly asks, do not commit, push, open a PR, merge, or modify a GitHub issue/review thread.

This section defines Claude Code-specific review execution only. PR merge eligibility, risk tiers, throughput limits, CodeRabbit advisory semantics, exact-head review, unresolved blocking-thread checks, and the merge gate are defined canonically in root `AGENTS.md` under `Review and Merge Policy (Concurrent Sub-Agent Throughput Aware)`. The implementing agent must not be the sole reviewer of its own work.

## Graphify

Use `graphify` only for code navigation and understanding.

Unless the current issue explicitly requires a knowledge-graph update, do not:

- run `graphify update .`;
- modify or commit `graphify-out/`;
- create graph-metadata churn for ordinary code or content changes.

## Completion Report

Report only:

- key changes;
- validation actually executed and results;
- final reviewer result;
- unresolved blocking issues;
- any necessary deferred non-blocking finding.
