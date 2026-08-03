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
import os
import subprocess
import sys
import tempfile
import unicodedata
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

# HSK records require human-authored or verified script forms only.
# Generated and unavailable are not production-eligible.
HSK_VALID_SCRIPT_STATUSES = frozenset({"authored", "verified"})

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

VALID_HSK_STANDARD_VERSIONS = frozenset({"hsk-legacy-6-level", "hsk-3.0"})

VALID_TEACHER_DIFFICULTY_BANDS = frozenset({"star-1", "star-2"})
VALID_TEACHER_DIFFICULTY_LABELS = frozenset({"☆", "☆☆"})
VALID_TEACHER_PARTS_OF_SPEECH = frozenset({"noun", "verb", "adjective", "adverb"})

VALID_ILLUSTRATION_MIME_TYPES = frozenset({"image/webp", "image/png"})

VALID_RIGHTS_BASIS = frozenset({"commissioned-for-chabiko"})
VALID_MODIFICATION_SCOPES = frozenset({"technical-only"})
VALID_REUSE_OPTIONS = frozenset({"not-granted", "granted"})

# Learning-path contract (#229) controlled vocabularies.
VALID_SCRIPT_DEFAULTS = frozenset({"traditional", "simplified"})
VALID_AVAILABILITY_REASONS = frozenset({"available", "unavailable", "hsk"})
VALID_MEMBER_TYPES = frozenset({"lesson", "vocabulary", "phrase"})
VALID_HSK_STATUSES = frozenset({"available", "unavailable"})

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
    """Reuse script provenance validation rules from #24.

    HSK records (those with an 'hsk' key) use Simplified-first rules.
    Non-dict hsk values are reported as errors without falling through.
    """
    if "hsk" in record:
        hsk_val = record.get("hsk")
        if not isinstance(hsk_val, dict):
            return [f"{path}.hsk must be a JSON object when present, got {type(hsk_val).__name__}"]
        return _check_hsk_script_fields(record, path)

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


def _check_hsk_script_fields(record: dict, path: str) -> list[str]:
    """HSK Simplified-first script provenance validation."""
    errors = []

    # simplified is required
    if "simplified" not in record or record["simplified"] is None:
        errors.append(f"{path}: 'simplified' is required for HSK record")
    elif not isinstance(record["simplified"], str):
        errors.append(f"{path}.simplified must be a string, got {type(record['simplified']).__name__}")
    elif record["simplified"].strip() == "":
        errors.append(f"{path}.simplified must be a non-empty string for HSK record")

    # simplifiedStatus required; authored or verified only
    if "simplifiedStatus" not in record:
        errors.append(f"{path}: 'simplifiedStatus' is required for HSK record")
    else:
        val = record["simplifiedStatus"]
        if not isinstance(val, str):
            errors.append(f"{path}.simplifiedStatus must be a string, got {type(val).__name__}")
        elif val not in HSK_VALID_SCRIPT_STATUSES:
            errors.append(f"{path}.simplifiedStatus '{val}' must be 'authored' or 'verified' for HSK record")

    # traditional is optional for HSK; explicit null must be rejected.
    # These checks are defense-in-depth for non-vocabulary content types
    # (this function is called by _check_script_fields for sentences etc.).
    # For vocabulary records, _check_hsk_fields provides the authoritative path.
    if "traditional" in record and record["traditional"] is None:
        errors.append(f"{path}: 'traditional' cannot be null for HSK record; omit the key if traditional is unavailable")
    if "traditionalStatus" in record and record["traditionalStatus"] is None:
        errors.append(f"{path}: 'traditionalStatus' cannot be null for HSK record; omit the key if traditional is unavailable")

    traditional_present = "traditional" in record and record["traditional"] is not None
    if traditional_present:
        if not isinstance(record["traditional"], str):
            errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")
        elif record["traditional"].strip() == "":
            errors.append(f"{path}.traditional must be a non-empty string for HSK record")
        ts = record.get("traditionalStatus")
        if ts is None:
            errors.append(f"{path}: 'traditionalStatus' is required when 'traditional' is present")
        elif not isinstance(ts, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(ts).__name__}")
        elif ts not in HSK_VALID_SCRIPT_STATUSES:
            errors.append(f"{path}.traditionalStatus '{ts}' must be 'authored' or 'verified' for HSK record")
    else:
        ts = record.get("traditionalStatus")
        if ts is not None and ts != "unavailable":
            errors.append(
                f"{path}: 'traditionalStatus' must be 'unavailable' or absent "
                f"when 'traditional' is absent for HSK record"
            )

    return errors


def _check_generated_not_production(record: dict, path: str) -> list[str]:
    """A generated-only script form must not be treated as production-ready."""
    errors = []
    review_status = record.get("reviewStatus")
    if review_status in ("reviewed", "published"):
        is_hsk = isinstance(record.get("hsk"), dict)
        for field in ("traditionalStatus", "simplifiedStatus"):
            if is_hsk and field == "simplifiedStatus":
                continue
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


def _check_source_content(record: dict, path: str) -> list[str]:
    """Validate source object fields: type must be a non-empty string, note must be a string when present."""
    errors = []
    source = record.get("source")
    if "source" in record and not isinstance(source, dict):
        errors.append(f"{path}.source must be a JSON object, got {type(source).__name__}")
        return errors
    if not isinstance(source, dict):
        return errors
    st = source.get("type")
    if not isinstance(st, str) or st.strip() == "":
        errors.append(f"{path}.source.type must be a non-empty string when source is present")
    # When note key is present in source, it must be a non-null string
    if "note" in source and not isinstance(source["note"], str):
        errors.append(f"{path}.source.note must be a string when present, got {type(source['note']).__name__}")
    return errors


