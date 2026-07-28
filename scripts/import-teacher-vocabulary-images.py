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

# ─── Immutable contract ─────────────────────────────────────────────────────

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
PENDING_RIGHTS: dict[str, str] = {"status": "pending", "source": "teacher-provided",
    "note": "Formal rights verification pending for teacher-provided source image."}
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


# ─── Version assertions ─────────────────────────────────────────────────────

def assert_pinned_versions() -> None:
    from PIL import Image as _PIL
    a = _PIL.__version__
    if a != EXPECTED_PILLOW_VERSION:
        raise RuntimeError(f"Pillow mismatch: expected {EXPECTED_PILLOW_VERSION}, got {a}")
    b = _pillow_linked_libwebp_version()
    if b != EXPECTED_LIBWEBP_VERSION:
        raise RuntimeError(f"libwebp mismatch: expected {EXPECTED_LIBWEBP_VERSION}, got {b}")

def _pillow_linked_libwebp_version() -> str:
    from PIL import _webp
    r = _webp.webpdecoder_version
    if isinstance(r, str):
        return r
    if isinstance(r, tuple):
        return f"{r[0]}.{r[1]}.{r[2]}"
    raise RuntimeError(f"unexpected libwebp format: {type(r).__name__}")


# ─── #112 batch verification ────────────────────────────────────────────────

def verify_112_batch(vocab_batch_path: Path) -> list[dict]:
    raw = vocab_batch_path.read_bytes()
    a = hashlib.sha256(raw).hexdigest()
    if a != EXPECTED_112_BATCH_SHA256:
        raise ValueError(f"#112 checksum: expected {EXPECTED_112_BATCH_SHA256}, got {a}.")
    data = json.loads(raw)
    vocab = data.get("vocabulary", [])
    ids = [r.get("id", "") for r in vocab]
    if len(ids) != 20:
        raise ValueError(f"#112 batch: expected 20, got {len(ids)}")
    for i, (e, a) in enumerate(zip(EXPECTED_112_VOCABULARY_IDS, ids)):
        if e != a:
            raise ValueError(f"#112 batch pos {i}: expected {e}, got {a}")
    if not any(rid == EXPECTED_NO_IMAGE_ID for rid in ids):
        raise ValueError(f"#112 batch: no-image row {EXPECTED_NO_IMAGE_ID} not found")
    return vocab


# ─── Helpers ────────────────────────────────────────────────────────────────

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while c := f.read(65536):
            h.update(c)
    return h.hexdigest()

def illustration_id(vocab_id: str) -> str:
    return f"{ILLUSTRATION_ID_PREFIX}{vocab_id}"

def asset_path(vocab_id: str) -> str:
    return f"{ASSET_PREFIX}{illustration_id(vocab_id)}.webp"


# ─── Conversion ─────────────────────────────────────────────────────────────

def _icc_to_srgb(img):
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
    img = ImageOps.exif_transpose(img) or img
    img = _icc_to_srgb(img)
    if img.mode == "P":
        img = img.convert("RGBA" if "transparency" in img.info else "RGB")
    elif img.mode in ("PA", "LA"):
        img = img.convert("RGBA")
    elif img.mode == "L":
        img = img.convert("RGB")
    elif img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        r = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        nw, nh = int(w * r), int(h * r)
        img = img.resize((nw, nh), Image.LANCZOS)
    else:
        nw, nh = w, h
    img.save(output, format="WEBP", lossless=True, method=6,
             exif=b"", icc_profile=None, comment=b"")
    return nw, nh, output.stat().st_size


# ─── Source verification ────────────────────────────────────────────────────

def verify_sources(source_dir: Path) -> dict[str, Path]:
    resolved: dict[str, Path] = {}
    for vid, filename, ecs, _ in IMMUTABLE_CONTRACT:
        src = source_dir / filename
        if not src.exists():
            raise FileNotFoundError(f"Source not found: {src} ({vid})")
        if _sha256(src) != ecs:
            raise ValueError(f"Source checksum mismatch for {vid}: expected {ecs}")
        resolved[vid] = src
    return resolved


# ─── Batch conversion ───────────────────────────────────────────────────────

def _build_record(vid: str, altja: str, cs: str, w: int, h: int, fs: int) -> dict:
    return {"id": illustration_id(vid), "vocabularyId": vid,
            "assetPath": asset_path(vid), "sourceChecksumSha256": cs,
            "width": w, "height": h, "mimeType": "image/webp", "fileSizeBytes": fs,
            "altJa": altja, "rights": dict(PENDING_RIGHTS), "reviewStatus": "draft"}

