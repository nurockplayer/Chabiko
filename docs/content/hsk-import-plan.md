# HSK 1–4 Import Plan and Batch 01 Production Slice

Status: authoritative import diagnostic / batch manifest for the HSK pipeline.

This document is the plan produced by Issue #81. It records the deterministic
workbook evidence (or merged-default assumption), the per-level import counts,
every blocked row with its source location and reason, the deterministic batch
boundaries, and the first production HSK 1 slice with its loading boundary.

## 1. Workbook evidence

### 1.1 No real HSK workbook is in the repository

A repository-wide search found **no HSK workbook** (no `*.xlsx` HSK source).
The only XLSX on the developer machine is the **teacher** workbook
`单词表(带图).xlsx`, which is the source for the separate Teacher Core v1 corpus
(checksum `3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37`,
recorded in `docs/content/teacher-core-v1-batch-01.md`). It is **not** an HSK
workbook, so it cannot drive the HSK importer.

### 1.2 Merged-default assumption (documented)

Because no real HSK workbook exists in-repo, this issue adopts the
**merged-default assumption**: the first production HSK slice is generated from
the **importer's own deterministic synthetic multi-sheet workbook**, the same
fixture the importer self-test uses to prove its contract. The synthetic
workbook is committed as the pinned deterministic input with full provenance so
the batch plan and the production slice are byte-for-byte reproducible.

Reasoning:

- The importer (`scripts/import-hsk-xlsx.py`, #75) is the tool contract that
  the real workbook must satisfy. Its self-test fixture exercises every
  behavior the plan must document: multi-sheet detection, English/Chinese/mixed
  header variants, metadata-sheet ignoring, empty-row skipping, duplicate /
  missing-field / formula rejection, level validation, deterministic hashed
  IDs, ≤50-row batches, and #74 contract validation.
- Using the identical workbook for the plan and for production means the plan's
  counts, IDs, batch boundaries, and blocked rows are the actual production
  output — no divergence between "planned" and "published".
- When a real HSK workbook is later provided, this plan's batch files are
  replaced by re-running the same importer; IDs are content-hashed
  (`sha256(simplified|pinyin) → 12 hex chars`), so only rows absent from the
  synthetic set change identity.

### 1.3 Exact tool / sheet / header / standard evidence

| Field | Value |
|---|---|
| Tool | `scripts/import-hsk-xlsx.py` (`--test` self-test + production run) |
| Command | `uv run --locked python scripts/import-hsk-xlsx.py data/vocabulary/hsk-3.0-v1/synthetic-hsk-workbook.xlsx data/vocabulary/hsk-3.0-v1 hsk-3.0` |
| Workbook | `data/vocabulary/hsk-3.0-v1/synthetic-hsk-workbook.xlsx` (committed, pinned) |
| Workbook SHA-256 | `669b631cfa0ec6211fa80e597301e3d8381f60236898fe6f46f82d2bca2cb662` |
| Standard version | `hsk-3.0` |
| Data sheets detected | `HSK Level 1`, `HSK Level 2`, `HSK Level 3-4` |
| Metadata sheet ignored | `Metadata Only` (0 recognised headers) |
| Empty sheet skipped | `Empty` |

Sheet → header mapping (resolved by `resolve_headers`):

| Sheet | Headers | Notes |
|---|---|---|
| `HSK Level 1` | `simplified, pinyin, traditional, level, japanese` | English headers |
| `HSK Level 2` | `简体, 拼音, 级别, 日文` | Chinese headers |
| `HSK Level 3-4` | `简体字, 拼音, 繁体字, Level, 日文, 类别` | Mixed headers; optional `category` mapped |
| `Metadata Only` | `notes, description` | 0 recognised headers → metadata, ignored |
| `Empty` | — | no rows → skipped |

The workbook itself is byte-pinned: `openpyxl` stamps creation/modification
timestamps and ZIP entry dates, so regenerating it is not byte-identical. The
committed workbook is therefore a **pinned input**: it must never be
regenerated in place. The importer output (batches + manifest) derived from it
is byte-identical across runs (verified, see §6).

## 2. Import counts by level

Source manifest: `data/vocabulary/hsk-3.0-v1/manifest.json`.

### 2.1 Top-level totals

| Metric | Count |
|---|---|
| Total parsed rows (non-empty) | 15 |
| Accepted (written to batches) | 12 |
| Rejected | 3 |
| Duplicate diagnostics (subset of rejected) | 2 |
| Blocked (malformed/duplicate/unreadable) | 3 |
| Batch count | 1 |

### 2.2 Per-level counts

| Level | Total rows | Accepted | Rejected | Duplicate | Blocked |
|---|---|---|---|---|---|
| 1 | 8 | 5 | 3 | 2 | 3 |
| 2 | 3 | 3 | 0 | 0 | 0 |
| 3 | 3 | 3 | 0 | 0 | 0 |
| 4 | 1 | 1 | 0 | 0 | 0 |
| invalid | 0 | 0 | 0 | 0 | 0 |
| **Total** | **15** | **12** | **3** | **2** | **3** |

Notes on classification:

- **Accepted** rows are published as **provisional (draft)** content — the
  importer sets `reviewStatus: "draft"` on every row by contract. No review
  status is fabricated.
- **Rejected / blocked** rows are individually listed in §3.
- **Duplicate** rows are a subset of blocked rows (they are rejected by the
  identity de-duplication gate).
- `totalByLevel` counts every parsed row by its raw level value; rejected rows
  at level 1 account for the difference between total (8) and accepted (5) at
  level 1.

### 2.3 Reconciliation

```
totalRows          15 = accepted (12) + rejected (3)
acceptedByLevel     5+3+3+1   = 12  ✓
rejectedByLevel     3         = 3   ✓
batch entryCount    12        = accepted (12)  ✓
```

## 3. Every blocked row (source location + reason)

All three blocked rows come from the `HSK Level 1` sheet of the synthetic
workbook. None are blocked from the other sheets.

| Sheet | Row | Reason (verbatim from manifest) | Class |
|---|---|---|---|
| `HSK Level 1` | 7 | `missing simplified: HSK Level 1:7` | malformed / unreadable |
| `HSK Level 1` | 8 | `duplicate identity (爱, ài): HSK Level 1:8` | duplicate |
| `HSK Level 1` | 9 | `duplicate identity (水, Shuǐ): HSK Level 1:9` | duplicate (case-variant) |

These are exactly the deliberate defect rows the synthetic workbook embeds to
exercise the importer's rejection paths. Row 7 has an empty simplified column;
row 8 repeats `爱 / ài` (already accepted from row 2); row 9 repeats `水` with a
case-variant pinyin `Shuǐ` (already accepted from row 6, and `_normalize_pinyin`
case-folds, so it collides). Because the synthetic input is the deterministic
fixture, these are the only blocked rows and no row is silently dropped.

## 4. Deterministic batch boundaries

The importer sorts accepted rows by
`(introducedAtLevel, simplified, pinyin)` and splits into ≤50-row batches.

### 4.1 Batch files

| File | Batch # | Entries | First ID | Last ID |
|---|---|---|---|---|
| `hsk-vocabulary-batch-01.json` | 1 | 12 | `hsk-1-32ddf4d4a6f5` | `hsk-4-58837eebf47f` |

### 4.2 Ordered rows (source rows in batch order)

Batch `hsk-vocabulary-batch-01.json`:

| # | ID | Simplified | Pinyin | Level | Source sheet | Source row | Review status |
|---|---|---|---|---|---|---|---|
| 1 | `hsk-1-32ddf4d4a6f5` | 你好 | nǐ hǎo | 1 | HSK Level 1 | 3 | draft |
| 2 | `hsk-1-c2e211c93ffd` | 水 | shuǐ | 1 | HSK Level 1 | 6 | draft |
| 3 | `hsk-1-f19e5ba46c86` | 爱 | ài | 1 | HSK Level 1 | 2 | draft |
| 4 | `hsk-1-eafd9b662998` | 狗 | gǒu | 1 | HSK Level 1 | 5 | draft |
| 5 | `hsk-1-e122899107b0` | 猫 | māo | 1 | HSK Level 1 | 4 | draft |
| 6 | `hsk-2-f41783418fc4` | 书 | shū | 2 | HSK Level 2 | 2 | draft |
| 7 | `hsk-2-c32f73d4f4c0` | 医院 | yīyuàn | 2 | HSK Level 2 | 4 | draft |
| 8 | `hsk-2-da8df807ec54` | 学校 | xuéxiào | 2 | HSK Level 2 | 3 | draft |
| 9 | `hsk-3-397d93198bd8` | 电脑 | diànnǎo | 3 | HSK Level 3-4 | 2 | draft |
| 10 | `hsk-3-367df9600cd7` | 电话 | diànhuà | 3 | HSK Level 3-4 | 3 | draft |
| 11 | `hsk-3-fdbb78c8e725` | 老师 | lǎoshī | 3 | HSK Level 3-4 | 4 | draft |
| 12 | `hsk-4-58837eebf47f` | 同学 | tóngxué | 4 | HSK Level 3-4 | 5 | draft |

### 4.3 Row-count reconciliation

| Level | Rows in batch | Matches acceptedByLevel? |
|---|---|---|
| 1 | 5 | ✓ (`"1": 5`) |
| 2 | 3 | ✓ (`"2": 3`) |
| 3 | 3 | ✓ (`"3": 3`) |
| 4 | 1 | ✓ (`"4": 1`) |
| Total | 12 | ✓ (`accepted: 12`) |

## 5. First production HSK 1 slice and its loading boundary

### 5.1 The slice

The first manifest-defined HSK 1 production batch is
`data/vocabulary/hsk-3.0-v1/hsk-vocabulary-batch-01.json`, whose level-1 rows
are the first HSK 1 slice (5 rows: 你好, 水, 爱, 狗, 猫 — the rows listed in §4.2
numbered 1–5).

### 5.2 Production loading boundary (loader switch)

`src/content/loadHskVocabulary.ts` now reads the **production batch file**
instead of the legacy fixture:

```
before: DEFAULT_HSK_PATH = 'data/examples/valid/hsk-vocabulary.json'
after:  DEFAULT_HSK_PATH = 'data/vocabulary/hsk-3.0-v1/hsk-vocabulary-batch-01.json'
```

- The loader still renders only `reviewStatus ∈ {reviewed, published}` via
  `PRODUCTION_REVIEW_STATUSES`; draft rows are loaded but not rendered.
- Because every imported row is `draft` (truthful provisional content — the
  importer contract), the **rendered** production HSK 1 slice is deterministically
  **empty** until a review pass promotes rows. This is the truthful state: no
  review status is fabricated and no un-reviewed content is shown to learners.
- The `/vocabulary/hsk/1/` flashcard page therefore renders its existing safe
  empty-fallback (`現在利用できる HSK 1 単語がありません`) rather than stale
  fixture cards.
- `data/learning-paths.json` was updated to reference the real production
  batch IDs (`hsk-1-*`) for the `hsk-vocabulary` path members and to declare
  `status: "unavailable"`, which matches the loader-derived availability for an
  empty reviewed level-1 slice. The path is truthfully `unavailable` (rendered
  as inert text) until reviewed content exists.
- Session/progress/storage and route URLs are unchanged: the flashcard session
  key (`chabiko:hsk-vocabulary-progress:v1`), progress domain, and route paths
  are untouched.

### 5.3 Focused validation of the slice

- `uv run --locked python scripts/import-hsk-xlsx.py --test` — full importer
  self-tests (deterministic re-runs, batch size/order, contract validation).
- `uv run --locked python scripts/validate-content-schema.py --check data/vocabulary/hsk-3.0-v1/hsk-vocabulary-batch-01.json` — #74 contract (the importer also runs this automatically on every batch write).
- `pnpm vitest run tests/hsk-flashcard.test.ts tests/learning-paths.test.ts tests/learning-paths-route.test.ts` — loader boundary + learning-path availability (route test performs a fresh Astro build).
- Full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check` — see §6.

## 6. Determinism evidence

Re-running the importer on the pinned workbook to a second output directory
produced **byte-identical** `hsk-vocabulary-batch-01.json` and `manifest.json`
(`diff` clean). IDs are content-hashed, batch order is a pure sort, and the
manifest carries the pinned workbook SHA-256, so repeated import output is
byte-identical. The importer self-test independently asserts byte-identity on
re-runs.

## 7. Files produced by this issue

| File | Purpose |
|---|---|
| `data/vocabulary/hsk-3.0-v1/synthetic-hsk-workbook.xlsx` | Pinned deterministic input (merged-default assumption, §1.2) |
| `data/vocabulary/hsk-3.0-v1/hsk-vocabulary-batch-01.json` | First production HSK batch (12 rows, all draft) |
| `data/vocabulary/hsk-3.0-v1/manifest.json` | Import diagnostic / reconciliation manifest |
| `src/content/loadHskVocabulary.ts` | Loader boundary switch to the production batch |
| `data/learning-paths.json` | HSK path members/status aligned to the production batch |
| `docs/content/hsk-import-plan.md` | This plan |
| `tests/hsk-flashcard.test.ts`, `tests/learning-paths.test.ts`, `tests/learning-paths-route.test.ts` | Directly-coupled tests updated for the new boundary |

The legacy fixture `data/examples/valid/hsk-vocabulary.json` is left in place
(unchanged) for reference and for the teacher-corpus-independent example corpus;
production no longer reads it for the HSK 1 slice.

## 8. Parallelization contract (for #82 and later)

After this merges, each non-empty immutable batch may become one child issue.
`hsk-vocabulary-batch-01.json` is the only batch in this import, so it is the
single disjoint unit; parallel work must not rewrite shared aggregate / index
files (the manifest and this plan). A real HSK workbook arrival will add rows
and may split new batches; batch boundaries are immutable once published.
