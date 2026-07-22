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


def validate_pain_point_tags(tags) -> list[str]:
    """
    Validate a painPointTags value from any content item.

    Returns a list of error messages (empty = valid).
    """
    errors: list[str] = []

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


def walk_and_validate(data, path: str = "root") -> list[str]:
    """
    Recursively walk a content bundle (dict/list tree) and validate every
    painPointTags field encountered at any nesting level.

    Returns a flat list of error messages.
    """
    errors: list[str] = []

    if isinstance(data, dict):
        if "painPointTags" in data:
            item_errors = validate_pain_point_tags(data["painPointTags"])
            for e in item_errors:
                errors.append(f"{path}: {e}")
            for key, value in data.items():
                errors.extend(walk_and_validate(value, f"{path}.{key}"))
        else:
            for key, value in data.items():
                errors.extend(walk_and_validate(value, f"{path}.{key}"))

    elif isinstance(data, list):
        for i, item in enumerate(data):
            errors.extend(walk_and_validate(item, f"{path}[{i}]"))

    return errors


# --- Tests ---

def test_valid_tags_pass():
    errs = validate_pain_point_tags(["tone", "measure-word"])
    assert errs == [], f"Expected no errors, got {errs}"


def test_missing_tags_ok():
    data = {"id": "x"}
    errs = walk_and_validate(data)
    assert errs == [], f"Missing painPointTags should pass, got {errs}"


def test_empty_array_ok():
    errs = validate_pain_point_tags([])
    assert errs == [], "Empty array should pass"


def test_invalid_tag_fails():
    errs = validate_pain_point_tags(["ton"])
    assert len(errs) == 1, f"Expected 1 error, got {len(errs)}"
    assert "ton" in errs[0] and "Invalid" in errs[0], f"Unexpected error: {errs[0]}"


def test_duplicate_tags_fail():
    errs = validate_pain_point_tags(["tone", "tone"])
    assert any("Duplicate" in e for e in errs), f"Expected duplicate error, got {errs}"


def test_mixed_valid_invalid():
    errs = validate_pain_point_tags(["tone", "pinyin"])
    assert len(errs) == 1, f"Expected 1 error for 'pinyin', got {len(errs)}: {errs}"


def test_case_sensitive():
    errs = validate_pain_point_tags(["TONE"])
    assert any("lowercase" in e for e in errs), f"Expected lowercase error, got {errs}"


def test_painpointtags_not_list():
    errs = validate_pain_point_tags("tone")
    assert any("list" in e for e in errs), f"Expected list-type error, got {errs}"


def test_non_string_tag():
    errs = validate_pain_point_tags(["tone", 123])
    assert any("string" in e for e in errs), f"Expected string-type error, got {errs}"


def test_empty_tags_absent():
    """Verify duplicate rule: empty array same as absent (not an error)."""
    errs_empty = walk_and_validate({"id": "x", "painPointTags": []})
    errs_missing = walk_and_validate({"id": "x"})
    assert errs_empty == errs_missing, f"Empty and missing should be equal: {errs_empty} vs {errs_missing}"


# --- Recursive walk tests ---

def test_nested_valid_tags_pass():
    data = {"lessons": [{"id": "l1", "painPointTags": ["tone"]}]}
    errs = walk_and_validate(data)
    assert errs == [], f"Nested valid should pass, got {errs}"


def test_nested_invalid_tag_fails():
    data = {"lessons": [{"id": "l1", "painPointTags": ["ton"]}]}
    errs = walk_and_validate(data)
    assert len(errs) >= 1, f"Nested invalid should fail, got {errs}"
    assert "ton" in str(errs), f"Should mention invalid tag, got {errs}"


def test_nested_duplicate_tags_fail():
    data = {"phrasebook": [{"id": "p1", "painPointTags": ["tone", "tone"]}]}
    errs = walk_and_validate(data)
    assert any("Duplicate" in e for e in errs), f"Nested duplicate should fail, got {errs}"


def test_nested_non_list_tags_fail():
    data = {"vocabulary": [{"id": "v1", "painPointTags": "tone"}]}
    errs = walk_and_validate(data)
    assert any("list" in e for e in errs), f"Nested non-list should fail, got {errs}"


def test_content_bundle_multiple_items():
    data = {
        "lessons": [{"id": "l1", "painPointTags": ["tone"]}],
        "vocabulary": [
            {"id": "v1", "painPointTags": ["kanji-false-friend"]},
            {"id": "v2", "painPointTags": ["tone", "pinyin-pronunciation"]},
        ],
        "phrasebook": [{"id": "p1", "painPointTags": ["taiwan-mainland-usage"]}],
    }
    errs = walk_and_validate(data)
    assert errs == [], f"Bundle all valid should pass, got {errs}"


