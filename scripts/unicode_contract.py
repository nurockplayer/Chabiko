#!/usr/bin/env python3
"""Executable Unicode scalar and mechanical-record contract for Issue #260."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import unicodedata
from collections.abc import Callable, Iterable
from pathlib import Path, PurePosixPath
from typing import Any


SCHEMA_VERSION = 1
LANGUAGES = frozenset({"zh-Hant", "zh-Hans", "ja", "mixed"})
CHINESE_LANGUAGES = frozenset({"zh-Hant", "zh-Hans"})
SCRIPT_STATUSES = frozenset({"authored", "verified"})
REVIEW_STATUSES = frozenset({"mechanical", "provisional", "reviewed", "rejected", "unsupported"})
CATEGORIES = frozenset({
    "exact-same-scalar",
    "traditional-simplified",
    "compatibility-normalization",
    "variation-sequence",
    "visual-similarity",
})
RENDERING_ENVIRONMENT_REFS = frozenset({
    "docs/content/unicode-rendering-inventory.md#pinned-reference-renderer",
})
CATEGORY_ORDER = {
    "exact-same-scalar": 0,
    "traditional-simplified": 1,
    "compatibility-normalization": 2,
    "variation-sequence": 3,
    "visual-similarity": 4,
}
OUTPUT_FILENAMES = ("scalar-inventory.json", "mechanical-records.json")


class ContractError(ValueError):
    """Raised when source or generated data violates the frozen contract."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractError(message)


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def serialize_json(payload: Any) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def scalar_values(text: str) -> list[int]:
    _require(isinstance(text, str), "text must be a string")
    values: list[int] = []
    for char in text:
        value = ord(char)
        _require(not 0xD800 <= value <= 0xDFFF, "text contains a lone or paired surrogate code unit")
        _require(value <= 0x10FFFF, f"text contains malformed scalar U+{value:X}")
        values.append(value)
    return values


def _reconstruct(values: Iterable[int], label: str) -> str:
    chars: list[str] = []
    for value in values:
        _require(isinstance(value, int) and not isinstance(value, bool), f"{label} must contain integers")
        _require(0 <= value <= 0x10FFFF, f"{label} contains malformed scalar {value!r}")
        _require(not 0xD800 <= value <= 0xDFFF, f"{label} contains surrogate U+{value:04X}")
        chars.append(chr(value))
    return "".join(chars)


def _normalization_scalars(text: str, form: str) -> list[int]:
    return scalar_values(unicodedata.normalize(form, text))


def _is_han_scalar(value: int) -> bool:
    name = unicodedata.name(chr(value), "")
    return name.startswith("CJK UNIFIED IDEOGRAPH-") or name.startswith("CJK COMPATIBILITY IDEOGRAPH-")


def _is_compatibility_han(value: int) -> bool:
    return unicodedata.name(chr(value), "").startswith("CJK COMPATIBILITY IDEOGRAPH-")


def _is_variation_selector(value: int) -> bool:
    return 0xFE00 <= value <= 0xFE0F or 0xE0100 <= value <= 0xE01EF


def _json_pointer(parts: tuple[str, ...]) -> str:
    if not parts:
        return ""
    return "/" + "/".join(part.replace("~", "~0").replace("/", "~1") for part in parts)


def _record_id(category: str, left_scalars: list[int], right_scalars: list[int]) -> str:
    seed = json.dumps(
        [category, left_scalars, right_scalars],
        ensure_ascii=True,
        separators=(",", ":"),
    )
    return f"unicode-{category}-{hashlib.sha256(seed.encode('ascii')).hexdigest()[:16]}"


def _evidence_id(source_id: str, pointer: str, field: str) -> str:
    seed = f"unicode-evidence-v1|{source_id}|{pointer}|{field}"
    return f"evidence-{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"


def _validate_relative_path(value: Any, label: str) -> str:
    _require(isinstance(value, str) and value != "", f"{label} must be a non-empty string")
    path = PurePosixPath(value)
    _require(not path.is_absolute(), f"{label} must be repository-relative")
    _require(".." not in path.parts and "." not in path.parts, f"{label} must not traverse directories")
    _require("\\" not in value, f"{label} must use POSIX separators")
    return value


