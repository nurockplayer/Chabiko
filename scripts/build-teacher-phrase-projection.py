#!/usr/bin/env python3
"""Build/check the teacher phrase learner projection through the human gate."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from teacher_phrase_promotion import (
    ContractError,
    atomic_write_projection,
    build_empty_projection,
    build_promoted_projection,
    initialize_empty_projection,
    serialize_projection,
    validate_promoted_projection,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "data/teacher-vocabulary-preview/learner-manifest.json"
DEFAULT_OUTPUT = REPO_ROOT / "data/teacher-vocabulary-preview/teacher-phrase-promoted.json"
SELF_TEST = REPO_ROOT / "tests/python/test_teacher_phrase_promotion.py"


def read_json_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractError(f"{path} must contain a JSON object")
    return value


def run_self_test() -> int:
    return subprocess.run(
        [sys.executable, str(SELF_TEST)],
        cwd=REPO_ROOT,
        check=False,
    ).returncode


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build or validate the #479 teacher phrase promoted projection"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="atomically write the projection")
    mode.add_argument("--check", action="store_true", help="require the canonical projection bytes")
    mode.add_argument("--test", action="store_true", help="run the promotion contract self-tests")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--workbook", type=Path)
    parser.add_argument("--sidecar", type=Path)
    parser.add_argument("--review", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--initialize-empty",
        action="store_true",
        help="allow --write to create the initial empty projection without authoring inputs",
    )
    args = parser.parse_args()

    if args.test:
        if args.initialize_empty:
            parser.error("--initialize-empty is only valid with --write")
        return run_self_test()

    authoring_inputs = (args.workbook, args.sidecar, args.review)
    if any(value is not None for value in authoring_inputs) and not all(
        value is not None for value in authoring_inputs
    ):
        parser.error("--workbook, --sidecar, and --review must be supplied together")
    has_authoring_inputs = all(value is not None for value in authoring_inputs)
    if args.initialize_empty and (not args.write or has_authoring_inputs):
        parser.error("--initialize-empty is only valid with no-input --write")

    try:
        manifest = read_json_object(args.manifest)
        if args.check and not has_authoring_inputs:
            projection = read_json_object(args.output)
            validate_promoted_projection(projection, manifest)
            if args.output.read_bytes() != serialize_projection(projection):
                raise ContractError(f"promoted projection is not canonical: {args.output}")
            print(f"Teacher phrase projection is valid: {len(projection['records'])} records")
            return 0
        if has_authoring_inputs:
            projection = build_promoted_projection(
                manifest,
                read_json_object(args.sidecar),
                read_json_object(args.review),
                args.workbook,
            )
        elif args.initialize_empty:
            projection = build_empty_projection(manifest)
        else:
            raise ContractError(
                "no-input --write is unsafe; use --initialize-empty for first creation "
                "or supply --workbook, --sidecar, and --review"
            )
        expected = serialize_projection(projection)
        if args.check:
            if not args.output.is_file() or args.output.read_bytes() != expected:
                raise ContractError(f"promoted projection is not current: {args.output}")
            print(f"Teacher phrase projection is current: {len(projection['records'])} records")
            return 0
        if args.initialize_empty:
            initialize_empty_projection(args.output, projection)
        else:
            atomic_write_projection(args.output, projection)
        print(f"Wrote teacher phrase projection: {len(projection['records'])} records")
        return 0
    except (ContractError, OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"Teacher phrase projection failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
