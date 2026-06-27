# Phase 1: Foundation and Content Model - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the technical and editorial foundation: app scaffold, pnpm policy, content schemas, resource registry, README/license/collaboration docs, issue templates, and guardrails that prevent unlicensed third-party content from entering production content. It does not need to implement the full curriculum or practice modes.

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- **D-01:** Build a static-first public learning site before accounts or backend persistence.
- **D-02:** Use Traditional Chinese as the primary Chinese script in v1.
- **D-03:** Japanese is the learner-facing explanation language.

### Content Model
- **D-04:** Lessons, vocabulary, sentences, and resources must be structured data, not hard-coded UI text.
- **D-05:** Vocabulary entries must support on-yomi bridge metadata and caution/false-friend notes.
- **D-06:** Source and review metadata are required fields where content can be externally derived.

### External Resources
- **D-07:** External resources can be linked and cited immediately, but copied/imported content needs license approval first.
- **D-08:** Treat CC-CEDICT, EDRDG/JMdict/KANJIDIC, KanjiVG, Unihan, official Taiwan learning/travel sites, and TOCFL as candidates, not approved imports.

### Workflow
- **D-09:** Keep AGENTS.md and CLAUDE.md aligned on scope, Git, package manager, and content licensing rules.
- **D-10:** GitHub issues should map to roadmap deliverables and avoid hidden scope expansion.

### the agent's Discretion
- Choose the concrete app framework during Phase 1 planning, as long as it respects static-first and pnpm constraints.
- Choose exact schema validation library.
- Choose directory names for content files.

</decisions>

<specifics>
## Specific Ideas

- The first useful screen should expose actual learning content quickly, not only a marketing hero.
- On-yomi bridge content should make learners feel "I can recognize this" while warning about pronunciation and meaning traps.
- Taiwan travel scenarios should drive phrasebook grouping.

</specifics>

<canonical_refs>
## Canonical References

### Project Scope
- `.planning/PROJECT.md` — Product framing, core value, constraints, key decisions.
- `.planning/REQUIREMENTS.md` — v1 requirements and traceability.
- `.planning/ROADMAP.md` — Phase boundaries and success criteria.

### Research
- `.planning/research/SUMMARY.md` — Stack, features, and resource strategy summary.
- `.planning/research/PITFALLS.md` — Copyright, false-friend, and UI pitfalls.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet. This is a greenfield project.

### Established Patterns
- GSD planning docs are present under `.planning/`.
- Project policy docs are mirrored in AGENTS.md and CLAUDE.md.

### Integration Points
- Future app scaffold should integrate with content files and validation scripts.

</code_context>

<deferred>
## Deferred Ideas

- Full audio library and speaker attribution workflow — v2 unless Phase 4 explicitly pulls in a small proof.
- Accounts, bookmarks, and cloud sync — v2 personalization.
- Speech recognition — explicitly out of v1 scope.

</deferred>

---

*Phase: 01-foundation-content-model*
*Context gathered: 2026-06-28*