def _check_vocabulary_examples(record: dict, path: str) -> list[str]:
    """Validate vocabulary examples script provenance contract.

    Examples contain learner-facing Chinese text and must follow the same
    script provenance rules: traditionalStatus and simplifiedStatus must be
    controlled values, matching their respective field presence.
    """
    errors = []
    examples = record.get("examples")
    if not isinstance(examples, list) or len(examples) == 0:
        return errors
    EXAMPLE_TRAD_STATUSES = CONTROLLED_STATUSES - {"unavailable"}
    for i, ex in enumerate(examples):
        ep = f"{path}.examples[{i}]"
        if not isinstance(ex, dict):
            errors.append(f"{ep}: expected a JSON object for vocabulary example, got {type(ex).__name__}")
            continue

        # traditional is required for examples
        if "traditional" not in ex:
            errors.append(f"{ep}: missing required field 'traditional'")
        elif not isinstance(ex["traditional"], str):
            errors.append(f"{ep}.traditional must be a string, got {type(ex['traditional']).__name__}")
        elif ex["traditional"].strip() == "":
            errors.append(f"{ep}.traditional must be a non-empty string for vocabulary example")

        # pinyin and japanese are required for examples
        for field in ("pinyin", "japanese"):
            if field not in ex or not isinstance(ex[field], str) or ex[field].strip() == "":
                errors.append(f"{ep}: missing required field '{field}' for vocabulary example")

        # traditionalStatus is required; unavailable is not valid for examples (traditional always has text)
        ts = ex.get("traditionalStatus")
        if ts is None:
            errors.append(f"{ep}: 'traditionalStatus' is required")
        elif not isinstance(ts, str):
            errors.append(f"{ep}.traditionalStatus must be a string, got {type(ts).__name__}")
        elif ts not in EXAMPLE_TRAD_STATUSES:
            errors.append(f"{ep}.traditionalStatus '{ts}' is not a valid status")

        # simplified validation - inside for-loop, each example is independently validated
        if "simplified" in ex and ex["simplified"] is None:
            errors.append(f"{ep}.simplified must be a string, got NoneType")
            continue

        simplified_present = "simplified" in ex and ex["simplified"] is not None
        if simplified_present:
            if not isinstance(ex["simplified"], str):
                errors.append(f"{ep}.simplified must be a string, got {type(ex['simplified']).__name__}")
            elif ex["simplified"].strip() == "":
                errors.append(f"{ep}.simplified must be a non-empty string for vocabulary example")

        ss_key_present = "simplifiedStatus" in ex
        ss = ex.get("simplifiedStatus") if ss_key_present else None
        if not simplified_present:
            if ss_key_present:
                if ss is None:
                    errors.append(f"{ep}.simplifiedStatus must be a string, got NoneType")
                elif not isinstance(ss, str):
                    errors.append(f"{ep}.simplifiedStatus must be a string, got {type(ss).__name__}")
                elif ss != "unavailable":
                    errors.append(f"{ep}: 'simplifiedStatus' must be 'unavailable' or absent when 'simplified' is absent")
        else:
            if ss is None:
                errors.append(f"{ep}: 'simplifiedStatus' is required when 'simplified' is present")
            elif not isinstance(ss, str):
                errors.append(f"{ep}.simplifiedStatus must be a string, got {type(ss).__name__}")
            elif ss == "unavailable":
                errors.append(f"{ep}: 'simplifiedStatus' cannot be 'unavailable' when 'simplified' text exists")
            elif ss not in CONTROLLED_STATUSES:
                errors.append(f"{ep}.simplifiedStatus '{ss}' is not a valid status")

    # When parent reviewStatus is reviewed/published, example script statuses must not be generated
    review_status = record.get("reviewStatus")
    if review_status in ("reviewed", "published"):
        for i, ex in enumerate(examples):
            if not isinstance(ex, dict):
                continue
            ep = f"{path}.examples[{i}]"
            for field in ("traditionalStatus", "simplifiedStatus"):
                if ex.get(field) == "generated":
                    errors.append(
                        f"{ep}: 'reviewStatus' is '{review_status}' but '{field}' is "
                        f"'generated'"
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
    """Production-ready lessons (reviewed/published) must have at least one usable review prompt.

    Each distractor element must be a non-empty string distinct from the answer.
    Non-string elements (numbers, null, objects, arrays) are reported with
    precise prompt index and distractor index and do not count as usable.
    """
    errors = []
    review_status = record.get("reviewStatus", "")
    if review_status not in ("reviewed", "published"):
        return errors

    prompts = record.get("reviewPrompts")
    if not isinstance(prompts, list) or len(prompts) == 0:
        errors.append(f"{path}.reviewPrompts: '{review_status}' lesson must have at least one review prompt")
        return errors

    has_usable = False
    for pi, prompt in enumerate(prompts):
        if not isinstance(prompt, dict):
            errors.append(
                f"{path}.reviewPrompts[{pi}]: "
                f"must be a dict/object, got {type(prompt).__name__}"
            )
            continue

        aj = prompt.get("answerJa")
        dj = prompt.get("distractorsJa")

        # Check distractor element types regardless of promptJa/answerJa validity,
        # so non-string elements are always reported for reviewed/published lessons.
        if isinstance(dj, list):
            for di, d in enumerate(dj):
                if not isinstance(d, str):
                    errors.append(
                        f"{path}.reviewPrompts[{pi}].distractorsJa[{di}]: "
                        f"must be a string, got {type(d).__name__}"
                    )

        # Now check whether the prompt is usable
        pj = prompt.get("promptJa")
        if not isinstance(pj, str) or pj.strip() == "":
            continue
        if not isinstance(aj, str) or aj.strip() == "":
            continue
        if not isinstance(dj, list):
            continue

        for di, d in enumerate(dj):
            if isinstance(d, str):
                stripped = d.strip()
                if stripped and stripped != aj.strip():
                    has_usable = True

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


def _check_resource_warnings(record: dict, path: str) -> list[str]:
    """Collect non-fatal quality warnings for a resource record."""
    notes = record.get("notes")
    if isinstance(notes, str) and not notes.strip():
        return [
            f"{path}.notes should explain why this resource is useful or risky"
        ]
    return []


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


def _check_learning_path_script_destination(record: dict, path: str) -> list[str]:
    """Learning path script default and destination contract (#229)."""
    errors = []
    script = record.get("script")
    if isinstance(script, str) and script not in VALID_SCRIPT_DEFAULTS:
        errors.append(
            f"{path}.script '{script}' is invalid; must be one of {sorted(VALID_SCRIPT_DEFAULTS)}"
        )

    destination = record.get("destination")
    if destination is not None and not isinstance(destination, str):
        errors.append(f"{path}.destination must be a string")
    elif isinstance(destination, str):
        if not destination.startswith("/"):
            errors.append(f"{path}.destination '{destination}' must be an absolute route")
        if not destination.endswith("/"):
            errors.append(f"{path}.destination '{destination}' must end with '/'")

    return errors


def _check_learning_path_members(record: dict, path: str) -> list[str]:
    """Member references must be typed, ordered, and unique (#229)."""
    errors = []
    members = record.get("members")
    if members is None or isinstance(members, list):
        if not isinstance(members, list):
            return errors
        seen: set = set()
        for i, member in enumerate(members):
            member_path = f"{path}.members[{i}]"
            if not isinstance(member, dict):
                errors.append(f"{member_path}: expected a JSON object")
                continue
            member_type = member.get("type")
            member_id = member.get("id")
            if member_type not in VALID_MEMBER_TYPES:
                errors.append(
                    f"{member_path}.type '{member_type}' is invalid; must be one of {sorted(VALID_MEMBER_TYPES)}"
                )
            if not isinstance(member_id, str) or not member_id:
                errors.append(f"{member_path}.id must be a non-empty string")
            for field in member:
                if field not in ("type", "id"):
                    errors.append(f"{member_path}: unknown field '{field}'")
            if member_type in VALID_MEMBER_TYPES and isinstance(member_id, str):
                key = f"{member_type}:{member_id}"
                if key in seen:
                    errors.append(f"{member_path} duplicates member '{key}'")
                seen.add(key)
    else:
        errors.append(f"{path}.members must be a list")
    return errors


def _check_learning_path_hsk(record: dict, path: str) -> list[str]:
    """HSK availability descriptor contract (#229)."""
    errors = []
    reason = record.get("availabilityReason")
    hsk = record.get("hsk")

    if reason == "hsk":
        if not isinstance(hsk, dict):
            errors.append(
                f"{path}: availabilityReason 'hsk' requires an hsk descriptor"
            )
            return errors
        levels = hsk.get("levels")
        if not isinstance(levels, list) or not levels:
            errors.append(f"{path}.hsk.levels must be a non-empty array of levels")
        elif not all(isinstance(level, int) and level >= 1 for level in levels):
            errors.append(f"{path}.hsk.levels must contain only positive integers")
        elif len(set(levels)) != len(levels):
            errors.append(f"{path}.hsk.levels must not contain duplicates")
        status = hsk.get("status")
        if status not in VALID_HSK_STATUSES:
            errors.append(
                f"{path}.hsk.status '{status}' is invalid; must be one of {sorted(VALID_HSK_STATUSES)}"
            )
        for field in hsk:
            if field not in ("levels", "status"):
                errors.append(f"{path}.hsk: unknown field '{field}'")
    elif hsk is not None:
        errors.append(
            f"{path}: hsk descriptor is only valid for availabilityReason 'hsk', got '{reason}'"
        )

    return errors


# ─── Schema definitions ────────────────────────────────────────────────────

def _build_schemas():
    """Define all content type schemas."""

    # Learning Path (#229): repository-controlled path contract.
    # Paths only reference content IDs; they never duplicate content or
    # perform runtime script conversion. Deterministic handling of duplicate,
    # missing, and stale references is enforced by the TypeScript loader
    # (src/content/loadLearningPaths.ts); this schema validates the shape and
    # controlled vocabularies of the checked-in data file.
    SCHEMAS["learning-path"] = {
        "required": [
            "id", "labelJa", "descriptionJa", "script", "destination",
            "availabilityReason", "members",
        ],
        "optional": [
            "hsk",
        ],
        "field_types": {
            "id": str, "labelJa": str, "descriptionJa": str,
            "script": str, "destination": str, "availabilityReason": str,
            "members": list, "hsk": dict,
        },
        "controlled_fields": {
            "script": VALID_SCRIPT_DEFAULTS,
            "availabilityReason": VALID_AVAILABILITY_REASONS,
        },
        "extra_validators": [
            _check_learning_path_script_destination,
            _check_learning_path_members,
            _check_learning_path_hsk,
        ],
    }

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
            "painPointTags": list, "source": dict,
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
            "id", "pinyin", "japanese", "reviewStatus",
        ],
        "optional": [
            "traditional", "traditionalStatus",
            "simplified", "simplifiedStatus", "kana", "category",
            "similarityType", "toneNote", "caution", "travelScenario",
            "painPointTags", "examples", "source",
            "hsk", "curriculum", "illustrationRef",
        ],
        "field_types": {
            "id": str, "pinyin": str, "japanese": str,
            "reviewStatus": str,
            "similarityType": str,
            "travelScenario": str,
            "examples": list, "painPointTags": list,
            "hsk": dict,
        },
        "controlled_fields": {
            "similarityType": VALID_SIMILARITY_TYPES,
            "travelScenario": VALID_SCENARIOS,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_review_status,
            _check_generated_not_production,
            _check_pain_point_context,
            _check_source_metadata,
            _check_source_content,
            _check_vocabulary_fields,
            _check_vocabulary_examples,
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
            "painPointTags": list, "source": dict,
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
            _check_source_content,
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
            "relatedVocabulary": list, "painPointTags": list, "source": dict,
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
            _check_source_content,
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

    # Illustration
    SCHEMAS["illustration"] = {
        "required": [
            "id", "vocabularyId", "assetPath", "sourceChecksumSha256",
            "width", "height", "mimeType", "fileSizeBytes", "altJa",
            "rights", "reviewStatus",
        ],
        "optional": [],
        "field_types": {
            "id": str, "vocabularyId": str, "assetPath": str,
            "sourceChecksumSha256": str,
            "width": int, "height": int, "mimeType": str,
            "fileSizeBytes": int, "altJa": str,
            "rights": dict, "reviewStatus": str,
        },
        "controlled_fields": {
            "mimeType": VALID_ILLUSTRATION_MIME_TYPES,
            "reviewStatus": VALID_REVIEW_STATUSES,
        },
        "extra_validators": [
            _check_illustration_fields,
        ],
    }


# ─── Illustration validators ───────────────────────────────────────────────

ILLUSTRATION_RIGHTS_KNOWN_FIELDS = frozenset({
    "basis", "publicWebDisplay", "staticAssetRedistribution",
    "modificationScope", "attributionRequired", "attributionText",
    "reuseOutsideChabiko",
})

PENDING_RIGHTS_KNOWN_FIELDS = frozenset({
    "status", "source", "note",
})

VALID_PENDING_RIGHTS_STATUS = frozenset({"pending"})
VALID_PENDING_RIGHTS_SOURCE = frozenset({"teacher-provided"})

# Approved teacher-provided rights reference the committed canonical package
# rights record (data/teacher-vocabulary-preview/teacher-image-rights.json) and
# the product-owner attestation in Issue #191 comment 5156051087.
APPROVED_RIGHTS_KNOWN_FIELDS = frozenset({
    "status", "source", "note",
})
VALID_APPROVED_RIGHTS_STATUS = frozenset({"approved"})
VALID_APPROVED_RIGHTS_SOURCE = frozenset({"teacher-provided"})
APPROVED_RIGHTS_NOTE_MARKERS = (
    "teacher-image-rights.json",
    "issue-191",
    "comment-5156051087",
)

def _check_illustration_fields(record: dict, path: str) -> list[str]:
    """Validate an illustration record."""
    errors = []

    # ── Non-empty string fields (Gap 3) ──
    for field in ("id", "vocabularyId", "assetPath", "altJa"):
        val = record.get(field)
        if isinstance(val, str) and val.strip() == "":
            errors.append(f"{path}.{field} must be a non-empty string, got empty or whitespace-only")

    # ── Checksum ──
    checksum = record.get("sourceChecksumSha256")
    if isinstance(checksum, str):
        if len(checksum) != 64:
            errors.append(f"{path}.sourceChecksumSha256 must be exactly 64 characters, got {len(checksum)}")
        elif not all(c in "0123456789abcdef" for c in checksum):
            errors.append(f"{path}.sourceChecksumSha256 must be lowercase hexadecimal")
    elif checksum is not None:
        errors.append(f"{path}.sourceChecksumSha256 must be a string, got {type(checksum).__name__}")

    # ── width / height ──
    for dim in ("width", "height"):
        val = record.get(dim)
        if isinstance(val, bool):
            errors.append(f"{path}.{dim} must be a non-boolean integer, got boolean")
        elif isinstance(val, int):
            if val < 1 or val > 4096:
                errors.append(f"{path}.{dim} must be between 1 and 4096, got {val}")

    # ── fileSizeBytes ──
    fsb = record.get("fileSizeBytes")
    if isinstance(fsb, bool):
        errors.append(f"{path}.fileSizeBytes must be a non-boolean integer, got boolean")
    elif isinstance(fsb, int):
        if fsb < 1 or fsb > 1500000:
            errors.append(f"{path}.fileSizeBytes must be between 1 and 1500000, got {fsb}")

    # ── assetPath ──
    asset_path = record.get("assetPath")
    mime_type = record.get("mimeType")
    if isinstance(asset_path, str) and isinstance(mime_type, str):
        expected_ext = ".webp" if mime_type == "image/webp" else ".png"
        if not asset_path.startswith("/assets/vocabulary/teacher-core-v1/"):
            errors.append(f"{path}.assetPath must start with '/assets/vocabulary/teacher-core-v1/'")
        if not asset_path.endswith(expected_ext):
            errors.append(
                f"{path}.assetPath must end with '{expected_ext}' for mimeType '{mime_type}'"
            )

    # ── rights object ──
    rights = record.get("rights")
    if isinstance(rights, dict):
        review_status = record.get("reviewStatus", "")
        errors.extend(_check_illustration_rights(rights, f"{path}.rights", review_status))
    elif rights is not None:
        errors.append(f"{path}.rights must be a JSON object, got {type(rights).__name__}")

    return errors


def _check_illustration_rights(rights: dict, path: str, review_status: str = "") -> list[str]:
    """Validate illustration rights object.

    Supports two mutually exclusive variants:

    1. Cleared rights (commissioned-for-chabiko) — the original contract fields.
       Required when reviewStatus is 'reviewed' or 'published'.
    2. Pending teacher-provided rights (status: 'pending', source: 'teacher-provided', note)
       Only valid when reviewStatus is 'draft'.
    """
    errors = []

    # Determine which variant: pending vs approved vs cleared
    is_pending = isinstance(rights.get("status"), str) and rights.get("status") == "pending"
    is_approved = isinstance(rights.get("status"), str) and rights.get("status") == "approved"

    if is_pending:
        # ── Pending-rights variant ──
        # Only valid for draft illustrations
        if review_status not in ("draft", ""):
            errors.append(
                f"{path}: pending-rights variant is only valid when reviewStatus is 'draft'"
            )

        # status must be 'pending'
        if "status" in rights and rights["status"] != "pending":
            errors.append(f"{path}.status must be 'pending'")

        # source must be 'teacher-provided'
        source = rights.get("source")
        if source is not None:
            if not isinstance(source, str):
                errors.append(f"{path}.source must be a string, got {type(source).__name__}")
            elif source not in VALID_PENDING_RIGHTS_SOURCE:
                errors.append(f"{path}.source must be 'teacher-provided'")
        else:
            errors.append(f"{path}: missing required field 'source'")

        # note must be non-empty
        note = rights.get("note")
        if note is not None:
            if not isinstance(note, str) or note.strip() == "":
                errors.append(f"{path}.note must be a non-empty string")
        else:
            errors.append(f"{path}: missing required field 'note'")

        # Reject unknown fields for pending rights
        for field in rights:
            if field not in PENDING_RIGHTS_KNOWN_FIELDS:
                errors.append(f"{path}: unknown field '{field}'")
    elif is_approved:
        # ── Approved teacher-provided rights variant ──
        # Only valid for draft illustrations; references the committed package
        # rights record and the product-owner attestation comment.
        if review_status not in ("draft", ""):
            errors.append(
                f"{path}: approved-rights variant is only valid when reviewStatus is 'draft'"
            )

        # status must be 'approved'
        if "status" in rights and rights["status"] != "approved":
            errors.append(f"{path}.status must be 'approved'")

        # source must be 'teacher-provided'
        source = rights.get("source")
        if source is not None:
            if not isinstance(source, str):
                errors.append(f"{path}.source must be a string, got {type(source).__name__}")
            elif source not in VALID_APPROVED_RIGHTS_SOURCE:
                errors.append(f"{path}.source must be 'teacher-provided'")
        else:
            errors.append(f"{path}: missing required field 'source'")

        # note must reference the package rights record and the attestation.
        note = rights.get("note")
        if note is None:
            errors.append(f"{path}: missing required field 'note'")
        elif not isinstance(note, str) or note.strip() == "":
            errors.append(f"{path}.note must be a non-empty string")
        else:
            for marker in APPROVED_RIGHTS_NOTE_MARKERS:
                if marker not in note:
                    errors.append(f"{path}.note must reference {marker}")

        # Reject unknown fields for approved rights
        for field in rights:
            if field not in APPROVED_RIGHTS_KNOWN_FIELDS:
                errors.append(f"{path}: unknown field '{field}'")
    else:
        # ── Cleared-rights variant (original contract) ──
        for field in ILLUSTRATION_RIGHTS_KNOWN_FIELDS:
            if field not in rights:
                # attributionText is only required when attributionRequired is true
                if field == "attributionText":
                    continue
                errors.append(f"{path}: missing required field '{field}'")

        # basis
        if "basis" in rights and rights["basis"] != "commissioned-for-chabiko":
            errors.append(f"{path}.basis must be 'commissioned-for-chabiko'")

        # publicWebDisplay
        if "publicWebDisplay" in rights and rights["publicWebDisplay"] is not True:
            errors.append(f"{path}.publicWebDisplay must be true")

        # staticAssetRedistribution
        if "staticAssetRedistribution" in rights and rights["staticAssetRedistribution"] is not True:
            errors.append(f"{path}.staticAssetRedistribution must be true")

        # modificationScope
        if "modificationScope" in rights and rights["modificationScope"] != "technical-only":
            errors.append(f"{path}.modificationScope must be 'technical-only'")

        # attributionRequired must be a non-null boolean
        ar = rights.get("attributionRequired")
        if "attributionRequired" in rights and ar is None:
            errors.append(f"{path}.attributionRequired must be a non-null boolean")
        elif ar is not None and not isinstance(ar, bool):
            errors.append(f"{path}.attributionRequired must be a boolean, got {type(ar).__name__}")

        # attributionText — required and non-empty exactly when attributionRequired is true;
        # explicit null is invalid in either branch.
        at = rights.get("attributionText")
        if ar is True:
            if "attributionText" not in rights:
                errors.append(f"{path}.attributionText is required when attributionRequired is true")
            elif not isinstance(at, str) or at.strip() == "":
                errors.append(f"{path}.attributionText must be a non-empty string when attributionRequired is true")
        else:
            if "attributionText" in rights:
                errors.append(f"{path}.attributionText must be absent when attributionRequired is not true")

        # reuseOutsideChabiko — must be a string in the controlled set;
        # non-string values produce deterministic errors rather than exceptions
        if "reuseOutsideChabiko" in rights:
            val = rights["reuseOutsideChabiko"]
            if not isinstance(val, str):
                errors.append(
                    f"{path}.reuseOutsideChabiko must be a string, "
                    f"got {type(val).__name__}"
                )
            elif val not in VALID_REUSE_OPTIONS:
                errors.append(
                    f"{path}.reuseOutsideChabiko '{val}' is not valid; "
                    f"must be one of {sorted(VALID_REUSE_OPTIONS)}"
                )

        # Reject unknown rights fields
        for field in rights:
            if field not in ILLUSTRATION_RIGHTS_KNOWN_FIELDS:
                errors.append(f"{path}: unknown field '{field}'")

    return errors


# ─── Collection key → schema type mapping ─────────────────────────────────

COLLECTION_MAP = {
    "lessons": "lesson",
    "vocabulary": "vocabulary",
    "teacher_vocabulary": "vocabulary",
    "sentences": "sentence",
    "phrasebook": "phrasebook",
    "practice": "practice",
    "resources": "resource",
    "illustrations": "illustration",
    "learningPaths": "learning-path",
    "learning_paths": "learning-path",
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
    ALLOWED_TOP_KEYS = {"metadata", "meta", "version", "schemaVersion"}

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

        # Duplicate vocabulary ID and HSK identity detection for vocabulary collection
        if schema_type == "vocabulary":
            errors.extend(_check_vocabulary_duplicate_ids(value, collection_path))
            errors.extend(_check_hsk_duplicate_identity(value, collection_path))
            errors.extend(_check_teacher_duplicate_identity(value, collection_path))

        # Illustration duplicate checks
        if schema_type == "illustration":
            errors.extend(_check_illustration_duplicate_ids(value, collection_path))
            errors.extend(_check_illustration_duplicate_vocabulary_id(value, collection_path))

    # Cross-reference: teacher vocabulary ↔ illustrations
    teacher_vocab = data.get("teacher_vocabulary", data.get("vocabulary", []))
    illustrations = data.get("illustrations", [])

    if isinstance(teacher_vocab, list) and isinstance(illustrations, list):
        # Identify teacher records
        teacher_records = [v for v in teacher_vocab if isinstance(v, dict) and "curriculum" in v]
        if "teacher_vocabulary" in data:
            all_teacher = teacher_vocab
            vocab_path_prefix = "teacher_vocabulary"
        else:
            all_teacher = teacher_records
            vocab_path_prefix = "vocabulary"
        if all_teacher:
            errors.extend(_check_teacher_illustration_xref(all_teacher, illustrations, path, vocab_path_prefix))
        else:
            # No teacher records — detect orphan illustrations directly
            errors.extend(_orphan_illustration_detection(illustrations, path))

    return errors


def collect_bundle_warnings(data: dict, path: str = "root") -> list[str]:
    """Collect resource warnings without changing validation error semantics."""
    warnings = []

    if not isinstance(data, dict):
        return warnings

    for key, value in data.items():
        if COLLECTION_MAP.get(key) != "resource" or not isinstance(value, list):
            continue

        collection_path = f"{path}.{key}"
        for i, item in enumerate(value):
            if not isinstance(item, dict):
                continue
            warnings.extend(
                _check_resource_warnings(item, f"{collection_path}[{i}]")
            )

    return warnings


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


# ─── Helper: Unicode normalization ────────────────────────────────────────

def _normalize_simplified(text: str) -> str:
    """Normalize Simplified Chinese per HSK identity contract."""
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(ch for ch in normalized if not ch.isspace())


def _normalize_pinyin(text: str) -> str:
    """Normalize pinyin per HSK identity contract."""
    normalized = unicodedata.normalize("NFKC", text)
    case_folded = normalized.casefold()
    return "".join(ch for ch in case_folded if not ch.isspace())


# ─── HSK vocabulary validation ────────────────────────────────────────────

def _check_vocabulary_fields(record: dict, path: str) -> list[str]:
    """Validate vocabulary record, branching on HSK vs non-HSK vs teacher contract."""
    errors = []

    curriculum_key_present = "curriculum" in record
    hsk_key_present = "hsk" in record

    # Gap 1: Teacher/HSK exclusivity — when both keys exist, report subtype conflict
    # and validate both sides deterministically without single-subtype dispatch.
    # This catches curriculum:null + hsk:object cases that the value-based
    # has_curriculum check would miss.
    if curriculum_key_present and hsk_key_present:
        errors.append(f"{path}: teacher curriculum record must not contain 'hsk'")
        errors.extend(_check_teacher_vocabulary_fields(record, path))
        if record.get("hsk") is None:
            errors.append(f"{path}.hsk must be a JSON object when present, got null")
        elif not isinstance(record["hsk"], dict):
            errors.append(f"{path}.hsk must be a JSON object when present, got {type(record['hsk']).__name__}")
        return errors

    has_curriculum = curriculum_key_present and record["curriculum"] is not None

    # Reject explicit hsk: null — when hsk key is present, it must be an object.
    # Do NOT fall through to non-HSK validation; the record declared HSK intent
    # and non-HSK errors (missing traditional, kana, category) are misleading.
    if hsk_key_present and record["hsk"] is None:
        errors.append(f"{path}.hsk must be a JSON object when present, got null")
        return errors

    has_hsk = hsk_key_present and record["hsk"] is not None

    if has_curriculum:
        errors.extend(_check_teacher_vocabulary_fields(record, path))
    elif has_hsk:
        errors.extend(_check_hsk_fields(record, path))
    else:
        errors.extend(_check_non_hsk_vocabulary_fields(record, path))
    return errors


def _check_non_hsk_vocabulary_fields(record: dict, path: str) -> list[str]:
    """Enforce the existing Traditional-first contract for non-HSK vocabulary."""
    errors = []

    # traditional is required
    if "traditional" not in record or record["traditional"] is None:
        errors.append(f"{path}: missing required field 'traditional'")
    elif not isinstance(record["traditional"], str):
        errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")

    # traditionalStatus is required
    if "traditionalStatus" not in record or record["traditionalStatus"] is None:
        errors.append(f"{path}: missing required field 'traditionalStatus'")

    # kana is required
    if "kana" not in record or record["kana"] is None:
        errors.append(f"{path}: missing required field 'kana'")
    elif not isinstance(record["kana"], str):
        errors.append(f"{path}.kana must be a string, got {type(record['kana']).__name__}")

    # category is required
    if "category" not in record or record["category"] is None:
        errors.append(f"{path}: missing required field 'category'")
    elif not isinstance(record["category"], str):
        errors.append(f"{path}.category must be a string, got {type(record['category']).__name__}")

    # Also run script field validation for non-HSK
    errors.extend(_check_script_fields(record, path))

    return errors


def _check_teacher_vocabulary_fields(record: dict, path: str) -> list[str]:
    """Enforce the teacher-curriculum Simplified-first subtype contract."""
    errors = []

    # ── Required fields for teacher curriculum ──
    teacher_required = [
        ("id", str),
        ("simplified", str),
        ("pinyin", str),
        ("japanese", str),
        ("source", dict),
        ("reviewStatus", str),
    ]
    for field, expected_type in teacher_required:
        if field not in record or record[field] is None:
            errors.append(f"{path}: missing required field '{field}' for teacher curriculum record")
        elif not isinstance(record[field], expected_type):
            errors.append(
                f"{path}.{field} must be {expected_type.__name__}, "
                f"got {type(record[field]).__name__}"
            )
        elif expected_type is str and isinstance(record[field], str) and record[field].strip() == "":
            errors.append(f"{path}.{field} must be a non-empty string for teacher curriculum record")

    # simplifiedStatus is required and must be authored or verified
    if "simplifiedStatus" not in record or record["simplifiedStatus"] is None:
        errors.append(f"{path}: missing required field 'simplifiedStatus' for teacher curriculum record")
    elif not isinstance(record["simplifiedStatus"], str):
        errors.append(f"{path}.simplifiedStatus must be a string, got {type(record['simplifiedStatus']).__name__}")
    elif record["simplifiedStatus"] not in HSK_VALID_SCRIPT_STATUSES:
        errors.append(
            f"{path}.simplifiedStatus '{record.get('simplifiedStatus')}' must be "
            f"'authored' or 'verified' for teacher curriculum record"
        )

    # ── Traditional optionality (same as HSK) ──
    if "traditional" in record and record["traditional"] is None:
        errors.append(f"{path}: 'traditional' cannot be null for teacher curriculum record; omit the key if traditional is unavailable")
    if "traditionalStatus" in record and record["traditionalStatus"] is None:
        errors.append(f"{path}: 'traditionalStatus' cannot be null for teacher curriculum record; omit the key if traditional is unavailable")

    traditional_present = "traditional" in record and record["traditional"] is not None
    if traditional_present:
        if not isinstance(record["traditional"], str):
            errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")
        elif record["traditional"].strip() == "":
            errors.append(f"{path}.traditional must be a non-empty string for teacher curriculum record")
        ts = record.get("traditionalStatus")
        if ts is None:
            errors.append(f"{path}: 'traditionalStatus' is required when 'traditional' is present")
        elif not isinstance(ts, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(ts).__name__}")
        elif ts not in HSK_VALID_SCRIPT_STATUSES:
            errors.append(
                f"{path}.traditionalStatus '{ts}' must be 'authored' or 'verified' "
                f"for teacher curriculum record"
            )
    else:
        ts = record.get("traditionalStatus")
        if ts is not None and ts != "unavailable":
            errors.append(
                f"{path}: 'traditionalStatus' must be 'unavailable' or absent "
                f"when 'traditional' is absent"
            )

    # ── kana and category are optional ──
    for field in ("kana", "category"):
        if field in record and record[field] is None:
            errors.append(f"{path}.{field} cannot be null for teacher curriculum record; omit the key if the value is unavailable")
        elif field in record and not isinstance(record[field], str):
            errors.append(f"{path}.{field} must be a string, got {type(record[field]).__name__}")

    # ── source object ──
    src = record.get("source")
    if isinstance(src, dict):
        if "type" not in src or src["type"] is None:
            errors.append(f"{path}.source: missing required field 'type' for teacher curriculum record")
        elif src["type"] != "teacher-workbook":
            errors.append(f"{path}.source.type must be 'teacher-workbook' for teacher curriculum record")
        if "note" in src and src["note"] is not None and not isinstance(src["note"], str):
            errors.append(f"{path}.source.note must be a string when present, got {type(src['note']).__name__}")
        # Reject unknown source fields
        SOURCE_KNOWN_FIELDS = {"type", "note"}
        for field in src:
            if field not in SOURCE_KNOWN_FIELDS:
                errors.append(f"{path}.source: unknown field '{field}'")

    # ── curriculum object ──
    curriculum = record.get("curriculum", {})
    if not isinstance(curriculum, dict):
        errors.append(f"{path}.curriculum must be a JSON object")
        return errors

    curriculum_fields = {
        "sourceId": ("teacher-core-v1", str),
        "difficultyBand": (VALID_TEACHER_DIFFICULTY_BANDS, str),
        "sourceDifficultyLabel": (VALID_TEACHER_DIFFICULTY_LABELS, str),
        "partOfSpeech": (VALID_TEACHER_PARTS_OF_SPEECH, str),
        "sourceSheet": (None, str),
        "sourceRow": (None, int),
    }

    for field, (controlled, expected_type) in curriculum_fields.items():
        if field not in curriculum or curriculum[field] is None:
            errors.append(f"{path}.curriculum: missing required field '{field}'")
            continue
        if not isinstance(curriculum[field], expected_type):
            if expected_type is int and isinstance(curriculum[field], bool):
                errors.append(f"{path}.curriculum.{field} must be an integer, got boolean")
            else:
                errors.append(
                    f"{path}.curriculum.{field} must be {expected_type.__name__}, "
                    f"got {type(curriculum[field]).__name__}"
                )
            continue
        if controlled is not None and curriculum[field] not in controlled:
            errors.append(
                f"{path}.curriculum.{field} '{curriculum[field]}' is not valid; "
                f"must be one of {sorted(controlled)}"
            )
        if expected_type is str and isinstance(curriculum[field], str) and curriculum[field].strip() == "":
            errors.append(f"{path}.curriculum.{field} must be a non-empty string")

    # Reject unknown curriculum fields
    CURRICULUM_KNOWN_FIELDS = set(curriculum_fields.keys())
    for field in curriculum:
        if field not in CURRICULUM_KNOWN_FIELDS:
            errors.append(f"{path}.curriculum: unknown field '{field}'")

    # ── illustrationRef ──
    if "illustrationRef" in record:
        ref = record["illustrationRef"]
        if ref is None:
            errors.append(f"{path}.illustrationRef must be a non-empty string when present, got null")
        elif not isinstance(ref, str):
            errors.append(f"{path}.illustrationRef must be a non-empty string when present, got {type(ref).__name__}")
        elif ref.strip() == "":
            errors.append(f"{path}.illustrationRef must be a non-empty string when present")

    # ── Reject unauthorised top-level fields (including null) ──
    UNAUTHORISED_TEACHER_FIELDS = {
        "similarityType", "toneNote", "caution",
        "travelScenario", "painPointTags", "examples",
    }
    for field in UNAUTHORISED_TEACHER_FIELDS:
        if field in record:
            errors.append(
                f"{path}: '{field}' is not allowed in teacher curriculum record"
            )

    return errors


def _check_hsk_fields(record: dict, path: str) -> list[str]:
    """Enforce the HSK Simplified-first conditional subtype contract."""
    errors = []

    # ── Required fields for HSK ──
    hsk_required = [
        ("id", str),
        ("simplified", str),
        ("pinyin", str),
        ("japanese", str),
        ("source", dict),
        ("reviewStatus", str),
    ]
    for field, expected_type in hsk_required:
        if field not in record or record[field] is None:
            errors.append(f"{path}: missing required field '{field}' for HSK record")
        elif not isinstance(record[field], expected_type):
            errors.append(
                f"{path}.{field} must be {expected_type.__name__}, "
                f"got {type(record[field]).__name__}"
            )
        elif expected_type is str and isinstance(record[field], str) and record[field].strip() == "":
            errors.append(f"{path}.{field} must be a non-empty string for HSK record")

    # simplifiedStatus is required and must be authored or verified
    if "simplifiedStatus" not in record or record["simplifiedStatus"] is None:
        errors.append(f"{path}: missing required field 'simplifiedStatus' for HSK record")
    elif not isinstance(record["simplifiedStatus"], str):
        errors.append(f"{path}.simplifiedStatus must be a string, got {type(record['simplifiedStatus']).__name__}")
    elif record["simplifiedStatus"] not in HSK_VALID_SCRIPT_STATUSES:
        errors.append(
            f"{path}.simplifiedStatus '{record.get('simplifiedStatus')}' must be "
            f"'authored' or 'verified' for HSK record"
        )

    # ── Traditional optionality ──
    # Explicit null is not the same as absent
    if "traditional" in record and record["traditional"] is None:
        errors.append(f"{path}: 'traditional' cannot be null for HSK record; omit the key if traditional is unavailable")
    if "traditionalStatus" in record and record["traditionalStatus"] is None:
        errors.append(f"{path}: 'traditionalStatus' cannot be null for HSK record; omit the key if traditional is unavailable")

    traditional_present = "traditional" in record and record["traditional"] is not None
    if traditional_present:
        if not isinstance(record["traditional"], str):
            errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")
        elif record["traditional"].strip() == "":
            errors.append(f"{path}.traditional must be a non-empty string for HSK record")
        # Validate traditionalStatus regardless of traditional content
        # (matches validate-script-status.py flat-structure behavior)
        ts = record.get("traditionalStatus")
        if ts is None:
            errors.append(f"{path}: 'traditionalStatus' is required when 'traditional' is present")
        elif not isinstance(ts, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(ts).__name__}")
        elif ts not in HSK_VALID_SCRIPT_STATUSES:
            errors.append(
                f"{path}.traditionalStatus '{ts}' must be 'authored' or 'verified' "
                f"for HSK record"
            )
    else:
        ts = record.get("traditionalStatus")
        if ts is not None and ts != "unavailable":
            errors.append(
                f"{path}: 'traditionalStatus' must be 'unavailable' or absent "
                f"when 'traditional' is absent"
            )

    # ── kana and category are optional for HSK ──
    # (No error if absent; type-check if present)
    for field in ("kana", "category"):
        if field in record and record[field] is None:
            errors.append(f"{path}.{field} cannot be null for HSK record; omit the key if the value is unavailable")
        elif field in record and not isinstance(record[field], str):
            errors.append(f"{path}.{field} must be a string, got {type(record[field]).__name__}")

    # ── hsk object ──
    hsk = record.get("hsk", {})
    if not isinstance(hsk, dict):
        errors.append(f"{path}.hsk must be a JSON object")
        return errors

    if "standardVersion" not in hsk:
        errors.append(f"{path}.hsk: missing required field 'standardVersion'")
    elif not isinstance(hsk["standardVersion"], str):
        errors.append(
            f"{path}.hsk.standardVersion must be a string, "
            f"got {type(hsk['standardVersion']).__name__}"
        )
    elif hsk["standardVersion"] not in VALID_HSK_STANDARD_VERSIONS:
        errors.append(
            f"{path}.hsk.standardVersion '{hsk.get('standardVersion')}' must be one of "
            f"{sorted(VALID_HSK_STANDARD_VERSIONS)}"
        )

    # Reject unknown hsk fields
    HSK_KNOWN_FIELDS = {"standardVersion", "introducedAtLevel", "sourceLevelLabel"}
    for field in hsk:
        if field not in HSK_KNOWN_FIELDS:
            errors.append(f"{path}.hsk: unknown field '{field}'")

    if "introducedAtLevel" not in hsk:
        errors.append(f"{path}.hsk: missing required field 'introducedAtLevel'")
    elif isinstance(hsk["introducedAtLevel"], bool):
        errors.append(
            f"{path}.hsk.introducedAtLevel must be an integer, got boolean"
        )
    elif not isinstance(hsk["introducedAtLevel"], int):
        errors.append(
            f"{path}.hsk.introducedAtLevel must be an integer, "
            f"got {type(hsk['introducedAtLevel']).__name__}"
        )
    elif hsk["introducedAtLevel"] < 1 or hsk["introducedAtLevel"] > 9:
        errors.append(
            f"{path}.hsk.introducedAtLevel '{hsk['introducedAtLevel']}' "
            f"must be between 1 and 9"
        )

    sl = hsk.get("sourceLevelLabel")
    if "sourceLevelLabel" not in hsk:
        errors.append(f"{path}.hsk: missing required field 'sourceLevelLabel'")
    elif not isinstance(sl, str) or sl.strip() == "":
        errors.append(f"{path}.hsk.sourceLevelLabel must be a non-empty string")

    return errors


# ─── Collection duplicate checks ──────────────────────────────────────────

def _check_vocabulary_duplicate_ids(vocabulary: list, path: str) -> list[str]:
    """Detect vocabulary entries with duplicate 'id' values."""
    errors: list[str] = []
    seen: dict[str, int] = {}
    for i, item in enumerate(vocabulary):
        if not isinstance(item, dict):
            continue
        vid = item.get("id")
        if not isinstance(vid, str):
            continue
        if vid in seen:
            errors.append(
                f"{path}[{i}]: duplicate vocabulary id '{vid}' "
                f"(first occurrence at {path}[{seen[vid]}])"
            )
        else:
            seen[vid] = i
    return errors


def _check_hsk_duplicate_identity(vocabulary: list, path: str) -> list[str]:
    """Detect HSK records with duplicate normalized identity within same standardVersion."""
    errors: list[str] = []
    # Map: standardVersion → (norm_simplified, norm_pinyin) tuple → first index
    seen: dict[str, dict[tuple[str, str], int]] = {}
    for i, item in enumerate(vocabulary):
        if not isinstance(item, dict):
            continue
        hsk = item.get("hsk")
        if not isinstance(hsk, dict):
            continue
        sv = hsk.get("standardVersion")
        simplified = item.get("simplified")
        pinyin = item.get("pinyin")
        if not isinstance(sv, str) or not isinstance(simplified, str) or not isinstance(pinyin, str):
            continue

        norm_s = _normalize_simplified(simplified)
        norm_p = _normalize_pinyin(pinyin)
        if not norm_s or not norm_p:
            continue
        key = (norm_s, norm_p)

        if sv not in seen:
            seen[sv] = {}
        version_seen = seen[sv]

        if key in version_seen:
            first_idx = version_seen[key]
            errors.append(
                f"{path}[{i}]: duplicate HSK identity "
                f"'simplified=\"{simplified}\" pinyin=\"{pinyin}\" "
                f"(norm: simplified=\"{norm_s}\" pinyin=\"{norm_p}\") "
                f"in version '{sv}' (first occurrence at {path}[{first_idx}])"
            )
        else:
            version_seen[key] = i
    return errors


def _check_teacher_duplicate_identity(vocabulary: list, path: str) -> list[str]:
    """Detect teacher curriculum records with duplicate normalized identity within sourceId."""
    errors: list[str] = []
    seen: dict[str, dict[tuple[str, str], int]] = {}
    for i, item in enumerate(vocabulary):
        if not isinstance(item, dict):
            continue
        curriculum = item.get("curriculum")
        if not isinstance(curriculum, dict):
            continue
        source_id = curriculum.get("sourceId")
        simplified = item.get("simplified")
        pinyin = item.get("pinyin")
        if not isinstance(source_id, str) or not isinstance(simplified, str) or not isinstance(pinyin, str):
            continue

        norm_s = _normalize_simplified(simplified)
        norm_p = _normalize_pinyin(pinyin)
        if not norm_s or not norm_p:
            continue
        key = (norm_s, norm_p)

        if source_id not in seen:
            seen[source_id] = {}
        source_seen = seen[source_id]

        if key in source_seen:
            first_idx = source_seen[key]
            errors.append(
                f"{path}[{i}]: duplicate teacher identity "
                f"'simplified=\"{simplified}\" pinyin=\"{pinyin}\" "
                f"(norm: simplified=\"{norm_s}\" pinyin=\"{norm_p}\") "
                f"in sourceId '{source_id}' (first occurrence at {path}[{first_idx}])"
            )
        else:
            source_seen[key] = i
    return errors


# ─── Illustration duplicate checks ──────────────────────────────────────────

def _check_illustration_duplicate_ids(illustrations: list, path: str) -> list[str]:
    """Detect illustrations with duplicate 'id' values."""
    errors: list[str] = []
    seen: dict[str, int] = {}
    for i, item in enumerate(illustrations):
        if not isinstance(item, dict):
            continue
        iid = item.get("id")
        if not isinstance(iid, str):
            continue
        if iid in seen:
            errors.append(
                f"{path}[{i}]: duplicate illustration id '{iid}' "
                f"(first occurrence at {path}[{seen[iid]}])"
            )
        else:
            seen[iid] = i
    return errors


def _check_illustration_duplicate_vocabulary_id(illustrations: list, path: str) -> list[str]:
    """Detect illustrations with duplicate vocabularyId links (exactly one per vocab)."""
    errors: list[str] = []
    seen: dict[str, int] = {}
    for i, item in enumerate(illustrations):
        if not isinstance(item, dict):
            continue
        vid = item.get("vocabularyId")
        if not isinstance(vid, str):
            continue
        if vid in seen:
            errors.append(
                f"{path}[{i}]: duplicate vocabularyId link '{vid}' "
                f"(first occurrence at {path}[{seen[vid]}])"
            )
        else:
            seen[vid] = i
    return errors


# ─── Cross-reference: teacher vocabulary ↔ illustrations ────────────────────

def _check_teacher_illustration_xref(
    teacher_records: list, illustrations: list, path: str, vocab_key: str = "vocabulary"
) -> list[str]:
    """Validate cross-references between teacher vocabulary and illustrations.

    Rules:
    - Every teacher vocabulary illustrationRef must match one illustration id.
    - That illustration's vocabularyId must equal the vocabulary record's id.
    - Orphan illustration records fail.
    - Draft teacher records may omit illustrationRef.
    - Reviewed/published teacher records must include a valid illustrationRef.
    """
    errors: list[str] = []

    # Build illustration index: id → record
    ill_by_id: dict[str, dict] = {}
    for i, ill in enumerate(illustrations):
        if not isinstance(ill, dict):
            continue
        iid = ill.get("id")
        if isinstance(iid, str):
            ill_by_id[iid] = ill

    # Check teacher records
    for i, record in enumerate(teacher_records):
        if not isinstance(record, dict):
            continue
        rec_path = f"{path}.{vocab_key}[{i}]"
        ref = record.get("illustrationRef")
        review_status = record.get("reviewStatus")

        if ref is not None:
            if not isinstance(ref, str) or ref.strip() == "":
                continue  # caught by field validation
            if ref not in ill_by_id:
                errors.append(
                    f"{rec_path}: illustrationRef '{ref}' does not match any illustration id"
                )
            else:
                ill = ill_by_id[ref]
                ill_vocab_id = ill.get("vocabularyId")
                rec_id = record.get("id")
                if isinstance(ill_vocab_id, str) and isinstance(rec_id, str):
                    if ill_vocab_id != rec_id:
                        errors.append(
                            f"{rec_path}: illustrationRef '{ref}' has vocabularyId "
                            f"'{ill_vocab_id}' but teacher id is '{rec_id}'"
                        )

        # Reviewed/published must have illustrationRef
        if review_status in ("reviewed", "published"):
            if ref is None or (isinstance(ref, str) and ref.strip() == ""):
                errors.append(
                    f"{rec_path}: 'illustrationRef' is required when "
                    f"reviewStatus is '{review_status}'"
                )

    # Orphan illustration check
    teacher_ids = set()
    for record in teacher_records:
        if isinstance(record, dict):
            rid = record.get("id")
            if isinstance(rid, str):
                teacher_ids.add(rid)

    for i, ill in enumerate(illustrations):
        if not isinstance(ill, dict):
            continue
        ill_path = f"{path}.illustrations[{i}]"
        vid = ill.get("vocabularyId")
        if isinstance(vid, str) and vid not in teacher_ids:
            errors.append(
                f"{ill_path}: orphan illustration with vocabularyId '{vid}' — "
                f"no matching teacher vocabulary record found"
            )

    return errors


def _orphan_illustration_detection(illustrations: list, path: str) -> list[str]:
    """Detect orphan illustrations when no teacher vocabulary record is present."""
    errors: list[str] = []
    for i, ill in enumerate(illustrations):
        if not isinstance(ill, dict):
            continue
        ill_path = f"{path}.illustrations[{i}]"
        vid = ill.get("vocabularyId")
        if isinstance(vid, str):
            errors.append(
                f"{ill_path}: orphan illustration with vocabularyId '{vid}' — "
                f"no teacher vocabulary record exists in this bundle"
            )
    return errors


_build_schemas()


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        if len(sys.argv) < 3:
            print("Usage: python3 scripts/validate-content-schema.py --check <file>", file=sys.stderr)
            sys.exit(2)
        filepath = sys.argv[2]
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        warnings = collect_bundle_warnings(data)
        errors = validate_bundle(data)
        for warning in warnings:
            print(f"WARNING: {warning}")
        for e in errors:
            print(f"{filepath}: {e}")
        sys.exit(1 if errors else 0)
    else:
        run_tests()


# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

def _valid_learning_path(overrides: dict = None) -> dict:
    record = {
        "id": "taiwan-travel",
        "labelJa": "台湾旅行で使える中国語",
        "descriptionJa": "台湾旅行で使う中国語を学ぶメインルート。",
        "script": "traditional",
        "destination": "/lessons/",
        "availabilityReason": "available",
        "members": [
            {"type": "lesson", "id": "lesson-001"},
            {"type": "vocabulary", "id": "voc-001"},
            {"type": "phrase", "id": "phrase-001"},
        ],
    }
    if overrides:
        record.update(overrides)
    return record


def _cli_learning_path_result(record: dict):
    """Run --check on a learning_paths bundle and return (exit_code, stdout)."""
    return _cli_check_result({"learning_paths": [record]})


def test_learning_path_valid():
    exit_code, stdout = _cli_learning_path_result(_valid_learning_path())
    assert exit_code == 0, f"Expected valid learning path to pass: {stdout}"


def test_learning_path_missing_required():
    record = _valid_learning_path()
    del record["destination"]
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected missing destination to fail"
    assert "missing required field 'destination'" in stdout


def test_learning_path_invalid_script():
    record = _valid_learning_path({"script": "zh-hant"})
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected invalid script to fail"
    assert "script 'zh-hant' is invalid" in stdout


def test_learning_path_destination_must_end_with_slash():
    record = _valid_learning_path({"destination": "/lessons"})
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected non-slash destination to fail"
    assert "must end with '/'" in stdout


def test_learning_path_duplicate_member():
    record = _valid_learning_path()
    record["members"].append({"type": "lesson", "id": "lesson-001"})
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected duplicate member to fail"
    assert "duplicates member 'lesson:lesson-001'" in stdout


def test_learning_path_invalid_member_type():
    record = _valid_learning_path({"members": [{"type": "sentence", "id": "x"}]})
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected invalid member type to fail"
    assert "type 'sentence' is invalid" in stdout


def test_learning_path_unknown_member_field():
    record = _valid_learning_path({"members": [{"type": "lesson", "id": "a", "extra": 1}]})
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected unknown member field to fail"
    assert "unknown field 'extra'" in stdout


def test_learning_path_hsk_reason_requires_descriptor():
    record = _valid_learning_path({"availabilityReason": "hsk", "members": []})
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected hsk reason without descriptor to fail"
    assert "requires an hsk descriptor" in stdout


def test_learning_path_hsk_valid():
    record = _valid_learning_path({
        "id": "hsk-vocabulary",
        "script": "simplified",
        "destination": "/vocabulary/hsk/",
        "availabilityReason": "hsk",
        "hsk": {"levels": [1], "status": "available"},
        "members": [],
    })
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code == 0, f"Expected valid hsk descriptor to pass: {stdout}"


def test_learning_path_hsk_duplicate_levels():
    record = _valid_learning_path({
        "id": "hsk-vocabulary",
        "script": "simplified",
        "destination": "/vocabulary/hsk/",
        "availabilityReason": "hsk",
        "hsk": {"levels": [1, 1], "status": "available"},
        "members": [],
    })
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected duplicate hsk levels to fail"
    assert "must not contain duplicates" in stdout


def test_learning_path_hsk_on_non_hsk_reason():
    record = _valid_learning_path({
        "hsk": {"levels": [1], "status": "available"},
    })
    exit_code, stdout = _cli_learning_path_result(record)
    assert exit_code != 0, "Expected hsk descriptor on available path to fail"
    assert "only valid for availabilityReason 'hsk'" in stdout


def run_tests():
    tests = [
        # ─── Learning Path (#229) ───
        test_learning_path_valid,
        test_learning_path_missing_required,
        test_learning_path_invalid_script,
        test_learning_path_destination_must_end_with_slash,
        test_learning_path_duplicate_member,
        test_learning_path_invalid_member_type,
        test_learning_path_unknown_member_field,
        test_learning_path_hsk_reason_requires_descriptor,
        test_learning_path_hsk_valid,
        test_learning_path_hsk_duplicate_levels,
        test_learning_path_hsk_on_non_hsk_reason,

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
        test_lesson_practice_reviewed_mixed_distractor_types,
        test_lesson_practice_published_mixed_distractor_types,
        test_lesson_practice_reviewed_only_non_string_distractors,
        test_lesson_practice_reviewed_invalid_prompt_masks_non_string_distractor,
        test_lesson_practice_reviewed_non_object_prompt,
        test_lesson_practice_published_non_object_prompt,
        test_lesson_practice_reviewed_all_non_object_prompts_fails,

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
        test_sentence_source_valid,
        test_sentence_source_non_dict_rejected,
        test_sentence_source_empty_type_rejected,
        test_sentence_source_note_non_string_rejected,

        # ─── Phrasebook ───
        test_phrasebook_valid,
        test_phrasebook_missing_required,
        test_phrasebook_invalid_scenario,
        test_phrasebook_missing_usage_for_region,
        test_phrasebook_source_non_dict_rejected,
        test_phrasebook_source_empty_type_rejected,
        test_phrasebook_source_note_non_string_rejected,

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
        test_resource_attribution_required_with_instructions,
        test_resource_attribution_required_false_or_absent,
        test_resource_production_import_does_not_bypass_attribution,
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
        test_resource_notes_empty_warning,
        test_resource_notes_whitespace_warning,
        test_resource_notes_non_empty_no_warning,
        test_resource_warning_only_bundle_has_no_errors,
        test_resource_invalid_notes_do_not_warn,
        test_resource_warning_order,
        test_resource_relevance_fields,

        # ─── CLI regression tests ───
        test_cli_warning_prefix_and_message,
        test_cli_warning_before_error,
        test_cli_warning_only_exits_zero,
        test_cli_validation_error_exits_non_zero,
        test_cli_warning_order,

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

        # ─── Teacher vocabulary ───
        test_teacher_vocab_valid,
        test_teacher_vocab_with_traditional_valid,
        test_teacher_vocab_traditional_absent_ok,
        test_teacher_vocab_missing_simplified_fails,
        test_teacher_vocab_missing_pinyin_fails,
        test_teacher_vocab_missing_japanese_fails,
        test_teacher_vocab_missing_source_fails,
        test_teacher_vocab_generated_simplified_fails,
        test_teacher_vocab_missing_curriculum_fails,
        test_teacher_vocab_invalid_curriculum_source_id,
        test_teacher_vocab_invalid_difficulty_band,
        test_teacher_vocab_invalid_difficulty_label,
        test_teacher_vocab_invalid_part_of_speech,
        test_teacher_vocab_curriculum_unknown_field,
        test_teacher_vocab_kana_optional,
        test_teacher_vocab_category_optional,
        test_teacher_vocab_illustration_ref_present,
        test_teacher_vocab_source_type_valid,
        test_teacher_vocab_source_note_valid,
        test_teacher_vocab_bundle_valid,
        test_teacher_duplicate_identity_detection,
        test_teacher_duplicate_identity_deterministic_order,
        test_teacher_duplicate_identity_bundle,
        test_teacher_vocab_legacy_hsk_backward_compatible,
        test_teacher_vocab_null_curriculum_rejected,
        test_teacher_vocab_source_note_absent_ok,
        # B2: unauthorised fields rejected
        test_teacher_vocab_similarity_type_rejected,
        test_teacher_vocab_tone_note_rejected,
        test_teacher_vocab_caution_rejected,
        test_teacher_vocab_travel_scenario_rejected,
        test_teacher_vocab_pain_point_tags_rejected,
        test_teacher_vocab_examples_rejected,
        # Gap 1: Teacher/HSK exclusivity
        test_teacher_vocab_hsk_both_keys,
        test_teacher_vocab_hsk_both_null,
        test_teacher_vocab_hsk_non_branching,
        test_teacher_vocab_curriculum_null_hsk_object,
        test_teacher_vocab_curriculum_null_hsk_null,
        test_teacher_vocab_bad_curriculum_bad_hsk,
        # Gap 2: Forbidden teacher fields with null
        test_teacher_vocab_similarity_type_null,
        test_teacher_vocab_tone_note_null,
        test_teacher_vocab_caution_null,
        test_teacher_vocab_travel_scenario_null,
        test_teacher_vocab_pain_point_tags_null,
        test_teacher_vocab_examples_null,
        test_teacher_vocab_illustration_ref_null,

        # ─── Illustration ───
        test_illustration_valid,
        test_illustration_missing_required,
        test_illustration_unknown_field,
        test_illustration_invalid_checksum_length,
        test_illustration_invalid_checksum_chars,
        test_illustration_valid_checksum,
        test_illustration_invalid_width,
        test_illustration_invalid_height,
        test_illustration_width_boolean_fails,
        test_illustration_file_size_over_limit,
        test_illustration_file_size_boolean_fails,
        test_illustration_invalid_mime_type,
        test_illustration_asset_path_prefix,
        test_illustration_asset_path_extension_mismatch,
        test_illustration_rights_basis_invalid,
        test_illustration_rights_public_web_display_false,
        test_illustration_rights_attribution_required_true_needs_text,
        test_illustration_rights_attribution_not_required_no_text,
        test_illustration_rights_unknown_field,
        test_illustration_rights_reuse_invalid,
        # Gap 3: Illustration non-empty string fields
        test_illustration_id_empty_fails,
        test_illustration_id_whitespace_fails,
        test_illustration_vocabulary_id_empty_fails,
        test_illustration_vocabulary_id_whitespace_fails,
        test_illustration_asset_path_empty_fails,
        test_illustration_asset_path_whitespace_fails,
        test_illustration_alt_ja_empty_fails,
        test_illustration_alt_ja_whitespace_fails,
        # Gap 4: Rights boundary tests
        test_illustration_rights_attribution_required_null,
        test_illustration_rights_attribution_text_null_not_required,
        test_illustration_rights_reuse_non_string_list,
        test_illustration_rights_reuse_non_string_object,
        test_illustration_rights_reuse_non_string_number,
        test_illustration_rights_attribution_text_null_when_required,
        test_illustration_rights_attribution_text_empty_when_required,

        # Pending-rights draft illustration
        test_illustration_pending_rights_draft_valid,
        test_illustration_pending_rights_empty_note_fails,
        test_illustration_pending_rights_unknown_field_fails,
        test_illustration_pending_rights_reviewed_fails,
        test_illustration_pending_rights_published_fails,
        test_illustration_pending_rights_missing_source_fails,
        test_illustration_pending_rights_missing_note_fails,
        test_illustration_pending_rights_bad_source_fails,
        test_illustration_pending_rights_cleared_fields_rejected,

        # Approved teacher-provided rights (Issue #193)
        test_illustration_rights_approved_valid,
        test_illustration_rights_approved_missing_markers_fails,
        test_illustration_rights_approved_wrong_source_fails,
        test_illustration_rights_approved_unknown_field_fails,
        test_illustration_rights_approved_rejects_relicensing_claim,
        test_teacher_image_rights_record_permits_production_learner_use,
        test_teacher_image_rights_record_contradiction_fails,

        # Existing cleared-rights backward compatibility
        test_illustration_cleared_rights_draft_valid,
        test_illustration_cleared_rights_reviewed_valid,
        test_illustration_cleared_rights_published_valid,

        # Backward compatibility
        test_teacher_vocab_hsk_backward_absent,
        test_hsk_record_without_curriculum_backward,
        test_legacy_vocab_without_hsk_or_curriculum_backward,
        test_illustration_duplicate_id_detection,
        test_illustration_duplicate_vocabulary_id_detection,
        test_illustration_bundle_valid,

        # ─── Cross-reference ───
        test_teacher_illustration_xref_valid,
        test_teacher_illustration_xref_missing_illustration,
        test_teacher_illustration_xref_vocabulary_id_mismatch,
        test_teacher_illustration_xref_reviewed_missing_ref,
        test_teacher_illustration_xref_published_missing_ref,
        test_teacher_illustration_xref_draft_omit_ref_ok,
        test_teacher_illustration_xref_orphan_illustration,
        # B3: orphan regression tests
        test_orphan_illustrations_no_teacher_key,
        test_orphan_illustrations_empty_teacher_array,
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

        # ─── HSK vocabulary ───
        test_hsk_vocab_valid,
        test_hsk_vocab_with_traditional_valid,
        test_hsk_vocab_traditional_absent_ok,
        test_hsk_vocab_invalid_standard_version,
        test_hsk_vocab_level_boolean_fails,
        test_hsk_vocab_level_non_integer_fails,
        test_hsk_vocab_level_zero_fails,
        test_hsk_vocab_level_ten_fails,
        test_hsk_vocab_level_one_valid,
        test_hsk_vocab_level_nine_valid,
        test_hsk_vocab_empty_source_level_label_fails,
        test_hsk_vocab_missing_simplified_fails,
        test_hsk_vocab_missing_pinyin_fails,
        test_hsk_vocab_missing_japanese_fails,
        test_hsk_vocab_missing_source_fails,
        test_hsk_vocab_generated_simplified_status_fails,
        test_hsk_vocab_generated_simplified_not_production,
        test_hsk_vocab_missing_hsk_object_fails,
        test_hsk_vocab_kana_optional,
        test_hsk_vocab_category_optional,
        test_hsk_vocab_traditional_generated_fails,
        test_hsk_vocab_missing_hsk_required_fields,
        test_hsk_duplicate_id_detection,
        test_hsk_duplicate_identity_detection,
        test_hsk_duplicate_identity_different_version_allowed,
        test_hsk_duplicate_identity_deterministic_order,
        test_hsk_nul_delimiter_no_false_positive,
        test_hsk_legacy_backward_compatible,
        test_hsk_legacy_generated_not_production,
        test_hsk_vocab_bundle_valid,
        test_hsk_vocab_bundle_duplicate_id,
        test_hsk_vocab_null_hsk_rejected,
        test_hsk_vocab_empty_source_type_fails,
        test_hsk_vocab_source_note_non_string_fails,
        test_hsk_vocab_traditional_empty_string_fails,
        test_hsk_vocab_traditional_null_fails,
        test_hsk_vocab_traditional_status_null_fails,
        test_hsk_vocab_traditional_absent_no_error,
        test_hsk_vocab_traditional_status_unavailable_ok,
        test_hsk_vocab_examples_invalid_script_status,
        test_hsk_vocab_examples_missing_traditional_status,
        test_hsk_vocab_examples_simplified_without_status_fails,
        test_hsk_vocab_examples_simplified_status_unavailable_fails,
        test_hsk_vocab_unknown_hsk_field_rejected,
        test_hsk_vocab_examples_traditional_unavailable_rejected,
        test_hsk_vocab_examples_simplified_status_null_rejected,
        test_non_hsk_source_non_dict_rejected,
        test_hsk_vocab_source_note_null_rejected,
        test_vocab_examples_full_valid,
        test_vocab_examples_non_dict_rejected,
        test_vocab_examples_missing_pinyin_japanese,
        test_hsk_vocab_examples_generated_reviewed_fails,
        test_hsk_vocab_examples_generated_published_fails,
        test_hsk_vocab_examples_generated_draft_ok,
        test_vocab_examples_empty_array_ok,

        # ─── HSK normalization edges ───
        test_hsk_normalization_nfkc_composed,
        test_hsk_normalization_fullwidth_space,
        test_hsk_normalization_tone_mark_distinct,
        test_hsk_normalization_case_folded_pinyin,

        # ─── HSK boundary edges ───
        test_hsk_vocab_simplified_empty_string_fails,
        test_hsk_vocab_simplified_status_unavailable_fails,
        test_hsk_vocab_traditional_present_status_unavailable_fails,
        test_hsk_vocab_kana_non_string_fails,
        test_hsk_vocab_category_non_string_fails,
        test_hsk_vocab_source_non_dict_fails,
        test_hsk_vocab_id_empty_string_fails,
        test_hsk_vocab_pinyin_empty_string_fails,
        test_hsk_vocab_japanese_empty_string_fails,
        test_hsk_vocab_simplified_whitespace_only_fails,
        test_hsk_vocab_legacy_traditional_without_simplified_fails,
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


def test_lesson_practice_reviewed_mixed_distractor_types():
    """reviewed lesson with non-string distractor element reports precise index."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[
                            {"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["B", 42, "C"]},
                        ]),
        "lesson",
    )
    _assert_has_error(errs, "reviewPrompts[0].distractorsJa[1]", "reviewed_mixed_type_index")
    _assert_has_error(errs, "must be a string", "reviewed_mixed_type_msg")
    _assert_has_error(errs, "got int", "reviewed_mixed_type_int")


def test_lesson_practice_published_mixed_distractor_types():
    """published lesson with number and null distractors reports each position."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="published",
                        reviewPrompts=[
                            {"promptJa": "Q?", "answerJa": "A", "distractorsJa": [None, "B"]},
                        ]),
        "lesson",
    )
    _assert_has_error(errs, "reviewPrompts[0].distractorsJa[0]", "published_mixed_index")
    _assert_has_error(errs, "must be a string", "published_mixed_msg")
    _assert_has_error(errs, "got NoneType", "published_mixed_none")
    # Still passes because "B" is a usable string distractor


def test_lesson_practice_reviewed_only_non_string_distractors():
    """reviewed lesson where all distractors are non-string must fail."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[
                            {"promptJa": "Q?", "answerJa": "A", "distractorsJa": [True, 42, []]},
                        ]),
        "lesson",
    )
    _assert_has_error(errs, "distractorsJa[0]: must be a string, got bool", "reviewed_only_nonstr_bool")
    _assert_has_error(errs, "distractorsJa[1]: must be a string, got int", "reviewed_only_nonstr_int")
    _assert_has_error(errs, "distractorsJa[2]: must be a string, got list", "reviewed_only_nonstr_list")
    _assert_has_error(errs, "non-empty distractor string", "reviewed_only_nonstr_usable")


def test_lesson_practice_reviewed_invalid_prompt_masks_non_string_distractor():
    """reviewed lesson with invalid promptJa/answerJa still reports
    non-string distractor element types."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=[
                            {"promptJa": "", "answerJa": "A", "distractorsJa": [42]},
                            {"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["B"]},
                        ]),
        "lesson",
    )
    _assert_has_error(errs, "reviewPrompts[0].distractorsJa[0]: must be a string, got int",
                      "reviewed_invalid_prompt_masks_non_str")
    # Still passes because prompt 1 has a usable distractor


