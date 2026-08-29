# Content Review Workflow

**Status:** Draft for #11
**Last updated:** 2026-07-24
**Alignment:** #6 Content Outcome, #18 Dual-Script and Regional Variant Strategy, #119 AI-Assisted Authoring Pipeline

---

## 1. Purpose

This document defines how human contributors review Chabiko content. It covers the review artifact format, per-dimension checklists, and rules for determining when a prior approval remains valid after content changes.

This document **does not** define the AI-assisted authoring pipeline. The seven-stage pipeline (Gemini candidate generation → maintainer freeze → Flash implementation → Pro review → human language review → Codex final review) is documented in [ai-assisted-authoring-workflow.md](ai-assisted-authoring-workflow.md). This workflow fills in the human review stages that the pipeline references but does not detail.

### Relationship to #119 Pipeline

This workflow is referenced by Stage 6 (Human Language Review and Publication Status) of the #119 pipeline. The pipeline defines *when* human review is required; this document defines *how* to conduct and record it.

| Pipeline Stage | Owner | Where Human Review Is Defined |
|----------------|-------|-------------------------------|
| Stage 1–2 | Maintainer, Gemini | Pipeline document (§2) |
| Stage 3 | Maintainer | Pipeline document (§2, §4.2) |
| Stage 4 | DeepSeek Flash | Pipeline document (§2, §4.3) |
| Stage 5 | DeepSeek Pro reviewer | Pipeline document (§2, §4.4) |
| **Stage 6** | **Human language reviewer** | **This document (§3–§7)** |
| Stage 7 | Codex | Pipeline document (§2) |

---

## 2. Review Dimensions

Content review operates along independent dimensions. Each dimension has its own controlled values and approval criteria. A single review artifact may cover multiple dimensions, but each dimension's result must be recorded separately.

### 2.1 reviewStatus (workflow stage)

| Value | Meaning | Eligible to assign |
|-------|---------|-------------------|
| `draft` | Initial or in-progress. Not production-ready. | Any actor |
| `reviewed` | Human reviewer has approved. Eligible for path assignment. | Human reviewer only |
| `published` | Live in production for a specific path. | Maintainer / PM |

### 2.2 Script Provenance (per script form)

| Value | Meaning | Eligible to assign |
|-------|---------|-------------------|
| `authored` | Written or reviewed by a human content author. | Human author |
| `verified` | Initially generated or drafted, then human-verified for correctness. | Human verifier |
| `generated` | Produced by an automated process. Not yet human-verified. | Any actor |
| `unavailable` | This script form does not exist for this content item. | Human editor |

### 2.3 Resource reviewStatus

Resource records have their own `reviewStatus` field, separate from content reviewStatus and license status.

| Value | Meaning | Eligible to assign |
|-------|---------|-------------------|
| `candidate` | Initial state. Not yet reviewed. | Any actor |
| `under-review` | Review in progress. | Maintainer |
| `approved` | Human source reviewer has approved. Production import allowed. | `human-source-reviewer` |
| `rejected` | License does not permit use. No production import. | `human-source-reviewer` |

### 2.4 Resource licenseStatus

Resource records also carry a `licenseStatus` field that tracks the legal status of the license itself, independent of the workflow reviewStatus.

| Value | Meaning |
|-------|---------|
| `unknown` | License status has not been determined. Blocked from production. |
| `needs-review` | License status known but not yet reviewed by a human. Blocked from production. |
| `approved` | License permits use per project policy. |
| `restricted` | License permits limited use; attribution or other conditions apply. |
| `prohibited` | License does not permit use. |

### 2.5 Dimension Separation Rules

The following rules must never be violated:

- `draft` / `reviewed` / `published` are **reviewStatus values**. They must never be used as script provenance values or as license statuses.
- `authored` / `verified` / `generated` / `unavailable` are **script provenance values**. They must never be used as reviewStatus values or as license statuses.
- `candidate` / `under-review` / `approved` / `rejected` are **resource reviewStatus values**. They must never be used as content reviewStatus, script provenance, or license status values.
- `unknown` / `needs-review` / `approved` / `restricted` / `prohibited` are **resource licenseStatus values**. They must never replace content reviewStatus, script provenance, or resource reviewStatus.
- A record can have `reviewStatus: "draft"` while one script form is `"authored"` and the other is `"generated"`. These are independent facts.
- Moving a record from `draft` to `reviewed` does not change any script provenance value. Changing a script form from `generated` to `verified` does not change reviewStatus.

### 2.6 Reusable content graph boundary

Chabiko may derive a read-only learning-content graph from the canonical
collection files so HSK and Taiwan Travel paths can compose shared learning
objects without copying records. Graph indexing is not a review action:

- Resolving a `ContentRef`, mounting a record in another path view, or adding a
  graph relationship never changes `reviewStatus`, script provenance, source
  metadata, rights status, or teacher-review decisions.
- A draft record remains draft when indexed. Learner surfaces must continue to
  apply their existing production-eligibility gates, and a graph must not be
  used to bypass an HSK rights or allowed-use blocker.
- A content change, path-membership change, or relationship change that alters
  learner-facing composition must be included in the reviewed item list and
  exact review version for the relevant review artifact.
