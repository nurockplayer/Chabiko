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
    "tone-discrimination", "pinyin-contrast", "guided-shadowing", "pronunciation-practice", "word-order",
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


def _check_pronunciation_practice_fields(record: dict, path: str) -> list[str]:
    """Enforce the type-specific authoring contract for pronunciation items."""
    practice_type = record.get("type")
    requirements = {
        "tone-discrimination": (
            "correctAnswer", "distractors", "contrastId", "toneContourId",
            "toneContourHintJa", "interferenceJa",
        ),
        "pinyin-contrast": (
            "correctAnswer", "distractors", "contrastId", "contrastNoteJa",
            "interferenceJa", "articulationJa",
        ),
        "guided-shadowing": (
            "targetTraditional", "targetTraditionalStatus", "targetPinyin",
            "toneContourId", "shadowStepsJa", "selfCheckJa", "interferenceJa",
            "articulationJa",
        ),
    }
    required_fields = requirements.get(practice_type)
    if required_fields is None:
        if record.get("correctAnswer") is None:
            return [f"{path}: 'correctAnswer' is required for type '{practice_type}'"]
        return []

    errors = [
        f"{path}: '{field}' is required for type '{practice_type}'"
        for field in required_fields
        if record.get(field) is None
    ]
    if practice_type == "guided-shadowing":
        if record.get("correctAnswer") is not None:
            errors.append(
                f"{path}.correctAnswer must be null for type 'guided-shadowing'"
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


def _check_lesson_practice_readiness(record: dict, path: str) -> list[str]:
    """Production-ready lessons (reviewed/published) must have at least one usable review prompt."""
    errors = []
    review_status = record.get("reviewStatus", "")
    if review_status not in ("reviewed", "published"):
        return errors

    prompts = record.get("reviewPrompts")
    if not isinstance(prompts, list) or len(prompts) == 0:
        errors.append(f"{path}.reviewPrompts: '{review_status}' lesson must have at least one review prompt")
        return errors

    has_usable = False
    for prompt in prompts:
        if not isinstance(prompt, dict):
            continue
        pj = prompt.get("promptJa")
        aj = prompt.get("answerJa")
        dj = prompt.get("distractorsJa")
        if not isinstance(pj, str) or pj.strip() == "":
            continue
        if not isinstance(aj, str) or aj.strip() == "":
            continue
        if not isinstance(dj, list) or len(dj) == 0:
            continue
        for d in dj:
            if isinstance(d, str) and d.strip() and d.strip() != aj.strip():
                has_usable = True
                break
        if has_usable:
            break

    if not has_usable:
        errors.append(
            f"{path}: '{review_status}' lesson must have at least one review prompt "
            f"with a non-empty distractor string different from the answer"
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

    if isinstance(reviewed_date, str) and not reviewed_date.strip():
        errors.append(
            f"{path}.reviewedDate must not be empty or whitespace-only"
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


def _check_resource_permission_policy(record: dict, path: str) -> list[str]:
    """Validate permission flags and cross-field consistency for resources."""
    errors = []

    PERMISSION_FLAGS = (
        "productionImportAllowed", "commercialUseAllowed",
        "modificationAllowed", "redistributionAllowed",
    )
    NON_REFERENCE_USES = {"attributed-use", "non-commercial", "commercial"}

    # Phase 1: Type check — reject null for permission flags
    for field in PERMISSION_FLAGS:
        if field in record and record[field] is None:
            errors.append(f"{path}.{field} must be a boolean when present")

    # Collect boolean-valued flags for cross-field checks
    true_flags = set()
    commercial_explicitly_false = (
        isinstance(record.get("commercialUseAllowed"), bool)
        and record["commercialUseAllowed"] is False
    )
    for field in PERMISSION_FLAGS:
        val = record.get(field)
        if isinstance(val, bool) and val is True:
            true_flags.add(field)

    license_status = record.get("licenseStatus")
    review_status = record.get("reviewStatus")
    allowed_use = record.get("allowedUse")

    # Track flags already reported, so no field gets two errors
    errored_flags = set()

    # Phase A: allowedUse itself is a permission declaration
    # licenseStatus=unknown/needs-review/prohibited restricts allowedUse
    if isinstance(license_status, str) and license_status in ("unknown", "needs-review", "prohibited"):
        if isinstance(allowed_use, str) and allowed_use in NON_REFERENCE_USES:
            errors.append(
                f"{path}: allowedUse is '{allowed_use}' but licenseStatus is "
                f"'{license_status}'; must be 'reference-only' or 'citation'"
            )

    # reviewStatus=rejected restricts allowedUse
    if review_status == "rejected" and isinstance(allowed_use, str) and allowed_use in NON_REFERENCE_USES:
        errors.append(
            f"{path}: allowedUse is '{allowed_use}' but reviewStatus is "
            f"'rejected'; must be 'reference-only' or 'citation'"
        )

    # Phase B: licenseStatus in {unknown, needs-review, prohibited} blocks flags
    if isinstance(license_status, str) and license_status in ("unknown", "needs-review", "prohibited"):
        for field in sorted(true_flags):
            errors.append(
                f"{path}.{field} must be false or absent when "
                f"licenseStatus is '{license_status}'"
            )
            errored_flags.add(field)

    # Phase C: reviewStatus=rejected blocks remaining flags
    if review_status == "rejected":
        for field in sorted(true_flags - errored_flags):
            errors.append(
                f"{path}.{field} must be false or absent when "
                f"reviewStatus is 'rejected'"
            )
            errored_flags.add(field)

    # Phase D: productionImportAllowed positive checks (one combined error per flag)
    if "productionImportAllowed" not in errored_flags and "productionImportAllowed" in true_flags:
        reasons = []
        if isinstance(license_status, str) and license_status not in ("approved", "restricted"):
            reasons.append(f"licenseStatus is '{license_status}'")
        if isinstance(allowed_use, str) and allowed_use in ("reference-only", "citation"):
            reasons.append(f"allowedUse is '{allowed_use}'")
        if not isinstance(review_status, str) or review_status != "approved":
            reasons.append(f"reviewStatus is '{review_status}'")
        if reasons:
            errors.append(
                f"{path}.productionImportAllowed is true but "
                + "; ".join(reasons)
            )
            errored_flags.add("productionImportAllowed")

    # Phase E: reviewStatus=approved conflicts with bad licenseStatus
    if review_status == "approved" and isinstance(license_status, str) and \
       license_status in ("unknown", "needs-review", "prohibited"):
        errors.append(
            f"{path}: reviewStatus is 'approved' but licenseStatus is "
            f"'{license_status}'"
        )

    # Phase F: allowedUse must be consistent with remaining permission flags
    unhandled = true_flags - errored_flags
    if isinstance(allowed_use, str):
        if allowed_use in ("reference-only", "citation"):
            for field in sorted(unhandled):
                errors.append(
                    f"{path}.{field} is true but allowedUse is '{allowed_use}'"
                )
        elif allowed_use == "non-commercial" and "commercialUseAllowed" in unhandled:
            errors.append(
                f"{path}.commercialUseAllowed is true but allowedUse is 'non-commercial'"
            )
        elif allowed_use == "commercial" and commercial_explicitly_false:
            errors.append(
                f"{path}.commercialUseAllowed is false but allowedUse is 'commercial'"
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
            _check_lesson_practice_readiness,
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
            "id", "type", "promptJa", "reviewStatus",
        ],
        "optional": [
            "correctAnswer", "distractors", "painPointTags", "relatedVocabulary",
            "contrastId", "toneContourId", "toneContourHintJa", "interferenceJa",
            "audioRef", "contrastNoteJa", "articulationJa", "targetTraditional",
            "targetTraditionalStatus", "targetSimplified", "targetSimplifiedStatus",
            "targetPinyin", "shadowStepsJa", "selfCheckJa", "requiredForQuest",
        ],
        "field_types": {
            "id": str, "type": str, "promptJa": str,
            "correctAnswer": str, "reviewStatus": str,
            "distractors": list, "relatedVocabulary": list,
            "painPointTags": list, "contrastId": str, "toneContourId": str,
            "toneContourHintJa": str, "interferenceJa": str, "audioRef": str,
            "contrastNoteJa": str, "articulationJa": str, "targetTraditional": str,
            "targetTraditionalStatus": str, "targetSimplified": str,
            "targetSimplifiedStatus": str, "targetPinyin": str, "shadowStepsJa": list,
            "selfCheckJa": list, "requiredForQuest": bool,
        },
        "controlled_fields": {
            "type": VALID_PRACTICE_TYPES,
            "reviewStatus": VALID_REVIEW_STATUSES,
            "targetTraditionalStatus": CONTROLLED_STATUSES,
            "targetSimplifiedStatus": CONTROLLED_STATUSES,
        },
        "extra_validators": [
            _check_review_status,
            _check_generated_not_production,
            _check_pronunciation_practice_fields,
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
            "productionImportAllowed", "commercialUseAllowed",
            "modificationAllowed", "redistributionAllowed",
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
            "productionImportAllowed": bool, "commercialUseAllowed": bool,
            "modificationAllowed": bool, "redistributionAllowed": bool,
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
        "extra_validators": [_check_resource_url, _check_resource_review_metadata, _check_resource_permission_policy],
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

        # Duplicate resource ID detection (bundle-level, within the resource collection)
        if schema_type == "resource":
            errors.extend(_check_resource_duplicate_ids(value, collection_path))

    return errors


def _check_resource_duplicate_ids(resources: list, path: str) -> list[str]:
    """
    Detect resources with duplicate 'id' values within the same bundle.

    Only checks entries that have a valid string 'id'; non-string/missing ids
    are handled by schema validation and silently skipped here to avoid crashes.
    """
    errors: list[str] = []
    seen: dict[str, int] = {}
    for i, item in enumerate(resources):
        if not isinstance(item, dict):
            continue
        rid = item.get("id")
        if not isinstance(rid, str):
            continue
        if rid in seen:
            errors.append(
                f"{path}[{i}]: duplicate resource id '{rid}' "
                f"(first occurrence at {path}[{seen[rid]}])"
            )
        else:
            seen[rid] = i
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
        test_lesson_practice_readiness_without_distractors,
        test_lesson_practice_readiness_all_equal_answer,
        test_lesson_practice_readiness_missing_distractors,
        test_lesson_practice_readiness_valid,
        test_draft_lesson_missing_distractors_ok,
        test_lesson_practice_readiness_published_fails,
        test_lesson_practice_readiness_published_ok,

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
        test_tone_discrimination_practice_contract,
        test_pinyin_contrast_practice_contract,
        test_guided_shadowing_practice_contract,
        test_pronunciation_practice_contract_missing_field,
        test_guided_shadowing_rejects_correct_answer,
        test_existing_practice_type_still_requires_correct_answer,

        # ─── Resource ───
        test_resource_valid,
        test_resource_valid_with_notes,
        test_resource_license_url_requires_license_name,
        test_resource_license_url_uses_url_validation,
        test_resource_reviewed_date_requires_reviewer,
        test_resource_terminal_review_requires_metadata,
        test_resource_approved_review_with_metadata_is_valid,
        test_resource_reviewed_date_requires_real_iso_date,
        test_resource_reviewed_date_empty_string_fails,
        test_resource_reviewed_date_whitespace_fails,
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

        # ─── Resource permission policy ───
        test_resource_all_permissions_false_ok,
        test_resource_all_permissions_true_ok,
        test_resource_permission_flags_reject_null,
        test_resource_permission_flags_reject_number,
        test_resource_permission_flags_reject_string,
        test_resource_permission_omitted_ok,
        test_resource_permissions_unknown_license_blocked,
        test_resource_permissions_needs_review_license_blocked,
        test_resource_permissions_prohibited_license_blocked,
        test_resource_permissions_rejected_review_blocked,
        test_resource_permissions_rejected_no_duplicate_flag_errors,
        test_resource_production_import_bad_license,
        test_resource_production_import_bad_allowed_use,
        test_resource_production_import_bad_review_status,
        test_resource_production_import_restricted_allowed,
        test_resource_review_approved_conflicts_with_bad_license,
        test_resource_allowed_use_reference_only_no_permissions,
        test_resource_allowed_use_citation_no_permissions,
        test_resource_allowed_use_non_commercial_no_commercial,
        test_resource_candidate_backward_compatible,
        test_resource_restricted_license_allows_permissions,

        # ─── Resource permission policy regression ───
        test_resource_prohibited_license_commercial_use_no_flags,
        test_resource_rejected_review_commercial_use_no_flags,
        test_resource_unknown_license_non_reference_use,
        test_resource_needs_review_license_non_reference_use,
        test_resource_allowed_use_commercial_explicit_false,
        test_resource_pia_combined_allowed_use_and_review_one_error,

        # ─── Resource duplicate ID detection ───
        test_resource_duplicate_id_simple,
        test_resource_duplicate_id_three_entries,
        test_resource_duplicate_id_error_message_format,
        test_resource_no_duplicate_no_error,
        test_resource_missing_id_does_not_crash,
        test_resource_missing_id_does_not_false_positive_with_none,
        test_resource_wrong_type_id_does_not_crash,
        test_resource_duplicate_different_content_types_not_detected,
        test_resource_duplicate_deterministic_order,

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


def test_lesson_practice_readiness_without_distractors():
    """reviewed lesson without usable prompt should fail."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[{"promptJa": "Q?", "answerJa": "A", "distractorsJa": []}]),
        "lesson",
    )
    _assert_has_error(errs, "non-empty distractor", "lesson_practice_no_distractors")


def test_lesson_practice_readiness_all_equal_answer():
    """reviewed lesson with all distractors equal to answer should fail."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[{"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["A"]}]),
        "lesson",
    )
    _assert_has_error(errs, "non-empty distractor", "lesson_practice_all_equal")