def test_lesson_practice_reviewed_non_object_prompt():
    """reviewed lesson with a non-dict reviewPrompt element reports its type."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=["not-an-object", {"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["B"]}]),
        "lesson",
    )
    _assert_has_error(errs, "reviewPrompts[0]: must be a dict/object, got str",
                      "reviewed_non_object_prompt")


def test_lesson_practice_published_non_object_prompt():
    """published lesson with a null reviewPrompt element reports its type."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="published",
                        reviewPrompts=[None, {"promptJa": "Q?", "answerJa": "A", "distractorsJa": ["B"]}]),
        "lesson",
    )
    _assert_has_error(errs, "reviewPrompts[0]: must be a dict/object, got NoneType",
                      "published_non_object_prompt")


def test_lesson_practice_reviewed_all_non_object_prompts_fails():
    """reviewed lesson where all reviewPrompts are non-object must fail."""
    errs = validate_single(
        _minimal_lesson(reviewStatus="reviewed",
                        reviewPrompts=["string", 42, None]),
        "lesson",
    )
    _assert_has_error(errs, "reviewPrompts[0]: must be a dict/object, got str",
                      "reviewed_all_nonobj_str")
    _assert_has_error(errs, "reviewPrompts[1]: must be a dict/object, got int",
                      "reviewed_all_nonobj_int")
    _assert_has_error(errs, "reviewPrompts[2]: must be a dict/object, got NoneType",
                      "reviewed_all_nonobj_none")
    _assert_has_error(errs, "non-empty distractor string",
                      "reviewed_all_nonobj_usable")


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


