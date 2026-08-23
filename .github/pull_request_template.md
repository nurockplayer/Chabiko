## Optional Japanese Summary

Optional team-facing summary. The English technical details below are canonical.

-

## Source of Truth

Closes #<issue-number>

> Keep the line above standalone and outside any checkbox. Fill the complete closing reference, including `Closes` and the issue number; do not use only a bare issue number. If no corresponding issue exists, create the issue first.

- Planning doc:

## Frozen implementation decisions

- Content selection / canonical strings (or "N/A — this is a non-implementation PR"):
- Schema / controlled values:
- Script policy (or "N/A"):

## Scope

### Exact scope

-

### Exact non-goals

-

## Changed files

-

## Validation Results

- [ ] git diff --check … {{result}}
- [ ] pnpm lint … {{result}}
- [ ] pnpm typecheck … {{result}}
- [ ] pnpm test … {{result}}
- [ ] pnpm build … {{result}}
- [ ] Schema/content validators (if content files changed): {{result}}
- [ ] Issue-specific check: {{description}} … {{result}}

## Branch and PR Isolation

- Branch:
- Files changed:
- Files outside scope (verified unchanged):
- ⚠️ If this PR is not merged: its state must NOT be reused as the base of a subsequent issue. The next ticket opens a fresh branch.

## Pre-Implementation Freshness Check

- [ ] Reference materials, schemas, or external data sources confirmed current at implementation time.

## Review and Merge Policy Compliance

Per `AGENTS.md` **Review and Merge Policy (Concurrent Sub-Agent Throughput Aware)**, the canonical review and merge policy.

### Risk tier

- [ ] Low risk — documentation, tests, copy, isolated maintenance, no production behavior change
- [ ] Medium risk — ordinary product behavior, state management, API integration, build configuration, persistent data access
- [ ] High risk — authentication, authorization, secrets, destructive operations, migrations, payments/economy, deployment, concurrency, queue correctness, core architecture
- Risk tier rationale: {{low | medium | high}} — {{reason}}

### Exact-head review

- Reviewed head SHA: {{reviewed head SHA}}
- Current head SHA: {{current head SHA}}
- [ ] Reviewed head SHA unchanged at merge (reviewed head must match current head).
- Stale base SHA alone does not invalidate the reviewed head: integration is validated against latest `main` via a temporary merge tree without rewriting the branch; only a head rewrite (merge conflict, changed-file overlap, dependency/API/schema/contract change, failed integration validation, or branch-protection requirement) voids the prior exact-head verdict and requires re-review. Temporary merge-tree validation is not itself a review.

### Independent reviewer verdicts

Required independent reviewer count: low/medium = 1, high = 2 independent review signals.

- [ ] DeepSeek Pro reviewer (independent reviewer 1, required for all tiers): No blocking findings.
- [ ] Independent reviewer 2 (required for high risk; CodeRabbit may count as one signal): No blocking findings.
- [ ] Codex final review passed (where applicable).
- [ ] Implementing agent did NOT serve as the sole reviewer: {{confirmed}}

### Required checks

- [ ] Required CI and repository validation gates green on the exact head.
- [ ] No unresolved non-outdated blocking review thread remains (see "Unresolved Non-Outdated Threads at Merge").
- [ ] Scope matches the owning issue; no unrelated work bundled.
- [ ] Integration order and dependency constraints remain valid against latest `main`.

### CodeRabbit status

- [ ] CodeRabbit actually ran on the current exact head.
- CodeRabbit status: {{ran-with-findings | ran-clean | pending | skipped | disabled | quota-limited | cancelled | no-op | not-configured}}
- [ ] A skipped/disabled/delayed/quota-limited/cancelled/no-op CodeRabbit run does NOT by itself block merge (advisory by default).
- [ ] CodeRabbit findings classified: {{blocking | valid non-blocking | incorrect/irrelevant}}
- [ ] Only unresolved blocking CodeRabbit findings block merge: {{none | list}}

## Unresolved Non-Outdated Threads at Merge

- Count: {{0 | N}}
- List: {{thread IDs or summaries, or "None"}}

## Review Metadata

- [ ] Language accuracy reviewed (human-language-reviewer)
- [ ] Script provenance reviewed (human-script-verifier), where applicable
- [ ] Teaching accuracy reviewed (human-teaching-reviewer), where applicable
- [ ] Lesson loop / Travel Quest reviewed (human-teaching-reviewer), where applicable
- [ ] Regional usage reviewed (human-regional-reviewer), where applicable
- [ ] Source / license reviewed (human-source-reviewer), where applicable
- [ ] Scope compliance reviewed (maintainer)

## Post-Merge External GitHub-State Recheck

Named responsibility: {{NAME}}

- [ ] main contains the merge commit.
- [ ] The originating issue is closed.
- [ ] No duplicate implementation PR remains open.
- [ ] Downstream blocking issues have their dependency resolved.

## Verification

-