def test_lesson_practice_readiness_missing_distractors():
    """reviewed lesson without distractorsJa field should fail."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[{"promptJa": "Q?", "answerJa": "A"}]),
        "lesson",
    )
    _assert_has_error(errs, "non-empty distractor", "lesson_practice_missing_field")


def test_draft_lesson_missing_distractors_ok():
    """draft lesson can have reviewPrompts without usable distractors."""
    errs = validate_single(
        _minimal_lesson(reviewPrompts=[{"promptJa": "Q?", "answerJa": "A", "distractorsJa": []}]),
        "lesson",
    )
    _assert_no_errors(errs, "draft_lesson_missing_distractors")


def test_lesson_practice_readiness_valid():
    """reviewed lesson with usable prompt passes."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[{"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["B"]}]),
        "lesson",
    )
    _assert_no_errors(errs, "lesson_practice_readiness_valid")


def test_lesson_practice_readiness_published_fails():
    """published lesson without usable prompt should fail."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="published",
                        reviewPrompts=[{"promptJa": "Q?", "answerJa": "A", "distractorsJa": []}]),
        "lesson",
    )
    _assert_has_error(errs, "non-empty distractor", "lesson_practice_published_fails")


def test_lesson_practice_readiness_published_ok():
    """published lesson with usable prompt passes."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="published",
                        reviewPrompts=[{"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["B"]}]),
        "lesson",
    )
    _assert_no_errors(errs, "lesson_practice_published_ok")


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
        "distractors": ["mà"],
        "contrastId": "tone-t1-vs-t4",
        "toneContourId": "t1-high-flat",
        "toneContourHintJa": "第一声は高く平ら。",
        "interferenceJa": "日本語話者は平らに伸ばしやすい。",
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


def test_tone_discrimination_practice_contract():
    errs = validate_single(_minimal_practice(
        distractors=["mà"],
        contrastId="tone-t1-vs-t4",
        toneContourId="t1-high-flat",
        toneContourHintJa="第一声は高く平ら。",
        interferenceJa="日本語話者は平らに伸ばしやすい。",
    ), "practice")
    _assert_no_errors(errs, "tone_discrimination_practice_contract")


def test_pinyin_contrast_practice_contract():
    errs = validate_single(_minimal_practice(
        type="pinyin-contrast",
        distractors=["z"],
        contrastId="pinyin-zh-vs-z",
        contrastNoteJa="zh は巻き舌音。",
        interferenceJa="日本語には巻き舌音がない。",
        articulationJa="舌先を後ろに巻く。",
    ), "practice")
    _assert_no_errors(errs, "pinyin_contrast_practice_contract")


def test_guided_shadowing_practice_contract():
    errs = validate_single(_minimal_practice(
        type="guided-shadowing",
        correctAnswer=None,
        targetTraditional="謝謝",
        targetTraditionalStatus="authored",
        targetPinyin="xièxie",
        toneContourId="t4-weak",
        shadowStepsJa=["第四声を短く下げる。"],
        selfCheckJa=["急降下したか？"],
        interferenceJa="日本語では平板になりやすい。",
        articulationJa="x は摩擦を強くする。",
    ), "practice")
    _assert_no_errors(errs, "guided_shadowing_practice_contract")


def test_pronunciation_practice_contract_missing_field():
    errs = validate_single(_minimal_practice(toneContourId=None), "practice")
    _assert_has_error(errs, "toneContourId", "pronunciation_practice_contract_missing_field")


def test_guided_shadowing_rejects_correct_answer():
    errs = validate_single(_minimal_practice(
        type="guided-shadowing",
        targetTraditional="謝謝",
        targetTraditionalStatus="authored",
        targetPinyin="xièxie",
        toneContourId="t4-weak",
        shadowStepsJa=["第四声を短く下げる。"],
        selfCheckJa=["急降下したか？"],
        interferenceJa="日本語では平板になりやすい。",
        articulationJa="x は摩擦を強くする。",
    ), "practice")
    _assert_has_error(errs, "must be null", "guided_shadowing_rejects_correct_answer")


def test_existing_practice_type_still_requires_correct_answer():
    errs = validate_single(_minimal_practice(
        type="pronunciation-practice",
        correctAnswer=None,
    ), "practice")
    _assert_has_error(errs, "correctAnswer", "existing_practice_type_requires_correct_answer")


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


def test_resource_reviewed_date_empty_string_fails():
    errs = validate_single(
        _minimal_resource(reviewedBy="editor", reviewedDate=""), "resource"
    )
    _assert_has_error(errs, "reviewedDate", "resource_reviewed_date_empty")


def test_resource_reviewed_date_whitespace_fails():
    errs = validate_single(
        _minimal_resource(reviewedBy="editor", reviewedDate="   "), "resource"
    )
    _assert_has_error(errs, "reviewedDate", "resource_reviewed_date_whitespace")


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


# ─── Resource permission policy tests ───────────────────────────────────────

def _minimal_resource_with_permissions(**overrides):
    """Create a minimal resource that satisfies productionImportAllowed preconditions."""
    data = {
        "id": "resource-perm-test",
        "title": "Permission Test Resource",
        "url": "https://example.org/perm-test",
        "owner": "Test Owner",
        "resourceType": "reference",
        "licenseStatus": "approved",
        "allowedUse": "attributed-use",
        "reviewStatus": "approved",
        "reviewedBy": "content-reviewer",
        "reviewedDate": "2026-07-12",
        "attribution": "Permission Test Resource by Test Owner",
        "notes": "Test fixture for permission policy.",
    }
    data.update(overrides)
    return data


def test_resource_all_permissions_false_ok():
    """All permission flags set to false should pass."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            productionImportAllowed=False,
            commercialUseAllowed=False,
            modificationAllowed=False,
            redistributionAllowed=False,
        ),
        "resource",
    )
    _assert_no_errors(errs, "all_false_ok")


def test_resource_all_permissions_true_ok():
    """All permission flags true with approved review and compatible license/use."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            productionImportAllowed=True,
            commercialUseAllowed=True,
            modificationAllowed=True,
            redistributionAllowed=True,
        ),
        "resource",
    )
    _assert_no_errors(errs, "all_true_ok")


