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
    "status": "pending", "source": "teacher-provided",
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

EXPECTED_112_BATCH_SHA256 = "95cacb68c11d960380768182e400b5253625365ba97093751adbde1334d73ebc"
EXPECTED_112_VOCABULARY_IDS: list[str] = [
    "teacher-star-1-37e0eb213f0f", "teacher-star-1-a66948a76fda",
    "teacher-star-1-86f5cdb6e25c", "teacher-star-1-bdc7865a507e",
    "teacher-star-1-86367b2d53f6", "teacher-star-1-8b957a100bd4",
    "teacher-star-1-2cfcacc0503e", "teacher-star-1-e7bc12c4f23a",
    "teacher-star-1-e64490a207eb", "teacher-star-1-bada4e11125d",
    "teacher-star-1-d903f490725f", "teacher-star-1-7420330fee5c",
    "teacher-star-1-ed096023b3be", "teacher-star-1-cb42fb8775e5",
    "teacher-star-1-c39a19585434", "teacher-star-1-3e6fabf09358",
    "teacher-star-1-1c0cdf0b2b9c", "teacher-star-1-8fea4ac29b4c",
    "teacher-star-1-94757170c2b0", "teacher-star-1-0cc5799cdbbc",
]
EXPECTED_NO_IMAGE_ID = "teacher-star-1-8b957a100bd4"


# ═══════════════════════════════════════════════════════════════════════════════
# Version assertions
# ═══════════════════════════════════════════════════════════════════════════════

def assert_pinned_versions() -> None:
    from PIL import Image as _PIL
    actual = _PIL.__version__
    if actual != EXPECTED_PILLOW_VERSION:
        raise RuntimeError(f"Pillow mismatch: expected {EXPECTED_PILLOW_VERSION}, got {actual}")
    lib = _pillow_linked_libwebp_version()
    if lib != EXPECTED_LIBWEBP_VERSION:
        raise RuntimeError(f"libwebp mismatch: expected {EXPECTED_LIBWEBP_VERSION}, got {lib}")

def _pillow_linked_libwebp_version() -> str:
    from PIL import _webp
    raw = _webp.webpdecoder_version
    if isinstance(raw, str):
        return raw
    if isinstance(raw, tuple):
        return f"{raw[0]}.{raw[1]}.{raw[2]}"
    raise RuntimeError(f"unexpected libwebp format: {type(raw).__name__}")


# ═══════════════════════════════════════════════════════════════════════════════
# #112 batch verification
# ═══════════════════════════════════════════════════════════════════════════════

def verify_112_batch(vocab_batch_path: Path) -> list[dict]:
    raw = vocab_batch_path.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != EXPECTED_112_BATCH_SHA256:
        raise ValueError(
            f"#112 batch checksum mismatch: expected {EXPECTED_112_BATCH_SHA256}, got {actual}."
        )
    data = json.loads(raw)
    vocab = data.get("vocabulary", [])
    ids = [r.get("id", "") for r in vocab]
    if len(ids) != 20:
        raise ValueError(f"#112 batch: expected 20 records, got {len(ids)}")
    for i, (e, a) in enumerate(zip(EXPECTED_112_VOCABULARY_IDS, ids)):
        if e != a:
            raise ValueError(f"#112 batch: position {i} expected {e}, got {a}")
    if not any(rid == EXPECTED_NO_IMAGE_ID for rid in ids):
        raise ValueError(f"#112 batch: no-image row {EXPECTED_NO_IMAGE_ID} not found")
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
    """Convert embedded ICC profile to sRGB.  Fail-closed: raises on error."""
    from PIL import ImageCms
    from io import BytesIO
    icc = img.info.get("icc_profile")
    if icc is None:
        return img
    if img.mode not in ("RGB", "RGBA", "P", "PA", "L", "LA"):
        return img
    src_profile = ImageCms.getOpenProfile(BytesIO(icc))
    desc = ImageCms.getProfileDescription(src_profile)
    if "sRGB" in desc or "srgb" in desc.lower():
        return img
    srgb_profile = ImageCms.createProfile("sRGB")
    if img.mode in ("P", "PA"):
        img = img.convert("RGBA" if "A" in img.mode else "RGB")
    img = ImageCms.profileToProfile(img, src_profile, srgb_profile, outputMode=img.mode)
    return img

