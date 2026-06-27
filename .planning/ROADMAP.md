# Roadmap: Chabiko | チャビコ

## Overview

Build Chabiko from a public planning repo into a useful static-first learning site. The roadmap starts with source-of-truth docs and content architecture, then ships seed lessons and vocabulary, adds the learner-facing UI and practice interactions, and finishes v1 with deployment, quality gates, and review workflows.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work.
- Decimal phases (2.1, 2.2): Urgent insertions, marked INSERTED.

- [ ] **Phase 1: Foundation and Content Model** - Create the app foundation, content schemas, resource registry, and collaboration guardrails.
- [ ] **Phase 2: Seed Curriculum and Travel Content** - Write v1 seed lessons, vocabulary, phrasebook, and review metadata.
- [ ] **Phase 3: Learning Experience and Practice** - Build the learner-facing pages, filters, phrase navigation, motivation system, and no-login practice.
- [ ] **Phase 4: Quality, Deployment, and Contribution Flow** - Add CI, previews, review checklists, and public contribution workflow.

## Phase Details

### Phase 1: Foundation and Content Model
**Goal**: Establish the technical and editorial foundation for a static-first Chabiko site.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, RES-01, RES-02
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Repo has README, license, AGENTS.md, CLAUDE.md, issue templates, and project planning docs.
  2. App scaffold exists with pnpm policy and no non-pnpm lockfiles.
  3. Content schemas define required fields for lessons, vocabulary, sentences, and resources.
  4. Resource registry tracks owner, URL, license/reuse status, and notes for candidate external resources.
  5. Production content cannot include unapproved third-party copied material.
**Plans**: 3 plans

Plans:
- [ ] 01-01: Scaffold app and package-manager baseline. (#1)
- [ ] 01-02: Define content schemas and seed resource registry. (#2)
- [ ] 01-03: Align collaboration docs, issue templates, and content licensing guardrails. (#3)

### Phase 2: Seed Curriculum and Travel Content
**Goal**: Create the first useful body of learner content for Japanese speakers preparing for Taiwan travel.
**Depends on**: Phase 1
**Requirements**: LEARN-01, LEARN-02, LEARN-04, ONYOMI-01, ONYOMI-02, TRAVEL-01, TRAVEL-02
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. At least 10 beginner lessons exist with Japanese hooks, learner outcomes, Traditional Chinese examples, pinyin, and review prompts.
  2. At least 50 on-yomi bridge vocabulary entries exist with caution metadata and examples.
  3. At least 30 Taiwan travel phrases exist across six travel scenarios.
  4. Core lessons follow the Chabiko lesson loop documented in `docs/strategy/learning-and-motivation-strategy.md`.
  5. Every content item has review/source metadata.
**Plans**: 3 plans

Plans:
- [ ] 02-01: Draft beginner lesson sequence. (#4)
- [ ] 02-02: Build on-yomi bridge vocabulary dataset. (#5)
- [ ] 02-03: Build Taiwan travel phrasebook dataset. (#6)

### Phase 3: Learning Experience and Practice
**Goal**: Turn structured content into a polished mobile-first learning experience with lightweight practice.
**Depends on**: Phase 2
**Requirements**: LEARN-03, ONYOMI-03, TRAVEL-03, PRACT-01, PRACT-02, PRACT-03, PRACT-04, MOTIV-01, MOTIV-02
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Learner can browse lessons, vocabulary, and phrasebook on mobile and desktop without text overlap.
  2. Learner can filter or navigate vocabulary by category, caution, and travel context.
  3. Learner can move from a travel phrase to related vocabulary and lesson context.
  4. Learner can see travel readiness by scenario.
  5. Learner can complete recognition, listening or tone discrimination, recall, and scenario roleplay practice with feedback and retry.
  6. Useful practice state persists locally where appropriate.
**Plans**: 4 plans

Plans:
- [ ] 03-01: Build lesson, vocabulary, and phrasebook pages. (#7)
- [ ] 03-02: Build cross-linking and filters. (#8)
- [ ] 03-03: Build practice interactions and local progress. (#9)
- [ ] 03-04: Build Travel Quest and readiness motivation system. (issue pending)

### Phase 4: Quality, Deployment, and Contribution Flow
**Goal**: Make v1 reliable enough for public iteration and community/content contribution.
**Depends on**: Phase 3
**Requirements**: FOUND-04, QUAL-01, QUAL-02
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. CI validates build, lint, tests, content schemas, and accidental non-pnpm lockfiles.
  2. Deployment preview exists for PRs.
  3. Content review checklist covers Chinese accuracy, pinyin, Japanese naturalness, Taiwan usage, and source metadata.
  4. Contribution workflow explains how to propose content without copyright violations.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Add CI, content validation, and preview deploy. (#10)
- [ ] 04-02: Add contributor docs and review workflow. (#11)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Content Model | 0/3 | Not started | - |
| 2. Seed Curriculum and Travel Content | 0/3 | Not started | - |
| 3. Learning Experience and Practice | 0/4 | Not started | - |
| 4. Quality, Deployment, and Contribution Flow | 0/2 | Not started | - |
