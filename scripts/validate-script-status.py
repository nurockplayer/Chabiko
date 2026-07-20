#!/usr/bin/env python3
"""
Minimal script status validator for Chabiko #24.

Zero-dependency Python 3. Validates that per-form script provenance fields
(traditional/traditionalStatus, simplified/simplifiedStatus) are present and
have controlled status values.

Usage:
    python3 scripts/validate-script-status.py          # run self-tests
    python3 scripts/validate-script-status.py --check <file>   # validate content file
"""

import json
import sys

CONTROLLED_STATUSES = frozenset({"authored", "verified", "generated", "unavailable"})

# Collection keys whose items are always Chinese content.
CHINESE_CONTENT_COLLECTIONS = frozenset({"vocabulary", "sentences", "phrasebook"})


def validate_script_fields(record: dict, path: str = "record") -> list[str]:
    """
    Validate per-form script provenance fields on a content record.

    Returns a list of error messages (empty = valid).
    """
    errors: list[str] = []

    # Check if this is an HSK record (Simplified-first subtype)
    # When the key is present, hsk must be a dict/object.
    if "hsk" in record:
        hsk_val = record["hsk"]
        if not isinstance(hsk_val, dict):
            errors.append(f"{path}.hsk must be a JSON object when present, got {type(hsk_val).__name__}")
        else:
            errors.extend(_validate_hsk_script_fields(record, path))
        return errors

    return _validate_standard_script_fields(record, path)


def _validate_standard_script_fields(record: dict, path: str) -> list[str]:
    """Standard Traditional-first script validation for non-HSK content."""
    errors: list[str] = []

    # traditional is required and must be a string
    if "traditional" not in record:
        errors.append(f"{path}: 'traditional' is required")
    elif not isinstance(record["traditional"], str):
        errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")

    # traditionalStatus is required; unavailable is contradictory because
    # traditional always has text
    if "traditionalStatus" not in record:
        errors.append(f"{path}: 'traditionalStatus' is required")
    else:
        val = record["traditionalStatus"]
        if not isinstance(val, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(val).__name__}")
        elif val == "unavailable":
            errors.append(f"{path}: 'traditionalStatus' cannot be 'unavailable' when 'traditional' text exists")
        elif val not in CONTROLLED_STATUSES:
            errors.append(f"{path}.traditionalStatus '{val}' — not a valid status")

    # simplified is optional; when absent, simplifiedStatus must be absent
    # or explicitly "unavailable" (meaning "confirmed unavailable")
    simplified_present = "simplified" in record and record["simplified"] is not None
    simplified_status_present = "simplifiedStatus" in record

    if simplified_present and not isinstance(record["simplified"], str):
        errors.append(f"{path}.simplified must be a string, got {type(record['simplified']).__name__}")

    if not simplified_present:
        if simplified_status_present:
            val = record["simplifiedStatus"]
            if val != "unavailable":
                errors.append(
                    f"{path}: 'simplifiedStatus' must be 'unavailable' when 'simplified' is absent"
                )
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
                errors.append(f"{path}.simplifiedStatus '{val}' — not a valid status")

    return errors


