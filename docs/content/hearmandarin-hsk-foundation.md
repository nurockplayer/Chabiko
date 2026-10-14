# HearMandarin HSK source foundation and learner release

HSK 1–4 now publishes all 1,969 eligible source rows through the existing 41 deterministic placements (294/191/495/989 newly introduced words). Level pages offer cumulative and newly introduced study pools; the home and paths pages link to all four levels and read local progress. The 31 blocked coordinates remain excluded.

Japanese companions are independently AI-authored, provisional drafts. Every companion retains `reviewStatus: draft`, `humanReview: false`, `excludedSourceFieldsUsed: []`; generated vocabulary retains `reviewStatus: draft` and its per-row AI-provisional notice. Runtime availability is an owner-authorized release decision, independent of human review. The manifest has `sourceEligibleIsRuntimeAvailable: true` and `sourceEligibleIsHumanReviewed: false`. Learner pages disclose that Japanese translations have not yet been checked by a teacher. No teacher approval or human-review claim is made.

## Source and rights

The admitted HearMandarin JSON is version `2026-09-09`, generated `2026-09-23`, 2,393,509 bytes, SHA-256 `5b67eb8acc69d99654646e7226e57f6fb799c111d1ee67d778e1a2954128acc0`. The separately downloadable dataset is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Preserve attribution to [HearMandarin](https://hearmandarin.com/datasets/), the license link, [publisher provenance and disclaimer](https://hearmandarin.com/data-sources/), [Terms](https://hearmandarin.com/terms/), and the modification notice. These remain in the source profile, manifest, and every generated row's `source.note`; HSK pages show visible linked attribution and a Japanese modification notice.

Admission is limited to source ID, Simplified Chinese, tone-marked pinyin, primary HSK 3.0 level, and observed global sequence. Japanese is separately authored. Publisher English glosses, POS, Traditional Chinese, numbered pinyin, legacy levels, audio, and dictionary material are excluded. No external Japanese dictionary text is imported.

The artifact-specific CC BY grant and dataset-page permission for study apps and paid products are the basis for this retained-field derivative. This is not a legal determination that CC BY overrides separate contracts, a date-based supersession claim, or permission to copy other site content, audio, or paid exports. The publisher's general Terms limitation stays attached to the derivative.

The independent CTI 2025 comparison establishes membership, primary level, and sequence only. The official PDF/table is not included. The pinned verification receipt SHA-256 is `d084bb096f5ab6f2183a829308e002e23c3b9ef7c68658207c25e612103ca28e`. All eight repeated Simplified+pinyin groups are wholly blocked. Supplementary level labels never change primary introduction levels.

## Deterministic rebuild

The first 20-row companion and generated batch remain byte-unchanged. Subsequent placements contain at most 50 rows and retain their original per-level numbering and filenames. `publication-index.json` declares all complete placements in immutable plan order. Companion records must exactly join the ordered retained source coordinates and contain nonempty Japanese.

For an exact matching archived source JSON, the existing command remains supported:

```sh
python3 scripts/import-hearmandarin-hsk-json.py \
  --source /local/path/to/hsk-3-0-words.json \
  --output-dir /tmp/hsk-source-rebuild
```

On 2026-10-15 the current download's SHA-256 was `c8b590005c25def132c8401f4414c5b9cc9855a8fb00c9fad8cd22249895d0af`, which differs from the admitted pin. That artifact was not used. Rebuild this release offline from the committed manifest:

```sh
python3 scripts/import-hearmandarin-hsk-json.py \
  --from-manifest --output-dir /tmp/hsk-manifest-rebuild
python3 scripts/import-hearmandarin-hsk-json.py --self-test
```

The offline command checks the frozen all-2,000-row identity/disposition/placement plan SHA-256 `7a1dd56a17d6d973600bcaa487035108dd61ede3b488ff88dff60c3a1a1c4bd3` and eligible retained-field projection SHA-256 `a207a42633daa821c7c22d1d4d24ce163612dbbc1450b7cfd8b1c0fcc864effa`, plus the receipt, profile, complete companion joins, and ordered declaration. It never reconstructs or reads excluded publisher fields. Blocked rows have no retained answer fields in the manifest and are never rendered or emitted into vocabulary batches.

Both input modes share batch generation, source notes, manifest accounting, and safe output writing. Use a new or empty output directory. Outputs are published with exclusive no-overwrite links; a failed publish can leave partial caller-owned output. Rerun into a new directory; do not delete caller files. Compare `manifest.json` and every declared batch against committed bytes before copying owned outputs.

## Progress behavior

HSK retains `chabiko:hsk-vocabulary-progress:v1` and the existing two-consecutive-Known threshold. Stored entries accept only `new | learning | learned` and finite nonnegative integer streaks. Invalid entries are filtered individually.

Accepted ratings survive failed writes for the active page lifetime. Pending local IDs merge with unrelated valid cross-tab progress; successful writes flush that merged document. Malformed or unreadable storage preserves memory. Verified external deletion or storage-wide clear takes precedence over unsaved ratings, while delayed deletion notifications cannot erase newer persisted data. Failed reset retries continue suppressing old IDs. If the pre-reset snapshot is unreadable, disk entries stay suppressed until reset persistence or verified deletion, so unknown old progress cannot return.


The learning-path descriptor is checksum-pinned by `data/unicode/source-manifest.json`. This release refreshes that checksum and the coupled mechanical/rendering metadata through the existing commands:

```sh
uv run --locked python scripts/extract_unicode_data.py --write
pnpm exec node scripts/generate_unicode_visual_candidates.ts --write
```

The scalar set remains 1,854 characters, and glyph hashes are unchanged. Occurrence order and source-binding hashes reflect the updated course description. These generated candidates remain provisional; no review outcome is promoted.