def _convert_all_to_dir(source_dir: Path, tmp_path: Path) -> list[dict]:
    resolved = verify_sources(source_dir)
    records: list[dict] = []
    for vid, _, cs, altja in IMMUTABLE_CONTRACT:
        o = tmp_path / f"{illustration_id(vid)}.webp"
        w, h, fs = convert_image(resolved[vid], o)
        records.append(_build_record(vid, altja, cs, w, h, fs))
    return records


# ─── Failure injection ──────────────────────────────────────────────────────

def _should_inject_before(idx: int) -> bool:
    val = os.environ.get("_CHABIKO_INJECT_AT", "")
    if val in ("check", "write"):
        return False
    try:
        return idx == int(val)
    except ValueError:
        return False

def _should_inject_write() -> bool:
    return os.environ.get("_CHABIKO_INJECT_AT", "") == "write"

def _should_inject_check() -> bool:
    return os.environ.get("_CHABIKO_INJECT_AT", "") == "check"


# ─── Transactional publish (parameterized by paths) ─────────────────────────

EXPECTED_ILL_FILENAMES = frozenset(f"{illustration_id(vid)}.webp" for vid, _, _, _ in IMMUTABLE_CONTRACT)

def snapshot(assets_dir: Path, batch_json: Path) -> tuple[bool, bytes | None, dict[str, bytes]]:
    """Snapshot: records every batch WebP + JSON bytes if exists."""
    has = batch_json.exists()
    jb: bytes | None = batch_json.read_bytes() if has else None
    wb: dict[str, bytes] = {}
    for fn in EXPECTED_ILL_FILENAMES:
        fp = assets_dir / fn
        if fp.exists():
            wb[fn] = fp.read_bytes()
    return has, jb, wb

def remove_batch_outputs(assets_dir: Path, batch_json: Path) -> None:
    for fn in EXPECTED_ILL_FILENAMES:
        (assets_dir / fn).unlink(missing_ok=True)
    batch_json.unlink(missing_ok=True)

def restore(has_json: bool, json_bytes: bytes | None,
            webp_bytes: dict[str, bytes], assets_dir: Path, batch_json: Path) -> None:
    """Clear current batch outputs, then restore snapshot.

    Step 1: remove all current batch WebP + JSON.
    Step 2: restore WebP files unconditionally (from snapshot webp_bytes).
    Step 3: restore JSON only if has_json is True.
    Other batches or unrelated assets are never touched."""
    remove_batch_outputs(assets_dir, batch_json)
    for fname, content in webp_bytes.items():
        (assets_dir / fname).write_bytes(content)
    if has_json and json_bytes is not None:
        batch_json.parent.mkdir(parents=True, exist_ok=True)
        batch_json.write_bytes(json_bytes)

