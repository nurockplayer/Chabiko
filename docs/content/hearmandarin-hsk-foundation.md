# HearMandarin HSK source foundation

This authoring package admits only HearMandarin source IDs, Simplified Chinese, tone-marked pinyin, primary HSK 3.0 level, and observed global sequence for the first 2,000 verified coordinates. It creates a complete disposition manifest and one 20-row AI-provisional Japanese draft batch. These authoring files are not connected to learner runtime data, and draft rows do not become human reviewed or runtime available through import.

## Source and rights boundary

The pinned JSON is version `2026-09-09`, generated `2026-09-23`; the download page showed version label `2026-09-23`. Its SHA-256 is `5b67eb8acc69d99654646e7226e57f6fb799c111d1ee67d778e1a2954128acc0` (2,393,509 bytes). The matching 11,147-row CSV SHA-256 is `d7b72d6f2268bdf740ec2abf25582b3b968150871e74b47e1bb8d98e7df1c4f8` (850,313 bytes). The exact artifacts are [JSON](https://hearmandarin.com/datasets/hsk-3-0-words.json) and [CSV](https://hearmandarin.com/datasets/hsk-3-0-words.csv). The publisher identifies the downloadable JSON/CSV as CC BY 4.0 and permits study-app development and paid products with attribution. See [HearMandarin datasets](https://hearmandarin.com/datasets/), [data sources and publisher disclaimer](https://hearmandarin.com/data-sources/), [publisher Terms](https://hearmandarin.com/terms/), and the [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/).

The general site Terms restrict copying substantial site or audio content to republish, resell, or build a competing product and refer larger uses of site material to the publisher. They do not specifically name the separately licensed open JSON artifact. Sol's source-admission decision treats the explicit grant for this exact JSON artifact, together with the dataset page's study-app and paid-product permission with attribution, as a distinct permission for this retained-field derivative. This is a bounded source-admission inference, not a legal determination that CC BY overrides separate contracts, a claim of date-based supersession, or permission for other site content or paid exports. The profile, manifest, and every vocabulary row preserve the terms link and this limitation.

The derivative notice credits HearMandarin, identifies the license, links to publisher provenance and disclaimer material, and states which fields were retained and which Japanese text was independently AI-authored. Every vocabulary `source.note` carries those attribution and scope details so they remain attached if a row is later distributed. This does not grant approval to promote the provisional Japanese.

The independent current CTI 2025 syllabus comparison establishes membership, primary level, and global sequence only. Its PDF and extracted table are not included. The committed `official-verification.json` is the exact small verification receipt, not the PDF or a full-table copy.

Excluded publisher fields are English glosses, Traditional Chinese, part of speech, numbered pinyin, legacy levels, audio, and dictionary material. The receipt records 31 blocked coordinates: 30 numbered-sense-marker rows and one pinyin mismatch. All eight repeated Simplified+pinyin groups are wholly blocked. The separate POS discrepancy at sequence 948 is recorded only as an excluded-field diagnostic, bringing the receipt to 32 field discrepancies; it does not add a blocked row. The 90 supplementary source-level labels remain numeric metadata and never change the primary introduction level or authorize additional meanings.

## Canonical importer

The importer uses only the Python standard library and performs no network access. Run it with Python 3.14 or later, the pinned source JSON, and a new or empty output directory:

```sh
python3 scripts/import-hearmandarin-hsk-json.py \
  --source /local/path/to/hsk-3-0-words.json \
  --output-dir /tmp/hearmandarin-hsk-import
```

It reads the committed profile, byte-pinned verification receipt, and Japanese companion. Before writing, it checks source SHA and metadata, all 2,000 unique source IDs and official global coordinates, primary-level counts, the complete eligible retained-field projection digest, blocked-reason accounting, duplicate groups, supplementary labels, and the exact Japanese companion membership. It rejects source drift, malformed or incomplete evidence, symlinks, and a non-empty output directory without changing caller files.

The fresh output contains only `manifest.json` and `hsk-vocabulary-batch-001.json`. Compare both files byte-for-byte with the committed outputs:

```sh
cmp /tmp/hearmandarin-hsk-import/manifest.json \
  data/hsk-import/hearmandarin-hsk-2025-v1/manifest.json
cmp /tmp/hearmandarin-hsk-import/hsk-vocabulary-batch-001.json \
  data/hsk-vocabulary/hsk-vocabulary-batch-001.json
```

For an intentional regeneration, review the output and copy only these named files to their respective owned paths after comparison. The manifest accounts for every source coordinate, separates eligible and blocked records, assigns opaque `hm-hsk3-<sourceId>` record IDs, and plans later per-level chunks of at most 50 in global order. Only the first 20 eligible level-1 records are in a repository batch; later planned rows are not published.

The Japanese companion is original AI-authored text based only on the supplied Simplified Chinese, pinyin, and primary-level introduction context. It is marked `ai-provisional`, `reviewStatus: draft`, and not human reviewed. The existing `simplifiedStatus: authored` describes the retained publisher-authored Simplified form; it does not describe model output. No Traditional form is generated.

## Requirement → diff → test evidence

| Frozen requirement | Owned artifact | Validation | Observed result |
| --- | --- | --- | --- |
| Pin the exact publisher artifacts and record the bounded Terms inference, attribution, license, modification, disclaimer, and retained-field boundary | `source-profile.json`, this document, per-row `source.note` | Focused profile, manifest, and batch assertions | PASS. Exact JSON/CSV URLs, Terms link, artifact-specific rationale and limitation are recorded; every draft row repeats attribution, license, modification, disclaimer/provenance, and provisional status. Batch keys contain no excluded source fields. |
| Preserve the admitted official verification proof and account for every candidate coordinate | `official-verification.json`, `manifest.json` | Receipt SHA check, full pinned-source CLI runs, focused count/digest/reason assertions | PASS. Receipt bytes match SHA-256 `d084bb096f5ab6f2183a829308e002e23c3b9ef7c68658207c25e612103ca28e`; the manifest has 2,000 unique coordinates, 31 blocked and 1,969 eligible, level totals 294/191/495/989, all 90 supplementary labels, and the receipt's eligible projection digest. |
| Publish only the first 20 eligible level-1 Japanese drafts | `first-batch-japanese.json`, `hsk-vocabulary-batch-001.json` | Existing content-schema and script-status validators; focused sidecar and batch assertions | PASS. Both validators accept the 20-row batch; all rows remain `reviewStatus: draft`, have `simplifiedStatus: authored`, and match the companion's Simplified/pinyin/Japanese fields. |
| Make the canonical command deterministic and safe in clean and dirty directories | `import-hearmandarin-hsk-json.py` | `python3 scripts/import-hearmandarin-hsk-json.py --self-test`, also invoked by focused Vitest | PASS. The real subprocess CLI covers a clean repeat, non-empty sentinel preservation, symlink output rejection, wrong source hash, duplicate global sequence, and incomplete Japanese companion; invalid cases produce no output directory. |
| Reproduce committed artifacts from the exact external JSON | `manifest.json`, `hsk-vocabulary-batch-001.json` | Two fresh full-source CLI runs and byte comparisons | PASS. Both runs produced manifest SHA-256 `b54abe90df50087094d9b04b7294ff7de01bf496115861a5cab80a590c599b51` and batch SHA-256 `76a5666ca2fc9aa5fbece6113c0b3b3bfd6e25eda7ffceb6934880f97591a23e`; each pair matched the committed files byte-for-byte. |
| Keep runtime, fixtures, schema, package metadata, and legacy importers unchanged | Issue-owned files only | Worktree path/status review | PASS. The changed paths are limited to this profile/receipt/manifest/companion, the new batch, importer, documentation, and focused test. |

This foundation does not promote draft Japanese, change learner eligibility, resolve human review, import any excluded field, or authorize downstream stages before the owning issue's merge.
