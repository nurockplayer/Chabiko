#!/usr/bin/env python3
"""
Content Schema Validator for Chabiko #2.

Validates content bundles against the content model defined in
docs/content/content-model-draft.md.

Integrates:
  - painPointTags validation (reuses controlled taxonomy from #14)
  - Per-form script provenance validation (reuses rules from #24)
  - Regional usage metadata checks
  - Source/review metadata checks
  - Type-specific required/optional field validation

Usage:
    uv run python scripts/validate-content-schema.py                     # run self-tests
    uv run python scripts/validate-content-schema.py --check <file>      # validate content file
"""

import json
import sys
from datetime import date
from urllib.parse import urlparse

# ─── Controlled vocabularies ───────────────────────────────────────────────

CONTROLLED_TAGS = frozenset({
    "tone",
    "pinyin-pronunciation",
    "kanji-false-friend",
    "same-kanji-different-meaning",
    "same-kanji-different-usage",
    "word-order",
    "measure-word",
    "aspect-particle",
    "complement",
    "traditional-simplified",
    "taiwan-mainland-usage",
})

CONTROLLED_STATUSES = frozenset({"authored", "verified", "generated", "unavailable"})

VALID_LEVELS = frozenset({"beginner", "elementary", "pre-intermediate", "intermediate"})

VALID_REVIEW_STATUSES = frozenset({"draft", "reviewed", "published"})

VALID_SCENARIOS = frozenset({
    "food", "transport", "hotel", "shopping", "emergency", "airport",
})

VALID_PRACTICE_TYPES = frozenset({
    "tone-discrimination", "pronunciation-practice", "word-order",
    "measure-word", "complement", "aspect-particle",
    "script-matching", "region-vocab",
})

VALID_SIMILARITY_TYPES = frozenset({
    "false-friend", "partial-overlap", "same-meaning", "none",
})

VALID_RESOURCE_TYPES = frozenset({
    "official-site", "dictionary", "standard", "reference", "academic", "other",
})

VALID_LICENSE_STATUSES = frozenset({
    "unknown", "needs-review", "approved", "restricted", "prohibited",
})

VALID_ALLOWED_USES = frozenset({
    "reference-only", "attributed-use", "non-commercial", "commercial", "citation",
})

VALID_RESOURCE_REVIEW_STATUSES = frozenset({
    "candidate", "under-review", "approved", "rejected",
})

VALID_LANGUAGE_RELEVANCE = frozenset({
    "primary", "supplementary", "unrelated",
})

VALID_REGIONAL_RELEVANCE = frozenset({
    "taiwan-specific", "cross-strait", "mainland-specific", "general",
})

VALID_SCRIPT_RELEVANCE = frozenset({
    "traditional", "simplified", "both", "neutral",
})

# ─── Content type schemas ──────────────────────────────────────────────────
# Each schema defines:
#   required: fields that must be present (non-None)
#   optional: fields that may be present
#   field_types: type checks for each field
#   controlled_fields: field name → set of valid values
#   validate_extra: additional validation function (called with record, path)

SCHEMAS: dict = {}


def _check_review_status(record: dict, path: str) -> list[str]:
    """Validate reviewStatus is present and valid."""
    errors = []
    if "reviewStatus" not in record:
        errors.append(f"{path}: missing 'reviewStatus'")
    elif not isinstance(record["reviewStatus"], str):
        errors.append(f"{path}.reviewStatus must be a string, got {type(record['reviewStatus']).__name__}")
    elif record["reviewStatus"] not in VALID_REVIEW_STATUSES:
        errors.append(f"{path}.reviewStatus '{record['reviewStatus']}' is invalid; must be one of {sorted(VALID_REVIEW_STATUSES)}")
    return errors


def _check_script_fields(record: dict, path: str) -> list[str]:
    """Reuse script provenance validation rules from #24."""
    errors = []

    # traditional is required and must be a string
    if "traditional" not in record:
        errors.append(f"{path}: 'traditional' is required")
    elif not isinstance(record["traditional"], str):
        errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")

    # traditionalStatus is required; unavailable is contradictory
    if "traditionalStatus" not in record:
        errors.append(f"{path}: 'traditionalStatus' is required")
    else:
        val = record["traditionalStatus"]
        if not isinstance(val, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(val).__name__}")
        elif val == "unavailable":
            errors.append(f"{path}: 'traditionalStatus' cannot be 'unavailable' when 'traditional' text exists")
        elif val not in CONTROLLED_STATUSES:
            errors.append(f"{path}.traditionalStatus '{val}' is not a valid status")

    # simplified is optional; rules from #24 content model
    simplified_present = "simplified" in record and record["simplified"] is not None
    simplified_status_present = "simplifiedStatus" in record

    if simplified_present and not isinstance(record["simplified"], str):
        errors.append(f"{path}.simplified must be a string, got {type(record['simplified']).__name__}")

    if not simplified_present:
        if simplified_status_present:
            val = record["simplifiedStatus"]
            if isinstance(val, str) and val != "unavailable":
                errors.append(f"{path}: 'simplifiedStatus' must be 'unavailable' when 'simplified' is absent")
            elif not isinstance(val, str):
                errors.append(f"{path}.simplifiedStatus must be a string, got {type(val).__name__}")
    else:
        if not simplified_status_present:
            errors.append(f"{path}: 'simplifiedStatus' is required when 'simplified' is present")
        else:
            val = record["simplifiedStatus"]
            if not isinstance(val, str):
                errors.append(f"{path}.simplifiedStatus must be a string, got {type(val).__name__}")
            elif val == "unavailable":
                errors.append(f"{path}: 'simplifiedStatus' cannot be 'unavailable' when 'simplified' text exists")
            elif val not in CONTROLLED_STATUSES:
                errors.append(f"{path}.simplifiedStatus '{val}' is not a valid status")

    return errors


def _check_generated_not_production(record: dict, path: str) -> list[str]:
    """A generated-only script form must not be treated as production-ready."""
    errors = []
    review_status = record.get("reviewStatus")
    if review_status in ("reviewed", "published"):
        for field in ("traditionalStatus", "simplifiedStatus"):
            if record.get(field) == "generated":
                errors.append(
                    f"{path}: 'reviewStatus' is '{review_status}' but '{field}' is 'generated' — "
                    f"generated-only form must not be used as production-ready"
                )
    return errors