def _load_manifest(manifest_path: Path, repo_root: Path) -> tuple[dict[str, Any], str]:
    try:
        raw = manifest_path.read_bytes()
        manifest = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError(f"source manifest is unreadable: {error}") from error
    _require(isinstance(manifest, dict), "source manifest must be an object")
    _require(set(manifest) == {"schemaVersion", "manifestId", "unicodeVersion", "sources"},
             "source manifest has missing or unknown fields")
    _require(manifest["schemaVersion"] == SCHEMA_VERSION, "source manifest schemaVersion must be 1")
    _require(isinstance(manifest["manifestId"], str) and manifest["manifestId"],
             "source manifest manifestId must be non-empty")
    _require(manifest["unicodeVersion"] == unicodedata.unidata_version,
             f"source manifest Unicode version is stale; expected {unicodedata.unidata_version}")
    sources = manifest["sources"]
    _require(isinstance(sources, list) and sources, "source manifest sources must be a non-empty array")
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    for index, source in enumerate(sources):
        label = f"sources[{index}]"
        _require(isinstance(source, dict), f"{label} must be an object")
        expected_source_keys = {"id", "path", "sha256", "format", "textFields"}
        if "allowEmptyRecords" in source:
            expected_source_keys.add("allowEmptyRecords")
        _require(set(source) == expected_source_keys,
                 f"{label} has missing or unknown fields")
        if "allowEmptyRecords" in source:
            _require(source["allowEmptyRecords"] is True,
                     f"{label}.allowEmptyRecords must be true when present")
        source_id = source["id"]
        _require(isinstance(source_id, str) and source_id, f"{label}.id must be non-empty")
        _require(source_id not in seen_ids, f"duplicate source id '{source_id}'")
        seen_ids.add(source_id)
        source_path = _validate_relative_path(source["path"], f"{label}.path")
        _require(source_path not in seen_paths, f"duplicate source path '{source_path}'")
        seen_paths.add(source_path)
        _require(source["format"] == "json", f"{label}.format must be 'json'")
        digest = source["sha256"]
        _require(isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest),
                 f"{label}.sha256 must be lowercase SHA-256")
        fields = source["textFields"]
        _require(isinstance(fields, list) and fields, f"{label}.textFields must be non-empty")
        seen_fields: set[str] = set()
        for field_index, field in enumerate(fields):
            field_label = f"{label}.textFields[{field_index}]"
            _require(isinstance(field, dict), f"{field_label} must be an object")
            expected_field_keys = {"field", "language"}
            if "optional" in field:
                expected_field_keys.add("optional")
            _require(set(field) == expected_field_keys,
                     f"{field_label} must contain field/language and optional only when explicit")
            if "optional" in field:
                _require(field["optional"] is True,
                         f"{field_label}.optional must be true when present")
            _require(isinstance(field["field"], str) and field["field"], f"{field_label}.field must be non-empty")
            _require(field["field"] not in seen_fields, f"{label} has duplicate text field '{field['field']}'")
            seen_fields.add(field["field"])
            _require(field["language"] in LANGUAGES, f"{field_label}.language is invalid")
        path = repo_root / source_path
        _require(path.is_file(), f"allowlisted source is missing: {source_path}")
        actual = _sha256_bytes(path.read_bytes())
        _require(actual == digest, f"allowlisted source checksum mismatch: {source_path}")
    return manifest, _sha256_bytes(raw)


def _make_record(
    category: str,
    left_text: str,
    right_text: str,
    evidence_refs: list[str],
    manifest: dict[str, Any],
    manifest_sha256: str,
) -> dict[str, Any]:
    left_scalars = scalar_values(left_text)
    right_scalars = scalar_values(right_text)
    return {
        "id": _record_id(category, left_scalars, right_scalars),
        "category": category,
        "leftText": left_text,
        "leftScalars": left_scalars,
        "leftNfcScalars": _normalization_scalars(left_text, "NFC"),
        "leftNfkcScalars": _normalization_scalars(left_text, "NFKC"),
        "rightText": right_text,
        "rightScalars": right_scalars,
        "rightNfcScalars": _normalization_scalars(right_text, "NFC"),
        "rightNfkcScalars": _normalization_scalars(right_text, "NFKC"),
        "evidenceRefs": evidence_refs,
        "renderingEnvironmentRefs": [],
        "provenance": {
            "method": "deterministic-rendering" if category == "visual-similarity" else "mechanical-extraction",
            "sourceManifestId": manifest["manifestId"],
            "sourceManifestSha256": manifest_sha256,
            "unicodeVersion": manifest["unicodeVersion"],
        },
        "reviewStatus": "mechanical",
        "learnerEligible": False,
        "cautionJa": None,
    }