- Stale or duplicate references are validation failures, not reasons to infer,
  convert, or silently replace a missing record.

The graph contract and loader are documented in
`docs/content/content-model-draft.md`. Its derived nature preserves the
existing teacher-review campaign and semantic fingerprint boundary: review
artifacts continue to identify the exact source records and review-relevant
fields, while graph construction only reads those records.

---

## 3. Review Artifact Requirements

Every human review of Chabiko content must produce a review artifact. The artifact may be a comment on a GitHub issue/PR, a file in the repository, or an external record linked from a GitHub thread. Regardless of format, it must contain all of the following fields.

### 3.1 Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Reviewer identity** | Name or handle of the person who performed the review | `@nurockplayer` |
| **Reviewer role** | The specific role under which this review was performed (must be one of the roles in §4) | `human-language-reviewer` |
| **Review date** | ISO 8601 date when the review was completed | `2026-07-24` |
| **Reviewed items** | Exact record IDs, file paths, or commit/PR reference for the reviewed content | `voc-taiwan-003, voc-taiwan-004` or `src/content/phrasebook/travel.json` at `abc1234` |
| **Review version** | Version identifier (commit hash, PR number, or file hash) of the reviewed content | `abc1234` |
| **Review outcome** | One of: `accepted`, `rejected`, `needs-changes` | `accepted` |
| **Approval scope** | Which dimensions were approved (see §6 for scope types) | `learner-facing-strings`, `script-provenance` |
| **Unresolved issues** | Any concerns that were not addressed in this review | `toneNote for voc-tone-002 may be too generic; defer to authoring tool` |
| **Blocked content** | Any content that must not be published despite partial approval | `voc-region-003 (pinyin unverified)` |

### 3.2 Optional Fields

| Field | Description |
|-------|-------------|
| **Review artifact URL** | Link to the full artifact if stored externally |
| **Review notes** | Free-form notes about methodology, caveats, or follow-up tasks |
| **Reverified items** | List of previously-blocked items that were re-checked in this review |
| **Next review date** | If the review expires (e.g., temporary approval), the date when re-review is required |

### 3.3 Artifact Format (Checklist Template)

The following template can be copied into a GitHub issue, PR comment, or review document. Fill in all required fields before the review is considered complete. When a single artifact covers multiple scope types with different outcomes, record each scope type's outcome in the approval scope table below.

```markdown
## Review Artifact

**Reviewer identity:** {{NAME}}
**Reviewer role:** {{ROLE}}
**Review date:** {{YYYY-MM-DD}}
**Reviewed items:** {{RECORD_IDS or FILE_PATHS}}
**Review version:** {{COMMIT_HASH or PR_NUMBER}}
**Overall review outcome:** {{accepted | rejected | needs-changes}}

### Approval Scope

| Scope Type | Outcome |
|------------|---------|
| Learner-facing strings (Traditional, Simplified, pinyin, Japanese) | {{accepted / rejected / needs-changes / not-reviewed}} |
| Script provenance (traditionalStatus, simplifiedStatus) | {{accepted / rejected / needs-changes / not-reviewed}} |
| reviewStatus assignment | {{accepted / rejected / needs-changes / not-reviewed}} |
| Source / license metadata | {{accepted / rejected / needs-changes / not-reviewed}} |
| Pain-point tags | {{accepted / rejected / needs-changes / not-reviewed}} |
| Teaching accuracy (tone notes, false-friend warnings, grammar explanations) | {{accepted / rejected / needs-changes / not-reviewed}} |
| Regional usage accuracy (Taiwan / Mainland) | {{accepted / rejected / needs-changes / not-reviewed}} |
| Pronunciation guidance (toneNote, pinyin-pronunciation notes) | {{accepted / rejected / needs-changes / not-reviewed}} |
| Kanji bridge accuracy | {{accepted / rejected / needs-changes / not-reviewed}} |
| Content scope compliance (no out-of-scope additions) | {{accepted / rejected / needs-changes / not-reviewed}} |
| Lesson loop completeness and Travel Quest usefulness (lesson-loop-quest) | {{accepted / rejected / needs-changes / not-reviewed}} |

### Unresolved Issues

{{List any concerns not addressed in this review, or "None."}}

### Blocked Content

{{List any content that must not be published despite partial approval, or "None."}}

### Review Notes

{{Free-form notes.}}
```

---

## 4. Reviewer Roles

Each human review must be performed under one or more of the following roles. A single person may act in multiple roles, but each role's findings must be recorded separately in the review artifact.

| Role | Authority | Typical tasks |
|------|-----------|---------------|
| `human-language-reviewer` | Approves learner-facing strings for correctness and naturalness | Check Traditional/Simplified accuracy, pinyin, Japanese naturalness, tone notes |
| `human-script-verifier` | Promotes script provenance from `generated` to `verified` | Compare script forms against a reference; confirm no errors introduced by generation |
| `human-regional-reviewer` | Confirms Taiwan or Mainland usage accuracy | Verify vocabulary choice, pronunciation, and usage notes match the target region |
| `human-source-reviewer` | Approves source attribution and license metadata | Check license status, allowed use, attribution requirements |
| `human-teaching-reviewer` | Approves pedagogical accuracy and learner safety | Verify false-friend warnings, kanji bridge claims, pain-point tags, tone guidance |
| `maintainer` | Assigns `reviewed` → `published` status or merges content | Confirm all required reviews are complete, no blocked content remains |

