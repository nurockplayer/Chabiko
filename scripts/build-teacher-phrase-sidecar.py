#!/usr/bin/env python3
"""Build or check the teacher phrase authoring sidecar from its raw workbook."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from teacher_phrase_sidecar import (
    ContractError,
    atomic_write_sidecar,
    refresh_sidecar,
    serialize_sidecar,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "data/teacher-vocabulary-preview/learner-manifest.json"
DEFAULT_OUTPUT = REPO_ROOT / "data/teacher-vocabulary-preview/teacher-phrase-authoring.json"
SELF_TEST = REPO_ROOT / "tests/python/test_teacher_phrase_sidecar.py"


def read_json_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractError(f"{path} must contain a JSON object")
    return value


def load_discriminators(path: Path | None) -> dict[str, dict[int, str]]:
    if path is None:
        return {}
    payload = read_json_object(path)
    if payload.get("contractId") != "teacher-phrase-duplicate-discriminators-v1":
        raise ContractError("unsupported duplicate discriminator contract")
    records = payload.get("records")
    if not isinstance(records, list):
        raise ContractError("duplicate discriminator records must be an array")
    result: dict[str, dict[int, str]] = {}
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("learnerId"), str):
            raise ContractError("duplicate discriminator record has an invalid learner ID")
        learner_id = record["learnerId"]
        if learner_id in result:
            raise ContractError(f"duplicate discriminator record for learner '{learner_id}'")
        occurrences = record.get("occurrences")
        if not isinstance(occurrences, list):
            raise ContractError(f"duplicate discriminator record '{learner_id}' needs occurrences")
        by_index: dict[int, str] = {}
        for occurrence in occurrences:
            if not isinstance(occurrence, dict):
                raise ContractError(f"duplicate discriminator occurrence for '{learner_id}' must be an object")
            index = occurrence.get("sourceUnitIndex")
            discriminator = occurrence.get("discriminator")
            if not isinstance(index, int) or index < 0 or index in by_index:
                raise ContractError(f"duplicate discriminator index for '{learner_id}' is invalid")
            if not isinstance(discriminator, str) or not discriminator.strip():
                raise ContractError(f"duplicate discriminator for '{learner_id}' must be non-empty")
            by_index[index] = discriminator
        result[learner_id] = by_index
    return result


def run_self_test() -> int:
    completed = subprocess.run(
        [sys.executable, str(SELF_TEST)],
        cwd=REPO_ROOT,
        check=False,
    )
    return completed.returncode


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build or validate the #478 teacher phrase authoring sidecar"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="atomically write the validated sidecar")
    mode.add_argument("--check", action="store_true", help="validate the sidecar and require canonical bytes")
    mode.add_argument("--test", action="store_true", help="run the sidecar contract self-tests")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--workbook", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--duplicate-discriminators", type=Path)
    args = parser.parse_args()

    if args.test:
        return run_self_test()
    if args.workbook is None:
        parser.error("--workbook is required with --write or --check")

    try:
        manifest = read_json_object(args.manifest)
        existing = read_json_object(args.output) if args.output.is_file() else None
        if args.check and existing is None:
            raise ContractError(f"sidecar output is missing: {args.output}")
        sidecar = refresh_sidecar(
            manifest,
            args.workbook,
            existing=existing,
            duplicate_discriminators=load_discriminators(args.duplicate_discriminators),
        )
        serialized = serialize_sidecar(sidecar)
        if args.check:
            if args.output.read_bytes() != serialized:
                raise ContractError(f"sidecar output is not canonically serialized: {args.output}")
            print(f"Teacher phrase sidecar is current: {len(sidecar['records'])} records")
            return 0
        atomic_write_sidecar(args.output, sidecar)
        print(f"Wrote teacher phrase sidecar: {len(sidecar['records'])} records")
        return 0
    except (ContractError, OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"Teacher phrase sidecar failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
