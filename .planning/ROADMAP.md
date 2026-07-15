# Roadmap: Chabiko | チャビコ

## Overview

Build Chabiko from a public planning repo into a useful static-first learning site for Japanese speakers learning Mandarin for practical goals. The product UI is Japanese-first, while Chinese learning content supports Simplified / Traditional switching. Taiwan travel content is Traditional-first; school, HSK, and general Mandarin paths may be Simplified-first. The roadmap starts with source-of-truth docs, Japanese learner positioning, dual-script content architecture, and resource governance, then ships seed lessons and vocabulary, adds learner-facing UI, practice interactions, and Travel Quest readiness, and finishes v1 with deployment, quality gates, and review workflows.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work.
- Decimal phases (1.1, 2.1, 2.2): Urgent insertions, marked INSERTED.

- [ ] **Phase 1: Foundation, Content Model, and Japanese Learner Positioning** - Create the app foundation, define Japanese learner personas and pain-point metadata, decide dual-script and regional-variant handling, build content schemas, seed the resource registry, and align collaboration guardrails.
- [x] **Phase 1.1: First Learner-Facing Vertical Slice (INSERTED)** - Connect the learner shell to one real Taiwan-travel lesson page before the full Phase 2 dataset and Phase 3 UI expansion.
- [ ] **Phase 2: Japanese-Learner Content Seeds** - Write v1 seed lessons, kanji bridge / false-friend vocabulary, Taiwan travel phrasebook content, and review metadata with Simplified / Traditional support where relevant.
- [ ] **Phase 3: Learning Experience, Practice, and Travel Readiness** - Build the learner-facing pages, goal paths, script switching, filters, phrase navigation, roleplay, tone/pronunciation practice, local progress, and Travel Quest readiness system.
- [ ] **Phase 4: Quality Gates, Review Workflow, and Preview Deploy** - Add CI, previews, review checklists, and public contribution workflow.

## Phase Details

### Phase 1: Foundation, Content Model, and Japanese Learner Positioning
**Goal**: Establish the technical, editorial, and product-positioning foundation for a static-first Chabiko site aimed at Japanese speakers.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, POS-01, POS-02, POS-03, SCRIPT-03, RES-01, RES-02
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Repo has README, license, AGENTS.md, CLAUDE.md, issue templates, and project planning docs.
  2. App scaffold exists with pnpm policy and no non-pnpm lockfiles.
  3. Japanese learner personas and jobs-to-be-done are prioritized for v1.
  4. Content schemas define required fields for lessons, vocabulary, sentences, resources, Simplified / Traditional script fields, Japanese-native learner pain points, regional usage, and review/source metadata.
  5. Resource registry tracks owner, URL, license/reuse status, and notes for candidate external resources.
  6. Production content cannot include unapproved third-party copied material.
**Plans**: 6 plans