**Important:** A single person performing multiple roles must record each role separately in the artifact (e.g., `human-language-reviewer` and `human-script-verifier` both performed by `@nurockplayer`). The `maintainer` role cannot approve language accuracy; that requires `human-language-reviewer`.

### 4.1 Per-dimension role evidence for Taiwan Travel Wave 1

The Taiwan Travel Wave 1 scope treats each dimension's ordered
`reviewerRoles` list as an authorization allowlist, not a suggestion. The
manifest and generated packet must keep the exact required role set for each
dimension. Missing, extra, duplicated, or reordered roles are validation
failures.

Each required role has its own evidence row with an independent outcome,
reviewer identity, ISO 8601 review date, reviewed `reviewVersion`, and findings.
A person acting in two roles must fill and retain both role rows; top-level or
global reviewer identity fields cannot substitute for either row. There is no
shared dimension outcome: multi-role dimensions may retain mixed role outcomes
without one role overwriting another. An `accepted`, `rejected`, or
`needs-changes` role outcome requires complete identity, a valid review date,
the exact current immutable `reviewVersion`, and findings. A `not-reviewed`
role must keep all evidence fields, including `reviewVersion`, null. Content,
graph, record, or scope-contract drift changes the immutable version and makes
evidence for the prior version invalid. Any pending or negative role keeps the
package non-promotable. Even when every required role is accepted, promotion
still requires a separate overall accepted decision and maintainer action. The
checked-in initial state keeps every role outcome `not-reviewed` and every
evidence value null.

The Wave manifest is also the canonical mutable input for the artifact's
separate `overallDecision`, `unresolvedIssues`, and `blockedContent` results.
`overallDecision` is null until a human records an attributed object containing
the canonical `outcome` (`accepted`, `rejected`, or `needs-changes`),
`reviewerIdentity`, canonical `reviewerRole`, ISO `reviewDate`, exact current
`reviewVersion`, and non-empty `findings`. It does not substitute for any
required per-role evidence row. Unresolved issues are trimmed non-empty notes,
while blocked content is identified by an exact in-scope lesson ID. The
checked-in initial state uses null and empty arrays. A canonical rebuild must
preserve these values and derive its pending-role summary from the per-role
outcomes; it must not restore placeholders or claim that completed roles remain
pending. An overall accepted decision is invalid while any required role is not
accepted or while unresolved/blocked entries remain. These mutable human
results and their version references do not change the immutable review
version, and none of them authorize production linking: promotion remains a
separate maintainer action.

For Taiwan Travel Wave 1, the canonical ordered dimension matrix is:

| Dimension ID | What it records | Required reviewer roles, in order |
|---|---|---|
| `natural-taiwan-mandarin` | Traditional Mandarin naturalness and Taiwan usage | `human-language-reviewer`, `human-regional-reviewer` |
| `natural-japanese-explanation` | Japanese explanation naturalness | `human-language-reviewer` |
| `review-status` | Whether the candidate `reviewStatus` assignment is correct for draft → reviewed | `human-language-reviewer` |
| `teaching-accuracy` | General teaching accuracy, including grammar, tone explanations, false-friend guidance, and pain-point tags | `human-teaching-reviewer` |
| `lesson-loop-usefulness` | Lesson-loop completeness and travel usefulness | `human-teaching-reviewer` |
| `pronunciation-guidance` | Pinyin and pronunciation guidance | `human-language-reviewer`, `human-teaching-reviewer` |
| `kanji-bridge-accuracy` | Kanji bridge accuracy | `human-teaching-reviewer` |
| `exercise-quality` | Review-prompt quality | `human-teaching-reviewer` |
| `graph-and-scope-correctness` | Graph, identity, order, and issue-scope correctness | `maintainer` |
| `source-and-script-provenance` | Source metadata and generated-script provenance | `human-source-reviewer`, `human-script-verifier` |

The Wave package uses `human-language-reviewer` for the `review-status`
draft → reviewed gate. The separate reviewed → published transition remains a
maintainer action. `teaching-accuracy` is not interchangeable with the more
specific lesson-loop, pronunciation, kanji-bridge, or exercise dimensions;
each retains its own role outcome and evidence row.

---

## 5. Review Checklists

### 5.1 Language Accuracy Checklist

Covers Traditional Chinese, Simplified Chinese, pinyin, and Japanese explanations.

- [ ] Traditional Chinese characters are correct for the target region (Taiwan-standard 正體字)
- [ ] Simplified Chinese characters (when present) are correct per PRC standard
- [ ] No mixed-script errors (e.g., Traditional character in a Simplified string)
- [ ] Pinyin matches the Chinese text exactly (no invented or guessed readings)
- [ ] Tone marks are correct and placed on the correct vowel
- [ ] Japanese explanation is natural and appropriate for the target proficiency level
- [ ] Japanese explanation does not contain Chinese-language errors or unnatural phrasing
- [ ] No romanisation other than pinyin (e.g., no zhuyin/bopomofo unless explicitly required)
- [ ] Kana readings (when present) match the Japanese explanation

