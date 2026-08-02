#!/usr/bin/env python3
"""Build the deterministic production learner manifest for Issue #201.

Reads the committed complete preview corpus
(data/teacher-vocabulary-preview/preview-corpus.json) and the immutable
production teacher-vocabulary contract, selects every row with a deployed,
usable image, freezes a stable learner ID for each, and writes the
machine-readable production learner manifest.

This ticket only freezes the production eligibility and learner-ID contract.
It does not wire any learner route, loader, session, or progress.

Usage:
  uv run --locked python scripts/build-teacher-learner-manifest.py --write # write manifest
  uv run --locked python scripts/build-teacher-learner-manifest.py --test   # run self-tests
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CORPUS_PATH = REPO_ROOT / "data/teacher-vocabulary-preview/preview-corpus.json"
PRODUCTION_VOCAB_PATH = REPO_ROOT / "data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json"
OUTPUT_PATH = REPO_ROOT / "data/teacher-vocabulary-preview/learner-manifest.json"
PUBLIC_ROOT = REPO_ROOT / "public"

VALID_IMAGE_STATES = ("teacher-mapped", "ai-generated")
KNOWN_NON_IMAGE_STATES = ("text-only", "ambiguous", "unsuitable", "ai-pending", "skipped")
PRODUCTION_ID_PATTERN = re.compile(r"^teacher-star-1-[0-9a-f]{12}$")
PREVIEW_ID_PATTERN = re.compile(r"^teacher-preview-[0-9a-f]{16}$")
LEARNER_ID_PREFIX = "teacher-learner-"


def normalize(value: Any) -> str:
    value = "" if value is None else str(value)
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip())


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_production_ids() -> tuple[str, ...]:
    data = json.loads(PRODUCTION_VOCAB_PATH.read_text(encoding="utf-8"))
    records = data["vocabulary"]
    if len(records) != 20:
        raise ValueError("Production teacher baseline is not the immutable 20-row contract")
    return tuple(record["id"] for record in records)


def load_tracked_files(repo_root: Path = REPO_ROOT) -> frozenset[str]:
    """Return repo-relative paths of every Git-tracked file (NUL-delimited).

    Uses `git ls-files -z` with a non-shell invocation (no shell injection
    surface). A clean canonical checkout lists the full committed asset surface;
    an untracked WebP in a dirty worktree is absent and fails closed.
    """
    result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "-z"],
        capture_output=True,
        check=True,
        text=True,
    )
    return frozenset(result.stdout.split("\x00"))


def learner_id(row: dict[str, Any]) -> str:
    """Deterministic, build-stable learner ID from frozen source identity.

    Production rows keep their frozen production ID. Every other row derives an
    ID from sourceSheet/sourceRow/simplified — never from array position, sort
    order, randomness, or filesystem traversal order.
    """
    production_id = row.get("productionVocabularyId")
    if production_id:
        return production_id
    seed = f"teacher-learner-v1|{row['sourceSheet']}|{row['sourceRow']}|{normalize(row['simplified'])}"
    return f"{LEARNER_ID_PREFIX}{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"


def is_eligible(row: dict[str, Any]) -> bool:
    image = row.get("image") or {}
    return image.get("state") in VALID_IMAGE_STATES and bool(image.get("assetPath"))


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(raw, encoding="utf-8")
    temp.replace(path)


def build(
    corpus: dict[str, Any],
    *,
    production_ids: tuple[str, ...] = (),
    public_root: Path = PUBLIC_ROOT,
    tracked_files: frozenset[str] | None = None,
    output_path: Path | None = None,
) -> dict[str, Any]:
    rows = corpus["rows"]

    # The eligible asset must be both present on disk AND tracked by Git, so a
    # dirty-worktree WebP (present locally but absent from the deployment
    # checkout) cannot leak into the manifest.
    if tracked_files is None:
        tracked_files = load_tracked_files()

    # Cross-check image-state/asset consistency across the whole corpus so a
    # contradictory row fails closed instead of silently slipping through.
    for row in rows:
        image = row.get("image") or {}
        state = image.get("state")
        has_asset = bool(image.get("assetPath"))
        if state in VALID_IMAGE_STATES and not has_asset:
            raise ValueError(f"Row '{row['id']}' is {state} but has no assetPath")
        if has_asset and state not in VALID_IMAGE_STATES:
            raise ValueError(f"Row '{row['id']}' has an assetPath but an invalid image state '{state}'")
        if state not in VALID_IMAGE_STATES and state not in KNOWN_NON_IMAGE_STATES:
            raise ValueError(f"Row '{row['id']}' has an unknown image state '{state}'")

    eligible_rows = [row for row in rows if is_eligible(row)]

    # Fail closed on duplicate learner IDs, duplicate source identities,
    # missing assets, and invalid identities.
    learner_ids: set[str] = set()
    source_keys: set[tuple[str, int]] = set()
    for row in eligible_rows:
        identity = learner_id(row)
        if identity in learner_ids:
            raise ValueError(f"Duplicate learner ID '{identity}'")
        learner_ids.add(identity)
        source_key = (row["sourceSheet"], row["sourceRow"])
        if source_key in source_keys:
            raise ValueError(
                f"Duplicate source identity '{source_key[0]}:{source_key[1]}' for learner '{identity}'"
            )
        source_keys.add(source_key)

        image = row["image"]
        asset_path = image["assetPath"]
        repo_relative = f"public{asset_path}"
        if not (public_root / asset_path.lstrip("/")).is_file():
            raise ValueError(f"Row '{row['id']}' references missing asset '{asset_path}'")
        if repo_relative not in tracked_files:
            raise ValueError(
                f"Row '{row['id']}' references asset '{asset_path}' that is not a tracked Git file"
            )
        # A tracked-but-corrupt asset (replaced bytes at the same path) must
        # fail closed against the committed corpus checksum, so a damaged WebP
        # cannot be labeled a deployable teaching asset.
        expected_checksum = image.get("assetChecksumSha256")
        if expected_checksum:
            actual = sha256_file(public_root / asset_path.lstrip("/"))
            if actual != expected_checksum:
                raise ValueError(
                    f"Row '{row['id']}' asset '{asset_path}' checksum drift: "
                    f"expected {expected_checksum}, got {actual}"
                )

        state = image["state"]
        provenance = image.get("provenance")
        if state == "teacher-mapped" and provenance != "teacher-provided":
            raise ValueError(f"Row '{row['id']}' teacher-mapped provenance must be 'teacher-provided'")
        if state == "ai-generated" and provenance != "ai-generated":
            raise ValueError(f"Row '{row['id']}' ai-generated provenance must be 'ai-generated'")

        if row.get("productionVocabularyId"):
            if row["id"] != row["productionVocabularyId"]:
                raise ValueError(
                    f"Row '{row['id']}' id must equal its productionVocabularyId"
                )
            if not PRODUCTION_ID_PATTERN.match(row["productionVocabularyId"]):
                raise ValueError(f"Invalid production identity '{row['productionVocabularyId']}'")
        elif not PREVIEW_ID_PATTERN.match(row["id"]):
            raise ValueError(f"Invalid preview identity '{row['id']}'")

    # Preserve truthful optional values; keep missing fields absent rather than
    # fabricating a fallback.
    def row_payload(row: dict[str, Any]) -> dict[str, Any]:
        image = row["image"]
        payload: dict[str, Any] = {
            "learnerId": learner_id(row),
            "simplified": row["simplified"],
            "partOfSpeech": row["partOfSpeech"],
            "sourceSheet": row["sourceSheet"],
            "sourceRow": row["sourceRow"],
        }
        for field in ("traditional", "pinyin", "japanese", "difficulty"):
            value = row.get(field)
            if value:
                payload[field] = value
        payload["image"] = {
            "state": image["state"],
            "assetPath": image["assetPath"],
            "provenance": image["provenance"],
        }
        return payload

    ordered = sorted(eligible_rows, key=lambda row: (row["sourceSheet"], row["sourceRow"]))

    resolved_production_ids = production_ids or load_production_ids()
    resolved_production_set = set(resolved_production_ids)
    eligible_production = {row["id"] for row in eligible_rows if row.get("productionVocabularyId")}
    excluded_production = sorted(resolved_production_set - eligible_production)
    preserved = sum(1 for row in eligible_rows if row.get("productionVocabularyId"))

    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "source": {
            "previewCorpusPath": "data/teacher-vocabulary-preview/preview-corpus.json",
            "previewCorpusSchemaVersion": corpus["schemaVersion"],
            "workbookSha256": corpus["workbook"]["sha256"],
            "teacherImagePackageFingerprintSha256": corpus["teacherImagePackage"]["pathSensitiveFingerprintSha256"],
        },
        "productionContract": {
            "count": len(resolved_production_ids),
            "preserved": preserved,
            "excluded": len(excluded_production),
            "ids": list(resolved_production_ids),
            "excludedIds": excluded_production,
        },
        "totals": {
            "eligible": len(eligible_rows),
            "excluded": len(rows) - len(eligible_rows),
            "teacher": sum(1 for row in eligible_rows if row["image"]["state"] == "teacher-mapped"),
            "ai": sum(1 for row in eligible_rows if row["image"]["state"] == "ai-generated"),
            "originalProductionIds": len(resolved_production_ids),
            "preservedProductionIds": preserved,
        },
        "rows": [row_payload(row) for row in ordered],
    }

    if output_path is not None:
        atomic_json(output_path, payload)
    return payload


def load_corpus() -> dict[str, Any]:
    return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


def run_self_tests() -> int:
    failures = 0

    def check(description: str, ok: bool) -> None:
        nonlocal failures
        if ok:
            print(f"  PASS  {description}")
        else:
            print(f"  FAIL  {description}")
            failures += 1

    def expect_raises(description: str, expected: str, fn: Any) -> None:
        nonlocal failures
        try:
            fn()
            print(f"  FAIL  {description}: expected ValueError containing {expected!r}, none raised")
            failures += 1
        except ValueError as exc:
            if expected in str(exc):
                print(f"  PASS  {description}")
            else:
                print(f"  FAIL  {description}: unexpected message {exc}")
                failures += 1

    corpus = load_corpus()
    production_ids = load_production_ids()

    # ── Real corpus reconciliation (regression assertion, not selection logic) ──
    real = build(corpus, production_ids=production_ids, public_root=PUBLIC_ROOT)
    check("real corpus yields 1582 eligible rows", real["totals"]["eligible"] == 1582)
    check("real corpus yields 283 excluded rows", real["totals"]["excluded"] == 283)
    check("real corpus yields 1150 teacher rows", real["totals"]["teacher"] == 1150)
    check("real corpus yields 432 AI rows", real["totals"]["ai"] == 432)
    check("real corpus preserves 19 image-bearing production IDs", real["totals"]["preservedProductionIds"] == 19)
    check("real corpus learner IDs are unique", len({r["learnerId"] for r in real["rows"]}) == len(real["rows"]))
    check("real corpus preserves every image-bearing production ID",
          set(production_ids) & {r["learnerId"] for r in real["rows"]} == set(production_ids) - set(real["productionContract"]["excludedIds"]))
    check("real corpus excludes exactly the text-only production ID",
          real["productionContract"]["excludedIds"] == ["teacher-star-1-8b957a100bd4"])
    check("real corpus production contract freezes all 20 IDs",
          set(real["productionContract"]["ids"]) == set(production_ids) and len(real["productionContract"]["ids"]) == 20)
    # Output order is frozen by (sourceSheet, sourceRow), so a row-ordered pass
    # over the same rows yields the same ordering regardless of input order.
    reversed_real = build({"schemaVersion": corpus["schemaVersion"], "workbook": corpus["workbook"],
                            "teacherImagePackage": corpus["teacherImagePackage"],
                            "totals": corpus["totals"], "rows": list(reversed(corpus["rows"]))},
                           production_ids=production_ids, public_root=PUBLIC_ROOT)
    check("real corpus output is independent of input row order",
          json.dumps(real, ensure_ascii=False) == json.dumps(reversed_real, ensure_ascii=False))

    # ── Synthetic corpus proves selection/counting is derived, not hard-coded ──
    def synthetic(eligible: int, excluded: int) -> dict[str, Any]:
        rows: list[dict[str, Any]] = []
        for i in range(1, eligible + excluded + 1):
            is_eligible_row = i <= eligible
            row = {
                "id": f"teacher-preview-{i:016x}",
                "simplified": f"詞{i}",
                "pinyin": "x" if i % 2 else None,
                "partOfSpeech": "noun",
                "sourceSheet": "名词1",
                "sourceRow": i,
                "reviewStatus": "draft",
            }
            if is_eligible_row:
                row["image"] = {
                    "state": "teacher-mapped",
                    "provenance": "teacher-provided",
                    "assetPath": f"/assets/vocabulary/teacher-preview/teacher/synthetic-{i:04d}.webp",
                }
            else:
                row["image"] = {"state": "text-only", "provenance": None}
            rows.append(row)
        return {
            "schemaVersion": 1,
            "workbook": {"basename": "synthetic.xlsx", "sha256": "0" * 64, "candidateRows": len(rows)},
            "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
            "totals": {"usableRows": len(rows)},
            "rows": rows,
        }

    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        public_root = tmp_root / "public"
        (public_root / "assets/vocabulary/teacher-preview/teacher").mkdir(parents=True, exist_ok=True)
        for i in range(1, 100):
            (public_root / "assets/vocabulary/teacher-preview/teacher" / f"synthetic-{i:04d}.webp").write_bytes(b"x")
        synthetic_tracked = frozenset(
            f"public/assets/vocabulary/teacher-preview/teacher/synthetic-{i:04d}.webp" for i in range(1, 100)
        )

        small = build(synthetic(5, 2), production_ids=(), public_root=public_root, tracked_files=synthetic_tracked)
        large = build(synthetic(17, 3), production_ids=(), public_root=public_root, tracked_files=synthetic_tracked)
        check("synthetic corpus counts scale with input (5 eligible / 2 excluded)", small["totals"]["eligible"] == 5 and small["totals"]["excluded"] == 2)
        check("synthetic corpus counts scale with input (17 eligible / 3 excluded)", large["totals"]["eligible"] == 17 and large["totals"]["excluded"] == 3)

        # ── Input-order independence ──
        base_rows = synthetic(8, 2)["rows"]
        forward = build({"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 10},
                          "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
                          "totals": {"usableRows": 10}, "rows": base_rows},
                         production_ids=(), public_root=public_root, tracked_files=synthetic_tracked)
        reversed_rows = list(reversed(base_rows))
        backward = build({"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 10},
                           "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
                           "totals": {"usableRows": 10}, "rows": reversed_rows},
                          production_ids=(), public_root=public_root, tracked_files=synthetic_tracked)
        forward_raw = json.dumps(forward, ensure_ascii=False, indent=2)
        backward_raw = json.dumps(backward, ensure_ascii=False, indent=2)
        check("reversing input row order yields byte-identical output", forward_raw == backward_raw)

        # ── Negative: missing asset ──
        bad_asset_rows = synthetic(1, 0)["rows"]
        bad_asset_rows[0]["image"]["assetPath"] = "/assets/vocabulary/teacher-preview/teacher/nope.webp"
        expect_raises("missing asset fails closed", "missing asset", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 1},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 1}, "rows": bad_asset_rows},
            production_ids=(), public_root=public_root, tracked_files=synthetic_tracked))

        # ── Negative: untracked asset (present on disk but not in Git) ──
        untracked_rows = synthetic(1, 0)["rows"]
        untracked_rows[0]["image"]["assetPath"] = "/assets/vocabulary/teacher-preview/teacher/synthetic-0001.webp"
        # File exists on disk, but the tracked set deliberately omits it.
        expect_raises("untracked asset fails closed", "not a tracked Git file", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 1},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 1}, "rows": untracked_rows},
            production_ids=(), public_root=public_root,
            tracked_files=synthetic_tracked - {"public/assets/vocabulary/teacher-preview/teacher/synthetic-0001.webp"}))

        # ── Negative: tracked-but-corrupt asset (checksum drift) ──
        corrupt_rows = synthetic(1, 0)["rows"]
        corrupt_rows[0]["image"]["assetPath"] = "/assets/vocabulary/teacher-preview/teacher/synthetic-0002.webp"
        # The file is tracked and exists, but its committed checksum differs.
        corrupt_rows[0]["image"]["assetChecksumSha256"] = "0" * 64
        expect_raises("tracked-but-corrupt asset fails closed", "checksum drift", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 1},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 1}, "rows": corrupt_rows},
            production_ids=(), public_root=public_root, tracked_files=synthetic_tracked))

        # ── Negative: duplicate learner ID (same production ID on two rows) ──
        dup_id_rows = synthetic(2, 0)["rows"]
        dup_id_rows[0]["productionVocabularyId"] = "teacher-star-1-aaaaaaaaaaaa"
        dup_id_rows[0]["id"] = "teacher-star-1-aaaaaaaaaaaa"
        dup_id_rows[1]["productionVocabularyId"] = "teacher-star-1-aaaaaaaaaaaa"
        dup_id_rows[1]["id"] = "teacher-star-1-aaaaaaaaaaaa"
        expect_raises("duplicate learner ID fails closed", "Duplicate learner ID", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 2},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 2}, "rows": dup_id_rows},
            production_ids=(), public_root=public_root, tracked_files=synthetic_tracked))

        # ── Negative: duplicate source identity ──
        dup_source_rows = synthetic(2, 0)["rows"]
        dup_source_rows[1]["sourceSheet"] = dup_source_rows[0]["sourceSheet"]
        dup_source_rows[1]["sourceRow"] = dup_source_rows[0]["sourceRow"]
        expect_raises("duplicate source identity fails closed", "Duplicate source identity", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 2},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 2}, "rows": dup_source_rows},
            production_ids=(), public_root=public_root, tracked_files=synthetic_tracked))

        # ── Negative: invalid identity ──
        bad_id_rows = synthetic(1, 0)["rows"]
        bad_id_rows[0]["id"] = "not-a-stable-id"
        expect_raises("invalid identity fails closed", "Invalid preview identity", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 1},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 1}, "rows": bad_id_rows},
            production_ids=(), public_root=public_root, tracked_files=synthetic_tracked))

        # ── Negative: invalid image state with asset ──
        bad_state_rows = synthetic(1, 0)["rows"]
        bad_state_rows[0]["image"]["state"] = "text-only"
        expect_raises("invalid image state with asset fails closed", "invalid image state", lambda: build(
            {"schemaVersion": 1, "workbook": {"basename": "x", "sha256": "0" * 64, "candidateRows": 1},
             "teacherImagePackage": {"readableImages": 0, "pathSensitiveFingerprintSha256": "0" * 64},
             "totals": {"usableRows": 1}, "rows": bad_state_rows},
            production_ids=(), public_root=public_root, tracked_files=synthetic_tracked))

    # ── Generated output drift: committed manifest must match a fresh run ──
    if not OUTPUT_PATH.is_file():
        print("  FAIL  committed learner-manifest.json is missing")
        failures += 1
    else:
        expected = build(corpus, production_ids=production_ids, public_root=PUBLIC_ROOT)
        expected_raw = json.dumps(expected, ensure_ascii=False, indent=2) + "\n"
        actual_raw = OUTPUT_PATH.read_text(encoding="utf-8")
        check("regenerated output is byte-identical to committed manifest", expected_raw == actual_raw)

    # ── CLI contract: the documented canonical `--write` command must run and
    #    produce output byte-identical to the committed manifest, without
    #    touching the committed file during --test. ──
    import subprocess as _sp
    import sys as _sys
    with tempfile.TemporaryDirectory() as _tmp:
        _cli_out = Path(_tmp) / "learner-manifest.json"
        cli = _sp.run(
            [_sys.executable, str(Path(__file__).resolve()), "--write", "--output", str(_cli_out)],
            capture_output=True, text=True, cwd=REPO_ROOT,
        )
        if cli.returncode != 0:
            print(f"  FAIL  canonical --write CLI exited {cli.returncode}: {cli.stderr.strip()}")
            failures += 1
        elif not _cli_out.is_file():
            print("  FAIL  canonical --write CLI produced no output file")
            failures += 1
        else:
            after = _cli_out.read_text(encoding="utf-8")
            check("canonical --write CLI output is byte-identical to committed manifest", after == actual_raw)

    if failures:
        print(f"{failures} self-test failure(s)")
        return 1
    print("All learner-manifest self-tests PASSED")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the #201 production learner manifest")
    parser.add_argument("--test", action="store_true", help="Run read-only self-tests")
    parser.add_argument("--write", action="store_true", help="Write the manifest (default off; explicit write mode)")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="Manifest output path (default committed learner-manifest.json)")
    args = parser.parse_args()

    if args.test:
        return run_self_tests()
    if not args.write:
        parser.error("--write is required; this explicit mode prevents accidental writes")
    corpus = load_corpus()
    build(corpus, production_ids=load_production_ids(), public_root=PUBLIC_ROOT, output_path=args.output)
    payload = json.loads(args.output.read_text(encoding="utf-8"))
    print(json.dumps(payload["totals"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
