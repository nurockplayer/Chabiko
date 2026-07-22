# Teacher Vocabulary XLSX Importer (Issue #112)

Deterministic authoring-time importer for the teacher-curriculum workbook `单词表(带图).xlsx`.

## Usage

```bash
uv run python scripts/import-teacher-vocabulary-xlsx.py <input.xlsx> <output-dir>

# Run self-tests
uv run python scripts/import-teacher-vocabulary-xlsx.py --test
```

### Output directory requirement

The output directory **must not exist** or be completely empty. If the
directory already has any content (files or subdirectories), the importer
fails immediately with an error before making any changes. This prevents
accidental overwrites or mixing old batch files with new output. Empty
(but pre-created) directories are allowed.

The importer never deletes user files.

## Overview

Reads the teacher-curriculum XLSX workbook, parses text-only content from
exact sheet/column mappings, emits deterministic draft teacher-curriculum
vocabulary records, and generates a bounded import manifest.

- Does **not** modify `scripts/import-hsk-xlsx.py`.
- Does **not** modify validators, production content, pages, loaders,
  storage, or package/lock files.
- Does **not** generate translations, pinyin, or illustrations.
- Does **not** commit real workbook or preflight output.

## Sheet classification

### Data sheets (fixed mapping)

| Sheet | difficultyBand | Label | POS |
|---|---|---|---|
| `名词1` | `star-1` | `☆` | `noun` |
| `动词1` | `star-1` | `☆` | `verb` |
| `形容词1` | `star-1` | `☆` | `adjective` |
| `副词` | `star-1` | `☆` | `adverb` |
| `名词2` | `star-2` | `☆☆` | `noun` |
| `形容词2` | `star-2` | `☆☆` | `adjective` |
| `动词2` | `star-2` | `☆☆` | `verb` |

### Separator sheets (silently ignored)

- `難易度☆`
- `難易度☆☆`

Any other non-empty sheet raises `ValueError` before any output mutation.

## Header mapping

### Required headers

| Source | Canonical |
|---|---|
| `单词` | `simplified` |
| `拼音` | `pinyin` |
| `日语翻译` | `japanese` |
| `难易度` | `difficulty_check` |

### Ignored headers (tracked but not copied)

- `造词/造句`
- `日文字`
- `备注`

Unknown extra columns are listed in `ignoredColumnsBySheet` in the manifest.

## Row acceptance

- Fully empty rows are ignored (no candidate count).
- Partially populated rows with non-empty required text are candidates.
- Missing required text → rejection with exact sheet/row diagnostic.
- Formula cells in required columns → rejection.
- Embedded images/comments/drawings → never copied.

## ID generation

### Vocabulary ID

```
teacher-{difficultyBand}-{SHA-256("teacher-core-v1|{normalized simplified}|{normalized pinyin}")[:12]}
```

### Illustration ID

```
ill-{vocabularyId}
```

### Normalization

- Simplified: NFKC, whitespace stripped (matches `validate-content-schema.py`).
- Pinyin: NFKC + casefold + whitespace stripped.

## Sorting

Stable sort key (global):

1. Difficulty: `star-1` → `star-2`
2. Part of speech: `noun` → `verb` → `adjective` → `adverb`
3. Source sheet (order in the table above)
4. Numeric source row ascending

## Batching

At most 50 records per batch.

**Filenames:**

```
teacher-vocabulary-batch-01.json
teacher-vocabulary-batch-02.json
...
```

## Output record shape

Each record passes `validate_single(..., "vocabulary")`:

```json
{
  "id": "teacher-star-1-{12hex}",
  "simplified": "爱",
  "simplifiedStatus": "authored",
  "pinyin": "ài",
  "japanese": "愛する",
  "source": {"type": "teacher-workbook"},
  "reviewStatus": "draft",
  "curriculum": {
    "sourceId": "teacher-core-v1",
    "difficultyBand": "star-1",
    "sourceDifficultyLabel": "☆",
    "partOfSpeech": "noun",
    "sourceSheet": "名词1",
    "sourceRow": 2
  }
}
```

No `illustrationRef` is included.

## Manifest

`manifest.json` contains:

- `sourceFile`, `sourceChecksumSha256`, `sourceId: "teacher-core-v1"`
- `detectedSheets`, `separatorSheets`
- `ignoredColumnsBySheet`
- `totalRows`, `totalByDifficultyAndPartOfSpeech`
- `accepted`, `acceptedByDifficultyAndPartOfSpeech`
- `rejected`, `rejectedByDifficultyAndPartOfSpeech`
- `duplicateDiagnostics`, `rejectedRows`
- `batchCount`, `batches`
- `acceptedItems` with vocabulary ID, expected illustration ID, source sheet, source row

After batch writing, every batch is validated by `validate-content-schema.py --check`.

## Design decisions

- Uses `openpyxl` with `data_only=False` to detect formula cells (same as HSK importer).
- Deterministic from input only: repeated runs produce byte-identical output.
- Fatal workbook errors (unknown sheets) stop before any output mutation.
- No new dependencies beyond existing `openpyxl`.