def _check_pain_point_tags(tags, path: str) -> list[str]:
    """Validate painPointTags against the controlled taxonomy."""
    # (same logic as validate-pain-points.py)
    errors = []
    if not isinstance(tags, list):
        errors.append(f"{path}.painPointTags must be a list")
        return errors
    if len(tags) == 0:
        return errors
    seen = set()
    for tag in tags:
        if not isinstance(tag, str):
            errors.append(f"{path}.painPointTags value must be a string, got {type(tag).__name__}")
            continue
        if tag in seen:
            errors.append(f"{path}.painPointTags: duplicate tag '{tag}'")
        seen.add(tag)
        if tag != tag.lower():
            errors.append(f"{path}.painPointTags: '{tag}' must be lowercase kebab-case")
        if tag not in CONTROLLED_TAGS:
            errors.append(f"{path}.painPointTags: '{tag}' is not in the controlled taxonomy")
    return errors


def _check_pain_point_context(record: dict, path: str) -> list[str]:
    """When region/pain-point tags are present, relevant context fields should exist."""
    errors = []
    tags = record.get("painPointTags", [])
    if not isinstance(tags, list):
        return errors

    tag_set = set(tags)

    if "taiwan-mainland-usage" in tag_set:
        # Must have caution or usageNotesJa explaining the regional difference
        has_explanation = bool(record.get("caution")) or bool(record.get("usageNotesJa"))
        if not has_explanation:
            errors.append(
                f"{path}: 'painPointTags' contains 'taiwan-mainland-usage' but "
                f"neither 'caution' nor 'usageNotesJa' explains the regional difference"
            )

    if "kanji-false-friend" in tag_set:
        has_explanation = bool(record.get("caution")) or bool(record.get("usageNotesJa"))
        # Lesson-type items may use kanjiBridgeNotes instead of caution
        kanji_bridge = record.get("kanjiBridgeNotes", [])
        if isinstance(kanji_bridge, list) and len(kanji_bridge) > 0:
            has_explanation = True
        if not has_explanation:
            errors.append(
                f"{path}: 'painPointTags' contains 'kanji-false-friend' but "
                f"neither 'caution', 'usageNotesJa', nor 'kanjiBridgeNotes' explains the meaning difference"
            )

    if "traditional-simplified" in tag_set:
        if "simplified" not in record or not record.get("simplified"):
            errors.append(
                f"{path}: 'painPointTags' contains 'traditional-simplified' but "
                f"no 'simplified' text is present — contrast needs both forms"
            )

    return errors


def _check_source_metadata(record: dict, path: str) -> list[str]:
    """Require source for reviewed/published content."""
    errors = []
    review_status = record.get("reviewStatus")
    if review_status in ("reviewed", "published"):
        if not record.get("source"):
            errors.append(
                f"{path}: 'source' is required when 'reviewStatus' is '{review_status}'"
            )
    return errors


def _check_regional_usage(record: dict, path: str) -> list[str]:
    """Phrasebook entries must have usageNotesJa for Taiwan-specific scenarios."""
    errors = []
    scenario = record.get("scenario")
    tags = record.get("painPointTags", [])
    if isinstance(scenario, str) and isinstance(tags, list):
        if "taiwan-mainland-usage" in tags and not record.get("usageNotesJa"):
            errors.append(
                f"{path}: scenario '{scenario}' has 'taiwan-mainland-usage' tag "
                f"but 'usageNotesJa' is missing"
            )
    return errors


def _check_resource_url(record: dict, path: str) -> list[str]:
    """Validate resource URLs use HTTP(S) and include a hostname."""
    errors = []
    for field in ("url", "canonicalUrl", "licenseUrl"):
        value = record.get(field)
        if value is not None and isinstance(value, str):
            if not (value.startswith("http://") or value.startswith("https://")):
                errors.append(f"{path}.{field} must start with 'http://' or 'https://'")
            try:
                parsed = urlparse(value)
                hostname = parsed.hostname
            except ValueError:
                hostname = None
            if not hostname:
                errors.append(f"{path}.{field} must include a non-empty hostname")
    return errors


def _check_resource_review_metadata(record: dict, path: str) -> list[str]:
    """Validate optional license and review metadata relationships."""
    errors = []
    review_status = record.get("reviewStatus")

    if "attributionRequired" in record:
        attribution_required = record["attributionRequired"]
        if not isinstance(attribution_required, bool):
            errors.append(f"{path}.attributionRequired must be a boolean when present")
        elif attribution_required and not isinstance(
            record.get("attributionInstructions"), str
        ):
            errors.append(
                f"{path}.attributionInstructions is required and must be a non-empty "
                "string when attributionRequired=True"
            )
        elif attribution_required and not record["attributionInstructions"].strip():
            errors.append(
                f"{path}.attributionInstructions is required and must be a non-empty "
                "string when attributionRequired=True"
            )

    if record.get("licenseUrl") is not None and not (
        isinstance(record.get("licenseName"), str) and record["licenseName"].strip()
    ):
        errors.append(
            f"{path}.licenseName is required and must be non-empty when licenseUrl is present"
        )

    reviewed_by = record.get("reviewedBy")
    reviewed_date = record.get("reviewedDate")
    has_reviewer = isinstance(reviewed_by, str) and bool(reviewed_by.strip())
    has_review_date = isinstance(reviewed_date, str) and bool(reviewed_date.strip())

    if reviewed_date is not None and not has_reviewer:
        errors.append(
            f"{path}.reviewedBy is required and must be non-empty when reviewedDate is present"
        )

    if has_review_date:
        try:
            parsed_date = date.fromisoformat(reviewed_date)
        except ValueError:
            parsed_date = None
        if parsed_date is None or parsed_date.isoformat() != reviewed_date:
            errors.append(f"{path}.reviewedDate must be a real YYYY-MM-DD calendar date")

    if review_status in {"approved", "rejected"} and not has_reviewer:
        errors.append(
            f"{path}.reviewedBy is required and must be non-empty when reviewStatus is "
            f"'{review_status}'"
        )
    if review_status in {"approved", "rejected"} and not has_review_date:
        errors.append(
            f"{path}.reviewedDate is required and must be non-empty when reviewStatus is "
            f"'{review_status}'"
        )

    return errors


