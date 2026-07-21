#!/usr/bin/env python3
"""
Teacher Workbook Vocabulary Importer for Chabiko (#112).

Reads the teacher-curriculum workbook 单词表(带图).xlsx, parses text-only
content from fixed sheet mappings, and emits deterministic draft vocabulary
records plus a bounded import manifest.

Usage:
    uv run python scripts/import-teacher-vocabulary-xlsx.py <input.xlsx> <output-dir>
    uv run python scripts/import-teacher-vocabulary-xlsx.py --test
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata

import openpyxl
from openpyxl import Workbook


# ─── Sheet classification ─────────────────────────────────────────────────────

IGNORED_SEPARATOR_SHEETS = frozenset({"難易度☆", "難易度☆☆"})

SHEET_CONFIGS = {
    "名词1":     {"difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "noun"},
    "动词1":     {"difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "verb"},
    "形容词1":   {"difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "adjective"},
    "副词":      {"difficultyBand": "star-1", "sourceDifficultyLabel": "☆", "partOfSpeech": "adverb"},
    "名词2":     {"difficultyBand": "star-2", "sourceDifficultyLabel": "☆☆", "partOfSpeech": "noun"},
    "形容词2":   {"difficultyBand": "star-2", "sourceDifficultyLabel": "☆☆", "partOfSpeech": "adjective"},
    "动词2":     {"difficultyBand": "star-2", "sourceDifficultyLabel": "☆☆", "partOfSpeech": "verb"},
}

SHEET_ORDER = ["名词1", "动词1", "形容词1", "副词", "名词2", "形容词2", "动词2"]

REQUIRED_HEADERS = frozenset({"单词", "拼音", "日语翻译", "难易度"})

IGNORED_COLUMN_NAMES = frozenset({"造词/造句", "日文字", "备注"})

VALID_DIFFICULTY_LABELS = frozenset({"☆", "☆☆"})

POS_ORDER = {"noun": 0, "verb": 1, "adjective": 2, "adverb": 3}
BAND_ORDER = {"star-1": 0, "star-2": 1}

HEADER_ALIASES = {
    "单词": frozenset({"单词"}),
    "拼音": frozenset({"拼音"}),
    "日语翻译": frozenset({"日语翻译"}),
    "难易度": frozenset({"难易度"}),
}

SOURCE_ID = "teacher-core-v1"


# ─── Unicode/whitespace normalization (#111/#74 rules) ───────────────────────

def normalize_text(value):
    """Normalize whitespace and Unicode deterministically.

    Strips leading/trailing whitespace, collapses internal runs, applies NFC.
    """
    if not isinstance(value, str):
        value = str(value) if value is not None else ""
    value = unicodedata.normalize("NFC", value.strip())
    value = re.sub(r"\s+", " ", value)
    return value


def _normalize_simplified(text):
    """Normalize simplified Chinese per teacher identity contract.

    Matches validate-content-schema.py _normalize_simplified exactly.
    """
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(ch for ch in normalized if not ch.isspace())


def _normalize_pinyin(text):
    """Normalize pinyin per teacher identity contract.

    Matches validate-content-schema.py _normalize_pinyin exactly.
    """
    normalized = unicodedata.normalize("NFKC", text)
    case_folded = normalized.casefold()
    return "".join(ch for ch in case_folded if not ch.isspace())


def _normalize_difficulty(text):
    """Normalize difficulty value for comparison (NFKC + strip)."""
    if not isinstance(text, str):
        return ""
    return unicodedata.normalize("NFKC", text).strip()


# ─── Stable ID generation ────────────────────────────────────────────────────

def generate_vocabulary_id(difficulty_band, simplified, pinyin):
    """Generate a deterministic vocabulary ID.

    ``teacher-{difficultyBand}-{first 12 lowercase hex chars of
    SHA-256("teacher-core-v1|{normalizedSimplified}|{normalizedPinyin}")}``
    """
    norm_s = _normalize_simplified(simplified)
    norm_p = _normalize_pinyin(pinyin)
    seed = f"teacher-core-v1|{norm_s}|{norm_p}"
    hash_digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]
    return f"teacher-{difficulty_band}-{hash_digest}"


def generate_illustration_id(vocabulary_id):
    """ill-{vocabularyId}"""
    return f"ill-{vocabulary_id}"


# ─── Sheet & header detection ────────────────────────────────────────────────

def resolve_headers(header_row):
    """Detect canonical column mapping from a header row.

    Returns (mapping, ignored_indices, unknown_headers) where:
    - mapping: {exact header name: column_index} for required columns
    - ignored_indices: list of column indices in IGNORED_COLUMN_NAMES
    - unknown_headers: list of (header_text, column_index) for other columns
    """
    mapping = {}
    ignored_indices = []
    unknown = []

    for idx, raw in enumerate(header_row):
        text = normalize_text(raw).strip() if raw else ""
        if not text:
            continue

        if text in REQUIRED_HEADERS:
            mapping[text] = idx
        elif text in IGNORED_COLUMN_NAMES:
            ignored_indices.append(idx)
        else:
            unknown.append((text, idx))

    return mapping, ignored_indices, unknown


def has_content_beyond_header(ws):
    """Check if a worksheet has any non-None value beyond row 1."""
    if ws.max_row is None or ws.max_row < 2:
        return False
    for row_idx in range(2, ws.max_row + 1):
        for col_idx in range(1, (ws.max_column or 1) + 1):
            if ws.cell(row=row_idx, column=col_idx).value is not None:
                return True
    return False


# ─── Row parsing ─────────────────────────────────────────────────────────────

def parse_row(ws, row_idx, mapping):
    """Parse a single data row.

    Returns a dict with header->value entries plus ``_sourceSheet``,
    ``_sourceRow``, and ``_hasFormula`` metadata.
    """
    record = {"_sourceSheet": ws.title, "_sourceRow": row_idx}
    has_formula = False

    for header, col_idx in mapping.items():
        cell = ws.cell(row=row_idx, column=col_idx + 1)
        raw = cell.value
        is_formula = (cell.data_type == "f")

        if is_formula:
            has_formula = True
            record[header] = ""
        elif raw is None:
            record[header] = ""
        else:
            record[header] = normalize_text(str(raw))

    record["_hasFormula"] = has_formula
    return record


def is_fully_empty(record, mapping):
    """Check if all mapped columns are empty/blank."""
    for header in mapping:
        val = record.get(header, "")
        if isinstance(val, str) and val.strip():
            return False
    return True


# ─── Record validation ───────────────────────────────────────────────────────

def validate_record(record, sheet_config, seen_identities, seen_ids):
    """Validate a parsed record.

    Returns (vocab_dict, None) on success, (None, rejection_reason) on failure.
    """
    simplified = record.get("单词", "")
    pinyin = record.get("拼音", "")
    japanese = record.get("日语翻译", "")
    difficulty_raw = record.get("难易度", "")
    sheet = record.get("_sourceSheet", "")
    row = record.get("_sourceRow", 0)

    # Formula in any mapped column → reject
    if record.get("_hasFormula"):
        return None, f"formula in required column(s): {sheet}:{row}"

    if not simplified:
        return None, f"missing required column '单词': {sheet}:{row}"
    if not pinyin:
        return None, f"missing required column '拼音': {sheet}:{row}"
    if not japanese:
        return None, f"missing required column '日语翻译': {sheet}:{row}"
    if not difficulty_raw:
        return None, f"missing required column '难易度': {sheet}:{row}"

    # Difficulty must match sheet mapping after normalization
    normalized_difficulty = _normalize_difficulty(difficulty_raw)
    expected_difficulty = sheet_config["sourceDifficultyLabel"]
    if normalized_difficulty != expected_difficulty:
        return None, (
            f"难易度 mismatch: got '{normalized_difficulty}', "
            f"expected '{expected_difficulty}' for sheet '{sheet}': "
            f"{sheet}:{row}"
        )

    # Duplicate identity
    norm_s = _normalize_simplified(simplified)
    norm_p = _normalize_pinyin(pinyin)
    identity = (norm_s, norm_p)
    if identity in seen_identities:
        return None, f"duplicate identity ({simplified}, {pinyin}): {sheet}:{row}"

    difficulty_band = sheet_config["difficultyBand"]
    vid = generate_vocabulary_id(difficulty_band, simplified, pinyin)
    if vid in seen_ids:
        return None, f"collision on ID {vid}: {sheet}:{row}"

    vocab = {
        "id": vid,
        "simplified": simplified,
        "simplifiedStatus": "authored",
        "pinyin": pinyin,
        "japanese": japanese,
        "source": {"type": "teacher-workbook"},
        "reviewStatus": "draft",
        "curriculum": {
            "sourceId": SOURCE_ID,
            "difficultyBand": difficulty_band,
            "sourceDifficultyLabel": sheet_config["sourceDifficultyLabel"],
            "partOfSpeech": sheet_config["partOfSpeech"],
            "sourceSheet": sheet,
            "sourceRow": row,
        },
    }

    return vocab, None


# ─── Batch output ────────────────────────────────────────────────────────────

def _sort_key(entry):
    """Stable sort key per Issue #112.

    1. difficulty: star-1, then star-2
    2. part of speech: noun, verb, adjective, adverb
    3. source sheet in fixed table order
    4. numeric source row ascending
    """
    vocab, sheet, row = entry
    cur = vocab["curriculum"]
    return (
        BAND_ORDER.get(cur["difficultyBand"], 99),
        POS_ORDER.get(cur["partOfSpeech"], 99),
        SHEET_ORDER.index(sheet) if sheet in SHEET_ORDER else 99,
        row,
    )


def write_batches(accepted_entries, output_dir):
    """Write vocabulary records to deterministic batch JSON files.

    *accepted_entries* is a list of ``(vocab_dict, source_sheet, source_row)``
    tuples.  Returns batch metadata list for the manifest.
    """
    accepted_entries.sort(key=_sort_key)

    batches = []
    for i in range(0, len(accepted_entries), 50):
        chunk = accepted_entries[i:i + 50]
        batch_num = i // 50 + 1
        filename = f"teacher-vocabulary-batch-{batch_num:02d}.json"
        filepath = os.path.join(output_dir, filename)

        batch_vocab = []
        batch_sources = []
        for v, sheet, row in chunk:
            batch_vocab.append(v)
            ill_id = generate_illustration_id(v["id"])
            batch_sources.append({
                "vocabularyId": v["id"],
                "expectedIllustrationId": ill_id,
                "sourceSheet": sheet,
                "sourceRow": row,
            })

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump({"vocabulary": batch_vocab}, f,
                      ensure_ascii=False, indent=2)
            f.write("\n")

        batches.append({
            "filename": filename,
            "batchNumber": batch_num,
            "entryCount": len(batch_vocab),
            "firstEntryId": batch_vocab[0]["id"],
            "lastEntryId": batch_vocab[-1]["id"],
            "sourceRows": batch_sources,
        })

    return batches


# ─── Main import pipeline ────────────────────────────────────────────────────

def import_xlsx(input_path, output_dir):
    """Run the full import pipeline.

    Returns the manifest dict.
    """
    # 1. Source checksum (before any mutation)
    with open(input_path, "rb") as f:
        checksum = hashlib.sha256(f.read()).hexdigest()

    # 2. Open workbook
    wb = openpyxl.load_workbook(input_path, data_only=False)

    # 3. Classify sheets
    data_sheets_info = []   # (sheet_name, ws, mapping, config)
    separator_sheets = []   # ignored separator/cover sheets
    unknown_sheets = []     # non-empty sheets not in any classification

    ignored_columns_by_sheet = {}

    for ws in wb.worksheets:
        sheet_name = ws.title

        if sheet_name in IGNORED_SEPARATOR_SHEETS:
            separator_sheets.append(sheet_name)
            continue

        if sheet_name in SHEET_CONFIGS:
            config = SHEET_CONFIGS[sheet_name]
            header_row = [cell.value if cell.value is not None else ""
                          for cell in ws[1]]
            mapping, ignored_indices, unknown_headers = resolve_headers(header_row)

            missing = [h for h in REQUIRED_HEADERS if h not in mapping]
            if missing:
                raise ValueError(
                    f"Sheet '{sheet_name}' matched in mapping but missing required "
                    f"header(s): {', '.join(missing)}"
                )

            data_sheets_info.append((sheet_name, ws, mapping, config))

            col_info = {"ignored": [], "unknown": []}
            for idx in ignored_indices:
                col_info["ignored"].append({
                    "column": idx + 1,
                    "name": normalize_text(header_row[idx]).strip(),
                })
            for name, idx in unknown_headers:
                col_info["unknown"].append({
                    "column": idx + 1,
                    "name": name,
                })
            ignored_columns_by_sheet[sheet_name] = col_info
            continue

        # Unknown sheet: must be empty or fatal
        if has_content_beyond_header(ws):
            unknown_sheets.append(sheet_name)

    if unknown_sheets:
        raise ValueError(
            f"Unknown non-empty sheet(s) not in fixed mapping: "
            f"{', '.join(sorted(unknown_sheets))}"
        )

    if not data_sheets_info:
        raise ValueError("No sheets with valid teacher vocabulary headers found")

    # 4. Parse all rows (skip header row 1)
    all_records = []
    for sheet_name, ws, mapping, config in data_sheets_info:
        for row_idx in range(2, ws.max_row + 1):
            record = parse_row(ws, row_idx, mapping)
            record["_config"] = config
            all_records.append(record)

    # 5. Filter empty rows, validate, categorise
    seen_ids = set()
    seen_identities = set()
    accepted_entries = []          # (vocab, sheet, row)
    rejected = []                  # {"reason": str, "sheet": str, "row": int}
    total_candidate_rows = 0

    for record in all_records:
        mapping = {h: idx for h, idx in data_sheets_info[0][2].items()}
        # Determine mapping from the record's own sheet
        record_sheet = record["_sourceSheet"]
        rec_mapping = None
        for sn, _ws, mp, _cfg in data_sheets_info:
            if sn == record_sheet:
                rec_mapping = mp
                break

        if rec_mapping is None:
            continue  # should not happen

        # Fully empty row → ignore (not counted)
        if is_fully_empty(record, rec_mapping):
            continue

        total_candidate_rows += 1
        config = record["_config"]
        vocab, reason = validate_record(record, config, seen_identities, seen_ids)

        if reason:
            rejected.append({
                "reason": reason,
                "sheet": record["_sourceSheet"],
                "row": record["_sourceRow"],
            })
        else:
            norm_s = _normalize_simplified(vocab["simplified"])
            norm_p = _normalize_pinyin(vocab["pinyin"])
            seen_identities.add((norm_s, norm_p))
            seen_ids.add(vocab["id"])
            accepted_entries.append((
                vocab,
                record["_sourceSheet"],
                record["_sourceRow"],
            ))

    # 6. Count by difficulty and part of speech
    accepted_by_dim = {}
    rejected_by_dim = {}
    for v, _sheet, _row in accepted_entries:
        cur = v["curriculum"]
        key = f"{cur['difficultyBand']}/{cur['partOfSpeech']}"
        accepted_by_dim[key] = accepted_by_dim.get(key, 0) + 1

    for r in rejected:
        # Infer difficulty/pos from sheet
        r_sheet = r["sheet"]
        if r_sheet in SHEET_CONFIGS:
            cfg = SHEET_CONFIGS[r_sheet]
            key = f"{cfg['difficultyBand']}/{cfg['partOfSpeech']}"
            rejected_by_dim[key] = rejected_by_dim.get(key, 0) + 1

    # 7. Write batches (output mutation starts here)
    os.makedirs(output_dir, exist_ok=True)
    batches = write_batches(accepted_entries, output_dir)

    # 8. Build manifest
    duplicate_diagnostics = [
        r for r in rejected if "duplicate" in r["reason"]
    ]

    data_sheet_names = [s[0] for s in data_sheets_info]

    manifest = {
        "sourceFile": os.path.basename(input_path),
        "sourceChecksumSha256": checksum,
        "sourceId": SOURCE_ID,
        "sheets": {
            "detected": data_sheet_names,
            "ignoredSeparators": separator_sheets,
        },
        "ignoredColumnsBySheet": ignored_columns_by_sheet,
        "totalRows": total_candidate_rows,
        "accepted": len(accepted_entries),
        "acceptedByDifficultyAndPos": dict(sorted(accepted_by_dim.items())),
        "rejected": len(rejected),
        "rejectedByDifficultyAndPos": dict(sorted(rejected_by_dim.items())),
        "duplicateDiagnostics": duplicate_diagnostics,
        "rejectedRows": rejected,
        "batchCount": len(batches),
        "batches": batches,
    }

    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 9. Validate every batch against the content schema
    _validate_batches(output_dir, batches)

    return manifest


def _validate_batches(output_dir, batches):
    """Run the content schema validator on every batch file."""
    validator = os.path.join(os.path.dirname(__file__), "validate-content-schema.py")
    for b in batches:
        batch_path = os.path.join(output_dir, b["filename"])
        result = subprocess.run(
            [sys.executable, validator, "--check", batch_path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
            summary = "; ".join(lines[:3])
            raise RuntimeError(
                f"Batch {b['filename']} failed content schema validation: {summary}"
            )


# ─── CLI entry point ─────────────────────────────────────────────────────────

def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--test":
        sys.exit(run_tests())

    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        manifest = import_xlsx(input_path, output_dir)
        print(f"Import complete: {manifest['accepted']} accepted, "
              f"{manifest['rejected']} rejected")
        print(f"  Batches: {manifest['batchCount']}")
        print(f"  Output: {output_dir}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


# ─── Self-tests ──────────────────────────────────────────────────────────────

def _make_synthetic_wb(path):
    """Create a synthetic multi-sheet XLSX fixture at *path*."""
    wb = Workbook()

    # Sheet: 名词1
    ws = wb.active
    ws.title = "名词1"
    ws.append(["单词", "拼音", "日语翻译", "难易度", "造词/造句", "备注"])
    ws.append(["苹果", "píngguǒ", "りんご", "☆", "吃苹果", ""])
    ws.append(["猫", "māo", "猫", "☆", "", ""])
    ws.append(["", "gǒu", "犬", "☆", "", ""])  # empty simplified → rejected
    ws.append(["水", "shuǐ", "水", "☆", "喝水", ""])
    ws.append(["苹果", "píngguǒ", "りんご", "☆", "", ""])  # duplicate identity
    ws.append(["桌子", "zhuōzi", "机", "☆", "", ""])

    # Sheet: 动词1
    ws2 = wb.create_sheet("动词1")
    ws2.append(["单词", "拼音", "日语翻译", "难易度"])
    ws2.append(["吃", "chī", "食べる", "☆"])
    ws2.append(["喝", "hē", "飲む", "☆"])
    ws2.append(["走", "zǒu", "歩く", "☆"])
    ws2.append(["", "", "", ""])  # fully empty → ignored

    # Sheet: 形容词2 (star-2)
    ws3 = wb.create_sheet("形容词2")
    ws3.append(["单词", "拼音", "日语翻译", "难易度"])
    ws3.append(["大", "dà", "大きい", "☆☆"])
    ws3.append(["小", "xiǎo", "小さい", "☆☆"])
    ws3.append(["高", "gāo", "高い", "☆☆"])

    # Sheet with wrong difficulty
    ws4 = wb.create_sheet("名词2")
    ws4.append(["单词", "拼音", "日语翻译", "难易度"])
    ws4.append(["学校", "xuéxiào", "学校", "☆☆"])
    ws4.append(["医院", "yīyuàn", "病院", "☆"])  # wrong difficulty → rejected

    # Separator sheets (ignored)
    ws5 = wb.create_sheet("難易度☆")
    ws5.append(["placeholder", "data"])
    ws5.append(["x", "y"])

    ws6 = wb.create_sheet("難易度☆☆")
    ws6.append(["placeholder", "data"])

    # Empty sheet (skipped)
    wb.create_sheet("Empty")

    wb.save(path)


def _check_batch_order_and_size(output_dir, manifest):
    """Verify every batch contains 1-50 entries with stable ordering."""
    assert manifest["batchCount"] >= 1, "must produce at least one batch"

    for b in manifest["batches"]:
        assert 1 <= b["entryCount"] <= 50, \
            f"batch {b['batchNumber']} has {b['entryCount']} entries (want 1-50)"

        batch_path = os.path.join(output_dir, b["filename"])
        with open(batch_path, "r", encoding="utf-8") as f:
            batch = json.load(f)

        assert len(batch["vocabulary"]) == b["entryCount"]

        # Verify sort order
        entries = batch["vocabulary"]
        for i in range(1, len(entries)):
            prev = entries[i - 1]
            cur = entries[i]
            pk = (
                BAND_ORDER.get(prev["curriculum"]["difficultyBand"], 99),
                POS_ORDER.get(prev["curriculum"]["partOfSpeech"], 99),
                SHEET_ORDER.index(prev["curriculum"]["sourceSheet"])
                if prev["curriculum"]["sourceSheet"] in SHEET_ORDER else 99,
                prev["curriculum"]["sourceRow"],
            )
            ck = (
                BAND_ORDER.get(cur["curriculum"]["difficultyBand"], 99),
                POS_ORDER.get(cur["curriculum"]["partOfSpeech"], 99),
                SHEET_ORDER.index(cur["curriculum"]["sourceSheet"])
                if cur["curriculum"]["sourceSheet"] in SHEET_ORDER else 99,
                cur["curriculum"]["sourceRow"],
            )
            assert pk <= ck, \
                f"batch {b['batchNumber']} not sorted at index {i}: {pk} > {ck}"


def _check_byte_identical(fixture_path, output_dir_a):
    """Rerun and verify byte-identical output."""
    with tempfile.TemporaryDirectory() as tmp:
        manifest_b = import_xlsx(fixture_path, tmp)

        # Compare batch files
        manifest_path_a = os.path.join(output_dir_a, "manifest.json")
        with open(manifest_path_a, "r", encoding="utf-8") as f:
            ma = json.load(f)
        manifest_path_b = os.path.join(tmp, "manifest.json")
        with open(manifest_path_b, "r", encoding="utf-8") as f:
            mb = json.load(f)

        # Compare batch files byte for byte
        for ba, bb in zip(ma["batches"], mb["batches"]):
            path_a = os.path.join(output_dir_a, ba["filename"])
            path_b = os.path.join(tmp, bb["filename"])
            with open(path_a, "rb") as f:
                data_a = f.read()
            with open(path_b, "rb") as f:
                data_b = f.read()
            assert data_a == data_b, \
                f"Byte mismatch on {ba['filename']}"

        # Compare manifests (sourceChecksumSha256 should match since same input file)
        assert ma == mb, "Manifests differ between identical runs"


def _check_manifest_counts(manifest):
    """Verify by-dimension count sums equal their top-level totals."""
    total_accepted = sum(manifest["acceptedByDifficultyAndPos"].values())
    assert total_accepted == manifest["accepted"], \
        f"acceptedByDifficultyAndPos sum ({total_accepted}) != accepted ({manifest['accepted']})"

    total_rejected = sum(manifest["rejectedByDifficultyAndPos"].values())
    assert total_rejected == manifest["rejected"], \
        f"rejectedByDifficultyAndPos sum ({total_rejected}) != rejected ({manifest['rejected']})"


def run_tests():
    """Execute all importer self-tests.

    Returns 0 on success, 1 on failure.
    """
    errors = 0

    try:
        with tempfile.TemporaryDirectory() as test_dir:
            fixture_path = os.path.join(test_dir, "synthetic.xlsx")
            output_dir_a = os.path.join(test_dir, "out-a")
            os.makedirs(output_dir_a)

            _make_synthetic_wb(fixture_path)

            # ── Test 1: Basic import succeeds ──
            print("Test 1: Basic import ... ", end="")
            manifest = import_xlsx(fixture_path, output_dir_a)
            total = manifest["accepted"] + manifest["rejected"]
            assert manifest["totalRows"] == total, \
                f"totalRows ({manifest['totalRows']}) != accepted+rejected ({total})"
            # Expected: 名词1=5 candidates(1 empty simplified rejected, 1 dup rejected)
            # 动词1=3 candidates, 形容词2=3 candidates, 名词2=2 candidates
            # Total candidates: 5+3+3+2 = 13
            # Accepted: 名词1=4(苹果,猫,水,桌子) 动词1=3(吃,喝,走) 形容词2=3(大,小,高) 名词2=1(学校)
            #   = 4+3+3+1 = 11
            # Rejected: 名词1=1(empty simplified)+1(dup identity) 名词2=1(wrong difficulty) = 3
            assert manifest["accepted"] == 11, \
                f"expected 11 accepted, got {manifest['accepted']}"
            assert manifest["rejected"] == 3, \
                f"expected 3 rejected, got {manifest['rejected']}"
            assert manifest["batchCount"] >= 1
            print("PASS")

            # ── Test 2: Sheet detection ──
            print("Test 2: Sheet detection ... ", end="")
            assert "名词1" in manifest["sheets"]["detected"]
            assert "动词1" in manifest["sheets"]["detected"]
            assert "形容词2" in manifest["sheets"]["detected"]
            assert "名词2" in manifest["sheets"]["detected"]
            assert "難易度☆" in manifest["sheets"]["ignoredSeparators"]
            assert "難易度☆☆" in manifest["sheets"]["ignoredSeparators"]
            assert "Empty" not in manifest["sheets"]["detected"]
            print("PASS")

            # ── Test 3: Duplicate diagnostics ──
            print("Test 3: Duplicate diagnostics ... ", end="")
            assert len(manifest["duplicateDiagnostics"]) == 1, \
                f"expected 1 duplicate diagnostic, got {len(manifest['duplicateDiagnostics'])}"
            assert "duplicate identity" in manifest["duplicateDiagnostics"][0]["reason"].lower()
            print("PASS")

            # ── Test 4: Rejected row tracking ──
            print("Test 4: Rejected row tracking ... ", end="")
            assert len(manifest["rejectedRows"]) == 3, \
                f"expected 3 rejected rows, got {len(manifest['rejectedRows'])}"
            rejected_reasons = [r["reason"] for r in manifest["rejectedRows"]]

            # Find the empty simplified rejection in 名词1
            empty_simplified = [r for r in manifest["rejectedRows"]
                                if "missing required column '单词'" in r["reason"]]
            assert len(empty_simplified) == 1
            assert empty_simplified[0]["sheet"] == "名词1"
            assert empty_simplified[0]["row"] == 4  # row 4 in 名词1 (1-based, header=1)

            # Find duplicate
            duplicate_rows = [r for r in manifest["rejectedRows"]
                              if "duplicate identity" in r["reason"]]
            assert len(duplicate_rows) == 1
            assert duplicate_rows[0]["sheet"] == "名词1"
            # 苹果/píngguǒ should be at row 6 (dup of row 2)

            # Find wrong difficulty
            wrong_diff = [r for r in manifest["rejectedRows"]
                          if "难易度 mismatch" in r["reason"]]
            assert len(wrong_diff) == 1
            assert wrong_diff[0]["sheet"] == "名词2"
            print("PASS")

            # ── Test 5: Batch integrity ──
            print("Test 5: Batch size and ordering ... ", end="")
            _check_batch_order_and_size(output_dir_a, manifest)
            print("PASS")

            # ── Test 6: Byte-identical re-run ──
            print("Test 6: Byte-identical re-run ... ", end="")
            _check_byte_identical(fixture_path, output_dir_a)
            print("PASS")

            # ── Test 7: Count sums ──
            print("Test 7: Manifest count sums ... ", end="")
            _check_manifest_counts(manifest)
            print("PASS")

            # ── Test 8: Output shape ──
            print("Test 8: Output field hygiene ... ", end="")
            for b in manifest["batches"]:
                batch_path = os.path.join(output_dir_a, b["filename"])
                with open(batch_path, "r", encoding="utf-8") as f:
                    batch = json.load(f)
                for entry in batch["vocabulary"]:
                    assert "id" in entry
                    assert "simplified" in entry
                    assert "simplifiedStatus" in entry
                    assert "pinyin" in entry
                    assert "japanese" in entry
                    assert "source" in entry
                    assert "reviewStatus" in entry
                    assert "curriculum" in entry
                    assert "illustrationRef" not in entry, \
                        "draft records must not have illustrationRef"
                    assert entry["source"]["type"] == "teacher-workbook"
                    assert entry["reviewStatus"] == "draft"
                    assert entry["simplifiedStatus"] == "authored"
                    assert entry["id"].startswith("teacher-")
            print("PASS")

            # ── Test 9: Illustration ID format ──
            print("Test 9: Illustration ID format ... ", end="")
            for b in manifest["batches"]:
                for src_row in b["sourceRows"]:
                    expected_ill = "ill-" + src_row["vocabularyId"]
                    assert src_row["expectedIllustrationId"] == expected_ill, \
                        f"Expected {expected_ill}, got {src_row['expectedIllustrationId']}"
            print("PASS")

            # ── Test 10: Ignored columns recorded ──
            print("Test 10: Ignored columns in manifest ... ", end="")
            assert "名词1" in manifest["ignoredColumnsBySheet"]
            noun1_ignored = manifest["ignoredColumnsBySheet"]["名词1"]["ignored"]
            assert any("造词/造句" in i["name"] for i in noun1_ignored), \
                f"造词/造句 not found in ignored columns: {noun1_ignored}"
            assert any("备注" in i["name"] for i in noun1_ignored), \
                f"备注 not found in ignored columns: {noun1_ignored}"
            print("PASS")

            # ── Test 11: Fully empty row ignored ──
            print("Test 11: Empty row ignored ... ", end="")
            # 动词1 row 5 is fully empty → should not count
            # Total candidates: 6(名词1) + 3(动词1) + 3(形容词2) + 2(名词2) = 14
            assert manifest["totalRows"] == 14, \
                f"expected totalRows=14, got {manifest['totalRows']}"
            print("PASS")

            # ── Test 12: ID format ──
            print("Test 12: ID format ... ", end="")
            for b in manifest["batches"]:
                batch_path = os.path.join(output_dir_a, b["filename"])
                with open(batch_path, "r", encoding="utf-8") as f:
                    batch = json.load(f)
                for entry in batch["vocabulary"]:
                    # teacher-{difficultyBand}-{12 hex chars}
                    # e.g. teacher-star-1-cedf48403ca3
                    assert entry["id"].startswith("teacher-"), \
                        f"ID '{entry['id']}' does not start with 'teacher-'"
                    id_hash_part = entry["id"].rsplit("-", 1)[-1]
                    assert len(id_hash_part) == 12, \
                        f"ID '{entry['id']}' hash part is not 12 chars"
                    int(id_hash_part, 16)  # validate hex
                    band_part = entry["id"].replace("teacher-", "").rsplit("-", 1)[0]
                    assert band_part in ("star-1", "star-2"), \
                        f"ID '{entry['id']}' has unexpected difficulty band '{band_part}'"
            print("PASS")

    except Exception as e:
        print(f"\nFAILED: {e}", file=sys.stderr)
        errors = 1

    return errors


if __name__ == "__main__":
    main()