### 5.2 Script Provenance Checklist

- [ ] `traditionalStatus` is one of: `authored`, `verified`, `generated`
- [ ] `simplifiedStatus` (when `simplified` is present) is one of: `authored`, `verified`, `generated`
- [ ] `simplifiedStatus` when `simplified` is absent: must be `unavailable` or absent
- [ ] `authored` provenance is only used when a human wrote or completely rewrote the form
- [ ] `verified` provenance is only used when a human checked and corrected an AI-generated or converted form
- [ ] `generated` content is not displayed in production (provenance must be promoted to `verified` first)
- [ ] HSK and teacher-curriculum records do not use `generated` for either script form
- [ ] Script provenance promotion (`generated` → `verified` or `generated` → `authored`) has a named human verifier/author and recorded date

### 5.3 Teaching Accuracy Checklist

- [ ] Tone notes are actionable for a Japanese speaker, not generic descriptions
- [ ] Tone notes explain what a Japanese speaker would likely flatten or confuse
- [ ] False-friend warnings are specific: they state the Japanese meaning, the Chinese meaning, and why the confusion matters
- [ ] Kanji bridge notes do not overstate similarity (no claims of identity where only partial overlap exists)
- [ ] Pain-point tags are accurate and not over-applied (0–3 tags per item)
- [ ] `kanji-false-friend` tag is only applied when the learner would assume the Japanese meaning
- [ ] `same-kanji-different-meaning` tag is for individual characters, not compounds
- [ ] Pain-point tags are applied during review, not during initial drafting

### 5.4 Regional Usage Checklist

- [ ] Taiwan-specific vocabulary is correct for Taiwan Guoyu (臺灣國語)
- [ ] Mainland-specific vocabulary is correct for Putonghua (普通話)
- [ ] Regional contrast notes (when present) accurately describe the difference
- [ ] `taiwan-mainland-usage` tag is not applied to universal vocabulary
- [ ] `taiwan-mainland-usage` and `traditional-simplified` are not conflated (they are separate dimensions)
- [ ] Pronunciation differences (e.g., 垃圾 lèsè vs lājī) are noted where pedagogically useful
- [ ] Path-appropriate content is assigned to the correct path (Taiwan travel → Taiwan terms; HSK → Mainland terms)

### 5.5 Provenance and Source Checklist

- [ ] Every content record has a valid `source` object (or the content type does not require one)
- [ ] Source type is valid: `teacher-workbook`, `standard-reference`, `expert-authored`, `generated-with-review`, etc.
- [ ] Source notes (when present) are accurate and not misleading
- [ ] Resource `licenseStatus` is one of: `unknown`, `needs-review`, `approved`, `restricted`, `prohibited`
- [ ] Resource `reviewStatus` is one of: `candidate`, `under-review`, `approved`, `rejected`
- [ ] `licenseStatus: approved` or `restricted` may permit production import when `allowedUse`, human approval, and permission flags are compatible
- [ ] `licenseStatus: unknown`, `needs-review`, or `prohibited` requires `allowedUse` to be `reference-only` or `citation`
- [ ] `reviewStatus: rejected` requires `allowedUse` to be `reference-only` or `citation`
- [ ] Resource `reviewStatus: approved` is not sufficient alone for production import — the resource must also have compatible `licenseStatus`, `allowedUse`, named human reviewer approval, and consistent permission flags
- [ ] `productionImportAllowed` is consistent with `licenseStatus` and `allowedUse`
- [ ] Attribution requirements are correctly documented where needed
- [ ] **Unconfirmed license blocking**: When a resource's license has not been confirmed by `human-source-reviewer`:
  - `licenseStatus` must be `needs-review` (not `approved`, not `under-review` — `under-review` is a `reviewStatus` value, not a `licenseStatus`)
  - `productionImportAllowed` must be `false` or absent
  - Resource `reviewStatus` must be `candidate` or `under-review` (not `approved`)
  - `allowedUse` must be `reference-only` or `citation`
  - The resource may only be used as a candidate or reference, never imported into production content
  - Only a `human-source-reviewer` may approve production import after verifying license terms
  - If license status cannot be determined, the resource remains blocked; it must never be treated as usable by default

### 5.6 Content Scope Checklist

- [ ] All changes are within the issue scope
- [ ] No out-of-scope content was added
- [ ] No unrelated files were modified
- [ ] No production content, schema, validator, UI, dependency, or CI was modified unless explicitly in scope
- [ ] No duplicate content was introduced (compared to existing published or in-progress records)
- [ ] Coverage is complete per the issue specification, or gaps are explicitly deferred

### 5.7 Lesson Loop and Travel Quest Checklist

Covers lesson structure completeness, lesson-to-practice connections, and Travel Quest usefulness.