def test_resource_permission_flags_reject_null():
    """Permission flags must be boolean, reject null."""
    for field in ("productionImportAllowed", "commercialUseAllowed", "modificationAllowed", "redistributionAllowed"):
        errs = validate_single(
            _minimal_resource_with_permissions(**{field: None}),
            "resource",
        )
        _assert_has_error(errs, "must be a boolean", f"perm_null_{field}")


def test_resource_permission_flags_reject_number():
    """Permission flags must be boolean, reject integers."""
    for field in ("productionImportAllowed", "commercialUseAllowed"):
        errs = validate_single(
            _minimal_resource_with_permissions(**{field: 1}),
            "resource",
        )
        _assert_has_error(errs, "must be bool", f"perm_number_{field}")


def test_resource_permission_flags_reject_string():
    """Permission flags must be boolean, reject strings."""
    for field in ("productionImportAllowed", "modificationAllowed"):
        errs = validate_single(
            _minimal_resource_with_permissions(**{field: "yes"}),
            "resource",
        )
        _assert_has_error(errs, "must be bool", f"perm_string_{field}")


def test_resource_permission_omitted_ok():
    """Permission flags absent should pass (backward compat)."""
    data = _minimal_resource_with_permissions()
    for field in ("productionImportAllowed", "commercialUseAllowed", "modificationAllowed", "redistributionAllowed"):
        data.pop(field, None)
    errs = validate_single(data, "resource")
    _assert_no_errors(errs, "perm_omitted_ok")


