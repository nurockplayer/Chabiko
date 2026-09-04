"""Bounded pilot selection and immutable preparation checks; no human evidence."""

from __future__ import annotations

import copy
import json
import subprocess
import shutil
from unittest.mock import patch
import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.teacher_phrase_sidecar import (  # noqa: E402 - direct CLI execution requires repository path bootstrap
    ContractError,
    build_sidecar,
    normalize_example,
    sha256_file,
)
from scripts.teacher_phrase_pilot import (  # noqa: E402 - direct CLI execution requires repository path bootstrap
    SHEETS,
    select_records,
    pending_review,
    apply_candidates,
)
from scripts.teacher_phrase_promotion import build_promoted_projection  # noqa: E402 - direct CLI execution requires repository path bootstrap
from scripts import teacher_phrase_pilot as pilot  # noqa: E402 - direct CLI execution requires repository path bootstrap


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "source.xlsx"
        book = Workbook()
        book.remove(book.active)
        rows = []
        for name in SHEETS:
            sheet = book.create_sheet(name)
            sheet.append(["单词", "造词/造句"])
            for index, raw in enumerate(
                [
                    "whole，cell with spaces",
                    "甲\n乙",
                    "丙\n丁",
                    "later whole cell",
                    "戊\n己",
                ],
                2,
            ):
                sheet.append(["fixture", raw])
                rows.append(
                    {
                        "learnerId": f"{name}-{index}",
                        "sourceSheet": name,
                        "sourceRow": index,
                        "example": normalize_example(raw),
                    }
                )
        book.save(self.path)
        book.close()
        self.manifest = {
            "schemaVersion": 1,
            "source": {"workbookSha256": sha256_file(self.path)},
            "rows": rows,
        }
        self.sidecar = build_sidecar(self.manifest, self.path)

    def test_selection_uses_manifest_order_not_sidecar_order_and_no_lf_stays_whole(
        self,
    ):
        expected = select_records(self.sidecar, self.manifest)
        shuffled = copy.deepcopy(self.sidecar)
        shuffled["records"].reverse()
        self.assertEqual(select_records(shuffled, self.manifest), expected)
        self.assertEqual(len(expected), 12)
        for sheet in SHEETS:
            chosen = [r for r in expected if r["source"]["sheet"] == sheet]
            self.assertEqual(
                [r["source"]["row"] for r in chosen],
                [2, 5] if sheet == "名词2" else [3, 4],
            )
            if sheet == "名词2":
                self.assertTrue(
                    all(
                        r["source"]["segmentationReason"] == "no-raw-lf"
                        and len(r["teacherPhrases"]) == 1
                        for r in chosen
                    )
                )
                self.assertEqual(
                    chosen[0]["teacherPhrases"][0]["simplified"],
                    "whole，cell with spaces",
                )

    def test_insufficient_sheet_fails_without_replacement(self):
        self.sidecar["records"] = [
            r
            for r in self.sidecar["records"]
            if not (r["source"]["sheet"] == "名词2" and r["source"]["row"] == 5)
        ]
        with self.assertRaises(ContractError):
            select_records(self.sidecar, self.manifest)

    def candidates(self):
        records = copy.deepcopy(select_records(self.sidecar, self.manifest))
        for r in records:
            for p in r["teacherPhrases"]:
                for field in ("traditional", "pinyin", "japanese"):
                    p[field] = "fixture draft"
                    p["fieldProvenance"][field] = {
                        "provenance": "generated",
                        "sourceRef": f"codex-draft:issue-484:v1:{p['phraseId']}:{field}",
                        "rightsRef": "docs/content/teacher-phrase-pilot-484/provenance.md#generated-rights-pending",
                    }
        return records

    def test_candidate_overlay_preserves_all_other_rows_and_source_fields(self):
        candidates = self.candidates()
        enriched = apply_candidates(self.sidecar, self.manifest, candidates)
        ids = {r["learnerId"] for r in candidates}
        self.assertEqual(
            [r for r in enriched["records"] if r["learnerId"] not in ids],
            [r for r in self.sidecar["records"] if r["learnerId"] not in ids],
        )
        candidates[0]["source"]["rawCell"] += "!"
        with self.assertRaises(ContractError):
            apply_candidates(self.sidecar, self.manifest, candidates)

    def test_pending_and_stale_candidates_fail_closed(self):
        enriched = apply_candidates(self.sidecar, self.manifest, self.candidates())
        review = pending_review(enriched, select_records(enriched, self.manifest))
        self.assertEqual(
            build_promoted_projection(self.manifest, enriched, review, self.path)[
                "records"
            ],
            [],
        )
        enriched["records"][1]["teacherPhrases"][0]["japanese"] += "changed"
        with self.assertRaises(ContractError):
            build_promoted_projection(self.manifest, enriched, review, self.path)

    def test_committed_drafts_match_source_script_and_stay_outside_runtime_inputs(self):
        from opencc import OpenCC

        convert = OpenCC("t2s").convert
        folder = ROOT / "docs/content/teacher-phrase-pilot-484"
        candidates = json.loads((folder / "candidates.json").read_text())["records"]
        self.assertEqual(sum(len(r["teacherPhrases"]) for r in candidates), 24)
        for record in candidates:
            for phrase in record["teacherPhrases"]:
                self.assertEqual(
                    convert(phrase["traditional"]),
                    phrase["simplified"],
                    phrase["phraseId"],
                )
        for path in (ROOT / "src").rglob("*"):
            if path.suffix in {".ts", ".js", ".astro"}:
                self.assertNotIn(
                    "teacher-phrase-pilot-484", path.read_text(), str(path)
                )
        unicode_sources = json.loads(
            (ROOT / "data/unicode/source-manifest.json").read_text()
        )["sources"]
        self.assertFalse(
            any(
                "teacher-phrase-pilot-484" in entry["path"] for entry in unicode_sources
            )
        )

    def test_missing_extra_and_split_candidates_fail(self):
        candidates = self.candidates()
        for changed in (candidates[:-1], candidates + [candidates[0]]):
            with self.assertRaises(ContractError):
                apply_candidates(self.sidecar, self.manifest, changed)
        whole = next(r for r in candidates if r["source"]["sheet"] == "名词2")
        whole["teacherPhrases"].append(copy.deepcopy(whole["teacherPhrases"][0]))
        with self.assertRaises(ContractError):
            apply_candidates(self.sidecar, self.manifest, candidates)

    def test_rejected_whole_cell_and_partial_review_cannot_promote_or_substitute(self):
        # Synthetic, test-owned verification only; never evidence for real pilot cells.
        enriched = apply_candidates(self.sidecar, self.manifest, self.candidates())
        chosen = select_records(enriched, self.manifest)
        for record in chosen:
            for phrase in record["teacherPhrases"]:
                for field in ("traditional", "pinyin", "japanese"):
                    phrase["fieldProvenance"][field]["provenance"] = "verified"
        by_id = {r["learnerId"]: r for r in chosen}
        enriched["records"] = [
            by_id.get(r["learnerId"], r) for r in enriched["records"]
        ]
        review = pending_review(enriched, chosen)
        for record in review["records"]:
            for role in record["roleEvidence"]:
                role.update(
                    outcome="accepted",
                    reviewerIdentity="TEST FIXTURE ONLY",
                    reviewDate="2026-09-05",
                    reviewVersion=record["reviewVersion"],
                    reviewedPhraseIds=record["orderedPhraseIds"],
                    findings="Synthetic whole-cell acceptance.",
                )
                if role["role"] == "human-source-reviewer":
                    role["sourceRevision"] = record["sourceRevision"]
            record["overallDecision"] = dict(
                outcome="accepted",
                reviewerIdentity="TEST FIXTURE ONLY",
                reviewerRole="maintainer",
                reviewDate="2026-09-05",
                reviewVersion=record["reviewVersion"],
                reviewedPhraseIds=record["orderedPhraseIds"],
                findings="Fixture only.",
            )
            record["maintainerPromotion"] = dict(
                action="promote",
                maintainerIdentity="TEST FIXTURE ONLY",
                promotionDate="2026-09-05",
                reviewVersion=record["reviewVersion"],
                sourceRevision=record["sourceRevision"],
                reviewedPhraseIds=record["orderedPhraseIds"],
                findings="Fixture only.",
            )
        self.assertEqual(
            len(
                build_promoted_projection(self.manifest, enriched, review, self.path)[
                    "records"
                ]
            ),
            12,
        )
        rejected = next(
            r for r in review["records"] if r["learnerId"].startswith("名词2-")
        )
        rejected["roleEvidence"][2].update(
            outcome="rejected",
            findings="Reject whole cell; internal segmentation needed. Fixture only.",
        )
        promoted = build_promoted_projection(
            self.manifest, enriched, review, self.path
        )["records"]
        self.assertEqual(len(promoted), 11)
        self.assertNotIn(rejected["learnerId"], [r["learnerId"] for r in promoted])
        self.assertEqual(
            [r["learnerId"] for r in select_records(enriched, self.manifest)],
            [r["learnerId"] for r in chosen],
        )
        review["records"][0]["roleEvidence"][0]["reviewedPhraseIds"] = []
        with self.assertRaises(ContractError):
            build_promoted_projection(self.manifest, enriched, review, self.path)

    def test_cli_freeze_materialize_and_dirty_existing_output(self):
        base = Path(self.temp.name) / "fixture-repository"
        folder = base / "packet"
        folder.mkdir(parents=True)
        manifest_path = base / "data/teacher-vocabulary-preview/learner-manifest.json"
        manifest_path.parent.mkdir(parents=True)
        manifest_path.write_text(json.dumps(self.manifest))
        selection = dict(
            base=self.sidecar["base"],
            sourceOnlySidecarSha256=pilot.sidecar_sha256(self.sidecar),
            records=select_records(self.sidecar, self.manifest),
        )
        (folder / "selection.json").write_text(json.dumps(selection))
        (folder / "candidates.json").write_text(
            json.dumps(
                dict(
                    contractId="teacher-phrase-pilot-candidates-v1",
                    records=self.candidates(),
                )
            )
        )
        for name in ("provenance.md", "review-instructions.md"):
            (folder / name).write_text("Synthetic fixture, not human evidence.")
        neighbor = folder / "unrelated.txt"
        neighbor.write_text("preserve me")
        output = Path(self.temp.name) / "materialized.json"
        args = ["pilot", "--directory", str(folder), "--workbook", str(self.path)]
        with patch.object(pilot, "ROOT", base), patch.object(
            sys, "argv", args + ["--freeze"]
        ):
            self.assertEqual(pilot.main(), 0)
            self.assertEqual(pilot.main(), 1)
        with patch.object(pilot, "ROOT", base), patch.object(
            sys, "argv", args + ["--check", "--materialize-sidecar", str(output)]
        ):
            self.assertEqual(pilot.main(), 0)
            original = output.read_bytes()
            self.assertEqual(pilot.main(), 1)
            self.assertEqual(output.read_bytes(), original)
        self.assertEqual(neighbor.read_text(), "preserve me")

    def test_offline_packet_review_version_and_provenance_drift_fail_read_only(self):
        source = ROOT / "docs/content/teacher-phrase-pilot-484"
        for filename in (
            "candidates.json",
            "human-review.json",
            "reviewer-packet.md",
            "provenance.md",
        ):
            folder = Path(self.temp.name) / filename
            shutil.copytree(source, folder)
            target = folder / filename
            if filename == "candidates.json":
                payload = json.loads(target.read_text())
                payload["records"][0]["teacherPhrases"][0]["japanese"] += "drift"
                target.write_text(json.dumps(payload))
            elif filename == "human-review.json":
                payload = json.loads(target.read_text())
                payload["records"].pop()
                target.write_text(json.dumps(payload))
            else:
                target.write_text(target.read_text() + "drift")
            before = {p.name: p.read_bytes() for p in folder.iterdir() if p.is_file()}
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts/teacher_phrase_pilot.py"),
                    "--check",
                    "--directory",
                    str(folder),
                ],
                cwd=ROOT,
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(
                before,
                {p.name: p.read_bytes() for p in folder.iterdir() if p.is_file()},
            )

    def test_cli_checks_frozen_packet_without_workbook_and_is_read_only(self):
        folder = ROOT / "docs/content/teacher-phrase-pilot-484"
        before = {p.name: p.read_bytes() for p in folder.iterdir() if p.is_file()}
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/teacher_phrase_pilot.py"), "--check"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            before, {p.name: p.read_bytes() for p in folder.iterdir() if p.is_file()}
        )


if __name__ == "__main__":
    unittest.main()
