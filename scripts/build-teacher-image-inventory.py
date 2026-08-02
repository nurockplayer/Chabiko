#!/usr/bin/env python3
"""Build the deterministic teacher-image inventory for the complete-preview build.

Scans a teacher-image directory and emits the JSON inventory consumed by
scripts/build-teacher-vocabulary-complete-preview.py. The inventory is a
temporary local artifact: it must never be committed and contains no absolute
paths.

Usage:
  uv run --locked python scripts/build-teacher-image-inventory.py \
    --source-dir /path/to/词汇表 \
    --output /tmp/chabiko_teacher_image_inventory.json

Canonical workflow (Issue #185/#193):
  1. Workbook: repository-root 单词表(带图).xlsx (ignore the non-canonical copy
     under 词汇表/).
  2. Generate the temporary inventory:
     uv run --locked python scripts/build-teacher-image-inventory.py \
       --source-dir /path/to/词汇表 --output /tmp/chabiko_teacher_image_inventory.json
  3. Build the complete preview:
     uv run --locked python scripts/build-teacher-vocabulary-complete-preview.py \
       --workbook ./单词表(带图).xlsx --source-dir /path/to/词汇表 \
       --inventory /tmp/chabiko_teacher_image_inventory.json --build

Deterministic fingerprint: for the readable images, sort lines of the form
"{sha256}  {relative_path}" (two spaces) and take the SHA-256 of the joined
lines. For the canonical package this reproduces readable_images=1240 and
fingerprint_withpaths=592cee9f32419b4b3571146d72c8710cd9f1edc5e02150c48178011a5a8b1517.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import PIL.Image
from PIL import Image, UnidentifiedImageError


IMAGE_EXTS = frozenset({
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
    ".tif", ".tiff", ".svg", ".heic", ".avif",
})

EXPECTED_IMAGE_FINGERPRINT = "592cee9f32419b4b3571146d72c8710cd9f1edc5e02150c48178011a5a8b1517"
EXPECTED_IMAGE_COUNT = 1240


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def scan_directory(source_dir: Path) -> list[dict[str, Any]]:
    """Record every non-.DS_Store file under source_dir using POSIX relative paths."""
    records: list[dict[str, Any]] = []
    for dirpath, dirnames, filenames in os.walk(source_dir):
        dirnames.sort()
        for filename in sorted(filenames):
            if filename == ".DS_Store":
                continue
            absolute = Path(dirpath) / filename
            rel = absolute.relative_to(source_dir).as_posix()
            ext = absolute.suffix.lower()
            stat = absolute.stat()
            record: dict[str, Any] = {
                "rel": rel,
                "dir": os.path.dirname(rel),
                "base": os.path.basename(rel),
                "ext": ext,
                "size": stat.st_size,
                "sha256": sha256_file(absolute),
            }
            if ext in IMAGE_EXTS:
                try:
                    with Image.open(absolute) as image:
                        image.load()
                        record.update({
                            "fmt": image.format,
                            "width": image.width,
                            "height": image.height,
                            "mode": image.mode,
                            "readable": True,
                        })
                except (UnidentifiedImageError, OSError, PIL.Image.DecompressionBombError) as exc:
                    record.update({
                        "fmt": None, "width": None, "height": None,
                        "readable": False, "error": str(exc),
                    })
            else:
                record.update({
                    "fmt": None, "width": None, "height": None, "readable": False,
                })
            records.append(record)
    return records


def build_inventory(source_dir: Path) -> dict[str, Any]:
    records = scan_directory(source_dir)
    readable = [record for record in records if record.get("readable")]
    unreadable = [record for record in records if not record.get("readable")]

    # Duplicate groups: checksum -> sorted relative paths (only for readable images).
    by_checksum: dict[str, list[str]] = defaultdict(list)
    for record in readable:
        by_checksum[record["sha256"]].append(record["rel"])
    duplicate_groups = {
        checksum: sorted(paths)
        for checksum, paths in by_checksum.items()
        if len(paths) > 1
    }

    formats: dict[str, int] = defaultdict(int)
    for record in readable:
        formats[record["fmt"]] += 1

    widths = [record["width"] for record in readable]
    heights = [record["height"] for record in readable]
    dimension_min_max = (
        {
            "width": [min(widths), max(widths)],
            "height": [min(heights), max(heights)],
        }
        if readable else {"width": [], "height": []}
    )
    dimension_mode: dict[str, int] = defaultdict(int)
    for record in readable:
        dimension_mode[f"{record['width']}x{record['height']}"] += 1

    # Deterministic fingerprint: readable images sorted by the full
    # "{sha256}  {relative_path}" line, joined with newlines.
    fingerprint_entries = sorted(f"{record['sha256']}  {record['rel']}" for record in readable)
    fingerprint_withpaths = hashlib.sha256("\n".join(fingerprint_entries).encode("utf-8")).hexdigest()

    sha_only = sorted(record["sha256"] for record in readable)
    fingerprint_sha256sorted = hashlib.sha256("\n".join(sha_only).encode("utf-8")).hexdigest()

    return {
        "total_files": len(records),
        "readable_images": len(readable),
        "unreadable_or_nonimage": len(unreadable),
        "formats": dict(formats),
        "dimension_min_max": dimension_min_max,
        "dimension_mode": dict(dimension_mode),
        "duplicate_groups": dict(duplicate_groups),
        "duplicate_group_count": len(duplicate_groups),
        "duplicate_extra_copies": sum(len(paths) - 1 for paths in duplicate_groups.values()),
        "unreadable_files": [record["rel"] for record in unreadable],
        "fingerprint_sha256sorted": fingerprint_sha256sorted,
        "fingerprint_withpaths": fingerprint_withpaths,
        "records": records,
    }


def run_self_tests() -> int:
    import tempfile

    failures = 0

    def check(description: str, ok: bool) -> None:
        nonlocal failures
        if ok:
            print(f"  PASS  {description}")
        else:
            print(f"  FAIL  {description}")
            failures += 1

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        # Deterministic fixture: two real PNGs in two subdirectories, one duplicate.
        (root / "sub-a").mkdir()
        (root / "sub-b").mkdir()
        from PIL import Image as PILImage
        PILImage.new("RGB", (10, 10), (255, 0, 0)).save(root / "sub-a" / "one.png")
        PILImage.new("RGB", (20, 20), (0, 255, 0)).save(root / "sub-b" / "two.png")
        # Non-image file must be listed but unreadable.
        (root / "note.txt").write_text("not an image", encoding="utf-8")

        inv = build_inventory(root)
        records = inv["records"]
        check("scans all files with POSIX relative paths", len(records) == 3)
        rels = sorted(record["rel"] for record in records)
        check("relative paths use forward slashes and no absolute prefix",
              all(not rel.startswith("/") and "\\" not in rel for rel in rels))

        readable = [record for record in records if record.get("readable")]
        check("readable images counted", len(readable) == 2)
        check("non-image file is unreadable", inv["unreadable_or_nonimage"] == 1)

        # Duplicate groups: identical bytes in different paths form a group.
        dup_bytes = (root / "sub-a" / "one.png").read_bytes()
        (root / "sub-a" / "copy.png").write_bytes(dup_bytes)
        inv2 = build_inventory(root)
        dup_sha = hashlib.sha256(dup_bytes).hexdigest()
        dup_group = inv2["duplicate_groups"].get(dup_sha, [])
        check("byte-identical files form a duplicate group",
              sorted(dup_group) == ["sub-a/copy.png", "sub-a/one.png"])
        check("duplicate_group_count reflects the group", inv2["duplicate_group_count"] == 1)

        # Deterministic fingerprint: recomputing yields the same value and is
        # stable against filesystem ordering because it sorts the lines.
        inv3 = build_inventory(root)
        check("fingerprint_withpaths is deterministic",
              inv2["fingerprint_withpaths"] == inv3["fingerprint_withpaths"])
        expected_fp = hashlib.sha256("\n".join(
            sorted(f"{record['sha256']}  {record['rel']}"
                   for record in [r for r in inv2["records"] if r.get("readable")])
        ).encode("utf-8")).hexdigest()
        check("fingerprint_withpaths formula matches", inv2["fingerprint_withpaths"] == expected_fp)

        # No absolute paths anywhere in the serialized inventory.
        serialized = json.dumps(inv2, ensure_ascii=False)
        check("inventory contains no absolute paths", tmp not in serialized and "/" + str(root.name) not in serialized)

    if failures:
        print(f"\n{failures} inventory test(s) FAILED")
    else:
        print("\nAll teacher-image inventory tests PASSED")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the deterministic teacher-image inventory")
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--test", action="store_true", help="Run read-only inventory self-tests")
    args = parser.parse_args()
    if args.test:
        return run_self_tests()
    if not (args.source_dir and args.output):
        parser.error("--source-dir and --output are required")
    source_dir = args.source_dir.resolve()
    if not source_dir.is_dir():
        parser.error(f"--source-dir: not a directory: {source_dir}")
    inventory = build_inventory(source_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(inventory, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({
        "total_files": inventory["total_files"],
        "readable_images": inventory["readable_images"],
        "fingerprint_withpaths": inventory["fingerprint_withpaths"],
        "output": str(args.output),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
