# Domain Docs

## Selected layout

**Single-context.** Domain vocabulary belongs in root `CONTEXT.md`; architectural decisions belong in `docs/adr/`.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` entries that touch the area being changed.

If these files do not exist, proceed silently. `/domain-modeling` creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue, proposal, hypothesis, or test, use the term defined in `CONTEXT.md`. If the concept is absent, reconsider whether the terminology is appropriate or note the gap for `/domain-modeling`.

## Flag ADR conflicts

Explicitly surface output that contradicts an existing ADR rather than silently overriding it.
