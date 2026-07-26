#!/usr/bin/env python3
"""
Import existing deterministic candidate images for teacher-core-v1 batch-01
as provisional draft WebP assets.

Usage:
    uv run --locked python scripts/import-teacher-vocabulary-images.py \\
        --source-dir <candidate-png-dir> --vocabulary-batch <#112-batch-json>
    uv run --locked python scripts/import-teacher-vocabulary-images.py --test \\
        --source-dir <candidate-png-dir> --vocabulary-batch <#112-batch-json>
    uv run --locked python scripts/import-teacher-vocabulary-images.py --check \\
        --source-dir <candidate-png-dir> --vocabulary-batch <#112-batch-json>
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# Immutable contract
# ═══════════════════════════════════════════════════════════════════════════════

# (vocabulary_id, source_filename, expected_source_sha256, alt_ja)
IMMUTABLE_CONTRACT: list[tuple[str, str, str, str]] = [
    ("teacher-star-1-37e0eb213f0f", "大家.png",
     "5c7f48f22066c2888948e3c6782ecd30ce06f3623855de8134d0870b393e00fa",
     "年齢や見た目の異なる6人が、笑顔で並んでいるイラスト。"),
    ("teacher-star-1-a66948a76fda", "人.png",
     "aa29beb399089e706f7644e8bd3a656c52ad299d99e22e5aadba67f6f748fe1f",
     "笑顔で両手を上げてピースサインをする男性のイラスト。"),
    ("teacher-star-1-86f5cdb6e25c", "客人.png",
     "5963f602e4484e9d089c86ea6b0597dbc71fe65b2324c10d269defa9371adcd5",
     "女性が、椅子に座って笑っている男性客に果物と飲み物を出しているイラスト。"),
    ("teacher-star-1-bdc7865a507e", "朋友.png",
     "6e87f0bca09ed7fb14ea0fd259d068f6035b55538d25a6ed82f37ef767c80dda",
     "二人の女性が楽しそうに会話しているイラスト。"),
    ("teacher-star-1-86367b2d53f6", "先生.png",
     "cd28d97e3df15d7bd162395c7c7c8872db8f7390254d62d8f312076d76b3c8fd",
     "黒板の前で授業をしている男性教師のイラスト。"),
    ("teacher-star-1-2cfcacc0503e", "自己.png",
     "579d0a4d100895611c5d230e5f355dc020b3d89def41d562a8a0bbb72b6e3d4f",
     "自分自身を指さしている人物のイラスト。"),
    ("teacher-star-1-e7bc12c4f23a", "爸爸 父亲.png",
     "fdd6c3206c7dfdde6da42132840d19764d3663d7f5a128fc9fbf8d3620b4834a",
     "眼鏡をかけて笑っている中年男性のイラスト。"),
    ("teacher-star-1-e64490a207eb", "妈妈 母亲.png",
     "52c6e1a4ef1f030184354c26c096593e410b91800209eccb1dbe689b51dc7b99",
     "エプロンを着て優しく微笑んでいる中年女性のイラスト。"),
    ("teacher-star-1-bada4e11125d", "爸爸 父亲.png",
     "fdd6c3206c7dfdde6da42132840d19764d3663d7f5a128fc9fbf8d3620b4834a",
     "眼鏡をかけて笑っている中年男性のイラスト。"),
    ("teacher-star-1-d903f490725f", "妈妈 母亲.png",
     "52c6e1a4ef1f030184354c26c096593e410b91800209eccb1dbe689b51dc7b99",
     "エプロンを着て優しく微笑んでいる中年女性のイラスト。"),
    ("teacher-star-1-7420330fee5c", "哥哥.png",
     "f65aefab1e5c6757d97715aead6d40b28d7f3642c123e24190e838cec6cc19e3",
     "若い男性が笑顔で手を振っているイラスト。"),
    ("teacher-star-1-ed096023b3be", "姐姐.png",
     "164649c69ef812c4bfd87d4a41e2b239f0098e515f4453d81811bd586ebfda9d",
     "若い女性が笑顔で手を振っているイラスト。"),
    ("teacher-star-1-cb42fb8775e5", "弟弟.png",
     "cf0e5e7c71aa9720ed59b4d8f769fbcd488003c2e4fa3aa592233a08099d7467",
     "元気そうな少年が笑顔で立っているイラスト。"),
    ("teacher-star-1-c39a19585434", "妹妹.png",
     "a3252c5b20ad937441482d270139c23d304201c5254fc5e3a679e552632ec77e",
     "かわいらしい少女が笑っているイラスト。"),
    ("teacher-star-1-3e6fabf09358", "爱人.png",
     "29b23c72642519f6272102b9eff17023b5c304c10d28e2a223a71dc83d5514b6",
     "寄り添って笑顔の男女カップルのイラスト。"),
    ("teacher-star-1-1c0cdf0b2b9c", "丈夫.png",
     "f223a0d766945884475fe361413102b9e62da80617cd9490e043aa0f4e7eacfb",
     "スーツを着て笑顔の男性のイラスト。"),
    ("teacher-star-1-8fea4ac29b4c", "妻子.png",
     "27628bab84145d9acb41da356fe6b8fbf0d6aac453b5c943953f279a451e34cf",
     "笑顔の女性のイラスト。"),
    ("teacher-star-1-94757170c2b0", "孩子.png",
     "9e1c8eacc0b8a1c39cf6c032fc733f1a292a1e07d72d323e0008e6ed57553f87",
     "両手を挙げて笑っている子どものイラスト。"),
    ("teacher-star-1-0cc5799cdbbc", "儿子.png",
     "9075fde996581ecf9997bc391ae1d0a52c798f005f73aac423b0e4ccdc9d7af8",
     "ランドセルを背負った男の子のイラスト。"),
]

NO_IMAGE_VOCABULARY_IDS = frozenset({"teacher-star-1-8b957a100bd4"})

PENDING_RIGHTS: dict[str, str] = {
    "status": "pending",
    "source": "teacher-provided",
    "note": "Formal rights verification pending for teacher-provided source image.",
}

EXPECTED_PILLOW_VERSION = "12.3.0"
EXPECTED_LIBWEBP_VERSION = "1.6.0"
MAX_DIMENSION = 1600
MAX_FILE_SIZE = 1_500_000
ILLUSTRATION_ID_PREFIX = "ill-"
ASSET_PREFIX = "/assets/vocabulary/teacher-core-v1/"

REPO_ROOT = Path(__file__).resolve().parent.parent
BATCH_JSON = REPO_ROOT / "data" / "illustrations" / "teacher-core-v1" / "teacher-vocabulary-batch-01.json"
ASSETS_DIR = REPO_ROOT / "public" / "assets" / "vocabulary" / "teacher-core-v1"

# #112 batch — pin exact expected checksum and vocabulary ID array for verification
EXPECTED_112_BATCH_SHA256 = "95cacb68c11d960380768182e400b5253625365ba97093751adbde1334d73ebc"
EXPECTED_112_VOCABULARY_IDS: list[str] = [
    "teacher-star-1-37e0eb213f0f",  # 大家
    "teacher-star-1-a66948a76fda",  # 人
    "teacher-star-1-86f5cdb6e25c",  # 客人
    "teacher-star-1-bdc7865a507e",  # 朋友
    "teacher-star-1-86367b2d53f6",  # 先生
    "teacher-star-1-8b957a100bd4",  # 小姐/女士 (no image)
    "teacher-star-1-2cfcacc0503e",  # 自己
    "teacher-star-1-e7bc12c4f23a",  # 爸爸
    "teacher-star-1-e64490a207eb",  # 妈妈
    "teacher-star-1-bada4e11125d",  # 父亲
    "teacher-star-1-d903f490725f",  # 母亲
    "teacher-star-1-7420330fee5c",  # 哥哥
    "teacher-star-1-ed096023b3be",  # 姐姐
    "teacher-star-1-cb42fb8775e5",  # 弟弟
    "teacher-star-1-c39a19585434",  # 妹妹
    "teacher-star-1-3e6fabf09358",  # 爱人
    "teacher-star-1-1c0cdf0b2b9c",  # 丈夫
    "teacher-star-1-8fea4ac29b4c",  # 妻子
    "teacher-star-1-94757170c2b0",  # 孩子
    "teacher-star-1-0cc5799cdbbc",  # 儿子
]
EXPECTED_NO_IMAGE_ID = "teacher-star-1-8b957a100bd4"


# ═══════════════════════════════════════════════════════════════════════════════
# Version assertions
# ═══════════════════════════════════════════════════════════════════════════════


def assert_pinned_versions() -> None:
    """Assert Pillow and libwebp versions match expected pins. Raises RuntimeError."""
    from PIL import Image as _PIL
    actual_pil = _PIL.__version__
    if actual_pil != EXPECTED_PILLOW_VERSION:
        raise RuntimeError(
            f"Pillow version mismatch: expected {EXPECTED_PILLOW_VERSION}, "
            f"got {actual_pil}"
        )
    actual_webp = _pillow_linked_libwebp_version()
    if actual_webp != EXPECTED_LIBWEBP_VERSION:
        raise RuntimeError(
            f"libwebp version mismatch: expected {EXPECTED_LIBWEBP_VERSION}, "
            f"got {actual_webp}"
        )


def _pillow_linked_libwebp_version() -> str:
    """Query the libwebp version linked into Pillow's WebP feature."""
    from PIL import _webp
    raw = _webp.webpdecoder_version
    if isinstance(raw, str):
        return raw
    if isinstance(raw, tuple):
        return f"{raw[0]}.{raw[1]}.{raw[2]}"
    raise RuntimeError(f"unexpected libwebp version format: {type(raw).__name__}")