def test_resource_permissions_unknown_license_blocked():
    """licenseStatus=unknown blocks all permission flags."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="unknown",
            productionImportAllowed=True,
            commercialUseAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "productionImportAllowed must be false or absent", "perm_unknown_license")
    _assert_has_error(errs, "commercialUseAllowed must be false or absent", "perm_unknown_license")
    _assert_has_error(errs, "licenseStatus is 'unknown'", "perm_unknown_license_reason")


def test_resource_permissions_needs_review_license_blocked():
    """licenseStatus=needs-review blocks all permission flags."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="needs-review",
            productionImportAllowed=True,
            modificationAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "productionImportAllowed must be false or absent", "perm_needs_review")
    _assert_has_error(errs, "modificationAllowed must be false or absent", "perm_needs_review")


def test_resource_permissions_prohibited_license_blocked():
    """licenseStatus=prohibited blocks all permission flags."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="prohibited",
            productionImportAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "productionImportAllowed must be false or absent", "perm_prohibited")
    # Exactly one error for this field (no duplicate from other rules)
    assert sum(1 for e in errs if "productionImportAllowed" in e) == 1, (
        f"Expected exactly 1 error for productionImportAllowed, got: {errs}"
    )


def test_resource_permissions_rejected_review_blocked():
    """reviewStatus=rejected blocks all permission flags."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            reviewStatus="rejected",
            reviewedBy="reviewer",
            reviewedDate="2026-07-12",
            productionImportAllowed=True,
            commercialUseAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "productionImportAllowed must be false or absent", "perm_rejected")
    _assert_has_error(errs, "commercialUseAllowed must be false or absent", "perm_rejected_review")


