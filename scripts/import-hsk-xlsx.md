# HSK XLSX Importer

Reads an HSK workbook XLSX and emits versioned vocabulary records plus a bounded import manifest.

## Usage

```bash
uv run python scripts/import-hsk-xlsx.py <input.xlsx> <output-dir> <hsk-version>
```

Arguments:

- `input.xlsx` — path to a local XLSX workbook.
- `output-dir` — directory for generated JSON batch files and manifest.
- `hsk-version` — standard version string. Must be one of:
  - `hsk-3.0`
  - `hsk-legacy-6-level`

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
- `standardVersion` validation (only `hsk-3.0` / `hsk-legacy-6-level`)
- Level range validation (1–9 only)
- Formula rejection in required columns
- Sheet detection: metadata sheets ignored, malformed candidates rejected before any output
- #74 contract validation on every batch

## Output

Each batch JSON is a `{"vocabulary": [...]}` file compatible with the [#74 HSK contract][hsk-contract]. Every batch is automatically validated against the contract after generation. A `manifest.json` contains source checksum, version, sheet names, total/accepted/rejected counts by level, diagnostics, and batch metadata.

## Properties

- **Text-only**: Images, drawings, comments, and binary objects are not read.
- **Formula safety**: Workbooks are opened in formula-text mode (`data_only=False`). Formulas in required columns (simplified, pinyin, japanese) cause the row to be rejected; formulas in optional columns are treated as empty.
- **Deterministic**: Same input → byte-identical output. IDs are SHA-256 hashes of `{simplified}|{pinyin}`.
- **Column detection**: Matches English and Chinese header aliases. Metadata sheets (zero recognised headers) are silently ignored. Sheets with partial recognised headers but missing required columns raise `ValueError` before any output is written.
- **Whitespace**: NFC Unicode normalization; internal whitespace collapsed.

[hsk-contract]: ./validate-content-schema.py