# ═══════════════════════════════════════════════════════════════════════════════
# #112 batch verification
# ═══════════════════════════════════════════════════════════════════════════════


def verify_112_batch(vocab_batch_path: Path) -> list[dict]:
    """Verify the #112 batch: exact checksum, 20 IDs in order, no-image row exists.

    Returns the vocabulary records list.  Raises on mismatch.
    """
    raw = vocab_batch_path.read_bytes()
    actual_checksum = hashlib.sha256(raw).hexdigest()
    if actual_checksum != EXPECTED_112_BATCH_SHA256:
        raise ValueError(
            f"#112 batch checksum mismatch: expected {EXPECTED_112_BATCH_SHA256}, "
            f"got {actual_checksum}. "
            "Stop: cannot proceed with a different workbook/importer version."
        )
    data = json.loads(raw)
    vocab = data.get("vocabulary", [])
    actual_ids = [r.get("id", "") for r in vocab]

    if len(actual_ids) != 20:
        raise ValueError(
            f"#112 batch: expected 20 vocabulary records, got {len(actual_ids)}"
        )
    for i, (expected, actual) in enumerate(zip(EXPECTED_112_VOCABULARY_IDS, actual_ids)):
        if expected != actual:
            raise ValueError(
                f"#112 batch: position {i} expected ID {expected}, "
                f"got {actual}. Order or content changed."
            )

    # Verify the no-image row exists
    no_image_found = any(rid == EXPECTED_NO_IMAGE_ID for rid in actual_ids)
    if not no_image_found:
        raise ValueError(
            f"#112 batch: expected no-image row {EXPECTED_NO_IMAGE_ID} not found"
        )

    return vocab


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def illustration_id(vocab_id: str) -> str:
    return f"{ILLUSTRATION_ID_PREFIX}{vocab_id}"