def _validate_hsk_script_fields(record: dict, path: str) -> list[str]:
    """HSK Simplified-first script validation."""
    errors: list[str] = []

    # simplified is required and must be a string
    if "simplified" not in record:
        errors.append(f"{path}: 'simplified' is required for HSK record")
    elif not isinstance(record["simplified"], str):
        errors.append(f"{path}.simplified must be a string, got {type(record['simplified']).__name__}")

    # simplifiedStatus is required; must be authored or verified
    if "simplifiedStatus" not in record:
        errors.append(f"{path}: 'simplifiedStatus' is required for HSK record")
    else:
        val = record["simplifiedStatus"]
        if not isinstance(val, str):
            errors.append(f"{path}.simplifiedStatus must be a string, got {type(val).__name__}")
        elif val not in ("authored", "verified"):
            errors.append(f"{path}.simplifiedStatus '{val}' must be 'authored' or 'verified' for HSK record")

    # traditional is optional for HSK; explicit null must be rejected
    if "traditional" in record and record["traditional"] is None:
        errors.append(f"{path}: 'traditional' cannot be null for HSK record; omit the key if traditional is unavailable")
    if "traditionalStatus" in record and record["traditionalStatus"] is None:
        errors.append(f"{path}: 'traditionalStatus' cannot be null for HSK record; omit the key if traditional is unavailable")

    traditional_present = "traditional" in record and record["traditional"] is not None
    if traditional_present:
        if not isinstance(record["traditional"], str):
            errors.append(f"{path}.traditional must be a string, got {type(record['traditional']).__name__}")
        ts = record.get("traditionalStatus")
        if ts is None:
            errors.append(f"{path}: 'traditionalStatus' is required when 'traditional' is present")
        elif not isinstance(ts, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(ts).__name__}")
        elif ts not in ("authored", "verified"):
            errors.append(
                f"{path}.traditionalStatus '{ts}' must be 'authored' or 'verified' for HSK record"
            )
    else:
        ts = record.get("traditionalStatus")
        if ts is not None and ts != "unavailable":
            errors.append(
                f"{path}: 'traditionalStatus' must be 'unavailable' or absent "
                f"when 'traditional' is absent for HSK record"
            )

    return errors


def walk_content_records(data, path: str = "root", parent_key: str = "") -> list[str]:
    """
    Walk a content bundle and validate script provenance fields on every
    record that has any script-related field, has a `pinyin` field
    (indicating Chinese content), or sits under a known Chinese-content
    collection key (vocabulary/sentences/phrasebook).

    Returns a flat list of error messages.
    """
    errors: list[str] = []

    if isinstance(data, dict):
        # Validate any record that has at least one script-related field,
        # has pinyin (strong signal of Chinese content), or sits under a
        # known Chinese-content collection parent.
        chinese_content_keys = {"traditional", "traditionalStatus", "simplified", "simplifiedStatus", "pinyin"}
        if chinese_content_keys & data.keys() or parent_key in CHINESE_CONTENT_COLLECTIONS:
            errors.extend(validate_script_fields(data, path))
        for key, value in data.items():
            errors.extend(walk_content_records(value, f"{path}.{key}", key))

    elif isinstance(data, list):
        for i, item in enumerate(data):
            errors.extend(walk_content_records(item, f"{path}[{i}]", parent_key))

    return errors


# --- Tests ---

def test_traditional_fields_required():
    errs = validate_script_fields({"id": "x"})
    assert any("traditional" in e and "required" in e for e in errs), (
        f"Expected traditional-required error, got {errs}"
    )


def test_traditional_status_required():
    errs = validate_script_fields({"id": "x", "traditional": "你好"})
    assert any("traditionalStatus" in e and "required" in e for e in errs), (
        f"Expected traditionalStatus-required error, got {errs}"
    )


def test_valid_traditional_only():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_valid_both_forms():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": "你好",
        "simplifiedStatus": "verified",
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_simplified_without_status_fails():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": "你好",
    })
    assert any("simplifiedStatus" in e and "required" in e for e in errs), (
        f"Expected simplifiedStatus-required error, got {errs}"
    )


def test_status_present_without_simplified_fails():
    """simplifiedStatus=verified without simplified should fail (only unavailable allowed)."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplifiedStatus": "verified",
    })
    assert any("must be 'unavailable'" in e for e in errs), (
        f"Expected simulatedStatus-must-be-unavailable error, got {errs}"
    )


def test_simplified_status_unavailable_without_simplified_passes():
    """simplifiedStatus=unavailable without simplified is valid (confirmed unavailable)."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplifiedStatus": "unavailable",
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_simplified_status_unavailable_with_simplified_fails():
    """simplifiedStatus=unavailable with simplified text is contradictory and must fail."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": "你好",
        "simplifiedStatus": "unavailable",
    })
    assert any("cannot be 'unavailable'" in e for e in errs), (
        f"Expected cannot-be-unavailable error, got {errs}"
    )


def test_invalid_traditional_status_fails():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "draft",
    })
    assert any("not a valid status" in e for e in errs), (
        f"Expected invalid status error, got {errs}"
    )


def test_invalid_simplified_status_fails():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": "你好",
        "simplifiedStatus": "ai-generated",
    })
    assert any("not a valid status" in e for e in errs), (
        f"Expected invalid status error, got {errs}"
    )


def test_unavailable_on_traditional_fails():
    """unavailable is contradictory when traditional text exists."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "unavailable",
    })
    assert any("cannot be 'unavailable'" in e for e in errs), (
        f"Expected cannot-be-unavailable error, got {errs}"
    )


