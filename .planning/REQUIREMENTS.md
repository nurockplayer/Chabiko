# Requirements: Chabiko | チャビコ

**Defined:** 2026-06-28
**Core Value:** Japanese learners can keep reading and practicing until they can use simple Chinese in Taiwan travel situations.

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: Repo contains a public-ready README, license, GitHub issue templates, and aligned AGENTS.md/CLAUDE.md.
- [ ] **FOUND-02**: Web app scaffold uses the detected project package-manager policy and does not introduce non-pnpm lockfiles.
- [ ] **FOUND-03**: Content files have schemas that require Traditional Chinese, pinyin, Japanese explanation, category, and review/source metadata.
- [ ] **FOUND-04**: CI validates build, lint, tests, content schema, and accidental non-pnpm lockfiles.

### Learning Content

- [ ] **LEARN-01**: Learner can follow a beginner path with at least 10 short lessons.
- [ ] **LEARN-02**: Each lesson has a Japanese hook, learner outcome, Traditional Chinese examples, pinyin, and review prompts.
- [ ] **LEARN-03**: Lesson pages are readable on mobile and desktop without text overlap.

### On-yomi Bridge

- [ ] **ONYOMI-01**: Learner can browse at least 50 Mandarin/Japanese on-yomi-similar vocabulary entries.
- [ ] **ONYOMI-02**: Each entry includes Traditional Chinese, pinyin, Japanese reading/explanation, category, example sentence, and caution metadata.
- [ ] **ONYOMI-03**: Learner can identify false friends or usage differences from the vocabulary UI.

### Travel Use

- [ ] **TRAVEL-01**: Learner can browse at least 30 travel phrases across airport, transport, food, shopping, hotel, and emergency scenarios.
- [ ] **TRAVEL-02**: Travel pages include simple dialog examples that match Taiwan travel situations.
- [ ] **TRAVEL-03**: Learner can move from phrase to related vocabulary and lesson context.

### Practice

- [ ] **PRACT-01**: Learner can complete at least three lightweight practice modes without logging in.
- [ ] **PRACT-02**: Practice gives immediate feedback and a retry path.
- [ ] **PRACT-03**: Practice progress can persist locally where useful without cloud accounts.

### Resources And Quality

- [ ] **RES-01**: Resource registry lists candidate external resources with URL, owner, license/reuse status, and notes.
- [ ] **RES-02**: No third-party content is imported into production content without documented license approval.
- [ ] **QUAL-01**: Content review checklist covers Traditional Chinese accuracy, pinyin, Japanese naturalness, Taiwan usage, and source metadata.
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

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 4 | Pending |
| LEARN-01 | Phase 2 | Pending |
| LEARN-02 | Phase 2 | Pending |
| LEARN-03 | Phase 3 | Pending |
| ONYOMI-01 | Phase 2 | Pending |
| ONYOMI-02 | Phase 2 | Pending |
| ONYOMI-03 | Phase 3 | Pending |
| TRAVEL-01 | Phase 2 | Pending |
| TRAVEL-02 | Phase 2 | Pending |
| TRAVEL-03 | Phase 3 | Pending |
| PRACT-01 | Phase 3 | Pending |
| PRACT-02 | Phase 3 | Pending |
| PRACT-03 | Phase 3 | Pending |
| RES-01 | Phase 1 | Pending |
| RES-02 | Phase 1 | Pending |
| QUAL-01 | Phase 4 | Pending |
| QUAL-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-06-28*
*Last updated: 2026-06-28 after initial roadmap*

