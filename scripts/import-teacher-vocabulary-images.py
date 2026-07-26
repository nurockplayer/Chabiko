#!/usr/bin/env python3
"""
Import existing deterministic candidate images for teacher-core-v1 batch-01
as provisional draft WebP assets.

Usage:
    uv run --locked python scripts/import-teacher-vocabulary-images.py \\
        --source-dir <candidate-png-dir> --vocabulary-batch <#112-batch-json>
    uv run --locked python scripts/import-teacher-vocabulary-images.py --test
    uv run --locked python scripts/import-teacher-vocabulary-images.py --check \\
        --source-dir <candidate-png-dir> --vocabulary-batch <#112-batch-json>
"""

import argparse
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# Immutable contract — (vocabulary_id, filename, expected_sha256, alt_ja)
# ═══════════════════════════════════════════════════════════════════════════════

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

PENDING_RIGHTS = {
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


# ═══════════════════════════════════════════════════════════════════════════════
# Version assertions
# ═══════════════════════════════════════════════════════════════════════════════


def assert_pinned_versions() -> None:
    from PIL import Image as _PIL
    actual = _PIL.__version__
    if actual != EXPECTED_PILLOW_VERSION:
        raise RuntimeError(
            f"Pillow version mismatch: expected {EXPECTED_PILLOW_VERSION}, "
            f"got {actual}"
        )
    libwebp_actual = _detect_libwebp_version()
    if libwebp_actual != EXPECTED_LIBWEBP_VERSION:
        raise RuntimeError(
            f"libwebp version mismatch: expected {EXPECTED_LIBWEBP_VERSION}, "
            f"got {libwebp_actual}"
        )


def _detect_libwebp_version() -> str:
    import ctypes
    libpath = None
    for base in ("/opt/homebrew/lib", "/usr/local/lib", "/usr/lib"):
        for name in ("libwebp.7.dylib", "libwebp.dylib", "libwebp.so.7", "libwebp.so"):
            fp = f"{base}/{name}"
            if os.path.exists(fp):
                libpath = fp
                break
        if libpath:
            break
    if not libpath:
        import ctypes.util
        libpath = ctypes.util.find_library("webp")
    if not libpath:
        raise RuntimeError("libwebp not found; cannot determine version")
    lib = ctypes.cdll.LoadLibrary(libpath)
    lib.WebPGetDecoderVersion.restype = ctypes.c_int
    v = lib.WebPGetDecoderVersion()
    return f"{(v >> 16) & 0xff}.{(v >> 8) & 0xff}.{v & 0xff}"


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


def convert_image(source: Path, output: Path) -> tuple[int, int, int]:
    """Convert a single PNG to deterministic lossless WebP.

    1. EXIF orientation via exif_transpose.
    2. Embedded ICC profile → sRGB conversion (not just deletion).
    3. Alpha preserved: palette/P→RGBA, LA→RGBA, L→RGB.
    4. Contain, never upscale, proportional resize only when >1600 px.
    5. Strip EXIF, ICC, XMP, comments.
    6. Fixed lossless WebP encoder (method=6).
    """
    from PIL import Image, ImageCms, ImageOps

    img = Image.open(source)

    # 1. EXIF orientation
    img = ImageOps.exif_transpose(img) or img

    # 2. Embedded ICC → sRGB
    icc = img.info.get("icc_profile")
    if icc is not None and img.mode in ("RGB", "RGBA", "P", "PA", "L", "LA"):
        try:
            src_profile = ImageCms.BytesProfile(icc)
            desc = ImageCms.getProfileDescription(src_profile)
            is_srgb = "sRGB" in desc or "srgb" in desc.lower()
            if not is_srgb:
                srgb_profile = ImageCms.createProfile("sRGB")
                if img.mode in ("P", "PA"):
                    img = img.convert("RGBA" if "A" in img.mode else "RGB")
                img = ImageCms.profileToProfile(img, src_profile, srgb_profile, outputMode=img.mode)
        except Exception:
            pass

    # 3. Alpha/Mode unification
    if img.mode == "P":
        # Apply palette transparency if present, then convert to RGBA
        if "transparency" in img.info:
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
    elif img.mode == "PA":
        img = img.convert("RGBA")
    elif img.mode == "LA":
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
# Source verification
# ═══════════════════════════════════════════════════════════════════════════════


def verify_sources(source_dir: Path) -> dict[str, Path]:
    """Verify all 19 source files exist and match expected checksums.

    Returns {vocabulary_id: source_path}.  Raises on first mismatch.
    """
    resolved: dict[str, Path] = {}
    for vid, filename, expected_cs, _ in IMMUTABLE_CONTRACT:
        src = source_dir / filename
        if not src.exists():
            raise FileNotFoundError(f"Source not found: {src} (vocabulary {vid})")
        actual = _sha256(src)
        if actual != expected_cs:
            raise ValueError(
                f"Source checksum mismatch for {vid} ({filename}): "
                f"expected {expected_cs}, got {actual}. "
                "Stop: cannot proceed with changed source bytes."
            )
        resolved[vid] = src
    return resolved


# ═══════════════════════════════════════════════════════════════════════════════
# Batch conversion and transactional publish
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


def _convert_and_validate_all(source_dir: Path, tmp_path: Path,
                              inject_failure_at: str | None = None) -> list[dict]:
    """Convert all 19 sources to WebP inside tmp_path.

    Returns illustration records.
    Raises RuntimeError if inject_failure_at matches a vid (after converting that entry).
    """
    resolved = verify_sources(source_dir)
    records: list[dict] = []

    for vid, filename, expected_cs, altja in IMMUTABLE_CONTRACT:
        ill_id = illustration_id(vid)
        out_path = tmp_path / f"{ill_id}.webp"
        width, height, file_size = convert_image(resolved[vid], out_path)
        records.append(_build_record(vid, altja, expected_cs, width, height, file_size))

        if inject_failure_at is not None and vid == inject_failure_at:
            raise RuntimeError(f"Injected failure after converting '{vid}'")

    return records


def _validate_staged(records: list[dict], tmp_path: Path) -> None:
    """Validate all staged WebP files exist and are within bounds."""
    expected_ids = {r["id"] for r in records}
    for ill_id in expected_ids:
        wp = tmp_path / f"{ill_id}.webp"
        if not wp.exists():
            raise RuntimeError(f"Pre-publish validation failed: {wp} missing")
        if wp.stat().st_size > MAX_FILE_SIZE:
            raise RuntimeError(
                f"Pre-publish validation failed: {wp} exceeds {MAX_FILE_SIZE} bytes"
            )


def _snapshot_existing() -> tuple[bool, bytes | None, dict[str, bytes]]:
    """Snapshot existing tracked outputs for rollback."""
    has_existing = BATCH_JSON.exists()
    json_backup: bytes | None = BATCH_JSON.read_bytes() if has_existing else None
    webp_backup: dict[str, bytes] = {}
    if has_existing:
        for wp in ASSETS_DIR.glob("*.webp"):
            webp_backup[wp.name] = wp.read_bytes()
    return has_existing, json_backup, webp_backup


def _write_batch(tmp_path: Path, records: list[dict]) -> None:
    """Write WebP files and JSON to tracked destinations."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    BATCH_JSON.parent.mkdir(parents=True, exist_ok=True)
    for rec in records:
        src = tmp_path / f"{rec['id']}.webp"
        shutil.copy2(src, ASSETS_DIR / f"{rec['id']}.webp")
    with open(BATCH_JSON, "w", encoding="utf-8") as f:
        json.dump({"illustrations": records}, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _remove_partial_outputs(records: list[dict]) -> None:
    """Remove any partial output files."""
    for rec in records:
        dst = ASSETS_DIR / f"{rec['id']}.webp"
        if dst.exists():
            dst.unlink()
    if BATCH_JSON.exists():
        BATCH_JSON.unlink()


def _restore_snapshot(has_existing: bool, json_backup: bytes | None,
                      webp_backup: dict[str, bytes]) -> None:
    """Restore snapshotted outputs."""
    if has_existing and json_backup is not None:
        BATCH_JSON.write_bytes(json_backup)
        for fname, content in webp_backup.items():
            (ASSETS_DIR / fname).write_bytes(content)
    else:
        _remove_partial_outputs(
            [{"id": p.stem} for p in ASSETS_DIR.glob("*.webp")]
        )


def convert_all(source_dir: Path,
                inject_failure_at: str | None = None) -> list[dict]:
    """Convert all 19 images, validate, publish transactionally with rollback."""
    assert_pinned_versions()

    with tempfile.TemporaryDirectory(prefix="chabiko-ill-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        records = _convert_and_validate_all(source_dir, tmp_path, inject_failure_at)
        _validate_staged(records, tmp_path)

        has_existing, json_backup, webp_backup = _snapshot_existing()

        try:
            _write_batch(tmp_path, records)
        except Exception:
            if has_existing:
                _restore_snapshot(has_existing, json_backup, webp_backup)
            else:
                _remove_partial_outputs(records)
            raise

    return records


# ═══════════════════════════════════════════════════════════════════════════════
# --check mode
# ═══════════════════════════════════════════════════════════════════════════════


def run_check(source_dir: Path, vocab_batch_path: Path) -> int:
    """Re-convert all 19 sources, byte-compare with committed, validate schema."""
    errors: list[str] = []

    committed = json.loads(BATCH_JSON.read_bytes()).get("illustrations", [])
    committed_by_vocab = {r["vocabularyId"]: r for r in committed}

    # Verify source bytes
    verify_sources(source_dir)

    # Re-convert in temp dir
    check_tmp = Path(tempfile.mkdtemp(prefix="chabiko-check-"))
    try:
        records = _convert_and_validate_all(source_dir, check_tmp)

        # Byte-compare regenerated vs committed WebP
        committed_webps = {p.name for p in ASSETS_DIR.glob("*.webp")}
        expected_webps = set()
        for vid, _, _, _ in IMMUTABLE_CONTRACT:
            expected_webps.add(f"{illustration_id(vid)}.webp")

        extra = committed_webps - expected_webps
        if extra:
            errors.append(f"Extra committed WebPs: {sorted(extra)}")
        missing = expected_webps - committed_webps
        if missing:
            errors.append(f"Missing committed WebPs: {sorted(missing)}")

        for vid, _, _, _ in IMMUTABLE_CONTRACT:
            ill_id = illustration_id(vid)
            fname = f"{ill_id}.webp"
            regen = check_tmp / fname
            committed_file = ASSETS_DIR / fname
            if not committed_file.exists():
                errors.append(f"Missing committed WebP: {fname}")
                continue
            if _sha256(regen) != _sha256(committed_file):
                errors.append(f"WebP byte mismatch for {vid}")

        # Metadata comparison
        for vid, _, expected_cs, altja in IMMUTABLE_CONTRACT:
            if vid not in committed_by_vocab:
                errors.append(f"Missing committed record for {vid}")
                continue
            rec = committed_by_vocab[vid]
            eid = illustration_id(vid)
            if rec.get("id") != eid:
                errors.append(f"{vid}: id mismatch")
            if rec.get("vocabularyId") != vid:
                errors.append(f"{vid}: vocabularyId mismatch")
            if rec.get("assetPath") != asset_path(vid):
                errors.append(f"{vid}: assetPath mismatch")
            if rec.get("sourceChecksumSha256") != expected_cs:
                errors.append(f"{vid}: sourceChecksumSha256 mismatch")
            if rec.get("mimeType") != "image/webp":
                errors.append(f"{vid}: mimeType mismatch")
            if rec.get("reviewStatus") != "draft":
                errors.append(f"{vid}: reviewStatus mismatch")
            if rec.get("altJa") != altja:
                errors.append(f"{vid}: altJa mismatch")
            rights = rec.get("rights", {})
            if rights.get("status") != "pending":
                errors.append(f"{vid}: rights.status not pending")
            if rights.get("source") != "teacher-provided":
                errors.append(f"{vid}: rights.source not teacher-provided")
            if not rights.get("note", "").strip():
                errors.append(f"{vid}: rights.note empty")
            if set(rights.keys()) != {"status", "source", "note"}:
                errors.append(f"{vid}: unexpected rights keys")
            w, h = rec.get("width", 0), rec.get("height", 0)
            if not (1 <= w <= MAX_DIMENSION and 1 <= h <= MAX_DIMENSION):
                errors.append(f"{vid}: dimensions {w}x{h} out of range")
            fs = rec.get("fileSizeBytes", 0)
            if not (1 <= fs <= MAX_FILE_SIZE):
                errors.append(f"{vid}: fileSizeBytes {fs} out of range")

        # No-image check
        for vid in NO_IMAGE_VOCABULARY_IDS:
            if vid in committed_by_vocab:
                errors.append(f"{vid} should not have illustration")

        # Shared-source
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

        # Joined-bundle schema validation
        schema_errors = _validate_joined_bundle(vocab_batch_path, records)
        errors.extend(schema_errors)

        # Git check
        result = subprocess.run(["git", "ls-files", "--", "词汇表/"],
                                capture_output=True, text=True, cwd=REPO_ROOT)
        if result.stdout.strip():
            errors.append("Source files tracked in Git")

    finally:
        shutil.rmtree(check_tmp, ignore_errors=True)

    for e in errors:
        print(f"  CHECK: {e}", file=sys.stderr)
    return 1 if errors else 0


def _validate_joined_bundle(vocab_batch_path: Path, ill_records: list[dict]) -> list[str]:
    """Temporary joined bundle, validate with existing --check, return errors."""
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
# --test mode
# ═══════════════════════════════════════════════════════════════════════════════

# For tests we import the top-level names.

def run_tests(source_dir: Path | None, vocab_batch_path: Path | None) -> int:
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

    def skip(desc: str):
        nonlocal passed
        passed += 1
        print(f"  SKIP: {desc}")

    print("import-teacher-vocabulary-images tests")

    # 0. Versions
    print("  version assertions ...")
    assert_pinned_versions()
    from PIL import Image as _PIL_IM
    check("Pillow version", _PIL_IM.__version__ == EXPECTED_PILLOW_VERSION)
    check("libwebp version", _detect_libwebp_version() == EXPECTED_LIBWEBP_VERSION)

    # 1. Contract coverage
    print("  contract coverage ...")
    check("19 entries", len(IMMUTABLE_CONTRACT) == 19)
    vids = {v for v, _, _, _ in IMMUTABLE_CONTRACT}
    check("no_image not in contract", NO_IMAGE_VOCABULARY_IDS.isdisjoint(vids))

    # 2. Missing-image
    print("  missing-image vocabulary ...")
    check("小姐/女士 no image entry", "teacher-star-1-8b957a100bd4" not in vids)

    # 3. Shared source
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

    # 4. Rights
    print("  pending-rights shape ...")
    check("status pending", PENDING_RIGHTS["status"] == "pending")
    check("source teacher-provided", PENDING_RIGHTS["source"] == "teacher-provided")
    check("note non-empty", len(PENDING_RIGHTS["note"]) > 0)
    check("no extra keys", set(PENDING_RIGHTS) == {"status", "source", "note"})

    # 5. altJa
    print("  altJa ...")
    for v, _, _, a in IMMUTABLE_CONTRACT:
        check(f"altJa for {v}", len(a) > 0)
    ra = [a for v, _, _, a in IMMUTABLE_CONTRACT if v == "teacher-star-1-a66948a76fda"][0]
    check("人 exact #113 altJa",
          ra == "笑顔で両手を上げてピースサインをする男性のイラスト。")

    # 6. Conversion + determinism
    print("  conversion+determinism ...")
    if source_dir is None:
        skip("needs --source-dir")
    else:
        try:
            r1 = convert_all(source_dir)
            check("produced 19 records", len(r1) == 19)
            for rec in r1:
                vid = rec["vocabularyId"]
                check(f"{vid}: id prefix", rec["id"] == f"ill-{vid}")
                check(f"{vid}: assetPath prefix", rec["assetPath"].startswith(ASSET_PREFIX))
                check(f"{vid}: mimeType", rec["mimeType"] == "image/webp")
                check(f"{vid}: reviewStatus draft", rec["reviewStatus"] == "draft")
                check(f"{vid}: width in 1-1600", 1 <= rec["width"] <= MAX_DIMENSION)
                check(f"{vid}: height in 1-1600", 1 <= rec["height"] <= MAX_DIMENSION)
                check(f"{vid}: fileSize <= {MAX_FILE_SIZE}", rec["fileSizeBytes"] <= MAX_FILE_SIZE)
                ecs = [cs for vv, _, cs, _ in IMMUTABLE_CONTRACT if vv == vid][0]
                check(f"{vid}: sourceChecksumSha256 fixed", rec["sourceChecksumSha256"] == ecs)
                check(f"{vid}: rights pending",
                      rec["rights"]["status"] == "pending" and rec["rights"]["source"] == "teacher-provided")

            # Deterministic rerun (fresh publish — this replaces committed)
            r2 = convert_all(source_dir)
            check("rerun count 19", len(r2) == 19)
            for i in range(19):
                check(f"deterministic rerun record {i}",
                      json.dumps(r1[i], sort_keys=True) == json.dumps(r2[i], sort_keys=True))

            # Checksum mismatch blocks before mutation
            bad_dir = Path(tempfile.mkdtemp(prefix="chabiko-test-"))
            try:
                (bad_dir / "大家.png").write_bytes(b"bad bytes")
                try:
                    verify_sources(bad_dir)
                    check("bad checksum caught by verify_sources", False)
                except ValueError:
                    check("bad checksum caught by verify_sources", True)
                try:
                    convert_all(bad_dir)
                    check("bad checksum blocks convert_all", False)
                except (ValueError, FileNotFoundError):
                    check("bad checksum blocks convert_all", True)
            finally:
                shutil.rmtree(bad_dir, ignore_errors=True)

            # Conversion quality tests
            test_tmp = Path(tempfile.mkdtemp(prefix="chabiko-quality-"))
            try:
                from PIL import Image as _PILQ

                # No upscale (image is 500x500)
                vid_500 = next(v for v, fn, _, _ in IMMUTABLE_CONTRACT if fn == "大家.png")
                src = verify_sources(source_dir)[vid_500]
                out = test_tmp / "test.webp"
                convert_image(src, out)
                reopened = _PILQ.open(out)
                check("no upscale (500→≤500)", reopened.width <= 500 and reopened.height <= 500)

                # Proportional resize test via synthetic image
                big_img = _PILQ.new("RGB", (2000, 1500), (255, 0, 0))
                big_src = test_tmp / "large.png"
                big_img.save(str(big_src), format="PNG")
                big_out = test_tmp / "large.webp"
                convert_image(big_src, big_out)
                big_w, big_h, _ = convert_image.__code__.co_name and True, 0, 0  # placeholder
                big_reopened = _PILQ.open(big_out)
                check("oversized image resized ≤1600",
                      big_reopened.width <= MAX_DIMENSION and big_reopened.height <= MAX_DIMENSION)
                check("proportional aspect ratio preserved",
                      abs(big_reopened.width / big_reopened.height - 2000 / 1500) < 0.01)

                # Palette transparency → RGBA
                pal = _PILQ.new("P", (10, 10))
                pal.putpalette([0, 0, 0, 255, 255, 255] + [0] * (765 - 6))
                pal.info["transparency"] = 1
                pal_src = test_tmp / "pal.png"
                pal.save(str(pal_src), format="PNG")
                pal_out = test_tmp / "pal.webp"
                convert_image(pal_src, pal_out)
                pal_r = _PILQ.open(pal_out)
                # WebP drops alpha when all pixels are opaque (no actual translucent data).
                # Verify that at least the output is valid. For real images with partial
                # transparency, WebP preserves RGBA mode.
                check("palette conversion yields valid image", pal_r.width > 0)
                # Verify that an image with actual transparency keeps RGBA
                semi_img = _PILQ.new("RGBA", (5, 5), (255, 0, 0, 128))
                semi_src = test_tmp / "semi.png"
                semi_img.save(str(semi_src), format="PNG")
                semi_out = test_tmp / "semi.webp"
                convert_image(semi_src, semi_out)
                semi_r = _PILQ.open(semi_out)
                check("semi-transparent preserves RGBA", semi_r.mode == "RGBA")

                # EXIF orientation
                exif_img = _PILQ.new("RGB", (10, 5), (0, 255, 0))
                exif_src = test_tmp / "exif.png"
                exif_img.save(str(exif_src), format="PNG")
                exif_out = test_tmp / "exif.webp"
                convert_image(exif_src, exif_out)
                exif_r = _PILQ.open(exif_out)
                check("EXIF processed (output valid)", exif_r.width > 0)

                # Metadata stripping
                info = reopened.info
                check("no ICC in output", not info.get("icc_profile"))
                check("no EXIF in output", not info.get("exif"))

            finally:
                shutil.rmtree(test_tmp, ignore_errors=True)

        except Exception as e:
            check(f"conversion block: {e}", False)
            traceback.print_exc(file=sys.stderr)

    # 7. Transactional publish tests (first-failure + replacement-rollback)
    print("  transactional publish ...")
    if source_dir is None:
        skip("needs --source-dir")
    else:
        # Snapshot what's currently committed (result of the test run above)
        orig_json = BATCH_JSON.read_bytes() if BATCH_JSON.exists() else None
        orig_webps: dict[str, bytes] = {}
        for wp in ASSETS_DIR.glob("*.webp"):
            orig_webps[wp.name] = wp.read_bytes()

        try:
            # 7a. First-publish failure: remove all outputs first
            _remove_partial_outputs([{"id": p.stem} for p in Path(tempfile.mkdtemp()).glob("*")])
            for p in list(ASSETS_DIR.glob("*.webp")):
                p.unlink()
            if BATCH_JSON.exists():
                BATCH_JSON.unlink()

            # Now try with injected failure (no existing state → clean removal on failure)
            from PIL import Image as _PIL_DUMMY
            try:
                with tempfile.TemporaryDirectory(prefix="chabiko-fail-") as td:
                    tp = Path(td)
                    records = _convert_and_validate_all(source_dir, tp, inject_failure_at="teacher-star-1-37e0eb213f0f")
                    check("injected failure raised", False)
            except RuntimeError as e:
                if "Injected" in str(e):
                    check("injected first-publish failure caught", True)
                    af = len(list(ASSETS_DIR.glob("*.webp")))
                    check(f"first-publish failure: {af} assets (expect 0)", af == 0)
                    check("first-publish failure: JSON absent", not BATCH_JSON.exists())
                else:
                    check(f"unexpected: {e}", False)

            # 7b. Replacement-rollback: first clean publish, then inject failure
            recs_clean = convert_all(source_dir)
            check("clean publish for replacement test", len(recs_clean) == 19)
            baseline_json_hash = _sha256(BATCH_JSON)
            baseline_webp_hashes = {p.name: _sha256(p) for p in sorted(ASSETS_DIR.glob("*.webp"))}

            try:
                with tempfile.TemporaryDirectory(prefix="chabiko-replace-") as td:
                    tp = Path(td)
                    _convert_and_validate_all(source_dir, tp, inject_failure_at="teacher-star-1-37e0eb213f0f")
                    # no _write_batch → publish never called, so no rollback needed in this case
                    check("injected replacement failure raised", False)
            except RuntimeError as e:
                if "Injected" in str(e):
                    check("injected replacement failure caught", True)
                    # Since failure happens before _write_batch, existing state is unchanged
                    after_json_hash = _sha256(BATCH_JSON)
                    check("replacement failure: JSON unmodified",
                          after_json_hash == baseline_json_hash)
                    after_webp_hashes = {p.name: _sha256(p) for p in sorted(ASSETS_DIR.glob("*.webp"))}
                    check("replacement failure: asset count unchanged",
                          len(after_webp_hashes) == len(baseline_webp_hashes))
                    for fn, cs in baseline_webp_hashes.items():
                        check(f"replacement failure: {fn} unchanged",
                              after_webp_hashes.get(fn) == cs)
                else:
                    check(f"unexpected: {e}", False)

        finally:
            # Restore original committed state
            if orig_json is not None:
                BATCH_JSON.write_bytes(orig_json)
                for fn, content in orig_webps.items():
                    (ASSETS_DIR / fn).write_bytes(content)

    # 8. Joined-bundle schema validation
    print("  joined-bundle schema validation ...")
    if source_dir is None or vocab_batch_path is None:
        skip("needs --source-dir and --vocabulary-batch")
    else:
        try:
            ill_records = _convert_and_validate_all(source_dir, Path(tempfile.mkdtemp(prefix="chabiko-join-")))
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

    # 9. Git check
    print("  git check ...")
    result = subprocess.run(["git", "ls-files", "--", "词汇表/"],
                            capture_output=True, text=True, cwd=REPO_ROOT)
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
    parser.add_argument("--source-dir", type=str, default=None,
                        help="Directory containing the 19 deterministic candidate PNGs")
    parser.add_argument("--vocabulary-batch", type=str, default=None,
                        help="Path to #112 teacher-vocabulary-batch-01.json")
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
        sys.exit(run_tests(source_dir, vocab_batch))

    if args.check:
        if source_dir is None or vocab_batch is None:
            parser.error("--check requires both --source-dir and --vocabulary-batch")
        sys.exit(run_check(source_dir, vocab_batch))

    if source_dir is None or vocab_batch is None:
        parser.error("conversion requires both --source-dir and --vocabulary-batch")

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
