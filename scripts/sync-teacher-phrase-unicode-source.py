#!/usr/bin/env python3
"""Sync the teacher phrase projection checksum in the Unicode source manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "data/unicode/source-manifest.json"
DEFAULT_PROJECTION = (
    REPO_ROOT
    / "data/teacher-vocabulary-preview/teacher-phrase-promoted.json"
)
SOURCE_ID = "teacher-phrase-promoted-v1"
SOURCE_PATH = "data/teacher-vocabulary-preview/teacher-phrase-promoted.json"
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")


class SyncError(ValueError):
    """Raised when the narrow Unicode source binding cannot be updated safely."""


def _target_source(manifest: dict[str, Any]) -> dict[str, Any]:
    sources = manifest.get("sources")
    if not isinstance(sources, list):
        raise SyncError("Unicode source manifest sources must be an array")
    matches = [
        source
        for source in sources
        if isinstance(source, dict) and source.get("id") == SOURCE_ID
    ]
    if len(matches) != 1:
        raise SyncError(f"Unicode source manifest needs exactly one '{SOURCE_ID}' entry")
    source = matches[0]
    if source.get("path") != SOURCE_PATH:
        raise SyncError(f"Unicode source '{SOURCE_ID}' has the wrong path")
    digest = source.get("sha256")
    if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
        raise SyncError(f"Unicode source '{SOURCE_ID}' has a malformed checksum")
    return source


def sync_manifest_bytes(raw: bytes, projection_digest: str) -> bytes:
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SyncError(f"Unicode source manifest is not valid UTF-8 JSON: {error}") from error
    if not isinstance(manifest, dict):
        raise SyncError("Unicode source manifest must be an object")
    source = _target_source(manifest)
    current_digest = source["sha256"]
    if current_digest == projection_digest:
        return raw

    id_token = f'"id": "{SOURCE_ID}"'.encode()
    if raw.count(id_token) != 1:
        raise SyncError("Unicode source manifest target formatting is not canonical")
    id_start = raw.index(id_token)
    next_id = raw.find(b'"id": "', id_start + len(id_token))
    block_end = len(raw) if next_id == -1 else next_id
    path_token = f'"path": "{SOURCE_PATH}"'.encode()
    if raw.find(path_token, id_start, block_end) == -1:
        raise SyncError("Unicode source manifest target path formatting is not canonical")
    checksum_prefix = b'"sha256": "'
    checksum_label = raw.find(checksum_prefix, id_start, block_end)
    if checksum_label == -1:
        raise SyncError("Unicode source manifest target checksum formatting is not canonical")
    digest_start = checksum_label + len(checksum_prefix)
    digest_end = digest_start + 64
    if raw[digest_start:digest_end].decode("ascii", errors="ignore") != current_digest:
        raise SyncError("Unicode source manifest parsed and serialized checksums disagree")
    return raw[:digest_start] + projection_digest.encode() + raw[digest_end:]


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync the teacher phrase projection Unicode source checksum"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--projection", type=Path, default=DEFAULT_PROJECTION)
    args = parser.parse_args()
    try:
        raw = args.manifest.read_bytes()
        projection_digest = hashlib.sha256(args.projection.read_bytes()).hexdigest()
        expected = sync_manifest_bytes(raw, projection_digest)
        if args.check:
            if expected != raw:
                raise SyncError(
                    f"Unicode source checksum is stale for {SOURCE_ID}"
                )
            print("Teacher phrase Unicode source checksum is current")
            return 0
        if expected != raw:
            atomic_write(args.manifest, expected)
        print("Teacher phrase Unicode source checksum synchronized")
        return 0
    except (OSError, SyncError) as error:
        print(f"Teacher phrase Unicode source sync failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