def validate_record(
    record: dict[str, Any],
    *,
    evidence: dict[str, dict[str, Any]],
    expected_provenance: dict[str, str],
    rendering_environment_ids: frozenset[str] = RENDERING_ENVIRONMENT_REFS,
) -> None:
    expected_keys = {
        "id", "category", "leftText", "leftScalars", "leftNfcScalars", "leftNfkcScalars",
        "rightText", "rightScalars", "rightNfcScalars", "rightNfkcScalars", "evidenceRefs",
        "renderingEnvironmentRefs", "provenance", "reviewStatus", "learnerEligible", "cautionJa",
    }
    _require(isinstance(record, dict) and set(record) == expected_keys, "Unicode record has missing or unknown fields")
    category = record["category"]
    _require(category in CATEGORIES, f"Unicode record category '{category}' is invalid")
    for side in ("left", "right"):
        text_key = f"{side}Text"
        scalar_key = f"{side}Scalars"
        nfc_key = f"{side}NfcScalars"
        nfkc_key = f"{side}NfkcScalars"
        text = record[text_key]
        _require(isinstance(text, str) and text != "", f"{text_key} must be a non-empty string")
        scalar_values(text)
        values = record[scalar_key]
        _require(isinstance(values, list), f"{scalar_key} must be an array")
        _require(_reconstruct(values, scalar_key) == text, f"{scalar_key} does not reconstruct {text_key} exactly")
        _require(record[nfc_key] == _normalization_scalars(text, "NFC"), f"{nfc_key} does not match NFC")
        _require(record[nfkc_key] == _normalization_scalars(text, "NFKC"), f"{nfkc_key} does not match NFKC")
    left_scalars = record["leftScalars"]
    right_scalars = record["rightScalars"]
    if category == "exact-same-scalar":
        _require(len(left_scalars) == 1 and left_scalars == right_scalars,
                 "exact-same-scalar category requires one identical scalar on both sides")
    elif category == "compatibility-normalization":
        _require(len(left_scalars) == 1 and _is_compatibility_han(left_scalars[0]),
                 "compatibility-normalization category requires one CJK compatibility ideograph")
        _require(record["rightText"] == unicodedata.normalize("NFKC", record["leftText"]),
                 "compatibility-normalization rightText must equal leftText NFKC")
    elif category == "variation-sequence":
        _require(len(left_scalars) == 2 and _is_han_scalar(left_scalars[0])
                 and _is_variation_selector(left_scalars[1]),
                 "variation-sequence category requires exactly Han + variation selector")
        _require(right_scalars == [left_scalars[0]],
                 "variation-sequence right side must be the base Han scalar")
    elif category == "visual-similarity":
        _require(left_scalars != right_scalars,
                 "visual-similarity category must not duplicate an identical scalar sequence")
    expected_id = _record_id(category, record["leftScalars"], record["rightScalars"])
    _require(record["id"] == expected_id, f"Unicode record id '{record['id']}' is not deterministic")
    refs = record["evidenceRefs"]
    _require(isinstance(refs, list) and refs, "Unicode record evidenceRefs must be non-empty")
    _require(len(refs) == len(set(refs)), f"Unicode record '{record['id']}' has duplicate evidence refs")
    for ref in refs:
        _require(ref in evidence, f"Unicode record '{record['id']}' has stale evidence ref '{ref}'")
    if category == "exact-same-scalar":
        scalar = left_scalars[0]
        _require(
            all(scalar in evidence[ref]["scalars"] for ref in refs),
            "exact-same-scalar evidence must contain the claimed scalar",
        )
        languages = {evidence[ref]["language"] for ref in refs}
        _require(
            bool(languages & CHINESE_LANGUAGES) and "ja" in languages,
            "exact-same-scalar evidence must include Chinese and Japanese occurrences",
        )
    elif category == "compatibility-normalization":
        scalar = left_scalars[0]
        _require(
            all(scalar in evidence[ref]["scalars"] for ref in refs),
            "compatibility-normalization evidence must contain the claimed scalar",
        )
    elif category == "variation-sequence":
        _require(
            all(any(
                evidence[ref]["scalars"][index:index + len(left_scalars)] == left_scalars
                for index in range(len(evidence[ref]["scalars"]) - len(left_scalars) + 1)
            ) for ref in refs),
            "variation-sequence evidence must contain the claimed scalar sequence",
        )
    elif category == "traditional-simplified":
        paired_refs: set[str] = set()
        for left_ref in refs:
            left = evidence[left_ref]
            if (
                left.get("field") != "traditional"
                or left.get("language") != "zh-Hant"
                or left.get("text") != record["leftText"]
                or left.get("scriptStatus") not in SCRIPT_STATUSES
            ):
                continue
            left_parent = str(left.get("jsonPointer", "")).rsplit("/", 1)[0]
            for right_ref in refs:
                right = evidence[right_ref]
                right_parent = str(right.get("jsonPointer", "")).rsplit("/", 1)[0]
                if (
                    right.get("field") == "simplified"
                    and right.get("language") == "zh-Hans"
                    and right.get("text") == record["rightText"]
                    and right.get("scriptStatus") in SCRIPT_STATUSES
                    and right.get("sourceId") == left.get("sourceId")
                    and right_parent == left_parent
                ):
                    paired_refs.update((left_ref, right_ref))
        _require(
            paired_refs == set(refs),
            "traditional-simplified evidence must consist entirely of same-record authored/verified pairs",
        )
    env_refs = record["renderingEnvironmentRefs"]
    _require(isinstance(env_refs, list), "renderingEnvironmentRefs must be an array")
    _require(len(env_refs) == len(set(env_refs)), f"Unicode record '{record['id']}' has duplicate rendering refs")
    for ref in env_refs:
        _require(ref in rendering_environment_ids, f"Unicode record references stale rendering environment '{ref}'")
    if category == "visual-similarity":
        _require(bool(env_refs), "visual-similarity record requires a rendering environment ref")
    else:
        _require(not env_refs, f"non-visual record '{record['id']}' must not claim rendering evidence")
    status = record["reviewStatus"]
    _require(status in REVIEW_STATUSES, f"Unicode record reviewStatus '{status}' is invalid")
    _require(isinstance(record["learnerEligible"], bool), "learnerEligible must be boolean")
    if record["learnerEligible"]:
        _require(status == "reviewed", "learner-eligible record must have reviewStatus 'reviewed'")
        if category != "exact-same-scalar":
            _require(isinstance(record["cautionJa"], str) and record["cautionJa"].strip() != "",
                     "learner-eligible non-exact category requires cautionJa")
    if status in {"mechanical", "provisional", "rejected", "unsupported"}:
        _require(not record["learnerEligible"], f"{status} record must remain learner-excluded")
    caution = record["cautionJa"]
    _require(caution is None or (isinstance(caution, str) and caution.strip()), "cautionJa must be null or non-empty")
    provenance = record["provenance"]
    _require(isinstance(provenance, dict) and set(provenance) == {
        "method", "sourceManifestId", "sourceManifestSha256", "unicodeVersion"
    }, "Unicode record provenance is malformed")
    expected_method = "deterministic-rendering" if category == "visual-similarity" else "mechanical-extraction"
    _require(provenance["method"] == expected_method, "Unicode record provenance method is not truthful")
    _require(provenance == expected_provenance, "Unicode record provenance does not match the active manifest context")


