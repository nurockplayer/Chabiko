# HSK Japanese gloss review in Excel

Use Python 3.14 and the existing openpyxl dependency through `uv run`:

```sh
uv run --python 3.14 python scripts/review/export_hsk_review_workbook.py --output /tmp/hsk-review.xlsx
uv run --python 3.14 python scripts/review/import_hsk_review_workbook.py --input /tmp/returned-hsk-review.xlsx --dry-run
uv run --python 3.14 python scripts/review/import_hsk_review_workbook.py --input /tmp/returned-hsk-review.xlsx
```

The owner sends the exported workbook to the teacher through their agreed private
channel, retains the returned original privately, and checks the dry-run summary
before importing. Never commit workbooks (they are ignored). The teacher fills
their own name, role (`human-language-reviewer`), and ISO date (`YYYY-MM-DD`) in
the initially empty 確認者 sheet. Excel date cells are also accepted as calendar
dates; text identity, role, and ISO date are retained exactly, without trimming.
Do not prefill identity or claim that an AI/test fixture is a human review.

The Japanese instructions explain the dropdown: `OK` accepts the current gloss;
`修正` accepts the full replacement in 修正後の日本語訳; `要相談` leaves it draft.
A blank decision confers no approval, even with notes or a proposed replacement.
Blank rows preserve any earlier valid approval; `要相談` revokes an earlier one.
IDs are hidden, and source columns are protected against accidental editing.
Protection is an editing aid; import validates all rows independently. Filtering
is supported; retain every row and sheet. No Cloudflare Access or portal is needed.

Import refuses unknown, missing, duplicate or misplaced IDs, edited/stale Chinese,
pinyin or current gloss text, invalid decisions, formulas, incomplete reviewer
identity, unsupported roles, and invalid dates. Any error rejects the entire
workbook before writes, with row locations for stale text. Re-export and have the
teacher reconsider changed rows; do not silently transfer decisions to new text.
Dry-run performs the same validation and complete rebuild in a temporary copy,
without writing repository files. An identical receipt is a no-op on reimport
when its original text is still current; a previously applied correction makes
the old workbook stale, so export again for a later review.

Import updates Japanese companions (including `first-batch-japanese.json`) and
uses the existing offline importer to regenerate batches and manifest hashes.
`human-reviews.json` beside the manifest is the durable, append-only artifact
ledger. Each receipt includes exact identity/role/date, workbook SHA256, scope,
outcome counts, unresolved/blocked IDs, comments, and before/after row text with
per-row SHA256 review versions. Approval covers **Japanese glosses only** and the
associated review-status assignment, following
[content-review-workflow.md](content-review-workflow.md). Script provenance and
rights are unchanged. Companion `authoring` describes the original AI generation;
the separate ledger records subsequent human work. Ordinary importer rebuilds
replay the ledger and invalidate approvals if the bound text or level changes.

The current learner page keeps its conservative AI-draft disclosure, including
when a level is fully reviewed; this tool does not change learner UI. Individual
reviewed records receive `reviewStatus: reviewed` and the loader's required human
review notice. Unreviewed records retain the AI-provisional notice. The owner
reviews the uncommitted diff, runs content validation and relevant tests, then
uses the normal independent review and release workflow. The ledger contains
the teacher's entered name; agree on the public attribution/handle before sending
the workbook, since the repository record will retain it.

Run the isolated workbook regression suite with:

```sh
uv run --python 3.14 python scripts/review/test_hsk_review_workbook.py
```
