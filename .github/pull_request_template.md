## Source of Truth

Closes #<issue-number>

> 此行為獨立行、非 checkbox。必須填寫完整引用（含 `Closes` 與 issue number），不得只寫裸 issue number。沒有對應 issue 時先建立 issue。

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

## Independent Review

- [ ] DeepSeek Pro reviewer: No blocking findings.
- [ ] Codex final review passed (where applicable).

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