def test_sentence_source_valid():
    """Sentence with valid source object passes."""
    errs = validate_single(
        _minimal_sentence(source={"type": "authored", "note": "test"}),
        "sentence",
    )
    _assert_no_errors(errs, "sentence_source_valid")


def test_sentence_source_non_dict_rejected():
    """Sentence source must be an object, not a string."""
    errs = validate_single(
        _minimal_sentence(source="not-an-object"),
        "sentence",
    )
    _assert_has_error(errs, "must be a JSON object", "sentence_source_string")


def test_sentence_source_empty_type_rejected():
    """Sentence source.type must be non-empty."""
    errs = validate_single(
        _minimal_sentence(source={"type": ""}),
        "sentence",
    )
    _assert_has_error(errs, "source.type must be a non-empty string", "sentence_source_empty_type")


def test_sentence_source_note_non_string_rejected():
    """Sentence source.note must be a string when present."""
    errs = validate_single(
        _minimal_sentence(source={"type": "authored", "note": 123}),
        "sentence",
    )
    _assert_has_error(errs, "source.note must be a string", "sentence_source_note_non_string")
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




def test_phrasebook_source_valid():
    """Phrasebook with valid source object passes."""
    errs = validate_single(
        _minimal_phrasebook(source={"type": "authored", "note": "test"}),
        "phrasebook",
    )
    _assert_no_errors(errs, "phrasebook_source_valid")


