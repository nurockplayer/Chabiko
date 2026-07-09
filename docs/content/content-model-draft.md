# Content Model Draft

This draft guides Phase 1 implementation. It is not an executable schema yet.

## Dual-Script Support

- Chinese learner-facing content supports both Traditional and Simplified fields where relevant.
- Taiwan travel content is Traditional-first and Taiwan-usage-first.
- HSK / school / general Mandarin paths may be Simplified-first.
- Japanese UI and explanations remain Japanese-first and are not affected by script toggle.
- Production learner-facing script forms must be authored or verified; generated-only / unreviewed runtime conversion must not be used as production display.
- Missing script forms need explicit fallback / status metadata (authored / verified / generated / unavailable).

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
- `simplified` (optional, available where both forms exist)
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
- `scriptStatus` (authored / verified / generated / unavailable; tracks how each script form was produced)

## Sentence

- `id`
- `traditional`
- `simplified` (optional, available where both forms exist)
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
- `scriptStatus` (authored / verified / generated / unavailable)

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
- `simplified` (optional, available where both forms exist)
- `pinyin`
- `japanese`
- `usageNotesJa`
- `painPointTags` (optional, string[])
- `relatedVocabulary`
- `source`
- `reviewStatus`
- `scriptStatus` (authored / verified / generated / unavailable; temporary draft field, expected to split into per-form provenance metadata in #24)

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
