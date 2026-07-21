# HSK XLSX Importer

Reads an HSK workbook XLSX and emits versioned vocabulary records plus a bounded import manifest.

## Usage

```bash
uv run python scripts/import-hsk-xlsx.py <input.xlsx> <output-dir> <hsk-version>
```

Arguments:

- `input.xlsx` — path to a local XLSX workbook.
- `output-dir` — directory for generated JSON batch files and manifest.
- `hsk-version` — standard version string (e.g. `hsk-3.0`, `hsk-legacy-6-level`).

## Self-tests

```bash
uv run python scripts/import-hsk-xlsx.py --test
```

Generates a synthetic multi-sheet XLSX and runs the full pipeline, verifying:

- Basic import with multi-sheet detection
- Chinese and English header variants
- Duplicate and missing-field rejection with source diagnostics
- Batch size (≤50) and sort order
- Byte-identical re-runs
- Level distribution accuracy
- Output field hygiene

## Output

Each batch JSON is a `{"vocabulary": [...]}` file compatible with the [#74 HSK contract][hsk-contract]. A `manifest.json` contains source checksum, version, sheet names, counts, diagnostics, and batch metadata.

## Properties

- **Text-only**: Images, drawings, comments, formulas, and binary objects are not read.
- **Deterministic**: Same input → byte-identical output. IDs are SHA-256 hashes of `{simplified}|{pinyin}`.
- **Column detection**: Matches English and Chinese header aliases. Fails fast on missing required columns.
- **Whitespace**: NFC Unicode normalization; internal whitespace collapsed.

[hsk-contract]: ../docs/design/hsk-vocabulary-contract.md
