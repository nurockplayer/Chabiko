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
PUBLICATION_INDEX_REL = Path("data/hsk-import/hearmandarin-hsk-2025-v1/publication-index.json")
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
    require(profile.get("profileVersion") == 2, "unsupported source profile version")
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
    require("repositoryPublishedBatches" not in plan, "source profile cannot carry a mutable repository publication count")


def load_configuration(repo_root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
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
    publication_index = load_json(repo_root / PUBLICATION_INDEX_REL)
    return profile, receipt, japanese, publication_index


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


def _validate_japanese(japanese: dict[str, Any], placement_rows: list[dict[str, Any]], placement: str) -> list[dict[str, Any]]:
    authoring = japanese.get("authoring")
    require(isinstance(authoring, dict), "Japanese authoring metadata is missing")
    require(authoring.get("status") == "ai-provisional" and authoring.get("reviewStatus") == "draft", "Japanese authoring must remain AI-provisional draft")
    require(authoring.get("humanReview") is False, "Japanese authoring cannot claim human review")
    require(authoring.get("excludedSourceFieldsUsed") == [], "Japanese authoring declares use of excluded source fields")
    records = japanese.get("records")
    require(isinstance(records, list) and len(records) == len(placement_rows), f"Japanese companion must contain exactly placement {placement}")
    for index, (companion, source) in enumerate(zip(records, placement_rows, strict=True), start=1):
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


def _placement_filename(placement: str) -> str:
    if placement == "batch-001":
        return FIRST_BATCH_FILENAME
    parts = placement.split("-")
    require(len(parts) == 5 and parts[0] == "planned" and parts[1] == "level" and parts[3] == "batch"
            and parts[2].isdigit() and parts[4].isdigit(), f"invalid planned placement name: {placement}")
    level = int(parts[2])
    batch_number = int(parts[4])
    require(1 <= level <= 4 and batch_number >= 1, f"invalid planned placement name: {placement}")
    return f"hsk-vocabulary-level-{level}-batch-{batch_number:03d}.json"


def _companion_path(placement: str) -> Path:
    if placement == "batch-001":
        return JAPANESE_REL
    filename = _placement_filename(placement)
    return PROFILE_REL.parent / "japanese" / filename.removeprefix("hsk-vocabulary-")


def _validate_publication_index_header(publication_index: Any) -> list[str]:
    require(isinstance(publication_index, dict), "publication index must be an object")
    require(set(publication_index) == {"publicationIndexVersion", "placements"}, "publication index has unsupported fields")
    version = publication_index.get("publicationIndexVersion")
    require(isinstance(version, int) and not isinstance(version, bool) and version == 1,
            "publication index version must be the integer 1")
    declarations = publication_index.get("placements")
    require(isinstance(declarations, list) and declarations, "publication index placements must be a nonempty array")
    require(all(isinstance(item, str) and item for item in declarations), "publication index placements must be nonempty strings")
    require(len(set(declarations)) == len(declarations), "publication index contains duplicate placements")
    require(declarations[0] == "batch-001", "publication index must begin with batch-001")
    return declarations


def build_outputs(source_bytes: bytes, source: dict[str, Any], profile: dict[str, Any], receipt: dict[str, Any], japanese_by_placement: dict[str, dict[str, Any]], publication_index: dict[str, Any]) -> tuple[bytes, dict[str, bytes]]:
    require(sha256(source_bytes) == profile["dataset"]["json"]["sha256"], "source JSON SHA256 does not match the pinned source profile")
    require(len(source_bytes) == profile["dataset"]["json"]["bytes"], "source JSON byte count does not match the pinned source profile")
    _check_source_metadata(source, profile)
    rows = _primary_coordinates(source, profile)
    require(len(rows) == profile["counts"]["sourceCandidates"], "source candidate count does not match profile")
    blocked, supplementary_labels, projection_sha = _validate_receipt(rows, profile, receipt)
    eligible = [row for row in rows if row["globalSequence"] not in blocked]
    first_batch_count = profile["counts"]["firstBatch"]
    first_batch_rows = eligible[:first_batch_count]
    require(len({row["primaryLevel"] for row in first_batch_rows}) == 1, "first batch must contain one primary level")
    require(first_batch_rows[0]["primaryLevel"] == profile["plannedBatches"]["firstBatchPrimaryLevel"], "first batch primary level drifted")

    placement_rows: dict[str, list[dict[str, Any]]] = {"batch-001": first_batch_rows}
    placements: dict[int, str] = {row["globalSequence"]: "batch-001" for row in first_batch_rows}
    by_level: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible[first_batch_count:]:
        by_level[row["primaryLevel"]].append(row)
    max_chunk = profile["plannedBatches"]["subsequentMaxRows"]
    for level in sorted(by_level):
        for chunk_index, start in enumerate(range(0, len(by_level[level]), max_chunk), start=1):
            placement = f"planned-level-{level}-batch-{chunk_index + 1:03d}"
            placement_rows[placement] = by_level[level][start:start + max_chunk]
            for row in placement_rows[placement]:
                placements[row["globalSequence"]] = placement

    declarations = _validate_publication_index_header(publication_index)
    ordered_plan = list(placement_rows)
    require(declarations == [item for item in ordered_plan if item in set(declarations)], "publication index placements must follow manifest plan order")
    require(all(item in placement_rows for item in declarations), "publication index names an unknown or incomplete placement")

    companions: dict[str, list[dict[str, Any]]] = {}
    for placement in declarations:
        require(placement in japanese_by_placement, f"Japanese companion is missing for declared placement {placement}")
        companions[placement] = _validate_japanese(japanese_by_placement[placement], placement_rows[placement], placement)

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
            "repositoryPublication": "blocked" if is_blocked else ("draft-published-to-repository" if placements.get(sequence) in declarations else "planned-not-published"),
            "batchPlacement": None if is_blocked else placements[sequence],
            "disposition": "blocked" if is_blocked else "eligible",
        }
        if is_blocked:
            item["blockedReason"] = blocked[sequence]
        else:
            item["simplified"] = row["simplified"]
            item["pinyin"] = row["pinyin"]
            if placements.get(sequence) in declarations:
                item["repositoryBatchFile"] = _placement_filename(placements[sequence])
        manifest_rows.append(item)

    batch_outputs: dict[str, bytes] = {}
    batch_entries: list[dict[str, Any]] = []
    for placement in declarations:
        records: list[dict[str, Any]] = []
        for source_row, ja_row in zip(placement_rows[placement], companions[placement], strict=True):
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
        batch_bytes = json_bytes({"vocabulary": records})
        filename = _placement_filename(placement)
        batch_outputs[filename] = batch_bytes
        batch_entries.append({
            "placement": placement,
            "file": filename,
            "records": len(records),
            "primaryLevel": placement_rows[placement][0]["primaryLevel"],
            "sha256": sha256(batch_bytes),
        })
    manifest = {
        "manifestVersion": 2,
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
            "batches": batch_entries,
            "repositoryPublishedBatchCount": len(batch_entries),
            "repositoryPublishedRecordCount": sum(entry["records"] for entry in batch_entries),
            "sourceEligibleIsHumanReviewed": False,
            "sourceEligibleIsRuntimeAvailable": False,
        },
        "rows": manifest_rows,
    }
    return json_bytes(manifest), batch_outputs