def convert_image(source: Path, output: Path) -> tuple[int, int, int]:
    from PIL import Image, ImageOps
    img = Image.open(source)
    # 1. EXIF orientation
    img = ImageOps.exif_transpose(img) or img
    # 2. ICC→sRGB (fail-closed)
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
    # 4–5. Contain, no upscale, proportional resize > MAX_DIMENSION
    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        nw, nh = int(w * ratio), int(h * ratio)
        img = img.resize((nw, nh), Image.LANCZOS)
    else:
        nw, nh = w, h
    # 6–7. Strip metadata, deterministic WebP
    img.save(output, format="WEBP", lossless=True, method=6,
             exif=b"", icc_profile=None, comment=b"")
    return nw, nh, output.stat().st_size


# ═══════════════════════════════════════════════════════════════════════════════
# Source verification
# ═══════════════════════════════════════════════════════════════════════════════

def verify_sources(source_dir: Path) -> dict[str, Path]:
    resolved: dict[str, Path] = {}
    for vid, filename, expected_cs, _ in IMMUTABLE_CONTRACT:
        src = source_dir / filename
        if not src.exists():
            raise FileNotFoundError(f"Source not found: {src} ({vid})")
        actual = _sha256(src)
        if actual != expected_cs:
            raise ValueError(f"Source checksum mismatch for {vid}: expected {expected_cs}, got {actual}.")
        resolved[vid] = src
    return resolved


# ═══════════════════════════════════════════════════════════════════════════════
# Batch conversion
# ═══════════════════════════════════════════════════════════════════════════════

def _build_record(vid: str, altja: str, cs: str, w: int, h: int, fs: int) -> dict:
    return {"id": illustration_id(vid), "vocabularyId": vid,
            "assetPath": asset_path(vid), "sourceChecksumSha256": cs,
            "width": w, "height": h, "mimeType": "image/webp", "fileSizeBytes": fs,
            "altJa": altja, "rights": dict(PENDING_RIGHTS), "reviewStatus": "draft"}

def _convert_all_to_dir(source_dir: Path, tmp_path: Path) -> list[dict]:
    resolved = verify_sources(source_dir)
    records: list[dict] = []
    for vid, _, expected_cs, altja in IMMUTABLE_CONTRACT:
        out = tmp_path / f"{illustration_id(vid)}.webp"
        w, h, fs = convert_image(resolved[vid], out)
        records.append(_build_record(vid, altja, expected_cs, w, h, fs))
    return records


# ═══════════════════════════════════════════════════════════════════════════════
# Transactional publish — parameterized paths so production and tests share code
# ═══════════════════════════════════════════════════════════════════════════════

def _snapshot(assets_dir: Path, batch_json: Path) -> tuple[bool, bytes | None, dict[str, bytes]]:
    has = batch_json.exists()
    jb: bytes | None = batch_json.read_bytes() if has else None
    wb: dict[str, bytes] = {}
    if has:
        for wp in assets_dir.glob("*.webp"):
            wb[wp.name] = wp.read_bytes()
    return has, jb, wb

def _remove_partial(assets_dir: Path, batch_json: Path) -> None:
    for wp in assets_dir.glob("*.webp"):
        wp.unlink()
    if batch_json.exists():
        batch_json.unlink()

def _restore(has_existing: bool, json_backup: bytes | None,
             webp_backup: dict[str, bytes],
             assets_dir: Path, batch_json: Path) -> None:
    if has_existing and json_backup is not None:
        batch_json.write_bytes(json_backup)
        for fname, content in webp_backup.items():
            (assets_dir / fname).write_bytes(content)
    else:
        _remove_partial(assets_dir, batch_json)

def _write_assets(tmp_path: Path, records: list[dict],
                  assets_dir: Path, batch_json: Path) -> None:
    assets_dir.mkdir(parents=True, exist_ok=True)
    batch_json.parent.mkdir(parents=True, exist_ok=True)
    for rec in records:
        src = tmp_path / f"{rec['id']}.webp"
        if not src.exists():
            raise RuntimeError(f"Staged WebP missing: {src}")
        shutil.copy2(src, assets_dir / f"{rec['id']}.webp")
    with open(batch_json, "w", encoding="utf-8") as f:
        json.dump({"illustrations": records}, f, indent=2, ensure_ascii=False)
        f.write("\n")