def test_phrasebook_source_non_dict_rejected():
    """Phrasebook source must be an object, not a string."""
    errs = validate_single(
        _minimal_phrasebook(source="not-an-object"),
        "phrasebook",
    )
    _assert_has_error(errs, "must be a JSON object", "phrasebook_source_string")


def test_phrasebook_source_empty_type_rejected():
    """Phrasebook source.type must be non-empty."""
    errs = validate_single(
        _minimal_phrasebook(source={"type": ""}),
        "phrasebook",
    )
    _assert_has_error(errs, "source.type must be a non-empty string", "phrasebook_source_empty_type")


def test_phrasebook_source_note_non_string_rejected():
    """Phrasebook source.note must be a string when present."""
    errs = validate_single(
        _minimal_phrasebook(source={"type": "authored", "note": 123}),
        "phrasebook",
    )
    _assert_has_error(errs, "source.note must be a string", "phrasebook_source_note_non_string")

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
    cases = {
        "missing": _minimal_resource(attributionRequired=True),
        "empty": _minimal_resource(
            attributionRequired=True, attributionInstructions=""
        ),
        "whitespace": _minimal_resource(
            attributionRequired=True, attributionInstructions="   "
        ),
    }
    for label, record in cases.items():
        errs = validate_single(record, "resource")
        _assert_has_error(
            errs,
            "attributionInstructions",
            f"resource_attribution_instructions_{label}",
        )


def test_resource_attribution_required_with_instructions():
    errs = validate_single(
        _minimal_resource(
            attributionRequired=True,
            attributionInstructions="Credit the owner and link the source.",
        ),
        "resource",
    )
    _assert_no_errors(errs, "resource_attribution_instructions_present")


def test_resource_attribution_required_false_or_absent():
    for label, record in (
        ("false", _minimal_resource(attributionRequired=False)),
        ("absent", _minimal_resource()),
    ):
        errs = validate_single(record, "resource")
        _assert_no_errors(errs, f"resource_attribution_required_{label}")


def test_resource_production_import_does_not_bypass_attribution():
    errs = validate_single(
        _minimal_resource(
            licenseStatus="approved",
            allowedUse="attributed-use",
            reviewStatus="approved",
            reviewedBy="content-reviewer",
            reviewedDate="2026-07-12",
            attributionRequired=True,
            productionImportAllowed=True,
        ),
        "resource",
    )
    _assert_has_error(
        errs,
        "attributionInstructions",
        "resource_production_import_attribution_instructions",
    )


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


def test_resource_notes_empty_warning():
    warnings = collect_bundle_warnings(
        {"resources": [_minimal_resource(notes="")]}
    )
    assert warnings == [
        "root.resources[0].notes should explain why this resource is useful or risky"
    ], f"Expected one empty-notes warning, got {warnings}"


def test_resource_notes_whitespace_warning():
    warnings = collect_bundle_warnings(
        {"resources": [_minimal_resource(notes=" \t ")]}
    )
    assert warnings == [
        "root.resources[0].notes should explain why this resource is useful or risky"
    ], f"Expected one whitespace-notes warning, got {warnings}"


def test_resource_notes_non_empty_no_warning():
    warnings = collect_bundle_warnings(
        {"resources": [_minimal_resource(notes="Useful reference.")]}
    )
    assert warnings == [], f"Expected no notes warning, got {warnings}"


def test_resource_warning_only_bundle_has_no_errors():
    data = {"resources": [_minimal_resource(notes="")]}
    _assert_no_errors(
        validate_bundle(data),
        "resource_warning_only_bundle",
    )
    assert len(collect_bundle_warnings(data)) == 1


def test_resource_invalid_notes_do_not_warn():
    missing_notes = _minimal_resource()
    del missing_notes["notes"]
    for label, record in (
        ("missing", missing_notes),
        ("non_string", _minimal_resource(notes=123)),
    ):
        data = {"resources": [record]}
        _assert_has_error(validate_bundle(data), "notes", f"resource_notes_{label}")
        warnings = collect_bundle_warnings(data)
        assert warnings == [], (
            f"Expected invalid {label} notes not to warn, got {warnings}"
        )


def test_resource_warning_order():
    warnings = collect_bundle_warnings({
        "resources": [
            _minimal_resource(id="resource-warning-a", notes=""),
            _minimal_resource(id="resource-warning-b", notes="  "),
        ],
    })
    assert warnings == [
        "root.resources[0].notes should explain why this resource is useful or risky",
        "root.resources[1].notes should explain why this resource is useful or risky",
    ], f"Expected collection/index warning order, got {warnings}"


def test_resource_relevance_fields():
    controlled_fields = {
        "languageRelevance": VALID_LANGUAGE_RELEVANCE,
        "regionalRelevance": VALID_REGIONAL_RELEVANCE,
        "scriptRelevance": VALID_SCRIPT_RELEVANCE,
    }
    for field, controlled_values in controlled_fields.items():
        for value in sorted(controlled_values):
            errs = validate_single(_minimal_resource(**{field: value}), "resource")
            _assert_no_errors(errs, f"resource_{field}_{value}")

        errs = validate_single(
            _minimal_resource(**{field: "unknown-value"}), "resource"
        )
        _assert_has_error(errs, f"item.{field}", f"resource_{field}_unknown")

        errs = validate_single(_minimal_resource(**{field: 123}), "resource")
        _assert_has_error(errs, f"item.{field}", f"resource_{field}_type")
        _assert_has_error(errs, "must be str", f"resource_{field}_type")

        errs = validate_single(_minimal_resource(), "resource")
        _assert_no_errors(errs, f"resource_{field}_absent")


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


# ─── HSK vocabulary tests ─────────────────────────────────────────────────

def _minimal_hsk_vocab(**overrides):
    data = {
        "id": "hsk-voc-001",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {
            "standardVersion": "hsk-3.0",
            "introducedAtLevel": 1,
            "sourceLevelLabel": "HSK 3.0 Level 1",
        },
    }
    data.update(overrides)
    return data


def test_hsk_vocab_valid():
    """Minimal valid HSK record."""
    errs = validate_single(_minimal_hsk_vocab(), "vocabulary")
    _assert_no_errors(errs, "hsk_vocab_valid")


def test_hsk_vocab_with_traditional_valid():
    """HSK record with reviewed traditional form passes."""
    errs = validate_single(
        _minimal_hsk_vocab(
            traditional="你好",
            traditionalStatus="authored",
        ),
        "vocabulary",
    )
    _assert_no_errors(errs, "hsk_vocab_with_traditional")


def test_hsk_vocab_traditional_absent_ok():
    """HSK record without traditional passes when traditionalStatus is absent or unavailable."""
    errs = validate_single(_minimal_hsk_vocab(), "vocabulary")
    _assert_no_errors(errs, "hsk_vocab_traditional_absent")
    # Also with explicit unavailable
    errs2 = validate_single(
        _minimal_hsk_vocab(traditionalStatus="unavailable"),
        "vocabulary",
    )
    _assert_no_errors(errs2, "hsk_vocab_traditional_unavailable")


def test_hsk_vocab_invalid_standard_version():
    """Unsupported standard version fails."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-2.0", "introducedAtLevel": 1, "sourceLevelLabel": "x"}),
        "vocabulary",
    )
    _assert_has_error(errs, "must be one of", "hsk_invalid_standard")


def test_hsk_vocab_level_boolean_fails():
    """Boolean introducedAtLevel fails (not an integer)."""
    for val in (True, False):
        errs = validate_single(
            _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": val, "sourceLevelLabel": "x"}),
            "vocabulary",
        )
        _assert_has_error(errs, "must be an integer, got boolean", f"hsk_level_bool_{val}")


def test_hsk_vocab_level_non_integer_fails():
    """Float introducedAtLevel fails."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1.5, "sourceLevelLabel": "x"}),
        "vocabulary",
    )
    _assert_has_error(errs, "must be an integer, got float", "hsk_level_float")


def test_hsk_vocab_level_zero_fails():
    """introducedAtLevel 0 fails (below 1)."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 0, "sourceLevelLabel": "x"}),
        "vocabulary",
    )
    _assert_has_error(errs, "must be between 1 and 9", "hsk_level_zero")


def test_hsk_vocab_level_ten_fails():
    """introducedAtLevel 10 fails (above 9)."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 10, "sourceLevelLabel": "x"}),
        "vocabulary",
    )
    _assert_has_error(errs, "must be between 1 and 9", "hsk_level_ten")


def test_hsk_vocab_level_one_valid():
    """introducedAtLevel 1 is valid."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "x"}),
        "vocabulary",
    )
    _assert_no_errors(errs, "hsk_level_one")


def test_hsk_vocab_level_nine_valid():
    """introducedAtLevel 9 is valid."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 9, "sourceLevelLabel": "x"}),
        "vocabulary",
    )
    _assert_no_errors(errs, "hsk_level_nine")


def test_hsk_vocab_empty_source_level_label_fails():
    """Empty or whitespace-only sourceLevelLabel fails."""
    for val in ("", "   "):
        errs = validate_single(
            _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": val}),
            "vocabulary",
        )
        _assert_has_error(errs, "non-empty", f"hsk_label_empty_{val!r}")


