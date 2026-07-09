# Content Model Draft

This draft guides Phase 1 implementation. It is not an executable schema yet.

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
- `reviewPrompts`
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
- `type` (tone-discrimination / pronunciation-practice / word-order / measure-word / complement / aspect-particle / script-matching / region-vocab)
- `promptJa`
- `correctAnswer`
- `distractors` (where applicable)
- `painPointTags` (optional, string[])
- `relatedVocabulary`
- `reviewStatus`

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

## Resource

- `id`
- `title`
- `url`
- `owner`
- `resourceType`
- `licenseStatus`
- `allowedUse`
- `attribution`
- `notes`
