# Chabiko | チャビコ

## What This Is

Chabiko is a website for Japanese speakers who want to learn Mandarin Chinese from zero
to practical use. The product language is Japanese. Chinese learning content supports both
Simplified and Traditional Chinese display, with path-based defaults: Taiwan travel content is
Traditional-first, while school, HSK, and general Mandarin paths may be Simplified-first. Chabiko
uses Japanese kanji familiarity as a bridge while explicitly warning about tones, pronunciation,
usage gaps, false friends, and Taiwan/Mainland differences.

## Core Value

Japanese learners can keep reading and practicing until they can use simple Chinese for their goal, with Taiwan travel readiness as the v1 differentiating spine.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Public web app presents beginner Mandarin learning paths for Japanese speakers.
- [ ] v1 positioning is grounded in prioritized Japanese learner personas and jobs-to-be-done.
- [ ] Product UI and explanations are Japanese-first.
- [ ] Chinese learning content supports Simplified / Traditional display switching from v1.
- [ ] Route defaults are path-based: Taiwan travel is Traditional-first; school, HSK, and general Mandarin paths may be Simplified-first.
- [ ] Content uses Chinese text, pinyin, Japanese explanations, and goal-first examples.
- [ ] Content metadata handles Japanese-native learner pain points such as tones, pinyin, kanji false friends, word order, complements, and Taiwan/Mainland usage.
- [ ] Learners can browse Mandarin/Japanese kanji-bridge vocabulary and sentences with explicit caution notes.
- [ ] Learners can practice with lightweight interactive exercises, including tone/pronunciation discrimination and Taiwan travel roleplay.
- [ ] Learners can see Taiwan travel readiness as practical can-do outcomes.
- [ ] External resources are curated with clear attribution and licensing notes.
- [ ] The repo contains GSD planning docs, GitHub issues, and collaboration rules.

### Out of Scope

- User accounts and cloud sync — not needed to prove the v1 learning experience.
- Paid courses or subscriptions — monetization can wait until content value is validated.
- Full dictionary replacement — Chabiko links and explains, it does not try to become Weblio, EDRDG, or CC-CEDICT.
- Speech recognition — useful later, but too much complexity for v1.
- Script-exclusive curriculum — v1 should not force all learners into Traditional-only or Simplified-only content.
- Mainland-Mandarin-only curriculum — v1 may support Simplified-first paths, but Taiwan travel remains a core differentiator.

## Context

- Target learner: Japanese speaker or Japanese-literate learner with little to no Mandarin background.
- Main use case: preparing for a Taiwan trip, with enough confidence to read signs, order food, ask simple questions, and recognize common words.
- Secondary use cases: school-credit support, HSK/general Mandarin study, service-industry/business encounters, study-abroad preparation, and Chinese media curiosity. These should inform v1 without erasing the Taiwan-travel spine.
- Content tone: entertaining, short, curiosity-driven, and easy to continue.
- Learning bridge: Japanese kanji knowledge is useful, but false friends and pronunciation gaps must be called out explicitly.
- Learning loop: every core lesson should move from recognizable kanji or goal hook to sound focus, chunk practice, and a concrete task.
- Motivation loop: progress should be framed as goal readiness by scenario, not only as completed lessons.
- Script strategy: support Simplified / Traditional switching globally; let the learning path decide the default display.
- Variant strategy: Taiwan travel content is Traditional-first and Taiwan-usage-first; HSK/general Mandarin content can be Simplified-first; variants appear when they help the learner, not as clutter.
- AI/tooling strategy: AI-assisted script conversion can speed up authoring, but production display must use reviewed canonical script fields or verified conversion output; unreviewed runtime conversion is not allowed for learner-facing Chinese content.
- Candidate public resources include official Taiwan learning/travel sites and open lexical data sources, but no third-party content should be copied until license and attribution are verified.
- Product language: Japanese for learner-facing explanations; Chinese content can be displayed in Simplified or Traditional; repo planning may be bilingual.

## Constraints

- **Product Language**: Japanese first — Japanese learners should not need Chinese or English UI to use Chabiko.
- **Script**: Dual-script support from v1 — Traditional and Simplified display should be switchable.
- **Path Defaults**: Taiwan travel is Traditional-first; school, HSK, and general Mandarin paths may default to Simplified.
- **Content Safety**: Third-party content requires license review — public repo and website must avoid copyright issues.
- **Stack**: Prefer static-first web implementation — content browsing should work without accounts or backend state.
- **Package Manager**: Prefer pnpm for JS/TS implementation — this is a greenfield web project.
- **Design**: Use `design-taste-frontend` before page design — frontend should be polished, mobile-first, and content-led.
- **Automation**: High-impact GitHub automation stays disabled until explicitly approved.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Japanese explanations and UI first | The audience is Japanese learners, not generic English-speaking learners. | — Pending |
| Dual-script Chinese display from v1 | Japanese learners may arrive from school/HSK Simplified contexts or Taiwan Traditional contexts. | — Pending |
| Path-based script defaults | Travel learners need Traditional for Taiwan; school/HSK learners often expect Simplified. | — Pending |
| Japanese learner positioning drives v1 scope | Personas and JTBD prevent Chabiko from becoming a generic Chinese-learning app. | — Pending |
| Static-first v1 | Public learning content and local practice can validate value without accounts. | — Pending |
| Kanji similarity is a bridge, not a guarantee | Similar-looking words can mislead; false friends need explicit warnings. | — Pending |
| Lessons follow a task loop | Learners need visible usefulness and repeated retrieval, not only reading. | — Pending |
| Taiwan usage leads on the travel path, variants are selective elsewhere | Variant notes should help learners, not flood beginners with contrastive trivia. | — Pending |
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
*Last updated: 2026-07-08 after dual-script path-based strategy alignment*