def test_hsk_vocab_missing_simplified_fails():
    """HSK record without simplified fails."""
    errs = validate_single(_minimal_hsk_vocab(simplified=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "hsk_missing_simplified")


def test_hsk_vocab_missing_pinyin_fails():
    """HSK record without pinyin fails."""
    errs = validate_single(_minimal_hsk_vocab(pinyin=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "hsk_missing_pinyin")


def test_hsk_vocab_missing_japanese_fails():
    """HSK record without japanese fails."""
    errs = validate_single(_minimal_hsk_vocab(japanese=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "hsk_missing_japanese")


def test_hsk_vocab_missing_source_fails():
    """HSK record without source fails."""
    errs = validate_single(_minimal_hsk_vocab(source=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "hsk_missing_source")


def test_hsk_vocab_generated_simplified_status_fails():
    """HSK simplifiedStatus must be authored or verified, not generated."""
    errs = validate_single(_minimal_hsk_vocab(simplifiedStatus="generated"), "vocabulary")
    _assert_has_error(errs, "must be 'authored' or 'verified'", "hsk_generated_simplified")


def test_hsk_vocab_generated_simplified_not_production():
    """HSK record with generated simplifiedStatus and reviewed/published fails."""
    for status in ("reviewed", "published"):
        errs = validate_single(
            _minimal_hsk_vocab(simplifiedStatus="generated", reviewStatus=status),
            "vocabulary",
        )
        _assert_has_error(errs, "generated", f"hsk_generated_prod_{status}")


def test_hsk_vocab_missing_hsk_object_fails():
    """Missing hsk object fails schema validation (no top-level required for non-HSK)."""
    # This should work as non-HSK legacy vocab — but it's missing traditional and kana
    errs = validate_single(
        {"id": "unknown", "pinyin": "x", "japanese": "x", "reviewStatus": "draft"},
        "vocabulary",
    )
    # It should get non-HSK field errors
    _assert_has_error(errs, "required field 'traditional'", "hsk_missing_hsk_legacy")


def test_hsk_vocab_kana_optional():
    """kana is optional for HSK records."""
    errs = validate_single(_minimal_hsk_vocab(kana="カタカナ"), "vocabulary")
    _assert_no_errors(errs, "hsk_kana_present")
    errs2 = validate_single(_minimal_hsk_vocab(), "vocabulary")
    _assert_no_errors(errs2, "hsk_kana_absent")


def test_hsk_vocab_category_optional():
    """category is optional for HSK records."""
    errs = validate_single(_minimal_hsk_vocab(category="greeting"), "vocabulary")
    _assert_no_errors(errs, "hsk_category_present")
    errs2 = validate_single(_minimal_hsk_vocab(), "vocabulary")
    _assert_no_errors(errs2, "hsk_category_absent")


def test_hsk_vocab_traditional_generated_fails():
    """HSK traditionalStatus generated fails."""
    errs = validate_single(
        _minimal_hsk_vocab(traditional="你好", traditionalStatus="generated"),
        "vocabulary",
    )
    _assert_has_error(errs, "must be 'authored' or 'verified'", "hsk_trad_generated")


def test_hsk_vocab_missing_hsk_required_fields():
    """HSK record missing hsk object fields."""
    errs = validate_single(_minimal_hsk_vocab(hsk={}), "vocabulary")
    _assert_has_error(errs, "missing required field 'standardVersion'", "hsk_missing_sv")
    _assert_has_error(errs, "missing required field 'introducedAtLevel'", "hsk_missing_level")
    _assert_has_error(errs, "missing required field 'sourceLevelLabel'", "hsk_missing_label")


def test_hsk_duplicate_id_detection():
    """Duplicate vocabulary IDs are detected with first/current position."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="dup-id"),
            _minimal_hsk_vocab(id="unique-id"),
            _minimal_hsk_vocab(id="dup-id"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate vocabulary id 'dup-id'", "hsk_dup_id")
    _assert_has_error(errs, "first occurrence at root.vocabulary[0]", "hsk_dup_id_first")
    _assert_has_error(errs, "root.vocabulary[2]: duplicate", "hsk_dup_id_current")


def test_hsk_duplicate_identity_detection():
    """Duplicate HSK normalized identity within same standardVersion fails."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified="你 好", pinyin="Nǐ Hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate HSK identity", "hsk_dup_identity")
    _assert_has_error(errs, "root.vocabulary[0]", "hsk_dup_id_first")
    _assert_has_error(errs, "root.vocabulary[1]", "hsk_dup_id_current")


def test_hsk_duplicate_identity_different_version_allowed():
    """Same normalized identity under different standard versions is allowed."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-legacy-6-level", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    hsk_dup = [e for e in errs if "duplicate HSK identity" in e]
    assert hsk_dup == [], f"Expected no duplicate HSK identity errors, got {hsk_dup}"


def test_hsk_duplicate_identity_deterministic_order():
    """Duplicate identity errors appear in deterministic collection order."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified="我们", pinyin="wǒ men",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a3", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a4", simplified="我们", pinyin="wǒ men",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate HSK identity" in e]
    assert len(dup_errors) == 2, f"Expected 2 duplicate identity errors, got {len(dup_errors)}: {dup_errors}"
    assert "root.vocabulary[2]" in dup_errors[0], (
        f"Expected dup_errors[0] to be at [2], got: {dup_errors[0]}"
    )
    assert "root.vocabulary[3]" in dup_errors[1], (
        f"Expected dup_errors[1] to be at [3], got: {dup_errors[1]}"
    )


def test_hsk_nul_delimiter_no_false_positive():
    """NUL-delimiter concatenation must not cause false duplicate identity.

    Two different identities that would collide under the old
    f\"{norm_s}\\x00{norm_p}\" delimiter scheme must NOT collide when using
    Python tuples as the identity key.
    """
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="a", pinyin="bc",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified="ab", pinyin="c",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    hsk_dup = [e for e in errs if "duplicate HSK identity" in e]
    assert hsk_dup == [], f"Expected no false positive collision, got {hsk_dup}"


def test_hsk_legacy_backward_compatible():
    """Existing non-HSK vocabulary fixtures pass unchanged."""
    errs = validate_single(_minimal_vocab(), "vocabulary")
    _assert_no_errors(errs, "hsk_legacy_backward")


def test_hsk_legacy_generated_not_production():
    """Existing non-HSK generated-not-production test still works."""
    errs = validate_single(
        _minimal_vocab(traditionalStatus="generated", reviewStatus="published"),
        "vocabulary",
    )
    _assert_has_error(errs, "generated-only", "hsk_legacy_generated_prod")


def test_hsk_vocab_bundle_valid():
    """Valid bundle with mixed HSK and non-HSK vocabulary passes."""
    data = {
        "vocabulary": [
            _minimal_vocab(),  # non-HSK
            _minimal_hsk_vocab(),  # HSK
        ]
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "hsk_bundle_valid")


def test_hsk_vocab_bundle_duplicate_id():
    """Duplicate vocabulary id across HSK/non-HSK boundary detected."""
    data = {
        "vocabulary": [
            _minimal_vocab(id="shared-id"),
            _minimal_hsk_vocab(id="shared-id"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate vocabulary id 'shared-id'", "hsk_bundle_dup_id")


def test_hsk_vocab_null_hsk_rejected():
    """hsk: null must be rejected explicitly without leaking non-HSK field errors."""
    errs = validate_single(_minimal_hsk_vocab(hsk=None), "vocabulary")
    _assert_has_error(errs, "must be a JSON object when present, got null", "hsk_null_rejected")
    # Must NOT leak non-HSK required-field errors (traditional, kana, category)
    # since the record declared HSK intent but failed the hsk type check first.
    assert not any("traditional" in e and "required" in e for e in errs), (
        f"hsk:null should not trigger non-HSK traditional-required, got {errs}"
    )
    assert not any("kana" in e for e in errs), (
        f"hsk:null should not trigger non-HSK kana-required, got {errs}"
    )
    assert not any("category" in e for e in errs), (
        f"hsk:null should not trigger non-HSK category-required, got {errs}"
    )


def test_hsk_vocab_empty_source_type_fails():
    """HSK source.type must be a non-empty string."""
    for src in ({"type": ""}, {"type": "   "}, {}):
        errs = validate_single(_minimal_hsk_vocab(source=src), "vocabulary")
        _assert_has_error(errs, "source.type must be a non-empty string", f"hsk_source_type_{src!r}")


def test_hsk_vocab_source_note_non_string_fails():
    """HSK source.note must be a string when present."""
    for val in (123, True, []):
        errs = validate_single(
            _minimal_hsk_vocab(source={"type": "hsk-workbook", "note": val}),
            "vocabulary",
        )
        _assert_has_error(errs, "source.note must be a string", f"hsk_source_note_{type(val).__name__}")


def test_hsk_vocab_traditional_empty_string_fails():
    """HSK traditional empty or whitespace-only must be rejected."""
    for val in ("", "  "):
        errs = validate_single(
            _minimal_hsk_vocab(traditional=val, traditionalStatus="authored"),
            "vocabulary",
        )
        _assert_has_error(errs, "non-empty string for HSK record", f"hsk_trad_empty_{val!r}")


def test_hsk_vocab_examples_invalid_script_status():
    """Vocabulary examples with invalid script status must fail."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "traditionalStatus": "invalid",
                                       "pinyin": "nǐ hǎo", "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "not a valid status", "hsk_examples_bad_status")


def test_hsk_vocab_examples_missing_traditional_status():
    """Vocabulary examples missing traditionalStatus must fail."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "pinyin": "nǐ hǎo",
                                       "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "traditionalStatus' is required", "hsk_examples_missing_ts")


def test_hsk_vocab_examples_simplified_without_status_fails():
    """Examples with simplified present but missing simplifiedStatus must fail."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "traditionalStatus": "authored",
                                       "simplified": "你好", "pinyin": "nǐ hǎo",
                                       "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "simplifiedStatus' is required", "hsk_examples_missing_ss")


def test_hsk_vocab_examples_simplified_status_unavailable_fails():
    """Examples with simplified text and simplifiedStatus=unavailable must fail."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "traditionalStatus": "authored",
                                       "simplified": "你好", "simplifiedStatus": "unavailable",
                                       "pinyin": "nǐ hǎo", "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "cannot be 'unavailable'", "hsk_examples_ss_unavailable")


def test_hsk_vocab_unknown_hsk_field_rejected():
    """hsk object must reject unknown nested fields."""
    errs = validate_single(
        _minimal_hsk_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                 "sourceLevelLabel": "L1", "unknownField": "x"}),
        "vocabulary",
    )
    _assert_has_error(errs, "unknown field", "hsk_unknown_field")


def test_hsk_vocab_examples_traditional_unavailable_rejected():
    """Examples with traditionalStatus unavailable must be rejected."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "traditionalStatus": "unavailable",
                                       "pinyin": "nǐ hǎo", "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "not a valid status", "hsk_examples_trad_unavailable")


def test_hsk_vocab_examples_simplified_status_null_rejected():
    """Examples with explicit simplifiedStatus null when simplified absent must be rejected."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "traditionalStatus": "authored",
                                       "simplifiedStatus": None,
                                       "pinyin": "nǐ hǎo", "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "must be a string, got NoneType", "hsk_examples_ss_null")


def test_non_hsk_source_non_dict_rejected():
    """Non-HSK vocabulary source must be an object, not a string."""
    errs = validate_single(
        _minimal_vocab(source="not-an-object"),
        "vocabulary",
    )
    _assert_has_error(errs, "must be a JSON object, got str", "non_hsk_source_string")


def test_hsk_vocab_source_note_null_rejected():
    """source.note: null must be rejected when note key is present."""
    errs = validate_single(
        _minimal_hsk_vocab(source={"type": "hsk-workbook", "note": None}),
        "vocabulary",
    )
    _assert_has_error(errs, "source.note must be a string when present", "hsk_source_note_null")


def test_vocab_examples_full_valid():
    """Valid vocabulary examples with both script forms pass."""
    errs = validate_single(
        _minimal_vocab(examples=[{"traditional": "你好", "traditionalStatus": "authored",
                                   "simplified": "你好", "simplifiedStatus": "verified",
                                   "pinyin": "nǐ hǎo", "japanese": "こんにちは"}]),
        "vocabulary",
    )
    _assert_no_errors(errs, "vocab_examples_full_valid")


def test_vocab_examples_non_dict_rejected():
    """Non-dict example elements must be rejected."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=["not-an-object", {"traditional": "你好", "traditionalStatus": "authored",
                                                         "pinyin": "nǐ hǎo", "japanese": "テスト"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "expected a JSON object for vocabulary example", "vocab_examples_non_dict")


def test_vocab_examples_missing_pinyin_japanese():
    """Examples missing pinyin or japanese must be rejected."""
    errs = validate_single(
        _minimal_hsk_vocab(examples=[{"traditional": "你好", "traditionalStatus": "authored"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "missing required field 'pinyin' for vocabulary example", "vocab_examples_no_pinyin")
    _assert_has_error(errs, "missing required field 'japanese' for vocabulary example", "vocab_examples_no_japanese")




def test_hsk_vocab_examples_generated_reviewed_fails():
    """Examples with generated simplifiedStatus when parent reviewStatus is reviewed must fail."""
    errs = validate_single(
        _minimal_hsk_vocab(
            reviewStatus="reviewed",
            examples=[{"traditional": "\u4f60\u597d", "traditionalStatus": "authored",
                       "simplified": "\u4f60\u597d", "simplifiedStatus": "generated",
                       "pinyin": "n\u01d0 h\u01ceo", "japanese": "\u30c6\u30b9\u30c8"}],
        ),
        "vocabulary",
    )
    _assert_has_error(errs, "reviewStatus' is 'reviewed'", "hsk_examples_gen_reviewed")


def test_hsk_vocab_examples_generated_published_fails():
    """Examples with generated traditionalStatus when parent reviewStatus is published must fail."""
    errs = validate_single(
        _minimal_hsk_vocab(
            reviewStatus="published",
            examples=[{"traditional": "\u4f60\u597d", "traditionalStatus": "generated",
                       "simplified": "\u4f60\u597d", "simplifiedStatus": "authored",
                       "pinyin": "n\u01d0 h\u01ceo", "japanese": "\u30c6\u30b9\u30c8"}],
        ),
        "vocabulary",
    )
    _assert_has_error(errs, "reviewStatus' is 'published'", "hsk_examples_gen_published")


def test_hsk_vocab_examples_generated_draft_ok():
    """Examples with generated traditionalStatus when parent is draft may pass."""
    errs = validate_single(
        _minimal_hsk_vocab(
            reviewStatus="draft",
            examples=[{"traditional": "\u4f60\u597d", "traditionalStatus": "generated",
                       "simplified": "\u4f60\u597d", "simplifiedStatus": "authored",
                       "pinyin": "n\u01d0 h\u01ceo", "japanese": "\u30c6\u30b9\u30c8"}],
        ),
        "vocabulary",
    )
    gen_errors = [e for e in errs if 'generated' in e]
    assert len(gen_errors) == 0, f"Expected no generated errors for draft, got {gen_errors}"


def test_vocab_examples_empty_array_ok():
    """Empty examples array should not crash or produce errors."""
    errs = validate_single(_minimal_vocab(examples=[]), "vocabulary")
    _assert_no_errors(errs, "vocab_examples_empty")



def test_hsk_vocab_traditional_null_fails():
    """HSK record with traditional=null must be rejected."""
    errs = validate_single(
        _minimal_hsk_vocab(traditional=None, traditionalStatus="authored"),
        "vocabulary",
    )
    _assert_has_error(errs, "cannot be null", "hsk_trad_null")


def test_hsk_vocab_traditional_status_null_fails():
    """HSK record with traditionalStatus=null must be rejected."""
    errs = validate_single(
        _minimal_hsk_vocab(traditional="\u4f60\u597d", traditionalStatus=None),
        "vocabulary",
    )
    _assert_has_error(errs, "cannot be null", "hsk_trad_status_null")


def test_hsk_vocab_traditional_absent_no_error():
    """HSK record without traditional key passes."""
    errs = validate_single(
        _minimal_hsk_vocab(),
        "vocabulary",
    )
    _assert_no_errors(errs, "hsk_trad_absent")


def test_hsk_vocab_traditional_status_unavailable_ok():
    """HSK record with traditionalStatus=unavailable and no traditional passes."""
    errs = validate_single(
        _minimal_hsk_vocab(traditionalStatus="unavailable"),
        "vocabulary",
    )
    _assert_no_errors(errs, "hsk_trad_status_unavail")


# ─── HSK normalization edge cases ────────────────────────────────────────

def test_hsk_normalization_nfkc_composed():
    """NFKC composed vs decomposed forms must be treated as duplicates."""
    # U+00E9 (é) vs U+0065 U+0301 (e + combining acute)
    composed = "é"
    decomposed = "é"
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified=composed, pinyin=composed,
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified=decomposed, pinyin=decomposed,
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate HSK identity", "hsk_norm_nfkc")


def test_hsk_normalization_fullwidth_space():
    """Fullwidth spaces in simplified must be removed for identity matching."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
            # Ideographic space (U+3000) between characters
            _minimal_hsk_vocab(id="a2", simplified="你　好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate HSK identity", "hsk_norm_fullwidth_space")


def test_hsk_normalization_tone_mark_distinct():
    """Different tone marks must NOT match as identity duplicates."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="妈", pinyin="mā",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified="麻", pinyin="má",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate HSK identity" in e]
    assert dup_errors == [], f"Tone-distinct pinyin must not match, got {dup_errors}"


def test_hsk_normalization_case_folded_pinyin():
    """Pinyin case folding: uppercase must match lowercase for identity."""
    data = {
        "vocabulary": [
            _minimal_hsk_vocab(id="a1", simplified="你好", pinyin="Nǐ Hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
            _minimal_hsk_vocab(id="a2", simplified="你好", pinyin="nǐ hǎo",
                               hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1,
                                    "sourceLevelLabel": "L1"}),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate HSK identity", "hsk_norm_case_fold")


# ─── HSK vocabulary boundary tests ───────────────────────────────────────

def test_hsk_vocab_simplified_empty_string_fails():
    """HSK simplified must be non-empty string."""
    errs = validate_single(_minimal_hsk_vocab(simplified=""), "vocabulary")
    _assert_has_error(errs, "non-empty", "hsk_simplified_empty")


def test_hsk_vocab_simplified_status_unavailable_fails():
    """HSK simplifiedStatus=unavailable is never valid (must be authored or verified)."""
    errs = validate_single(_minimal_hsk_vocab(simplifiedStatus="unavailable"), "vocabulary")
    _assert_has_error(errs, "must be 'authored' or 'verified'", "hsk_ss_unavailable")


def test_hsk_vocab_traditional_present_status_unavailable_fails():
    """HSK record with traditional text present but status=unavailable is contradictory."""
    errs = validate_single(
        _minimal_hsk_vocab(
            traditional="你好",
            traditionalStatus="unavailable",
        ),
        "vocabulary",
    )
    _assert_has_error(errs, "must be 'authored' or 'verified'", "hsk_trad_unavailable_contradiction")


def test_hsk_vocab_kana_non_string_fails():
    """HSK kana must be string if present."""
    errs = validate_single(_minimal_hsk_vocab(kana=123), "vocabulary")
    _assert_has_error(errs, "kana must be a string", "hsk_kana_non_string")


def test_hsk_vocab_category_non_string_fails():
    """HSK category must be string if present."""
    errs = validate_single(_minimal_hsk_vocab(category=True), "vocabulary")
    _assert_has_error(errs, "category must be a string", "hsk_category_non_string")


def test_hsk_vocab_source_non_dict_fails():
    """HSK source must be a dict object (not string/int/list)."""
    errs = validate_single(_minimal_hsk_vocab(source="string-instead-of-dict"), "vocabulary")
    _assert_has_error(errs, "source must be dict", "hsk_source_non_dict")


def test_hsk_vocab_id_empty_string_fails():
    """HSK id must be a non-empty string."""
    errs = validate_single(_minimal_hsk_vocab(id=""), "vocabulary")
    _assert_has_error(errs, "non-empty", "hsk_id_empty")


def test_hsk_vocab_pinyin_empty_string_fails():
    """HSK pinyin must be a non-empty string."""
    errs = validate_single(_minimal_hsk_vocab(pinyin=""), "vocabulary")
    _assert_has_error(errs, "non-empty", "hsk_pinyin_empty")


def test_hsk_vocab_japanese_empty_string_fails():
    """HSK japanese must be a non-empty string."""
    errs = validate_single(_minimal_hsk_vocab(japanese=""), "vocabulary")
    _assert_has_error(errs, "non-empty", "hsk_japanese_empty")


def test_hsk_vocab_simplified_whitespace_only_fails():
    """HSK simplified must not be whitespace-only string."""
    errs = validate_single(_minimal_hsk_vocab(simplified="   "), "vocabulary")
    _assert_has_error(errs, "non-empty", "hsk_simplified_whitespace")


def test_hsk_vocab_legacy_traditional_without_simplified_fails():
    """Non-HSK record without traditional fails (still Traditional-first required)."""
    errs = validate_single(
        {"id": "legacy-no-trad", "pinyin": "x", "japanese": "x",
         "reviewStatus": "draft"},
        "vocabulary",
    )
    _assert_has_error(errs, "required field 'traditional'", "hsk_legacy_no_traditional")


# ─── Teacher vocabulary tests ──────────────────────────────────────────────

def _minimal_teacher_vocab(**overrides):
    data = {
        "id": "teacher-voc-001",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "teacher-workbook"},
        "reviewStatus": "draft",
        "curriculum": {
            "sourceId": "teacher-core-v1",
            "difficultyBand": "star-1",
            "sourceDifficultyLabel": "☆",
            "partOfSpeech": "noun",
            "sourceSheet": "Sheet1",
            "sourceRow": 1,
        },
    }
    data.update(overrides)
    return data


def _minimal_teacher_illustration(**overrides):
    data = {
        "id": "ill-001",
        "vocabularyId": "teacher-voc-001",
        "assetPath": "/assets/vocabulary/teacher-core-v1/hello.webp",
        "sourceChecksumSha256": "abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd",
        # 64 chars: abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab
        "width": 512,
        "height": 512,
        "mimeType": "image/webp",
        "fileSizeBytes": 102400,
        "altJa": "你好のイラスト",
        "rights": {
            "basis": "commissioned-for-chabiko",
            "publicWebDisplay": True,
            "staticAssetRedistribution": True,
            "modificationScope": "technical-only",
            "attributionRequired": False,
            "reuseOutsideChabiko": "not-granted",
        },
        "reviewStatus": "draft",
    }
    data.update(overrides)
    return data


def test_teacher_vocab_valid():
    """Minimal valid teacher curriculum record."""
    errs = validate_single(_minimal_teacher_vocab(), "vocabulary")
    _assert_no_errors(errs, "teacher_vocab_valid")


def test_teacher_vocab_with_traditional_valid():
    """Teacher record with reviewed traditional form passes."""
    errs = validate_single(
        _minimal_teacher_vocab(traditional="你好", traditionalStatus="authored"),
        "vocabulary",
    )
    _assert_no_errors(errs, "teacher_vocab_with_traditional")


def test_teacher_vocab_traditional_absent_ok():
    """Teacher record without traditional passes when traditionalStatus is absent or unavailable."""
    errs = validate_single(_minimal_teacher_vocab(), "vocabulary")
    _assert_no_errors(errs, "teacher_trad_absent")


def test_teacher_vocab_missing_simplified_fails():
    """Teacher record without simplified fails."""
    errs = validate_single(_minimal_teacher_vocab(simplified=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "teacher_missing_simplified")


def test_teacher_vocab_missing_pinyin_fails():
    """Teacher record without pinyin fails."""
    errs = validate_single(_minimal_teacher_vocab(pinyin=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "teacher_missing_pinyin")


def test_teacher_vocab_missing_japanese_fails():
    """Teacher record without japanese fails."""
    errs = validate_single(_minimal_teacher_vocab(japanese=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "teacher_missing_japanese")


def test_teacher_vocab_missing_source_fails():
    """Teacher record without source fails."""
    errs = validate_single(_minimal_teacher_vocab(source=None), "vocabulary")
    _assert_has_error(errs, "missing required field", "teacher_missing_source")


def test_teacher_vocab_generated_simplified_fails():
    """Teacher simplifiedStatus must be authored or verified, not generated."""
    errs = validate_single(_minimal_teacher_vocab(simplifiedStatus="generated"), "vocabulary")
    _assert_has_error(errs, "must be 'authored' or 'verified'", "teacher_generated")


def test_teacher_vocab_missing_curriculum_fails():
    """Teacher record without curriculum fails."""
    errs = validate_single(_minimal_teacher_vocab(curriculum=None), "vocabulary")
    _assert_has_error(errs, "required field", "teacher_missing_curriculum")


def test_teacher_vocab_invalid_curriculum_source_id():
    """Invalid curriculum.sourceId fails."""
    errs = validate_single(
        _minimal_teacher_vocab(curriculum={**{"sourceId": "wrong", "difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "noun", "sourceSheet": "S", "sourceRow": 1}}),
        "vocabulary",
    )
    _assert_has_error(errs, "not valid", "teacher_bad_source_id")


def test_teacher_vocab_invalid_difficulty_band():
    """Invalid difficultyBand fails."""
    errs = validate_single(
        _minimal_teacher_vocab(curriculum={**{"sourceId": "teacher-core-v1", "difficultyBand": "star-3", "sourceDifficultyLabel": "☆", "partOfSpeech": "noun", "sourceSheet": "S", "sourceRow": 1}}),
        "vocabulary",
    )
    _assert_has_error(errs, "not valid", "teacher_bad_band")


def test_teacher_vocab_invalid_difficulty_label():
    """Invalid sourceDifficultyLabel fails."""
    errs = validate_single(
        _minimal_teacher_vocab(curriculum={**{"sourceId": "teacher-core-v1", "difficultyBand": "star-1", "sourceDifficultyLabel": "☆☆☆", "partOfSpeech": "noun", "sourceSheet": "S", "sourceRow": 1}}),
        "vocabulary",
    )
    _assert_has_error(errs, "not valid", "teacher_bad_label")


def test_teacher_vocab_invalid_part_of_speech():
    """Invalid partOfSpeech fails."""
    errs = validate_single(
        _minimal_teacher_vocab(curriculum={**{"sourceId": "teacher-core-v1", "difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "preposition", "sourceSheet": "S", "sourceRow": 1}}),
        "vocabulary",
    )
    _assert_has_error(errs, "not valid", "teacher_bad_pos")


def test_teacher_vocab_curriculum_unknown_field():
    """Curriculum object with unknown fields fails."""
    errs = validate_single(
        _minimal_teacher_vocab(curriculum={**{"sourceId": "teacher-core-v1", "difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "noun", "sourceSheet": "S", "sourceRow": 1, "unknownField": "x"}}),
        "vocabulary",
    )
    _assert_has_error(errs, "unknown field", "teacher_curriculum_unknown")


def test_teacher_vocab_kana_optional():
    """kana is optional for teacher records."""
    errs = validate_single(_minimal_teacher_vocab(kana="カタカナ"), "vocabulary")
    _assert_no_errors(errs, "teacher_kana_present")
    errs2 = validate_single(_minimal_teacher_vocab(), "vocabulary")
    _assert_no_errors(errs2, "teacher_kana_absent")


def test_teacher_vocab_category_optional():
    """category is optional for teacher records."""
    errs = validate_single(_minimal_teacher_vocab(category="greeting"), "vocabulary")
    _assert_no_errors(errs, "teacher_category_present")
    errs2 = validate_single(_minimal_teacher_vocab(), "vocabulary")
    _assert_no_errors(errs2, "teacher_category_absent")


def test_teacher_vocab_illustration_ref_present():
    """Teacher record with non-empty illustrationRef passes."""
    errs = validate_single(_minimal_teacher_vocab(illustrationRef="ill-001"), "vocabulary")
    _assert_no_errors(errs, "teacher_illustration_ref")


def test_teacher_vocab_source_type_valid():
    """Teacher source type must be teacher-workbook."""
    errs = validate_single(
        _minimal_teacher_vocab(source={"type": "teacher-workbook"}),
        "vocabulary",
    )
    _assert_no_errors(errs, "teacher_source_type_ok")
    errs2 = validate_single(
        _minimal_teacher_vocab(source={"type": "hsk-workbook"}),
        "vocabulary",
    )
    _assert_has_error(errs2, "must be 'teacher-workbook'", "teacher_source_type_bad")


def test_teacher_vocab_source_note_valid():
    """Teacher source with note passes."""
    errs = validate_single(
        _minimal_teacher_vocab(source={"type": "teacher-workbook", "note": "test note"}),
        "vocabulary",
    )
    _assert_no_errors(errs, "teacher_source_note")


def test_teacher_vocab_bundle_valid():
    """Valid bundle with mixed teacher and HSK vocabulary passes."""
    data = {
        "vocabulary": [
            _minimal_vocab(),
            _minimal_hsk_vocab(),
            _minimal_teacher_vocab(),
        ]
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "teacher_bundle_valid")


def test_teacher_duplicate_identity_detection():
    """Duplicate teacher identity within same sourceId fails."""
    data = {
        "vocabulary": [
            _minimal_teacher_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo"),
            _minimal_teacher_vocab(id="a2", simplified="你 好", pinyin="Nǐ Hǎo"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate teacher identity", "teacher_dup_identity")


def test_teacher_duplicate_identity_deterministic_order():
    """Duplicate teacher identity errors appear in deterministic order."""
    data = {
        "vocabulary": [
            _minimal_teacher_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo"),
            _minimal_teacher_vocab(id="a2", simplified="我们", pinyin="wǒ men"),
            _minimal_teacher_vocab(id="a3", simplified="你好", pinyin="nǐ hǎo"),
            _minimal_teacher_vocab(id="a4", simplified="我们", pinyin="wǒ men"),
        ]
    }
    errs = validate_bundle(data)
    dup_errors = [e for e in errs if "duplicate teacher identity" in e]
    assert len(dup_errors) == 2, f"Expected 2 duplicate identity errors, got {len(dup_errors)}: {dup_errors}"
    assert "root.vocabulary[2]" in dup_errors[0], f"Expected dup_errors[0] at [2], got: {dup_errors[0]}"
    assert "root.vocabulary[3]" in dup_errors[1], f"Expected dup_errors[1] at [3], got: {dup_errors[1]}"


def test_teacher_duplicate_identity_bundle():
    """Duplicate teacher identity across teacher_vocabulary collection fails."""
    data = {
        "teacher_vocabulary": [
            _minimal_teacher_vocab(id="a1", simplified="你好", pinyin="nǐ hǎo"),
            _minimal_teacher_vocab(id="a2", simplified="你好", pinyin="nǐ hǎo"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate teacher identity", "teacher_dup_bundle")


def test_teacher_vocab_legacy_hsk_backward_compatible():
    """Existing non-HSK and HSK vocabulary still passes."""
    errs = validate_single(_minimal_vocab(), "vocabulary")
    _assert_no_errors(errs, "teacher_legacy_backward")
    errs2 = validate_single(_minimal_hsk_vocab(), "vocabulary")
    _assert_no_errors(errs2, "teacher_hsk_backward")


def test_teacher_vocab_null_curriculum_rejected():
    """curriculum: null must be rejected (not treated as teacher record)."""
    errs = validate_single(_minimal_teacher_vocab(curriculum=None), "vocabulary")
    _assert_has_error(errs, "required field", "teacher_curriculum_null")


def test_teacher_vocab_source_note_absent_ok():
    """source without note key should pass for teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(source={"type": "teacher-workbook"}),
        "vocabulary",
    )
    _assert_no_errors(errs, "teacher_source_no_note")


def test_teacher_vocab_similarity_type_rejected():
    """similarityType must not be allowed in teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(similarityType="none"),
        "vocabulary",
    )
    _assert_has_error(errs, "not allowed", "teacher_similarity_rejected")


def test_teacher_vocab_tone_note_rejected():
    """toneNote must not be allowed in teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(toneNote="first tone"),
        "vocabulary",
    )
    _assert_has_error(errs, "not allowed", "teacher_tone_note_rejected")


def test_teacher_vocab_caution_rejected():
    """caution must not be allowed in teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(caution="be careful"),
        "vocabulary",
    )
    _assert_has_error(errs, "not allowed", "teacher_caution_rejected")


def test_teacher_vocab_travel_scenario_rejected():
    """travelScenario must not be allowed in teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(travelScenario="food"),
        "vocabulary",
    )
    _assert_has_error(errs, "not allowed", "teacher_travel_scenario_rejected")


def test_teacher_vocab_pain_point_tags_rejected():
    """painPointTags must not be allowed in teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(painPointTags=["tone"]),
        "vocabulary",
    )
    _assert_has_error(errs, "not allowed", "teacher_pain_tags_rejected")


def test_teacher_vocab_examples_rejected():
    """examples must not be allowed in teacher curriculum record."""
    errs = validate_single(
        _minimal_teacher_vocab(examples=[{"traditional": "你好", "traditionalStatus": "authored", "pinyin": "nǐ hǎo", "japanese": "こんにちは"}]),
        "vocabulary",
    )
    _assert_has_error(errs, "not allowed", "teacher_examples_rejected")


# ─── Gap 1: Teacher/HSK exclusivity tests ─────────────────────────────

def test_teacher_vocab_hsk_both_keys():
    """Teacher record with both curriculum and hsk must reject hsk."""
    errs = validate_single(
        _minimal_teacher_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "HSK 1"}),
        "vocabulary",
    )
    _assert_has_error(errs, "must not contain 'hsk'", "teacher_hsk_both")


def test_teacher_vocab_hsk_both_null():
    """Teacher record with curriculum and hsk:null must reject both the conflict and the null hsk."""
    errs = validate_single(
        _minimal_teacher_vocab(hsk=None),
        "vocabulary",
    )
    _assert_has_error(errs, "must not contain 'hsk'", "teacher_hsk_both_null")
    _assert_has_error(errs, "must be a JSON object when present, got null", "teacher_hsk_null_msg")


def test_teacher_vocab_hsk_non_branching():
    """Teacher record with both curriculum and hsk must report teacher errors, not silently dispatch as HSK."""
    errs = validate_single(
        _minimal_teacher_vocab(hsk={"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "HSK 1"}),
        "vocabulary",
    )
    # Must NOT produce HSK-specific errors like "missing required field 'simplified' for HSK record"
    hsk_field_errors = [e for e in errs if "for HSK record" in e]
    assert len(hsk_field_errors) == 0, (
        f"Teacher+HSK record must not dispatch as HSK, got HSK errors: {hsk_field_errors}"
    )


def test_teacher_vocab_curriculum_null_hsk_object():
    """curriculum:null with valid hsk object must report subtype conflict, not dispatch as HSK."""
    record = {"id": "test", "simplified": "好", "simplifiedStatus": "authored",
              "pinyin": "hǎo", "japanese": "よい", "source": {"type": "teacher-workbook"},
              "reviewStatus": "draft", "curriculum": None,
              "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "HSK 1"}}
    errs = validate_single(record, "vocabulary")
    _assert_has_error(errs, "must not contain 'hsk'", "curr_null_hsk_obj_conflict")
    # Must not silently dispatch as HSK
    hsk_field_errors = [e for e in errs if "for HSK record" in e]
    assert len(hsk_field_errors) == 0, (
        f"curriculum:null + hsk must not dispatch as HSK, got HSK errors: {hsk_field_errors}"
    )


def test_teacher_vocab_curriculum_null_hsk_null():
    """curriculum:null with hsk:null must report subtype conflict and both null errors."""
    record = {"id": "test", "simplified": "好", "simplifiedStatus": "authored",
              "pinyin": "hǎo", "japanese": "よい", "source": {"type": "teacher-workbook"},
              "reviewStatus": "draft", "curriculum": None,
              "hsk": None}
    errs = validate_single(record, "vocabulary")
    _assert_has_error(errs, "must not contain 'hsk'", "curr_null_hsk_null_conflict")
    _assert_has_error(errs, "must be a JSON object when present, got null", "curr_null_hsk_null_msg")


def test_teacher_vocab_bad_curriculum_bad_hsk():
    """Non-object curriculum and non-object hsk must not crash and must report both conflict and type errors."""
    record = {"id": "test", "simplified": "好", "simplifiedStatus": "authored",
              "pinyin": "hǎo", "japanese": "よい", "source": {"type": "teacher-workbook"},
              "reviewStatus": "draft", "curriculum": "string-curriculum",
              "hsk": [1, 2, 3]}
    errs = validate_single(record, "vocabulary")
    _assert_has_error(errs, "must not contain 'hsk'", "bad_curr_bad_hsk_conflict")
    _assert_has_error(errs, "curriculum must be a JSON object", "bad_curr_type")
    _assert_has_error(errs, "must be a JSON object when present, got list", "bad_hsk_type")


# ─── Gap 2: Forbidden teacher field null tests ─────────────────────────

def test_teacher_vocab_similarity_type_null():
    """similarityType present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(similarityType=None), "vocabulary")
    _assert_has_error(errs, "not allowed", "teacher_similarity_null")


