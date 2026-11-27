---
area: content
owner: chabiko
updated: 2026-11-27 JST
---
# Content and data

Learner content is structured under `data/`; runtime readers and projections live in `src/content/`.

- `data/vocabulary/` and `data/teacher-import/` — teacher-curated word source and imported batches.
- `data/hsk-vocabulary/`, `data/hsk-import/`, `data/hsk-quiz/` — HSK corpus, source imports and quiz metadata.
- `data/roleplay/`, `data/small-talk/`, `data/practice/`, `data/resources/` — travel scenarios and practice materials.
- `data/teacher-vocabulary-preview/`, `data/content-pilots/`, `data/examples/` — preview, pilot and fixture content.
- `data/illustrations/` and `data/unicode/` — illustration records and Unicode review assets/metadata.
- `src/content/load*.ts` and payload modules provide typed loaders for routes; see `src/types/` for contracts.
- Content validation entry: `scripts/validate-content.sh`; schema and specialized validators are in `scripts/`.

Commands: `pnpm validate:content`; after content or loader changes use the matching validation tier with `pnpm validate`.
