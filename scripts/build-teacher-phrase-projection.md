# Teacher phrase human review and promoted projection

This is the teacher-specific promotion workflow frozen by Issues #474 and
#479. It does not reuse the Issue #360 campaign and it never treats draft
sidecar status or AI/model review as human approval.

## Canonical production workflow

The committed production projection starts empty because the repository has
no exact human-approved teacher phrase cells yet:

```bash
uv run --locked python scripts/build-teacher-phrase-projection.py \
  --write --initialize-empty
uv run --locked python scripts/build-teacher-phrase-projection.py --check
```

After the rights-governed workbook, its validated #478 sidecar, and an exact
human review artifact are available, build through all three inputs:

```bash
uv run --locked python scripts/build-teacher-phrase-projection.py \
  --workbook /path/to/单词表\(带图\).xlsx \
  --sidecar /path/to/teacher-phrase-authoring.json \
  --review /path/to/teacher-phrase-human-review.json \
  --write
```

The no-input `--check` validates the committed artifact's canonical bytes,
shape, and current learner-manifest/workbook base without reconstructing or
emptying promoted records. Use `--check` with all three authoring inputs to
prove full byte identity after a promotion. No-input `--write` is rejected;
`--initialize-empty` is reserved for first creation only and refuses to replace
any existing artifact. `--write` is atomic
and owns only `data/teacher-vocabulary-preview/teacher-phrase-promoted.json`;
it never deletes neighboring files. `--test` runs the repository-safe contract
self-test without the external workbook.

## Human artifact contract

The artifact namespace is `teacher-phrase-human-review-v1`. Its base binds the
canonical sidecar SHA-256, the sidecar contract ID, the learner-manifest
semantic digest, and the workbook SHA-256. Each sparse cell record binds:

- exact `learnerId`, current `sourceRevision`, and `reviewVersion`;
- exact ordered `orderedPhraseIds`;
- one ordered, non-duplicate evidence row for each required role:
  `human-language-reviewer`, `human-script-verifier`,
  `human-teaching-reviewer`, and `human-source-reviewer`;
- one separately attributed `overallDecision`; and
- one separate `maintainerPromotion` action.

Completed role evidence carries an attributed human identity, ISO date,
outcome, findings, exact review version, and complete ordered phrase IDs. An
unreviewed role is represented only by `outcome = "not-reviewed"` with null
identity/date/version/findings and an empty phrase-ID list; the source role also
uses a null source revision. The source reviewer additionally binds the current
`sourceRevision` once reviewed. Accepted overall review is attributed to a
maintainer, but it does not perform promotion;
`maintainerPromotion.action = "promote"` is a distinct required action bound to
both current versions.

`reviewVersion` hashes the ordered stable phrase IDs, every learner-visible
string, and exact per-field provenance/source/rights evidence. It deliberately
excludes raw formatting, source ranges, source revision, and mutable review
outcomes. This keeps semantic review and raw-source acceptance independent:
text/order/provenance drift invalidates review; raw workbook drift invalidates
source acceptance.

## Fail-closed promotion

A source cell is promoted only as a complete ordered unit. Every phrase needs
phrase-level `simplified`, `pinyin`, and `japanese`; `traditional` remains
optional. Word-level pinyin/Japanese are never fallbacks. A generated
learner-visible field, absent source/rights evidence, stale base/version,
partial phrase coverage, wrong/duplicate/pending/negative role evidence,
missing accepted overall decision, or missing maintainer action produces no
record for that cell (malformed or stale artifacts fail validation).

The learner projection contains only stable binding metadata plus
`phraseId`, `simplified`, optional `traditional`, `pinyin`, and `japanese`.
It contains no draft candidates, provenance payload, review status, or mutable
decision. Runtime imports only this projection and keeps the existing raw
`example` compatibility field unchanged.