def test_resource_permissions_rejected_no_duplicate_flag_errors():
    """If licenseStatus and reviewStatus both block, each flag gets only one error."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="unknown",
            reviewStatus="rejected",
            productionImportAllowed=True,
            modificationAllowed=True,
        ),
        "resource",
    )
    for field in ("productionImportAllowed", "modificationAllowed"):
        count = sum(1 for e in errs if f"{field}" in e)
        assert count == 1, (
            f"Expected exactly 1 error for {field}, got {count}: {errs}"
        )


def test_resource_production_import_bad_license():
    """productionImportAllowed=true requires approved/restricted license."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="unknown",
            productionImportAllowed=True,
        ),
        "resource",
    )
    # licenseStatus=unknown blocks first, overriding the pia-specific check
    _assert_has_error(errs, "productionImportAllowed must be false or absent", "pia_bad_license")
    _assert_has_error(errs, "licenseStatus is 'unknown'", "pia_bad_license_reason")


def test_resource_production_import_bad_allowed_use():
    """productionImportAllowed=true incompatible with reference-only/citation."""
    for use in ("reference-only", "citation"):
        errs = validate_single(
            _minimal_resource_with_permissions(allowedUse=use, productionImportAllowed=True),
            "resource",
        )
        _assert_has_error(errs, "productionImportAllowed is true", f"pia_use_{use}")
        _assert_has_error(errs, f"allowedUse is '{use}'", f"pia_use_{use}_reason")