Plans:
- [x] 01-01: Scaffold app and package-manager baseline. (#1)
- [x] 01-02: Define Japanese learner personas and JTBD. (#13)
- [ ] 01-03: Add Japanese-native pain-point taxonomy. (#14)
- [ ] 01-04: Define dual-script and Taiwan/Mainland variant strategy. (#18)
- [x] 01-05: Define content schemas and seed resource registry. (#2)
- [ ] 01-06: Align collaboration docs, issue templates, and content licensing guardrails. (#3)

### Phase 1.1: First Learner-Facing Vertical Slice (INSERTED)
**Goal**: Prove one complete Japanese-first learner journey from the home page into a real, structured Taiwan-travel lesson before scaling content and UI breadth.
**Depends on**: Completed app scaffold in #1
Phase 1.1 may begin once #1 is completed and the referenced validated seed content is available. The remaining Phase 1 plans (#13, #14, #18, and #3) and completion of the full Phase 2 dataset are non-blocking for #42.
**Does not depend on**: Completion of the full Phase 2 content dataset
**Requirements**: LEARN-03 vertical-slice subset
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. The home-page Taiwan travel entry opens a generated `/lessons/lesson-001/` route without a 404.
  2. The lesson page renders existing validated repository content instead of duplicated hard-coded presentation data.
  3. The available lesson-loop sections use Japanese-first labels and remain usable on mobile and desktop.
  4. Optional or unavailable lesson data is handled safely without empty UI sections or build crashes.
  5. This insertion does not implement the full goal-path behavior from #17, script switching from #22, or the complete learner-facing surfaces from #7.
**Plans**: 1 plan

Plans:
- [x] 01.1-01: Add Taiwan travel entry and first content-backed lesson page. (#42)

### Phase 2: Japanese-Learner Content Seeds
**Goal**: Create the first useful body of structured learner content for Japanese speakers, with path-appropriate Simplified / Traditional defaults.
**Depends on**: Phase 1
**Requirements**: LEARN-01, LEARN-02, LEARN-04, ONYOMI-01, ONYOMI-02, TRAVEL-01, TRAVEL-02, QUAL-01
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. At least 10 beginner lessons exist with Japanese hooks, learner outcomes, Chinese examples in supported script fields, pinyin, sound focus, and review prompts.
  2. Lessons are can-do/task-based and use Japanese explanations rather than generic textbook chapter framing.
  3. Kanji bridge and false-friend editorial rules exist before or alongside the vocabulary dataset.
  4. At least 50 kanji bridge vocabulary entries exist with caution metadata, examples, Japanese-native pain-point tags, and Simplified / Traditional support where relevant.
  5. At least 30 Taiwan travel phrases exist across six travel scenarios, defaulting to Traditional Chinese while allowing Simplified display, with usage notes and review/source metadata.
  6. Core lessons follow the Chabiko lesson loop documented in `docs/strategy/learning-and-motivation-strategy.md`.
**Plans**: 4 plans

Plans:
- [ ] 02-01: Draft Japanese beginner Mandarin lesson sequence with path-aware script support. (#4)
- [ ] 02-02: Build Japanese false-friend and kanji bridge rules. (#16)
- [ ] 02-03: Build kanji bridge vocabulary dataset. (#5)
- [ ] 02-04: Build Taiwan travel phrasebook dataset. (#6)

### Phase 3: Learning Experience, Practice, and Travel Readiness
**Goal**: Turn structured content into a polished mobile-first learning experience with Japanese UI, goal paths, script switching, lightweight practice, and practical readiness.
**Depends on**: Phase 2
**Requirements**: LEARN-03, PATH-01, PATH-02, SCRIPT-01, SCRIPT-02, ONYOMI-03, TRAVEL-03, TRAVEL-04, HSK-01, HSK-02, PRACT-01, PRACT-02, PRACT-03, PRACT-04, PRACT-05, MOTIV-01, MOTIV-02, MOTIV-03
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Learner can choose a goal-based path, with each path defining its own Simplified / Traditional default.
  2. Learner can switch Simplified / Traditional display where both forms exist without changing the Japanese UI.
  3. Learner can browse lessons, vocabulary, and phrasebook on mobile and desktop without text overlap.
  4. Learner can filter or navigate vocabulary by category, caution, Japanese-native pain point, and travel context.
  5. Learner can move from a travel phrase to related vocabulary, lesson context, roleplay, and practice.
  6. Learner can complete recognition, listening or tone discrimination, recall, and scenario roleplay practice with feedback and retry.
  7. Learner can see travel readiness by practical can-do scenario rather than only lesson count or generic streaks.
  8. Useful practice state persists locally where appropriate.
**Plans**: 9 plans

Plans:
- [ ] 03-01: Add learning paths by goal. (#17)
- [ ] 03-02: Build lesson, vocabulary, and phrasebook pages. (#7)
- [ ] 03-03: Add global Simplified / Traditional display toggle. (#22)
- [ ] 03-04: Build cross-linking and filters. (#8)
- [ ] 03-05: Design Mandarin tone and pronunciation training loop. (#15)
- [ ] 03-06: Add scenario roleplay cards for Taiwan travel encounters. (#19)
- [ ] 03-07: Build practice interactions and local progress. (#9)
- [ ] 03-08: Map Travel Quest readiness to Japanese learner goals. (#20)
- [ ] 03-09: Build Travel Quest and readiness motivation system. (#12)

### Phase 4: Quality Gates, Review Workflow, and Preview Deploy
**Goal**: Make v1 reliable enough for public iteration and community/content contribution.
**Depends on**: Phase 3
**Requirements**: FOUND-04, QUAL-01, QUAL-02
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. CI validates build, lint, tests, content schemas, and accidental non-pnpm lockfiles.
  2. Deployment preview exists for PRs.
  3. Content review checklist covers Simplified/Traditional accuracy, pinyin, Japanese naturalness, Taiwan usage, Japanese-native pain-point metadata, kanji bridge caution, and source metadata.
  4. Contribution workflow explains how to propose content without copyright violations.
  5. Minimal local content validation already exists before Phase 2 content production; Phase 4 turns it into CI enforcement.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Add CI, content validation, and preview deploy. (#10)
- [ ] 04-02: Add contributor docs and review workflow. (#11)

## Progress

**Execution Order:**
Roadmap display order: 1 -> 1.1 -> 2 -> 3 -> 4.
Phase 1.1 is an inserted scheduling exception: #42 may begin after its explicit prerequisite is complete and does not wait for the remaining Phase 1 plans or the full Phase 2 dataset.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Content Model, and Japanese Learner Positioning | 3/6 | In progress | - |
| 1.1 First Learner-Facing Vertical Slice (INSERTED) | 1/1 | Complete | 2026-07-13 |
| 2. Japanese-Learner Content Seeds | 0/4 | Not started | - |
| 3. Learning Experience, Practice, and Travel Readiness | 0/9 | Not started | - |
| 4. Quality Gates, Review Workflow, and Preview Deploy | 0/2 | Not started | - |