def test_unavailable_on_simplified_no_text_passes():
    """unavailable is valid on simplified when it confirms the form is absent."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplifiedStatus": "unavailable",
    })
    assert errs == [], f"unavailable on simplified (no text) should pass, got {errs}"


def test_traditional_status_unavailable_fails():
    """traditionalStatus=unavailable is contradictory because traditional always has text."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "unavailable",
    })
    assert any("cannot be 'unavailable'" in e for e in errs), (
        f"Expected traditional-cannot-be-unavailable error, got {errs}"
    )


def test_non_string_status_fails():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": 123,
    })
    assert any("string" in e for e in errs), f"Expected string-type error, got {errs}"


def test_simplified_none_is_absent():
    """simplified=None counts as absent — simplifiedStatus must be 'unavailable'."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": None,
        "simplifiedStatus": "verified",
    })
    assert any("must be 'unavailable'" in e for e in errs), (
        f"Expected must-be-unavailable error when simplified is None, got {errs}"
    )


def test_all_four_statuses_valid():
    """traditionalStatus=unavailable is now rejected (contradictory), so only test non-unavailable."""
    for s in ("authored", "verified", "generated"):
        errs = validate_script_fields({
            "id": "x",
            "traditional": "你好",
            "traditionalStatus": s,
        })
        assert errs == [], f"Status '{s}' should be valid, got {errs}"


def test_simplified_status_valid_with_simplified_passes():
    """simplified text with a valid non-unavailable status should pass."""
    for s in ("authored", "verified", "generated"):
        errs = validate_script_fields({
            "id": "x",
            "traditional": "你好",
            "traditionalStatus": "authored",
            "simplified": "你好",
            "simplifiedStatus": s,
        })
        assert errs == [], f"Status '{s}' with simplified text should pass, got {errs}"


def test_walk_bundle():
    data = {
        "vocabulary": [
            {"id": "v1", "traditional": "你好", "traditionalStatus": "authored"},
            {"id": "v2", "traditional": "謝謝", "traditionalStatus": "verified",
             "simplified": "谢谢", "simplifiedStatus": "generated"},
        ],
        "sentences": [
            {"id": "s1", "traditional": "我要去車站", "traditionalStatus": "authored",
             "simplified": "我要去车站", "simplifiedStatus": "verified"},
        ],
    }
    errs = walk_content_records(data)
    assert errs == [], f"Bundle all valid should pass, got {errs}"


def test_walk_bundle_invalid():
    data = {
        "vocabulary": [
            {"id": "v1", "traditional": "你好", "traditionalStatus": "authored"},
            {"id": "v2", "traditional": "謝謝", "traditionalStatus": "not-a-status"},
        ],
    }
    errs = walk_content_records(data)
    assert len(errs) >= 1, f"Bundle with invalid should fail, got {errs}"


def test_walk_ignores_non_chinese_content():
    data = {
        "metadata": {"version": 1},
        "lessons": [{"id": "l1", "titleJa": "レッスン1"}],
        "settings": {"theme": "dark"},
    }
    errs = walk_content_records(data)
    assert errs == [], f"Non-Chinese records should be ignored, got {errs}"


def test_walk_catches_simplified_only_record():
    """Simplified-only records (missing traditional) must still be caught."""
    data = {
        "vocabulary": [
            {"id": "v1", "simplified": "你好", "simplifiedStatus": "verified"},
        ],
    }
    errs = walk_content_records(data)
    assert any("traditional" in e and "required" in e for e in errs), (
        f"Expected traditional-required error for Simplified-only record, got {errs}"
    )


def test_missing_check_arg_exits_two():
    """--check without a file argument should print usage and exit with code 2."""
    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, __file__, "--check"],
            capture_output=True, text=True
        )
        assert result.returncode == 2, f"Expected exit 2, got {result.returncode}"
        assert "Usage:" in result.stderr, f"Expected usage in stderr, got: {result.stderr}"
    except ImportError:
        pass  # skip if subprocess unavailable (unlikely)


def test_walk_catches_missing_traditional_with_pinyin():
    """A record with pinyin but no traditional must be caught."""
    data = {
        "vocabulary": [
            {"id": "v1", "pinyin": "hǎo", "japanese": "良い"},
        ],
    }
    errs = walk_content_records(data)
    assert any("traditional" in e and "required" in e for e in errs), (
        f"Expected traditional-required error for pinyin-only record, got {errs}"
    )


def test_walk_catches_vocab_without_any_script_field():
    """vocabulary entry with no traditional/pinyin must still be caught via parent key."""
    data = {
        "vocabulary": [
            {"id": "v1", "japanese": "良い"},
        ],
    }
    errs = walk_content_records(data)
    assert any("traditional" in e and "required" in e for e in errs), (
        f"Expected traditional-required error for vocab without script fields, got {errs}"
    )


def test_walk_catches_sentences_without_script_field():
    """sentences entry with no traditional/pinyin must be caught via parent key."""
    data = {
        "sentences": [
            {"id": "s1", "japanese": "テスト"},
        ],
    }
    errs = walk_content_records(data)
    assert any("traditional" in e and "required" in e for e in errs), (
        f"Expected traditional-required error for sentence without script fields, got {errs}"
    )


def test_traditional_non_string_fails():
    """traditional must be a string."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": 123,
        "traditionalStatus": "authored",
    })
    assert any("must be a string" in e for e in errs), (
        f"Expected traditional-must-be-string error, got {errs}"
    )