- [ ] Lesson includes a hook that engages the learner (scenario-before-rules)
- [ ] Lesson states a clear can-do goal (`canDoJa` / `learnerOutcomeJa`)
- [ ] Lesson provides a core sentence with chunk breakdown
- [ ] Kanji bridge notes (when present) are accurate and do not overstate similarity
- [ ] Sound focus section addresses a Japanese-native pronunciation pain point
- [ ] Mini practice or review prompts reinforce the lesson's core teaching point
- [ ] Practical task (`travelTask`) is concrete, actionable, and matches the target scenario
- [ ] `travelTask` specifies what the learner can actually say or do (not a generic "practice the lesson")
- [ ] Cross-links between lesson, vocabulary, phrasebook, practice, and roleplay/recovery flow are logical and consistent
- [ ] Travel Quest usefulness: the content bundle (lesson + vocabulary + practice) supports a real can-do outcome the learner would encounter in their target scenario
- [ ] Roleplay or recovery flow (when present) fills a realistic gap the learner might face (wrong order, lost, misunderstanding)
- [ ] Content bundle does not introduce contradictions or conflicting usage advice across linked items

### 5.8 Illustration Checklist

Covers illustration asset metadata, technical constraints, and rights review.

- [ ] Illustration `id` is non-empty and unique within its collection
- [ ] `vocabularyId` links to an existing teacher vocabulary record
- [ ] `assetPath` starts with `/assets/vocabulary/teacher-core-v1/` and ends with `.webp` or `.png`
- [ ] `assetPath` extension matches `mimeType` (`image/webp` → `.webp`, `image/png` → `.png`)
- [ ] `sourceChecksumSha256` is exactly 64 lowercase hexadecimal characters
- [ ] `width` and `height` are integers between 1 and 4096 (not boolean)
- [ ] `fileSizeBytes` is an integer between 1 and 1,500,000 (not boolean)
- [ ] `mimeType` is `image/webp` or `image/png`
- [ ] `altJa` is non-empty Japanese alt text
- [ ] Illustration `reviewStatus` is present and valid: `draft`, `reviewed`, or `published`
- [ ] Rights object uses the variant appropriate to the illustration's review status:
  - **Draft illustration** (`reviewStatus: "draft"`): may use either the full cleared-rights object (`basis: "commissioned-for-chabiko"` with all required permission fields) or the pending-rights object (`status: "pending"`, `source: "teacher-provided"`, `note`: non-empty). Pending rights do **not** claim public-display, redistribution, modification, attribution, or reuse permission.
  - **Reviewed or published illustration** (`reviewStatus: "reviewed"` or `"published"`): must use the full cleared-rights object (`basis: "commissioned-for-chabiko"`) with all required fields (`publicWebDisplay: true`, `staticAssetRedistribution: true`, `modificationScope: "technical-only"`, `attributionRequired`, `attributionText` if required, `reuseOutsideChabiko`). Pending rights are **not** valid at these statuses.
- [ ] When `attributionRequired` is `true`, `attributionText` is non-empty and present (cleared-rights variant only)
- [ ] Promotion from `draft` to `reviewed` or `published` requires replacing any pending-rights object with the full cleared-rights object and completing source-rights review by `human-source-reviewer`
- [ ] Draft illustrations may omit `illustrationRef` linkage; reviewed/published must have a valid link
- [ ] No orphan illustration records (every `vocabularyId` matches an existing vocabulary record)
- [ ] Rights and metadata have been reviewed by `human-source-reviewer` before promotion past `draft`

---

## 6. Approval Scope Types

When recording a review outcome, specify which of the following scope types are covered:

| Scope Type | What It Covers | Reviewed By |
|------------|----------------|-------------|
| `learner-facing-strings` | Traditional, Simplified, pinyin, Japanese explanation | `human-language-reviewer` |
| `script-provenance` | `traditionalStatus`, `simplifiedStatus` values per record | `human-script-verifier` |
| `review-status` | Whether `reviewStatus` is correctly `draft` or eligible for `reviewed` | `human-language-reviewer` or `maintainer` |
| `teaching-accuracy` | Tone notes, false-friend warnings, grammar explanations, pain-point tags | `human-teaching-reviewer` |
| `regional-accuracy` | Taiwan/Mainland vocabulary, pronunciation, and usage notes | `human-regional-reviewer` |
| `source-license` | Source attribution, license metadata, allowed use | `human-source-reviewer` |
| `pronunciation-guidance` | `toneNote`, pronunciation notes, pinyin contrasts | `human-language-reviewer` or `human-teaching-reviewer` |
| `kanji-bridge` | Kanji bridge accuracy, similarity claims, false-friend warnings | `human-teaching-reviewer` |
| `scope-compliance` | Issue scope alignment, no out-of-scope additions | `maintainer` |
| `lesson-loop-quest` | Lesson structure completeness, Travel Quest usefulness, cross-link consistency | `human-teaching-reviewer` |

A review that covers multiple scope types must list each separately. Partial approval is possible: e.g., `learner-facing-strings: accepted` while `script-provenance: needs-changes`.

---

## 7. Gate Invalidation

When content changes after a review, existing approvals may become invalid. This section defines which approvals are affected by which types of changes.

