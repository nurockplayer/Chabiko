# Phase 1: Foundation, Content Model, and Japanese Learner Positioning - Context

**Gathered:** 2026-06-28
**Updated:** 2026-07-08 after dual-script path-based strategy alignment
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the technical, editorial, and product-positioning foundation: app scaffold, pnpm policy, Japanese learner personas/JTBD, Japanese-native learner pain-point taxonomy, dual-script and regional-variant strategy, content schemas, resource registry, README/license/collaboration docs, issue templates, and guardrails that prevent unlicensed third-party content from entering production content. It does not need to implement the full curriculum or practice modes.

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- **D-01:** Build a static-first public learning site before accounts or backend persistence.
- **D-02:** Japanese is the learner-facing product UI and explanation language.
- **D-03:** Support Simplified / Traditional Chinese display from v1 where content has both forms.
- **D-04:** Learning paths decide script defaults: Taiwan travel is Traditional-first; school, HSK, and general Mandarin paths may be Simplified-first.
- **D-05:** Japanese learner personas and jobs-to-be-done should guide v1 scope before content schemas are locked.
- **D-06:** Taiwan travel remains the differentiating v1 spine unless persona/JTBD research produces a stronger priority.

### Content Model
- **D-07:** Lessons, vocabulary, sentences, practice items, and resources must be structured data, not hard-coded UI text.
- **D-08:** Content should support explicit script fields or verified conversion output for Simplified and Traditional Chinese where relevant.
- **D-09:** AI-assisted script conversion can speed up authoring, but production content must not rely on unreviewed runtime conversion; script forms displayed to learners must be authored or verified before release, with generated status tracked in review metadata.
- **D-10:** Vocabulary entries must support kanji bridge metadata and caution/false-friend notes.
- **D-11:** Content should support Japanese-native learner pain-point tags such as tone, pinyin pronunciation, kanji false friend, word order, measure word, complement, and Taiwan/Mainland usage.
- **D-12:** Source and review metadata are required fields where content can be externally derived.

### Variant Strategy
- **D-13:** Taiwan travel content is Traditional-first and Taiwan-usage-first.
- **D-14:** HSK, school, and general Mandarin content may default to Simplified Chinese.
- **D-15:** Simplified/Traditional display should be switchable globally where both forms exist.
- **D-16:** Regional or script variant notes should appear only when useful for learner understanding, not by default on every card.
- **D-17:** Taiwan-specific travel usage must be explicit where relevant.

### External Resources
- **D-18:** External resources can be linked and cited immediately, but copied/imported content needs license approval first.
- **D-19:** Treat CC-CEDICT, EDRDG/JMdict/KANJIDIC, KanjiVG, Unihan, official Taiwan learning/travel sites, TOCFL, and HSK references as candidates, not approved imports.

### Workflow
- **D-20:** Keep AGENTS.md and CLAUDE.md aligned on scope, Git, package manager, and content licensing rules.
- **D-21:** GitHub issues should map to roadmap deliverables and avoid hidden scope expansion.
- **D-22:** Minimal local content validation should exist before Phase 2 content production; Phase 4 can enforce it in CI.

### the agent's Discretion
- Choose the concrete app framework during Phase 1 planning, as long as it respects static-first and pnpm constraints.
- Choose exact schema validation library.
- Choose directory names for content files.
- Choose the final taxonomy labels as long as they represent Japanese-native learner pain points clearly.
- Choose the storage shape for script variants, as long as the UI can switch and review metadata can track whether a form is authored, verified, or generated-and-verified; generated-only forms are not learner-facing production content.

</decisions>

<specifics>
## Specific Ideas

- The first useful screen should expose actual learning content quickly, not only a marketing hero.
- Japanese UI should remain stable while Chinese text display can switch Simplified / Traditional.
- Kanji bridge content should make learners feel "I can recognize this" while warning about pronunciation, tone, usage, and meaning traps.
- Taiwan travel scenarios should drive phrasebook grouping and Travel Quest readiness.
- HSK/general Mandarin paths can be Simplified-first without turning the whole product into Mainland-Mandarin-only.
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
- #18 — Dual-script and Taiwan/Mainland variant strategy.
- #19 — Taiwan travel scenario roleplay cards.
- #20 — Travel Quest readiness mapped to Japanese learner goals.
- #22 — Global Simplified / Traditional display toggle.

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
- Content validation should know about Japanese-native learner pain-point metadata, script fields, variant strategy, and review/source metadata.

</code_context>

<deferred>
## Deferred Ideas

- Full audio library and speaker attribution workflow — v2 unless Phase 4 explicitly pulls in a small proof.
- Accounts, bookmarks, and cloud sync — v2 personalization.
- Speech recognition — explicitly out of v1 scope.
- Mainland-Mandarin-only curriculum — separate product/track only if research strongly supports it after v1 validation.

</deferred>

---

*Phase: 01-foundation-content-model*
*Context gathered: 2026-06-28; updated: 2026-07-08*