# ─── Schema definitions ────────────────────────────────────────────────────

def _build_schemas():
    """Define all content type schemas."""

    # Lesson
    SCHEMAS["lesson"] = {
        "required": [
            "id", "titleJa", "level", "canDoJa", "learnerOutcomeJa",
            "hookJa", "travelScenario", "coreSentence", "reviewStatus",
            "chunks", "kanjiBridgeNotes", "soundFocus",
            "reviewPrompts", "travelTask",
        ],
        "optional": [
            "sections", "examples", "relatedVocabulary",
            "painPointTags",
        ],
        "field_types": {
            "id": str, "titleJa": str, "level": str, "canDoJa": str,
            "learnerOutcomeJa": str, "hookJa": str, "travelScenario": str,
            "coreSentence": str, "reviewStatus": str,
            "sections": list, "chunks": list, "kanjiBridgeNotes": list,
            "soundFocus": list, "examples": list, "reviewPrompts": list,
            "travelTask": str, "relatedVocabulary": list,
            "painPointTags": list,
        },
        "controlled_fields": {
            "level": VALID_LEVELS,
            "travelScenario": VALID_SCENARIOS,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_review_status,
            _check_generated_not_production,
            _check_pain_point_context,
        ],
    }

    # Vocabulary
    SCHEMAS["vocabulary"] = {
        "required": [
            "id", "traditional", "traditionalStatus", "pinyin",
            "japanese", "kana", "category", "reviewStatus",
        ],
        "optional": [
            "simplified", "simplifiedStatus", "similarityType",
            "toneNote", "caution", "travelScenario",
            "painPointTags", "examples", "source",
        ],
        "field_types": {
            "id": str, "pinyin": str, "japanese": str, "kana": str,
            "category": str, "reviewStatus": str,
            "similarityType": str,
            "travelScenario": str,
            "examples": list, "painPointTags": list,
        },
        "controlled_fields": {
            "similarityType": VALID_SIMILARITY_TYPES,
            "travelScenario": VALID_SCENARIOS,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_script_fields,
            _check_review_status,
            _check_generated_not_production,
            _check_pain_point_context,
            _check_source_metadata,
        ],
    }

    # Sentence
    SCHEMAS["sentence"] = {
        "required": [
            "id", "traditional", "traditionalStatus", "pinyin",
            "japanese", "scenario", "reviewStatus",
        ],
        "optional": [
            "simplified", "simplifiedStatus", "notesJa",
            "caution",
            "painPointTags", "soundFocus", "travelTask",
            "relatedVocabulary", "source",
        ],
        "field_types": {
            "id": str, "pinyin": str, "japanese": str,
            "scenario": str, "reviewStatus": str,
            "soundFocus": list, "travelTask": str, "relatedVocabulary": list,
            "painPointTags": list,
        },
        "controlled_fields": {
            "scenario": VALID_SCENARIOS,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_script_fields,
            _check_review_status,
            _check_generated_not_production,
            _check_pain_point_context,
            _check_source_metadata,
        ],
    }

    # Phrasebook
    SCHEMAS["phrasebook"] = {
        "required": [
            "id", "scenario", "traditional", "traditionalStatus",
            "pinyin", "japanese", "reviewStatus",
        ],
        "optional": [
            "simplified", "simplifiedStatus", "usageNotesJa",
            "painPointTags", "relatedVocabulary", "source",
        ],
        "field_types": {
            "id": str, "scenario": str, "pinyin": str,
            "japanese": str, "reviewStatus": str,
            "relatedVocabulary": list, "painPointTags": list,
        },
        "controlled_fields": {
            "scenario": VALID_SCENARIOS,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_script_fields,
            _check_review_status,
            _check_generated_not_production,
            _check_pain_point_context,
            _check_regional_usage,
            _check_source_metadata,
        ],
    }

    # Practice Item
    SCHEMAS["practice"] = {
        "required": [
            "id", "type", "promptJa", "correctAnswer", "reviewStatus",
        ],
        "optional": [
            "distractors", "painPointTags", "relatedVocabulary",
        ],
        "field_types": {
            "id": str, "type": str, "promptJa": str,
            "correctAnswer": str, "reviewStatus": str,
            "distractors": list, "relatedVocabulary": list,
            "painPointTags": list,
        },
        "controlled_fields": {
            "type": VALID_PRACTICE_TYPES,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_review_status,
            _check_generated_not_production,
        ],
    }

    # Resource
    SCHEMAS["resource"] = {
        "required": [
            "id", "title", "url", "owner", "resourceType",
            "licenseStatus", "allowedUse", "attribution",
            "reviewStatus", "notes",
        ],
        "optional": [
            "canonicalUrl", "languageRelevance", "regionalRelevance",
            "scriptRelevance", "attributionInstructions",
            "attributionRequired", "licenseName", "licenseUrl",
            "reviewedBy", "reviewedDate",
        ],
        "field_types": {
            "id": str, "title": str, "url": str, "owner": str,
            "resourceType": str, "licenseStatus": str,
            "allowedUse": str, "attribution": str,
            "canonicalUrl": str,
            "languageRelevance": str, "regionalRelevance": str,
            "scriptRelevance": str, "reviewStatus": str,
            "attributionInstructions": str, "notes": str,
            "licenseName": str, "licenseUrl": str,
            "reviewedBy": str, "reviewedDate": str,
        },
        "controlled_fields": {
            "resourceType": VALID_RESOURCE_TYPES,
            "licenseStatus": VALID_LICENSE_STATUSES,
            "allowedUse": VALID_ALLOWED_USES,
            "reviewStatus": VALID_RESOURCE_REVIEW_STATUSES,
            "languageRelevance": VALID_LANGUAGE_RELEVANCE,
            "regionalRelevance": VALID_REGIONAL_RELEVANCE,
            "scriptRelevance": VALID_SCRIPT_RELEVANCE,
        },
        "extra_validators": [_check_resource_url, _check_resource_review_metadata],
    }