**Overlapping categories.** A single change may belong to multiple change categories. For example, rewriting `canDoJa` is both a Japanese explanation change and a lesson structure string change. When a change falls into multiple categories, combine the invalidation results from all applicable rows in §7.2 — the most restrictive result wins for each scope type. A scope marked **INVALIDATED** in any applicable row is invalidated, even if another row marks it Unaffected. You must not choose a single category to minimize the number of invalidated scopes.

### 7.1 Change Categories

| Category | Definition | Examples |
|----------|------------|----------|
| **Script form change (Traditional/Simplified text)** | Modification to `traditional` or `simplified` Chinese text | Correcting a Traditional character, replacing a Simplified form |
| **Pronunciation string change (pinyin/tone note)** | Modification to pinyin, `toneNote`, or pronunciation guidance | Updating tone marks, correcting pinyin romanisation, rephrasing pronunciation note |
| **Teaching string change (kanji bridge/false-friend)** | Modification to kanji bridge notes, false-friend cautions, or `caution` field | Correcting a false-friend warning, updating a kanji bridge similarity claim |
| **Lesson structure string change** | Modification to lesson hook, can-do goal, core sentence, chunks, `travelTask`, or cross-links | Rewriting the can-do goal, replacing core sentence examples, updating `travelTask` |
| **Japanese explanation change** | Modification to Japanese explanation text | Rephrasing Japanese explanation, correcting kana reading |
| **Script provenance change** | Modification to `traditionalStatus` or `simplifiedStatus` | Promoting `generated` → `verified`, demoting `verified` → `generated` |
| **Unauthorized reviewStatus modification** | Modification to `reviewStatus` field that is not an authorized transition per the artifact. Excludes: `draft` → `reviewed` by human reviewer with valid artifact, and `reviewed` → `published` by maintainer with all required approvals. | Resetting `reviewed` → `draft` without cause, promoting past `draft` without completing required review dimensions |
| **Teaching metadata change** | Modification to tone notes, cautions, false-friend warnings, pain-point tags | Adding a caution, correcting a kanji bridge note, adjusting pain point tags |
| **Regional metadata change** | Modification to regional usage notes or tags | Adding a Taiwan/Mainland contrast note, changing a regional tag |
| **Source/license change** | Modification to source attribution, license status, or allowed use | Adding attribution text, updating license URL |
| **Additive change** | Adding new content records without modifying existing ones | Adding a new vocabulary entry to an existing file |
| **Removal change** | Removing content records | Deleting a vocabulary entry |
| **Formatting-only change** | Whitespace, formatting, or other non-semantic changes | Fixing JSON indentation, correcting a typo in a comment |
| **Scope change** | Adding or removing scope from the associated issue | Expanding the issue to cover a new content type |

### 7.2 Invalidation Matrix

For each change category, the matrix shows which scope types are invalidated:

| Change Category | learner-facing-strings | script-provenance | review-status | teaching-accuracy | regional-accuracy | pronunciation-guidance | kanji-bridge | source-license | scope-compliance | lesson-loop-quest |
|----------------|:---------------------:|:-----------------:|:-------------:|:-----------------:|:-----------------:|:----------------------:|:------------:|:--------------:|:----------------:|:-----------------:|
| Script form change (Traditional/Simplified text) | **INVALIDATED** | **INVALIDATED** | **INVALIDATED** | **INVALIDATED** | **INVALIDATED** if regional variant text changed | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected |
| Pronunciation string change (pinyin/tone note) | **INVALIDATED** | Unaffected | **INVALIDATED** | **INVALIDATED** if tone note changed | Unaffected | **INVALIDATED** | Unaffected | Unaffected | Unaffected | Unaffected |
| Teaching string change (kanji bridge/false-friend) | **INVALIDATED** | Unaffected | **INVALIDATED** | **INVALIDATED** | Unaffected | Unaffected | **INVALIDATED** | Unaffected | Unaffected | **INVALIDATED** if lesson content changed |
| Lesson structure string change | **INVALIDATED** | Unaffected | **INVALIDATED** | **INVALIDATED** if includes teaching content | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | **INVALIDATED** |
| Japanese explanation change | **INVALIDATED** | Unaffected | **INVALIDATED** | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected |
| Script provenance change | Unaffected | **INVALIDATED** | **INVALIDATED** | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected |
| Unauthorized reviewStatus modification | Unaffected | Unaffected | **INVALIDATED** | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected |
| Teaching metadata change | Unaffected | Unaffected | **INVALIDATED** | **INVALIDATED** | Unaffected | **INVALIDATED** | **INVALIDATED** | Unaffected | Unaffected | **INVALIDATED** if change affects lesson content |
| Regional metadata change | Unaffected | Unaffected | **INVALIDATED** | Unaffected | **INVALIDATED** | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected |
| Source/license change | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | **INVALIDATED** | Unaffected | Unaffected |
| Additive change | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | **INVALIDATED** for new records only |
| Removal change | Unaffected | Unaffected | **INVALIDATED** if removal breaks coverage or lesson integrity | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | **INVALIDATED** if removal breaks scope | **INVALIDATED** if removal breaks lesson bundle |
| Formatting-only change | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected |
| Scope change | Unaffected | Unaffected | **INVALIDATED** | Unaffected | Unaffected | Unaffected | Unaffected | Unaffected | **INVALIDATED** | **INVALIDATED** |