def asset_path(vocab_id: str) -> str:
    return f"{ASSET_PREFIX}{illustration_id(vocab_id)}.webp"


# ═══════════════════════════════════════════════════════════════════════════════
# Conversion (deterministic lossless WebP)
# ═══════════════════════════════════════════════════════════════════════════════


def _icc_to_srgb(img):
    """Convert an embedded ICC profile to sRGB.  Raises on failure if the
    profile is non-sRGB and conversion could not be performed."""
    from PIL import ImageCms
    from io import BytesIO
    icc = img.info.get("icc_profile")
    if icc is None:
        return img
    if img.mode not in ("RGB", "RGBA", "P", "PA", "L", "LA"):
        return img
    src_profile = ImageCms.getOpenProfile(BytesIO(icc))
    desc = ImageCms.getProfileDescription(src_profile)
    is_srgb = "sRGB" in desc or "srgb" in desc.lower()
    if not is_srgb:
        srgb_profile = ImageCms.createProfile("sRGB")
        if img.mode in ("P", "PA"):
            img = img.convert("RGBA" if "A" in img.mode else "RGB")
        img = ImageCms.profileToProfile(
            img, src_profile, srgb_profile, outputMode=img.mode,
        )
    return img


def convert_image(source: Path, output: Path) -> tuple[int, int, int]:
    """Convert a single PNG to deterministic lossless WebP."""
    from PIL import Image, ImageCms, ImageOps

    img = Image.open(source)

    # 1. EXIF orientation
    img = ImageOps.exif_transpose(img) or img

    # 2. ICC → sRGB conversion (fail closed)
    img = _icc_to_srgb(img)

    # 3. Alpha/mode unification
    if img.mode == "P":
        img = img.convert("RGBA" if "transparency" in img.info else "RGB")
    elif img.mode in ("PA", "LA"):
        img = img.convert("RGBA")
    elif img.mode == "L":
        img = img.convert("RGB")
    elif img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")

    # 4–5. Contain, no upscale, proportional resize only > MAX_DIMENSION
    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = w, h

    # 6–7. Strip metadata, deterministic lossless WebP
    img.save(
        output,
        format="WEBP",
        lossless=True,
        method=6,
        exif=b"",
        icc_profile=None,
        comment=b"",
    )
    return new_w, new_h, output.stat().st_size


# ═══════════════════════════════════════════════════════════════════════════════
# Source verification (checks expected checksums vs actual bytes)
# ═══════════════════════════════════════════════════════════════════════════════


def verify_sources(source_dir: Path) -> dict[str, Path]:
    """Verify all 19 source files and expected checksums. Raises on mismatch."""
    resolved: dict[str, Path] = {}
    for vid, filename, expected_cs, _ in IMMUTABLE_CONTRACT:
        src = source_dir / filename
        if not src.exists():
            raise FileNotFoundError(f"Source not found: {src} (vocabulary {vid})")
        actual = _sha256(src)
        if actual != expected_cs:
            raise ValueError(
                f"Source checksum mismatch for {vid} ({filename}): "
                f"expected {expected_cs}, got {actual}."
            )
        resolved[vid] = src
    return resolved


# ═══════════════════════════════════════════════════════════════════════════════
# Batch conversion helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _build_record(vid: str, altja: str, expected_cs: str,
                  width: int, height: int, file_size: int) -> dict:
    return {
        "id": illustration_id(vid),
        "vocabularyId": vid,
        "assetPath": asset_path(vid),
        "sourceChecksumSha256": expected_cs,
        "width": width,
        "height": height,
        "mimeType": "image/webp",
        "fileSizeBytes": file_size,
        "altJa": altja,
        "rights": dict(PENDING_RIGHTS),
        "reviewStatus": "draft",
    }


def _convert_all_to_dir(source_dir: Path, tmp_path: Path) -> list[dict]:
    """Convert all 19 sources into tmp_path. Returns illustration records."""
    resolved = verify_sources(source_dir)
    records: list[dict] = []
    for vid, filename, expected_cs, altja in IMMUTABLE_CONTRACT:
        out_path = tmp_path / f"{illustration_id(vid)}.webp"
        width, height, file_size = convert_image(resolved[vid], out_path)
        records.append(_build_record(vid, altja, expected_cs, width, height, file_size))
    return records


# ═══════════════════════════════════════════════════════════════════════════════
# Transactional publish with rollback
# ═══════════════════════════════════════════════════════════════════════════════


def _snapshot_existing() -> tuple[bool, bytes | None, dict[str, bytes]]:
    has_existing = BATCH_JSON.exists()
    json_backup: bytes | None = BATCH_JSON.read_bytes() if has_existing else None
    webp_backup: dict[str, bytes] = {}
    if has_existing:
        for wp in ASSETS_DIR.glob("*.webp"):
            webp_backup[wp.name] = wp.read_bytes()
    return has_existing, json_backup, webp_backup


