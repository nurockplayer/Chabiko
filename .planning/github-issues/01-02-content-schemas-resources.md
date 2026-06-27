## Goal

Define the structured content model and seed the resource registry so Chabiko content can be reviewed safely.

## Scope

- Implement schemas for lessons, vocabulary, sentences, and resources.
- Convert `docs/content/content-model-draft.md` into executable validation or typed models.
- Add seed examples for each content type.
- Add a candidate resource registry for official and open-data sources.
- Track owner, URL, license status, allowed use, attribution, and notes.
- Include fields needed by the Chabiko lesson loop: can-do goal, core sentence, chunk breakdown, kanji bridge notes, sound focus, travel task, and scenario tags.

## Out of scope

- Importing large external datasets.
- Publishing production lesson content.
- Building full UI pages.

## Acceptance criteria

- [ ] Schemas require Traditional Chinese, pinyin, Japanese explanation, category/scenario, and review/source metadata where applicable.
- [ ] Lesson schema supports hook, can-do goal, core sentence, chunks, kanji bridge notes, sound focus, mini practice/review prompts, and travel task.
- [ ] Vocabulary schema supports tone notes, similarity type, caution/false-friend notes, and travel scenario tags.
- [ ] Resource registry includes license status for each candidate source.
- [ ] Validation fails on missing required metadata.
- [ ] No copied third-party content is added without approval.

## Source of truth

- `.planning/REQUIREMENTS.md`: FOUND-03, RES-01, RES-02.
- `.planning/research/SUMMARY.md`.
- `docs/content/content-model-draft.md`.
- `docs/strategy/learning-and-motivation-strategy.md`.