### 7.3 Recovery Rules

- **INVALIDATED** approval: Must be re-obtained from the same reviewer role before the content can proceed. A new review artifact must be recorded.
- **Approvals scoped to specific text**: A `learner-facing-strings`, `pronunciation-guidance`, `kanji-bridge`, or `lesson-loop-quest` approval obtained for one version of the text does not carry over to modified text. The new text must receive its own independent approval.
- **Unaffected** approval: Remains valid. No re-review needed for that dimension.
- **Additive changes** (adding new records without modifying existing ones): Unchanged records retain their existing approvals. The new records themselves require their own mandatory reviews per §8.5 before they can be promoted past `draft`. Adding records does not automatically invalidate existing approvals for unchanged content.
- **Removal changes** that affect coverage completeness, lesson loop integrity, Travel Quest usefulness, or content bundle consistency: the affected `scope-compliance` and `review-status` approvals are invalidated for the bundle. A maintainer must assess whether the removal breaks the content set's stated scope or learning outcome.
- **Removal changes** that remove only peripheral or redundant records (e.g., a duplicate entry): the maintainer may confirm no re-review is needed, but must document this decision.
- After any invalidation, all affected review artifacts must be updated or superseded before the content can be published.

### 7.4 Practical Application

Before re-review after a change:

1. Identify **all** applicable change categories using §7.1. A change may match multiple categories (e.g., rewriting `canDoJa` is both a Japanese explanation change and a lesson structure string change).
2. For each applicable category, look up the invalidated scope types using §7.2.
3. Combine results: a scope type is invalidated if **any** applicable category marks it **INVALIDATED**. The most restrictive result wins — you must not pick a single category to minimise invalidations.
4. For each invalidated scope type, determine if the same reviewer is available or a new reviewer is needed.
5. Record new review artifacts for invalidated dimensions only. Unaffected approvals do not need to be re-recorded.
6. If `review-status` was invalidated by an unauthorized modification, the record returns to `draft` and must go through `draft` → `reviewed` promotion again. Authorized transitions (`draft` → `reviewed` by human reviewer with valid artifact, `reviewed` → `published` by maintainer with all approvals) never cause self-invalidation or a return to `draft`.

---

## 8. Proposing Content (Contributor Guide)

### 8.1 Before You Start

1. Read the relevant issue to understand scope, acceptance criteria, and source of truth.
2. Check existing content to avoid duplication.
3. Confirm any source materials have compatible licenses before using them. If license status cannot be confirmed, the material must remain as a candidate/reference only and must not be imported into production content. Set `licenseStatus` to `needs-review`, resource `reviewStatus` to `candidate` or `under-review`, keep `productionImportAllowed` as `false` (or absent), and set `allowedUse` to `reference-only` or `citation`. Do not set `licenseStatus` to `under-review` — that value belongs to `reviewStatus`, not `licenseStatus`.

### 8.2 What to Include in a Content Proposal

Every content proposal should include:

- **Scope statement**: What content is being proposed and what is explicitly out of scope.
- **Source of truth reference**: The current GitHub issue, and any active canonical contract it explicitly references or adopts, govern this content. Planning, historical, or reference material governs only when that issue explicitly adopts or reactivates it; otherwise record it as evidence or context.
- **Content records**: Structured data in the correct schema format.
- **Provenance information**: For each script form, note whether it is `authored`, `verified`, or `generated`.
- **Review metadata**: Any known review requirements (language review, regional review, license review).

### 8.3 How to Propose

- **Lessons, vocabulary, phrasebook, sentences, practice items**: Open a GitHub issue using the Content template, or submit a PR with the structured content files.
- **Resource entries**: Open a GitHub issue that includes the source URL, license information, and intended use. If license status is unconfirmed, the resource is treated as a candidate only — it must not be imported into production content until a `human-source-reviewer` approves it. Set `licenseStatus` to `needs-review` (not `under-review` — that is a `reviewStatus` value), resource `reviewStatus` to `candidate` or `under-review`, keep `productionImportAllowed` as `false` (or absent), and set `allowedUse` to `reference-only` or `citation`. Even when `licenseStatus` is `approved` or `restricted`, production import requires compatible `allowedUse`, `productionImportAllowed`, and permission flags — `reviewStatus: approved` alone does not automatically allow import.
- **Illustrations**: Open a GitHub issue or include illustration records alongside the linked vocabulary. Each illustration must include its `id`, `vocabularyId`, `assetPath`, `sourceChecksumSha256`, `width`, `height`, `mimeType`, `fileSizeBytes`, `altJa`, `rights` object, and `reviewStatus`. Illustration review requires:
  - `human-source-reviewer` to verify rights metadata, attribution, and reuse terms
  - The rights object depends on the illustration's review status:
    - **Draft illustrations** (`reviewStatus: "draft"`) may use either the full cleared-rights object (`basis: "commissioned-for-chabiko"` with `publicWebDisplay: true`, `staticAssetRedistribution: true`, and `modificationScope: "technical-only"`) or the pending-rights object (`status: "pending"`, `source: "teacher-provided"`, `note`: non-empty). Pending rights do **not** claim public-display, redistribution, modification, attribution, or reuse permission.
    - **Reviewed or published illustrations** (`reviewStatus: "reviewed"` or `"published"`) must use the full cleared-rights object. The pending-rights variant is not valid at these statuses. Promotion from `draft` requires replacing any pending-rights object with the cleared-rights object and completing source-rights review.
  - Checksum and file constraints (MIME type, extension, dimensions, size) are enforced by schema validation
  - Orphan illustrations (no matching vocabulary record) must be rejected
  - Reviewed/published illustrations must have a valid `illustrationRef` cross-link to the vocabulary record