def test_content_bundle_one_invalid_fails():
    data = {
        "lessons": [{"id": "l1", "painPointTags": ["tone"]}],
        "vocabulary": [{"id": "v1", "painPointTags": ["bad-tag"]}],
    }
    errs = walk_and_validate(data)
    assert len(errs) >= 1, f"Bundle with invalid should fail, got {errs}"
    assert "bad-tag" in str(errs)


def test_unrelated_nested_no_tags_pass():
    data = {
        "metadata": {"version": 1},
        "settings": {"theme": "dark"},
        "items": [{"id": "x"}, {"id": "y"}],
    }
    errs = walk_and_validate(data)
    assert errs == [], f"Unrelated nested objects without painPointTags should pass, got {errs}"


def test_deeply_nested_tags():
    data = {"a": {"b": {"c": {"d": {"painPointTags": ["tone"]}}}}}
    errs = walk_and_validate(data)
    assert errs == [], f"Deeply nested valid should pass, got {errs}"


def test_deeply_nested_invalid():
    data = {"a": {"b": {"c": {"d": {"painPointTags": ["ton"]}}}}}
    errs = walk_and_validate(data)
    assert len(errs) >= 1, f"Deeply nested invalid should fail, got {errs}"


def test_missing_check_arg_exits_two():
    """--check without a file argument prints usage and exits with code 2."""
    import subprocess
    result = subprocess.run(
        [sys.executable, __file__, "--check"],
        capture_output=True, text=True,
    )
    assert result.returncode == 2, f"Expected exit 2, got {result.returncode}"
    assert "Usage:" in result.stderr, f"Expected usage in stderr, got: {result.stderr}"


def test_check_missing_file_exits_two():
    """--check on a nonexistent file exits 2 with a clean stderr message."""
    import subprocess
    result = subprocess.run(
        [sys.executable, __file__, "--check", "/nonexistent/path/to/file.json"],
        capture_output=True, text=True,
    )
    assert result.returncode == 2, f"Expected exit 2, got {result.returncode}"
    assert "not found" in result.stderr, f"Expected 'not found' in stderr, got: {result.stderr}"


def test_check_invalid_json_exits_two():
    """--check on a malformed JSON file exits 2 rather than raising a traceback."""
    import subprocess
    import tempfile
    import os
    with tempfile.TemporaryDirectory() as td:
        bad = os.path.join(td, "bad.json")
        with open(bad, "w", encoding="utf-8") as f:
            f.write("{not valid json")
        result = subprocess.run(
            [sys.executable, __file__, "--check", bad],
            capture_output=True, text=True,
        )
    assert result.returncode == 2, f"Expected exit 2, got {result.returncode}"
    assert "not valid JSON" in result.stderr, f"Expected JSON error in stderr, got: {result.stderr}"


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
        test_non_string_tag,
        test_empty_tags_absent,
        test_nested_valid_tags_pass,
        test_nested_invalid_tag_fails,
        test_nested_duplicate_tags_fail,
        test_nested_non_list_tags_fail,
        test_content_bundle_multiple_items,
        test_content_bundle_one_invalid_fails,
        test_unrelated_nested_no_tags_pass,
        test_deeply_nested_tags,
        test_deeply_nested_invalid,
        test_missing_check_arg_exits_two,
        test_check_missing_file_exits_two,
        test_check_invalid_json_exits_two,
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


def load_content_file(filepath):
    """Read and parse a JSON content file.

    Exits with code 2 and a clean stderr message on a missing file, an
    unreadable file, or invalid JSON, so I/O failures are not conflated
    with content validation failures (exit code 1) or dumped as tracebacks.
    """
    try:
        with open(filepath, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: file not found: {filepath}", file=sys.stderr)
        sys.exit(2)
    except OSError as e:
        print(f"Error: could not read {filepath}: {e}", file=sys.stderr)
        sys.exit(2)
    except json.JSONDecodeError as e:
        print(f"Error: {filepath} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(2)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        if len(sys.argv) < 3:
            print("Usage: python3 scripts/validate-pain-points.py --check <file>", file=sys.stderr)
            sys.exit(2)
        filepath = sys.argv[2]
        data = load_content_file(filepath)
        errors = walk_and_validate(data)
        for e in errors:
            print(f"{filepath}: {e}")
        sys.exit(1 if errors else 0)
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
