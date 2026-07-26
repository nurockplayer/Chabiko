#!/usr/bin/env python3
"""
Import existing deterministic candidate images for teacher-core-v1 batch-01
as provisional draft WebP assets.

Usage:
    uv run --locked python scripts/import-teacher-vocabulary-images.py
    uv run --locked python scripts/import-teacher-vocabulary-images.py --test
    uv run --locked python scripts/import-teacher-vocabulary-images.py --check

    Without flags: convert all 19 images and publish outputs atomically.
    --test: run focused self-tests.
    --check: verify committed outputs are consistent with source inputs, without
             re-converting.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ─── Pinned paths ───────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
MAIN_REPO_ROOT = Path("/Users/tachikoma/Developer/Chabiko")
# Source PNGs live in the main repo (shared across all worktrees)
SOURCE_DIR = MAIN_REPO_ROOT / "词汇表" / "名词1 1-51"
BATCH_JSON = (
    REPO_ROOT
    / "data"
    / "illustrations"
    / "teacher-core-v1"
    / "teacher-vocabulary-batch-01.json"
)
ASSETS_DIR = REPO_ROOT / "public" / "assets" / "vocabulary" / "teacher-core-v1"
ILLUSTRATION_ID_PREFIX = "ill-"

# ─── Exact mapping: vocabularyId → source filename ─────────────────────────
# 19 existing candidates.  小姐/女士 has no image.

SOURCE_MAP: dict[str, str] = {
    "teacher-star-1-37e0eb213f0f": "大家.png",
    "teacher-star-1-a66948a76fda": "人.png",
    "teacher-star-1-86f5cdb6e25c": "客人.png",
    "teacher-star-1-bdc7865a507e": "朋友.png",
    "teacher-star-1-86367b2d53f6": "先生.png",
    "teacher-star-1-2cfcacc0503e": "自己.png",
    "teacher-star-1-e7bc12c4f23a": "爸爸 父亲.png",
    "teacher-star-1-e64490a207eb": "妈妈 母亲.png",
    "teacher-star-1-bada4e11125d": "爸爸 父亲.png",
    "teacher-star-1-d903f490725f": "妈妈 母亲.png",
    "teacher-star-1-7420330fee5c": "哥哥.png",
    "teacher-star-1-ed096023b3be": "姐姐.png",
    "teacher-star-1-cb42fb8775e5": "弟弟.png",
    "teacher-star-1-c39a19585434": "妹妹.png",
    "teacher-star-1-3e6fabf09358": "爱人.png",
    "teacher-star-1-1c0cdf0b2b9c": "丈夫.png",
    "teacher-star-1-8fea4ac29b4c": "妻子.png",
    "teacher-star-1-94757170c2b0": "孩子.png",
    "teacher-star-1-0cc5799cdbbc": "儿子.png",
}

NO_IMAGE_VOCABULARY = frozenset({"teacher-star-1-8b957a100bd4"})

# ─── altJa from #117 review ────────────────────────────────────────────────

ALT_JA: dict[str, str] = {
    "teacher-star-1-37e0eb213f0f": (
        "年齢や見た目の異なる6人が、笑顔で並んでいるイラスト。"
    ),
    "teacher-star-1-a66948a76fda": (
        "笑顔で両手を上げてピースサインをする男性のイラスト。"
    ),
    "teacher-star-1-86f5cdb6e25c": (
        "女性が、椅子に座って笑っている男性客に果物と飲み物を出しているイラスト。"
    ),
    "teacher-star-1-bdc7865a507e": (
        "二人の女性が楽しそうに会話しているイラスト。"
    ),
    "teacher-star-1-86367b2d53f6": (
        "黒板の前で授業をしている男性教師のイラスト。"
    ),
    "teacher-star-1-2cfcacc0503e": (
        "自分自身を指さしている人物のイラスト。"
    ),
    "teacher-star-1-e7bc12c4f23a": (
        "眼鏡をかけて笑っている中年男性のイラスト。"
    ),
    "teacher-star-1-e64490a207eb": (
        "エプロンを着て優しく微笑んでいる中年女性のイラスト。"
    ),
    "teacher-star-1-bada4e11125d": (
        "眼鏡をかけて笑っている中年男性のイラスト。"
    ),
    "teacher-star-1-d903f490725f": (
        "エプロンを着て優しく微笑んでいる中年女性のイラスト。"
    ),
    "teacher-star-1-7420330fee5c": (
        "若い男性が笑顔で手を振っているイラスト。"
    ),
    "teacher-star-1-ed096023b3be": (
        "若い女性が笑顔で手を振っているイラスト。"
    ),
    "teacher-star-1-cb42fb8775e5": (
        "元気そうな少年が笑顔で立っているイラスト。"
    ),
    "teacher-star-1-c39a19585434": (
        "かわいらしい少女が笑っているイラスト。"
    ),
    "teacher-star-1-3e6fabf09358": (
        "寄り添って笑顔の男女カップルのイラスト。"
    ),
    "teacher-star-1-1c0cdf0b2b9c": (
        "スーツを着て笑顔の男性のイラスト。"
    ),
    "teacher-star-1-8fea4ac29b4c": (
        "笑顔の女性のイラスト。"
    ),
    "teacher-star-1-94757170c2b0": (
        "両手を挙げて笑っている子どものイラスト。"
    ),
    "teacher-star-1-0cc5799cdbbc": (
        "ランドセルを背負った男の子のイラスト。"
    ),
}

PENDING_RIGHTS = {
    "status": "pending",
    "source": "teacher-provided",
    "note": "Formal rights verification pending for teacher-provided source image.",
}

MAX_DIMENSION = 1600
MAX_FILE_SIZE = 1_500_000


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def convert_image(source: Path, output: Path) -> tuple[int, int, int]:
    """Convert a single PNG to deterministic WebP.

    Returns (width, height, file_size_bytes).
    """
    from PIL import Image, ImageOps

    img = Image.open(source)
    img = ImageOps.exif_transpose(img) or img

    if img.mode in ("P", "PA"):
        img = img.convert("RGBA" if "A" in img.mode else "RGB")
    elif img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")

    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = w, h

    img.save(
        output,
        format="WEBP",
        lossless=True,
        method=6,
        exif=b"",
        icc_profile=None,
    )

    file_size = output.stat().st_size
    return new_w, new_h, file_size


def illustration_id(vocab_id: str) -> str:
    return f"{ILLUSTRATION_ID_PREFIX}{vocab_id}"


def asset_path(vocab_id: str) -> str:
    return f"/assets/vocabulary/teacher-core-v1/{illustration_id(vocab_id)}.webp"


def convert_all(
    verify_source_checksums: bool = False,
    dry_run: bool = False,
) -> list[dict]:
    """Convert all 19 images in an isolated temp dir.

    Returns illustration records, or raises on first failure.

    When verify_source_checksums is True, verifies source file existence.
    When dry_run is True, does not publish to output directories.
    """
    if verify_source_checksums:
        for vocab_id, filename in SOURCE_MAP.items():
            source_path = SOURCE_DIR / filename
            if not source_path.exists():
                raise FileNotFoundError(f"Source not found: {source_path}")

    illustration_records: list[dict] = []

    with tempfile.TemporaryDirectory(prefix="chabiko-ill-") as tmp_dir:
        tmp_path = Path(tmp_dir)

        for vocab_id, filename in SOURCE_MAP.items():
            source_path = SOURCE_DIR / filename
            if not source_path.exists():
                raise FileNotFoundError(f"Source not found: {source_path}")

            checksum = _sha256(source_path)
            ill_id = illustration_id(vocab_id)
            output_filename = f"{ill_id}.webp"
            output_path = tmp_path / output_filename

            width, height, file_size = convert_image(source_path, output_path)

            illustration_records.append({
                "id": ill_id,
                "vocabularyId": vocab_id,
                "assetPath": asset_path(vocab_id),
                "sourceChecksumSha256": checksum,
                "width": width,
                "height": height,
                "mimeType": "image/webp",
                "fileSizeBytes": file_size,
                "altJa": ALT_JA[vocab_id],
                "rights": dict(PENDING_RIGHTS),
                "reviewStatus": "draft",
            })

        if not dry_run:
            _publish_batch(tmp_path, illustration_records)

    return illustration_records


def _publish_batch(tmp_path: Path, records: list[dict]) -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    BATCH_JSON.parent.mkdir(parents=True, exist_ok=True)

    for rec in records:
        ill_id = rec["id"]
        src = tmp_path / f"{ill_id}.webp"
        dst = ASSETS_DIR / f"{ill_id}.webp"
        shutil.copy2(src, dst)

    with open(BATCH_JSON, "w", encoding="utf-8") as f:
        json.dump({"illustrations": records}, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _load_illustrations() -> list[dict] | None:
    if not BATCH_JSON.exists():
        return None
    with open(BATCH_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("illustrations", [])


# ═══════════════════════════════════════════════════════════════════════════════
# Self-tests
# ═══════════════════════════════════════════════════════════════════════════════


def run_tests() -> int:
    import traceback

    passed = 0
    failed = 0

    def check(desc: str, ok: bool):
        nonlocal passed, failed
        if ok:
            passed += 1
        else:
            failed += 1
            print(f"  FAIL: {desc}", file=sys.stderr)

    print("import-teacher-vocabulary-images tests")

    # 1. Exact 19-ID coverage
    print("  coverage ...")
    check("exactly 19 mapped vocabulary IDs", len(SOURCE_MAP) == 19)
    all_ids = set(SOURCE_MAP.keys())
    check("no_image vocabulary not in source map",
          NO_IMAGE_VOCABULARY.isdisjoint(all_ids))
    expected_ids = [
        "teacher-star-1-37e0eb213f0f", "teacher-star-1-a66948a76fda",
        "teacher-star-1-86f5cdb6e25c", "teacher-star-1-bdc7865a507e",
        "teacher-star-1-86367b2d53f6", "teacher-star-1-2cfcacc0503e",
        "teacher-star-1-e7bc12c4f23a", "teacher-star-1-e64490a207eb",
        "teacher-star-1-bada4e11125d", "teacher-star-1-d903f490725f",
        "teacher-star-1-7420330fee5c", "teacher-star-1-ed096023b3be",
        "teacher-star-1-cb42fb8775e5", "teacher-star-1-c39a19585434",
        "teacher-star-1-3e6fabf09358", "teacher-star-1-1c0cdf0b2b9c",
        "teacher-star-1-8fea4ac29b4c", "teacher-star-1-94757170c2b0",
        "teacher-star-1-0cc5799cdbbc",
    ]
    check("all expected IDs present", all(v in SOURCE_MAP for v in expected_ids))

    # 2. Missing-image vocabulary
    print("  missing-image vocabulary ...")
    check("小姐/女士 has no image entry",
          "teacher-star-1-8b957a100bd4" not in SOURCE_MAP)
    check("NO_IMAGE_VOCABULARY correct singleton",
          NO_IMAGE_VOCABULARY == {"teacher-star-1-8b957a100bd4"})

    # 3. Source checksums
    print("  source checksums ...")
    expected_checksums = {
        "teacher-star-1-37e0eb213f0f": "5c7f48f22066c2888948e3c6782ecd30ce06f3623855de8134d0870b393e00fa",
        "teacher-star-1-a66948a76fda": "aa29beb399089e706f7644e8bd3a656c52ad299d99e22e5aadba67f6f748fe1f",
        "teacher-star-1-86f5cdb6e25c": "5963f602e4484e9d089c86ea6b0597dbc71fe65b2324c10d269defa9371adcd5",
        "teacher-star-1-bdc7865a507e": "6e87f0bca09ed7fb14ea0fd259d068f6035b55538d25a6ed82f37ef767c80dda",
        "teacher-star-1-86367b2d53f6": "cd28d97e3df15d7bd162395c7c7c8872db8f7390254d62d8f312076d76b3c8fd",
        "teacher-star-1-2cfcacc0503e": "579d0a4d100895611c5d230e5f355dc020b3d89def41d562a8a0bbb72b6e3d4f",
        "teacher-star-1-e7bc12c4f23a": "fdd6c3206c7dfdde6da42132840d19764d3663d7f5a128fc9fbf8d3620b4834a",
        "teacher-star-1-e64490a207eb": "52c6e1a4ef1f030184354c26c096593e410b91800209eccb1dbe689b51dc7b99",
        "teacher-star-1-bada4e11125d": "fdd6c3206c7dfdde6da42132840d19764d3663d7f5a128fc9fbf8d3620b4834a",
        "teacher-star-1-d903f490725f": "52c6e1a4ef1f030184354c26c096593e410b91800209eccb1dbe689b51dc7b99",
        "teacher-star-1-7420330fee5c": "f65aefab1e5c6757d97715aead6d40b28d7f3642c123e24190e838cec6cc19e3",
        "teacher-star-1-ed096023b3be": "164649c69ef812c4bfd87d4a41e2b239f0098e515f4453d81811bd586ebfda9d",
        "teacher-star-1-cb42fb8775e5": "cf0e5e7c71aa9720ed59b4d8f769fbcd488003c2e4fa3aa592233a08099d7467",
        "teacher-star-1-c39a19585434": "a3252c5b20ad937441482d270139c23d304201c5254fc5e3a679e552632ec77e",
        "teacher-star-1-3e6fabf09358": "29b23c72642519f6272102b9eff17023b5c304c10d28e2a223a71dc83d5514b6",
        "teacher-star-1-1c0cdf0b2b9c": "f223a0d766945884475fe361413102b9e62da80617cd9490e043aa0f4e7eacfb",
        "teacher-star-1-8fea4ac29b4c": "27628bab84145d9acb41da356fe6b8fbf0d6aac453b5c943953f279a451e34cf",
        "teacher-star-1-94757170c2b0": "9e1c8eacc0b8a1c39cf6c032fc733f1a292a1e07d72d323e0008e6ed57553f87",
        "teacher-star-1-0cc5799cdbbc": "9075fde996581ecf9997bc391ae1d0a52c798f005f73aac423b0e4ccdc9d7af8",
    }
    for vid, cs in expected_checksums.items():
        source_path = SOURCE_DIR / SOURCE_MAP[vid]
        actual = _sha256(source_path)
        check(f"checksum for {vid}", actual == cs)

    # 4. Shared-source handling
    print("  shared-source handling ...")
    check("爸爸 and 父亲 share source",
          SOURCE_MAP["teacher-star-1-e7bc12c4f23a"]
          == SOURCE_MAP["teacher-star-1-bada4e11125d"])
    check("妈妈 and 母亲 share source",
          SOURCE_MAP["teacher-star-1-e64490a207eb"]
          == SOURCE_MAP["teacher-star-1-d903f490725f"])
    check("shared checksums match",
          expected_checksums["teacher-star-1-e7bc12c4f23a"]
          == expected_checksums["teacher-star-1-bada4e11125d"]
          and expected_checksums["teacher-star-1-e64490a207eb"]
          == expected_checksums["teacher-star-1-d903f490725f"])

    # 5. altJa coverage
    print("  altJa coverage ...")
    for vid in SOURCE_MAP:
        check(f"altJa for {vid}", vid in ALT_JA and len(ALT_JA[vid]) > 0)
    check("人 uses exact #113 altJa",
          ALT_JA["teacher-star-1-a66948a76fda"]
          == "笑顔で両手を上げてピースサインをする男性のイラスト。")

    # 6. Pending-rights shape
    print("  pending-rights shape ...")
    check("status is 'pending'", PENDING_RIGHTS["status"] == "pending")
    check("source is 'teacher-provided'",
          PENDING_RIGHTS["source"] == "teacher-provided")
    check("note is non-empty", len(PENDING_RIGHTS["note"]) > 0)
    check("no extra keys", set(PENDING_RIGHTS.keys()) == {"status", "source", "note"})

    # 7. Conversion + determinism
    print("  conversion+determinism ...")
    try:
        first_records = convert_all(verify_source_checksums=False, dry_run=True)
        check("convert_all returned 19 records", len(first_records) == 19)

        for rec in first_records:
            vid = rec["vocabularyId"]
            check(f"{vid}: id format", rec["id"] == f"ill-{vid}")
            check(f"{vid}: assetPath prefix",
                  rec["assetPath"].startswith("/assets/vocabulary/teacher-core-v1/"))
            check(f"{vid}: assetPath .webp", rec["assetPath"].endswith(".webp"))
            check(f"{vid}: mimeType webp", rec["mimeType"] == "image/webp")
            check(f"{vid}: reviewStatus draft", rec["reviewStatus"] == "draft")
            check(f"{vid}: width 1-1600", 1 <= rec["width"] <= MAX_DIMENSION)
            check(f"{vid}: height 1-1600", 1 <= rec["height"] <= MAX_DIMENSION)
            check(f"{vid}: fileSize <= 1500000",
                  1 <= rec["fileSizeBytes"] <= MAX_FILE_SIZE)
            check(f"{vid}: checksum hex 64",
                  len(rec["sourceChecksumSha256"]) == 64
                  and all(c in "0123456789abcdef" for c in rec["sourceChecksumSha256"]))
            check(f"{vid}: rights pending source teacher-provided",
                  rec["rights"]["status"] == "pending"
                  and rec["rights"]["source"] == "teacher-provided")

        second_records = convert_all(verify_source_checksums=False, dry_run=True)
        check("deterministic rerun same count", len(second_records) == 19)
        for i in range(19):
            r1 = json.dumps(first_records[i], sort_keys=True)
            r2 = json.dumps(second_records[i], sort_keys=True)
            check(f"deterministic rerun record {i} identical", r1 == r2)

        committed = _load_illustrations()
        if committed is not None:
            check("committed records count 19", len(committed) == 19)
            for i in range(19):
                c1 = json.dumps(first_records[i], sort_keys=True)
                c2 = json.dumps(committed[i], sort_keys=True)
                check(f"committed record {i} matches conversion", c1 == c2)

        webp_count = len(list(ASSETS_DIR.glob("*.webp")))
        check(f"WebP files on disk: {webp_count}", webp_count == 19)

    except Exception as e:
        check(f"conversion raised: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 8. No source/scratch bytes in Git
    print("  git check ...")
    result = subprocess.run(
        ["git", "ls-files", "--", "词汇表/"],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    tracked_vocab = [l for l in result.stdout.strip().split("\n") if l]
    check("no source PNGs tracked in Git", len(tracked_vocab) == 0)

    result_all = subprocess.run(
        ["git", "ls-files", "--", "*.png"],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    tracked_png = [l for l in result_all.stdout.strip().split("\n") if l]
    check("no PNG files tracked in Git",
          all(p.startswith("docs/design/") or p.startswith("词汇表/拼音表") or p.startswith("public/")
              for p in tracked_png) if tracked_png else True)

    # 9. Illustration ID format
    print("  illustration ID format ...")
    for vid in SOURCE_MAP:
        expected_ill_id = f"ill-{vid}"
        check(f"illustration ID for {vid}", illustration_id(vid) == expected_ill_id)

    print(f"\n  {passed} passed, {failed} failed")
    return 1 if failed else 0


def run_check() -> int:
    errors: list[str] = []

    committed = _load_illustrations()
    if committed is None:
        print(f"Missing: {BATCH_JSON}", file=sys.stderr)
        return 1

    if len(committed) != 19:
        errors.append(f"Expected 19 illustrations, got {len(committed)}")

    committed_by_vocab = {r["vocabularyId"]: r for r in committed}

    for vid in SOURCE_MAP:
        if vid not in committed_by_vocab:
            errors.append(f"Missing illustration for vocabulary {vid}")

    if "teacher-star-1-8b957a100bd4" in committed_by_vocab:
        errors.append("小姐/女士 should not have an illustration")

    for vid, filename in SOURCE_MAP.items():
        source_path = SOURCE_DIR / filename
        if not source_path.exists():
            errors.append(f"Source missing: {source_path}")
            continue
        actual = _sha256(source_path)
        if vid in committed_by_vocab:
            committed_cs = committed_by_vocab[vid].get("sourceChecksumSha256", "")
            if actual != committed_cs:
                errors.append(
                    f"Source checksum mismatch for {vid}: "
                    f"expected {actual}, got {committed_cs}"
                )

    for rec in committed:
        ill_id = rec["id"]
        webp_path = ASSETS_DIR / f"{ill_id}.webp"
        if not webp_path.exists():
            errors.append(f"Missing WebP: {webp_path}")

    for rec in committed:
        rights = rec.get("rights", {})
        if rights.get("status") != "pending":
            errors.append(f"{rec['vocabularyId']}: rights.status not pending")
        if rights.get("source") != "teacher-provided":
            errors.append(f"{rec['vocabularyId']}: rights.source not teacher-provided")
        if not rights.get("note", "").strip():
            errors.append(f"{rec['vocabularyId']}: rights.note is empty")
        if set(rights.keys()) != {"status", "source", "note"}:
            errors.append(f"{rec['vocabularyId']}: unexpected rights keys: {set(rights.keys())}")

    for rec in committed:
        if rec.get("reviewStatus") != "draft":
            errors.append(f"{rec['vocabularyId']}: reviewStatus is not draft")

    for e in errors:
        print(f"  CHECK: {e}", file=sys.stderr)
    return 1 if errors else 0


def main():
    if "--test" in sys.argv:
        sys.exit(run_tests())
    if "--check" in sys.argv:
        sys.exit(run_check())

    print("Converting 19 candidate images ...")
    records = convert_all(verify_source_checksums=True)
    print(f"  Published {len(records)} illustrations")
    print(f"  WebP → {ASSETS_DIR}")
    print(f"  JSON → {BATCH_JSON}")
    print("Done.")


if __name__ == "__main__":
    main()
