# Teacher phrase authoring sidecar

This command implements the authoring/source foundation frozen in Issue #478.
It reads the teacher workbook's logical `造词/造句` value before NFC and
whitespace normalization, binds that value to the production learner manifest,
and writes a teacher-specific authoring-only sidecar.

The workbook remains an external, rights-governed input. Never commit the XLSX
file. Never reconstruct `rawCell` from the normalized learner `example` field.

## Canonical workflow

Create the sidecar from the canonical workbook:

```bash
uv run --locked python scripts/build-teacher-phrase-sidecar.py --workbook /path/to/单词表\(带图\).xlsx --write
```

Check an existing sidecar against the exact workbook and learner-manifest base:

```bash
uv run --locked python scripts/build-teacher-phrase-sidecar.py --workbook /path/to/单词表\(带图\).xlsx --check
```

Run the repository-safe self-test without the external workbook:

```bash
uv run --locked python scripts/build-teacher-phrase-sidecar.py --test
```

The default inputs and output are:

- learner manifest: `data/teacher-vocabulary-preview/learner-manifest.json`;
- output: `data/teacher-vocabulary-preview/teacher-phrase-authoring.json`.

Use `--manifest` and `--output` only for controlled fixtures or an explicit
authoring workspace. `--write` is atomic and owns only the requested output
file. It does not prune or overwrite neighboring files.

## Frozen contract

- `base.learnerManifestSemanticSha256` hashes the manifest schema and ordered
  `{learnerId, sourceSheet, sourceRow, example}` semantics.
- `base.workbookSha256` hashes the exact workbook bytes.
- `source.rawCell` is the exact logical workbook string. Its UTF-8 digest and
  `sourceRevision` bind the learner ID, sheet, row, fixed column, and raw value.
- Only raw U+000A LF creates draft source-unit boundaries. Punctuation and
  horizontal whitespace never split a cell. CR/CRLF and empty LF units remain
  one explicitly review-required unit; non-text, formula, and whitespace-only
  source cells fail closed.
- `phraseId` uses the full SHA-256 `teacher-phrase-v1` domain and excludes array
  position and `sourceRange`. A semantic source-unit change changes the ID.
- `fieldProvenance` is per phrase field and keeps `authored`, `generated`, or
  `verified` separate from explicit `sourceRef` and `rightsRef` evidence.
- The sidecar contains no review decision, promotion claim, or learner runtime
  state. It is not a learner Unicode source and must not be imported by runtime.

Validation rejects wrong workbook or manifest bases, unknown or duplicate
learner IDs, coordinate/raw/source revision drift, malformed provenance,
duplicate phrase IDs, missing source coverage, and unknown fields.

## Duplicate source units

When the same normalized source unit appears more than once in a cell, every
occurrence needs an explicit stable discriminator. Supply a JSON file with
`--duplicate-discriminators`:

```json
{
  "contractId": "teacher-phrase-duplicate-discriminators-v1",
  "records": [
    {
      "learnerId": "teacher-learner-example",
      "occurrences": [
        { "sourceUnitIndex": 0, "discriminator": "first-use" },
        { "sourceUnitIndex": 1, "discriminator": "second-use" }
      ]
    }
  ]
}
```

`sourceUnitIndex` locates the raw occurrence for authoring input only; it is not
part of `phraseId`. The discriminator itself is part of the identity so the ID
remains stable if the unit's source range moves.

## Refresh and drift behavior

If the output already exists, the command validates and preserves its exact
candidate fields. A workbook, manifest, coordinate, or raw-source change fails
before output mutation. The command never merges stale candidate material onto
a changed source; reconciliation must be explicit and reviewed in a separate
authoring step.
