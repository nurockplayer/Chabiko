"""Teacher-specific human review gate and promoted learner projection.

The authoring sidecar remains draft/source evidence.  This module is the only
writer allowed to derive the runtime projection, and it does so atomically per
source cell from exact current human evidence plus a separate maintainer action.
"""

from __future__ import annotations

import datetime as dt
import copy
import hashlib
import json
import os
import re
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from scripts.teacher_phrase_sidecar import (
        CONTRACT_ID as SIDECAR_CONTRACT_ID,
        ContractError,
        RIGHTS_REF,
        SOURCE_COLUMN,
        extract_source_units,
        manifest_semantic_sha256,
        normalize_example,
        phrase_id,
        serialize_sidecar,
        sha256_bytes,
        source_revision,
        validate_manifest_workbook_digest,
        validate_sidecar,
    )
except ModuleNotFoundError:  # Direct execution from the scripts directory.
    from teacher_phrase_sidecar import (  # type: ignore[no-redef]
        CONTRACT_ID as SIDECAR_CONTRACT_ID,
        ContractError,
        RIGHTS_REF,
        SOURCE_COLUMN,
        extract_source_units,
        manifest_semantic_sha256,
        normalize_example,
        phrase_id,
        serialize_sidecar,
        sha256_bytes,
        source_revision,
        validate_manifest_workbook_digest,
        validate_sidecar,
    )


REVIEW_CONTRACT_ID = "teacher-phrase-human-review-v1"
EVIDENCE_CONTRACT_ID = "teacher-phrase-promotion-evidence-v1"
PROJECTION_CONTRACT_ID = "teacher-phrase-promoted-v1"
REVIEW_VERSION_DOMAIN = "teacher-phrase-review-v1"
REQUIRED_REVIEW_ROLES = (
    "human-language-reviewer",
    "human-script-verifier",
    "human-teaching-reviewer",
    "human-source-reviewer",
)
REVIEW_OUTCOMES = frozenset({"accepted", "needs-changes", "rejected", "not-reviewed"})
LEARNER_FIELDS = ("simplified", "traditional", "pinyin", "japanese")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
PHRASE_ID_PATTERN = re.compile(r"teacher-phrase-v1-[0-9a-f]{64}")
SOURCE_REVISION_PATTERN = re.compile(r"teacher-phrase-source-v1-[0-9a-f]{64}")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractError(message)