- **Roleplay or dialogue content**: Open a GitHub issue describing the scenario, learner level, and required vocabulary.

### 8.4 What Happens Next

1. A maintainer or reviewer will apply the relevant review checklists (§5).
2. If review reveals issues, the reviewer records findings and the contributor addresses them.
3. Once all required dimensions are approved, the content can be promoted through `draft` → `reviewed` → `published`.
4. If requirements are unclear, ask in the issue thread before investing in content creation.

### 8.5 Review Triggers

The following content types and changes trigger mandatory human review before promotion past `draft`:

| Trigger | Required Reviewer Role |
|---------|----------------------|
| New or modified learner-facing Chinese strings | `human-language-reviewer` |
| New or modified pinyin | `human-language-reviewer` |
| New or modified Japanese explanation | `human-language-reviewer` |
| New or modified lesson (any lesson structure change, hook, can-do goal, core sentence, chunks, or lesson metadata) | `human-teaching-reviewer` (`lesson-loop-quest`) |
| Lesson loop structure modification (sound focus, mini practice, review prompts, chunk breakdown) | `human-teaching-reviewer` (`lesson-loop-quest`) |
| New or modified `travelTask` | `human-teaching-reviewer` (`lesson-loop-quest`) |
| New or modified Travel Quest linkage or roleplay/recovery flow | `human-teaching-reviewer` (`lesson-loop-quest`) |
| Script provenance promotion (`generated` → `verified` or `generated` → `authored`) | `human-script-verifier` |
| HSK or teacher-curriculum content with `generated` provenance | `human-script-verifier` |
| Taiwan or Mainland regional usage claims | `human-regional-reviewer` |
| Kanji bridge or false-friend claims | `human-teaching-reviewer` |
| Tone or pronunciation guidance for Japanese speakers | `human-teaching-reviewer` or `human-language-reviewer` |
| New resource with license metadata | `human-source-reviewer` |
| Existing resource with license status change | `human-source-reviewer` |
| Unconfirmed license (resource must stay blocked until human-source-reviewer approves) | `human-source-reviewer` |
| New or modified illustration asset metadata or rights | `human-source-reviewer` |
| Illustration rights basis, attribution, or reuse terms | `human-source-reviewer` |

---

## 9. Review Flow Summary

```text
Content proposed (PR or issue)
    │
    ├─ Scope compliance check (maintainer)
    │   └─ Out of scope → Reject or defer
    │
    ├─ Language accuracy review (human-language-reviewer)
    │   └─ Issues found → Needs-changes → Fix → Re-review
    │   └─ Accepted
    │
    ├─ Script provenance review (human-script-verifier), if applicable
    │   └─ Issues found → Needs-changes → Fix → Re-review
    │   └─ Accepted
    │
    ├─ Teaching accuracy review (human-teaching-reviewer), if applicable
    │   └─ Issues found → Needs-changes → Fix → Re-review
    │   └─ Accepted
    │
    ├─ Regional usage review (human-regional-reviewer), if applicable
    │   └─ Issues found → Needs-changes → Fix → Re-review
    │   └─ Accepted
    │
    ├─ Source/license review (human-source-reviewer), if applicable
    │   └─ Issues found → Needs-changes → Fix → Re-review
    │   └─ Accepted
    │
    └─ All required dimensions accepted
        → reviewStatus promoted to `reviewed` (by human-language-reviewer)
        → Published (by maintainer)
```

---

## 10. Relationship to Other Documents

| Document | Relationship |
|----------|--------------|
| [ai-assisted-authoring-workflow.md](ai-assisted-authoring-workflow.md) | Defines the seven-stage pipeline. This workflow defines the human review stages (#119 Stage 6). |
| [content-model-draft.md](content-model-draft.md) | Defines executable schema, provenance fields, and reviewStatus values. |
| [dual-script-and-regional-variant-strategy.md](dual-script-and-regional-variant-strategy.md) | Defines script form and regional usage strategy. This workflow applies those rules during review. |
| [japanese-native-pain-point-taxonomy.md](japanese-native-pain-point-taxonomy.md) | Defines controlled pain-point taxonomy. This workflow checks tags during review. |
| [tone-and-pronunciation-training-loop.md](../strategy/tone-and-pronunciation-training-loop.md) | Defines tone and pronunciation guidance rules. This workflow verifies guidance accuracy. |

---

*This document is part of the Chabiko content architecture (#11). It should be reviewed when the AI-assisted authoring pipeline changes, when new content types are added, or when human review capacity changes.*
