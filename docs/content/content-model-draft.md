# Content Model Draft

This draft guides Phase 1 implementation. It is not an executable schema yet.

For the dual-script and regional variant strategy that governs the fields and rules below, see [dual-script-and-regional-variant-strategy.md](dual-script-and-regional-variant-strategy.md).
For the AI-assisted authoring workflow that governs content creation and review status transitions, see [ai-assisted-authoring-workflow.md](ai-assisted-authoring-workflow.md).

## Dual-Script Support

- Chinese learner-facing content supports both Traditional and Simplified fields where relevant.
- Taiwan travel content is Traditional-first and Taiwan-usage-first.
- HSK / school / general Mandarin paths may be Simplified-first.
- Japanese UI and explanations remain Japanese-first and are not affected by script toggle.
- Production learner-facing script forms must be authored or verified; generated-only / unreviewed runtime conversion must not be used as production display.

## Script Form Provenance

Each Chinese content record that carries Traditional and/or Simplified text must track
provenance per script form, not with a shared `scriptStatus` field. The two forms can
have different origins, so they need independent metadata.

### Status Values

| Status | Meaning |
|--------|---------|
| `authored` | Written or reviewed by a human content author. |
| `verified` | Initially generated or drafted, then human-verified for correctness and appropriateness. |
| `generated` | Produced by an automated process (LLM, conversion script). Not yet human-verified. |
| `unavailable` | This script form does not exist for this content item. No display possible. |

### Production Rules

1. **authored / verified** — the only statuses eligible for learner-facing production display.
2. **generated-only** — must NOT appear in learner-facing production. Generated content may be used for authoring preview, editorial workflow, or as a draft awaiting verification, but never as the canonical learner-facing form.
3. **unavailable** — the fallback rule applies (see Fallback Behavior below). No direct display.
4. **No unreviewed runtime conversion** — must never convert Traditional ↔ Simplified at runtime for production display without human review. Any conversion tooling is editorial only, and its output must be reviewed (promoted to `verified`) before it reaches learners.

### Record-Level Shape

Content records with Chinese text use two parallel field groups:

```
traditional       — Traditional Chinese string (required)
traditionalStatus — provenance of the Traditional form (required)

simplified         — Simplified Chinese string (optional, present when both forms exist)
simplifiedStatus   — provenance of the Simplified form (required when simplified is present;
                    may be "unavailable" without simplified to mark the form as confirmed absent)
```

### Fallback Behavior

When a record has `unavailable` for one script form:

1. If the learner's active path (see Path Defaults & Script Toggle) requests the unavailable form:
   - Show the available form instead, clearly annotated as the other script variant.
2. If both forms are `unavailable`:
   - The record must be excluded from rendering.
3. Fallback annotation must not misrepresent provenance — a Traditional-first item shown in Simplified during fallback must carry a UI indicator that the original was Traditional.
4. A form with `generated` status must never be used as a fallback target for an `unavailable` form unless it has first been promoted to `verified`.

### Interaction with Path Defaults & Global Script Toggle

