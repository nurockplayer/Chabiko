# Teacher Core V1 Expansion Plan

## Source

| Field | Value |
|---|---|
| Source file | `单词表(带图).xlsx` |
| SHA-256 | `3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37` |
| Importer | `scripts/import-teacher-vocabulary-xlsx.py` |
| Detected sheets | 名词1, 动词1, 形容词1, 副词, 名词2, 形容词2, 动词2 |
| Separator sheets | 難易度☆, 難易度☆☆ |
| Ignored columns per sheet | 造词/造句, 日文字, 备注, plus the sheet's POS label (e.g. 名词) |

## Inventory summary

| Metric | Count |
|---|---|
| Total candidate rows | 1,865 |
| Accepted | 20 |
| Rejected | 1,845 |
| Reconciliation | 20 + 1,845 = 1,865 ✓ |

### By difficulty

| Difficulty | Count |
|---|---|
| star-1 | 20 |
| star-2 | 0 |

### By part of speech

| POS | Count |
|---|---|
| noun | 20 |
| verb | 0 |
| adjective | 0 |
| adverb | 0 |

### Rejection breakdown by category

| Category | Count |
|---|---|
| `missing_pinyin` | 1,254 |
| `missing_difficulty_check` | 549 |
| `missing_japanese` | 42 |

No formulas, duplicates, or ID collisions were detected.

### Rejection by sheet

| Sheet | Total | Breakdown |
|---|---|---|
| 名词1 | 489 | missing_difficulty_check=37, missing_japanese=41, missing_pinyin=411 |
| 动词1 | 162 | missing_difficulty_check=161, missing_japanese=1 |
| 形容词1 | 102 | missing_difficulty_check=102 |
| 副词 | 98 | missing_pinyin=98 |
| 名词2 | 477 | missing_pinyin=477 |
| 形容词2 | 111 | missing_difficulty_check=111 |
| 动词2 | 406 | missing_difficulty_check=138, missing_pinyin=268 |

## Batch-01 reconciliation

**Result: exact match.** The production `teacher-vocabulary-batch-01.json` (20 entries) is confirmed as the exact first 20 accepted rows in global importer order.

- IDs: identical sequence across all 20 positions
- Source sheets: all 名词1
- Source rows: 2, 3, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 23, 26, 27, 28, 29, 30
- `exactAcceptedPrefix`: true

Existing batch-01 vocabulary IDs, illustration IDs, asset paths, ordering, and learning progress are preserved as-is — no renumbering or reprocessing.

## Remaining batches (batch-02+)

**No remaining accepted rows.** The workbook yielded exactly 20 accepted items, which are fully consumed by batch-01. Therefore no batch-02 or later batches are needed.

If additional rows become accepted after a future data revision, the same deterministic ordering and at-most-50-per-batch rules apply starting from batch-02.

## Rejected rows (sample)

| Sheet | Row | Reason |
|---|---|---|
| 名词1 | 4 | missing difficulty check: 名词1:4 |
| 名词1 | 5 | missing difficulty check: 名词1:5 |
| 名词1 | 6 | missing difficulty check: 名词1:6 |
| 名词1 | 12 | missing difficulty check: 名词1:12 |
| 名词1 | 13 | missing difficulty check: 名词1:13 |
| 名词1 | 21 | missing pinyin: 名词1:21 |
| 名词1 | 22 | missing pinyin: 名词1:22 |
| 名词1 | 24 | missing difficulty check: 名词1:24 |
| 名词1 | 25 | missing difficulty check: 名词1:25 |
| 名词1 | 31 | missing difficulty check: 名词1:31 |

Full 1,845-row rejection list is available in the JSON plan.

## Not committed

- Source text (Simplified, pinyin, Japanese, Traditional Chinese)
- Workbook bytes
- Image files or image filenames
- Personal or absolute filesystem paths

## Downstream instruction

Create per-batch text/review/image/publication issues only from the merged JSON plan at `docs/content/teacher-core-v1-expansion-plan.json`. The JSON plan is the authoritative source for:

- vocabulary IDs and expected illustration IDs
- source sheet and source row for every accepted and rejected row
- deterministic ordering and batch boundaries
- rejection reasons

Do not derive batch structure from the raw importer output or from this Markdown report.