def _add_record(
    records: dict[tuple[str, tuple[int, ...], tuple[int, ...]], dict[str, Any]],
    record_order: dict[tuple[str, tuple[int, ...], tuple[int, ...]], int],
    *,
    category: str,
    left_text: str,
    right_text: str,
    evidence_refs: list[str],
    first_order: int,
    manifest: dict[str, Any],
    manifest_sha256: str,
) -> None:
    key = (category, tuple(scalar_values(left_text)), tuple(scalar_values(right_text)))
    if key not in records:
        records[key] = _make_record(category, left_text, right_text, [], manifest, manifest_sha256)
        record_order[key] = first_order
    existing = records[key]["evidenceRefs"]
    for ref in evidence_refs:
        if ref not in existing:
            existing.append(ref)
    record_order[key] = min(record_order[key], first_order)


def extract_dataset(manifest_path: Path, *, repo_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_path = Path(manifest_path)
    repo_root = Path(repo_root)
    manifest, manifest_sha256 = _load_manifest(manifest_path, repo_root)
    evidence: list[dict[str, Any]] = []
    evidence_order: dict[str, int] = {}
    scalar_occurrences: dict[int, list[dict[str, Any]]] = {}
    scalar_first_order: dict[int, int] = {}
    records: dict[tuple[str, tuple[int, ...], tuple[int, ...]], dict[str, Any]] = {}
    record_order: dict[tuple[str, tuple[int, ...], tuple[int, ...]], int] = {}

    for source in manifest["sources"]:
        source_path = repo_root / source["path"]
        try:
            document = json.loads(source_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ContractError(f"allowlisted source is invalid JSON: {source['path']}: {error}") from error
        field_languages = {entry["field"]: entry["language"] for entry in source["textFields"]}
        required_fields = {
            entry["field"]
            for entry in source["textFields"]
            if entry.get("optional") is not True
        }
        found_fields: set[str] = set()

        def add_evidence(
            field: str,
            text: str,
            text_pointer_parts: tuple[str, ...],
            script_status: str | None = None,
        ) -> str:
            scalar_values(text)
            pointer = _json_pointer(text_pointer_parts)
            evidence_id = _evidence_id(source["id"], pointer, field)
            _require(evidence_id not in evidence_order, f"duplicate evidence identity at {source['path']}{pointer}")
            evidence_order[evidence_id] = len(evidence)
            text_scalars = scalar_values(text)
            item = {
                "id": evidence_id,
                "sourceId": source["id"],
                "sourcePath": source["path"],
                "sourceSha256": source["sha256"],
                "jsonPointer": pointer,
                "field": field,
                "language": field_languages[field],
                "scriptStatus": script_status,
                "text": text,
                "scalars": text_scalars,
                "nfcScalars": _normalization_scalars(text, "NFC"),
                "nfkcScalars": _normalization_scalars(text, "NFKC"),
            }
            evidence.append(item)
            current_order = evidence_order[evidence_id]
            for scalar_index, scalar in enumerate(text_scalars):
                if not _is_han_scalar(scalar):
                    continue
                occurrence = {"evidenceRef": evidence_id, "scalarIndex": scalar_index}
                if scalar_index + 1 < len(text_scalars) and _is_variation_selector(text_scalars[scalar_index + 1]):
                    occurrence["variationSelector"] = text_scalars[scalar_index + 1]
                    left = chr(scalar) + chr(text_scalars[scalar_index + 1])
                    _add_record(
                        records, record_order, category="variation-sequence", left_text=left,
                        right_text=chr(scalar), evidence_refs=[evidence_id], first_order=current_order,
                        manifest=manifest, manifest_sha256=manifest_sha256,
                    )
                scalar_occurrences.setdefault(scalar, []).append(occurrence)
                scalar_first_order.setdefault(scalar, current_order)
                if _is_compatibility_han(scalar):
                    compatibility = chr(scalar)
                    _add_record(
                        records, record_order, category="compatibility-normalization",
                        left_text=compatibility, right_text=unicodedata.normalize("NFKC", compatibility),
                        evidence_refs=[evidence_id], first_order=current_order,
                        manifest=manifest, manifest_sha256=manifest_sha256,
                    )
            return evidence_id

        def walk(value: Any, pointer_parts: tuple[str, ...]) -> None:
            if isinstance(value, dict):
                direct_evidence: dict[str, str] = {}
                for field, child in value.items():
                    if field not in field_languages:
                        continue
                    if isinstance(child, str):
                        found_fields.add(field)
                        status = value.get(f"{field}Status")
                        direct_evidence[field] = add_evidence(
                            field,
                            child,
                            pointer_parts + (field,),
                            status if isinstance(status, str) else None,
                        )
                    elif isinstance(child, list) and child and all(isinstance(item, str) for item in child):
                        found_fields.add(field)
                        for index, item in enumerate(child):
                            add_evidence(field, item, pointer_parts + (field, str(index)))
                if (
                    isinstance(value.get("traditional"), str)
                    and isinstance(value.get("simplified"), str)
                    and value.get("traditionalStatus") in SCRIPT_STATUSES
                    and value.get("simplifiedStatus") in SCRIPT_STATUSES
                    and "traditional" in direct_evidence
                    and "simplified" in direct_evidence
                    and any(_is_han_scalar(scalar) for scalar in scalar_values(value["traditional"]))
                    and any(_is_han_scalar(scalar) for scalar in scalar_values(value["simplified"]))
                ):
                    refs = [direct_evidence["traditional"], direct_evidence["simplified"]]
                    _add_record(
                        records, record_order, category="traditional-simplified",
                        left_text=value["traditional"], right_text=value["simplified"], evidence_refs=refs,
                        first_order=min(evidence_order[ref] for ref in refs), manifest=manifest,
                        manifest_sha256=manifest_sha256,
                    )
                for field, child in value.items():
                    walk(child, pointer_parts + (field,))
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    walk(child, pointer_parts + (str(index),))

        walk(document, ())
        missing_fields = required_fields - found_fields
        if (
            missing_fields
            and source.get("allowEmptyRecords") is True
            and isinstance(document, dict)
            and isinstance(document.get("records"), list)
            and len(document["records"]) == 0
        ):
            missing_fields = set()
        _require(not missing_fields, f"allowlisted source {source['path']} has stale text fields: {sorted(missing_fields)}")

    for scalar, occurrences in scalar_occurrences.items():
        languages = {evidence[evidence_order[item["evidenceRef"]]]["language"] for item in occurrences}
        if languages & CHINESE_LANGUAGES and "ja" in languages:
            refs: list[str] = []
            for occurrence in occurrences:
                ref = occurrence["evidenceRef"]
                language = evidence[evidence_order[ref]]["language"]
                if (language in CHINESE_LANGUAGES or language == "ja") and ref not in refs:
                    refs.append(ref)
            char = chr(scalar)
            _add_record(
                records, record_order, category="exact-same-scalar", left_text=char, right_text=char,
                evidence_refs=refs, first_order=scalar_first_order[scalar], manifest=manifest,
                manifest_sha256=manifest_sha256,
            )

    scalar_rows = []
    for scalar in sorted(scalar_occurrences, key=lambda value: (scalar_first_order[value], value)):
        scalar_rows.append({
            "id": f"han-u{scalar:04x}",
            "scalar": scalar,
            "hex": f"U+{scalar:04X}",
            "character": chr(scalar),
            "unicodeName": unicodedata.name(chr(scalar)),
            "firstOccurrenceRef": scalar_occurrences[scalar][0]["evidenceRef"],
            "occurrences": scalar_occurrences[scalar],
        })

    ordered_record_keys = sorted(
        records,
        key=lambda key: (record_order[key], CATEGORY_ORDER[key[0]], key[1], key[2]),
    )
    ordered_records = [records[key] for key in ordered_record_keys]
    for record in ordered_records:
        validate_record(
            record,
            evidence={item["id"]: item for item in evidence},
            expected_provenance=record["provenance"],
        )

    common = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceManifestId": manifest["manifestId"],
        "sourceManifestSha256": manifest_sha256,
        "unicodeVersion": manifest["unicodeVersion"],
    }
    inventory = {
        **common,
        "evidence": evidence,
        "scalars": scalar_rows,
        "totals": {
            "sources": len(manifest["sources"]),
            "evidence": len(evidence),
            "uniqueHanScalars": len(scalar_rows),
            "occurrences": sum(len(row["occurrences"]) for row in scalar_rows),
        },
    }
    records_payload = {
        **common,
        "records": ordered_records,
        "totals": {
            "records": len(ordered_records),
            "byCategory": {
                category: sum(record["category"] == category for record in ordered_records)
                for category in CATEGORY_ORDER
            },
            "learnerEligible": sum(bool(record["learnerEligible"]) for record in ordered_records),
        },
    }
    return inventory, records_payload


def validate_dataset(
    manifest_path: Path,
    inventory: dict[str, Any],
    records: dict[str, Any],
    *,
    repo_root: Path,
) -> None:
    _require(isinstance(inventory, dict) and isinstance(records, dict), "generated dataset files must be objects")
    _require(isinstance(inventory.get("evidence"), list), "scalar inventory evidence must be an array")
    _require(isinstance(inventory.get("scalars"), list), "scalar inventory scalars must be an array")
    _require(isinstance(records.get("records"), list), "mechanical records must be an array")
    evidence_ids: set[str] = set()
    evidence_by_id: dict[str, dict[str, Any]] = {}
    evidence_keys = {
        "id", "sourceId", "sourcePath", "sourceSha256", "jsonPointer", "field", "language",
        "scriptStatus", "text", "scalars", "nfcScalars", "nfkcScalars",
    }
    for index, entry in enumerate(inventory["evidence"]):
        _require(isinstance(entry, dict) and set(entry) == evidence_keys,
                 f"evidence[{index}] has missing or unknown fields")
        evidence_id = entry["id"]
        _require(isinstance(evidence_id, str) and evidence_id, f"evidence[{index}].id must be non-empty")
        _require(evidence_id not in evidence_ids, f"duplicate evidence id '{evidence_id}'")
        evidence_ids.add(evidence_id)
        evidence_by_id[evidence_id] = entry
        _require(entry["language"] in LANGUAGES, f"evidence '{evidence_id}' has invalid language")
        _require(entry["scriptStatus"] is None or isinstance(entry["scriptStatus"], str),
                 f"evidence '{evidence_id}' scriptStatus must be null or string")
        _validate_relative_path(entry["sourcePath"], f"evidence '{evidence_id}' sourcePath")
        _require(isinstance(entry["sourceSha256"], str) and len(entry["sourceSha256"]) == 64,
                 f"evidence '{evidence_id}' has malformed source checksum")
        _require(isinstance(entry["jsonPointer"], str), f"evidence '{evidence_id}' jsonPointer must be a string")
        _require(isinstance(entry["field"], str) and entry["field"], f"evidence '{evidence_id}' field must be non-empty")
        text = entry["text"]
        _require(isinstance(text, str), f"evidence '{evidence_id}' text must be a string")
        scalar_values(text)
        _require(isinstance(entry["scalars"], list), f"evidence '{evidence_id}' scalars must be an array")
        _require(_reconstruct(entry["scalars"], f"evidence '{evidence_id}' scalars") == text,
                 f"evidence '{evidence_id}' scalars do not reconstruct text")
        _require(entry["nfcScalars"] == _normalization_scalars(text, "NFC"),
                 f"evidence '{evidence_id}' NFC scalars mismatch")
        _require(entry["nfkcScalars"] == _normalization_scalars(text, "NFKC"),
                 f"evidence '{evidence_id}' NFKC scalars mismatch")

    scalar_ids: set[str] = set()
    scalar_values_seen: set[int] = set()
    scalar_row_keys = {
        "id", "scalar", "hex", "character", "unicodeName", "firstOccurrenceRef", "occurrences",
    }
    for index, row in enumerate(inventory["scalars"]):
        _require(isinstance(row, dict) and set(row) == scalar_row_keys,
                 f"scalars[{index}] has missing or unknown fields")
        scalar = row["scalar"]
        _require(isinstance(scalar, int) and not isinstance(scalar, bool), f"scalars[{index}].scalar must be integer")
        _reconstruct([scalar], f"scalars[{index}].scalar")
        _require(_is_han_scalar(scalar), f"scalars[{index}] is not a Han scalar")
        expected_id = f"han-u{scalar:04x}"
        _require(row["id"] == expected_id, f"scalar row id must be '{expected_id}'")
        _require(row["id"] not in scalar_ids, f"duplicate scalar id '{row['id']}'")
        _require(scalar not in scalar_values_seen, f"duplicate Han scalar U+{scalar:04X}")
        scalar_ids.add(row["id"])
        scalar_values_seen.add(scalar)
        _require(row["hex"] == f"U+{scalar:04X}", f"scalar '{row['id']}' hex mismatch")
        _require(row["character"] == chr(scalar), f"scalar '{row['id']}' character mismatch")
        _require(row["unicodeName"] == unicodedata.name(chr(scalar)), f"scalar '{row['id']}' Unicode name mismatch")
        occurrences = row["occurrences"]
        _require(isinstance(occurrences, list) and occurrences, f"scalar '{row['id']}' occurrences must be non-empty")
        _require(row["firstOccurrenceRef"] == occurrences[0].get("evidenceRef"),
                 f"scalar '{row['id']}' first occurrence mismatch")
        for occurrence in occurrences:
            _require(isinstance(occurrence, dict) and set(occurrence) in (
                {"evidenceRef", "scalarIndex"},
                {"evidenceRef", "scalarIndex", "variationSelector"},
            ), f"scalar '{row['id']}' has malformed occurrence")
            evidence_ref = occurrence["evidenceRef"]
            _require(evidence_ref in evidence_by_id, f"scalar '{row['id']}' has stale evidence ref '{evidence_ref}'")
            scalar_index = occurrence["scalarIndex"]
            evidence_scalars = evidence_by_id[evidence_ref]["scalars"]
            _require(isinstance(scalar_index, int) and not isinstance(scalar_index, bool)
                     and 0 <= scalar_index < len(evidence_scalars),
                     f"scalar '{row['id']}' has invalid scalarIndex")
            _require(evidence_scalars[scalar_index] == scalar,
                     f"scalar '{row['id']}' occurrence does not point to the claimed scalar")
            if "variationSelector" in occurrence:
                selector = occurrence["variationSelector"]
                _require(_is_variation_selector(selector), f"scalar '{row['id']}' has invalid variation selector")
                _require(scalar_index + 1 < len(evidence_scalars)
                         and evidence_scalars[scalar_index + 1] == selector,
                         f"scalar '{row['id']}' variation selector does not match source text")
    ids: set[str] = set()
    manifest, manifest_sha256 = _load_manifest(Path(manifest_path), Path(repo_root))
    expected_provenance = {
        "method": "mechanical-extraction",
        "sourceManifestId": manifest["manifestId"],
        "sourceManifestSha256": manifest_sha256,
        "unicodeVersion": manifest["unicodeVersion"],
    }
    for record in records["records"]:
        _require(record["id"] not in ids, f"duplicate record id '{record['id']}'")
        ids.add(record["id"])
        record_expected_provenance = dict(expected_provenance)
        if record.get("category") == "visual-similarity":
            record_expected_provenance["method"] = "deterministic-rendering"
        validate_record(
            record,
            evidence=evidence_by_id,
            expected_provenance=record_expected_provenance,
        )
    expected_inventory, expected_records = extract_dataset(Path(manifest_path), repo_root=Path(repo_root))
    _require(serialize_json(inventory) == serialize_json(expected_inventory),
             "scalar inventory does not exactly reconcile with allowlisted sources")
    _require(serialize_json(records) == serialize_json(expected_records),
             "mechanical records do not exactly reconcile with extractor output")


def publish_dataset(
    output_dir: Path,
    inventory: dict[str, Any],
    records: dict[str, Any],
    *,
    after_replace: Callable[[int], None] | None = None,
) -> None:
    """Publish both generated files as one rollback-capable transaction."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    payloads = dict(zip(OUTPUT_FILENAMES, (inventory, records), strict=True))
    transaction_root = Path(tempfile.mkdtemp(prefix=".unicode-publication-", dir=output_dir.parent))
    stage = transaction_root / "stage"
    backup = transaction_root / "backup"
    stage.mkdir()
    backup.mkdir()
    replaced = 0
    backed_up: set[str] = set()
    try:
        for filename, payload in payloads.items():
            raw = serialize_json(payload)
            staged = stage / filename
            staged.write_bytes(raw)
            _require(serialize_json(json.loads(staged.read_text(encoding="utf-8"))) == raw,
                     f"staged output failed round-trip validation: {filename}")
        for filename in OUTPUT_FILENAMES:
            target = output_dir / filename
            if target.exists():
                os.replace(target, backup / filename)
                backed_up.add(filename)
            os.replace(stage / filename, target)
            replaced += 1
            if after_replace is not None:
                after_replace(replaced)
    except BaseException:
        for filename in reversed(OUTPUT_FILENAMES):
            target = output_dir / filename
            old = backup / filename
            if filename in backed_up:
                if target.exists():
                    target.unlink()
                if old.exists():
                    os.replace(old, target)
            elif target.exists() and not (stage / filename).exists():
                target.unlink()
        raise
    finally:
        shutil.rmtree(transaction_root, ignore_errors=True)
