# Chabiko Documentation Index

This directory contains active contracts, implementation guidance, research, and historical evidence. File location alone does not make a document authoritative.

## Authority classes

### Canonical / active contract

`AGENTS.md` is the always-active repository execution policy. Domain contracts below become higher-priority execution authority only when the current GitHub issue explicitly references or adopts them, matching the precedence in `AGENTS.md`.

- `../AGENTS.md` — always-active repository execution, validation, review, and source-of-truth policy.
- `product/v2-reference-authority.md` — isolated V2 consumer UX reference authority; explicitly supersedes the listed V1/A1 product and composition constraints for `/v2-reference/` without changing their production authority.
- `design/reference-family-389.md` — A1 Editorial Calm learner-facing visual contract; authoritative for work that explicitly adopts/references the A1 contract.
- `design/token-contract.json` — deployed A1 token/theme compatibility contract and migration status; authoritative when the current issue references that token/theme contract.
- `content/content-review-workflow.md` — content review and promotion workflow; authoritative for issues that invoke the review/promotion workflow.
- Domain contracts/specifications explicitly named by the current GitHub issue.

This index classifies documentation; it does not itself elevate a domain document above the precedence in `AGENTS.md`. Follow the current issue's scope rather than reading every document in the repository.

### Current implementation evidence

Current merged code, schemas, validators, and tests are the implementation reality when a higher-priority issue or explicitly activated contract does not define the disputed behavior. They do not override an explicit product or safety decision.

### Historical / superseded

Historical documents remain useful for provenance and rationale but are not current execution authority unless a live issue explicitly reactivates a specific historical rule.

Examples:

- `.planning/` — original project planning snapshots and phase records. See `../.planning/README.md`.
- `design/approved-direction.md` — historical Direction C selection record, superseded by A1 as visual direction.
- `design/design-contract.md` — historical Direction C production implementation snapshot.
- `design/component-contract.md` — historical PR #165 Direction C component/DOM responsibility snapshot; current component behavior comes from merged code and live issue-owned contracts.
- `design/responsive-contract.md` — historical PR #165 responsive evidence/implementation snapshot; current responsive requirements come from merged code and explicitly adopted A1/live contracts.
- `design/figma-handoff.md` — historical PR #165 handoff record; no current Figma link or Figma-derived execution authority exists unless a live issue explicitly adopts a new scoped artifact.
- `design/direction-review.md`, earlier design evidence, and closed-issue implementation records.

Do not delete historical evidence merely because it is superseded.

### Evidence

Directories such as `design/evidence/` and committed review artifacts prove what was inspected or validated at a point in time. Evidence supports a contract or verdict; it does not independently define new product behavior.

### Draft / research / strategy

Research, strategy, exploratory prototypes, drafts, and proposals inform decisions but are non-authoritative unless a current issue or accepted decision explicitly adopts them.

## Conflict rule

Use the precedence in `../AGENTS.md`. If two active sources materially disagree, stop expanding implementation and report the conflict instead of silently choosing the newer-looking file.

## Status maintenance

When a migration or major initiative finishes, update status metadata in the existing canonical document or tracking issue. Do not create a second roadmap or a duplicate project-state ledger.