def write_outputs(output_dir: Path, manifest_bytes: bytes, batch_outputs: dict[str, bytes]) -> None:
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
        for filename, data in batch_outputs.items():
            (stage / filename).write_bytes(data)
        if not existed:
            output.mkdir()
            made_output = True
        require(output.is_dir() and not output.is_symlink(), "output directory changed during import")
        require(not any(output.iterdir()), "output directory changed and is no longer empty")
        for name in ("manifest.json", *batch_outputs):
            os.link(stage / name, output / name)
    except Exception:
        if made_output and output.is_dir() and not any(output.iterdir()):
            output.rmdir()
        raise
    finally:
        shutil.rmtree(stage)


def run_import(repo_root: Path, source_path: Path, output_dir: Path) -> None:
    profile, receipt, japanese, publication_index = load_configuration(repo_root)
    japanese_by_placement = {"batch-001": japanese}
    for placement in _validate_publication_index_header(publication_index):
        if placement == "batch-001":
            continue
        companion_path = repo_root / _companion_path(placement)
        japanese_by_placement[placement] = load_json(companion_path)
    if source_path.is_symlink():
        raise ImportFailure("source JSON cannot be a symlink")
    try:
        source_bytes = source_path.read_bytes()
        source = json.loads(source_bytes.decode("utf-8"), object_pairs_hook=_unique_object)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ImportFailure(f"cannot read valid UTF-8 source JSON: {error}") from error
    require(isinstance(source, dict), "source JSON root must be an object")
    manifest_bytes, batch_outputs = build_outputs(source_bytes, source, profile, receipt, japanese_by_placement, publication_index)
    write_outputs(output_dir, manifest_bytes, batch_outputs)
    print(f"wrote {output_dir}/manifest.json ({sha256(manifest_bytes)})")
    for filename, batch_bytes in batch_outputs.items():
        print(f"wrote {output_dir}/{filename} ({sha256(batch_bytes)})")


