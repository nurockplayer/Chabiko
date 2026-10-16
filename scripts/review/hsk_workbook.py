"""Shared HSK workbook format and repository projection (no writes on import)."""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("hsk_importer", ROOT / "scripts/import-hearmandarin-hsk-json.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
HEADERS = ["ID", "簡体字", "ピンイン", "現在の日本語訳", "判定", "修正後の日本語訳", "コメント"]
REVIEWER_SHEET = "確認者"


def current_rows(root=ROOT):
    manifest = importer.load_json(root / importer.PROFILE_REL.parent / "manifest.json")
    rows = {}
    for batch in manifest["publication"]["batches"]:
        for record in importer.load_json(root / "data/hsk-vocabulary" / batch["file"])["vocabulary"]:
            importer.require(record["id"] not in rows, f"duplicate repository ID: {record['id']}")
            rows[record["id"]] = record
    return dict(sorted(rows.items()))
