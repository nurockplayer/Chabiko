# Chabiko | チャビコ

## What This Is

Chabiko is a website for Japanese speakers who want to learn Mandarin Chinese from zero
to Taiwan travel usefulness. It teaches Traditional Chinese through short, fun, Japanese-led
content, practical travel situations, and lists of Mandarin words/sentences that feel close
to Japanese on-yomi patterns.

## Core Value

Japanese learners can keep reading and practicing until they can use simple Chinese in Taiwan travel situations.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Public web app presents beginner Mandarin learning paths for Japanese speakers.
- [ ] Content uses Traditional Chinese, pinyin, Japanese explanations, and travel-first examples.
- [ ] Learners can browse Mandarin/Japanese on-yomi-similar vocabulary and sentences.
- [ ] Learners can practice with lightweight interactive exercises.
- [ ] External resources are curated with clear attribution and licensing notes.
- [ ] The repo contains GSD planning docs, GitHub issues, and collaboration rules.

### Out of Scope

- User accounts and cloud sync — not needed to prove the v1 learning experience.
- Paid courses or subscriptions — monetization can wait until content value is validated.
- Full dictionary replacement — Chabiko links and explains, it does not try to become Weblio, EDRDG, or CC-CEDICT.
- Speech recognition — useful later, but too much complexity for v1.
- Simplified-Chinese-first curriculum — v1 target is Taiwan travel, so Traditional Chinese leads.

## Context

- Target learner: Japanese speaker or Japanese-literate learner with little to no Mandarin background.
- Main use case: preparing for a Taiwan trip, with enough confidence to read signs, order food, ask simple questions, and recognize common words.
- Content tone: entertaining, short, curiosity-driven, and easy to continue.
- Learning bridge: Japanese kanji knowledge is useful, but false friends and pronunciation gaps must be called out explicitly.
- Candidate public resources include official Taiwan learning/travel sites and open lexical data sources, but no third-party content should be copied until license and attribution are verified.
- Product language: Japanese for learner-facing explanations; Traditional Chinese for target language; repo planning may be bilingual.

## Constraints

- **Script**: Traditional Chinese first — Taiwan travel is the v1 use case.
- **Content Safety**: Third-party content requires license review — public repo and website must avoid copyright issues.
- **Stack**: Prefer static-first web implementation — content browsing should work without accounts or backend state.
- **Package Manager**: Prefer pnpm for JS/TS implementation — this is a greenfield web project.
- **Design**: Use `design-taste-frontend` before page design — frontend should be polished, mobile-first, and content-led.
- **Automation**: High-impact GitHub automation stays disabled until explicitly approved.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Traditional Chinese first | The concrete goal is Taiwan travel. | — Pending |
| Japanese explanations first | The audience is Japanese learners, not generic English-speaking learners. | — Pending |
| Static-first v1 | Public learning content and local practice can validate value without accounts. | — Pending |
| On-yomi similarity is a bridge, not a guarantee | Similar-looking words can mislead; false friends need explicit warnings. | — Pending |
| External resources are linked/attributed, not copied | Prevent copyright and license problems in a public repo. | — Pending |
| AGENTS.md and CLAUDE.md mirror policy-critical sections | Keeps Codex and Claude Code aligned on scope, Git, content, and package manager rules. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:
1. Full review of all sections.
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state.

---
*Last updated: 2026-06-28 after initialization*