def test_teacher_vocab_tone_note_null():
    """toneNote present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(toneNote=None), "vocabulary")
    _assert_has_error(errs, "not allowed", "teacher_tone_note_null")


def test_teacher_vocab_caution_null():
    """caution present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(caution=None), "vocabulary")
    _assert_has_error(errs, "not allowed", "teacher_caution_null")


def test_teacher_vocab_travel_scenario_null():
    """travelScenario present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(travelScenario=None), "vocabulary")
    _assert_has_error(errs, "not allowed", "teacher_travel_scenario_null")


def test_teacher_vocab_pain_point_tags_null():
    """painPointTags present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(painPointTags=None), "vocabulary")
    _assert_has_error(errs, "not allowed", "teacher_pain_tags_null")


def test_teacher_vocab_examples_null():
    """examples present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(examples=None), "vocabulary")
    _assert_has_error(errs, "not allowed", "teacher_examples_null")


def test_teacher_vocab_illustration_ref_null():
    """illustrationRef present with null is rejected."""
    errs = validate_single(_minimal_teacher_vocab(illustrationRef=None), "vocabulary")
    _assert_has_error(errs, "non-empty string when present, got null", "teacher_illref_null")


# ─── Illustration tests ──────────────────────────────────────────────────

def test_illustration_valid():
    """Minimal valid illustration."""
    errs = validate_single(_minimal_teacher_illustration(), "illustration")
    _assert_no_errors(errs, "illustration_valid")


def test_illustration_missing_required():
    """Illustration missing required fields fails."""
    errs = validate_single({"id": "ill-001"}, "illustration")
    _assert_has_error(errs, "required field", "illustration_missing")


def test_illustration_unknown_field():
    """Illustration with unknown field fails."""
    errs = validate_single(
        _minimal_teacher_illustration(randomField="x"),
        "illustration",
    )
    _assert_has_error(errs, "unknown field", "illustration_unknown")


def test_illustration_invalid_checksum_length():
    """Checksum must be exactly 64 chars."""
    errs = validate_single(
        _minimal_teacher_illustration(sourceChecksumSha256="abc123"),
        "illustration",
    )
    _assert_has_error(errs, "exactly 64", "ill_checksum_len")


def test_illustration_invalid_checksum_chars():
    """Checksum must be lowercase hex."""
    errs = validate_single(
        _minimal_teacher_illustration(sourceChecksumSha256="Z" + "a" * 63),
        "illustration",
    )
    _assert_has_error(errs, "lowercase hexadecimal", "ill_checksum_chars")


def test_illustration_valid_checksum():
    """Valid 64-char hex checksum passes."""
    errs = validate_single(
        _minimal_teacher_illustration(
            sourceChecksumSha256="abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd"
        ),
        "illustration",
    )
    _assert_no_errors(errs, "ill_checksum_valid")


def test_illustration_invalid_width():
    """Width 0 fails."""
    errs = validate_single(_minimal_teacher_illustration(width=0), "illustration")
    _assert_has_error(errs, "between 1 and 4096", "ill_width_zero")


def test_illustration_invalid_height():
    """Height 4097 fails."""
    errs = validate_single(_minimal_teacher_illustration(height=4097), "illustration")
    _assert_has_error(errs, "between 1 and 4096", "ill_height_over")


def test_illustration_width_boolean_fails():
    """Boolean width fails."""
    errs = validate_single(_minimal_teacher_illustration(width=True), "illustration")
    _assert_has_error(errs, "non-boolean integer", "ill_width_bool")


def test_illustration_file_size_over_limit():
    """fileSizeBytes over 1.5M fails."""
    errs = validate_single(_minimal_teacher_illustration(fileSizeBytes=1500001), "illustration")
    _assert_has_error(errs, "between 1 and 1500000", "ill_fsb_over")


def test_illustration_file_size_boolean_fails():
    """Boolean fileSizeBytes fails."""
    errs = validate_single(_minimal_teacher_illustration(fileSizeBytes=False), "illustration")
    _assert_has_error(errs, "non-boolean integer", "ill_fsb_bool")


def test_illustration_invalid_mime_type():
    """Invalid MIME type fails."""
    errs = validate_single(_minimal_teacher_illustration(mimeType="image/jpeg"), "illustration")
    _assert_has_error(errs, "not valid", "ill_mime")


def test_illustration_asset_path_prefix():
    """assetPath must start with correct prefix."""
    errs = validate_single(
        _minimal_teacher_illustration(assetPath="/assets/vocabulary/hsk/hello.webp"),
        "illustration",
    )
    _assert_has_error(errs, "must start with '/assets/vocabulary/teacher-core-v1/'", "ill_path_prefix")


def test_illustration_asset_path_extension_mismatch():
    """assetPath must have correct extension for MIME type."""
    errs = validate_single(
        _minimal_teacher_illustration(mimeType="image/png", assetPath="/assets/vocabulary/teacher-core-v1/hello.webp"),
        "illustration",
    )
    _assert_has_error(errs, "must end with '.png' for mimeType 'image/png'", "ill_path_ext")


def test_illustration_rights_basis_invalid():
    """Invalid rights.basis fails."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "basis": "unknown"}),
        "illustration",
    )
    _assert_has_error(errs, "must be 'commissioned-for-chabiko'", "ill_rights_basis")


def test_illustration_rights_public_web_display_false():
    """publicWebDisplay must be true."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "publicWebDisplay": False}),
        "illustration",
    )
    _assert_has_error(errs, "must be true", "ill_rights_pwd")


def test_illustration_rights_attribution_required_true_needs_text():
    """attributionText required when attributionRequired is true."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "attributionRequired": True}),
        "illustration",
    )
    _assert_has_error(errs, "attributionText is required", "ill_rights_attr_true")


def test_illustration_rights_attribution_not_required_no_text():
    """attributionText must be absent when attributionRequired is not true."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "attributionText": "someone"}),
        "illustration",
    )
    _assert_has_error(errs, "must be absent", "ill_rights_attr_false")


def test_illustration_rights_unknown_field():
    """Unknown rights field fails."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "unknownField": "x"}),
        "illustration",
    )
    _assert_has_error(errs, "unknown field", "ill_rights_unknown")


def test_illustration_rights_reuse_invalid():
    """Invalid reuseOutsideChabiko fails."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "reuseOutsideChabiko": "maybe"}),
        "illustration",
    )
    _assert_has_error(errs, "not valid", "ill_reuse")


# ─── Approved teacher-provided rights variant (Issue #193) ──────────────

_APPROVED_RIGHTS = {
    "status": "approved",
    "source": "teacher-provided",
    "note": "Approved via the canonical package rights record "
            "(data/teacher-vocabulary-preview/teacher-image-rights.json), "
            "product-owner attestation in issue-191 comment-5156051087.",
}


def test_illustration_rights_approved_valid():
    """Approved teacher-provided rights referencing the package record are valid."""
    errs = validate_single(
        _minimal_teacher_illustration(rights=dict(_APPROVED_RIGHTS)),
        "illustration",
    )
    _assert_no_errors(errs, "ill_rights_approved")


def test_illustration_rights_approved_missing_markers_fails():
    """Approved rights note must reference the package record and attestation."""
    errs = validate_single(
        _minimal_teacher_illustration(rights=dict(_APPROVED_RIGHTS, note="no reference")),
        "illustration",
    )
    _assert_has_error(errs, "teacher-image-rights.json", "ill_rights_approved_missing_pkg")
    _assert_has_error(errs, "issue-191", "ill_rights_approved_missing_issue")
    _assert_has_error(errs, "comment-5156051087", "ill_rights_approved_missing_comment")


def test_illustration_rights_approved_wrong_source_fails():
    """Approved rights must keep source teacher-provided."""
    errs = validate_single(
        _minimal_teacher_illustration(rights=dict(_APPROVED_RIGHTS, source="ai-generated")),
        "illustration",
    )
    _assert_has_error(errs, "must be 'teacher-provided'", "ill_rights_approved_src")


def test_illustration_rights_approved_unknown_field_fails():
    """Approved rights reject unknown fields."""
    errs = validate_single(
        _minimal_teacher_illustration(rights=dict(_APPROVED_RIGHTS, extra="x")),
        "illustration",
    )
    _assert_has_error(errs, "unknown field", "ill_rights_approved_unknown")


def test_illustration_rights_approved_rejects_relicensing_claim():
    """Approved teacher rights must not claim broader relicensing."""
    errs = validate_single(
        _minimal_teacher_illustration(
            rights=dict(_APPROVED_RIGHTS, basis="commissioned-for-chabiko", publicWebDisplay=True,
                        staticAssetRedistribution=True, modificationScope="technical-only",
                        attributionRequired=False, reuseOutsideChabiko="granted"),
        ),
        "illustration",
    )
    _assert_has_error(errs, "unknown field", "ill_rights_approved_relicense")


# ─── Committed package rights record (Issue #201 production learner use) ──

_COMMITTED_RIGHTS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "teacher-vocabulary-preview", "teacher-image-rights.json"
)


def test_teacher_image_rights_record_permits_production_learner_use():
    """The committed rights record must permit production learner use within Chabiko and cite comment 5157871811."""
    with open(_COMMITTED_RIGHTS_PATH, encoding="utf-8") as f:
        record = json.load(f)
    assert record["rightsStatus"] == "approved", "rightsStatus must be approved"
    permitted = set(record["permittedUses"])
    assert "production-learner-use-in-chabiko" in permitted, "production-learner-use-in-chabiko must be permitted"
    assert "public-by-link-review-test-deployment" in permitted, "review/test deployment must remain permitted"
    assert record["evidence"]["productionLearnerUseCommentId"] == 5157871811, (
        "evidence must cite issue-191 comment-5157871811"
    )
    assert record["productionLearnerUse"]["permitted"] is True
    assert record["productionLearnerUse"]["chabikoOnly"] is True
    assert record["productionLearnerUse"]["broaderRelicensingOrRedistribution"] is False
    assert record["broaderRelicensingGranted"] is False, "broader relicensing must remain not granted"


def test_teacher_image_rights_record_contradiction_fails():
    """A rights record that claims broader relicensing or denies production use must fail."""
    with open(_COMMITTED_RIGHTS_PATH, encoding="utf-8") as f:
        record = json.load(f)

    # Broader relicensing must stay False; claiming it is a contradiction.
    assert record["broaderRelicensingGranted"] is False, "broaderRelicensingGranted must stay False"
    assert record["productionLearnerUse"]["broaderRelicensingOrRedistribution"] is False, (
        "production-learner-use must not grant broader relicensing or redistribution"
    )

    # Every permitted use must belong to the known allowlist (no unrecorded expansion).
    known_uses = {
        "deterministic-derivative-generation",
        "tracking-derivatives-in-chabiko",
        "public-by-link-review-test-deployment",
        "production-learner-use-in-chabiko",
    }
    unexpected = set(record["permittedUses"]) - known_uses
    assert not unexpected, f"unexpected permitted uses: {sorted(unexpected)}"


# ─── Gap 3: Illustration non-empty string tests ────────────────────────

def test_illustration_id_empty_fails():
    """Illustration id must be non-empty."""
    errs = validate_single(_minimal_teacher_illustration(id=""), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_id_empty")


def test_illustration_id_whitespace_fails():
    """Illustration id must be non-whitespace."""
    errs = validate_single(_minimal_teacher_illustration(id="   "), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_id_whitespace")


def test_illustration_vocabulary_id_empty_fails():
    """Illustration vocabularyId must be non-empty."""
    errs = validate_single(_minimal_teacher_illustration(vocabularyId=""), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_vocab_id_empty")


def test_illustration_vocabulary_id_whitespace_fails():
    """Illustration vocabularyId must be non-whitespace."""
    errs = validate_single(_minimal_teacher_illustration(vocabularyId="   "), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_vocab_id_whitespace")


def test_illustration_asset_path_empty_fails():
    """Illustration assetPath must be non-empty."""
    errs = validate_single(_minimal_teacher_illustration(assetPath=""), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_path_empty")


def test_illustration_asset_path_whitespace_fails():
    """Illustration assetPath must be non-whitespace."""
    errs = validate_single(_minimal_teacher_illustration(assetPath="   "), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_path_whitespace")


def test_illustration_alt_ja_empty_fails():
    """Illustration altJa must be non-empty."""
    errs = validate_single(_minimal_teacher_illustration(altJa=""), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_alt_empty")


def test_illustration_alt_ja_whitespace_fails():
    """Illustration altJa must be non-whitespace."""
    errs = validate_single(_minimal_teacher_illustration(altJa="   "), "illustration")
    _assert_has_error(errs, "non-empty string", "ill_alt_whitespace")


# ─── Gap 4: Rights boundary tests ──────────────────────────────────────

def test_illustration_rights_attribution_required_null():
    """attributionRequired null is rejected."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "attributionRequired": None}),
        "illustration",
    )
    _assert_has_error(errs, "non-null boolean", "ill_attr_req_null")