def test_resource_production_import_bad_review_status():
    """productionImportAllowed=true requires reviewStatus=approved."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            reviewStatus="candidate",
            productionImportAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "productionImportAllowed is true", "pia_bad_review")
    _assert_has_error(errs, "reviewStatus is 'candidate'", "pia_bad_review_reason")


def test_resource_production_import_restricted_allowed():
    """productionImportAllowed with licenseStatus=restricted should pass."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="restricted",
            productionImportAllowed=True,
            commercialUseAllowed=False,
        ),
        "resource",
    )
    _assert_no_errors(errs, "pia_restricted")


def test_resource_review_approved_conflicts_with_bad_license():
    """reviewStatus=approved conflicts with licenseStatus unknown/needs-review/prohibited."""
    for ls in ("unknown", "needs-review", "prohibited"):
        errs = validate_single(
            _minimal_resource_with_permissions(licenseStatus=ls),
            "resource",
        )
        _assert_has_error(errs, "reviewStatus is 'approved'", f"approved_conflict_{ls}")
        _assert_has_error(errs, f"licenseStatus is '{ls}'", f"approved_conflict_{ls}_reason")


def test_resource_allowed_use_reference_only_no_permissions():
    """allowedUse=reference-only with permission flags should fail."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            allowedUse="reference-only",
            productionImportAllowed=True,
            commercialUseAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "productionImportAllowed is true", "refonly_pia")
    _assert_has_error(errs, "commercialUseAllowed is true but allowedUse is 'reference-only'", "refonly_commercial")
    # Two separate errors: one from pia-specific check, one from general allowedUse consistency
    _assert_has_error(errs, "allowedUse is 'reference-only'", "refonly_reason")


def test_resource_allowed_use_citation_no_permissions():
    """allowedUse=citation with permission flags should fail."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            allowedUse="citation",
            modificationAllowed=True,
            redistributionAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "modificationAllowed is true but allowedUse is 'citation'", "citation_mod")
    _assert_has_error(errs, "redistributionAllowed is true but allowedUse is 'citation'", "citation_redist")


