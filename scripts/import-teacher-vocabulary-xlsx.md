# Teacher Workbook Vocabulary Importer

Imports vocabulary from the teacher-curriculum workbook `单词表(带图).xlsx`.

## Usage

```bash
# Run self-tests
uv run --locked python scripts/import-teacher-vocabulary-xlsx.py --test

# Import a workbook
uv run --locked python scripts/import-teacher-vocabulary-xlsx.py <input.xlsx> <output-dir>
```

## Source classification

| Sheet | difficultyBand | sourceDifficultyLabel | partOfSpeech |
|-------|---------------|----------------------|-------------|
| `名词1` | `star-1` | `☆` | `noun` |
| `动词1` | `star-1` | `☆` | `verb` |
| `形容词1` | `star-1` | `☆` | `adjective` |
| `副词` | `star-1` | `☆` | `adverb` |
| `名词2` | `star-2` | `☆☆` | `noun` |
| `形容词2` | `star-2` | `☆☆` | `adjective` |
| `动词2` | `star-2` | `☆☆` | `verb` |

Separator/cover sheets (`難易度☆`, `難易度☆☆`) are ignored. Non-empty unknown sheets are fatal.

## Required headers

- `单词` → `simplified`
- `拼音` → `pinyin`
- `日语翻译` → `japanese`
- `难易度` → difficulty check

Ignored columns: `造词/造句`, `日文字`, `备注`.

## ID generation

Vocabulary ID: `teacher-{difficultyBand}-{first 12 hex chars of SHA-256("teacher-core-v1|{normalizedSimplified}|{normalizedPinyin}")}`

Illustration ID: `ill-{vocabularyId}`

## Output

Deterministic batch files (`teacher-vocabulary-batch-{NN}.json`) and `manifest.json` with:

- Source checksum, sheets, ignored columns
- Total/accepted/rejected counts by difficulty and part of speech
- Rejected row diagnostics
- Batch metadata with per-item source tracking

## Validation

Each batch is validated against `scripts/validate-content-schema.py --check`.