def test_illustration_rights_attribution_text_null_not_required():
    """attributionText null when attribution is not required fails."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "attributionText": None}),
        "illustration",
    )
    _assert_has_error(errs, "must be absent", "ill_attr_text_null")


def test_illustration_rights_reuse_non_string_list():
    """reuseOutsideChabiko as a list must not crash validator."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "reuseOutsideChabiko": []}),
        "illustration",
    )
    _assert_has_error(errs, "must be a string", "ill_reuse_list")


def test_illustration_rights_reuse_non_string_object():
    """reuseOutsideChabiko as an object must not crash validator."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "reuseOutsideChabiko": {"key": "val"}}),
        "illustration",
    )
    _assert_has_error(errs, "must be a string", "ill_reuse_obj")


def test_illustration_rights_reuse_non_string_number():
    """reuseOutsideChabiko as a number must not crash validator."""
    errs = validate_single(
        _minimal_teacher_illustration(rights={**_minimal_teacher_illustration()["rights"], "reuseOutsideChabiko": 42}),
        "illustration",
    )
    _assert_has_error(errs, "must be a string", "ill_reuse_number")


def test_illustration_rights_attribution_text_null_when_required():
    """attributionText null when attributionRequired is true fails."""
    errs = validate_single(
        _minimal_teacher_illustration(
            rights={**_minimal_teacher_illustration()["rights"], "attributionRequired": True, "attributionText": None},
        ),
        "illustration",
    )
    _assert_has_error(errs, "non-empty string", "ill_attr_text_null_required")


def test_illustration_rights_attribution_text_empty_when_required():
    """attributionText empty when attributionRequired is true fails."""
    errs = validate_single(
        _minimal_teacher_illustration(
            rights={**_minimal_teacher_illustration()["rights"], "attributionRequired": True, "attributionText": ""},
        ),
        "illustration",
    )
    _assert_has_error(errs, "non-empty string", "ill_attr_text_empty_required")


# ─── Pending-rights draft illustration tests ────────────────────────────


def test_illustration_pending_rights_draft_valid():
    """Draft illustration with pending teacher-provided rights passes."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "source": "teacher-provided",
            "note": "Awaiting rights confirmation from teacher",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_no_errors(errs, "pending_rights_draft")


def test_illustration_pending_rights_empty_note_fails():
    """Pending rights with empty note fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "source": "teacher-provided",
            "note": "",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "non-empty string", "pending_rights_empty_note")


def test_illustration_pending_rights_unknown_field_fails():
    """Pending rights with unknown field fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "source": "teacher-provided",
            "note": "Awaiting confirmation",
            "unknownField": "x",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "unknown field", "pending_rights_unknown")


def test_illustration_pending_rights_reviewed_fails():
    """Reviewed illustration with pending rights fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="reviewed",
        rights={
            "status": "pending",
            "source": "teacher-provided",
            "note": "Awaiting confirmation",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "pending-rights variant is only valid when reviewStatus is 'draft'", "pending_rights_reviewed")


def test_illustration_pending_rights_published_fails():
    """Published illustration with pending rights fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="published",
        rights={
            "status": "pending",
            "source": "teacher-provided",
            "note": "Awaiting confirmation",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "pending-rights variant is only valid when reviewStatus is 'draft'", "pending_rights_published")


def test_illustration_pending_rights_missing_source_fails():
    """Pending rights without source field fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "note": "Awaiting confirmation",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "missing required field 'source'", "pending_rights_missing_source")


def test_illustration_pending_rights_missing_note_fails():
    """Pending rights without note field fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "source": "teacher-provided",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "missing required field 'note'", "pending_rights_missing_note")


def test_illustration_pending_rights_bad_source_fails():
    """Pending rights with invalid source fails."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "source": "ai-generated",
            "note": "Awaiting confirmation",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "must be 'teacher-provided'", "pending_rights_bad_source")


def test_illustration_pending_rights_cleared_fields_rejected():
    """Pending rights with cleared-rights fields must be rejected as unknown."""
    ill = _minimal_teacher_illustration(
        reviewStatus="draft",
        rights={
            "status": "pending",
            "source": "teacher-provided",
            "note": "Awaiting confirmation",
            "basis": "commissioned-for-chabiko",
        },
    )
    errs = validate_single(ill, "illustration")
    _assert_has_error(errs, "unknown field", "pending_rights_cleared_fields")


# ─── Existing cleared-rights backward compatibility ──────────────────────


def test_illustration_cleared_rights_draft_valid():
    """Draft illustration with cleared rights still passes (backward compat)."""
    errs = validate_single(
        _minimal_teacher_illustration(reviewStatus="draft"),
        "illustration",
    )
    _assert_no_errors(errs, "cleared_rights_draft")


def test_illustration_cleared_rights_reviewed_valid():
    """Reviewed illustration with cleared rights passes (backward compat)."""
    ill = _minimal_teacher_illustration(reviewStatus="reviewed")
    errs = validate_single(ill, "illustration")
    _assert_no_errors(errs, "cleared_rights_reviewed")


def test_illustration_cleared_rights_published_valid():
    """Published illustration with cleared rights passes (backward compat)."""
    ill = _minimal_teacher_illustration(reviewStatus="published")
    errs = validate_single(ill, "illustration")
    _assert_no_errors(errs, "cleared_rights_published")


# ─── Backward compatibility: existing behavior still passes ────────────

def test_teacher_vocab_hsk_backward_absent():
    """Teacher record without hsk still passes (backward compat)."""
    errs = validate_single(_minimal_teacher_vocab(), "vocabulary")
    _assert_no_errors(errs, "teacher_no_hsk_backward")


def test_hsk_record_without_curriculum_backward():
    """HSK record without curriculum still passes (backward compat)."""
    errs = validate_single(_minimal_hsk_vocab(), "vocabulary")
    _assert_no_errors(errs, "hsk_no_curriculum_backward")


def test_legacy_vocab_without_hsk_or_curriculum_backward():
    """Legacy vocabulary without hsk or curriculum still passes (backward compat)."""
    errs = validate_single(_minimal_vocab(), "vocabulary")
    _assert_no_errors(errs, "legacy_no_hsk_curriculum_backward")


def test_illustration_duplicate_id_detection():
    """Duplicate illustration IDs must be detected."""
    data = {
        "illustrations": [
            _minimal_teacher_illustration(id="ill-dup"),
            _minimal_teacher_illustration(id="ill-other"),
            _minimal_teacher_illustration(id="ill-dup"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate illustration id 'ill-dup'", "ill_dup_id")
    _assert_has_error(errs, "first occurrence at root.illustrations[0]", "ill_dup_first")
    _assert_has_error(errs, "root.illustrations[2]: duplicate", "ill_dup_current")


def test_illustration_duplicate_vocabulary_id_detection():
    """Duplicate vocabularyId links must be detected."""
    data = {
        "illustrations": [
            _minimal_teacher_illustration(id="ill-a", vocabularyId="voc-a"),
            _minimal_teacher_illustration(id="ill-b", vocabularyId="voc-a"),
        ]
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate vocabularyId link 'voc-a'", "ill_dup_vocab")


def test_illustration_bundle_valid():
    """Valid bundle with illustrations and teacher vocabulary passes."""
    data = {
        "teacher_vocabulary": [
            {"id": "teacher-voc-001", "simplified": "你好", "simplifiedStatus": "authored",
             "pinyin": "nǐ hǎo", "japanese": "こんにちは", "source": {"type": "teacher-workbook"},
             "reviewStatus": "draft",
             "curriculum": {"sourceId": "teacher-core-v1", "difficultyBand": "star-1",
                            "sourceDifficultyLabel": "☆", "partOfSpeech": "noun",
                            "sourceSheet": "S1", "sourceRow": 1}},
        ],
        "illustrations": [_minimal_teacher_illustration(vocabularyId="teacher-voc-001")],
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "ill_bundle_valid")


# ─── Cross-reference tests ────────────────────────────────────────────────

def _teacher_xref_vocab(**overrides):
    data = {
        "id": "teacher-voc-001",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "teacher-workbook"},
        "reviewStatus": "draft",
        "illustrationRef": "ill-001",
        "curriculum": {
            "sourceId": "teacher-core-v1",
            "difficultyBand": "star-1",
            "sourceDifficultyLabel": "☆",
            "partOfSpeech": "noun",
            "sourceSheet": "Sheet1",
            "sourceRow": 1,
        },
    }
    data.update(overrides)
    return data


def _teacher_xref_illustration(**overrides):
    data = {
        "id": "ill-001",
        "vocabularyId": "teacher-voc-001",
        "assetPath": "/assets/vocabulary/teacher-core-v1/hello.webp",
        "sourceChecksumSha256": "abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd",
        # 64 chars: abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab
        "width": 512,
        "height": 512,
        "mimeType": "image/webp",
        "fileSizeBytes": 102400,
        "altJa": "你好のイラスト",
        "rights": {
            "basis": "commissioned-for-chabiko",
            "publicWebDisplay": True,
            "staticAssetRedistribution": True,
            "modificationScope": "technical-only",
            "attributionRequired": False,
            "reuseOutsideChabiko": "not-granted",
        },
        "reviewStatus": "draft",
    }
    data.update(overrides)
    return data


def test_teacher_illustration_xref_valid():
    """Valid cross-reference passes."""
    data = {
        "teacher_vocabulary": [
            _teacher_xref_vocab(),
        ],
        "illustrations": [
            _teacher_xref_illustration(),
        ],
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "xref_valid")


def test_teacher_illustration_xref_missing_illustration():
    """illustrationRef referencing a non-existent illustration fails."""
    data = {
        "teacher_vocabulary": [
            _teacher_xref_vocab(illustrationRef="ill-nonexistent"),
        ],
        "illustrations": [
            _teacher_xref_illustration(),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "does not match any illustration id", "xref_missing_ill")


def test_teacher_illustration_xref_vocabulary_id_mismatch():
    """illustrationRef whose vocabularyId doesn't match the teacher id fails."""
    data = {
        "teacher_vocabulary": [
            _teacher_xref_vocab(id="teacher-voc-001", illustrationRef="ill-001"),
        ],
        "illustrations": [
            _teacher_xref_illustration(id="ill-001", vocabularyId="teacher-voc-other"),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "vocabularyId", "xref_vocab_id_mismatch")


def test_teacher_illustration_xref_reviewed_missing_ref():
    """Reviewed teacher record without illustrationRef fails."""
    vocab = _teacher_xref_vocab(reviewStatus="reviewed")
    del vocab["illustrationRef"]
    data = {
        "teacher_vocabulary": [vocab],
        "illustrations": [
            _teacher_xref_illustration(),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "illustrationRef' is required when reviewStatus is 'reviewed'", "xref_reviewed_missing")


def test_teacher_illustration_xref_published_missing_ref():
    """Published teacher record without illustrationRef fails."""
    vocab = _teacher_xref_vocab(reviewStatus="published")
    del vocab["illustrationRef"]
    data = {
        "teacher_vocabulary": [vocab],
        "illustrations": [
            _teacher_xref_illustration(),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "illustrationRef' is required when reviewStatus is 'published'", "xref_published_missing")


def test_teacher_illustration_xref_draft_omit_ref_ok():
    """Draft teacher record without illustrationRef passes."""
    vocab = _teacher_xref_vocab()
    del vocab["illustrationRef"]
    data = {
        "teacher_vocabulary": [vocab],
    }
    errs = validate_bundle(data)
    _assert_no_errors(errs, "xref_draft_omit")


def test_teacher_illustration_xref_orphan_illustration():
    """Illustration with vocabularyId not matching any teacher record fails."""
    data = {
        "teacher_vocabulary": [
            _teacher_xref_vocab(id="teacher-voc-001", illustrationRef="ill-001"),
        ],
        "illustrations": [
            _teacher_xref_illustration(vocabularyId="nonexistent-vocab"),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "orphan illustration", "xref_orphan")


def test_orphan_illustrations_no_teacher_key():
    """Illustrations without teacher_vocabulary key must fail with orphan error."""
    data = {
        "illustrations": [
            _minimal_teacher_illustration(vocabularyId="voc-nonexistent"),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "orphan illustration", "orphan_no_teacher_key")


def test_orphan_illustrations_empty_teacher_array():
    """Illustrations with teacher_vocabulary=[] must fail with orphan error."""
    data = {
        "teacher_vocabulary": [],
        "illustrations": [
            _minimal_teacher_illustration(vocabularyId="voc-nonexistent"),
        ],
    }
    errs = validate_bundle(data)
    _assert_has_error(errs, "orphan illustration", "orphan_empty_teacher")


# ─── CLI regression tests ──────────────────────────────────────────────────
# These tests invoke the script through --check with temp JSON fixtures,
# capturing stdout and process exit code to prove deterministic CLI behavior.


def _cli_check_result(fixture_data: dict) -> tuple[int, str]:
    """Run --check against a temporary fixture and return (exit_code, stdout)."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(fixture_data, f)
        tmp_path = f.name
    try:
        result = subprocess.run(
            [sys.executable, __file__, "--check", tmp_path],
            capture_output=True, text=True, timeout=30,
        )
        return result.returncode, result.stdout
    finally:
        os.unlink(tmp_path)


def test_cli_warning_prefix_and_message():
    exit_code, stdout = _cli_check_result({
        "resources": [
            {
                "id": "cli-warn-001", "title": "Test", "url": "https://example.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                "notes": "",
            },
        ],
    })
    assert stdout.strip() == (
        "WARNING: root.resources[0].notes should explain why this resource is useful or risky"
    ), f"Expected exact warning line, got: {stdout.strip()!r}"
    assert exit_code == 0, f"Expected exit 0 for warning-only, got {exit_code}"


def test_cli_warning_before_error():
    """Warnings print before validation errors when both exist."""
    exit_code, stdout = _cli_check_result({
        "resources": [
            {
                "id": "cli-both-001", "title": "Test", "url": "https://example.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                "notes": "",
            },
            {
                "id": "cli-both-002", "title": "Test", "url": "https://example.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                # notes is missing → validation error
            },
        ],
    })
    warning_idx = stdout.find("WARNING: ")
    # Find first non-WARNING line (the error)
    error_lines = [l for l in stdout.splitlines() if not l.startswith("WARNING: ")]
    assert error_lines, f"Expected at least one error line in stdout: {stdout}"
    first_error = error_lines[0]
    error_idx = stdout.find(first_error)
    assert warning_idx >= 0, f"Expected WARNING: in stdout: {stdout}"
    assert error_idx >= 0, f"Expected error in stdout: {stdout}"
    assert warning_idx < error_idx, (
        f"WARNING at {warning_idx} should appear before error at {error_idx}: {stdout}"
    )
    assert exit_code != 0, "Expected non-zero exit when both warnings and errors exist"


def test_cli_warning_only_exits_zero():
    exit_code, stdout = _cli_check_result({
        "resources": [
            {
                "id": "cli-zero-001", "title": "Test", "url": "https://example.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                "notes": "  ",
            },
        ],
    })
    assert exit_code == 0, f"Expected exit 0 for warning-only, got {exit_code}"
    assert "WARNING: " in stdout, f"Expected WARNING in stdout: {stdout}"


def test_cli_validation_error_exits_non_zero():
    exit_code, stdout = _cli_check_result({
        "resources": [
            {
                "id": "cli-err-001", "title": "Test", "url": "https://example.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                # notes is missing
            },
        ],
    })
    assert exit_code != 0, f"Expected non-zero exit for validation error, got {exit_code}"
    assert "WARNING: " not in stdout, (
        f"Expected no WARNING for missing notes (wrong type): {stdout}"
    )


def test_cli_warning_order():
    """Multiple warnings preserve collection/index order."""
    exit_code, stdout = _cli_check_result({
        "resources": [
            {
                "id": "cli-ord-001", "title": "A", "url": "https://a.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                "notes": "",
            },
            {
                "id": "cli-ord-002", "title": "B", "url": "https://b.com",
                "owner": "Owner", "resourceType": "dictionary",
                "licenseStatus": "approved", "allowedUse": "reference-only",
                "attribution": "Credit", "reviewStatus": "candidate",
                "notes": "  ",
            },
        ],
    })
    warning_lines = [l for l in stdout.splitlines() if l.startswith("WARNING: ")]
    assert len(warning_lines) == 2, f"Expected 2 warnings, got {len(warning_lines)}"
    assert "root.resources[0]" in warning_lines[0], (
        f"First warning should reference index 0: {warning_lines[0]}"
    )
    assert "root.resources[1]" in warning_lines[1], (
        f"Second warning should reference index 1: {warning_lines[1]}"
    )
    assert exit_code == 0, f"Expected exit 0, got {exit_code}"


if __name__ == "__main__":
    main()