- **Path defaults** (Taiwan travel → Traditional-first; HSK / school → Simplified-first) determine which script form is presented as the primary display. The other form, when available and qualified (`authored`/`verified`), is available as a secondary/alternate display.
- **Global script toggle** (planned #22) lets learners switch between script preferences. The toggle must respect provenance:
  - If the selected form is `unavailable`, the toggle falls back per the Fallback Behavior rules above.
  - If the selected form is `generated`, the toggle must NOT switch to it. Instead, the display stays on the currently active form, and the toggle option for the generated form is shown as disabled or unavailable.
- Provenance is authoring metadata, independent of the toggle. A `verified` Traditional form stays `verified` regardless of which form the learner is currently viewing.
- Path defaults do not override provenance. A Traditional-first path still requires `authored`/`verified` Traditional content. The default only selects which qualified form to show first.

### Status Validation Contract

A minimal executable validator for script status fields is at `scripts/validate-script-status.py`.

1. `traditional` is required on all applicable content types. `traditionalStatus` of `"unavailable"` is always invalid because `traditional` text always exists.
2. `traditionalStatus` is required and must be one of: `authored`, `verified`, `generated`.
3. `simplified` is optional. When absent, `simplifiedStatus` must also be absent, or be `"unavailable"` to mark the form as confirmed absent. `authored`, `verified`, and `generated` are invalid when `simplified` is absent.
4. When `simplified` is present, `simplifiedStatus` is required and must be one of: `authored`, `verified`, `generated`. `unavailable` is invalid when `simplified` text exists (a form with text cannot be "unavailable").
5. Display eligibility is a production concern, not a validation concern — the status values themselves are always valid when not contradictory.

## Japanese-Native Pain-Point Metadata

Content items can optionally carry one or more `painPointTags` drawn from a controlled taxonomy (see `japanese-native-pain-point-taxonomy.md`).

- **Optional**: Not every item needs tags. Missing tags are not a validation error.
- **Controlled**: Tags must come from the 11-value taxonomy. Any other value is invalid.
- **Over-tagging**: Aim for 0–3 tags per item. More than 3 likely means the item tries to teach too much at once.

### Validation Contract

A minimal executable validator exists at `scripts/validate-pain-points.py`. It validates `painPointTags` against the controlled taxonomy with zero dependencies.

When full schema validation is implemented (planned #2), these rules must also hold:

1. `painPointTags` field is optional on applicable content types.
2. If present, each value must be a case-sensitive, exact-match string from the controlled taxonomy.
3. Invalid tags cause a validation error.
4. Type must be `string[]` (or `array[string]`).
5. Empty array `[]` is treated as absent — no error.
6. Duplicate values should be rejected by validation. Authoring tools may deduplicate before validation, but stored content should not contain duplicates.
7. Tags must be lowercase kebab-case only.
8. The controlled list is an exhaustive allowlist.

### Controlled Tags

| Tag | Brief |
|-----|-------|
| `tone` | Mandarin tones absent in Japanese |
| `pinyin-pronunciation` | Pinyin initials/finals Japanese speakers mispronounce |
| `kanji-false-friend` | Same-kanji compound with different meaning |
| `same-kanji-different-meaning` | Single kanji with diverged meaning |
| `same-kanji-different-usage` | Same-meaning kanji with different grammar |
| `word-order` | Chinese SVO vs Japanese SOV patterns |
| `measure-word` | Measure words with different scope from Japanese counters |
| `aspect-particle` | Aspect particles (了/過/著) vs Japanese tense-aspect |
| `complement` | Resultative/directional/potential complements |
| `traditional-simplified` | Script form differences as a teaching point |
| `taiwan-mainland-usage` | Taiwan vs Mainland vocabulary/pronunciation differences |

## Lesson

- `id`
- `titleJa`
- `level`
- `canDoJa`
- `learnerOutcomeJa`
- `hookJa`
- `travelScenario`
- `painPointTags` (optional, string[])
- `sections`
- `coreSentence`
- `chunks`
- `kanjiBridgeNotes`
- `soundFocus`
- `examples`
- `reviewPrompts` — array of review prompt objects. Each item:
  - `promptJa: string` — Japanese prompt/question shown to the learner
  - `answerJa: string` — the expected correct answer in Japanese
  - `distractorsJa?: string[]` — explicit wrong-answer options for multiple-choice practice generation. Draft content may omit or provide an empty array. Reviewed/published lessons must have at least one usable prompt (a prompt with at least one non-empty distractor string different from `answerJa`). This field is distinct from `distractors` on the standalone `practice` item schema.
- `travelTask`
- `relatedVocabulary`
- `reviewStatus`

## Vocabulary

- `id`
- `traditional`
- `traditionalStatus` (authored / verified / generated)
- `simplified` (optional, available where both forms exist)
- `simplifiedStatus` (required when simplified is present; authored / verified / generated)
- `pinyin`
- `japanese`
- `kana`
- `category`
- `similarityType`
- `toneNote`
- `caution`
- `travelScenario`
- `painPointTags` (optional, string[])
- `examples`
- `source`
- `reviewStatus`

### HSK Vocabulary Fields

HSK vocabulary records are a Simplified-first subtype of the base Vocabulary model.

- `hsk` — optional object. When absent, the record is governed by the Traditional-first contract above.
- When `hsk` is present, the record is an HSK Simplified-first conditional subtype.

#### `hsk` Object

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `standardVersion` | yes | `"hsk-legacy-6-level"` \| `"hsk-3.0"` | Controlled HSK version |
| `introducedAtLevel` | yes | integer 1–9 | The HSK level at which this word is introduced (this initiative publishes 1–4 initially) |
| `sourceLevelLabel` | yes | string (non-empty) | Source label preserved for auditability |

#### HSK Conditional Subtype Rules

When `hsk` is present, the record requires:

- non-empty stable `id`
- non-empty `simplified`
- `simplifiedStatus` equal to `authored` or `verified` (not `generated` or `unavailable`)
- non-empty `pinyin`
- natural, non-empty Japanese `japanese`
- `source` object
- `reviewStatus`
- complete `hsk` object as defined above

For HSK records:

- `traditional` is optional.
- When `traditional` is present, `traditionalStatus` is required and must be `authored` or `verified`.
- When `traditional` is absent, `traditionalStatus` may be absent or `"unavailable"`.
- `generated` Traditional or Simplified forms are not production-eligible for HSK records.
- Existing legacy Vocabulary fields `kana` and `category` are optional for HSK records only.
- A draft `reviewStatus` does not make a record production-ready. Record-level review status and per-form provenance remain independent requirements.

#### HSK Identity Normalization

Duplicate HSK identity is the tuple:

`hsk.standardVersion + normalized simplified + normalized pinyin`

**Simplified normalization:**

1. Apply Unicode NFKC normalization.
2. Remove all Unicode whitespace characters.

**Pinyin normalization:**

1. Apply Unicode NFKC normalization.
2. Apply Unicode-aware case folding.
3. Remove all Unicode whitespace characters.

Tone marks, tone digits, apostrophes, `ü`, `v`, and `u:` remain distinct after normalization.

Duplicate identity detection is scoped to records with the same `hsk.standardVersion`. Records under different standard versions do not conflict.

#### Duplicate Vocabulary ID Detection

Within a single `vocabulary` collection, two or more entries with the same `id` fail validation. The error message includes the duplicated `id`, the index of the first occurrence, and the index of the current duplicate occurrence. Output order is deterministic — errors appear in the order duplicates are found (by increasing array index).

## Sentence

- `id`
- `traditional`
- `traditionalStatus` (authored / verified / generated)
- `simplified` (optional, available where both forms exist)
- `simplifiedStatus` (required when simplified is present; authored / verified / generated)
- `pinyin`
- `japanese`
- `scenario`
- `notesJa`
- `painPointTags` (optional, string[])
- `soundFocus`
- `travelTask`
- `relatedVocabulary`
- `source`
- `reviewStatus`

## Practice Item

- `id`
- `type` (tone-discrimination / pinyin-contrast / guided-shadowing / pronunciation-practice / word-order / measure-word / complement / aspect-particle / script-matching / region-vocab)
- `promptJa`
- `correctAnswer` (required except `guided-shadowing`, where it is `null`)
- `distractors` (where applicable)
- `painPointTags` (optional, string[])
- `relatedVocabulary`
- `reviewStatus`

### Pronunciation Practice Extensions

- All pronunciation formats may use `contrastId`, `toneContourId`, and optional `audioRef`.
- `tone-discrimination` requires `contrastId`, `toneContourId`, `toneContourHintJa`, and `interferenceJa`.
- `pinyin-contrast` requires `contrastId`, `contrastNoteJa`, `interferenceJa`, and `articulationJa`; `toneContourId` is optional.
- `guided-shadowing` requires `targetTraditional`, `targetTraditionalStatus`, `targetPinyin`, `toneContourId`, `shadowStepsJa`, `selfCheckJa`, `interferenceJa`, and `articulationJa`.

## Phrasebook Entry

- `id`
- `scenario` (food / transport / hotel / shopping / emergency / airport)
- `traditional`
- `traditionalStatus` (authored / verified / generated)
- `simplified` (optional, available where both forms exist)
- `simplifiedStatus` (required when simplified is present; authored / verified / generated)
- `pinyin`
- `japanese`
- `usageNotesJa`
- `painPointTags` (optional, string[])
- `relatedVocabulary`
- `source`
- `reviewStatus`

## Phrasebook Dialog (#220)

Scenario dialogs pair the learner with a conversation partner. Collection key: `phrasebookDialogs`. Each dialog record contains exactly:

- `id` — stable non-empty string
- `scenario` (food / transport / hotel / shopping / emergency / airport)
- `turns` — 2–6 ordered turn objects (see below)
- `relatedPhraseIds` — non-empty list of unique phrasebook entry `id`s from the same scenario
- `reviewStatus` (draft / reviewed / published)
- `source` (optional; truthful source required for `reviewed` / `published`)

Each turn contains:

- `speaker` (learner / partner)
- `traditional` (non-empty) and `traditionalStatus` (authored / verified / generated)
- `simplified` (optional) with matching `simplifiedStatus` (same rules as Phrasebook Entry)
- `pinyin` (non-empty, tone-marked)
- `japanese` (non-empty, natural Japanese)

### Phrasebook Dialog Validation Rules

- Turn count, speaker values, field types, controlled statuses, and required fields are validated per record with path-specific errors.
- Duplicate dialog `id`s fail.
- Generated script forms may not be paired with `reviewed` or `published`.
- `relatedPhraseIds` must be non-empty and unique; missing (stale) and cross-scenario references fail.
- `reviewed` / `published` require a truthful `source`.
- IDs, speaker order, references, and output order are deterministic; `data/examples/valid/phrasebook-dialogs.json` is the executable schema fixture.

## Resource

- `id`
- `title`
- `url`
- `canonicalUrl` (optional)
- `owner`
- `resourceType` (official-site / dictionary / standard / reference / academic / other)
- `languageRelevance` (optional, primary / supplementary / unrelated)
- `regionalRelevance` (optional, taiwan-specific / cross-strait / mainland-specific / general)
- `scriptRelevance` (optional, traditional / simplified / both / neutral)
- `licenseStatus` (unknown / needs-review / approved / restricted / prohibited)
- `allowedUse` (reference-only / attributed-use / non-commercial / commercial / citation)
- `attributionInstructions` (optional)
- `attributionRequired` (optional, boolean)
- `licenseName` (optional, string)
- `licenseUrl` (optional, URL string)
- `reviewedBy` (optional, string)
- `reviewedDate` (optional, date string)
- `productionImportAllowed` (optional, boolean)
- `commercialUseAllowed` (optional, boolean)
- `modificationAllowed` (optional, boolean)
- `redistributionAllowed` (optional, boolean)
- `reviewStatus` (candidate / under-review / approved / rejected)
- `attribution`
- `notes`

### License review metadata validation

- `licenseUrl` requires a non-empty `licenseName` and must use the `http` or `https` scheme with a hostname.
- `attributionRequired: true` requires non-empty `attributionInstructions`.
- `reviewedDate` requires non-empty `reviewedBy` and must be a real `YYYY-MM-DD` calendar date.
- `reviewStatus: approved` and `reviewStatus: rejected` require both `reviewedBy` and `reviewedDate`.
- `attributionRequired`, when present, must be a boolean.
- `url`, `canonicalUrl`, and `licenseUrl` (when present) must use the `http` or `https` scheme and include a hostname.

### Resource permission policy validation

- `productionImportAllowed`, `commercialUseAllowed`, `modificationAllowed`, and `redistributionAllowed` are optional. When present, they must be booleans.
- When `productionImportAllowed` is `true`:
  - `licenseStatus` must be `approved` or `restricted`.
  - `allowedUse` must not be `reference-only` or `citation`.
  - `reviewStatus` must be `approved`.
  - Multiple reasons are combined into a single error per flag.
- When `licenseStatus` is `unknown`, `needs-review`, or `prohibited`:
  - All permission flags must be `false` or absent.
  - `allowedUse` must be `reference-only` or `citation`; non-reference values fail even with no permission flags set.
- When `reviewStatus` is `rejected`:
  - All permission flags must be `false` or absent.
  - `allowedUse` must be `reference-only` or `citation`; non-reference values fail even with no permission flags set.
- When `reviewStatus` is `approved`, `licenseStatus` must not be `unknown`, `needs-review`, or `prohibited`.
- `allowedUse` values are consistent with permission flags:
  - `reference-only` and `citation` do not allow any permission flags.
  - `non-commercial` does not allow `commercialUseAllowed`.
  - `commercial` requires `commercialUseAllowed` to not be explicit `false`.

Error priority (ensures at most one error per flag):
1. `allowedUse` vs `licenseStatus` / `reviewStatus` (Phase A — no `true` flags needed).
2. `licenseStatus` blocking rules (Phase B) — highest priority for flags.
3. `reviewStatus: rejected` blocking (Phase C) — only unhandled flags.
4. `productionImportAllowed` combined positive checks (Phase D) — one combined error.
5. `reviewStatus=approved` vs bad `licenseStatus` (Phase E).
6. `allowedUse` consistency with remaining flags (Phase F).

### Resource duplicate ID detection

- Within a single `resources` array, two or more entries with the same `id` fail validation.
- The error message includes the duplicated `id`, the index of the first occurrence, and the index of the current duplicate occurrence.
- Output order is deterministic — errors appear in the order duplicates are found (by increasing array index).
- Entries with a missing or non-string `id` are silently skipped (schema-level validation handles those separately).
- The check is scoped to the `resources` collection only; identical `id` values across different content types (e.g., a resource and a vocabulary entry) are not flagged.

## Teacher Curriculum Vocabulary

Teacher-curriculum vocabulary records use a Simplified-first contract with an explicit `curriculum` object. They are identified by the presence of a `curriculum` field rather than an `hsk` field.

### Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | yes | string (non-empty) | Stable content identifier |
| `simplified` | yes | string (non-empty) | Simplified Chinese text |
| `simplifiedStatus` | yes | `"authored"` \| `"verified"` | Provenance of the Simplified form |
| `pinyin` | yes | string (non-empty) | Pinyin with tone marks |
| `japanese` | yes | string (non-empty) | Japanese gloss |
| `source` | yes | object | See source rules below |
| `reviewStatus` | yes | `"draft"` \| `"reviewed"` \| `"published"` | Workflow status |
| `curriculum` | yes | object | See curriculum object below |
| `traditional` | no | string | Traditional Chinese text when available |
| `traditionalStatus` | conditional | `"authored"` \| `"verified"` | Required when traditional is present |
| `kana` | no | string | Katakana reading |
| `category` | no | string | Semantic category |
| `illustrationRef` | no | string (non-empty) | Links to illustration record id |

### Source Rules

- `source.type` must be `"teacher-workbook"`.
- `source.note` is optional string.

### Curriculum Object

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `sourceId` | yes | `"teacher-core-v1"` | Controlled source identifier |
| `difficultyBand` | yes | `"star-1"` \| `"star-2"` | Difficulty tier |
| `sourceDifficultyLabel` | yes | `"☆"` \| `"☆☆"` | Display label matching difficulty band |
| `partOfSpeech` | yes | `"noun"` \| `"verb"` \| `"adjective"` \| `"adverb"` | Grammatical category |
| `sourceSheet` | yes | string (non-empty) | Source workbook sheet name |
| `sourceRow` | yes | integer | Source workbook row number |

### Script Provenance Rules

Teacher curriculum records follow the same Simplified-first rules as HSK:

- `simplified` and `simplifiedStatus` (`authored`/`verified`) are required.
- `traditional` is optional.
- When `traditional` is present, `traditionalStatus` is required and must be `authored` or `verified`.
- When `traditional` is absent, `traditionalStatus` may be absent or `"unavailable"`.
- `generated` is invalid for either script form.

### Teacher Identity Normalization

Duplicate teacher identity is the tuple:

`curriculum.sourceId + normalized simplified + normalized pinyin`

Uses the same normalization functions (NFKC, whitespace-stripped, case-folded pinyin) as HSK identity. Duplicate detection is scoped to records with the same `curriculum.sourceId`.

## Illustration

Illustrations are stored under the `illustrations` collection key.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | yes | string (non-empty) | Stable content identifier |
| `vocabularyId` | yes | string (non-empty) | Links to the teacher vocabulary record |
| `assetPath` | yes | string | Must start with `/assets/vocabulary/teacher-core-v1/` and end with `.webp` or `.png` |
| `sourceChecksumSha256` | yes | string | Exactly 64 lowercase hexadecimal characters |
| `width` | yes | integer (1–4096) | Image width in pixels, non-boolean |
| `height` | yes | integer (1–4096) | Image height in pixels, non-boolean |
| `mimeType` | yes | `"image/webp"` \| `"image/png"` | Controlled MIME type |
| `fileSizeBytes` | yes | integer (1–1,500,000) | File size, non-boolean |
| `altJa` | yes | string (non-empty) | Japanese alt text |
| `rights` | yes | object | See rights object below |
| `reviewStatus` | yes | `"draft"` \| `"reviewed"` \| `"published"` | Workflow status |

### Rights Object

Illustration rights have two mutually exclusive variants.

#### Variant A: Cleared Rights

Formal permission granted. Required when `reviewStatus` is `"reviewed"` or `"published"`.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `basis` | yes | `"commissioned-for-chabiko"` | Legal basis |
| `publicWebDisplay` | yes | `true` | Always true for launch |
| `staticAssetRedistribution` | yes | `true` | Always true for launch |
| `modificationScope` | yes | `"technical-only"` | Modification allowed for technical purposes only |
| `attributionRequired` | yes | boolean | Whether attribution is needed |
| `attributionText` | conditional | string (non-empty) | Required and non-empty exactly when `attributionRequired` is `true`; must be absent otherwise |
| `reuseOutsideChabiko` | yes | `"not-granted"` \| `"granted"` | Whether the asset can be reused outside Chabiko |

#### Variant B: Pending Rights (Draft Only)

Provisional rights metadata for draft illustrations where formal verification is still in progress. May only appear when `reviewStatus` is `"draft"`. Does not claim any usage or redistribution permission.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `status` | yes | `"pending"` | Rights status |
| `source` | yes | `"teacher-provided"` | Provider of the image |
| `note` | yes | string (non-empty) | Rights context or status note |

### Illustration Validation Rules

- `id`, `vocabularyId`, `assetPath`, `altJa` are non-empty strings.
- `sourceChecksumSha256` is exactly 64 lowercase hexadecimal characters.
- `width`/`height` are non-boolean integers from 1 through 4096.
- `fileSizeBytes` is a non-boolean integer from 1 through 1,500,000.
- MIME type is controlled as above.
- `assetPath` must begin `/assets/vocabulary/teacher-core-v1/` and end with the correct extension for its MIME type.
- `attributionText` is required and non-empty exactly when `attributionRequired` is true; otherwise it must be absent.
- Unknown illustration or rights fields fail validation.
- `rights` is a discriminated union. Pending-rights variant (`rights.status === "pending"`) is only valid when `reviewStatus` is `"draft"`. Cleared-rights variant (`rights.basis === "commissioned-for-chabiko"`) is valid at any `reviewStatus`.
- Reviewed or published illustrations with the pending-rights variant fail validation.
- Pending-rights `note` must be non-empty.
- Pending-rights objects must not contain fields outside `{status, source, note}`.
- Duplicate illustration IDs fail deterministically.
- Duplicate `vocabularyId` links fail (exactly one illustration per vocabulary record).

## Cross-Reference: Teacher Vocabulary ↔ Illustrations

In any bundle containing both collections:

- Every teacher vocabulary `illustrationRef` must match one illustration `id`.
- That illustration's `vocabularyId` must equal the vocabulary record's `id`.
- Orphan illustration records fail.
- Draft teacher records may omit `illustrationRef`.
- Reviewed/published teacher records must include a valid `illustrationRef`.

## Collection Keys

The validator recognizes the following top-level collection keys:

- `lessons`
- `vocabulary`
- `teacher_vocabulary`
- `sentences`
- `phrasebook`
- `phrasebookDialogs`
- `practice`
- `resources`
- `illustrations`

