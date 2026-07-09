## Goal

Extend the content model so lessons, vocabulary, phrasebook entries, and practice items can explicitly tag Japanese-native learner pain points.

## Scope

- Define a controlled taxonomy for Japanese-native learner pain points (tone, pinyin-pronunciation, kanji-false-friend, same-kanji-different-meaning, same-kanji-different-usage, word-order, measure-word, aspect-particle, complement, traditional-simplified, taiwan-mainland-usage).
- Decide which content types can use these tags.
- Add validation rules and seed examples.
- Document how these tags should appear in UI and review workflow.

## Out of scope

- Implementing every UI treatment.
- Creating the full vocabulary dataset.
- Adding speech recognition.

## Acceptance criteria

- [ ] Pain-point taxonomy is documented.
- [ ] Lesson, vocabulary, phrasebook, or practice schemas support the chosen metadata where relevant.
- [ ] Validation catches invalid pain-point tags.
- [ ] At least one seed example exists for tone, pinyin, false friend, and Taiwan/Mainland usage.
- [ ] Content review guidance explains how to use the taxonomy without over-tagging.

## Related issues

- #2 content schemas and resource registry
- #5 on-yomi bridge vocabulary dataset
- #8 cross-linking and filters
- #11 content review workflow
