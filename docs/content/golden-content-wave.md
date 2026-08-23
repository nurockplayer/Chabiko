# Golden Content Wave

This directory is a non-runtime pilot boundary for the first reusable-content
golden set. The artifacts are intentionally separate from the learner-facing
collections and the fixed #360 launch corpus.

## Taiwan Travel pilot

`data/content-pilots/taiwan-travel-golden/lessons.json` contains four complete
lesson-loop records for `airport`, `transport`, `food`, and `hotel`. They are
Traditional-first, include Japanese learner guidance, sound focus, kanji
bridge notes, practice prompts, travel tasks, and explicit safety limits where
the wording could otherwise imply a guarantee.

All pilot records remain `reviewStatus: "draft"`. Their example script forms
are marked `generated` until a human language reviewer verifies them. No pilot
record is learner-eligible.

## HSK-shaped pilot

`data/content-pilots/hsk-golden/vocabulary.json` contains fourteen
rights-safe, independently authored synthetic records. Each record uses
`source.type: "synthetic-pilot"`, remains `reviewStatus: "draft"`, and
explicitly states that it is not an official HSK membership claim.

Traditional headword forms are intentionally unavailable in this pilot. They
are not derived from an official workbook or syllabus and must not be
fabricated to make the records appear complete. Synthetic example sentences
carry their own generated dual-script fields because the existing vocabulary
example schema requires both forms; those examples remain draft and are not
HSK source material. The records validate the HSK-shaped graph contract only;
they do not unblock Issue #81.

## Graph and review validation

`data/content-pilots/graph-paths.json` uses collection-qualified references to
place the same HSK objects in both a Taiwan Travel pilot view and an HSK pilot
view. These are explicit pilot path memberships, not a change to the settled
canonical path contract. The pilot does not add `lesson.relatedVocabulary`
links because that existing relation resolves only the general vocabulary
collection; widening that relation is a separate contract decision. The
manifest is derived pilot data and does not change `data/learning-paths.json`.

`tests/golden-content-wave.test.ts` verifies:

- lesson-loop completeness and draft/provenance state;
- synthetic HSK source and withheld Traditional-form state;
- identity-preserving reuse across both graph views;
- stale-reference failure;
- unchanged #360 campaign counts and teacher-review fingerprint semantics.

The current #360 resolver remains the exact 24-phrase, 6-dialog, 6-launch-card
campaign. The pilot does not mutate that fixed target or manufacture a human
decision. Adding new phrase/dialog/roleplay records to the launch corpus would
be campaign drift; a later authorized review-wave scope must explicitly bind
any such pilot records before promotion.

## Expansion rule

After human review of this golden set, expand Taiwan Travel in bounded batches
to ten scenarios while retaining the same record shape, provenance, draft
default, fingerprint binding, and graph-path validation. Do not bulk-generate
or import restricted HSK material before Issue #81 records the required
rights/allowed-use evidence.