_build_schemas()

# ─── Collection key → schema type mapping ─────────────────────────────────

COLLECTION_MAP = {
    "lessons": "lesson",
    "vocabulary": "vocabulary",
    "sentences": "sentence",
    "phrasebook": "phrasebook",
    "practice": "practice",
    "resources": "resource",
}


# ─── Validation functions ──────────────────────────────────────────────────

def _validate_type(value, expected_type, field_path: str) -> list[str]:
    """Check that value is of expected_type (or None for optional fields)."""
    errors = []
    if value is None:
        return errors
    if not isinstance(value, expected_type):
        errors.append(
            f"{field_path} must be {expected_type.__name__}, "
            f"got {type(value).__name__}"
        )
    return errors


def _validate_controlled(value, valid_set: set, field_path: str) -> list[str]:
    """Check that value is in the controlled set of valid values."""
    errors = []
    if isinstance(value, str) and value not in valid_set:
        errors.append(
            f"{field_path}: '{value}' is not valid; must be one of {sorted(valid_set)}"
        )
    return errors


def validate_single(record: dict, schema_type: str, path: str = "item") -> list[str]:
    """Validate a single content record against its schema type."""
    errors = []
    schema = SCHEMAS.get(schema_type)
    if schema is None:
        errors.append(f"{path}: unknown schema type '{schema_type}'")
        return errors

    required = schema["required"]
    optional = schema["optional"]
    field_types = schema["field_types"]
    controlled_fields = schema["controlled_fields"]
    extra_validators = schema["extra_validators"]

    # Check required fields
    for field in required:
        if field not in record or record[field] is None:
            errors.append(f"{path}: missing required field '{field}'")

    # Check that known field types are correct
    for field, expected_type in field_types.items():
        if field in record and record[field] is not None:
            errors.extend(_validate_type(record[field], expected_type, f"{path}.{field}"))

    # Check controlled fields
    for field, valid_set in controlled_fields.items():
        if field in record and record[field] is not None:
            errors.extend(_validate_controlled(record[field], valid_set, f"{path}.{field}"))

    # Check for unknown fields (if required+optional don't cover it)
    known_fields = set(required) | set(optional)
    for field in record:
        if field not in known_fields:
            errors.append(f"{path}: unknown field '{field}'")

    # Run extra validators
    for validator in extra_validators:
        errors.extend(validator(record, path))

    # Validate painPointTags if present
    if "painPointTags" in record and record["painPointTags"] is not None:
        errors.extend(_check_pain_point_tags(record["painPointTags"], path))

    return errors


def validate_bundle(data: dict, path: str = "root") -> list[str]:
    """
    Walk a content bundle and validate every item against its collection type.
    """
    errors = []

    if not isinstance(data, dict):
        errors.append(f"{path}: content bundle must be a JSON object")
        return errors

    # Track top-level keys that aren't content collections
    ALLOWED_TOP_KEYS = {"metadata", "meta", "version"}

    for key, value in data.items():
        schema_type = COLLECTION_MAP.get(key)
        collection_path = f"{path}.{key}"

        if schema_type is None:
            if key in ALLOWED_TOP_KEYS:
                continue
            errors.append(
                f"{collection_path}: unrecognized top-level key '{key}'"
            )
            continue

        if not isinstance(value, list):
            errors.append(f"{collection_path}: expected a list of {schema_type} items")
            continue

        for i, item in enumerate(value):
            if not isinstance(item, dict):
                errors.append(f"{collection_path}[{i}]: expected a JSON object")
                continue
            item_path = f"{collection_path}[{i}]"
            errors.extend(validate_single(item, schema_type, item_path))

    return errors


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        if len(sys.argv) < 3:
            print("Usage: python3 scripts/validate-content-schema.py --check <file>", file=sys.stderr)
            sys.exit(2)
        filepath = sys.argv[2]
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        errors = validate_bundle(data)
        for e in errors:
            print(f"{filepath}: {e}")
        sys.exit(1 if errors else 0)
    else:
        run_tests()


# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