def _mini_profile(source_bytes: bytes, receipt_bytes: bytes) -> dict[str, Any]:
    source_hash = sha256(source_bytes)
    return {
        "profileVersion": 2,
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
        "plannedBatches": {"firstBatch": "hsk-vocabulary-batch-001.json", "firstBatchPrimaryLevel": 1, "subsequentMaxRows": 50, "subsequentOrdering": "global-sequence-within-primary-level"},
    }


def self_test(script_path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="hearmandarin-hsk-self-test-") as temporary:
        root = Path(temporary) / "mini-repo"
        (root / "scripts").mkdir(parents=True, exist_ok=True)
        shutil.copy2(script_path, root / "scripts" / script_path.name)
        config_dir = root / "data/hsk-import/hearmandarin-hsk-2025-v1"
        config_dir.mkdir(parents=True)
        base_publication_index = {"publicationIndexVersion": 1, "placements": ["batch-001"]}
        (config_dir / "publication-index.json").write_bytes(json_bytes(base_publication_index))
        source_path = Path(temporary) / "source.json"
        source_ids = [
            "fixture-kite", "fixture-orchid", "fixture-river", "fixture-copper", "fixture-cedar",
            "fixture-moon", "fixture-linen", "fixture-amber", "fixture-cloud", "fixture-pebble",
            "fixture-fern", "fixture-comet", "fixture-maple", "fixture-glass", "fixture-island",
            "fixture-saffron", "fixture-willow", "fixture-lantern", "fixture-slate", "fixture-harbor",
            "fixture-plum",
        ]
        source = {
            "name": "HearMandarin HSK 3.0 Word List Dataset", "version": "test-v1", "generated": "test-date", "count": 21, "license": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "HearMandarin (https://hearmandarin.com)",
            "homepage": "https://hearmandarin.com/datasets/", "words": [
                {"id": source_ids[index - 1], "simplified": f"词{index}", "pinyin": f"cí{index}", "hsk3_band": 1, "hsk3_seq": index}
                for index in range(1, len(source_ids) + 1)
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
        copied_script = root / "scripts" / script_path.name
        base_profile = _mini_profile(source_bytes, receipt_bytes)
        base_receipt = json.loads(receipt_bytes.decode("utf-8"))

        def clone(value: Any) -> Any:
            return json.loads(json.dumps(value, ensure_ascii=False))

        def write_inputs(source_data: bytes, profile_data: dict[str, Any], receipt_data: dict[str, Any], japanese_data: dict[str, Any]) -> None:
            source_path.write_bytes(source_data)
            (config_dir / "official-verification.json").write_bytes(json_bytes(receipt_data))
            (config_dir / "source-profile.json").write_bytes(json_bytes(profile_data))
            (config_dir / "first-batch-japanese.json").write_bytes(json_bytes(japanese_data))
            (config_dir / "publication-index.json").write_bytes(json_bytes(base_publication_index))

        def reset_inputs() -> None:
            write_inputs(source_bytes, clone(base_profile), clone(base_receipt), clone(companion))

        def repin_source_variant(source_data: dict[str, Any]) -> tuple[bytes, dict[str, Any], dict[str, Any]]:
            changed_source = clone(source_data)
            changed_source["count"] = len(changed_source["words"])
            changed_bytes = json_bytes(changed_source)
            changed_profile = clone(base_profile)
            changed_receipt = clone(base_receipt)
            changed_profile["expectedSourceMetadata"]["count"] = changed_source["count"]
            changed_profile["dataset"]["json"].update({"sha256": sha256(changed_bytes), "bytes": len(changed_bytes), "rows": changed_source["count"]})
            changed_profile["dataset"]["csv"]["rows"] = changed_source["count"]
            changed_receipt["datasetSha256"] = sha256(changed_bytes)
            changed_receipt_bytes = json_bytes(changed_receipt)
            changed_profile["dataset"]["sourceCoordinateVerification"]["receiptSha256"] = sha256(changed_receipt_bytes)
            write_inputs(changed_bytes, changed_profile, changed_receipt, clone(companion))
            return changed_bytes, changed_profile, changed_receipt

        def invoke(output: Path, input_path: Path = source_path) -> subprocess.CompletedProcess[str]:
            return subprocess.run([sys.executable, str(copied_script), "--source", str(input_path), "--output-dir", str(output)], text=True, capture_output=True, check=False)

        rejection_case_count = 0

        def reject_case(
            name: str,
            expected_error: str,
            setup: Any | None = None,
            expected_output_exists: bool = False,
            preserve: Any | None = None,
        ) -> None:
            nonlocal rejection_case_count
            reset_inputs()
            slug = name.lower().replace(" ", "-")
            output = Path(temporary) / f"case-{slug}"
            input_path = setup(output) if setup is not None else source_path
            result = invoke(output, input_path)
            output_remains = output.exists() or output.is_symlink()
            require(result.returncode != 0 and expected_error in result.stderr,
                    f"self-test {name} did not reach intended rejection: {result.stderr.strip()}")
            require(output_remains is expected_output_exists, f"self-test {name} output-path state changed unexpectedly")
            if preserve is not None:
                require(preserve(output), f"self-test {name} changed pre-existing caller data")
            rejection_case_count += 1

        out_a = Path(temporary) / "out-a"
        reset_inputs()
        first = invoke(out_a)
        require(first.returncode == 0, f"self-test clean CLI failed: {first.stderr.strip()}")
        out_b = Path(temporary) / "out-b"
        reset_inputs()
        second = invoke(out_b)
        require(second.returncode == 0, f"self-test repeat CLI failed: {second.stderr.strip()}")
        for name in ("manifest.json", "hsk-vocabulary-batch-001.json"):
            require((out_a / name).read_bytes() == (out_b / name).read_bytes(), f"self-test repeated output drift: {name}")
        manifest = load_json(out_a / "manifest.json")
        batch = load_json(out_a / "hsk-vocabulary-batch-001.json")
        require(manifest["manifestVersion"] == 2 and manifest["accounting"]["eligible"] == 20 and manifest["accounting"]["blocked"] == 1, "self-test manifest accounting mismatch")
        require(manifest["publication"]["repositoryPublishedBatchCount"] == 1 and manifest["publication"]["repositoryPublishedRecordCount"] == 20, "self-test publication accounting mismatch")
        require(len(batch["vocabulary"]) == 20 and all(row["reviewStatus"] == "draft" for row in batch["vocabulary"]), "self-test batch publication mismatch")

        empty_output = Path(temporary) / "existing-empty-output"
        empty_output.mkdir()
        reset_inputs()
        empty_result = invoke(empty_output)
        require(empty_result.returncode == 0 and {path.name for path in empty_output.iterdir()} == {"manifest.json", "hsk-vocabulary-batch-001.json"},
                f"self-test existing empty output failed: {empty_result.stderr.strip()}")

        def profile_probe(path: tuple[str, ...], value: Any) -> Any:
            def setup(_output: Path) -> Path:
                profile_value = clone(base_profile)
                target = profile_value
                for key in path[:-1]:
                    target = target[key]
                target[path[-1]] = value
                write_inputs(source_bytes, profile_value, clone(base_receipt), clone(companion))
                return source_path
            return setup

        def source_probe(change: Any, profile_change: Any | None = None) -> Any:
            def setup(_output: Path) -> Path:
                changed_source = clone(source)
                change(changed_source)
                changed_bytes, profile_value, _receipt_value = repin_source_variant(changed_source)
                if profile_change is not None:
                    profile_change(profile_value)
                current_receipt = load_json(config_dir / "official-verification.json")
                current_japanese = clone(companion)
                write_inputs(changed_bytes, profile_value, current_receipt, current_japanese)
                return source_path
            return setup

        reject_case("source hash drift", "source JSON SHA256 does not match the pinned source profile",
                    setup=lambda _output: (source_path.write_bytes(source_bytes + b" "), source_path)[1])
        reject_case("source version drift", "source metadata drift at 'version'",
                    setup=source_probe(lambda value: value.__setitem__("version", "different-source-version")))
        reject_case("source license metadata drift", "source metadata drift at 'license'",
                    setup=source_probe(lambda value: value.__setitem__("license", "CC0")))
        reject_case("contradictory profile version", "profile source identity drift at 'datasetVersion'",
                    setup=profile_probe(("dataset", "datasetVersion"), "wrong-version"))
        reject_case("51-row future batch", "no greater than 50",
                    setup=profile_probe(("plannedBatches", "subsequentMaxRows"), 51))
        reject_case("boolean future batch limit", "maximum must be a positive integer",
                    setup=profile_probe(("plannedBatches", "subsequentMaxRows"), True))
        reject_case("unsupported future ordering", "unsupported subsequent batch ordering",
                    setup=profile_probe(("plannedBatches", "subsequentOrdering"), "source-file-order"))
        reject_case("boolean publication index version", "publication index version must be the integer 1",
                    setup=lambda _output: (config_dir.joinpath("publication-index.json").write_bytes(
                        json_bytes({"publicationIndexVersion": True, "placements": ["batch-001"]})), source_path)[1])
        reject_case("contradictory official artifact hash", "official verification artifact hash disagrees with receipt",
                    setup=profile_probe(("dataset", "sourceCoordinateVerification", "officialArtifactSha256"), "wrong-test-hash"))
        reject_case("contradictory official page", "official verification page disagrees with receipt",
                    setup=profile_probe(("dataset", "sourceCoordinateVerification", "page"), "https://wrong.example/syllabus"))

        reject_case("duplicate global coordinate", "duplicate global sequence 3",
                    setup=source_probe(lambda value: value["words"][3].__setitem__("hsk3_seq", 3)))
        reject_case("missing global coordinate", "missing or extra verified global sequence coordinate",
                    setup=source_probe(lambda value: value["words"][20].__setitem__("hsk3_seq", 22)))
        reject_case("global sequence below frozen range", "missing or extra verified global sequence coordinate",
                    setup=source_probe(lambda value: value["words"][0].__setitem__("hsk3_seq", 0)))
        reject_case("extra verified coordinate range", "official receipt candidate count disagrees with frozen source coordinates",
                    setup=source_probe(
                        lambda value: value["words"].append({"id": "fixture-extra", "simplified": "额外", "pinyin": "éwài", "hsk3_band": 1, "hsk3_seq": 22}),
                        profile_change=lambda value: value["coordinate"].__setitem__("lastVerifiedSequence", 22),
                    ))
        reject_case("source primary level drift", "source primary-level coordinate counts drifted",
                    setup=source_probe(lambda value: value["words"][0].__setitem__("hsk3_band", 2)))
        reject_case(f"duplicate opaque source ID", f"duplicate source ID {source_ids[19]}",
                    setup=source_probe(lambda value: value["words"][20].__setitem__("id", value["words"][19]["id"])))
        reject_case("opaque source ID drift", "complete retained eligible projection digest",
                    setup=source_probe(lambda value: value["words"][19].__setitem__("id", "opaque-renamed-id")))
        reject_case("Simplified source text drift", "complete retained eligible projection digest",
                    setup=source_probe(lambda value: value["words"][19].__setitem__("simplified", "改字")))
        reject_case("pinyin source drift", "complete retained eligible projection digest",
                    setup=source_probe(lambda value: value["words"][19].__setitem__("pinyin", "gǎibiàn")))

        def receipt_probe(change: Any) -> Any:
            def setup(_output: Path) -> Path:
                profile_value = clone(base_profile)
                receipt_value = clone(base_receipt)
                change(receipt_value)
                receipt_bytes_value = json_bytes(receipt_value)
                profile_value["dataset"]["sourceCoordinateVerification"]["receiptSha256"] = sha256(receipt_bytes_value)
                write_inputs(source_bytes, profile_value, receipt_value, clone(companion))
                return source_path
            return setup

        reject_case("receipt proof digest drift", "complete retained eligible projection digest",
                    setup=receipt_probe(lambda value: value.__setitem__("eligibleProjectionSha256", "0" * 64)))
        reject_case("quarantine coordinate drift", "complete retained eligible projection digest",
                    setup=receipt_probe(lambda value: value["blocked"][0].__setitem__("globalSequence", 20)))
        reject_case("receipt eligible count drift", "official receipt eligible count disagrees with profile accounting",
                    setup=receipt_probe(lambda value: value.__setitem__("eligibleCount", 19)))

        def japanese_probe(change: Any) -> Any:
            def setup(_output: Path) -> Path:
                japanese_value = clone(companion)
                change(japanese_value)
                write_inputs(source_bytes, clone(base_profile), clone(base_receipt), japanese_value)
                return source_path
            return setup

        reject_case("Japanese source join mismatch", "Japanese companion sourceId mismatch at row 1",
                    setup=japanese_probe(lambda value: value["records"][0].__setitem__("sourceId", "not-the-source-id")))
        reject_case("missing Japanese record", "Japanese companion must contain exactly placement batch-001",
                    setup=japanese_probe(lambda value: value["records"].pop()))
        reject_case("extra Japanese record", "Japanese companion must contain exactly placement batch-001",
                    setup=japanese_probe(lambda value: value["records"].append(clone(value["records"][-1]))))

        reject_case("malformed source JSON", "cannot read valid UTF-8 source JSON",
                    setup=lambda _output: (source_path.write_bytes(b"{not-json"), source_path)[1])
        reject_case("duplicate source JSON key", "duplicate JSON object key: name",
                    setup=lambda _output: (source_path.write_bytes(b'{"name":"first","name":"second"}'), source_path)[1])
        source_link = Path(temporary) / "source-link.json"
        reject_case("source JSON symlink", "source JSON cannot be a symlink",
                    setup=lambda _output: (os.symlink(source_path, source_link) or source_link))

        def nested_sentinel(output: Path) -> Path:
            sentinel = output / "developer-owned" / "nested" / "sentinel.txt"
            sentinel.parent.mkdir(parents=True)
            sentinel.write_text("preserve nested sentinel\n", encoding="utf-8")
            return source_path
        reject_case("nested dirty output", "output directory must be empty", setup=nested_sentinel, expected_output_exists=True,
                    preserve=lambda output: (output / "developer-owned/nested/sentinel.txt").read_text(encoding="utf-8") == "preserve nested sentinel\n"
                    and list((output / "developer-owned/nested").iterdir()) == [output / "developer-owned/nested/sentinel.txt"])

        def existing_file(output: Path) -> Path:
            output.write_text("preserve existing file\n", encoding="utf-8")
            return source_path
        reject_case("existing file output", "output path exists and is not a directory", setup=existing_file, expected_output_exists=True,
                    preserve=lambda output: output.read_text(encoding="utf-8") == "preserve existing file\n")

        symlink_target = Path(temporary) / "symlink-target"
        symlink_sentinel = symlink_target / "developer-sentinel.txt"
        def symlink_output_setup(output: Path) -> Path:
            symlink_target.mkdir()
            symlink_sentinel.write_text("preserve symlink target\n", encoding="utf-8")
            os.symlink(symlink_target, output, target_is_directory=True)
            return source_path
        reject_case("symlink output", "output directory cannot be a symlink", setup=symlink_output_setup, expected_output_exists=True,
                    preserve=lambda _output: symlink_sentinel.read_text(encoding="utf-8") == "preserve symlink target\n"
                    and list(symlink_target.iterdir()) == [symlink_sentinel])

        broken_target = Path(temporary) / "missing-output-target"
        def broken_symlink_setup(output: Path) -> Path:
            os.symlink(broken_target, output, target_is_directory=True)
            return source_path
        reject_case("broken symlink output", "output directory cannot be a symlink", setup=broken_symlink_setup, expected_output_exists=True,
                    preserve=lambda output: output.is_symlink() and not broken_target.exists())

        require(rejection_case_count == 32, f"self-test negative CLI probe count changed: {rejection_case_count}")

    print(f"self-test passed: {rejection_case_count} negative CLI probes plus clean/repeat/empty-dir CLI success")


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