def test_resource_allowed_use_non_commercial_no_commercial():
    """allowedUse=non-commercial with commercialUseAllowed should fail."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            allowedUse="non-commercial",
            commercialUseAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(errs, "commercialUseAllowed is true but allowedUse is 'non-commercial'", "noncommercial")


def test_resource_candidate_backward_compatible():
    """Candidate with no permission flags passes (backward compat)."""
    errs = validate_single(_minimal_resource(), "resource")
    _assert_no_errors(errs, "candidate_backward")


def test_resource_restricted_license_allows_permissions():
    """licenseStatus=restricted should allow permission flags (not just approved)."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="restricted",
            productionImportAllowed=True,
            modificationAllowed=True,
        ),
        "resource",
    )
    _assert_no_errors(errs, "restricted_allows")


# ─── Resource permission policy regression tests (fix blockers) ────────────

def test_resource_prohibited_license_commercial_use_no_flags():
    """prohibited license + allowedUse=commercial + no permission flags fails."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="prohibited",
            allowedUse="commercial",
        ),
        "resource",
    )
    _assert_has_error(errs, "allowedUse is 'commercial' but licenseStatus is 'prohibited'",
                      "prohibited_allowed_use")
    _assert_has_error(errs, "must be 'reference-only' or 'citation'",
                      "prohibited_allowed_use_reason")


def test_resource_rejected_review_commercial_use_no_flags():
    """rejected review + allowedUse=commercial + no permission flags fails."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            reviewStatus="rejected",
            reviewedBy="reviewer",
            reviewedDate="2026-07-12",
            allowedUse="commercial",
        ),
        "resource",
    )
    _assert_has_error(errs, "allowedUse is 'commercial' but reviewStatus is 'rejected'",
                      "rejected_allowed_use")
    _assert_has_error(errs, "must be 'reference-only' or 'citation'",
                      "rejected_allowed_use_reason")


def test_resource_unknown_license_non_reference_use():
    """unknown license + non-reference allowedUse fails even with no flags."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="unknown",
            allowedUse="attributed-use",
        ),
        "resource",
    )
    _assert_has_error(errs, "allowedUse is 'attributed-use' but licenseStatus is 'unknown'",
                      "unknown_nonref")
    _assert_has_error(errs, "must be 'reference-only' or 'citation'",
                      "unknown_nonref_reason")


def test_resource_needs_review_license_non_reference_use():
    """needs-review license + non-reference allowedUse fails even with no flags."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            licenseStatus="needs-review",
            allowedUse="commercial",
        ),
        "resource",
    )
    _assert_has_error(errs, "allowedUse is 'commercial' but licenseStatus is 'needs-review'",
                      "needsreview_nonref")