def run_tests():
    tests = [
        # ─── Lesson ───
        test_lesson_valid,
        test_lesson_missing_required,
        test_lesson_missing_chunks,
        test_lesson_missing_kanji_bridge,
        test_lesson_missing_sound_focus,
        test_lesson_missing_review_prompts,
        test_lesson_missing_travel_task,
        test_lesson_invalid_level,
        test_lesson_invalid_travel_scenario,
        test_lesson_invalid_review_status,
        test_lesson_unknown_field,
        test_lesson_taiwan_usage_needs_context,
        test_lesson_invalid_travel_scenario,
        test_lesson_false_friend_with_kanji_bridge,
        test_lesson_false_friend_without_context,
        test_lesson_chunks_type_string_fails,
        test_lesson_sound_focus_type_string_fails,
        test_lesson_travel_task_type_list_fails,

        # ─── Vocabulary ───
        test_vocab_valid,
        test_vocab_missing_required,
        test_vocab_invalid_script_status,
        test_vocab_invalid_similarity_type,
        test_vocab_similarity_type_non_string,
        test_vocab_generated_not_production,
        test_vocab_missing_caution_for_false_friend,
        test_vocab_missing_caution_for_taiwan_usage,
        test_vocab_source_required_for_published,
        test_vocab_source_not_required_for_draft,
        test_vocab_travel_scenario_controlled,

        # ─── Sentence ───
        test_sentence_valid,
        test_sentence_missing_required,
        test_sentence_false_friend_with_caution,
        test_sentence_scenario_controlled,

        # ─── Phrasebook ───
        test_phrasebook_valid,
        test_phrasebook_missing_required,
        test_phrasebook_invalid_scenario,
        test_phrasebook_missing_usage_for_region,

        # ─── Practice ───
        test_practice_valid,
        test_practice_missing_required,
        test_practice_invalid_type,

        # ─── Resource ───
        test_resource_valid,
        test_resource_valid_with_notes,
        test_resource_license_url_requires_license_name,
        test_resource_license_url_uses_url_validation,
        test_resource_reviewed_date_requires_reviewer,
        test_resource_terminal_review_requires_metadata,
        test_resource_approved_review_with_metadata_is_valid,
        test_resource_reviewed_date_requires_real_iso_date,
        test_resource_attribution_required_rejects_present_non_booleans,
        test_resource_attribution_required_needs_instructions,
        test_resource_missing_license_status,
        test_resource_missing_allowed_use,
        test_resource_missing_review_status,
        test_resource_missing_attribution,
        test_resource_invalid_license_status,
        test_resource_invalid_allowed_use,
        test_resource_invalid_resource_type,
        test_resource_invalid_review_status,
        test_resource_invalid_url,
        test_resource_url_ftp_fails,
        test_resource_url_without_hostname_fails,
        test_resource_unknown_field,
        test_resource_notes_wrong_type,
        test_resource_url_https_allowed,
        test_resource_url_http_allowed,
        test_resource_url_empty_string,
        test_resource_url_non_string,
        test_resource_canonical_url_valid,
        test_resource_canonical_url_invalid,
        test_resource_missing_notes,
        test_resource_bundle_with_resources,
        test_resource_bundle_invalid_resource,
        test_resource_bundle_non_list,

        # ─── Bundle ───
        test_bundle_valid,
        test_bundle_invalid_item,
        test_bundle_non_collection_keys_ok,
        test_bundle_unknown_collection_fails,
        test_bundle_object_key_fails,
        test_bundle_unknown_string_key_fails,

        # ─── Pain point tags ───
        test_pain_point_tags_valid,
        test_pain_point_tags_invalid,
        test_pain_point_tags_duplicate,
        test_pain_point_tags_empty_ok,
        test_pain_point_tags_missing_ok,
        test_pain_point_tags_non_list,
    ]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
        except AssertionError as e:
            print(f"  FAIL  {test.__name__}: {e}")
            failures += 1
    if failures:
        print(f"\n{failures} test(s) FAILED")
        sys.exit(1)
    else:
        print("\nAll tests PASSED")


# ─── Test helpers ──────────────────────────────────────────────────────────

def _assert_no_errors(errors, label=""):
    assert errors == [], f"{label}: Expected no errors, got {errors}"


def _assert_has_error(errors, keyword, label=""):
    assert any(keyword in e for e in errors), (
        f"{label}: Expected error containing '{keyword}', got {errors}"
    )


# ─── Lesson tests ──────────────────────────────────────────────────────────

def _minimal_lesson(**overrides):
    data = {
        "id": "lesson-001",
        "titleJa": "レストランで注文する",
        "level": "beginner",
        "canDoJa": "レストランで簡単な注文ができる",
        "learnerOutcomeJa": "基本的な注文表現を覚える",
        "hookJa": "台湾の夜市で何を食べよう？",
        "travelScenario": "food",
        "coreSentence": "我要這個",
        "reviewStatus": "draft",
        "chunks": [],
        "kanjiBridgeNotes": [],
        "soundFocus": [],
        "reviewPrompts": [],
        "travelTask": "練習してみよう",
    }
    data.update(overrides)
    return data


def test_lesson_valid():
    errs = validate_single(_minimal_lesson(), "lesson")
    _assert_no_errors(errs, "lesson_valid")


def test_lesson_missing_chunks():
    errs = validate_single(_minimal_lesson(chunks=None), "lesson")
    _assert_has_error(errs, "required field", "lesson_missing_chunks")


def test_lesson_missing_kanji_bridge():
    errs = validate_single(_minimal_lesson(kanjiBridgeNotes=None), "lesson")
    _assert_has_error(errs, "required field", "lesson_missing_kanji_bridge")


def test_lesson_missing_sound_focus():
    errs = validate_single(_minimal_lesson(soundFocus=None), "lesson")
    _assert_has_error(errs, "required field", "lesson_missing_sound_focus")


def test_lesson_missing_review_prompts():
    errs = validate_single(_minimal_lesson(reviewPrompts=None), "lesson")
    _assert_has_error(errs, "required field", "lesson_missing_review_prompts")


def test_lesson_missing_travel_task():
    errs = validate_single(_minimal_lesson(travelTask=None), "lesson")
    _assert_has_error(errs, "required field", "lesson_missing_travel_task")


def test_lesson_chunks_type_string_fails():
    """chunks must be a list, not a string."""
    errs = validate_single(_minimal_lesson(chunks="not-a-list"), "lesson")
    _assert_has_error(errs, "must be list", "lesson_chunks_type")


def test_lesson_sound_focus_type_string_fails():
    """soundFocus must be a list, not a string."""
    errs = validate_single(_minimal_lesson(soundFocus="not-a-list"), "lesson")
    _assert_has_error(errs, "must be list", "lesson_soundfocus_type")


def test_lesson_travel_task_type_list_fails():
    """travelTask must be a string, not a list."""
    errs = validate_single(_minimal_lesson(travelTask=["not-a-string"]), "lesson")
    _assert_has_error(errs, "must be str", "lesson_traveltask_type")


def test_lesson_missing_required():
    errs = validate_single({"id": "lesson-001"}, "lesson")
    _assert_has_error(errs, "required field", "lesson_missing")


def test_lesson_invalid_level():
    errs = validate_single(_minimal_lesson(level="advanced"), "lesson")
    _assert_has_error(errs, "not valid", "lesson_level")


def test_lesson_invalid_travel_scenario():
    """travelScenario must be from VALID_SCENARIOS."""
    errs = validate_single(_minimal_lesson(travelScenario="travel"), "lesson")
    _assert_has_error(errs, "not valid", "lesson_travel_scenario")


def test_lesson_invalid_review_status():
    errs = validate_single(_minimal_lesson(reviewStatus="approved"), "lesson")
    _assert_has_error(errs, "not valid", "lesson_review")


def test_lesson_unknown_field():
    errs = validate_single(_minimal_lesson(randomField="xyz"), "lesson")
    _assert_has_error(errs, "unknown", "lesson_unknown")


