# Requirements: Chabiko | チャビコ

**Defined:** 2026-06-28
**Core Value:** Japanese learners can keep reading and practicing until they can use simple Chinese for their goal, with Taiwan travel readiness as the v1 differentiating spine.

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: Repo contains a public-ready README, license, GitHub issue templates, and aligned AGENTS.md/CLAUDE.md.
- [ ] **FOUND-02**: Web app scaffold uses the detected project package-manager policy and does not introduce non-pnpm lockfiles.
- [ ] **FOUND-03**: Content files have schemas that require Simplified Chinese, Traditional Chinese, pinyin, Japanese explanation, category, Japanese-native learner pain-point metadata, and review/source metadata where relevant.
- [ ] **FOUND-04**: CI validates build, lint, tests, content schema, and accidental non-pnpm lockfiles.

### Product Positioning

- [ ] **POS-01**: Japanese learner personas and jobs-to-be-done are documented and prioritized for v1.
- [ ] **POS-02**: Content and practice metadata can represent Japanese-native learner pain points such as tones, pinyin pronunciation, kanji false friends, word order, measure words, complements, and Taiwan/Mainland usage.
- [ ] **POS-03**: Chabiko has an explicit dual-script and regional-variant strategy covering Simplified Chinese, Traditional Chinese, Taiwan usage, Mainland usage, pinyin, and when variant information should be hidden to avoid overload.

### Script Display

- [ ] **SCRIPT-01**: Learner can switch Chinese content display between Simplified and Traditional where both forms exist.
- [ ] **SCRIPT-02**: Learning paths define default script display: Taiwan travel is Traditional-first; HSK, school, and general Mandarin paths may be Simplified-first.
- [ ] **SCRIPT-03**: AI-assisted or automated script conversion is allowed only for authoring support, but production display must not rely on unreviewed runtime conversion; every learner-facing script form must be authored or verified before release, with review metadata tracking its status.

### Learning Content

- [ ] **LEARN-01**: Learner can follow a beginner path with at least 10 short lessons.
- [ ] **LEARN-02**: Each lesson has a Japanese hook, learner outcome, Chinese examples in the supported script fields, pinyin, Japanese explanation, sound focus, and review prompts.
- [ ] **LEARN-03**: Lesson pages are readable on mobile and desktop without text overlap.
- [ ] **LEARN-04**: Each core lesson follows the Chabiko lesson loop: hook, can-do goal, core sentence, chunk breakdown, kanji bridge, sound focus, mini practice, and task.

### Goal Paths

- [ ] **PATH-01**: Learner can start from a goal-based path, with Taiwan travel as the v1 differentiating path unless product research changes that decision.
- [ ] **PATH-02**: Goal paths can set script defaults without changing the Japanese-first product UI.

### Kanji Bridge

- [ ] **ONYOMI-01**: Learner can browse at least 50 Mandarin/Japanese kanji-bridge vocabulary entries.
- [ ] **ONYOMI-02**: Each entry includes Simplified Chinese, Traditional Chinese, pinyin, Japanese reading/explanation, category, example sentence, caution metadata, Japanese-native pain-point tags, and review/source metadata where relevant.
- [ ] **ONYOMI-03**: Learner can identify false friends, pronunciation traps, or usage differences from the vocabulary UI.

### Travel Use

- [ ] **TRAVEL-01**: Learner can browse at least 30 travel phrases across airport, transport, food, shopping, hotel, and emergency scenarios.
- [ ] **TRAVEL-02**: Travel pages include simple dialog examples that match Taiwan travel situations and default to Traditional Chinese while allowing Simplified display.
- [ ] **TRAVEL-03**: Learner can move from phrase to related vocabulary, lesson context, roleplay, and practice.
- [ ] **TRAVEL-04**: Learner can use scenario roleplay cards for practical Taiwan travel encounters and communication breakdown recovery.

### HSK / General Mandarin

- [ ] **HSK-01**: HSK or general Mandarin paths can default to Simplified Chinese while retaining Traditional display support where content exists.
- [ ] **HSK-02**: HSK/general content remains separate from Taiwan-travel readiness so exam-oriented scope does not dilute the travel path.

### Practice

