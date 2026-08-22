# Chabiko Documentation Index

This directory contains active contracts, implementation guidance, research, and historical evidence. File location alone does not make a document authoritative.

## Authority classes

### Canonical / active contract

Use these when a current GitHub issue references them or when they define the shipped contract for their domain.

- `../AGENTS.md` — repository execution, validation, review, and source-of-truth policy.
- `design/reference-family-389.md` — frozen A1 Editorial Calm learner-facing visual contract.
- `design/token-contract.json` — deployed A1 token/theme compatibility contract and migration status.
- `content/content-review-workflow.md` — content review and promotion workflow.
- Domain contracts/specifications explicitly named by the current GitHub issue.

The current GitHub issue may name additional canonical material. Follow its scope rather than reading every document in the repository.

### Current implementation evidence

Current merged code, schemas, validators, and tests are the implementation reality when a higher-priority issue or contract does not define the disputed behavior. They do not override an explicit product or safety decision.

### Historical / superseded

Historical documents remain useful for provenance and rationale but are not current execution authority unless a live issue explicitly reactivates them.

Examples:

- `.planning/` — original project planning snapshots and phase records. See `../.planning/README.md`.
- `design/approved-direction.md` — historical Direction C selection record, superseded by A1 as visual direction.
- `design/design-contract.md` — historical Direction C production implementation snapshot.
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