def test_lesson_taiwan_usage_needs_context():
    """Lesson with taiwan-mainland-usage tag must have contextual fields."""
    errs = validate_single(
        _minimal_lesson(painPointTags=["taiwan-mainland-usage"]),
        "lesson",
    )
    _assert_has_error(errs, "painPointTags", "lesson_taiwan_context")
    _assert_has_error(errs, "neither", "lesson_taiwan_context")


def test_lesson_false_friend_with_kanji_bridge():
    """Lesson with kanji-false-friend and non-empty kanjiBridgeNotes should pass."""
    errs = validate_single(
        _minimal_lesson(
            painPointTags=["kanji-false-friend"],
            kanjiBridgeNotes=[{"kanji": "手紙", "jpReading": "てがみ", "noteJa": "日本語の手紙≠中国語の手紙"}],
        ),
        "lesson",
    )
    _assert_no_errors(errs, "lesson_false_friend_kanji_bridge")


def test_lesson_false_friend_without_context():
    """Lesson with kanji-false-friend and no explanation should fail."""
    errs = validate_single(
        _minimal_lesson(painPointTags=["kanji-false-friend"]),
        "lesson",
    )
    _assert_has_error(errs, "kanji-false-friend", "lesson_false_friend_no_context")
    _assert_has_error(errs, "kanjiBridgeNotes", "lesson_false_friend_no_context")


# ─── Vocabulary tests ──────────────────────────────────────────────────────

def _minimal_vocab(**overrides):
    data = {
        "id": "voc-001",
        "traditional": "謝謝",
        "traditionalStatus": "authored",
        "pinyin": "xièxie",
        "japanese": "ありがとう",
        "kana": "ありがとう",
        "category": "greeting",
        "reviewStatus": "draft",
    }
    data.update(overrides)
    return data


def test_vocab_valid():
    errs = validate_single(_minimal_vocab(), "vocabulary")
    _assert_no_errors(errs, "vocab_valid")


def test_vocab_missing_required():
    errs = validate_single({"id": "voc-001"}, "vocabulary")
    _assert_has_error(errs, "required field", "vocab_missing")


def test_vocab_invalid_script_status():
    errs = validate_single(_minimal_vocab(traditionalStatus="draft"), "vocabulary")
    _assert_has_error(errs, "not a valid status", "vocab_script_status")


def test_vocab_invalid_similarity_type():
    errs = validate_single(_minimal_vocab(similarityType="exact-match"), "vocabulary")
    _assert_has_error(errs, "not valid", "vocab_similarity")


def test_vocab_similarity_type_non_string():
    """similarityType must be a string, not a number."""
    errs = validate_single(_minimal_vocab(similarityType=123), "vocabulary")
    _assert_has_error(errs, "must be str", "vocab_similarity_type")


def test_vocab_generated_not_production():
    errs = validate_single(
        _minimal_vocab(traditionalStatus="generated", reviewStatus="published"),
        "vocabulary",
    )
    _assert_has_error(errs, "generated-only", "vocab_generated_prod")


def test_vocab_missing_caution_for_false_friend():
    errs = validate_single(
        _minimal_vocab(painPointTags=["kanji-false-friend"]),
        "vocabulary",
    )
    _assert_has_error(errs, "caution", "vocab_no_caution_falsefriend")


def test_vocab_missing_caution_for_taiwan_usage():
    errs = validate_single(
        _minimal_vocab(painPointTags=["taiwan-mainland-usage"]),
        "vocabulary",
    )
    _assert_has_error(errs, "caution", "vocab_no_caution_taiwan")


def test_vocab_travel_scenario_controlled():
    errs = validate_single(_minimal_vocab(travelScenario="weather"), "vocabulary")
    _assert_has_error(errs, "not valid", "vocab_travel_scenario")


def test_vocab_source_required_for_published():
    """reviewed/published content must have source."""
    errs = validate_single(
        _minimal_vocab(reviewStatus="published"),
        "vocabulary",
    )
    _assert_has_error(errs, "source", "vocab_source_published")


def test_vocab_source_not_required_for_draft():
    """draft content can lack source."""
    errs = validate_single(
        _minimal_vocab(),
        "vocabulary",
    )
    _assert_no_errors(errs, "vocab_source_draft")


# ─── Sentence tests ────────────────────────────────────────────────────────

def _minimal_sentence(**overrides):
    data = {
        "id": "sentence-001",
        "traditional": "我要去車站",
        "traditionalStatus": "authored",
        "pinyin": "wǒ yào qù chēzhàn",
        "japanese": "駅に行きたいです",
        "scenario": "transport",
        "reviewStatus": "draft",
    }
    data.update(overrides)
    return data


def test_sentence_valid():
    errs = validate_single(_minimal_sentence(), "sentence")
    _assert_no_errors(errs, "sentence_valid")


def test_sentence_missing_required():
    errs = validate_single({"id": "sentence-001"}, "sentence")
    _assert_has_error(errs, "required field", "sentence_missing")


def test_sentence_false_friend_with_caution():
    """Sentence with kanji-false-friend must have caution; now caution is allowed."""
    errs = validate_single(
        _minimal_sentence(
            painPointTags=["kanji-false-friend"],
            caution="日本語の「手紙（てがみ）」＝ letter とは意味が違う",
        ),
        "sentence",
    )
    _assert_no_errors(errs, "sentence_false_friend_caution")


def test_sentence_scenario_controlled():
    """Sentence scenario must be from VALID_SCENARIOS."""
    errs = validate_single(_minimal_sentence(scenario="weather"), "sentence")
    _assert_has_error(errs, "not valid", "sentence_scenario")


# ─── Phrasebook tests ──────────────────────────────────────────────────────

def _minimal_phrasebook(**overrides):
    data = {
        "id": "phrase-001",
        "scenario": "food",
        "traditional": "我要這個",
        "traditionalStatus": "authored",
        "pinyin": "wǒ yào zhège",
        "japanese": "これをください",
        "reviewStatus": "draft",
    }
    data.update(overrides)
    return data