- [ ] **PRACT-01**: Learner can complete at least three lightweight practice modes without logging in.
- [ ] **PRACT-02**: Practice gives immediate feedback and a retry path.
- [ ] **PRACT-03**: Practice progress can persist locally where useful without cloud accounts.
- [ ] **PRACT-04**: Practice modes cover recognition, listening or tone discrimination, recall, and scenario roleplay.
- [ ] **PRACT-05**: Practice can respect the learner's current script display while preserving pronunciation and meaning metadata.

### Motivation

- [ ] **MOTIV-01**: Learner can see travel readiness by scenario rather than only lesson completion.
- [ ] **MOTIV-02**: Learner can access at least one short recurring format such as Daily Taiwan Chinese or Travel Quest prompts.
- [ ] **MOTIV-03**: Readiness is framed as practical can-do outcomes for Japanese learners, such as ordering food, buying transport tickets, checking in, asking for help, and recovering from misunderstandings.

### Resources And Quality

- [ ] **RES-01**: Resource registry lists candidate external resources with URL, owner, license/reuse status, and notes.
- [ ] **RES-02**: No third-party content is imported into production content without documented license approval.
- [ ] **QUAL-01**: Content review checklist covers Simplified/Traditional accuracy, pinyin, Japanese naturalness, Taiwan usage, Japanese-native pain-point metadata, kanji bridge caution, and source metadata.
- [ ] **QUAL-02**: Deployment preview is available for every PR after app scaffold exists.

## v2 Requirements

### Audio

- **AUDIO-01**: Learner can play native-quality audio for vocabulary and sentences.
- **AUDIO-02**: Audio source, speaker, license, and attribution are tracked per file.

### Personalization

- **PERS-01**: Learner can bookmark words or phrases.
- **PERS-02**: Learner can review weak items across sessions.

### Community

- **COMM-01**: Contributors can propose content through a structured workflow.
- **COMM-02**: Maintainers can track content review status in GitHub.

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts | Not required to validate public learning content. |
| Payments | Monetization before content validation is premature. |
| Speech recognition | High complexity and not necessary for v1. |
| Full dictionary import | Chabiko is guided learning, not a dictionary replacement. |
| Auto-scraping external resources | Copyright and data quality risk. |
| Script-exclusive curriculum | v1 should not force every learner into Traditional-only or Simplified-only learning. |
| Mainland-Mandarin-only product | Simplified-first paths can exist, but Chabiko still keeps Taiwan travel as a differentiating path. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 4 | Pending |
| POS-01 | Phase 1 | Pending |
| POS-02 | Phase 1 | Pending |
| POS-03 | Phase 1 | Pending |
| SCRIPT-01 | Phase 3 | Pending |
| SCRIPT-02 | Phase 3 | Pending |
| SCRIPT-03 | Phase 1 | Pending |
| LEARN-01 | Phase 2 | Pending |
| LEARN-02 | Phase 2 | Pending |
| LEARN-03 | Phase 3 | Pending |
| LEARN-04 | Phase 2 | Pending |
| PATH-01 | Phase 3 | Pending |
| PATH-02 | Phase 3 | Pending |
| ONYOMI-01 | Phase 2 | Pending |
| ONYOMI-02 | Phase 2 | Pending |
| ONYOMI-03 | Phase 3 | Pending |
| TRAVEL-01 | Phase 2 | Pending |
| TRAVEL-02 | Phase 2 | Pending |
| TRAVEL-03 | Phase 3 | Pending |
| TRAVEL-04 | Phase 3 | Pending |
| HSK-01 | Phase 3 | Pending |
| HSK-02 | Phase 3 | Pending |
| PRACT-01 | Phase 3 | Pending |
| PRACT-02 | Phase 3 | Pending |
| PRACT-03 | Phase 3 | Pending |
| PRACT-04 | Phase 3 | Pending |
| PRACT-05 | Phase 3 | Pending |
| MOTIV-01 | Phase 3 | Pending |
| MOTIV-02 | Phase 3 | Pending |
| MOTIV-03 | Phase 3 | Pending |
| RES-01 | Phase 1 | Pending |
| RES-02 | Phase 1 | Pending |
| QUAL-01 | Phase 4 | Pending |
| QUAL-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-06-28*
*Last updated: 2026-07-08 after dual-script path-based strategy alignment*