def test_resource_allowed_use_commercial_explicit_false():
    """allowedUse=commercial with commercialUseAllowed=false fails."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            allowedUse="commercial",
            commercialUseAllowed=False,
            productionImportAllowed=False,
        ),
        "resource",
    )
    _assert_has_error(errs, "commercialUseAllowed is false but allowedUse is 'commercial'",
                      "commercial_false")


def test_resource_pia_combined_allowed_use_and_review_one_error():
    """productionImportAllowed=true with both bad allowedUse and non-approved
    reviewStatus produces exactly ONE error for that flag."""
    errs = validate_single(
        _minimal_resource_with_permissions(
            allowedUse="reference-only",
            reviewStatus="candidate",
            productionImportAllowed=True,
        ),
        "resource",
    )
    # Phase D combines reasons into one error; Phase F fires separately for flag
    # not blocked by Phase D that conflicts with allowedUse=reference-only.
    # productionImportAllowed should appear in exactly 1 error.
    count = sum(1 for e in errs if "productionImportAllowed" in e)
    assert count == 1, (
        f"Expected exactly 1 error for productionImportAllowed, got {count}: {errs}"
    )
    _assert_has_error(errs, "allowedUse is 'reference-only'", "pia_combined_refonly")
    _assert_has_error(errs, "reviewStatus is 'candidate'", "pia_combined_review")


# ─── Resource duplicate ID detection tests ──────────────────────────────────

def test_resource_duplicate_id_simple():
    """Two resources with the same id should be detected."""
    data = {
        "resources": [
            _minimal_resource(id="resource-dup-a"),
            _minimal_resource(id="resource-dup-a"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate resource id", "dup_simple")


def test_resource_duplicate_id_three_entries():
    """Three resources: first and third share an id, second different."""
    data = {
        "resources": [
            _minimal_resource(id="resource-dup-x"),
            _minimal_resource(id="resource-dup-y"),
            _minimal_resource(id="resource-dup-x"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate resource id 'resource-dup-x'", "dup_three")
    assert sum(1 for e in errs if "duplicate resource id" in e) == 1, (
        f"Expected exactly 1 duplicate error, got {errs}"
    )


def test_resource_duplicate_id_error_message_format():
    """Error must include the duplicated id, first position, and current position."""
    data = {
        "resources": [
            _minimal_resource(id="resource-dup-msg"),
            _minimal_resource(id="resource-msg-other"),
            _minimal_resource(id="resource-dup-msg"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate resource id 'resource-dup-msg'", "dup_msg_id")
    _assert_has_error(errs, "first occurrence at root.resources[0]", "dup_msg_first")
    _assert_has_error(errs, "root.resources[2]: duplicate", "dup_msg_current")


def test_resource_no_duplicate_no_error():
    """All unique ids produce no duplicate error."""
    data = {
        "resources": [
            _minimal_resource(id="resource-a"),
            _minimal_resource(id="resource-b"),
            _minimal_resource(id="resource-c"),
        ]
    }
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate resource id" in e]
    assert dup_errors == [], f"Expected no duplicate errors, got {dup_errors}"


def test_resource_missing_id_does_not_crash():
    """Missing id field is handled by schema validation, must not crash duplicate check."""
    data = {
        "resources": [
            _minimal_resource(),
            {"title": "No-id resource", "url": "https://example.org/no-id", "owner": "T", "resourceType": "reference", "licenseStatus": "needs-review", "allowedUse": "reference-only", "reviewStatus": "candidate", "attribution": "No-id", "notes": "Missing id."},
        ]
    }
    errs = validate_bundle(data)
    # Must not crash — should produce a missing-required error from schema validation
    # and duplicate check should silently skip the id-less entry
    _assert_has_error(errs, "required field", "dup_no_id_req")
    dup_errors = [e for e in errs if "duplicate resource id" in e]
    assert dup_errors == [], f"Expected no duplicate errors, got {dup_errors}"


def test_resource_missing_id_does_not_false_positive_with_none():
    """Explicit None id should not cause a false duplicate."""
    data = {
        "resources": [
            _minimal_resource(id=None),
            _minimal_resource(id=None),
        ]
    }
    # Both have id=None which is not a string — duplicate check skips non-string
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate resource id" in e]
    assert dup_errors == [], f"Expected no duplicate errors, got {dup_errors}"


def test_resource_wrong_type_id_does_not_crash():
    """Numeric id should not crash the duplicate checker."""
    data = {
        "resources": [
            _minimal_resource(id=42),
            _minimal_resource(id=42),
        ]
    }
    errs = validate_bundle(data)
    # Type error from schema validation, no crash
    dup_errors = [e for e in errs if "duplicate resource id" in e]
    assert dup_errors == [], f"Expected no duplicate errors, got {dup_errors}"


def test_resource_duplicate_different_content_types_not_detected():
    """Same id in different content type collections is not a duplicate."""
    data = {
        "resources": [
            _minimal_resource(id="shared-id"),
        ],
        "vocabulary": [
            _minimal_vocab(id="shared-id"),
        ],
    }
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate resource id" in e]
    assert dup_errors == [], f"Expected no duplicate errors across content types, got {dup_errors}"


def test_resource_duplicate_deterministic_order():
    """Duplicate error order must be deterministic (by position in array)."""
    data = {
        "resources": [
            _minimal_resource(id="z-resource"),
            _minimal_resource(id="a-resource"),
            _minimal_resource(id="z-resource"),
            _minimal_resource(id="m-resource"),
            _minimal_resource(id="a-resource"),
        ]
    }
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate resource id" in e]
    assert len(dup_errors) == 2, f"Expected 2 duplicate errors, got {len(dup_errors)}: {dup_errors}"
    # dup_errors[0] must be z-resource at [2] (first duplicate detected)
    assert "root.resources[2]" in dup_errors[0] and "z-resource" in dup_errors[0], (
        f"Expected dup_errors[0] to mention z-resource at [2], got: {dup_errors[0]}"
    )
    # dup_errors[1] must be a-resource at [4] (second duplicate detected)
    assert "root.resources[4]" in dup_errors[1] and "a-resource" in dup_errors[1], (
        f"Expected dup_errors[1] to mention a-resource at [4], got: {dup_errors[1]}"
    )


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
