# Unicode Mechanical Record Contract

**Status:** Executable v1 for #260  
**Unicode data version:** 16.0.0 (Python 3.14 `unicodedata`)  
**Source manifest:** `data/unicode/source-manifest.json`

## Safety boundary

The dataset records Unicode scalar identity and repository provenance only. Same
scalar does not assert identical glyph shape. Compatibility normalization,
Traditional–Simplified authorship, or visual resemblance does not assert shared
meaning, pronunciation, or etymology. Every output of the #260 extractor is
`mechanical` and `learnerEligible: false`; #260 has no learner runtime consumer.

Strings are preserved exactly. `leftScalars` and `rightScalars` must reconstruct
their strings scalar-for-scalar; NFC and NFKC arrays describe normalization
results without replacing source text. Lone high/low surrogates and malformed
escapes are rejected. A valid JSON surrogate pair is decoded into its single
non-BMP Unicode scalar and accepted. CJK compatibility ideographs and
ideographic variation sequences remain explicit mechanical categories;
normalization never becomes a visual or semantic equivalence claim.

Learner eligibility is fail-closed. Only a `reviewed` record may be eligible,
and every category other than `exact-same-scalar` additionally requires
non-empty Japanese `cautionJa`. `mechanical`, `provisional`, `rejected`, and
`unsupported` records are always excluded. Only `visual-similarity` records may
cite the pinned rendering environment from `unicode-rendering-inventory.md`;
all #260 records must have an empty rendering-environment list.

## Determinism and provenance

The source manifest is an ordered allowlist of repository-relative JSON files,
exact SHA-256 values, and reviewed field/language roles. Extraction fails before
reading data when a path, checksum, Unicode version, or field selector is stale.
Evidence order is manifest order followed by JSON document order. Scalar rows
are ordered by first evidence occurrence; record order is first evidence
occurrence, controlled category order, then scalar sequence. IDs derive only
from controlled category and exact scalar sequence. Duplicate evidence or
record IDs fail closed.

`scalar-inventory.json` contains every unique CJK unified/compatibility
ideograph and each exact occurrence as `(evidenceRef, scalarIndex)`. Evidence
contains source path/checksum, JSON Pointer, language role, exact text,
per-form script status where present, and original/NFC/NFKC scalar arrays.
Record provenance must equal the active manifest ID/checksum/Unicode version;
category-specific scalar shapes are executable invariants.
Every evidence ref must also support the category claim: exact-scalar records
require both Chinese and Japanese occurrences, normalization/variation refs
must contain the claimed scalar sequence, and every Traditional–Simplified ref
must belong to a same-source-object authored/verified field pair.
`mechanical-records.json` contains:

- same-scalar occurrences present in both Chinese and Japanese fields;
- authored/verified Traditional–Simplified pairs from the same source object;
- mechanically present compatibility-ideograph normalization records;
- mechanically present Han + variation-selector sequences.

No font, network, OCR, visual comparison, or runtime conversion participates.

## Canonical workflow

```bash
uv run --locked python scripts/extract_unicode_data.py --write
uv run --locked python scripts/extract_unicode_data.py --check
uv run --locked python scripts/validate_unicode_data.py
```

`--write` stages and round-trip-validates both outputs before publication. If
either replacement fails after publication begins, both files are restored to
their prior bytes. It never prunes unrelated files. `--check` and the validator
are read-only and require byte-identical regeneration.

## Impact Map

### Writers

- `scripts/extract_unicode_data.py` is the only writer for
  `data/unicode/generated/{scalar-inventory,mechanical-records}.json`.
- Source content remains owned by its existing authors/importers. Updating a
  source requires a reviewed manifest checksum change and canonical rebuild.
- Focused tests write only inside test-owned temporary directories.

### Consumers and validators

- `scripts/validate_unicode_data.py` and `scripts/unicode_contract.py` validate
  the full source/evidence/scalar/record reconciliation.
- `tests/unicode-contract.test.ts` and `tests/python/test_unicode_contract.py`
  enforce the executable and documented CLI contracts, including the known
  production-loader source allowlist.
- `src/types/unicodeRecord.ts` is the authoring/static contract. There is no
  learner loader, UI, API, or runtime font consumer in #260.

### Legacy paths

No prior Unicode dataset, extractor, validator, or learner loader exists. The
manifest allowlists current loader-owned structured sources; preview-only
corpora and non-runtime schema examples are excluded.

### Boundaries

Generated files are committed authoring artifacts but are not imported by the
application build. Publication owns only its two named files and its unique
temporary transaction directory. Git ignores, deployment pruning, packages,
font bytes, screenshots, and learner content are unchanged.

### Rights and provenance

All source bytes are already repository-controlled. The manifest stores exact
checksums; generated evidence points back to manifest source IDs, paths, JSON
Pointers, and checksums. #259 permits no font-byte publication, and #260 uses no
font input at all.

### Clean and dirty environments

In a clean checkout, `--write` produces both outputs and `--check` reproduces
them byte-for-byte. In a dirty environment, checksum drift fails before write;
unrelated files are preserved. A partial publication failure restores both
previous outputs byte-for-byte, including when other files share the directory.
