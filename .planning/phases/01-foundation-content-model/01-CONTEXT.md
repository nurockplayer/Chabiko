# Phase 1: Foundation, Content Model, and Japanese Learner Positioning - Context

**Gathered:** 2026-06-28
**Updated:** 2026-07-08 after Japanese learner research alignment
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the technical, editorial, and product-positioning foundation: app scaffold, pnpm policy, Japanese learner personas/JTBD, Japanese-native learner pain-point taxonomy, Taiwan Mandarin vs Mainland Mandarin handling, content schemas, resource registry, README/license/collaboration docs, issue templates, and guardrails that prevent unlicensed third-party content from entering production content. It does not need to implement the full curriculum or practice modes.

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- **D-01:** Build a static-first public learning site before accounts or backend persistence.
- **D-02:** Use Traditional Chinese as the primary Chinese script in v1.
- **D-03:** Japanese is the learner-facing explanation language.
- **D-04:** Japanese learner personas and jobs-to-be-done should guide v1 scope before content schemas are locked.
- **D-05:** Taiwan travel is the v1 default spine unless persona/JTBD research produces a stronger priority.

### Content Model
- **D-06:** Lessons, vocabulary, sentences, practice items, and resources must be structured data, not hard-coded UI text.
- **D-07:** Vocabulary entries must support kanji bridge metadata and caution/false-friend notes.
- **D-08:** Content should support Japanese-native learner pain-point tags such as tone, pinyin pronunciation, kanji false friend, word order, measure word, complement, and Taiwan/Mainland usage.
- **D-09:** Source and review metadata are required fields where content can be externally derived.

### Variant Strategy
- **D-10:** Traditional Chinese and Taiwan usage lead in v1.
- **D-11:** Simplified Chinese or Mainland usage notes should appear only when useful for learner understanding, not by default on every card.
- **D-12:** Taiwan-specific travel usage must be explicit where relevant.

### External Resources
- **D-13:** External resources can be linked and cited immediately, but copied/imported content needs license approval first.
- **D-14:** Treat CC-CEDICT, EDRDG/JMdict/KANJIDIC, KanjiVG, Unihan, official Taiwan learning/travel sites, and TOCFL as candidates, not approved imports.

### Workflow
- **D-15:** Keep AGENTS.md and CLAUDE.md aligned on scope, Git, package manager, and content licensing rules.
- **D-16:** GitHub issues should map to roadmap deliverables and avoid hidden scope expansion.
- **D-17:** Minimal local content validation should exist before Phase 2 content production; Phase 4 can enforce it in CI.

### the agent's Discretion
- Choose the concrete app framework during Phase 1 planning, as long as it respects static-first and pnpm constraints.
- Choose exact schema validation library.
- Choose directory names for content files.
- Choose the final taxonomy labels as long as they represent Japanese-native learner pain points clearly.

</decisions>

<specifics>
## Specific Ideas

- The first useful screen should expose actual learning content quickly, not only a marketing hero.
- Kanji bridge content should make learners feel "I can recognize this" while warning about pronunciation, tone, usage, and meaning traps.
- Taiwan travel scenarios should drive phrasebook grouping and Travel Quest readiness.
- Tone and pinyin practice can start with noticing/discrimination/retry loops before speech recognition exists.
- Goal-based paths should reuse shared content instead of creating separate duplicated curricula.

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

### Research-Driven Issues
- #13 — Japanese learner personas and JTBD.
- #14 — Japanese-native pain-point taxonomy.
- #15 — Mandarin tone and pronunciation training loop.
- #16 — Japanese false-friend and kanji bridge rules.
- #17 — Goal-based learning paths.
- #18 — Taiwan Mandarin vs Mainland Mandarin strategy.
- #19 — Taiwan travel scenario roleplay cards.
- #20 — Travel Quest readiness mapped to Japanese learner goals.

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
- Content validation should know about Japanese-native learner pain-point metadata and review/source metadata.

</code_context>

<deferred>
## Deferred Ideas

- Full audio library and speaker attribution workflow — v2 unless Phase 4 explicitly pulls in a small proof.
- Accounts, bookmarks, and cloud sync — v2 personalization.
- Speech recognition — explicitly out of v1 scope.
- Mainland-Mandarin-first curriculum — v2 or separate track after Taiwan-useful v1 is validated.

</deferred>

---

*Phase: 01-foundation-content-model*
*Context gathered: 2026-06-28; updated: 2026-07-08*
