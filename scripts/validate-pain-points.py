#!/usr/bin/env python3
"""
Minimal painPointTags validator for Chabiko #14.

Zero-dependency Python 3. Validates that painPointTags values are drawn
from the controlled taxonomy. This is a lightweight executable validation
that runs before #2 schema integration is implemented.

Usage:
    python3 scripts/validate-pain-points.py          # run self-tests
    python3 scripts/validate-pain-points.py --check <file>   # validate content file
"""

import json
import sys

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

LOWERCASE_KEBAB_REQUIRED = True


def validate_pain_point_tags(item: dict) -> list[str]:
    """
    Validate the painPointTags field of a content item.

    Returns a list of error messages (empty = valid).
    """
    errors: list[str] = []

    # painPointTags is optional
    if "painPointTags" not in item:
        return errors

    tags = item["painPointTags"]

    # Must be a list
    if not isinstance(tags, list):
        errors.append("painPointTags must be a list")
        return errors

    # Empty array is treated as absent — no error
    if len(tags) == 0:
        return errors

    # Check for duplicates
    seen = set()
    for tag in tags:
        if not isinstance(tag, str):
            errors.append(f"painPointTags value must be a string, got {type(tag).__name__}")
            continue

        if tag in seen:
            errors.append(f"Duplicate painPointTag: '{tag}'")
        seen.add(tag)

        if LOWERCASE_KEBAB_REQUIRED and tag != tag.lower():
            errors.append(f"painPointTag '{tag}' must be lowercase kebab-case")

        if tag not in CONTROLLED_TAGS:
            errors.append(f"Invalid painPointTag '{tag}' — not in controlled taxonomy")

    return errors


# --- Tests ---

def test_valid_tags_pass():
    item = {"id": "x", "painPointTags": ["tone", "measure-word"]}
    assert validate_pain_point_tags(item) == [], f"Expected no errors, got {validate_pain_point_tags(item)}"


def test_missing_tags_ok():
    item = {"id": "x"}
    assert validate_pain_point_tags(item) == [], "Missing painPointTags should pass"


def test_empty_array_ok():
    item = {"id": "x", "painPointTags": []}
    assert validate_pain_point_tags(item) == [], "Empty array should pass"


def test_invalid_tag_fails():
    item = {"id": "x", "painPointTags": ["ton"]}
    errs = validate_pain_point_tags(item)
    assert len(errs) == 1, f"Expected 1 error, got {len(errs)}"
    assert "ton" in errs[0] and "Invalid" in errs[0], f"Unexpected error: {errs[0]}"


def test_duplicate_tags_fail():
    item = {"id": "x", "painPointTags": ["tone", "tone"]}
    errs = validate_pain_point_tags(item)
    assert any("Duplicate" in e for e in errs), f"Expected duplicate error, got {errs}"


def test_mixed_valid_invalid():
    item = {"id": "x", "painPointTags": ["tone", "pinyin"]}
    errs = validate_pain_point_tags(item)
    assert len(errs) == 1, f"Expected 1 error for 'pinyin', got {len(errs)}: {errs}"


def test_case_sensitive():
    item = {"id": "x", "painPointTags": ["TONE"]}
    errs = validate_pain_point_tags(item)
    assert any("lowercase" in e for e in errs), f"Expected lowercase error, got {errs}"


def test_painpointtags_not_list():
    item = {"id": "x", "painPointTags": "tone"}
    errs = validate_pain_point_tags(item)
    assert any("list" in e for e in errs), f"Expected list-type error, got {errs}"


def test_empty_tags_absent():
    """Verify duplicate rule: empty array same as absent (not an error)."""
    item1 = {"id": "x"}
    item2 = {"id": "x", "painPointTags": []}
    assert validate_pain_point_tags(item1) == validate_pain_point_tags(item2)


def run_tests():
    tests = [
        test_valid_tags_pass,
        test_missing_tags_ok,
        test_empty_array_ok,
        test_invalid_tag_fails,
        test_duplicate_tags_fail,
        test_mixed_valid_invalid,
        test_case_sensitive,
        test_painpointtags_not_list,
        test_empty_tags_absent,
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
        if isinstance(data, list):
            items = data
        else:
            items = [data]
        total_errors = 0
        for i, item in enumerate(items):
            errs = validate_pain_point_tags(item)
            for e in errs:
                print(f"{filepath}[{i}]: {e}")
                total_errors += 1
        sys.exit(1 if total_errors > 0 else 0)
    else:
        print("Running painPointTags validation tests...")
        failures = run_tests()
        if failures:
            print(f"\n{failures} test(s) FAILED")
            sys.exit(1)
        else:
            print("\nAll tests PASSED")


if __name__ == "__main__":
    main()