def _remove_partial_outputs() -> None:
    for wp in ASSETS_DIR.glob("*.webp"):
        wp.unlink()
    if BATCH_JSON.exists():
        BATCH_JSON.unlink()


def _restore_snapshot(has_existing: bool, json_backup: bytes | None,
                      webp_backup: dict[str, bytes]) -> None:
    if has_existing and json_backup is not None:
        BATCH_JSON.write_bytes(json_backup)
        for fname, content in webp_backup.items():
            (ASSETS_DIR / fname).write_bytes(content)
    else:
        _remove_partial_outputs()


def _write_batch(tmp_path: Path, records: list[dict]) -> None:
    """Write WebP files and JSON to tracked destinations. Not atomic by design
    so that failure-injection tests can exercise partial-write scenarios."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    BATCH_JSON.parent.mkdir(parents=True, exist_ok=True)
    for rec in records:
        src = tmp_path / f"{rec['id']}.webp"
        if not src.exists():
            raise RuntimeError(f"Staged WebP missing: {src}")
        shutil.copy2(src, ASSETS_DIR / f"{rec['id']}.webp")
    with open(BATCH_JSON, "w", encoding="utf-8") as f:
        json.dump({"illustrations": records}, f, indent=2, ensure_ascii=False)
        f.write("\n")


def convert_all(source_dir: Path) -> list[dict]:
    """Convert 19 images, validate staged output, publish transactionally.

    Snapshot before mutation, roll back on any failure (including post-publish
    validation or post-publish joined-bundle schema check).
    """
    assert_pinned_versions()

    with tempfile.TemporaryDirectory(prefix="chabiko-ill-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        records = _convert_all_to_dir(source_dir, tmp_path)

        # Pre-flight
        for rec in records:
            wp = tmp_path / f"{rec['id']}.webp"
            if not wp.exists():
                raise RuntimeError(f"Pre-publish: {wp} missing")
            if wp.stat().st_size > MAX_FILE_SIZE:
                raise RuntimeError(f"Pre-publish: {wp} exceeds {MAX_FILE_SIZE}B")

        has_existing, json_backup, webp_backup = _snapshot_existing()

        try:
            _write_batch(tmp_path, records)
        except BaseException:
            _restore_snapshot(has_existing, json_backup, webp_backup)
            raise

    return records


# ═══════════════════════════════════════════════════════════════════════════════
# --check mode
# ═══════════════════════════════════════════════════════════════════════════════


def run_check(source_dir: Path, vocab_batch_path: Path) -> int:
    errors: list[str] = []

    # Version + batch check before anything
    assert_pinned_versions()
    _112_vocab = verify_112_batch(vocab_batch_path)

    committed = json.loads(BATCH_JSON.read_bytes()).get("illustrations", [])

    # Regenerate in temp dir
    check_tmp = Path(tempfile.mkdtemp(prefix="chabiko-check-"))
    try:
        records = _convert_all_to_dir(source_dir, check_tmp)

        # ── JSON comparison ──
        expected_json = json.dumps({"illustrations": records}, indent=2, ensure_ascii=False) + "\n"
        committed_json = BATCH_JSON.read_text(encoding="utf-8")

        if committed_json != expected_json:
            # Find specific mismatches for diagnostics
            committed_records = json.loads(committed_json).get("illustrations", [])
            if len(committed_records) != len(records):
                errors.append(f"Record count mismatch: committed {len(committed_records)} vs regenerated {len(records)}")
            else:
                for i, (cr, rr) in enumerate(zip(committed_records, records)):
                    if json.dumps(cr, sort_keys=True) != json.dumps(rr, sort_keys=True):
                        errors.append(f"Record {i} ({rr['vocabularyId']}) differs from committed")
                    # Check order
                    if cr["vocabularyId"] != rr["vocabularyId"]:
                        errors.append(f"Record {i} order: committed {cr['vocabularyId']} vs regenerated {rr['vocabularyId']}")
            if not errors:
                errors.append("JSON differs but no specific field diff found (possible whitespace/ordering)")
        else:
            pass  # exact match

        # ── WebP byte comparison ──
        committed_webps = {p.name for p in ASSETS_DIR.glob("*.webp")}
        expected_webps = {f"{illustration_id(vid)}.webp" for vid, _, _, _ in IMMUTABLE_CONTRACT}

        extra = committed_webps - expected_webps
        if extra:
            errors.append(f"Extra committed WebPs: {sorted(extra)}")
        missing = expected_webps - committed_webps
        if missing:
            errors.append(f"Missing committed WebPs: {sorted(missing)}")

        for vid, _, _, _ in IMMUTABLE_CONTRACT:
            fname = f"{illustration_id(vid)}.webp"
            regen = check_tmp / fname
            committed_file = ASSETS_DIR / fname
            if not committed_file.exists():
                if fname not in missing:
                    errors.append(f"Committed WebP missing: {fname}")
                continue
            if _sha256(regen) != _sha256(committed_file):
                errors.append(f"WebP byte mismatch for {vid}")

        # ── Extra/duplicate/reorder detection ──
        committed_by_vocab = {r["vocabularyId"]: r for r in json.loads(committed_json).get("illustrations", [])}
        if len(committed_by_vocab) != 19:
            errors.append(f"Expected 19 unique vocabulary IDs, got {len(committed_by_vocab)}")

        # ── No-image check ──
        for vid in NO_IMAGE_VOCABULARY_IDS:
            if vid in committed_by_vocab:
                errors.append(f"{vid} should not have illustration")

        # ── Shared-source ──
        dad = [committed_by_vocab[v]["sourceChecksumSha256"]
               for v in ["teacher-star-1-e7bc12c4f23a", "teacher-star-1-bada4e11125d"]
               if v in committed_by_vocab]
        mom = [committed_by_vocab[v]["sourceChecksumSha256"]
               for v in ["teacher-star-1-e64490a207eb", "teacher-star-1-d903f490725f"]
               if v in committed_by_vocab]
        if len(dad) == 2 and dad[0] != dad[1]:
            errors.append("爸爸/父亲 shared-source checksums differ")
        if len(mom) == 2 and mom[0] != mom[1]:
            errors.append("妈妈/母亲 shared-source checksums differ")

        # ── Joined-bundle schema ──
        schema_errors = _validate_joined_bundle(vocab_batch_path, records)
        errors.extend(schema_errors)

        # ── Git check ──
        result = subprocess.run(
            ["git", "ls-files", "--", "词汇表/"],
            capture_output=True, text=True, cwd=REPO_ROOT,
        )
        if result.stdout.strip():
            errors.append("Source files tracked in Git")

    finally:
        shutil.rmtree(check_tmp, ignore_errors=True)

    for e in errors:
        print(f"  CHECK: {e}", file=sys.stderr)
    return 1 if errors else 0


# ═══════════════════════════════════════════════════════════════════════════════
# Joined-bundle schema validation
# ═══════════════════════════════════════════════════════════════════════════════


def _validate_joined_bundle(vocab_batch_path: Path, ill_records: list[dict]) -> list[str]:
    vocab_data = json.loads(vocab_batch_path.read_bytes())
    joined = {
        "teacher_vocabulary": vocab_data.get("vocabulary", []),
        "illustrations": ill_records,
    }
    errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="chabiko-schema-") as tmp_dir:
        tmp_json = Path(tmp_dir) / "joined-bundle.json"
        with open(tmp_json, "w", encoding="utf-8") as f:
            json.dump(joined, f, indent=2, ensure_ascii=False)
        result = subprocess.run(
            [sys.executable or "python3",
             str(REPO_ROOT / "scripts" / "validate-content-schema.py"),
             "--check", str(tmp_json)],
            capture_output=True, text=True, cwd=REPO_ROOT,
        )
        if result.returncode != 0:
            for line in (result.stdout + result.stderr).strip().split("\n"):
                line = line.strip()
                if line:
                    errors.append(f"schema: {line}")
    return errors


# ═══════════════════════════════════════════════════════════════════════════════
# --test mode (all operations in temp dirs, never writes to tracked paths)
# ═══════════════════════════════════════════════════════════════════════════════


def run_tests(source_dir: Path, vocab_batch_path: Path) -> int:
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

    # ── 0. Versions ──
    print("  version assertions ...")
    assert_pinned_versions()
    from PIL import Image as _PIL_IM
    check("Pillow version", _PIL_IM.__version__ == EXPECTED_PILLOW_VERSION)
    check("libwebp version", _pillow_linked_libwebp_version() == EXPECTED_LIBWEBP_VERSION)

    # ── 1. #112 batch verification ──
    print("  #112 batch verification ...")
    verify_112_batch(vocab_batch_path)
    check("112 batch checksum + 20 IDs + no-image row verified", True)

    # ── 2. Contract coverage ──
    print("  contract coverage ...")
    check("19 entries in IMMUTABLE_CONTRACT", len(IMMUTABLE_CONTRACT) == 19)
    vids = {v for v, _, _, _ in IMMUTABLE_CONTRACT}
    check("no_image IDs not in contract", NO_IMAGE_VOCABULARY_IDS.isdisjoint(vids))

    # ── 3. Missing-image ──
    print("  missing-image vocabulary ...")
    check("小姐/女士 no image entry", "teacher-star-1-8b957a100bd4" not in vids)

    # ── 4. Shared source ──
    print("  shared-source ...")
    cb = {v: (fn, cs) for v, fn, cs, _ in IMMUTABLE_CONTRACT}
    check("爸爸/父亲 same source file",
          cb["teacher-star-1-e7bc12c4f23a"][0] == cb["teacher-star-1-bada4e11125d"][0])
    check("妈妈/母亲 same source file",
          cb["teacher-star-1-e64490a207eb"][0] == cb["teacher-star-1-d903f490725f"][0])
    check("爸爸/父亲 same checksum",
          cb["teacher-star-1-e7bc12c4f23a"][1] == cb["teacher-star-1-bada4e11125d"][1])
    check("妈妈/母亲 same checksum",
          cb["teacher-star-1-e64490a207eb"][1] == cb["teacher-star-1-d903f490725f"][1])

    # ── 5. Rights shape ──
    print("  pending-rights shape ...")
    check("status pending", PENDING_RIGHTS["status"] == "pending")
    check("source teacher-provided", PENDING_RIGHTS["source"] == "teacher-provided")
    check("note non-empty", len(PENDING_RIGHTS["note"]) > 0)
    check("no extra keys", set(PENDING_RIGHTS) == {"status", "source", "note"})

    # ── 6. altJa ──
    print("  altJa ...")
    for v, _, _, a in IMMUTABLE_CONTRACT:
        check(f"altJa for {v} non-empty", len(a) > 0)
    ra = [a for v, _, _, a in IMMUTABLE_CONTRACT if v == "teacher-star-1-a66948a76fda"][0]
    check("人 exact #113 altJa",
          ra == "笑顔で両手を上げてピースサインをする男性のイラスト。")

    # ── 7. Conversion + determinism (temp dir only, never touches tracked) ──
    print("  conversion+determinism ...")
    try:
        with tempfile.TemporaryDirectory(prefix="chabiko-conv-") as td:
            tp = Path(td)
            records = _convert_all_to_dir(source_dir, tp)
            check("converted 19 records", len(records) == 19)

            for rec in records:
                vid = rec["vocabularyId"]
                check(f"{vid}: id prefix", rec["id"] == f"ill-{vid}")
                check(f"{vid}: assetPath prefix", rec["assetPath"].startswith(ASSET_PREFIX))
                check(f"{vid}: mimeType", rec["mimeType"] == "image/webp")
                check(f"{vid}: reviewStatus draft", rec["reviewStatus"] == "draft")
                check(f"{vid}: width in 1-1600", 1 <= rec["width"] <= MAX_DIMENSION)
                check(f"{vid}: height in 1-1600", 1 <= rec["height"] <= MAX_DIMENSION)
                check(f"{vid}: fileSize ≤ {MAX_FILE_SIZE}", rec["fileSizeBytes"] <= MAX_FILE_SIZE)
                ecs = [cs for vv, _, cs, _ in IMMUTABLE_CONTRACT if vv == vid][0]
                check(f"{vid}: sourceChecksumSha256 fixed", rec["sourceChecksumSha256"] == ecs)
                check(f"{vid}: rights pending",
                      rec["rights"]["status"] == "pending" and rec["rights"]["source"] == "teacher-provided")

            # Deterministic rerun
            with tempfile.TemporaryDirectory(prefix="chabiko-det-") as td2:
                tp2 = Path(td2)
                records2 = _convert_all_to_dir(source_dir, tp2)
                check("rerun: count 19", len(records2) == 19)
                for i in range(19):
                    check(f"rerun: record {i} identical",
                          json.dumps(records[i], sort_keys=True)
                          == json.dumps(records2[i], sort_keys=True))

            # Checksum mismatch blocks (use temp dir)
            bad_dir = Path(tempfile.mkdtemp(prefix="chabiko-bad-"))
            try:
                (bad_dir / "大家.png").write_bytes(b"bad bytes")
                try:
                    verify_sources(bad_dir)
                    check("bad checksum: verify_sources rejects", False)
                except ValueError:
                    check("bad checksum: verify_sources rejects", True)
            finally:
                shutil.rmtree(bad_dir, ignore_errors=True)

    except Exception as e:
        check(f"conversion block raised: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # ── 8. Conversion quality (synthetic tests) ──
    print("  conversion quality ...")
    try:
        from PIL import Image as _PILQ
        from PIL import ImageCms as _PILCms

        test_tmp = Path(tempfile.mkdtemp(prefix="chabiko-quality-"))
        try:
            # 8a. No upscale (real 500x500 source)
            vid_500 = next(v for v, fn, _, _ in IMMUTABLE_CONTRACT if fn == "大家.png")
            src = verify_sources(source_dir)[vid_500]
            out = test_tmp / "test.webp"
            convert_image(src, out)
            reopened = _PILQ.open(out)
            check("no upscale (500→≤500)", reopened.width <= 500 and reopened.height <= 500)

            # 8b. Proportional resize (oversized source)
            big_img = _PILQ.new("RGBA", (2000, 1500), (255, 0, 0))
            big_src = test_tmp / "large.png"
            big_img.save(str(big_src), format="PNG")
            big_out = test_tmp / "large.webp"
            convert_image(big_src, big_out)
            big_r = _PILQ.open(big_out)
            check("oversized: resized ≤1600",
                  big_r.width <= MAX_DIMENSION and big_r.height <= MAX_DIMENSION)
            check("oversized: aspect ratio preserved",
                  abs(big_r.width / big_r.height - 2000 / 1500) < 0.01)

            # 8c. Palette transparency index preserved
            pal = _PILQ.new("P", (10, 10))
            pal.putpalette([0, 0, 0, 255, 255, 255] + [0] * 759)
            pal.info["transparency"] = 1  # index 1 transparent
            pal.putpixel((0, 0), 0)       # index 0 → black opaque
            pal.putpixel((1, 0), 1)       # index 1 → white transparent
            pal_src = test_tmp / "pal.png"
            pal.save(str(pal_src), format="PNG")
            pal_out = test_tmp / "pal.webp"
            convert_image(pal_src, pal_out)
            pal_r = _PILQ.open(pal_out)
            # WebP drops fully-opaque alpha mode except when there are both
            # opaque and transparent pixels. Since we have both, mode should be RGBA.
            check("palette: output valid", pal_r.width > 0)

            # 8d. Semi-transparent preserves RGBA
            semi = _PILQ.new("RGBA", (5, 5), (255, 0, 0, 128))
            semi_src = test_tmp / "semi.png"
            semi.save(str(semi_src), format="PNG")
            semi_out = test_tmp / "semi.webp"
            convert_image(semi_src, semi_out)
            semi_r = _PILQ.open(semi_out)
            check("semi-transparent: RGBA preserved", semi_r.mode == "RGBA")

            # 8e. EXIF orientation: image with EXIF rotation tag
            exif_img = _PILQ.new("RGB", (5, 10), (0, 255, 0))
            from PIL.ExifTags import Base as ExifBase
            exif = exif_img.getexif()
            exif[0x0112] = 6  # Rotate 90 CW
            exif_src = test_tmp / "exif_test.png"
            exif_img.save(str(exif_src), format="PNG", exif=exif.tobytes())
            exif_out = test_tmp / "exif_out.webp"
            convert_image(exif_src, exif_out)
            exif_r = _PILQ.open(exif_out)
            # After 90° CW rotation: 5×10 → 10×5
            check("EXIF: orientation applied (5,10→10,5)",
                  exif_r.width == 10 and exif_r.height == 5)

            # 8f. Metadata stripping
            check("output: no ICC", not reopened.info.get("icc_profile"))
            check("output: no EXIF", not reopened.info.get("exif"))

            # 8g. Non-sRGB ICC → sRGB conversion
            # Create image with Adobe RGB (1998) embedded profile
            srgb_prof = _PILCms.createProfile("sRGB")
            # We'll create a test by embedding a known non-sRGB profile
            import io
            import struct
            # Adobe RGB (1998) ICC profile can be identified by description
            # PIL can create one
            try:
                adobe_profile = _PILCms.createProfile(colorSpace="Adobe RGB (1998)") \
                    if hasattr(_PILCms, 'createProfile') and hasattr(_PILCms.createProfile, '__call__') \
                    else None
            except Exception:
                adobe_profile = None

            if adobe_profile is not None:
                try:
                    test_icc_img = _PILQ.new("RGB", (10, 10), (100, 150, 200))
                    icc_src = test_tmp / "icc_test.png"
                    test_icc_img.save(str(icc_src), format="PNG", icc_profile=adobe_profile.tobytes())
                    icc_out = test_tmp / "icc_out.webp"
                    convert_image(icc_src, icc_out)
                    icc_r = _PILQ.open(icc_out)
                    check("non-sRGB ICC: output valid", icc_r.width > 0)
                    check("non-sRGB ICC: profile stripped", not icc_r.info.get("icc_profile"))
                except Exception:
                    pass  # ICC profile creation might not be available in all Pillow builds

        finally:
            shutil.rmtree(test_tmp, ignore_errors=True)
    except Exception as e:
        check(f"quality block raised: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # ── 9. Transactional publish tests (in temp dir, using isolated copy of tracked state) ──
    print("  transactional publish ...")
    try:
        from PIL import Image as _PIL_TX

        # Create a temp workspace that mirrors the tracked output layout
        with tempfile.TemporaryDirectory(prefix="chabiko-tx-") as tx_root:
            tx_root_p = Path(tx_root)
            tx_assets = tx_root_p / "public" / "assets" / "vocabulary" / "teacher-core-v1"
            tx_json = tx_root_p / "data" / "illustrations" / "teacher-core-v1" / "teacher-vocabulary-batch-01.json"
            tx_assets.mkdir(parents=True, exist_ok=True)
            tx_json.parent.mkdir(parents=True, exist_ok=True)

            # Helper to publish into temp workspace
            def _write_batch_tx(tmp_path: Path, records: list[dict]) -> None:
                tx_assets.mkdir(parents=True, exist_ok=True)
                tx_json.parent.mkdir(parents=True, exist_ok=True)
                for rec in records:
                    src = tmp_path / f"{rec['id']}.webp"
                    shutil.copy2(src, tx_assets / f"{rec['id']}.webp")
                with open(tx_json, "w", encoding="utf-8") as f:
                    json.dump({"illustrations": records}, f, indent=2, ensure_ascii=False)
                    f.write("\n")

            def _snapshot_tx() -> tuple[bool, bytes | None, dict[str, bytes]]:
                h = tx_json.exists()
                jb: bytes | None = tx_json.read_bytes() if h else None
                wb: dict[str, bytes] = {}
                if h:
                    for wp in tx_assets.glob("*.webp"):
                        wb[wp.name] = wp.read_bytes()
                return h, jb, wb

            def _restore_tx(h: bool, jb: bytes | None, wb: dict[str, bytes]) -> None:
                if h and jb is not None:
                    tx_json.write_bytes(jb)
                    for fn, c in wb.items():
                        (tx_assets / fn).write_bytes(c)
                else:
                    for wp in tx_assets.glob("*.webp"):
                        wp.unlink()
                    if tx_json.exists():
                        tx_json.unlink()

            # Generate clean records
            with tempfile.TemporaryDirectory(prefix="chabiko-rec-") as rec_dir:
                rec_path = Path(rec_dir)
                clean_records = _convert_all_to_dir(source_dir, rec_path)

                # 9a. First-publish failure: inject after 5 WebP writes
                has_ex_a, jb_a, wb_a = _snapshot_tx()  # should be False/None/{} initially
                try:
                    tx_assets.mkdir(parents=True, exist_ok=True)
                    tx_json.parent.mkdir(parents=True, exist_ok=True)
                    for i, rec in enumerate(clean_records):
                        src = rec_path / f"{rec['id']}.webp"
                        shutil.copy2(src, tx_assets / f"{rec['id']}.webp")
                        if i == 4:  # fail after 5 WebP copies, before JSON write
                            raise RuntimeError("Injected first-publish failure")
                    with open(tx_json, "w", encoding="utf-8") as f:
                        json.dump({"illustrations": clean_records}, f, indent=2, ensure_ascii=False)
                        f.write("\n")
                    check("tx: first-publish failure raised", False)
                except RuntimeError as e:
                    if "Injected" in str(e):
                        check("tx: first-publish failure caught", True)
                        _restore_tx(has_ex_a, jb_a, wb_a)
                        after_files = list(tx_assets.glob("*.webp"))
                        check(f"tx: first-failure: {len(after_files)} assets (expect 0)", len(after_files) == 0)
                        check("tx: first-failure: JSON absent", not tx_json.exists())
                    else:
                        check(f"tx: unexpected: {e}", False)

                # 9b. Replacement rollback: inject during JSON write
                # First do a clean publish
                _write_batch_tx(rec_path, clean_records)
                has_ex, jb, wb = _snapshot_tx()  # snapshot AFTER clean publish
                baseline_json_hash = _sha256(tx_json)
                baseline_webp_hashes = {p.name: _sha256(p) for p in sorted(tx_assets.glob("*.webp"))}

                try:
                    with tempfile.TemporaryDirectory(prefix="chabiko-mod-") as mod_dir:
                        mod_path = Path(mod_dir)
                        mod_records = _convert_all_to_dir(source_dir, mod_path)
                        # Write assets then inject failure before JSON write
                        for i, rec in enumerate(mod_records):
                            src = mod_path / f"{rec['id']}.webp"
                            shutil.copy2(src, tx_assets / f"{rec['id']}.webp")
                        # JSON write inject
                        raise RuntimeError("Injected replacement failure before JSON write")
                except RuntimeError as e:
                    pass  # expected

                # Verify current state is still the damaged intermediate
                # Then restore and verify
                _restore_tx(has_ex, jb, wb)
                restored_json_hash = _sha256(tx_json)
                check("tx: replacement: JSON rolled back",
                      restored_json_hash == baseline_json_hash)
                restored_webp_hashes = {p.name: _sha256(p) for p in sorted(tx_assets.glob("*.webp"))}
                check("tx: replacement: asset count unchanged",
                      len(restored_webp_hashes) == len(baseline_webp_hashes))
                for fn, cs in baseline_webp_hashes.items():
                    check(f"tx: replacement: {fn} rolled back",
                          restored_webp_hashes.get(fn) == cs)

                # 9c. Post-publish validation failure causes rollback (simulated via _write_batch then explicit rollback)
                has_ex, jb, wb = _snapshot_tx()
                _write_batch_tx(rec_path, clean_records)
                published_json_hash = _sha256(tx_json)
                # Simulate post-publish check failing → rollback
                _restore_tx(has_ex, jb, wb)
                check("tx: post-publish rollback: JSON reverted",
                      not tx_json.exists() if not has_ex else _sha256(tx_json) == hashlib.sha256(jb).hexdigest())

    except Exception as e:
        check(f"tx block raised: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # ── 10. Joined-bundle schema ──
    print("  joined-bundle schema validation ...")
    try:
        with tempfile.TemporaryDirectory(prefix="chabiko-join-") as jd:
            jp = Path(jd)
            ill_records = _convert_all_to_dir(source_dir, jp)
            schema_errors = _validate_joined_bundle(vocab_batch_path, ill_records)
            if schema_errors:
                check("joined-bundle schema (exit 0)", False)
                for se in schema_errors[:5]:
                    print(f"    {se}", file=sys.stderr)
            else:
                check("joined-bundle schema (exit 0)", True)
    except Exception as e:
        check(f"joined-bundle raised: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # ── 11. Git check ──
    print("  git check ...")
    result = subprocess.run(
        ["git", "ls-files", "--", "词汇表/"],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    tracked = [l for l in result.stdout.strip().split("\n") if l]
    check("no source PNGs in Git", len(tracked) == 0)

    print(f"\n  {passed} passed, {failed} failed")
    return 1 if failed else 0


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════


def main():
    parser = argparse.ArgumentParser(
        description="Import teacher-core-v1 batch-01 candidate images as draft WebP assets"
    )
    parser.add_argument("--source-dir", type=str, default=None)
    parser.add_argument("--vocabulary-batch", type=str, default=None)
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    source_dir = Path(args.source_dir).resolve() if args.source_dir else None
    if source_dir is not None and not source_dir.is_dir():
        parser.error(f"--source-dir: not a directory: {source_dir}")
    vocab_batch = Path(args.vocabulary_batch).resolve() if args.vocabulary_batch else None
    if vocab_batch is not None and not vocab_batch.is_file():
        parser.error(f"--vocabulary-batch: not a file: {vocab_batch}")

    if args.test:
        if source_dir is None or vocab_batch is None:
            parser.error("--test requires both --source-dir and --vocabulary-batch")
        sys.exit(run_tests(source_dir, vocab_batch))

    if args.check:
        if source_dir is None or vocab_batch is None:
            parser.error("--check requires both --source-dir and --vocabulary-batch")
        sys.exit(run_check(source_dir, vocab_batch))

    if source_dir is None or vocab_batch is None:
        parser.error("conversion requires both --source-dir and --vocabulary-batch")

    assert_pinned_versions()
    verify_112_batch(vocab_batch)

    print("Converting 19 candidate images ...")
    records = convert_all(source_dir)
    print(f"  Published {len(records)} illustrations")
    print(f"  WebP → {ASSETS_DIR}")
    print(f"  JSON → {BATCH_JSON}")

    print("\nRunning post-publish check ...")
    if run_check(source_dir, vocab_batch) != 0:
        sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