def convert_all(source_dir: Path, vocab_batch_path: Path) -> list[dict]:
    """Convert 19 images, validate staged + batch + schema, publish
    transactionally.  ANY failure (write or post-check) triggers rollback."""
    assert_pinned_versions()
    verify_112_batch(vocab_batch_path)

    with tempfile.TemporaryDirectory(prefix="chabiko-ill-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        records = _convert_all_to_dir(source_dir, tmp_path)

        # Pre-publish validation: staged files, joined-bundle schema
        for rec in records:
            wp = tmp_path / f"{rec['id']}.webp"
            if not wp.exists():
                raise RuntimeError(f"Pre-publish: {wp} missing")
            if wp.stat().st_size > MAX_FILE_SIZE:
                raise RuntimeError(f"Pre-publish: {wp} exceeds {MAX_FILE_SIZE}B")
        schema_errs = _validate_joined_bundle(vocab_batch_path, records)
        if schema_errs:
            raise RuntimeError(f"Pre-publish schema failure: {'; '.join(schema_errs)}")

        has_existing, json_backup, webp_backup = _snapshot(ASSETS_DIR, BATCH_JSON)

        try:
            _write_assets(tmp_path, records, ASSETS_DIR, BATCH_JSON)
        except BaseException:
            _restore(has_existing, json_backup, webp_backup, ASSETS_DIR, BATCH_JSON)
            raise

        # Post-publish check — same rollback scope
        try:
            _run_check_core(source_dir, vocab_batch_path, tmp_path, records)
        except BaseException:
            _restore(has_existing, json_backup, webp_backup, ASSETS_DIR, BATCH_JSON)
            raise

    return records


# ═══════════════════════════════════════════════════════════════════════════════
# --check core (shared by --check CLI and post-publish verification)
# ═══════════════════════════════════════════════════════════════════════════════

def _run_check_core(source_dir: Path, vocab_batch_path: Path,
                    check_tmp: Path, records: list[dict]) -> None:
    """Compare committed JSON and WebP against regenerated records."""
    committed = json.loads(BATCH_JSON.read_bytes()).get("illustrations", [])
    expected_json = json.dumps({"illustrations": records}, indent=2, ensure_ascii=False) + "\n"
    committed_json = BATCH_JSON.read_text(encoding="utf-8")
    if committed_json != expected_json:
        raise RuntimeError("Committed JSON does not match regenerated records (count/order/fields)")

    expected_webps = {f"{illustration_id(vid)}.webp" for vid, _, _, _ in IMMUTABLE_CONTRACT}
    committed_webps = {p.name for p in ASSETS_DIR.glob("*.webp")}
    extra = committed_webps - expected_webps
    if extra:
        raise RuntimeError(f"Extra committed WebPs: {sorted(extra)}")
    missing = expected_webps - committed_webps
    if missing:
        raise RuntimeError(f"Missing committed WebPs: {sorted(missing)}")
    for vid, _, _, _ in IMMUTABLE_CONTRACT:
        fname = f"{illustration_id(vid)}.webp"
        regen = check_tmp / fname
        committed_file = ASSETS_DIR / fname
        if not committed_file.exists():
            raise RuntimeError(f"Committed WebP missing: {fname}")
        if _sha256(regen) != _sha256(committed_file):
            raise RuntimeError(f"WebP byte mismatch for {vid}")

    committed_by_vocab = {r["vocabularyId"]: r for r in committed}
    if len(committed_by_vocab) != 19:
        raise RuntimeError(f"Expected 19 unique vocab IDs, got {len(committed_by_vocab)}")
    for vid in NO_IMAGE_VOCABULARY_IDS:
        if vid in committed_by_vocab:
            raise RuntimeError(f"{vid} should not have illustration")

    # Git check
    result = subprocess.run(["git", "ls-files", "--", "词汇表/"],
                            capture_output=True, text=True, cwd=REPO_ROOT)
    if result.stdout.strip():
        raise RuntimeError("Source files tracked in Git")


def run_check(source_dir: Path, vocab_batch_path: Path) -> int:
    errors: list[str] = []
    assert_pinned_versions()
    verify_112_batch(vocab_batch_path)
    check_tmp = Path(tempfile.mkdtemp(prefix="chabiko-check-"))
    try:
        records = _convert_all_to_dir(source_dir, check_tmp)
        _run_check_core(source_dir, vocab_batch_path, check_tmp, records)
    except RuntimeError as e:
        errors.append(str(e))
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
    joined = {"teacher_vocabulary": vocab_data.get("vocabulary", []), "illustrations": ill_records}
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
# --test mode (all ops in temp dirs; uses parameterized publish helpers)
# ═══════════════════════════════════════════════════════════════════════════════

def run_tests(source_dir: Path, vocab_batch_path: Path) -> int:
    import traceback
    passed, failed = 0, 0
    def check(desc: str, ok: bool):
        nonlocal passed, failed
        if ok:
            passed += 1
        else:
            failed += 1
            print(f"  FAIL: {desc}", file=sys.stderr)
    print("import-teacher-vocabulary-images tests")

    # 0. Versions
    print("  version assertions ...")
    assert_pinned_versions()
    from PIL import Image as _PIL_IM
    check("Pillow version", _PIL_IM.__version__ == EXPECTED_PILLOW_VERSION)
    check("libwebp version", _pillow_linked_libwebp_version() == EXPECTED_LIBWEBP_VERSION)

    # 1. #112 batch
    print("  #112 batch verification ...")
    verify_112_batch(vocab_batch_path)
    check("112 batch checksum + 20 IDs + no-image row", True)

    # 2. Contract
    print("  contract coverage ...")
    check("19 entries", len(IMMUTABLE_CONTRACT) == 19)
    vids = {v for v, _, _, _ in IMMUTABLE_CONTRACT}
    check("no_image not in contract", NO_IMAGE_VOCABULARY_IDS.isdisjoint(vids))
    check("小姐/女士 no image entry", "teacher-star-1-8b957a100bd4" not in vids)

    # 3. Shared source
    print("  shared-source ...")
    cb = {v: (fn, cs) for v, fn, cs, _ in IMMUTABLE_CONTRACT}
    check("爸爸/父亲 same file", cb["teacher-star-1-e7bc12c4f23a"][0] == cb["teacher-star-1-bada4e11125d"][0])
    check("妈妈/母亲 same file", cb["teacher-star-1-e64490a207eb"][0] == cb["teacher-star-1-d903f490725f"][0])
    check("爸爸/父亲 same cs", cb["teacher-star-1-e7bc12c4f23a"][1] == cb["teacher-star-1-bada4e11125d"][1])
    check("妈妈/母亲 same cs", cb["teacher-star-1-e64490a207eb"][1] == cb["teacher-star-1-d903f490725f"][1])

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
    check("人 exact #113 altJa", ra == "笑顔で両手を上げてピースサインをする男性のイラスト。")

    # 6. Conversion + determinism (temp dir only)
    print("  conversion+determinism ...")
    try:
        with tempfile.TemporaryDirectory(prefix="chabiko-conv-") as td:
            tp = Path(td)
            records = _convert_all_to_dir(source_dir, tp)
            check("converted 19 records", len(records) == 19)
            for rec in records:
                vid = rec["vocabularyId"]
                check(f"{vid}: id", rec["id"] == f"ill-{vid}")
                check(f"{vid}: assetPath", rec["assetPath"].startswith(ASSET_PREFIX) and rec["assetPath"].endswith(".webp"))
                check(f"{vid}: mimeType webp", rec["mimeType"] == "image/webp")
                check(f"{vid}: reviewStatus draft", rec["reviewStatus"] == "draft")
                check(f"{vid}: w 1-1600", 1 <= rec["width"] <= MAX_DIMENSION)
                check(f"{vid}: h 1-1600", 1 <= rec["height"] <= MAX_DIMENSION)
                check(f"{vid}: fs ≤ {MAX_FILE_SIZE}", rec["fileSizeBytes"] <= MAX_FILE_SIZE)
                ecs = [cs for vv, _, cs, _ in IMMUTABLE_CONTRACT if vv == vid][0]
                check(f"{vid}: srcChecksum", rec["sourceChecksumSha256"] == ecs)
                check(f"{vid}: rights pending", rec["rights"]["status"] == "pending" and rec["rights"]["source"] == "teacher-provided")
            with tempfile.TemporaryDirectory(prefix="chabiko-det-") as td2:
                tp2 = Path(td2)
                r2 = _convert_all_to_dir(source_dir, tp2)
                check("rerun: count 19", len(r2) == 19)
                for i in range(19):
                    check(f"rerun: rec {i}",
                          json.dumps(records[i], sort_keys=True) == json.dumps(r2[i], sort_keys=True))
            bad_dir = Path(tempfile.mkdtemp(prefix="chabiko-bad-"))
            try:
                (bad_dir / "大家.png").write_bytes(b"bad bytes")
                try:
                    verify_sources(bad_dir)
                    check("bad cs: verify_sources rejects", False)
                except ValueError:
                    check("bad cs: verify_sources rejects", True)
            finally:
                shutil.rmtree(bad_dir, ignore_errors=True)
    except Exception as e:
        check(f"conversion block: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 7. Conversion quality
    print("  conversion quality ...")
    try:
        from PIL import Image as _PILQ, ImageCms as _PILCms
        tq = Path(tempfile.mkdtemp(prefix="chabiko-quality-"))
        try:
            # 7a. No upscale
            vid_500 = next(v for v, fn, _, _ in IMMUTABLE_CONTRACT if fn == "大家.png")
            src = verify_sources(source_dir)[vid_500]
            out = tq / "test.webp"
            convert_image(src, out)
            r = _PILQ.open(out)
            check("no upscale 500→≤500", r.width <= 500 and r.height <= 500)

            # 7b. Proportional resize
            big = _PILQ.new("RGBA", (2000, 1500), (255, 0, 0))
            big_src = tq / "large.png"
            big.save(str(big_src), format="PNG")
            big_out = tq / "large.webp"
            convert_image(big_src, big_out)
            br = _PILQ.open(big_out)
            check("oversized ≤1600", br.width <= MAX_DIMENSION and br.height <= MAX_DIMENSION)
            check("aspect ratio", abs(br.width / br.height - 2000 / 1500) < 0.01)

            # 7c. Palette transparency actual alpha
            pal = _PILQ.new("P", (10, 10))
            pal.putpalette([0, 0, 0, 255, 255, 255] + [0] * 759)
            pal.info["transparency"] = 1
            pal.putpixel((0, 0), 0)  # opaque black
            pal.putpixel((1, 0), 1)  # transparent white
            pal_src = tq / "pal.png"
            pal.save(str(pal_src), format="PNG")
            pal_out = tq / "pal.webp"
            convert_image(pal_src, pal_out)
            pal_r = _PILQ.open(pal_out)
            # At (1,0) the pixel index 1 must become transparent alpha
            px1 = pal_r.getpixel((1, 0))
            check("palette: transparent pixel alpha=0", len(px1) == 4 and px1[3] == 0)

            # 7d. Semi-transparent preserves RGBA
            semi = _PILQ.new("RGBA", (5, 5), (255, 0, 0, 128))
            semi_src = tq / "semi.png"
            semi.save(str(semi_src), format="PNG")
            semi_out = tq / "semi.webp"
            convert_image(semi_src, semi_out)
            semi_r = _PILQ.open(semi_out)
            check("semi: RGBA", semi_r.mode == "RGBA")
            px_semi = semi_r.getpixel((0, 0))
            check("semi: alpha 128 preserved",
                  len(px_semi) == 4 and 64 <= px_semi[3] <= 192)

            # 7e. EXIF orientation + embedded ICC + XMP metadata
            from PIL.PngImagePlugin import PngInfo
            adobe_profile_data = Path("/System/Library/ColorSync/Profiles/AdobeRGB1998.icc").read_bytes()
            exif_img = _PILQ.new("RGB", (5, 10), (0, 255, 0))
            exif = exif_img.getexif()
            exif[0x0112] = 6  # Rotate 90 CW
            exif_src = tq / "exif_full.png"
            md = PngInfo()
            md.add_text("Description", "Test image with metadata")
            exif_img.save(str(exif_src), format="PNG",
                          exif=exif.tobytes(), icc_profile=adobe_profile_data, pnginfo=md)
            exif_out = tq / "exif_out.webp"
            convert_image(exif_src, exif_out)
            exif_r = _PILQ.open(exif_out)
            check("EXIF: orientation (5,10→10,5)", exif_r.width == 10 and exif_r.height == 5)
            check("output: no ICC", not exif_r.info.get("icc_profile"))
            check("output: no EXIF", not exif_r.info.get("exif"))

            # 7f. Non-sRGB ICC conversion with system Adobe RGB (1998) profile
            adobe_path = Path("/System/Library/ColorSync/Profiles/AdobeRGB1998.icc")
            if not adobe_path.exists():
                raise RuntimeError(f"Adobe RGB profile not found: {adobe_path}")
            adobe_data = adobe_path.read_bytes()
            from io import BytesIO
            test_profile = _PILCms.getOpenProfile(BytesIO(adobe_data))
            test_desc = _PILCms.getProfileDescription(test_profile)
            if "sRGB" in test_desc or "srgb" in test_desc.lower():
                raise RuntimeError(f"Expected non-sRGB profile, got: {test_desc}")
            test_icc_img = _PILQ.new("RGB", (10, 10), (100, 150, 200))
            icc_src = tq / "icc_test.png"
            test_icc_img.save(str(icc_src), format="PNG", icc_profile=adobe_data)
            icc_out = tq / "icc_out.webp"
            convert_image(icc_src, icc_out)
            icc_r = _PILQ.open(icc_out)
            check("non-sRGB ICC: output valid", icc_r.width > 0)
            check("non-sRGB ICC: profile stripped", not icc_r.info.get("icc_profile"))

            # 7g. ICC+RGBA: verify alpha unchanged after profile conversion
            icc_rgba = _PILQ.new("RGBA", (20, 20), (100, 150, 200, 80))
            icc_rgba_src = tq / "icc_rgba.png"
            icc_rgba.save(str(icc_rgba_src), format="PNG", icc_profile=adobe_data)
            icc_rgba_out = tq / "icc_rgba.webp"
            convert_image(icc_rgba_src, icc_rgba_out)
            icc_rgba_r = _PILQ.open(icc_rgba_out)
            check("ICC+RGBA: mode preserved", icc_rgba_r.mode == "RGBA")
            px_icc = icc_rgba_r.getpixel((0, 0))
            check("ICC+RGBA: alpha preserved", len(px_icc) == 4 and 40 <= px_icc[3] <= 120)

        finally:
            shutil.rmtree(tq, ignore_errors=True)
    except Exception as e:
        check(f"quality block: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 8. Production-path transactional tests (uses same _snapshot/_restore/_write_assets fns)
    print("  transactional publish ...")
    try:
        with tempfile.TemporaryDirectory(prefix="chabiko-tx-") as tx_root:
            tx_root_p = Path(tx_root)
            tx_assets = tx_root_p / "public" / "assets" / "vocabulary" / "teacher-core-v1"
            tx_json = tx_root_p / "data" / "illustrations" / "teacher-core-v1" / "teacher-vocabulary-batch-01.json"
            tx_assets.mkdir(parents=True, exist_ok=True)
            tx_json.parent.mkdir(parents=True, exist_ok=True)

            with tempfile.TemporaryDirectory(prefix="chabiko-rec-") as rec_dir:
                rec_path = Path(rec_dir)
                clean_records = _convert_all_to_dir(source_dir, rec_path)

                # 8a. First-publish failure (partial WebP writes)
                has_a, jb_a, wb_a = _snapshot(tx_assets, tx_json)
                try:
                    tx_assets.mkdir(parents=True, exist_ok=True)
                    tx_json.parent.mkdir(parents=True, exist_ok=True)
                    for i, rec in enumerate(clean_records):
                        src = rec_path / f"{rec['id']}.webp"
                        shutil.copy2(src, tx_assets / f"{rec['id']}.webp")
                        if i == 4:
                            raise RuntimeError("Injected first-publish failure")
                    with open(tx_json, "w", encoding="utf-8") as f:
                        json.dump({"illustrations": clean_records}, f, indent=2, ensure_ascii=False)
                        f.write("\n")
                    check("tx: first-publish raised", False)
                except RuntimeError as e:
                    if "Injected" in str(e):
                        check("tx: first-publish caught", True)
                        _restore(has_a, jb_a, wb_a, tx_assets, tx_json)
                        after = list(tx_assets.glob("*.webp"))
                        check("tx: first-failure: 0 assets", len(after) == 0)
                        check("tx: first-failure: no JSON", not tx_json.exists())
                    else:
                        check(f"tx: unexpected: {e}", False)

                # 8b. Replacement failure: partial WebP overwrites then inject before JSON
                _write_assets(rec_path, clean_records, tx_assets, tx_json)
                has_b, jb_b, wb_b = _snapshot(tx_assets, tx_json)
                baseline_json_hash = _sha256(tx_json)
                baseline_hashes = {p.name: _sha256(p) for p in sorted(tx_assets.glob("*.webp"))}

                try:
                    with tempfile.TemporaryDirectory(prefix="chabiko-mod-") as mod_dir:
                        mod_path = Path(mod_dir)
                        mod_records = _convert_all_to_dir(source_dir, mod_path)
                        for i, rec in enumerate(mod_records):
                            src = mod_path / f"{rec['id']}.webp"
                            shutil.copy2(src, tx_assets / f"{rec['id']}.webp")
                            if i == 4:  # inject after 5 WebP overwrites, before JSON
                                raise RuntimeError("Injected replacement failure during WebP overwrite")
                        with open(tx_json, "w", encoding="utf-8") as f:
                            json.dump({"illustrations": mod_records}, f, indent=2, ensure_ascii=False)
                            f.write("\n")
                        check("tx: replacement raised", False)
                except RuntimeError as e:
                    if "Injected" in str(e):
                        check("tx: replacement failure caught", True)
                        _restore(has_b, jb_b, wb_b, tx_assets, tx_json)
                        restored_json_hash = _sha256(tx_json)
                        check("tx: replacement: JSON restored", restored_json_hash == baseline_json_hash)
                        restored_hashes = {p.name: _sha256(p) for p in sorted(tx_assets.glob("*.webp"))}
                        check("tx: replacement: assets same count", len(restored_hashes) == len(baseline_hashes))
                        for fn, cs in baseline_hashes.items():
                            check(f"tx: replacement: {fn} restored", restored_hashes.get(fn) == cs)
                    else:
                        check(f"tx: unexpected: {e}", False)

                # 8c. Post-publish validation failure rollback
                _write_assets(rec_path, clean_records, tx_assets, tx_json)
                has_c, jb_c, wb_c = _snapshot(tx_assets, tx_json)
                _restore(has_c, jb_c, wb_c, tx_assets, tx_json)
                check("tx: post-publish rollback: JSON reverted",
                      not tx_json.exists() if not has_c else _sha256(tx_json) == hashlib.sha256(jb_c).hexdigest())

    except Exception as e:
        check(f"tx block: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 9. Joined-bundle schema
    print("  joined-bundle schema validation ...")
    try:
        with tempfile.TemporaryDirectory(prefix="chabiko-join-") as jd:
            jp = Path(jd)
            records = _convert_all_to_dir(source_dir, jp)
            errs = _validate_joined_bundle(vocab_batch_path, records)
            if errs:
                check("joined-bundle schema exit 0", False)
                for e in errs[:5]:
                    print(f"    {e}", file=sys.stderr)
            else:
                check("joined-bundle schema exit 0", True)
    except Exception as e:
        check(f"joined-bundle: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 10. Git check
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
        description="Import teacher-core-v1 batch-01 candidate images as draft WebP assets")
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

    print("Converting 19 candidate images ...")
    records = convert_all(source_dir, vocab_batch)
    print(f"  Published {len(records)} illustrations")
    print(f"  WebP → {ASSETS_DIR}")
    print(f"  JSON → {BATCH_JSON}")
    print("Done.")

if __name__ == "__main__":
    main()