def test_phrasebook_valid():
    errs = validate_single(_minimal_phrasebook(), "phrasebook")
    _assert_no_errors(errs, "phrasebook_valid")


def test_phrasebook_missing_required():
    errs = validate_single({"id": "phrase-001"}, "phrasebook")
    _assert_has_error(errs, "required field", "phrasebook_missing")


def test_phrasebook_invalid_scenario():
    errs = validate_single(_minimal_phrasebook(scenario="weather"), "phrasebook")
    _assert_has_error(errs, "not valid", "phrasebook_scenario")


def test_phrasebook_missing_usage_for_region():
    errs = validate_single(
        _minimal_phrasebook(painPointTags=["taiwan-mainland-usage"]),
        "phrasebook",
    )
    _assert_has_error(errs, "usageNotesJa", "phrasebook_region_usage")


# ─── Practice tests ────────────────────────────────────────────────────────

def _minimal_practice(**overrides):
    data = {
        "id": "practice-001",
        "type": "tone-discrimination",
        "promptJa": "次の音声を聴いて、正しい声調を選んでください",
        "correctAnswer": "mā",
        "reviewStatus": "draft",
    }
    data.update(overrides)
    return data


def test_practice_valid():
    errs = validate_single(_minimal_practice(), "practice")
    _assert_no_errors(errs, "practice_valid")


def test_practice_missing_required():
    errs = validate_single({"id": "practice-001"}, "practice")
    _assert_has_error(errs, "required field", "practice_missing")


def test_practice_invalid_type():
    errs = validate_single(_minimal_practice(type="translation"), "practice")
    _assert_has_error(errs, "not valid", "practice_type")


# ─── Resource tests ────────────────────────────────────────────────────────

def _minimal_resource(**overrides):
    data = {
        "id": "resource-test-001",
        "title": "Test Resource",
        "url": "https://example.org/test",
        "owner": "Test Owner",
        "resourceType": "reference",
        "licenseStatus": "needs-review",
        "allowedUse": "reference-only",
        "reviewStatus": "candidate",
        "attribution": "Test Resource (https://example.org/test) by Test Owner",
        "notes": "Metadata-only reference.",
    }
    data.update(overrides)
    return data


def test_resource_valid():
    errs = validate_single(_minimal_resource(), "resource")
    _assert_no_errors(errs, "resource_valid")




def test_resource_valid_with_notes():
    errs = validate_single(_minimal_resource(notes="Optional note"), "resource")
    _assert_no_errors(errs, "resource_with_notes")


def test_resource_license_url_requires_license_name():
    errs = validate_single(
        _minimal_resource(licenseUrl="https://example.org/license"), "resource"
    )
    _assert_has_error(errs, "licenseName", "resource_license_url_requires_name")


def test_resource_license_url_uses_url_validation():
    errs = validate_single(
        _minimal_resource(licenseName="Example", licenseUrl="https://"), "resource"
    )
    _assert_has_error(errs, "licenseUrl", "resource_license_url_hostname")


def test_resource_reviewed_date_requires_reviewer():
    errs = validate_single(_minimal_resource(reviewedDate="2026-07-12"), "resource")
    _assert_has_error(errs, "reviewedBy", "resource_review_date_requires_reviewer")


def test_resource_terminal_review_requires_metadata():
    for status in ("approved", "rejected"):
        errs = validate_single(_minimal_resource(reviewStatus=status), "resource")
        _assert_has_error(errs, "reviewedBy", f"resource_{status}_reviewer")
        _assert_has_error(errs, "reviewedDate", f"resource_{status}_date")


def test_resource_approved_review_with_metadata_is_valid():
    errs = validate_single(
        _minimal_resource(
            licenseStatus="approved",
            reviewStatus="approved",
            reviewedBy="content-reviewer",
            reviewedDate="2026-07-12",
        ),
        "resource",
    )
    _assert_no_errors(errs, "resource_approved_review_with_metadata")


def test_resource_reviewed_date_requires_real_iso_date():
    for reviewed_date in ("2026-02-29", "2026-13-01", "20260712"):
        errs = validate_single(
            _minimal_resource(reviewedBy="editor", reviewedDate=reviewed_date), "resource"
        )
        _assert_has_error(errs, "reviewedDate", f"resource_bad_date_{reviewed_date}")


def test_resource_attribution_required_rejects_present_non_booleans():
    for value in (None, 1, "true"):
        errs = validate_single(_minimal_resource(attributionRequired=value), "resource")
        _assert_has_error(errs, "attributionRequired", f"resource_bad_bool_{value!r}")


def test_resource_attribution_required_needs_instructions():
    errs = validate_single(_minimal_resource(attributionRequired=True), "resource")
    _assert_has_error(errs, "attributionInstructions", "resource_attribution_instructions")


def test_resource_missing_license_status():
    errs = validate_single(_minimal_resource(licenseStatus=None), "resource")
    _assert_has_error(errs, "required field", "resource_no_license_status")


def test_resource_missing_allowed_use():
    errs = validate_single(_minimal_resource(allowedUse=None), "resource")
    _assert_has_error(errs, "required field", "resource_no_allowed_use")


def test_resource_missing_review_status():
    errs = validate_single(_minimal_resource(reviewStatus=None), "resource")
    _assert_has_error(errs, "required field", "resource_no_review_status")


def test_resource_missing_attribution():
    errs = validate_single(_minimal_resource(attribution=None), "resource")
    _assert_has_error(errs, "required field", "resource_no_attribution")


def test_resource_missing_notes():
    errs = validate_single(_minimal_resource(notes=None), "resource")
    _assert_has_error(errs, "required field", "resource_no_notes")


def test_resource_invalid_license_status():
    errs = validate_single(_minimal_resource(licenseStatus="approved-but-not"), "resource")
    _assert_has_error(errs, "not valid", "resource_invalid_license")


def test_resource_invalid_allowed_use():
    errs = validate_single(_minimal_resource(allowedUse="unknown"), "resource")
    _assert_has_error(errs, "not valid", "resource_invalid_allowed_use")


