#!/usr/bin/env python3
"""Create the admitted HearMandarin HSK source manifest and first draft batch."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


PROFILE_REL = Path("data/hsk-import/hearmandarin-hsk-2025-v1/source-profile.json")
RECEIPT_REL = Path("data/hsk-import/hearmandarin-hsk-2025-v1/official-verification.json")
JAPANESE_REL = Path("data/hsk-import/hearmandarin-hsk-2025-v1/first-batch-japanese.json")
FIRST_BATCH_FILENAME = "hsk-vocabulary-batch-001.json"
FIRST_BATCH_SIZE = 20
FIRST_BATCH_LEVEL = 1
SUBSEQUENT_BATCH_MAX_ROWS = 50
SUBSEQUENT_BATCH_ORDERING = "global-sequence-within-primary-level"


class ImportFailure(Exception):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ImportFailure(f"duplicate JSON object key: {key}")
        result[key] = value
    return result


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ImportFailure(f"cannot read valid UTF-8 JSON from {path}: {error}") from error


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ImportFailure(message)


def _validate_profile(profile: dict[str, Any], receipt: dict[str, Any]) -> None:
    dataset = profile["dataset"]
    expected = profile["expectedSourceMetadata"]
    counts = profile["counts"]
    coordinate = profile["coordinate"]
    plan = profile["plannedBatches"]
    verification = dataset["sourceCoordinateVerification"]

    # These fields are duplicated in the human-maintained profile and the source
    # JSON/independent receipt. Keep them tied to one verified publisher artifact.
    source_metadata_pairs = (
        ("datasetVersion", "version"),
        ("generated", "generated"),
        ("license", "license"),
        ("licenseUrl", "license_url"),
        ("attribution", "attribution"),
        ("homepage", "homepage"),
    )
    for dataset_key, metadata_key in source_metadata_pairs:
        require(dataset[dataset_key] == expected[metadata_key], f"profile source identity drift at {dataset_key!r}")
    require(dataset["json"]["rows"] == expected["count"], "profile JSON row count disagrees with publisher metadata")
    require(dataset["csv"]["rows"] == expected["count"], "profile CSV row count disagrees with publisher metadata")
    require(dataset["json"]["sha256"] == receipt.get("datasetSha256"), "official receipt is bound to a different source JSON identity")
    require(receipt.get("versionEvidence") == {
        "datasetVersion": expected["version"],
        "datasetGenerated": expected["generated"],
        "downloadPageVersionLabel": dataset["downloadPageVersionLabel"],
    }, "official receipt source-version identity disagrees with verified publisher metadata")
    require(verification["officialArtifactSha256"] == receipt.get("officialArtifactSha256"),
            "official verification artifact hash disagrees with receipt")
    require(verification["page"] == receipt.get("officialPageUrl"),
            "official verification page disagrees with receipt")
    require(verification["receiptSha256"] == sha256(json_bytes(receipt)), "profile receipt identity does not match parsed official receipt")
    require(verification["verificationReceipt"] == RECEIPT_REL.name, "profile names a different official verification receipt")
    require(receipt.get("intendedCount") == counts["sourceCandidates"] == coordinate["lastVerifiedSequence"] - coordinate["firstVerifiedSequence"] + 1,
            "official receipt candidate count disagrees with frozen source coordinates")
    require(receipt.get("primaryLevelCounts") == coordinate["expectedLevelCounts"], "official receipt primary-level counts disagree with profile coordinates")
    require(receipt.get("eligibleCount") == counts["eligible"], "official receipt eligible count disagrees with profile accounting")
    require(receipt.get("eligibleLevelCounts") == counts["eligibleLevelCounts"], "official receipt eligible level counts disagree with profile accounting")

    max_rows = plan["subsequentMaxRows"]
    require(isinstance(max_rows, int) and not isinstance(max_rows, bool) and 1 <= max_rows <= SUBSEQUENT_BATCH_MAX_ROWS,
            "subsequent batch maximum must be a positive integer no greater than 50")
    require(plan["subsequentOrdering"] == SUBSEQUENT_BATCH_ORDERING, "unsupported subsequent batch ordering")
    require(plan["firstBatch"] == FIRST_BATCH_FILENAME, "first batch filename disagrees with frozen publication contract")
    require(isinstance(counts["firstBatch"], int) and not isinstance(counts["firstBatch"], bool) and counts["firstBatch"] == FIRST_BATCH_SIZE,
            "first batch size disagrees with frozen publication contract")
    first_level = plan["firstBatchPrimaryLevel"]
    require(isinstance(first_level, int) and not isinstance(first_level, bool) and first_level == FIRST_BATCH_LEVEL,
            "first batch primary level disagrees with frozen publication contract")
    published_batches = plan["repositoryPublishedBatches"]
    require(isinstance(published_batches, int) and not isinstance(published_batches, bool) and published_batches == 1,
            "repository publication count disagrees with frozen first-batch contract")


def load_configuration(repo_root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    profile = load_json(repo_root / PROFILE_REL)
    receipt_path = repo_root / RECEIPT_REL
    receipt_bytes = receipt_path.read_bytes()
    require(
        sha256(receipt_bytes) == profile["dataset"]["sourceCoordinateVerification"]["receiptSha256"],
        "official verification receipt bytes do not match the frozen receipt SHA256",
    )
    try:
        receipt = json.loads(receipt_bytes.decode("utf-8"), object_pairs_hook=_unique_object)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ImportFailure(f"verification receipt is not valid UTF-8 JSON: {error}") from error
    _validate_profile(profile, receipt)
    japanese = load_json(repo_root / JAPANESE_REL)
    return profile, receipt, japanese


def _check_source_metadata(source: dict[str, Any], profile: dict[str, Any]) -> None:
    expected = profile["expectedSourceMetadata"]
    for key, expected_value in expected.items():
        require(source.get(key) == expected_value, f"source metadata drift at {key!r}")
    require(isinstance(source.get("words"), list), "source words must be an array")
    require(len(source["words"]) == expected["count"], "source row count does not match pinned metadata")


def _primary_coordinates(source: dict[str, Any], profile: dict[str, Any]) -> list[dict[str, Any]]:
    coordinate = profile["coordinate"]
    sequence_field = coordinate["globalSequenceField"]
    level_field = coordinate["primaryLevelField"]
    first = coordinate["firstVerifiedSequence"]
    last = coordinate["lastVerifiedSequence"]
    rows: list[dict[str, Any]] = []
    seen_sequences: set[int] = set()
    seen_ids: set[str] = set()

    # Deliberately access only the five retained source fields below.
    for raw in source["words"]:
        if not isinstance(raw, dict):
            continue
        sequence = raw.get(sequence_field)
        if not isinstance(sequence, int) or isinstance(sequence, bool) or not first <= sequence <= last:
            continue
        source_id = raw.get("id")
        simplified = raw.get("simplified")
        pinyin = raw.get("pinyin")
        level = raw.get(level_field)
        require(sequence not in seen_sequences, f"duplicate global sequence {sequence}")
        require(isinstance(source_id, str) and source_id, f"missing source ID at global sequence {sequence}")
        require(source_id not in seen_ids, f"duplicate source ID {source_id}")
        require(isinstance(simplified, str) and simplified, f"missing retained Simplified text at global sequence {sequence}")
        require(isinstance(pinyin, str) and pinyin, f"missing retained pinyin at global sequence {sequence}")
        require(isinstance(level, int) and not isinstance(level, bool), f"invalid primary level at global sequence {sequence}")
        seen_sequences.add(sequence)
        seen_ids.add(source_id)
        rows.append({
            "sourceId": source_id,
            "globalSequence": sequence,
            "primaryLevel": level,
            "simplified": simplified,
            "pinyin": pinyin,
        })

    rows.sort(key=lambda row: row["globalSequence"])
    expected_sequences = list(range(first, last + 1))
    require([row["globalSequence"] for row in rows] == expected_sequences, "missing or extra verified global sequence coordinate")
    level_counts = Counter(str(row["primaryLevel"]) for row in rows)
    require(dict(sorted(level_counts.items())) == coordinate["expectedLevelCounts"], "source primary-level coordinate counts drifted")
    return rows


def _validate_receipt(rows: list[dict[str, Any]], profile: dict[str, Any], receipt: dict[str, Any]) -> tuple[dict[int, list[str]], dict[int, str], str]:
    counts = profile["counts"]
    coordinate = profile["coordinate"]
    require(receipt.get("datasetSha256") == profile["dataset"]["json"]["sha256"], "receipt is bound to a different source dataset SHA256")
    require(receipt.get("intendedCount") == counts["sourceCandidates"], "receipt candidate count drifted")
    require(receipt.get("primaryLevelCounts") == coordinate["expectedLevelCounts"], "receipt primary-level counts drifted")
    require(receipt.get("eligibleCount") == counts["eligible"], "receipt eligible count drifted")
    require(receipt.get("eligibleLevelCounts") == counts["eligibleLevelCounts"], "receipt eligible level counts drifted")
    require(len(receipt.get("supplementarySourceLevelLabels", {})) == counts["supplementarySourceLevelLabels"], "supplementary source-level label count drifted")
    require(len(receipt.get("excludedFieldDiscrepancies", [])) == counts["excludedPosDiscrepancies"], "excluded-field diagnostic count drifted")

    blocked: dict[int, list[str]] = {}
    for item in receipt.get("blocked", []):
        sequence = item.get("globalSequence")
        reasons = item.get("reasons")
        require(isinstance(sequence, int) and sequence not in blocked, "duplicate or invalid blocked coordinate in receipt")
        require(isinstance(reasons, list) and reasons and all(isinstance(reason, str) for reason in reasons), f"invalid blocked reason at sequence {sequence}")
        blocked[sequence] = reasons
    require(set(blocked).issubset({row["globalSequence"] for row in rows}), "receipt blocks a coordinate outside the source candidate set")
    require(len(blocked) == counts["blocked"], "receipt blocked-coordinate count drifted")
    require(len(rows) - len(blocked) == counts["eligible"], "eligible plus blocked does not account for all candidates")

    labels: dict[int, str] = {}
    for sequence_text, label in receipt["supplementarySourceLevelLabels"].items():
        require(sequence_text.isdigit(), "supplementary source-level coordinate must be numeric text")
        sequence = int(sequence_text)
        require(sequence in {row["globalSequence"] for row in rows}, f"supplementary level label is outside verified coordinates: {sequence}")
        require(isinstance(label, str) and label, f"empty supplementary level label at sequence {sequence}")
        labels[sequence] = label

    eligible_rows = [row for row in rows if row["globalSequence"] not in blocked]
    projection = [[r["sourceId"], r["globalSequence"], r["primaryLevel"], r["simplified"], r["pinyin"]] for r in eligible_rows]
    projection_sha = sha256(json.dumps(projection, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    require(projection_sha == receipt.get("eligibleProjectionSha256"), "complete retained eligible projection digest does not match independent receipt")
    actual_eligible_levels = Counter(str(row["primaryLevel"]) for row in eligible_rows)
    require(dict(sorted(actual_eligible_levels.items())) == counts["eligibleLevelCounts"], "eligible primary-level accounting drifted")

    duplicates: dict[tuple[str, str], list[int]] = defaultdict(list)
    for row in rows:
        duplicates[(row["simplified"], row["pinyin"])].append(row["globalSequence"])
    repeated = [sequences for sequences in duplicates.values() if len(sequences) > 1]
    require(len(repeated) == counts["duplicateGroups"], "repeated retained word/pinyin group count drifted")
    require(sum(map(len, repeated)) == counts["duplicateRows"], "repeated retained word/pinyin row count drifted")
    require(all(all(sequence in blocked for sequence in group) for group in repeated), "a repeated Simplified+pinyin group is not wholly blocked")
    return blocked, labels, projection_sha


def _validate_japanese(japanese: dict[str, Any], eligible: list[dict[str, Any]], first_batch_count: int) -> list[dict[str, Any]]:
    authoring = japanese.get("authoring")
    require(isinstance(authoring, dict), "Japanese authoring metadata is missing")
    require(authoring.get("status") == "ai-provisional" and authoring.get("reviewStatus") == "draft", "Japanese authoring must remain AI-provisional draft")
    require(authoring.get("humanReview") is False, "Japanese authoring cannot claim human review")
    require(authoring.get("excludedSourceFieldsUsed") == [], "Japanese authoring declares use of excluded source fields")
    records = japanese.get("records")
    require(isinstance(records, list) and len(records) == first_batch_count, "Japanese companion must contain exactly the first repository batch")
    first_rows = eligible[:first_batch_count]
    for index, (companion, source) in enumerate(zip(records, first_rows, strict=True), start=1):
        require(isinstance(companion, dict), f"Japanese companion row {index} is not an object")
        for key in ("sourceId", "globalSequence", "simplified", "pinyin"):
            require(companion.get(key) == source[key], f"Japanese companion {key} mismatch at row {index}")
        require(isinstance(companion.get("japanese"), str) and companion["japanese"].strip(), f"Japanese draft is empty at row {index}")
    return records


def _source_note(profile: dict[str, Any], row: dict[str, Any], source_level_label: str) -> str:
    dataset = profile["dataset"]
    return (
        f"Source: {dataset['attribution']}, {dataset['datasetName']} ({dataset['homepage']}). "
        f"Publisher provenance and independence disclaimer: {dataset['provenance']}. "
        f"Publisher Terms: {dataset['termsUrl']}. {dataset['artifactScopeRationale']} "
        f"License: {dataset['license']} ({dataset['licenseUrl']}). {dataset['modificationNotice']} "
        f"Japanese is independently AI-authored and provisional, not human reviewed. Source ID {row['sourceId']}; global sequence {row['globalSequence']}; "
        f"primary level {row['primaryLevel']}; source level label {source_level_label}."
    )


def build_outputs(source_bytes: bytes, source: dict[str, Any], profile: dict[str, Any], receipt: dict[str, Any], japanese: dict[str, Any]) -> tuple[bytes, bytes]:
    require(sha256(source_bytes) == profile["dataset"]["json"]["sha256"], "source JSON SHA256 does not match the pinned source profile")
    require(len(source_bytes) == profile["dataset"]["json"]["bytes"], "source JSON byte count does not match the pinned source profile")
    _check_source_metadata(source, profile)
    rows = _primary_coordinates(source, profile)
    require(len(rows) == profile["counts"]["sourceCandidates"], "source candidate count does not match profile")
    blocked, supplementary_labels, projection_sha = _validate_receipt(rows, profile, receipt)
    eligible = [row for row in rows if row["globalSequence"] not in blocked]
    companion = _validate_japanese(japanese, eligible, profile["counts"]["firstBatch"])
    first_batch_count = profile["counts"]["firstBatch"]
    first_batch_rows = eligible[:first_batch_count]
    require(len({row["primaryLevel"] for row in first_batch_rows}) == 1, "first batch must contain one primary level")
    require(first_batch_rows[0]["primaryLevel"] == profile["plannedBatches"]["firstBatchPrimaryLevel"], "first batch primary level drifted")

    placements: dict[int, str] = {row["globalSequence"]: "batch-001" for row in first_batch_rows}
    by_level: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible[first_batch_count:]:
        by_level[row["primaryLevel"]].append(row)
    max_chunk = profile["plannedBatches"]["subsequentMaxRows"]
    for level in sorted(by_level):
        for chunk_index, start in enumerate(range(0, len(by_level[level]), max_chunk), start=1):
            placement = f"planned-level-{level}-batch-{chunk_index + 1:03d}"
            for row in by_level[level][start:start + max_chunk]:
                placements[row["globalSequence"]] = placement

    manifest_rows: list[dict[str, Any]] = []
    for row in rows:
        sequence = row["globalSequence"]
        source_level_label = supplementary_labels.get(sequence, str(row["primaryLevel"]))
        is_blocked = sequence in blocked
        item: dict[str, Any] = {
            "recordId": f"hm-hsk3-{row['sourceId']}",
            "sourceId": row["sourceId"],
            "globalSequence": sequence,
            "primaryLevel": row["primaryLevel"],
            "sourceLevelLabel": source_level_label,
            "sourceEligible": not is_blocked,
            "repositoryPublication": "blocked" if is_blocked else ("draft-batch-001" if sequence in placements and placements[sequence] == "batch-001" else "planned-not-published"),
            "batchPlacement": None if is_blocked else placements[sequence],
            "disposition": "blocked" if is_blocked else "eligible",
        }
        if is_blocked:
            item["blockedReason"] = blocked[sequence]
        else:
            item["simplified"] = row["simplified"]
            item["pinyin"] = row["pinyin"]
        manifest_rows.append(item)

    records: list[dict[str, Any]] = []
    for source_row, ja_row in zip(first_batch_rows, companion, strict=True):
        sequence = source_row["globalSequence"]
        level_label = supplementary_labels.get(sequence, str(source_row["primaryLevel"]))
        records.append({
            "id": f"hm-hsk3-{source_row['sourceId']}",
            "pinyin": source_row["pinyin"],
            "japanese": ja_row["japanese"],
            "reviewStatus": "draft",
            "hsk": {
                "standardVersion": "hsk-3.0",
                "introducedAtLevel": source_row["primaryLevel"],
                "sourceLevelLabel": level_label,
            },
            "simplified": source_row["simplified"],
            "simplifiedStatus": "authored",
            "source": {
                "type": "hearmandarin-hsk-json",
                "note": _source_note(profile, source_row, level_label),
            },
        })
    batch = {"vocabulary": records}
    batch_bytes = json_bytes(batch)
    manifest = {
        "manifestVersion": 1,
        "source": {
            "publisher": profile["dataset"]["publisher"],
            "datasetName": profile["dataset"]["datasetName"],
            "datasetVersion": profile["dataset"]["datasetVersion"],
            "generated": profile["dataset"]["generated"],
            "downloadPageVersionLabel": profile["dataset"]["downloadPageVersionLabel"],
            "jsonDownloadUrl": profile["dataset"]["jsonDownloadUrl"],
            "csvDownloadUrl": profile["dataset"]["csvDownloadUrl"],
            "jsonSha256": profile["dataset"]["json"]["sha256"],
            "license": profile["dataset"]["license"],
            "licenseUrl": profile["dataset"]["licenseUrl"],
            "termsUrl": profile["dataset"]["termsUrl"],
            "termsSummary": profile["dataset"]["termsSummary"],
            "artifactScopeRationale": profile["dataset"]["artifactScopeRationale"],
            "attribution": profile["dataset"]["attribution"],
            "sourceUrl": profile["dataset"]["homepage"],
            "provenanceUrl": profile["dataset"]["provenance"],
            "disclaimerUrl": profile["dataset"]["disclaimer"],
            "modificationNotice": profile["dataset"]["modificationNotice"],
            "excludedFields": profile["dataset"]["excludedFields"],
        },
        "officialCoordinateVerification": {
            "authorityUrl": profile["dataset"]["sourceCoordinateVerification"]["page"],
            "artifactSha256": profile["dataset"]["sourceCoordinateVerification"]["officialArtifactSha256"],
            "receiptSha256": profile["dataset"]["sourceCoordinateVerification"]["receiptSha256"],
            "intendedCount": len(rows),
            "eligibleProjectionSha256": projection_sha,
            "scope": profile["dataset"]["sourceCoordinateVerification"]["scope"],
        },
        "accounting": {
            "sourceCandidates": len(rows),
            "eligible": len(eligible),
            "blocked": len(blocked),
            "eligibleLevelCounts": profile["counts"]["eligibleLevelCounts"],
            "primaryLevelCounts": profile["coordinate"]["expectedLevelCounts"],
            "repeatedWordPinyinGroupsWhollyBlocked": profile["counts"]["duplicateGroups"],
            "repeatedWordPinyinRowsBlocked": profile["counts"]["duplicateRows"],
            "excludedFieldDiscrepancies": receipt["excludedFieldDiscrepancies"],
            "supplementarySourceLevelLabels": len(supplementary_labels),
        },
        "publication": {
            "repositoryPublishedBatchCount": 1,
            "firstBatchFile": profile["plannedBatches"]["firstBatch"],
            "firstBatchRecords": len(records),
            "firstBatchPrimaryLevel": first_batch_rows[0]["primaryLevel"],
            "subsequentBatchMaximum": max_chunk,
            "subsequentBatchOrdering": profile["plannedBatches"]["subsequentOrdering"],
            "batchSha256": sha256(batch_bytes),
            "sourceEligibleIsHumanReviewed": False,
            "sourceEligibleIsRuntimeAvailable": False,
        },
        "rows": manifest_rows,
    }
    return json_bytes(manifest), batch_bytes


def write_outputs(output_dir: Path, manifest_bytes: bytes, batch_bytes: bytes) -> None:
    raw_output = output_dir.expanduser()
    require(not raw_output.is_symlink(), "output directory cannot be a symlink")
    output = raw_output.absolute()
    existed = output.exists()
    if existed:
        require(output.is_dir(), "output path exists and is not a directory")
        require(not any(output.iterdir()), "output directory must be empty")
    parent = output.parent
    require(parent.is_dir(), "output directory parent must already exist")
    stage = Path(tempfile.mkdtemp(prefix=".hsk-import-stage-", dir=parent))
    made_output = False
    try:
        (stage / "manifest.json").write_bytes(manifest_bytes)
        (stage / "hsk-vocabulary-batch-001.json").write_bytes(batch_bytes)
        if not existed:
            output.mkdir()
            made_output = True
        require(output.is_dir() and not output.is_symlink(), "output directory changed during import")
        require(not any(output.iterdir()), "output directory changed and is no longer empty")
        for name in ("manifest.json", "hsk-vocabulary-batch-001.json"):
            os.link(stage / name, output / name)
    except Exception:
        if made_output and output.is_dir() and not any(output.iterdir()):
            output.rmdir()
        raise
    finally:
        shutil.rmtree(stage)


def run_import(repo_root: Path, source_path: Path, output_dir: Path) -> None:
    profile, receipt, japanese = load_configuration(repo_root)
    if source_path.is_symlink():
        raise ImportFailure("source JSON cannot be a symlink")
    try:
        source_bytes = source_path.read_bytes()
        source = json.loads(source_bytes.decode("utf-8"), object_pairs_hook=_unique_object)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ImportFailure(f"cannot read valid UTF-8 source JSON: {error}") from error
    require(isinstance(source, dict), "source JSON root must be an object")
    manifest_bytes, batch_bytes = build_outputs(source_bytes, source, profile, receipt, japanese)
    write_outputs(output_dir, manifest_bytes, batch_bytes)
    print(f"wrote {output_dir}/manifest.json ({sha256(manifest_bytes)})")
    print(f"wrote {output_dir}/hsk-vocabulary-batch-001.json ({sha256(batch_bytes)})")


def _mini_profile(source_bytes: bytes, receipt_bytes: bytes) -> dict[str, Any]:
    source_hash = sha256(source_bytes)
    return {
        "dataset": {
            "publisher": "HearMandarin", "datasetName": "HSK 3.0 word list", "datasetVersion": "test-v1",
            "generated": "test-date", "downloadPageVersionLabel": "test-label", "homepage": "https://hearmandarin.com/datasets/",
            "jsonDownloadUrl": "https://hearmandarin.com/datasets/hsk-3-0-words.json", "csvDownloadUrl": "https://hearmandarin.com/datasets/hsk-3-0-words.csv",
            "provenance": "https://hearmandarin.com/data-sources/", "disclaimer": "https://hearmandarin.com/data-sources/",
            "termsUrl": "https://hearmandarin.com/terms/",
            "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "attribution": "HearMandarin (https://hearmandarin.com)",
            "modificationNotice": "Retained only admitted fields; Japanese is independently AI-authored draft.",
            "termsSummary": "The general site terms are separate from this small fixture's pinned artifact.",
            "artifactScopeRationale": "The exact JSON artifact has an artifact-specific CC BY 4.0 grant.",
            "excludedFields": ["English glosses", "Traditional Chinese", "part of speech", "numbered pinyin", "legacy HSK levels", "audio", "dictionary material"],
            "json": {"sha256": source_hash, "bytes": len(source_bytes), "rows": 21}, "csv": {"sha256": "test", "bytes": 0, "rows": 21},
            "sourceCoordinateVerification": {"receiptSha256": sha256(receipt_bytes), "verificationReceipt": RECEIPT_REL.name, "page": "https://www.chinesetest.cn/syllabus", "officialArtifactSha256": "test", "scope": "Test-only coordinate receipt."},
        },
        "expectedSourceMetadata": {"name": "HearMandarin HSK 3.0 Word List Dataset", "version": "test-v1", "generated": "test-date", "count": 21, "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "HearMandarin (https://hearmandarin.com)", "homepage": "https://hearmandarin.com/datasets/"},
        "coordinate": {"primaryLevelField": "hsk3_band", "globalSequenceField": "hsk3_seq", "firstVerifiedSequence": 1, "lastVerifiedSequence": 21, "expectedLevelCounts": {"1": 21}},
        "counts": {"sourceCandidates": 21, "eligible": 20, "blocked": 1, "excludedPosDiscrepancies": 0, "supplementarySourceLevelLabels": 0, "firstBatch": 20, "eligibleLevelCounts": {"1": 20}, "duplicateGroups": 0, "duplicateRows": 0},
        "plannedBatches": {"firstBatch": "hsk-vocabulary-batch-001.json", "firstBatchPrimaryLevel": 1, "subsequentMaxRows": 50, "subsequentOrdering": "global-sequence-within-primary-level", "repositoryPublishedBatches": 1},
    }


def self_test(script_path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="hearmandarin-hsk-self-test-") as temporary:
        root = Path(temporary) / "mini-repo"
        (root / "scripts").mkdir(parents=True, exist_ok=True)
        shutil.copy2(script_path, root / "scripts" / script_path.name)
        config_dir = root / "data/hsk-import/hearmandarin-hsk-2025-v1"
        config_dir.mkdir(parents=True)
        source_path = Path(temporary) / "source.json"
        source = {
            "name": "HearMandarin HSK 3.0 Word List Dataset", "version": "test-v1", "generated": "test-date", "count": 21, "license": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "HearMandarin (https://hearmandarin.com)",
            "homepage": "https://hearmandarin.com/datasets/", "words": [
                {"id": f"w{index:05d}", "simplified": f"词{index}", "pinyin": f"cí{index}", "hsk3_band": 1, "hsk3_seq": index}
                for index in range(1, 22)
            ],
        }
        source_bytes = json_bytes(source)
        source_path.write_bytes(source_bytes)
        projection = [[row["id"], row["hsk3_seq"], row["hsk3_band"], row["simplified"], row["pinyin"]] for row in source["words"][:20]]
        receipt = {
            "datasetSha256": sha256(source_bytes), "intendedCount": 21, "primaryLevelCounts": {"1": 21},
            "eligibleCount": 20, "eligibleLevelCounts": {"1": 20},
            "versionEvidence": {"datasetVersion": "test-v1", "datasetGenerated": "test-date", "downloadPageVersionLabel": "test-label"},
            "officialArtifactSha256": "test", "officialArtifactUrl": "https://www.chinesetest.cn/syllabus/test.pdf",
            "officialPageUrl": "https://www.chinesetest.cn/syllabus",
            "eligibleProjectionSha256": sha256(json.dumps(projection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")),
            "blocked": [{"globalSequence": 21, "reasons": ["official-numbered-sense-marker-not-retained"]}],
            "supplementarySourceLevelLabels": {}, "excludedFieldDiscrepancies": [],
        }
        receipt_bytes = json_bytes(receipt)
        (config_dir / "official-verification.json").write_bytes(receipt_bytes)
        (config_dir / "source-profile.json").write_bytes(json_bytes(_mini_profile(source_bytes, receipt_bytes)))
        companion = {"authoring": {"status": "ai-provisional", "reviewStatus": "draft", "humanReview": False, "excludedSourceFieldsUsed": []}, "records": [
            {"sourceId": row["id"], "globalSequence": row["hsk3_seq"], "simplified": row["simplified"], "pinyin": row["pinyin"], "japanese": f"語彙{index}。"}
            for index, row in enumerate(source["words"][:20], start=1)
        ]}
        (config_dir / "first-batch-japanese.json").write_bytes(json_bytes(companion))
        copied_script = root / "scripts" / script_path.name

        def invoke(output: Path, input_path: Path = source_path) -> subprocess.CompletedProcess[str]:
            return subprocess.run([sys.executable, str(copied_script), "--source", str(input_path), "--output-dir", str(output)], text=True, capture_output=True, check=False)

        out_a = Path(temporary) / "out-a"
        first = invoke(out_a)
        require(first.returncode == 0, f"self-test clean CLI failed: {first.stderr.strip()}")
        out_b = Path(temporary) / "out-b"
        second = invoke(out_b)
        require(second.returncode == 0, f"self-test repeat CLI failed: {second.stderr.strip()}")
        for name in ("manifest.json", "hsk-vocabulary-batch-001.json"):
            require((out_a / name).read_bytes() == (out_b / name).read_bytes(), f"self-test repeated output drift: {name}")
        manifest = load_json(out_a / "manifest.json")
        batch = load_json(out_a / "hsk-vocabulary-batch-001.json")
        require(manifest["accounting"]["eligible"] == 20 and manifest["accounting"]["blocked"] == 1, "self-test manifest accounting mismatch")
        require(len(batch["vocabulary"]) == 20 and all(row["reviewStatus"] == "draft" for row in batch["vocabulary"]), "self-test batch publication mismatch")

        dirty = Path(temporary) / "dirty"
        dirty.mkdir()
        sentinel = dirty / "developer-sentinel.txt"
        sentinel.write_text("preserve me\n", encoding="utf-8")
        rejected = invoke(dirty)
        require(rejected.returncode != 0 and sentinel.read_text(encoding="utf-8") == "preserve me\n", "self-test dirty output was not rejected safely")
        require(list(dirty.iterdir()) == [sentinel], "self-test dirty output changed the caller directory")

        symlink_target = Path(temporary) / "symlink-target"
        symlink_target.mkdir()
        symlink_sentinel = symlink_target / "developer-sentinel.txt"
        symlink_sentinel.write_text("preserve symlink target\n", encoding="utf-8")
        symlink_output = Path(temporary) / "symlink-output"
        os.symlink(symlink_target, symlink_output, target_is_directory=True)
        rejected = invoke(symlink_output)
        require(rejected.returncode != 0 and symlink_sentinel.read_text(encoding="utf-8") == "preserve symlink target\n", "self-test symlink output was not rejected safely")
        require(list(symlink_target.iterdir()) == [symlink_sentinel], "self-test symlink target was modified")

        wrong_hash = Path(temporary) / "wrong-source.json"
        wrong_hash.write_bytes(source_bytes + b" ")
        rejected = invoke(Path(temporary) / "wrong-hash-out", wrong_hash)
        require(rejected.returncode != 0 and not (Path(temporary) / "wrong-hash-out").exists(), "self-test source hash drift was not rejected before output")

        profile = load_json(config_dir / "source-profile.json")
        for probe_name, path, value, expected_error in (
            ("contradictory source version", ("dataset", "datasetVersion"), "wrong-version", "source identity drift"),
            ("51-row future batch", ("plannedBatches", "subsequentMaxRows"), 51, "no greater than 50"),
            ("boolean future batch limit", ("plannedBatches", "subsequentMaxRows"), True, "maximum must be a positive integer"),
            ("unsupported future ordering", ("plannedBatches", "subsequentOrdering"), "source-file-order", "unsupported subsequent batch ordering"),
            ("contradictory official artifact hash", ("dataset", "sourceCoordinateVerification", "officialArtifactSha256"), "wrong-test-hash", "artifact hash disagrees with receipt"),
            ("contradictory official page", ("dataset", "sourceCoordinateVerification", "page"), "https://wrong.example/syllabus", "page disagrees with receipt"),
        ):
            changed_profile = json.loads(json.dumps(profile))
            target = changed_profile
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            (config_dir / "source-profile.json").write_bytes(json_bytes(changed_profile))
            rejected_output = Path(temporary) / f"rejected-{probe_name.replace(' ', '-')}"
            rejected = invoke(rejected_output)
            require(rejected.returncode != 0 and not rejected_output.exists() and expected_error in rejected.stderr,
                    f"self-test {probe_name} did not reach its intended rejection before output: {rejected.stderr.strip()}")
        (config_dir / "source-profile.json").write_bytes(json_bytes(profile))

        duplicate_source = dict(source)
        duplicate_source["words"] = [dict(row) for row in source["words"]]
        duplicate_source["words"][3]["hsk3_seq"] = 3
        duplicate_bytes = json_bytes(duplicate_source)
        source_path.write_bytes(duplicate_bytes)
        profile = load_json(config_dir / "source-profile.json")
        profile["dataset"]["json"].update({"sha256": sha256(duplicate_bytes), "bytes": len(duplicate_bytes)})
        profile["expectedSourceMetadata"]["count"] = 21
        receipt["datasetSha256"] = sha256(duplicate_bytes)
        (config_dir / "official-verification.json").write_bytes(json_bytes(receipt))
        profile["dataset"]["sourceCoordinateVerification"]["receiptSha256"] = sha256(json_bytes(receipt))
        (config_dir / "source-profile.json").write_bytes(json_bytes(profile))
        rejected = invoke(Path(temporary) / "duplicate-out")
        require(rejected.returncode != 0 and not (Path(temporary) / "duplicate-out").exists(), "self-test duplicate coordinate was not rejected before output")

        source_path.write_bytes(source_bytes)
        profile["dataset"]["json"].update({"sha256": sha256(source_bytes), "bytes": len(source_bytes)})
        receipt["datasetSha256"] = sha256(source_bytes)
        receipt_bytes = json_bytes(receipt)
        (config_dir / "official-verification.json").write_bytes(receipt_bytes)
        profile["dataset"]["sourceCoordinateVerification"]["receiptSha256"] = sha256(receipt_bytes)
        (config_dir / "source-profile.json").write_bytes(json_bytes(profile))
        japanese_companion = load_json(config_dir / "first-batch-japanese.json")
        japanese_companion["records"].pop()
        (config_dir / "first-batch-japanese.json").write_bytes(json_bytes(japanese_companion))
        rejected = invoke(Path(temporary) / "missing-japanese-out")
        require(rejected.returncode != 0 and not (Path(temporary) / "missing-japanese-out").exists(), "self-test incomplete Japanese companion was not rejected before output")
    print("self-test passed: clean CLI repeat, dirty output preservation, symlink output rejection, source hash drift, contradictory source and official receipt identity, invalid future batch plan, duplicate coordinates, incomplete Japanese companion")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--self-test", action="store_true", help="exercise actual CLI in an isolated miniature repository")
    group.add_argument("--source", type=Path, help="local exact pinned HearMandarin JSON input")
    parser.add_argument("--output-dir", type=Path, help="new or empty output directory")
    args = parser.parse_args(argv)
    script_path = Path(__file__).resolve()
    try:
        if args.self_test:
            self_test(script_path)
        else:
            require(args.output_dir is not None, "--output-dir is required with --source")
            run_import(script_path.parent.parent, args.source, args.output_dir)
    except (ImportFailure, OSError, KeyError, TypeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
