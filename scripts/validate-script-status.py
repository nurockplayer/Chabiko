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


def validate_script_fields(record: dict, path: str = "record") -> list[str]:
    """
    Validate per-form script provenance fields on a content record.

    Returns a list of error messages (empty = valid).
    """
    errors: list[str] = []

    # traditional is required
    if "traditional" not in record:
        errors.append(f"{path}: 'traditional' is required")

    # traditionalStatus is required and must be a controlled value
    if "traditionalStatus" not in record:
        errors.append(f"{path}: 'traditionalStatus' is required")
    else:
        val = record["traditionalStatus"]
        if not isinstance(val, str):
            errors.append(f"{path}.traditionalStatus must be a string, got {type(val).__name__}")
        elif val not in CONTROLLED_STATUSES:
            errors.append(f"{path}.traditionalStatus '{val}' — not a valid status")

    # simplified is optional; when absent, simplifiedStatus must also be absent
    simplified_present = "simplified" in record and record["simplified"] is not None
    simplified_status_present = "simplifiedStatus" in record

    if not simplified_present:
        if simplified_status_present:
            errors.append(f"{path}: 'simplifiedStatus' present but 'simplified' is absent")
    else:
        if not simplified_status_present:
            errors.append(f"{path}: 'simplifiedStatus' is required when 'simplified' is present")
        else:
            val = record["simplifiedStatus"]
            if not isinstance(val, str):
                errors.append(f"{path}.simplifiedStatus must be a string, got {type(val).__name__}")
            elif val not in CONTROLLED_STATUSES:
                errors.append(f"{path}.simplifiedStatus '{val}' — not a valid status")

    return errors


def walk_content_records(data, path: str = "root") -> list[str]:
    """
    Walk a content bundle and validate script provenance fields on every
    record that has any script-related field (traditional, traditionalStatus,
    simplified, simplifiedStatus).

    Returns a flat list of error messages.
    """
    errors: list[str] = []

    if isinstance(data, dict):
        # Validate any record that has at least one script-related field
        script_keys = {"traditional", "traditionalStatus", "simplified", "simplifiedStatus"}
        if script_keys & data.keys():
            errors.extend(validate_script_fields(data, path))
        for key, value in data.items():
            errors.extend(walk_content_records(value, f"{path}.{key}"))

    elif isinstance(data, list):
        for i, item in enumerate(data):
            errors.extend(walk_content_records(item, f"{path}[{i}]"))

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
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplifiedStatus": "verified",
    })
    assert any("simplifiedStatus" in e and "absent" in e for e in errs), (
        f"Expected simplifiedStatus-without-simplified error, got {errs}"
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


def test_unavailable_is_valid():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "unavailable",
    })
    assert errs == [], f"unavailable should be valid, got {errs}"


def test_non_string_status_fails():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": 123,
    })
    assert any("string" in e for e in errs), f"Expected string-type error, got {errs}"


def test_simplified_none_is_absent():
    errs = validate_script_fields({
        "id": "x",
        "traditional": "你好",
        "traditionalStatus": "authored",
        "simplified": None,
        "simplifiedStatus": "verified",
    })
    assert any("simplifiedStatus" in e and "absent" in e for e in errs), (
        f"Expected simplifiedStatus-without-simplified error when simplified is None, got {errs}"
    )


def test_all_four_statuses_valid():
    for s in ("authored", "verified", "generated", "unavailable"):
        errs = validate_script_fields({
            "id": "x",
            "traditional": "你好",
            "traditionalStatus": s,
        })
        assert errs == [], f"Status '{s}' should be valid, got {errs}"


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


def run_tests():
    tests = [
        test_traditional_fields_required,
        test_traditional_status_required,
        test_valid_traditional_only,
        test_valid_both_forms,
        test_simplified_without_status_fails,
        test_status_present_without_simplified_fails,
        test_invalid_traditional_status_fails,
        test_invalid_simplified_status_fails,
        test_unavailable_is_valid,
        test_non_string_status_fails,
        test_simplified_none_is_absent,
        test_all_four_statuses_valid,
        test_walk_bundle,
        test_walk_bundle_invalid,
        test_walk_ignores_non_chinese_content,
        test_walk_catches_simplified_only_record,
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
        filepath = sys.argv[2]
        with open(filepath) as f:
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