def test_resource_invalid_resource_type():
    errs = validate_single(_minimal_resource(resourceType="feed"), "resource")
    _assert_has_error(errs, "not valid", "resource_invalid_type")


def test_resource_invalid_review_status():
    errs = validate_single(_minimal_resource(reviewStatus="invalid"), "resource")
    _assert_has_error(errs, "not valid", "resource_invalid_review_status")


def test_resource_invalid_url():
    """URL must start with http:// or https://."""
    errs = validate_single(_minimal_resource(url="example.org"), "resource")
    _assert_has_error(errs, "must start with", "resource_invalid_url")


def test_resource_url_ftp_fails():
    errs = validate_single(_minimal_resource(url="ftp://example.org/resource"), "resource")
    _assert_has_error(errs, "must start with", "resource_url_ftp")


def test_resource_url_without_hostname_fails():
    errs = validate_single(_minimal_resource(url="https://"), "resource")
    _assert_has_error(errs, "hostname", "resource_url_no_hostname")


def test_resource_unknown_field():
    errs = validate_single(_minimal_resource(randomField="xyz"), "resource")
    _assert_has_error(errs, "unknown field", "resource_unknown")


def test_resource_notes_wrong_type():
    """notes must be str, not list."""
    errs = validate_single(_minimal_resource(notes=["not-a-string"]), "resource")
    _assert_has_error(errs, "must be str", "resource_notes_type")


def test_resource_url_https_allowed():
    """https:// URLs must be accepted."""
    errs = validate_single(_minimal_resource(url="https://example.org"), "resource")
    _assert_no_errors(errs, "resource_url_https")


def test_resource_url_http_allowed():
    """http:// URLs must be accepted."""
    errs = validate_single(_minimal_resource(url="http://example.org"), "resource")
    _assert_no_errors(errs, "resource_url_http")


def test_resource_url_empty_string():
    """Empty url string should trigger scheme error."""
    errs = validate_single(_minimal_resource(url=""), "resource")
    _assert_has_error(errs, "must start with", "resource_url_empty")


def test_resource_url_non_string():
    """Non-string url gets type error."""
    errs = validate_single(_minimal_resource(url=42), "resource")
    _assert_has_error(errs, "must be str", "resource_url_type")


def test_resource_canonical_url_valid():
    """canonicalUrl with https:// should pass."""
    errs = validate_single(_minimal_resource(canonicalUrl="https://canonical.example"), "resource")
    _assert_no_errors(errs, "resource_canonical_url_valid")


def test_resource_canonical_url_invalid():
    """canonicalUrl with ftp:// should fail."""
    errs = validate_single(_minimal_resource(canonicalUrl="ftp://canonical.example"), "resource")
    _assert_has_error(errs, "must start with", "resource_canonical_url_invalid")


def test_resource_bundle_with_resources():
    """resources collection in bundle should be recognized and validated."""
    data = {
        "resources": [_minimal_resource()],
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "bundle_with_resources")


def test_resource_bundle_invalid_resource():
    """resources collection with invalid entry should fail."""
    data = {
        "resources": [
            _minimal_resource(),
            {"id": "resource-bad"},
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "required field", "bundle_resource_invalid")


def test_resource_bundle_non_list():
    """resources must be a list."""
    data = {"resources": "not-a-list"}
    errs = validate_bundle(data)
    _assert_has_error(errs, "expected a list", "bundle_resource_non_list")


# ─── Bundle tests ──────────────────────────────────────────────────────────

def test_bundle_valid():
    data = {
        "lessons": [_minimal_lesson()],
        "vocabulary": [_minimal_vocab()],
        "sentences": [_minimal_sentence()],
        "phrasebook": [_minimal_phrasebook()],
        "practice": [_minimal_practice()],
        "resources": [_minimal_resource()],
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "bundle_valid")


def test_bundle_invalid_item():
    data = {
        "vocabulary": [
            _minimal_vocab(),
            {"id": "voc-bad"},
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "required field", "bundle_invalid")


def test_bundle_non_collection_keys_ok():
    """Top-level metadata keys should not cause errors."""
    data = {
        "metadata": {"version": 1},
        "vocabulary": [_minimal_vocab()],
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "bundle_metadata")


def test_bundle_unknown_collection_fails():
    """Unknown top-level keys must be rejected."""
    data = {"vocabularies_typo": [_minimal_vocab()]}
    errs = validate_bundle(data)
    _assert_has_error(errs, "unrecognized", "bundle_unknown_collection")


def test_bundle_object_key_fails():
    """Unknown top-level key with dict value must also be rejected."""
    data = {"lesson": {"id": "x"}}
    errs = validate_bundle(data)
    _assert_has_error(errs, "unrecognized", "bundle_object_key")


def test_bundle_unknown_string_key_fails():
    """Unknown top-level key with string value must also be rejected."""
    data = {"vocab": "should fail"}
    errs = validate_bundle(data)
    _assert_has_error(errs, "unrecognized", "bundle_unknown_string")


# ─── Pain point tag tests ──────────────────────────────────────────────────

def test_pain_point_tags_valid():
    errs = _check_pain_point_tags(["tone", "measure-word"], "root")
    _assert_no_errors(errs, "tags_valid")


def test_pain_point_tags_invalid():
    errs = _check_pain_point_tags(["ton"], "root")
    _assert_has_error(errs, "controlled taxonomy", "tags_invalid")


def test_pain_point_tags_duplicate():
    errs = _check_pain_point_tags(["tone", "tone"], "root")
    _assert_has_error(errs, "duplicate", "tags_duplicate")


def test_pain_point_tags_empty_ok():
    errs = _check_pain_point_tags([], "root")
    _assert_no_errors(errs, "tags_empty")


def test_pain_point_tags_missing_ok():
    """Absence of painPointTags is not an error; handled by schema optional fields."""
    errs = validate_single(_minimal_vocab(), "vocabulary")
    _assert_no_errors(errs, "tags_missing_ok")


def test_pain_point_tags_non_list():
    errs = _check_pain_point_tags("tone", "root")
    _assert_has_error(errs, "list", "tags_non_list")


if __name__ == "__main__":
    main()