def test_simplified_non_string_fails():
    """simplified must be a string when present."""
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": 456,
        "simplifiedStatus": "verified",
    })
    assert any("must be a string" in e for e in errs), (
        f"Expected simplified-must-be-string error, got {errs}"
    )


def test_hsk_simplified_first_valid():
    """HSK record with only simplified and no traditional passes."""
    errs = validate_script_fields({
        "id": "hsk-1",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_hsk_with_traditional_valid():
    """HSK record with both simplified and reviewed traditional passes."""
    errs = validate_script_fields({
        "id": "hsk-2",
        "simplified": "你好",
        "simplifiedStatus": "verified",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_hsk_traditional_absent_with_unavailable_ok():
    """HSK record with absent traditional and traditionalStatus=unavailable passes."""
    errs = validate_script_fields({
        "id": "hsk-3",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "traditionalStatus": "unavailable",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_hsk_simplified_status_generated_fails():
    """HSK simplifiedStatus must be authored or verified."""
    errs = validate_script_fields({
        "id": "hsk-4",
        "simplified": "你好",
        "simplifiedStatus": "generated",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert any("must be 'authored' or 'verified'" in e for e in errs), (
        f"Expected authored/verified error, got {errs}"
    )


def test_hsk_traditional_generated_fails():
    """HSK traditionalStatus generated for HSK record fails."""
    errs = validate_script_fields({
        "id": "hsk-5",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "traditional": "你好",
        "traditionalStatus": "generated",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert any("must be 'authored' or 'verified'" in e for e in errs), (
        f"Expected authored/verified error for HSK traditional, got {errs}"
    )


def test_hsk_missing_traditional_status_without_traditional_ok():
    """HSK record can omit traditionalStatus when traditional is absent."""
    errs = validate_script_fields({
        "id": "hsk-6",
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert errs == [], f"Expected no errors, got {errs}"


def test_hsk_walk_bundle():
    """Bundle with mixed HSK and non-HSK vocabulary passes."""
    data = {
        "vocabulary": [
            {"id": "v1", "traditional": "謝謝", "traditionalStatus": "authored"},  # non-HSK
            {"id": "v2", "simplified": "你好", "simplifiedStatus": "authored",  # HSK
             "pinyin": "nǐ hǎo", "japanese": "こんにちは", "source": {"type": "hsk"}, "reviewStatus": "draft",
             "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"}},
        ]
    }
    errs = walk_content_records(data)
    assert errs == [], f"Expected no errors, got {errs}"


def test_hsk_walk_phrasebook_unaffected():
    """Existing phrasebook behavior unaffected by HSK changes."""
    data = {
        "phrasebook": [
            {"id": "p1", "scenario": "food", "traditional": "我要這個",
             "traditionalStatus": "authored", "pinyin": "wǒ yào zhège",
             "japanese": "これをください", "reviewStatus": "draft"},
        ]
    }
    errs = walk_content_records(data)
    assert errs == [], f"Expected no errors, got {errs}"


def test_hsk_walk_sentence_unaffected():
    """Existing sentence behavior unaffected by HSK changes."""
    data = {
        "sentences": [
            {"id": "s1", "traditional": "我要去車站", "traditionalStatus": "authored",
             "pinyin": "wǒ yào qù chēzhàn", "japanese": "駅に行きたい",
             "scenario": "transport", "reviewStatus": "draft"},
        ]
    }
    errs = walk_content_records(data)
    assert errs == [], f"Expected no errors, got {errs}"



def test_hsk_traditional_null_fails():
    """HSK record with traditional=null must be rejected."""
    errs = validate_script_fields({
        "id": "hsk-7",
        "traditional": None,
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert any("cannot be null" in e for e in errs), f"Expected null error, got {errs}"


def test_hsk_traditional_status_null_fails():
    """HSK record with traditionalStatus=null must be rejected."""
    errs = validate_script_fields({
        "id": "hsk-8",
        "traditionalStatus": None,
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert any("cannot be null" in e for e in errs), f"Expected null error, got {errs}"


def test_hsk_traditional_absent_with_status_unavailable_ok():
    """HSK record without traditional key and with traditionalStatus unavailable passes."""
    errs = validate_script_fields({
        "id": "hsk-9",
        "traditionalStatus": "unavailable",
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "source": {"type": "hsk-workbook"},
        "reviewStatus": "draft",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
    })
    assert errs == [], f"Expected no errors, got {errs}"



def test_hsk_dispatch_null_rejected():
    """hsk: null must fail with hsk type error and not fall through to non-HSK."""
    errs = validate_script_fields({
        "id": "hsk-null",
        "hsk": None,
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "generated",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert any("must be a JSON object" in e for e in errs), f"Expected hsk object error, got {errs}"
    # Must NOT get non-HSK traditional-required errors
    assert not any("traditional" in e and "required" in e for e in errs), (
        f"Should not fall through to non-HSK contract, got {errs}"
    )


def test_hsk_dispatch_string_rejected():
    """hsk: string must fail and not fall through to non-HSK."""
    errs = validate_script_fields({
        "id": "hsk-str",
        "hsk": "hsk-3.0",
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "generated",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert any("must be a JSON object" in e for e in errs), f"Expected hsk object error, got {errs}"
    # Must NOT get non-HSK traditional-required errors
    assert not any("traditional" in e and "required" in e for e in errs), (
        f"Should not fall through to non-HSK contract, got {errs}"
    )


def test_hsk_dispatch_list_rejected():
    """hsk: [] must fail."""
    errs = validate_script_fields({
        "id": "hsk-list",
        "hsk": [],
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert any("must be a JSON object" in e for e in errs), f"Expected hsk object error, got {errs}"


def test_hsk_dispatch_int_rejected():
    """hsk: 1 must fail."""
    errs = validate_script_fields({
        "id": "hsk-int",
        "hsk": 1,
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert any("must be a JSON object" in e for e in errs), f"Expected hsk object error, got {errs}"


def test_hsk_dispatch_object_uses_hsk():
    """hsk object must use HSK validator (traditionalStatus unavailable ok)."""
    errs = validate_script_fields({
        "id": "hsk-obj",
        "hsk": {"standardVersion": "hsk-3.0", "introducedAtLevel": 1, "sourceLevelLabel": "L1"},
        "simplified": "\u4f60\u597d",
        "simplifiedStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert errs == [], f"Expected no errors for valid HSK with absent traditional, got {errs}"


def test_hsk_dispatch_absent_uses_non_hsk():
    """hsk key absent must use non-HSK validator (traditional required)."""
    errs = validate_script_fields({
        "id": "non-hsk",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert any("traditional" in e and "required" in e for e in errs), (
        f"Expected traditional-required error (non-HSK contract), got {errs}"
    )


def test_hsk_dispatch_null_blocks_non_hsk_escape():
    """Non-dict hsk must not pass even with legacy Traditional fields filled."""
    errs = validate_script_fields({
        "id": "escape",
        "hsk": None,
        "traditional": "\u4f60\u597d",
        "traditionalStatus": "authored",
        "pinyin": "n\u01d0 h\u01ceo",
        "japanese": "\u3053\u3093\u306b\u3061\u306f",
        "reviewStatus": "draft",
    })
    assert any("must be a JSON object" in e for e in errs), f"Expected hsk object error, got {errs}"


def test_hsk_dispatch_empty_dict_uses_hsk():
    """hsk={} should dispatch to HSK validation and report missing required fields."""
    errs = validate_script_fields({
        "id": "hsk-empty",
        "hsk": {},
        "simplified": "你好",
        "simplifiedStatus": "authored",
        "pinyin": "nǐ hǎo",
        "japanese": "こんにちは",
    })
    # HSK dispatch must succeed (no non-HSK error about missing traditional)
    assert not any("traditional" in e.lower() for e in errs), (
        f"Empty dict should dispatch to HSK, not non-HSK traditional check, got {errs}"
    )


def run_tests():
    tests = [
        test_traditional_fields_required,
        test_traditional_status_required,
        test_valid_traditional_only,
        test_valid_both_forms,
        test_simplified_without_status_fails,
        test_status_present_without_simplified_fails,
        test_invalid_traditional_status_fails,
        test_traditional_status_unavailable_fails,
        test_invalid_simplified_status_fails,
        test_unavailable_on_traditional_fails,
        test_unavailable_on_simplified_no_text_passes,
        test_non_string_status_fails,
        test_simplified_none_is_absent,
        test_all_four_statuses_valid,
        test_walk_bundle,
        test_walk_bundle_invalid,
        test_walk_ignores_non_chinese_content,
        test_walk_catches_simplified_only_record,
        test_walk_catches_missing_traditional_with_pinyin,
        test_walk_catches_vocab_without_any_script_field,
        test_walk_catches_sentences_without_script_field,
        test_simplified_status_unavailable_without_simplified_passes,
        test_simplified_status_unavailable_with_simplified_fails,
        test_simplified_status_valid_with_simplified_passes,
        test_missing_check_arg_exits_two,
        test_traditional_non_string_fails,
        test_simplified_non_string_fails,
        # HSK tests
        test_hsk_simplified_first_valid,
        test_hsk_with_traditional_valid,
        test_hsk_traditional_absent_with_unavailable_ok,
        test_hsk_simplified_status_generated_fails,
        test_hsk_traditional_generated_fails,
        test_hsk_missing_traditional_status_without_traditional_ok,
        test_hsk_walk_bundle,
        test_hsk_walk_phrasebook_unaffected,
        test_hsk_walk_sentence_unaffected,
        test_hsk_traditional_null_fails,
        test_hsk_traditional_status_null_fails,
        test_hsk_traditional_absent_with_status_unavailable_ok,
        test_hsk_dispatch_null_rejected,
        test_hsk_dispatch_string_rejected,
        test_hsk_dispatch_list_rejected,
        test_hsk_dispatch_int_rejected,
        test_hsk_dispatch_object_uses_hsk,
        test_hsk_dispatch_absent_uses_non_hsk,
        test_hsk_dispatch_null_blocks_non_hsk_escape,
        test_hsk_dispatch_empty_dict_uses_hsk,
    ]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
        except AssertionError as e:
            print(f"  FAIL  {test.__name__}: {e}")
            failures += 1
    return failures


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        if len(sys.argv) < 3:
            print("Usage: python3 scripts/validate-script-status.py --check <file>", file=sys.stderr)
            sys.exit(2)
        filepath = sys.argv[2]
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        errors = walk_content_records(data)
        for e in errors:
            print(f"{filepath}: {e}")
        sys.exit(1 if errors else 0)
    else:
        print("Running script status validation tests...")
        failures = run_tests()
        if failures:
            print(f"\n{failures} test(s) FAILED")
            sys.exit(1)
        else:
            print("\nAll tests PASSED")


if __name__ == "__main__":
    main()
