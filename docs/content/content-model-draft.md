# Content Model Draft

This draft guides Phase 1 implementation. It is not an executable schema yet.

## Dual-Script Support

- Chinese learner-facing content supports both Traditional and Simplified fields where relevant.
- Taiwan travel content is Traditional-first and Taiwan-usage-first.
- HSK / school / general Mandarin paths may be Simplified-first.
- Japanese UI and explanations remain Japanese-first and are not affected by script toggle.
- Production learner-facing script forms must be authored or verified; generated-only / unreviewed runtime conversion must not be used as production display.
- Missing script forms need explicit fallback / status metadata (authored / verified / generated / unavailable).

## Lesson

- `id`
- `titleJa`
- `level`
- `canDoJa`
- `learnerOutcomeJa`
- `hookJa`
- `travelScenario`
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
- `soundFocus`
- `travelTask`
- `relatedVocabulary`
- `source`
- `reviewStatus`
- `scriptStatus` (authored / verified / generated / unavailable)

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
