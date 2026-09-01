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
human review artifact are available, build through all three inputs. A
successful write publishes both the non-runtime evidence bundle and the
learner projection:

```bash
uv run --locked python scripts/build-teacher-phrase-projection.py \
  --workbook /path/to/单词表\(带图\).xlsx \
  --sidecar /path/to/teacher-phrase-authoring.json \
  --review /path/to/teacher-phrase-human-review.json \
  --write
```

Every changed projection is a Unicode source change. Complete the downstream
writers in this order before committing the promotion:

```bash
uv run --locked python scripts/sync-teacher-phrase-unicode-source.py --write
uv run --locked python scripts/extract_unicode_data.py --write
pnpm exec node scripts/generate_unicode_visual_candidates.ts --write
```

The first command changes only the checksum of the exact
`teacher-phrase-promoted-v1` source entry while preserving the rest of
`data/unicode/source-manifest.json` byte-for-byte. The extractor then rebuilds
the mechanical inventory/records, and the pinned visual generator rebuilds its
two derived artifacts from the new scalar inventory. Do not hand-edit any of
those generated outputs.

Run the complete read-only drift closure afterward:

```bash
uv run --locked python scripts/build-teacher-phrase-projection.py --check
uv run --locked python scripts/sync-teacher-phrase-unicode-source.py --check
uv run --locked python scripts/extract_unicode_data.py --check
uv run --locked python scripts/validate_unicode_data.py
pnpm exec node scripts/generate_unicode_visual_candidates.ts --check
```

The no-input projection `--check` reads the committed evidence bundle,
recomputes its full canonical sidecar SHA-256, validates the human-review base
and every frozen source/rights/review/promotion gate, deterministically rebuilds
the learner projection, and requires byte identity. Use `--check` with all
three external authoring inputs to additionally prove that the committed
evidence bundle is current. No-input `--write` is rejected;
`--initialize-empty` is reserved for first creation only and refuses to replace
either existing artifact.

Normal writes atomically replace each owned file in safe publication order:
`teacher-phrase-promotion-evidence.json` first and
`teacher-phrase-promoted.json` last. A partial write therefore leaves the old
runtime projection in place and fails the next paired check. Initial creation
removes only an evidence file created by that same invocation if projection
creation loses a race. Neighboring files are never deleted. `--test` runs the
repository-safe contract self-test without the external workbook.

## Committed verification evidence

`teacher-phrase-promotion-evidence-v1` is repository verification evidence,
not a learner source. Before the first real promotion it truthfully contains
null sidecar/review snapshots. A non-empty build stores the exact validated
canonical #478 sidecar snapshot and the exact
`teacher-phrase-human-review-v1` snapshot. CI can therefore recompute the full
sidecar digest, require the review artifact to bind that digest and the current
manifest/workbook base, and reproduce every promoted learner string. Directly
editing the projection or substituting a syntactic hash cannot pass.

Runtime and Unicode extraction never import this evidence bundle. They consume
only `teacher-phrase-promoted.json`; the Unicode source manifest statically
allowlists that projection's learner-visible fields.

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