def write_batch(tmp_path: Path, records: list[dict],
                assets_dir: Path, batch_json: Path) -> None:
    assets_dir.mkdir(parents=True, exist_ok=True)
    batch_json.parent.mkdir(parents=True, exist_ok=True)
    for i, rec in enumerate(records):
        if _should_inject_before(i):
            raise RuntimeError(f"Injected: WebP {i} ({rec['vocabularyId']})")
        src = tmp_path / f"{rec['id']}.webp"
        if not src.exists():
            raise RuntimeError(f"Staged WebP missing: {src}")
        shutil.copy2(src, assets_dir / f"{rec['id']}.webp")
    if _should_inject_write():
        raise RuntimeError("Injected: write-phase failure before JSON")
    with open(batch_json, "w", encoding="utf-8") as f:
        json.dump({"illustrations": records}, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ─── convert_all (parameterized) ────────────────────────────────────────────

def convert_all(source_dir: Path, vocab_batch_path: Path,
                assets_dir: Path | None = None, batch_json: Path | None = None) -> list[dict]:
    """Convert, validate, publish transactionally.

    When assets_dir/batch_json are None, defaults to the repository tracked paths.
    """
    assert_pinned_versions()
    verify_112_batch(vocab_batch_path)

    ad = assets_dir or ASSETS_DIR
    bj = batch_json or BATCH_JSON

    with tempfile.TemporaryDirectory(prefix="chabiko-ill-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        records = _convert_all_to_dir(source_dir, tmp_path)

        # Pre-publish validation
        for rec in records:
            wp = tmp_path / f"{rec['id']}.webp"
            if not wp.exists():
                raise RuntimeError(f"Pre-publish: {wp} missing")
            if wp.stat().st_size > MAX_FILE_SIZE:
                raise RuntimeError(f"Pre-publish: {wp} exceeds {MAX_FILE_SIZE}B")
        schema_errs = _validate_joined_bundle(vocab_batch_path, records)
        if schema_errs:
            raise RuntimeError(f"Pre-publish schema: {'; '.join(schema_errs)}")

        has_ex, jb, wb = snapshot(ad, bj)

        try:
            write_batch(tmp_path, records, ad, bj)
        except BaseException:
            restore(has_ex, jb, wb, ad, bj)
            raise

        if _should_inject_check():
            restore(has_ex, jb, wb, ad, bj)
            raise RuntimeError("Injected: post-publish check failure")

        # Post-publish check: use ad/bj for the comparison target
        try:
            _run_check_core(source_dir, vocab_batch_path, tmp_path, records,
                            ad, bj)
        except BaseException:
            restore(has_ex, jb, wb, ad, bj)
            raise

    return records


# ─── Check core ─────────────────────────────────────────────────────────────

def _run_check_core(source_dir: Path, vocab_batch_path: Path,
                    check_tmp: Path, records: list[dict],
                    ad: Path | None = None, bj: Path | None = None) -> None:
    assets = ad or ASSETS_DIR
    batch_j = bj or BATCH_JSON
    committed = json.loads(batch_j.read_bytes()).get("illustrations", [])
    exp = json.dumps({"illustrations": records}, indent=2, ensure_ascii=False) + "\n"
    if batch_j.read_text(encoding="utf-8") != exp:
        raise RuntimeError("Committed JSON != regenerated")
    exp_w = {f"{illustration_id(vid)}.webp" for vid, _, _, _ in IMMUTABLE_CONTRACT}
    com_w = {p.name for p in assets.glob("*.webp")}
    if extra := (com_w - exp_w):
        raise RuntimeError(f"Extra WebPs: {sorted(extra)}")
    if missing := (exp_w - com_w):
        raise RuntimeError(f"Missing WebPs: {sorted(missing)}")
    for vid, _, _, _ in IMMUTABLE_CONTRACT:
        fn = f"{illustration_id(vid)}.webp"
        if not (assets / fn).exists() or _sha256(check_tmp / fn) != _sha256(assets / fn):
            raise RuntimeError(f"WebP byte mismatch for {vid}")
    by_v = {r["vocabularyId"]: r for r in committed}
    if len(by_v) != 19:
        raise RuntimeError(f"Expected 19 vocab IDs, got {len(by_v)}")
    for vid in NO_IMAGE_VOCABULARY_IDS:
        if vid in by_v:
            raise RuntimeError(f"{vid} should not have illustration")
    if ad is None and bj is None:
        r = subprocess.run(["git", "ls-files", "--", "词汇表/"],
                           capture_output=True, text=True, cwd=REPO_ROOT)
        if r.stdout.strip():
            raise RuntimeError("Source files tracked in Git")


def run_check(source_dir: Path, vocab_batch_path: Path) -> int:
    errors: list[str] = []
    assert_pinned_versions()
    verify_112_batch(vocab_batch_path)
    ct = Path(tempfile.mkdtemp(prefix="chabiko-check-"))
    try:
        records = _convert_all_to_dir(source_dir, ct)
        _run_check_core(source_dir, vocab_batch_path, ct, records)
    except RuntimeError as e:
        errors.append(str(e))
    finally:
        shutil.rmtree(ct, ignore_errors=True)
    for e in errors:
        print(f"  CHECK: {e}", file=sys.stderr)
    return 1 if errors else 0


# ─── Joined-bundle schema ───────────────────────────────────────────────────

def _validate_joined_bundle(vocab_batch_path: Path, ill_records: list[dict]) -> list[str]:
    data = json.loads(vocab_batch_path.read_bytes())
    joined = {"teacher_vocabulary": data.get("vocabulary", []), "illustrations": ill_records}
    errs: list[str] = []
    with tempfile.TemporaryDirectory(prefix="chabiko-schema-") as td:
        tj = Path(td) / "joined-bundle.json"
        with open(tj, "w", encoding="utf-8") as f:
            json.dump(joined, f, indent=2, ensure_ascii=False)
        r = subprocess.run([sys.executable or "python3",
                            str(REPO_ROOT / "scripts" / "validate-content-schema.py"),
                            "--check", str(tj)],
                           capture_output=True, text=True, cwd=REPO_ROOT)
        if r.returncode != 0:
            for line in (r.stdout + r.stderr).strip().split("\n"):
                if (line := line.strip()):
                    errs.append(f"schema: {line}")
    return errs


# ─── Portable non-sRGB ICC fixture ──────────────────────────────────────────

def _create_portable_non_srgb_icc_data() -> bytes:
    """Create a true deterministic non-sRGB RGB ICC profile.

    Starts from Pillow's built-in sRGB profile (LCMS2-generated, no
    third-party copyrighted data), then modifies the rXYZ, gXYZ, bXYZ
    and wtpt colorimetric tags to wide-gamut non-sRGB values while
    preserving profile validity.

    This produces a profile that:
    - Is a valid matrix-shaper RGB profile
    - Has actually different colorants than sRGB (not just description)
    - Produces a non-identity transform when converting to sRGB
    - Preserves alpha on RGBA→sRGB conversion
    - Contains no third-party copyrighted data
    - Is deterministic across platforms and Pillow versions

    Raises RuntimeError on any failure — never silently skips.
    """
    import PIL.ImageCms as _cms
    from PIL import ImageCms, Image as _Img
    from io import BytesIO
    import hashlib, struct

    srgb_bytes = _cms.core.profile_tobytes(_cms.createProfile("sRGB"))

    def s15f16(val: float) -> int:
        return int(round(val * 65536))

    def write_xyz_tag(data: bytes, sig: bytes, x: float, y: float, z: float) -> bytes:
        buf = bytearray(data)
        tag_count = struct.unpack_from(">I", buf, 128)[0]
        for i in range(tag_count):
            entry = 132 + i * 12
            if buf[entry:entry+4] == sig:
                off = struct.unpack_from(">I", buf, entry + 4)[0]
                struct.pack_into(">i", buf, off + 8, s15f16(x))
                struct.pack_into(">i", buf, off + 12, s15f16(y))
                struct.pack_into(">i", buf, off + 16, s15f16(z))
        return bytes(buf)

    # Wide-gamut non-sRGB XYZ values
    data = write_xyz_tag(srgb_bytes, b"rXYZ", 0.4973, 0.2767, 0.0124)
    data = write_xyz_tag(data, b"gXYZ", 0.2645, 0.6599, 0.0491)
    data = write_xyz_tag(data, b"bXYZ", 0.1192, 0.0454, 0.6810)
    data = write_xyz_tag(data, b"wtpt", 0.9642, 1.0, 0.8249)

    # Fix MD5 profile ID
    buf = bytearray(data)
    buf[84:100] = b"\x00" * 16
    md5 = hashlib.md5(bytes(buf)).digest()
    buf[84:100] = md5
    data = bytes(buf)

    # Open
    prof = ImageCms.getOpenProfile(BytesIO(data))
    srgb = ImageCms.createProfile("sRGB")

    # 1. RGB color space
    color_space = data[16:20]
    if color_space != b"RGB ":
        raise RuntimeError(f"Color space not RGB: {color_space}")

    # 2. Colorants differ from sRGB
    def read_xyz_tag(d, sig):
        tc = struct.unpack_from(">I", d, 128)[0]
        for i in range(tc):
            entry = 132 + i * 12
            if d[entry:entry+4] == sig:
                off = struct.unpack_from(">I", d, entry + 4)[0]
                rd = lambda o: struct.unpack_from(">i", d, off + o)[0] / 65536.0
                return (rd(8), rd(12), rd(16))
        return None
    s_rXYZ = read_xyz_tag(srgb_bytes, b"rXYZ")
    f_rXYZ = read_xyz_tag(data, b"rXYZ")
    if abs(f_rXYZ[0] - s_rXYZ[0]) < 0.01:
        raise RuntimeError("Fixture rXYZ unchanged from sRGB")

    # 3. Not identity transform
    test_px = _Img.new("RGB", (1, 1), (100, 150, 200))
    thru = ImageCms.profileToProfile(test_px, prof, srgb, outputMode="RGB")
    px = thru.getpixel((0, 0))
    if px == (100, 150, 200):
        raise RuntimeError("Fixture→sRGB is identity")

    # 4–5. RGB + RGBA with alpha preservation
    result_rgb = ImageCms.profileToProfile(
        _Img.new("RGB", (5, 5), (100, 150, 200)), prof, srgb, outputMode="RGB")
    if result_rgb.mode != "RGB":
        raise RuntimeError(f"RGB conversion got mode {result_rgb.mode}")
    test_rgba = _Img.new("RGBA", (5, 5), (100, 150, 200, 80))
    result_rgba = ImageCms.profileToProfile(test_rgba, prof, srgb, outputMode="RGBA")
    if result_rgba.mode != "RGBA":
        raise RuntimeError(f"RGBA conversion got mode {result_rgba.mode}")
    oa = test_rgba.getpixel((0, 0))[3]
    ca = result_rgba.getpixel((0, 0))[3]
    if oa != ca:
        raise RuntimeError(f"Alpha changed: {oa} -> {ca}")

    # 6. No third-party text
    tl = data.lower()
    for prohib in (b"apple", b"microsoft", b"adobe", b"generic rgb"):
        if prohib in tl:
            raise RuntimeError(f"ICC contains: {prohib.decode()}")

    return data


# ─── Tests ──────────────────────────────────────────────────────────────────

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
    from PIL import Image as _PIL
    check("Pillow version", _PIL.__version__ == EXPECTED_PILLOW_VERSION)
    check("libwebp version", _pillow_linked_libwebp_version() == EXPECTED_LIBWEBP_VERSION)

    # 1. #112 batch
    print("  #112 batch ...")
    verify_112_batch(vocab_batch_path)
    check("batch checksum + 20 IDs + no-image row", True)

    # 2. Contract
    print("  contract ...")
    check("19 entries", len(IMMUTABLE_CONTRACT) == 19)
    vids = {v for v, _, _, _ in IMMUTABLE_CONTRACT}
    check("no_image not in contract", NO_IMAGE_VOCABULARY_IDS.isdisjoint(vids))

    # 3. Shared source
    print("  shared-source ...")
    cb = {v: (fn, cs) for v, fn, cs, _ in IMMUTABLE_CONTRACT}
    check("爸爸/父亲 same file", cb["teacher-star-1-e7bc12c4f23a"][0] == cb["teacher-star-1-bada4e11125d"][0])
    check("妈妈/母亲 same file", cb["teacher-star-1-e64490a207eb"][0] == cb["teacher-star-1-d903f490725f"][0])

    # 4. Rights
    print("  rights ...")
    check("status pending", PENDING_RIGHTS["status"] == "pending")

    # 5. altJa
    print("  altJa ...")
    ra = next(a for v, _, _, a in IMMUTABLE_CONTRACT if v == "teacher-star-1-a66948a76fda")
    check("人 exact #113 altJa", ra == "笑顔で両手を上げてピースサインをする男性のイラスト。")

    # 6. Conversion + determinism
    print("  conversion+determinism ...")
    try:
        t = Path(tempfile.mkdtemp(prefix="chabiko-cv-"))
        records = _convert_all_to_dir(source_dir, t)
        check("converted 19", len(records) == 19)
        for rec in records:
            v = rec["vocabularyId"]
            check(f"{v}: id", rec["id"] == f"ill-{v}")
            check(f"{v}: assetPath", rec["assetPath"].startswith(ASSET_PREFIX) and rec["assetPath"].endswith(".webp"))
            check(f"{v}: mimeType webp", rec["mimeType"] == "image/webp")
            check(f"{v}: reviewStatus draft", rec["reviewStatus"] == "draft")
            check(f"{v}: dims", 1 <= rec["width"] <= MAX_DIMENSION and 1 <= rec["height"] <= MAX_DIMENSION)
            check(f"{v}: fs ≤ {MAX_FILE_SIZE}", rec["fileSizeBytes"] <= MAX_FILE_SIZE)
            ecs = next(cs for vv, _, cs, _ in IMMUTABLE_CONTRACT if vv == v)
            check(f"{v}: srcChecksum", rec["sourceChecksumSha256"] == ecs)
        t2 = Path(tempfile.mkdtemp(prefix="chabiko-det-"))
        r2 = _convert_all_to_dir(source_dir, t2)
        check("rerun count 19", len(r2) == 19)
        for i in range(19):
            check(f"rerun rec {i}", json.dumps(records[i], sort_keys=True) == json.dumps(r2[i], sort_keys=True))
        shutil.rmtree(t, ignore_errors=True)
        shutil.rmtree(t2, ignore_errors=True)
    except Exception as e:
        check(f"conversion: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 7. Conversion quality (portable ICC)
    print("  conversion quality ...")
    try:
        from PIL import Image as _Q, ImageCms as _Cms
        tq = Path(tempfile.mkdtemp(prefix="chabiko-qual-"))
        try:
            vid500 = next(v for v, fn, _, _ in IMMUTABLE_CONTRACT if fn == "大家.png")
            src = verify_sources(source_dir)[vid500]
            out = tq / "t.webp"
            convert_image(src, out)
            rr = _Q.open(out)
            check("no upscale 500→≤500", rr.width <= 500 and rr.height <= 500)

            big = _Q.new("RGBA", (2000, 1500), (255, 0, 0))
            bs = tq / "big.png"
            big.save(str(bs), format="PNG")
            bo = tq / "big.webp"
            convert_image(bs, bo)
            br = _Q.open(bo)
            check("oversized ≤1600", br.width <= MAX_DIMENSION and br.height <= MAX_DIMENSION)
            check("aspect ratio", abs(br.width / br.height - 2000 / 1500) < 0.01)

            # Palette transparency
            pal = _Q.new("P", (10, 10))
            pal.putpalette([0, 0, 0, 255, 255, 255] + [0] * 759)
            pal.info["transparency"] = 1
            pal.putpixel((0, 0), 0); pal.putpixel((1, 0), 1)
            ps = tq / "pal.png"
            pal.save(str(ps), format="PNG")
            convert_image(ps, tq / "pal.webp")
            px = _Q.open(tq / "pal.webp").getpixel((1, 0))
            check("palette alpha=0", len(px) == 4 and px[3] == 0)

            # Semi-transparent RGBA
            semi = _Q.new("RGBA", (5, 5), (255, 0, 0, 128))
            ss = tq / "semi.png"
            semi.save(str(ss), format="PNG")
            convert_image(ss, tq / "semi.webp")
            sr = _Q.open(tq / "semi.webp")
            check("semi RGBA", sr.mode == "RGBA")
            check("semi alpha 128", 64 <= sr.getpixel((0, 0))[3] <= 192)

            # EXIF + ICC + metadata stripping
            from PIL.PngImagePlugin import PngInfo
            non_srgb_data = _create_portable_non_srgb_icc_data()
            exif = _Q.new("RGB", (5, 10), (0, 255, 0)).getexif()
            exif[0x0112] = 6
            exif_src = tq / "exif.png"
            md = PngInfo(); md.add_text("Description", "test")
            _Q.new("RGB", (5, 10), (0, 255, 0)).save(str(exif_src), format="PNG",
                  exif=exif.tobytes(), icc_profile=non_srgb_data, pnginfo=md)
            convert_image(exif_src, tq / "exif_out.webp")
            er = _Q.open(tq / "exif_out.webp")
            check("EXIF orientation (5,10→10,5)", er.width == 10 and er.height == 5)
            check("output no ICC", not er.info.get("icc_profile"))
            check("output no EXIF", not er.info.get("exif"))

            # ICC+RGBA alpha preservation
            icc_rgba = _Q.new("RGBA", (20, 20), (100, 150, 200, 80))
            irs = tq / "icc_rgba.png"
            icc_rgba.save(str(irs), format="PNG", icc_profile=non_srgb_data)
            convert_image(irs, tq / "icc_rgba.webp")
            irr = _Q.open(tq / "icc_rgba.webp")
            check("ICC+RGBA mode", irr.mode == "RGBA")
            check("ICC+RGBA alpha", 40 <= irr.getpixel((0, 0))[3] <= 120)

        finally:
            shutil.rmtree(tq, ignore_errors=True)
    except Exception as e:
        check(f"quality: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 8. Transactional tests (fully in temp — never touches ASSETS_DIR/BATCH_JSON)
    print("  transactional publish (temp destinations) ...")
    try:
        with tempfile.TemporaryDirectory(prefix="chabiko-txn-") as txn_root:
            txn_root_p = Path(txn_root)
            txn_assets = txn_root_p / "public" / "assets" / "vocabulary" / "teacher-core-v1"
            txn_json = txn_root_p / "data" / "illustrations" / "teacher-core-v1" / "teacher-vocabulary-batch-01.json"
            txn_assets.mkdir(parents=True, exist_ok=True)
            txn_json.parent.mkdir(parents=True, exist_ok=True)

            with tempfile.TemporaryDirectory(prefix="chabiko-rec-") as rec_dir:
                rec_path = Path(rec_dir)
                clean_records = _convert_all_to_dir(source_dir, rec_path)

                # 8a. First publish (no previous state) — partial WebP write failure
                os.environ["_CHABIKO_INJECT_AT"] = "4"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: first-publish raised", False)
                except (RuntimeError, OSError):
                    check("txn: first-publish caught", True)
                check("txn: first-failure: 0 assets",
                      len(list(txn_assets.glob("*.webp"))) == 0)
                check("txn: first-failure: no JSON", not txn_json.exists())
                del os.environ["_CHABIKO_INJECT_AT"]

                # 8b. Clean publish into temp
                records = convert_all(source_dir, vocab_batch_path,
                                      assets_dir=txn_assets, batch_json=txn_json)
                check("txn: clean publish 19", len(records) == 19)
                base_json = txn_json.read_bytes() if txn_json.exists() else None
                base_webps = {p.name: p.read_bytes() for p in txn_assets.glob("*.webp")}

                # 8c. Replacement failure — inject at idx=4 (partial overwrite before JSON)
                os.environ["_CHABIKO_INJECT_AT"] = "4"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: replacement raised", False)
                except (RuntimeError, OSError):
                    check("txn: replacement caught", True)
                del os.environ["_CHABIKO_INJECT_AT"]
                # Verify exact rollback
                after_json = txn_json.read_bytes() if txn_json.exists() else None
                after_webps = {p.name: p.read_bytes() for p in txn_assets.glob("*.webp")}
                check("txn: replacement JSON rolled back", after_json == base_json)
                check("txn: replacement assets same count", len(after_webps) == len(base_webps))
                for fn, c in base_webps.items():
                    check(f"txn: replacement {fn} restored", after_webps.get(fn) == c)

                # 8d. JSON write failure
                os.environ["_CHABIKO_INJECT_AT"] = "write"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: json-write raised", False)
                except (RuntimeError, OSError):
                    check("txn: json-write caught", True)
                del os.environ["_CHABIKO_INJECT_AT"]
                after_json = txn_json.read_bytes() if txn_json.exists() else None
                after_webps = {p.name: p.read_bytes() for p in txn_assets.glob("*.webp")}
                check("txn: json-write JSON rolled back", after_json == base_json)
                check("txn: json-write assets rolled back", after_webps == base_webps)

                # 8e. Post-publish check failure
                os.environ["_CHABIKO_INJECT_AT"] = "check"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: post-check raised", False)
                except (RuntimeError, OSError):
                    check("txn: post-check caught", True)
                del os.environ["_CHABIKO_INJECT_AT"]
                after_j = txn_json.read_bytes() if txn_json.exists() else None
                after_w = {p.name: p.read_bytes() for p in txn_assets.glob("*.webp")}
                check("txn: post-check JSON rolled back", after_j == base_json)
                check("txn: post-check assets rolled back", after_w == base_webps)

                # 8f. Replacement with missing WebP in snapshot
                remove_batch_outputs(txn_assets, txn_json)
                records = convert_all(source_dir, vocab_batch_path,
                                      assets_dir=txn_assets, batch_json=txn_json)
                for fn in sorted(txn_assets.glob("*.webp"))[:3]:
                    fn.unlink()
                os.environ["_CHABIKO_INJECT_AT"] = "4"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: missing-webp replacement raised", False)
                except (RuntimeError, OSError):
                    check("txn: missing-webp replacement caught", True)
                del os.environ["_CHABIKO_INJECT_AT"]
                after_j = txn_json.read_bytes() if txn_json.exists() else None
                after_w = {p.name: p.read_bytes() for p in txn_assets.glob("*.webp")}
                check("txn: missing-webp JSON exists", after_j is not None)
                check("txn: missing-webp assets > 0", len(after_w) > 0)

                # 8g. Regression: no JSON, partial batch WebP + foreign assets
                remove_batch_outputs(txn_assets, txn_json)
                # Place foreign asset (not in EXPECTED_ILL_FILENAMES) in assets dir
                foreign_before = b"foreign-asset-bytes-1234"
                (txn_assets / "foreign-legacy.png").write_bytes(foreign_before)
                # Place partial batch WebP with recognizable content
                partial_webp_content = {fn: f"partial-bytes-{i}".encode() for i, fn in enumerate(sorted(EXPECTED_ILL_FILENAMES)[:5])}
                for fn, content in partial_webp_content.items():
                    (txn_assets / fn).write_bytes(content)
                pre_state_snapshot = snapshot(txn_assets, txn_json)
                pre_state_foreign = (txn_assets / "foreign-legacy.png").read_bytes()
                # Inject failure during write
                os.environ["_CHABIKO_INJECT_AT"] = "4"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: regression-partial raised", False)
                except (RuntimeError, OSError):
                    check("txn: regression-partial caught", True)
                del os.environ["_CHABIKO_INJECT_AT"]
                # Verify
                h, jb, wb = snapshot(txn_assets, txn_json)
                check("txn: regression: JSON absent", not h)
                # Existing partial WebP restored
                for fn, expected in partial_webp_content.items():
                    check(f"txn: regression: {fn} restored", wb.get(fn) == expected)
                # New batch WebP NOT present (from failed publish)
                for fn in sorted(EXPECTED_ILL_FILENAMES)[5:]:
                    check(f"txn: regression: new {fn} absent", fn not in wb)
                # Foreign asset unchanged
                after_foreign = (txn_assets / "foreign-legacy.png").read_bytes()
                check("txn: regression: foreign asset unchanged", after_foreign == foreign_before)
                # Full workspace byte-identical to pre-state
                check("txn: regression: exact state match",
                      (h, jb, wb) == pre_state_snapshot)
                check("txn: regression: exact foreign match",
                      after_foreign == pre_state_foreign)

                # 8h. Regression: JSON present, partial WebP, foreign assets
                # First clean publish then remove some webps
                remove_batch_outputs(txn_assets, txn_json)
                (txn_assets / "foreign-legacy.png").write_bytes(foreign_before)
                records = convert_all(source_dir, vocab_batch_path,
                                      assets_dir=txn_assets, batch_json=txn_json)
                pre_state_json = txn_json.read_bytes()
                # Remove 3 WebP
                for fn in sorted(txn_assets.glob("*.webp"))[:3]:
                    fn.unlink()
                pre_state_snapshot2 = snapshot(txn_assets, txn_json)
                pre_state_foreign2 = (txn_assets / "foreign-legacy.png").read_bytes()
                # Inject JSON write failure
                os.environ["_CHABIKO_INJECT_AT"] = "write"
                try:
                    convert_all(source_dir, vocab_batch_path,
                                assets_dir=txn_assets, batch_json=txn_json)
                    check("txn: regression-json replaced raised", False)
                except (RuntimeError, OSError):
                    check("txn: regression-json replaced caught", True)
                del os.environ["_CHABIKO_INJECT_AT"]
                h2, jb2, wb2 = snapshot(txn_assets, txn_json)
                check("txn: regression: JSON restored", h2)
                check("txn: regression: JSON exact bytes", jb2 == pre_state_json)
                # Snapshot preserved the reduced webp set
                check("txn: regression: webp count restored", len(wb2) == len(pre_state_snapshot2[2]))
                # Foreign asset untouched
                after_foreign2 = (txn_assets / "foreign-legacy.png").read_bytes()
                check("txn: regression: foreign unchanged", after_foreign2 == foreign_before)
                # Full state match
                check("txn: regression: exact match",
                      (h2, jb2, wb2) == pre_state_snapshot2)

    except Exception as e:
        check(f"txn block: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 9. Joined-bundle schema
    print("  joined-bundle schema ...")
    try:
        jd = Path(tempfile.mkdtemp(prefix="chabiko-join-"))
        records = _convert_all_to_dir(source_dir, jd)
        errs = _validate_joined_bundle(vocab_batch_path, records)
        if errs:
            check("joined-bundle exit 0", False)
            for e in errs[:5]:
                print(f"    {e}", file=sys.stderr)
        else:
            check("joined-bundle exit 0", True)
        shutil.rmtree(jd, ignore_errors=True)
    except Exception as e:
        check(f"joined-bundle: {e}", False)
        traceback.print_exc(file=sys.stderr)

    # 10. Git + worktree check
    print("  git check ...")
    r = subprocess.run(["git", "ls-files", "--", "词汇表/"],
                       capture_output=True, text=True, cwd=REPO_ROOT)
    check("no source PNGs in Git", not r.stdout.strip())
    # Verify tracked outputs exactly unchanged
    r2 = subprocess.run(["git", "status", "--short", "--", "data/", "public/assets/vocabulary/"],
                        capture_output=True, text=True, cwd=REPO_ROOT)
    if r2.stdout.strip():
        check(f"git status unchanged: {r2.stdout.strip()}", False)
    else:
        check("git status unaffected by tests", True)

    print(f"\n  {passed} passed, {failed} failed")
    return 1 if failed else 0


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Import teacher-core-v1 batch-01 as draft WebP")
    p.add_argument("--source-dir", type=str)
    p.add_argument("--vocabulary-batch", type=str)
    p.add_argument("--test", action="store_true")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    sd = Path(args.source_dir).resolve() if args.source_dir else None
    if sd is not None and not sd.is_dir():
        p.error(f"--source-dir: not a directory: {sd}")
    vb = Path(args.vocabulary_batch).resolve() if args.vocabulary_batch else None
    if vb is not None and not vb.is_file():
        p.error(f"--vocabulary-batch: not a file: {vb}")
    if args.test:
        if sd is None or vb is None:
            p.error("--test requires --source-dir and --vocabulary-batch")
        sys.exit(run_tests(sd, vb))
    if args.check:
        if sd is None or vb is None:
            p.error("--check requires --source-dir and --vocabulary-batch")
        sys.exit(run_check(sd, vb))
    if sd is None or vb is None:
        p.error("conversion requires --source-dir and --vocabulary-batch")
    print("Converting 19 candidate images ...")
    records = convert_all(sd, vb)
    print(f"  Published {len(records)} illustrations")
    print(f"  WebP → {ASSETS_DIR}")
    print(f"  JSON → {BATCH_JSON}")
    print("Done.")

if __name__ == "__main__":
    main()