def _is_non_empty_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_iso_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return dt.date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _canonical_digest(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def sidecar_sha256(sidecar: dict[str, Any]) -> str:
    return hashlib.sha256(serialize_sidecar(sidecar)).hexdigest()


def compute_review_version(record: dict[str, Any]) -> str:
    """Fingerprint ordered learner-visible strings and per-field provenance.

    Raw source formatting, source ranges, sourceRevision, and mutable decisions
    are deliberately excluded.  The separate source gate binds sourceRevision.
    """
    phrases = record.get("teacherPhrases")
    _require(isinstance(record.get("learnerId"), str), "review record needs a learner ID")
    _require(isinstance(phrases, list) and phrases, "review record needs teacher phrases")
    review_phrases: list[dict[str, Any]] = []
    for index, phrase in enumerate(phrases):
        _require(isinstance(phrase, dict), f"review phrase {index} must be an object")
        visible = {
            field: phrase[field]
            for field in LEARNER_FIELDS
            if field in phrase
        }
        provenance = phrase.get("fieldProvenance")
        _require(isinstance(provenance, dict), f"review phrase {index} needs field provenance")
        review_phrases.append(
            {
                "phraseId": phrase.get("phraseId"),
                **visible,
                "fieldProvenance": {
                    field: provenance.get(field)
                    for field in visible
                },
            }
        )
    return _canonical_digest(
        {
            "domain": REVIEW_VERSION_DOMAIN,
            "learnerId": record["learnerId"],
            "teacherPhrases": review_phrases,
        }
    )


def serialize_projection(projection: dict[str, Any]) -> bytes:
    return (json.dumps(projection, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def serialize_promotion_evidence(evidence: dict[str, Any]) -> bytes:
    return (json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def atomic_write_projection(path: Path, projection: dict[str, Any]) -> None:
    _atomic_write_bytes(path, serialize_projection(projection))


def atomic_write_promotion_evidence(path: Path, evidence: dict[str, Any]) -> None:
    _atomic_write_bytes(path, serialize_promotion_evidence(evidence))


def _initialize_bytes(path: Path, payload: bytes, label: str) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary_path, path)
        except FileExistsError as error:
            raise ContractError(f"{label} already exists: {path}") from error
        stat = path.stat()
        return stat.st_dev, stat.st_ino
    finally:
        temporary_path.unlink(missing_ok=True)


def initialize_empty_projection(
    path: Path,
    projection: dict[str, Any],
) -> tuple[int, int]:
    """Atomically create the first empty artifact without replacing a target."""
    _require(projection.get("records") == [], "initial projection must be empty")
    return _initialize_bytes(
        path,
        serialize_projection(projection),
        "promoted projection",
    )


def initialize_empty_promotion_evidence(
    path: Path,
    evidence: dict[str, Any],
) -> tuple[int, int]:
    _require(
        evidence.get("sidecarSnapshot") is None
        and evidence.get("reviewSnapshot") is None,
        "initial promotion evidence must be empty",
    )
    return _initialize_bytes(
        path,
        serialize_promotion_evidence(evidence),
        "promotion evidence",
    )


def _validate_phrase_ids(value: object, expected: list[str], label: str) -> None:
    _require(
        isinstance(value, list) and value == expected,
        f"{label} must cover the complete ordered phrase set",
    )


def _validate_attribution(
    evidence: dict[str, Any],
    *,
    label: str,
    expected_review_version: str,
    expected_phrase_ids: list[str],
) -> None:
    _require(_is_non_empty_text(evidence.get("reviewerIdentity")), f"{label} needs reviewer identity")
    _require(_is_iso_date(evidence.get("reviewDate")), f"{label} needs an ISO review date")
    _require(_is_non_empty_text(evidence.get("findings")), f"{label} needs findings")
    _require(
        evidence.get("reviewVersion") == expected_review_version,
        f"{label} reviewVersion is stale",
    )
    _validate_phrase_ids(evidence.get("reviewedPhraseIds"), expected_phrase_ids, label)


def _validate_review_record(
    review_record: dict[str, Any],
    sidecar_record: dict[str, Any],
) -> bool:
    learner_id = sidecar_record["learnerId"]
    expected_keys = {
        "learnerId",
        "sourceRevision",
        "reviewVersion",
        "orderedPhraseIds",
        "roleEvidence",
        "overallDecision",
        "maintainerPromotion",
    }
    _require(set(review_record) == expected_keys, f"review record '{learner_id}' has invalid keys")
    expected_source_revision = sidecar_record["source"]["sourceRevision"]
    _require(
        review_record.get("sourceRevision") == expected_source_revision,
        f"review record '{learner_id}' sourceRevision is stale",
    )
    expected_review_version = compute_review_version(sidecar_record)
    _require(
        review_record.get("reviewVersion") == expected_review_version,
        f"review record '{learner_id}' reviewVersion is stale",
    )
    phrase_ids = [phrase["phraseId"] for phrase in sidecar_record["teacherPhrases"]]
    _validate_phrase_ids(
        review_record.get("orderedPhraseIds"),
        phrase_ids,
        f"review record '{learner_id}'",
    )

    role_evidence = review_record.get("roleEvidence")
    _require(isinstance(role_evidence, list), f"review record '{learner_id}' role evidence must be an array")
    by_role: dict[str, dict[str, Any]] = {}
    for index, evidence in enumerate(role_evidence):
        label = f"review record '{learner_id}' role evidence {index}"
        _require(isinstance(evidence, dict), f"{label} must be an object")
        role = evidence.get("role")
        expected_evidence_keys = {
            "role",
            "outcome",
            "reviewerIdentity",
            "reviewDate",
            "reviewVersion",
            "reviewedPhraseIds",
            "findings",
        }
        if role == "human-source-reviewer":
            expected_evidence_keys.add("sourceRevision")
        _require(set(evidence) == expected_evidence_keys, f"{label} has invalid keys")
        _require(role in REQUIRED_REVIEW_ROLES and role not in by_role, f"{label} has wrong or duplicate role evidence")
        _require(evidence.get("outcome") in REVIEW_OUTCOMES, f"{label} has unsupported outcome")
        if evidence["outcome"] == "not-reviewed":
            _require(
                evidence.get("reviewerIdentity") is None
                and evidence.get("reviewDate") is None
                and evidence.get("reviewVersion") is None
                and evidence.get("reviewedPhraseIds") == []
                and evidence.get("findings") is None,
                f"{label} not-reviewed evidence must remain unattributed and unbound",
            )
            if role == "human-source-reviewer":
                _require(evidence.get("sourceRevision") is None, f"{label} not-reviewed sourceRevision must be null")
        else:
            _validate_attribution(
                evidence,
                label=label,
                expected_review_version=expected_review_version,
                expected_phrase_ids=phrase_ids,
            )
            if role == "human-source-reviewer":
                _require(
                    evidence.get("sourceRevision") == expected_source_revision,
                    f"{label} sourceRevision is stale",
                )
        by_role[role] = evidence
    _require(
        tuple(by_role) == REQUIRED_REVIEW_ROLES,
        f"review record '{learner_id}' must contain the exact ordered role evidence matrix",
    )

    overall = review_record.get("overallDecision")
    if overall is not None:
        label = f"review record '{learner_id}' overallDecision"
        _require(isinstance(overall, dict), f"{label} must be an object or null")
        _require(
            set(overall)
            == {
                "outcome",
                "reviewerIdentity",
                "reviewerRole",
                "reviewDate",
                "reviewVersion",
                "reviewedPhraseIds",
                "findings",
            },
            f"{label} has invalid keys",
        )
        _require(overall.get("outcome") in REVIEW_OUTCOMES - {"not-reviewed"}, f"{label} has unsupported outcome")
        _require(overall.get("reviewerRole") == "maintainer", f"{label} must be attributed to a maintainer")
        _validate_attribution(
            overall,
            label=label,
            expected_review_version=expected_review_version,
            expected_phrase_ids=phrase_ids,
        )

    promotion = review_record.get("maintainerPromotion")
    if promotion is not None:
        label = f"review record '{learner_id}' maintainerPromotion"
        _require(isinstance(promotion, dict), f"{label} must be an object or null")
        _require(
            set(promotion)
            == {
                "action",
                "maintainerIdentity",
                "promotionDate",
                "reviewVersion",
                "sourceRevision",
                "reviewedPhraseIds",
                "findings",
            },
            f"{label} has invalid keys",
        )
        _require(promotion.get("action") == "promote", f"{label} has unsupported action")
        _require(_is_non_empty_text(promotion.get("maintainerIdentity")), f"{label} needs maintainer identity")
        _require(_is_iso_date(promotion.get("promotionDate")), f"{label} needs an ISO promotion date")
        _require(_is_non_empty_text(promotion.get("findings")), f"{label} needs findings")
        _require(promotion.get("reviewVersion") == expected_review_version, f"{label} reviewVersion is stale")
        _require(promotion.get("sourceRevision") == expected_source_revision, f"{label} sourceRevision is stale")
        _validate_phrase_ids(promotion.get("reviewedPhraseIds"), phrase_ids, label)

    return (
        all(evidence["outcome"] == "accepted" for evidence in by_role.values())
        and overall is not None
        and overall["outcome"] == "accepted"
        and promotion is not None
    )


def _cell_is_learner_safe(record: dict[str, Any]) -> bool:
    for phrase in record["teacherPhrases"]:
        if not all(_is_non_empty_text(phrase.get(field)) for field in ("simplified", "pinyin", "japanese")):
            return False
        visible_fields = [field for field in LEARNER_FIELDS if field in phrase]
        if any(
            phrase["fieldProvenance"][field]["provenance"] == "generated"
            for field in visible_fields
        ):
            return False
    return True


def _projection_phrase(phrase: dict[str, Any]) -> dict[str, str]:
    return {
        "phraseId": phrase["phraseId"],
        **{field: phrase[field] for field in LEARNER_FIELDS if field in phrase},
    }


def _promotion_base(
    manifest: dict[str, Any],
    sidecar_digest: str | None,
) -> dict[str, Any]:
    source = manifest.get("source")
    workbook_sha256 = source.get("workbookSha256") if isinstance(source, dict) else None
    validate_manifest_workbook_digest(manifest, workbook_sha256)
    return {
        "sidecarSchemaVersion": 1,
        "sidecarContractId": SIDECAR_CONTRACT_ID,
        "sidecarSha256": sidecar_digest,
        "learnerManifestSemanticSha256": manifest_semantic_sha256(manifest),
        "workbookSha256": workbook_sha256,
    }


def build_empty_promotion_evidence(manifest: dict[str, Any]) -> dict[str, Any]:
    rows = manifest.get("rows")
    _require(isinstance(rows, list), "learner manifest rows must be an array")
    return {
        "schemaVersion": 1,
        "contractId": EVIDENCE_CONTRACT_ID,
        "base": _promotion_base(manifest, None),
        "sidecarSnapshot": None,
        "reviewSnapshot": None,
    }


def build_empty_projection(manifest: dict[str, Any]) -> dict[str, Any]:
    """Build the truthful production artifact before any cell is promoted."""
    rows = manifest.get("rows")
    _require(isinstance(rows, list), "learner manifest rows must be an array")
    return {
        "schemaVersion": 1,
        "contractId": PROJECTION_CONTRACT_ID,
        "base": _promotion_base(manifest, None),
        "records": [],
    }


def validate_promoted_projection(
    projection: dict[str, Any],
    manifest: dict[str, Any],
) -> None:
    """Validate a committed projection without reading authoring evidence.

    CI can validate the repository-owned artifact's exact shape and current
    learner-manifest base. Rebuilding non-empty records still requires the
    rights-governed workbook, validated sidecar, and human review artifact.
    """
    _require(
        set(projection) == {"schemaVersion", "contractId", "base", "records"},
        "promoted projection root keys are invalid",
    )
    _require(
        type(projection.get("schemaVersion")) is int
        and projection.get("schemaVersion") == 1
        and projection.get("contractId") == PROJECTION_CONTRACT_ID,
        "unsupported promoted projection contract",
    )
    base = projection.get("base")
    _require(isinstance(base, dict), "promoted projection base must be an object")
    _require(
        set(base)
        == {
            "sidecarSchemaVersion",
            "sidecarContractId",
            "sidecarSha256",
            "learnerManifestSemanticSha256",
            "workbookSha256",
        },
        "promoted projection base keys are invalid",
    )
    _require(
        type(base.get("sidecarSchemaVersion")) is int
        and base.get("sidecarSchemaVersion") == 1,
        "promoted projection sidecar schema is unsupported",
    )
    _require(base.get("sidecarContractId") == SIDECAR_CONTRACT_ID, "promoted projection sidecar contract is unsupported")
    sidecar_digest = base.get("sidecarSha256")
    _require(
        sidecar_digest is None
        or (isinstance(sidecar_digest, str) and SHA256_PATTERN.fullmatch(sidecar_digest)),
        "promoted projection sidecar digest is malformed",
    )
    _require(
        base.get("learnerManifestSemanticSha256") == manifest_semantic_sha256(manifest),
        "promoted projection learner manifest base is stale",
    )
    workbook_sha256 = base.get("workbookSha256")
    _require(isinstance(workbook_sha256, str), "promoted projection workbook digest is malformed")
    validate_manifest_workbook_digest(manifest, workbook_sha256)

    manifest_rows = manifest.get("rows")
    _require(isinstance(manifest_rows, list), "learner manifest rows must be an array")
    manifest_index: dict[str, int] = {}
    manifest_by_id: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(manifest_rows):
        _require(isinstance(row, dict) and _is_non_empty_text(row.get("learnerId")), "learner manifest row needs a learner ID")
        learner_id = row["learnerId"]
        _require(learner_id not in manifest_by_id, f"learner manifest has duplicate learner ID '{learner_id}'")
        manifest_index[learner_id] = index
        manifest_by_id[learner_id] = row

    records = projection.get("records")
    _require(isinstance(records, list), "promoted projection records must be an array")
    _require(not records or sidecar_digest is not None, "non-empty promoted projection needs a sidecar digest")
    seen_learners: set[str] = set()
    seen_phrases: set[str] = set()
    previous_manifest_index = -1
    for record_index, record in enumerate(records):
        label = f"promoted projection record {record_index}"
        _require(isinstance(record, dict), f"{label} must be an object")
        _require(
            set(record) == {"learnerId", "source", "reviewVersion", "teacherPhrases"},
            f"{label} keys are invalid",
        )
        learner_id = record.get("learnerId")
        _require(isinstance(learner_id, str) and learner_id in manifest_by_id, f"{label} has unknown learner ID")
        _require(learner_id not in seen_learners, f"{label} has duplicate learner ID '{learner_id}'")
        seen_learners.add(learner_id)
        current_manifest_index = manifest_index[learner_id]
        _require(current_manifest_index > previous_manifest_index, f"{label} is not in learner manifest order")
        previous_manifest_index = current_manifest_index

        source = record.get("source")
        _require(isinstance(source, dict), f"{label} source must be an object")
        _require(set(source) == {"sheet", "row", "column", "sourceRevision"}, f"{label} source keys are invalid")
        manifest_row = manifest_by_id[learner_id]
        _require(
            source.get("sheet") == manifest_row.get("sourceSheet")
            and source.get("row") == manifest_row.get("sourceRow")
            and source.get("column") == "造词/造句",
            f"{label} source coordinate is stale",
        )
        _require(
            isinstance(source.get("sourceRevision"), str)
            and SOURCE_REVISION_PATTERN.fullmatch(source["sourceRevision"]),
            f"{label} sourceRevision is malformed",
        )
        _require(
            isinstance(record.get("reviewVersion"), str)
            and SHA256_PATTERN.fullmatch(record["reviewVersion"]),
            f"{label} reviewVersion is malformed",
        )

        phrases = record.get("teacherPhrases")
        _require(isinstance(phrases, list) and phrases, f"{label} teacherPhrases must be non-empty")
        for phrase_index, phrase in enumerate(phrases):
            phrase_label = f"{label} phrase {phrase_index}"
            _require(isinstance(phrase, dict), f"{phrase_label} must be an object")
            expected_keys = {"phraseId", "simplified", "pinyin", "japanese"}
            if "traditional" in phrase:
                expected_keys.add("traditional")
            _require(set(phrase) == expected_keys, f"{phrase_label} keys are invalid")
            phrase_id_value = phrase.get("phraseId")
            _require(
                isinstance(phrase_id_value, str)
                and PHRASE_ID_PATTERN.fullmatch(phrase_id_value),
                f"{phrase_label} phraseId is malformed",
            )
            _require(phrase_id_value not in seen_phrases, f"{phrase_label} has duplicate phraseId")
            seen_phrases.add(phrase_id_value)
            _require(
                all(_is_non_empty_text(phrase.get(field)) for field in ("simplified", "pinyin", "japanese")),
                f"{phrase_label} has an empty required learner field",
            )
            if "traditional" in phrase:
                _require(_is_non_empty_text(phrase["traditional"]), f"{phrase_label} traditional must be non-empty")


def _manifest_rows_by_id(
    manifest: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    rows = manifest.get("rows")
    _require(isinstance(rows, list), "learner manifest rows must be an array")
    by_id: dict[str, dict[str, Any]] = {}
    order: dict[str, int] = {}
    for index, row in enumerate(rows):
        _require(isinstance(row, dict), "learner manifest row must be an object")
        learner_id = row.get("learnerId")
        _require(_is_non_empty_text(learner_id), "learner manifest row needs a learner ID")
        _require(learner_id not in by_id, f"learner manifest has duplicate learner ID '{learner_id}'")
        by_id[learner_id] = row
        order[learner_id] = index
    return by_id, order


def _validate_evidence_sidecar_record(
    record: dict[str, Any],
    manifest_row: dict[str, Any],
    workbook_sha256: str,
    seen_phrase_ids: set[str],
) -> None:
    learner_id = record.get("learnerId")
    _require(
        set(record) == {"learnerId", "source", "teacherPhrases"},
        f"promotion evidence learner '{learner_id}' sidecar keys are invalid",
    )
    _require(learner_id == manifest_row.get("learnerId"), "promotion evidence learner ID mismatch")
    source = record.get("source")
    _require(isinstance(source, dict), f"promotion evidence learner '{learner_id}' source must be an object")
    raw_cell = source.get("rawCell")
    _require(
        isinstance(raw_cell, str) and bool(raw_cell.strip()),
        f"promotion evidence learner '{learner_id}' rawCell must be non-empty text",
    )
    expected_segmentation, expected_reason, expected_ranges = extract_source_units(raw_cell)
    expected_source_keys = {
        "sheet",
        "row",
        "column",
        "rawCell",
        "rawCellSha256",
        "sourceRevision",
        "segmentation",
    }
    if expected_reason is not None:
        expected_source_keys.add("segmentationReason")
    _require(
        set(source) == expected_source_keys,
        f"promotion evidence learner '{learner_id}' source keys are invalid",
    )
    sheet = manifest_row.get("sourceSheet")
    row = manifest_row.get("sourceRow")
    _require(
        type(source.get("row")) is int
        and (source.get("sheet"), source.get("row"), source.get("column"))
        == (sheet, row, SOURCE_COLUMN),
        f"promotion evidence learner '{learner_id}' source coordinate mismatch",
    )
    _require(
        normalize_example(raw_cell) == manifest_row.get("example"),
        f"promotion evidence learner '{learner_id}' rawCell does not match manifest example",
    )
    raw_digest = sha256_bytes(raw_cell.encode("utf-8"))
    _require(
        source.get("rawCellSha256") == raw_digest,
        f"promotion evidence learner '{learner_id}' rawCellSha256 mismatch",
    )
    _require(
        source.get("sourceRevision")
        == source_revision(learner_id, sheet, row, raw_digest),
        f"promotion evidence learner '{learner_id}' sourceRevision mismatch",
    )
    _require(
        source.get("segmentation") == expected_segmentation
        and source.get("segmentationReason") == expected_reason,
        f"promotion evidence learner '{learner_id}' segmentation mismatch",
    )

    phrases = record.get("teacherPhrases")
    _require(
        isinstance(phrases, list) and len(phrases) == len(expected_ranges),
        f"promotion evidence learner '{learner_id}' phrases do not cover every source unit",
    )
    expected_units = [
        unicodedata.normalize("NFC", raw_cell[start:end])
        for start, end in expected_ranges
    ]
    semantic_counts = Counter(unit.strip() for unit in expected_units)
    for phrase_index, (phrase, expected_range, expected_unit) in enumerate(
        zip(phrases, expected_ranges, expected_units, strict=True)
    ):
        label = f"promotion evidence learner '{learner_id}' phrase {phrase_index}"
        _require(isinstance(phrase, dict), f"{label} must be an object")
        allowed_keys = {
            "phraseId",
            "sourceRange",
            "simplified",
            "traditional",
            "pinyin",
            "japanese",
            "fieldProvenance",
            "duplicateDiscriminator",
        }
        required_keys = {"phraseId", "sourceRange", "simplified", "fieldProvenance"}
        _require(
            required_keys.issubset(phrase) and set(phrase).issubset(allowed_keys),
            f"{label} keys are invalid",
        )
        _require(
            phrase.get("sourceRange")
            == {"start": expected_range[0], "end": expected_range[1]},
            f"{label} sourceRange mismatch",
        )
        _require(phrase.get("simplified") == expected_unit, f"{label} source unit mismatch")
        duplicate = semantic_counts[expected_unit.strip()] > 1
        discriminator = phrase.get("duplicateDiscriminator", "")
        _require(
            not duplicate or (isinstance(discriminator, str) and bool(discriminator.strip())),
            f"{label} duplicate source unit needs a discriminator",
        )
        _require(
            duplicate or "duplicateDiscriminator" not in phrase,
            f"{label} has an unexpected duplicate discriminator",
        )
        expected_phrase_id = phrase_id(learner_id, expected_unit, discriminator)
        _require(phrase.get("phraseId") == expected_phrase_id, f"{label} phraseId mismatch")
        _require(expected_phrase_id not in seen_phrase_ids, f"phrase ID collision '{expected_phrase_id}'")
        seen_phrase_ids.add(expected_phrase_id)

        learner_fields = {field for field in LEARNER_FIELDS if field in phrase}
        _require(
            all(_is_non_empty_text(phrase[field]) for field in learner_fields),
            f"{label} learner fields must be non-empty text",
        )
        field_provenance = phrase.get("fieldProvenance")
        _require(
            isinstance(field_provenance, dict)
            and set(field_provenance) == learner_fields,
            f"{label} provenance must exactly cover learner fields",
        )
        for field, provenance in field_provenance.items():
            _require(isinstance(provenance, dict), f"{label} '{field}' provenance must be an object")
            _require(
                set(provenance) == {"provenance", "sourceRef", "rightsRef"},
                f"{label} '{field}' provenance keys are invalid",
            )
            _require(
                provenance.get("provenance") in {"authored", "generated", "verified"},
                f"{label} '{field}' provenance is invalid",
            )
            _require(
                _is_non_empty_text(provenance.get("sourceRef"))
                and _is_non_empty_text(provenance.get("rightsRef")),
                f"{label} '{field}' provenance is incomplete",
            )
        expected_simplified_provenance = {
            "provenance": "authored",
            "sourceRef": (
                f"teacher-workbook:sha256:{workbook_sha256}"
                f"#{sheet}:{row}:{SOURCE_COLUMN}"
            ),
            "rightsRef": RIGHTS_REF,
        }
        _require(
            field_provenance.get("simplified") == expected_simplified_provenance,
            f"{label} simplified provenance is not bound to approved workbook rights",
        )


def _validate_sidecar_snapshot(
    snapshot: dict[str, Any],
    manifest: dict[str, Any],
    workbook_sha256: str,
) -> dict[str, dict[str, Any]]:
    _require(
        set(snapshot) == {"schemaVersion", "contractId", "base", "records"},
        "promotion evidence sidecar snapshot root keys are invalid",
    )
    _require(
        type(snapshot.get("schemaVersion")) is int
        and snapshot.get("schemaVersion") == 1
        and snapshot.get("contractId") == SIDECAR_CONTRACT_ID,
        "promotion evidence sidecar snapshot contract is unsupported",
    )
    _require(
        snapshot.get("base")
        == {
            "learnerManifestSemanticSha256": manifest_semantic_sha256(manifest),
            "workbookSha256": workbook_sha256,
        },
        "promotion evidence sidecar snapshot base is stale",
    )
    manifest_by_id, _ = _manifest_rows_by_id(manifest)
    records = snapshot.get("records")
    _require(isinstance(records, list), "promotion evidence sidecar records must be an array")
    by_id: dict[str, dict[str, Any]] = {}
    seen_phrase_ids: set[str] = set()
    for record in records:
        _require(isinstance(record, dict), "promotion evidence sidecar record must be an object")
        learner_id = record.get("learnerId")
        _require(
            isinstance(learner_id, str) and learner_id in manifest_by_id,
            "promotion evidence sidecar has an unknown learner ID",
        )
        _require(learner_id not in by_id, f"promotion evidence sidecar has duplicate learner ID '{learner_id}'")
        _validate_evidence_sidecar_record(
            record,
            manifest_by_id[learner_id],
            workbook_sha256,
            seen_phrase_ids,
        )
        by_id[learner_id] = record
    expected_ids = {
        learner_id
        for learner_id, row in manifest_by_id.items()
        if _is_non_empty_text(row.get("example"))
    }
    _require(
        set(by_id) == expected_ids,
        "promotion evidence sidecar record coverage mismatch",
    )
    return by_id


def build_projection_from_evidence(
    manifest: dict[str, Any],
    evidence: dict[str, Any],
) -> dict[str, Any]:
    """Validate committed source/review snapshots and derive learner payload."""
    _require(
        set(evidence)
        == {
            "schemaVersion",
            "contractId",
            "base",
            "sidecarSnapshot",
            "reviewSnapshot",
        },
        "promotion evidence root keys are invalid",
    )
    _require(
        type(evidence.get("schemaVersion")) is int
        and evidence.get("schemaVersion") == 1
        and evidence.get("contractId") == EVIDENCE_CONTRACT_ID,
        "unsupported teacher phrase promotion evidence contract",
    )
    base = evidence.get("base")
    _require(isinstance(base, dict), "promotion evidence base must be an object")
    _require(
        set(base)
        == {
            "sidecarSchemaVersion",
            "sidecarContractId",
            "sidecarSha256",
            "learnerManifestSemanticSha256",
            "workbookSha256",
        },
        "promotion evidence base keys are invalid",
    )
    _require(
        type(base.get("sidecarSchemaVersion")) is int
        and base.get("sidecarSchemaVersion") == 1,
        "promotion evidence sidecar schema is unsupported",
    )
    _require(
        base.get("sidecarContractId") == SIDECAR_CONTRACT_ID,
        "promotion evidence sidecar contract is unsupported",
    )
    sidecar_digest = base.get("sidecarSha256")
    _require(
        sidecar_digest is None
        or (isinstance(sidecar_digest, str) and SHA256_PATTERN.fullmatch(sidecar_digest)),
        "promotion evidence sidecar digest is malformed",
    )
    _require(
        base == _promotion_base(manifest, sidecar_digest),
        "promotion evidence manifest or workbook base is stale",
    )
    sidecar_snapshot = evidence.get("sidecarSnapshot")
    review_snapshot = evidence.get("reviewSnapshot")
    if sidecar_digest is None:
        _require(
            sidecar_snapshot is None and review_snapshot is None,
            "empty promotion evidence cannot contain source or review snapshots",
        )
        projection = {
            "schemaVersion": 1,
            "contractId": PROJECTION_CONTRACT_ID,
            "base": copy.deepcopy(base),
            "records": [],
        }
        validate_promoted_projection(projection, manifest)
        return projection

    _require(isinstance(sidecar_snapshot, dict), "promotion evidence needs a sidecar snapshot")
    _require(isinstance(review_snapshot, dict), "promotion evidence needs a review snapshot")
    _require(
        sidecar_sha256(sidecar_snapshot) == sidecar_digest,
        "promotion evidence sidecar digest does not match its canonical snapshot",
    )
    sidecar_by_id = _validate_sidecar_snapshot(
        sidecar_snapshot,
        manifest,
        base["workbookSha256"],
    )
    _require(
        set(review_snapshot) == {"schemaVersion", "contractId", "base", "records"},
        "promotion evidence review snapshot root keys are invalid",
    )
    _require(
        type(review_snapshot.get("schemaVersion")) is int
        and review_snapshot.get("schemaVersion") == 1
        and review_snapshot.get("contractId") == REVIEW_CONTRACT_ID,
        "promotion evidence review snapshot contract is unsupported",
    )
    _require(
        review_snapshot.get("base")
        == {
            "sidecarContractId": SIDECAR_CONTRACT_ID,
            "sidecarSha256": sidecar_digest,
            "learnerManifestSemanticSha256": base["learnerManifestSemanticSha256"],
            "workbookSha256": base["workbookSha256"],
        },
        "promotion evidence review snapshot sidecar digest or base is stale",
    )
    review_records = review_snapshot.get("records")
    _require(isinstance(review_records, list), "promotion evidence review records must be an array")
    reviews_by_id: dict[str, dict[str, Any]] = {}
    for review_record in review_records:
        _require(
            isinstance(review_record, dict)
            and isinstance(review_record.get("learnerId"), str),
            "promotion evidence review record needs a learner ID",
        )
        learner_id = review_record["learnerId"]
        _require(
            learner_id in sidecar_by_id,
            f"promotion evidence review has unknown learner ID '{learner_id}'",
        )
        _require(
            learner_id not in reviews_by_id,
            f"promotion evidence review has duplicate learner ID '{learner_id}'",
        )
        reviews_by_id[learner_id] = review_record

    promoted_records: list[dict[str, Any]] = []
    for manifest_row in manifest["rows"]:
        learner_id = manifest_row["learnerId"]
        sidecar_record = sidecar_by_id.get(learner_id)
        review_record = reviews_by_id.get(learner_id)
        if sidecar_record is None or review_record is None:
            continue
        approved = _validate_review_record(review_record, sidecar_record)
        if not approved or not _cell_is_learner_safe(sidecar_record):
            continue
        source = sidecar_record["source"]
        promoted_records.append(
            {
                "learnerId": learner_id,
                "source": {
                    "sheet": source["sheet"],
                    "row": source["row"],
                    "column": source["column"],
                    "sourceRevision": source["sourceRevision"],
                },
                "reviewVersion": review_record["reviewVersion"],
                "teacherPhrases": [
                    _projection_phrase(phrase)
                    for phrase in sidecar_record["teacherPhrases"]
                ],
            }
        )

    projection = {
        "schemaVersion": 1,
        "contractId": PROJECTION_CONTRACT_ID,
        "base": copy.deepcopy(base),
        "records": promoted_records,
    }
    validate_promoted_projection(projection, manifest)
    return projection


def build_promotion_evidence(
    manifest: dict[str, Any],
    sidecar: dict[str, Any],
    review_artifact: dict[str, Any],
    workbook_path: Path,
) -> dict[str, Any]:
    validate_sidecar(sidecar, manifest, workbook_path)
    digest = sidecar_sha256(sidecar)
    evidence = {
        "schemaVersion": 1,
        "contractId": EVIDENCE_CONTRACT_ID,
        "base": _promotion_base(manifest, digest),
        "sidecarSnapshot": copy.deepcopy(sidecar),
        "reviewSnapshot": copy.deepcopy(review_artifact),
    }
    build_projection_from_evidence(manifest, evidence)
    return evidence


def build_promoted_projection(
    manifest: dict[str, Any],
    sidecar: dict[str, Any],
    review_artifact: dict[str, Any],
    workbook_path: Path,
) -> dict[str, Any]:
    evidence = build_promotion_evidence(
        manifest,
        sidecar,
        review_artifact,
        workbook_path,
    )
    return build_projection_from_evidence(manifest, evidence)
