# ADR 0001: Static-First v1

## Status

Accepted for v1 planning.

## Context

Chabiko's first validation target is public learning content for Japanese speakers preparing
for Taiwan travel. The core risk is whether the content, explanations, and practice loop are
useful enough to continue reading.

## Decision

Build v1 as a static-first web app with structured content files and no required account system.

## Consequences

- Faster public launch and simpler deployment.
- Content review can happen in GitHub PRs.
- Local practice state is acceptable for v1.
- Backend, accounts, and cloud sync are deferred until value is validated.

