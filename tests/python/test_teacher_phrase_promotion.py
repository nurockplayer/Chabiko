#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.teacher_phrase_promotion import (
    ContractError,
    REQUIRED_REVIEW_ROLES,
    build_promoted_projection,
    build_empty_projection,
    compute_review_version,
    serialize_projection,
    validate_promoted_projection,
)
from scripts.teacher_phrase_sidecar import build_sidecar


class TeacherPhrasePromotionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.workbook_path = self.root / "teacher.xlsx"
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "名词1"
        sheet.append(["单词", "造词/造句"])
        sheet.append(["大家", "大家好\n大家请听"])
        workbook.save(self.workbook_path)
        workbook.close()
        workbook_sha256 = hashlib.sha256(self.workbook_path.read_bytes()).hexdigest()
        self.manifest = {
            "schemaVersion": 1,
            "source": {"workbookSha256": workbook_sha256},
            "rows": [
                {
                    "learnerId": "teacher-learner-test",
                    "simplified": "大家",
                    "sourceSheet": "名词1",
                    "sourceRow": 2,
                    "example": "大家好 大家请听",
                }
            ],
        }
        self.sidecar = build_sidecar(self.manifest, self.workbook_path)
        for index, phrase in enumerate(self.sidecar["records"][0]["teacherPhrases"]):
            phrase["pinyin"] = ("dàjiā hǎo", "dàjiā qǐng tīng")[index]
            phrase["japanese"] = ("皆さん、こんにちは", "皆さん、聞いてください")[index]
            phrase["fieldProvenance"]["pinyin"] = {
                "provenance": "verified",
                "sourceRef": "teacher-editor:fixture:pinyin",
                "rightsRef": "teacher-owned:fixture",
            }
            phrase["fieldProvenance"]["japanese"] = {
                "provenance": "authored",
                "sourceRef": "teacher-editor:fixture:japanese",
                "rightsRef": "teacher-owned:fixture",
            }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def review_artifact(self, sidecar: dict | None = None) -> dict:
        current = sidecar or self.sidecar
        sidecar_sha256 = hashlib.sha256(
            (json.dumps(current, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        ).hexdigest()
        records = []
        for record in current["records"]:
            version = compute_review_version(record)
            phrase_ids = [phrase["phraseId"] for phrase in record["teacherPhrases"]]
            source_revision = record["source"]["sourceRevision"]
            role_evidence = []
            for role in REQUIRED_REVIEW_ROLES:
                evidence = {
                    "role": role,
                    "outcome": "accepted",
                    "reviewerIdentity": f"@{role}",
                    "reviewDate": "2026-09-01",
                    "reviewVersion": version,
                    "reviewedPhraseIds": phrase_ids,
                    "findings": "None.",
                }
                if role == "human-source-reviewer":
                    evidence["sourceRevision"] = source_revision
                role_evidence.append(evidence)
            records.append(
                {
                    "learnerId": record["learnerId"],
                    "sourceRevision": source_revision,
                    "reviewVersion": version,
                    "orderedPhraseIds": phrase_ids,
                    "roleEvidence": role_evidence,
                    "overallDecision": {
                        "outcome": "accepted",
                        "reviewerIdentity": "@review-coordinator",
                        "reviewerRole": "maintainer",
                        "reviewDate": "2026-09-01",
                        "reviewVersion": version,
                        "reviewedPhraseIds": phrase_ids,
                        "findings": "All required human review is complete.",
                    },
                    "maintainerPromotion": {
                        "action": "promote",
                        "maintainerIdentity": "@publisher",
                        "promotionDate": "2026-09-01",
                        "reviewVersion": version,
                        "sourceRevision": source_revision,
                        "reviewedPhraseIds": phrase_ids,
                        "findings": "Promote the exact accepted cell.",
                    },
                }
            )
        return {
            "schemaVersion": 1,
            "contractId": "teacher-phrase-human-review-v1",
            "base": {
                "sidecarContractId": current["contractId"],
                "sidecarSha256": sidecar_sha256,
                **current["base"],
            },
            "records": records,
        }

    def build(self, review: dict | None = None, sidecar: dict | None = None) -> dict:
        return build_promoted_projection(
            self.manifest,
            sidecar or self.sidecar,
            review or self.review_artifact(sidecar),
            self.workbook_path,
        )

    def test_exact_human_evidence_promotes_one_complete_cell(self) -> None:
        projection = self.build()

        self.assertEqual(projection["contractId"], "teacher-phrase-promoted-v1")
        self.assertEqual(len(projection["records"]), 1)
        record = projection["records"][0]
        self.assertEqual(record["learnerId"], "teacher-learner-test")
        self.assertEqual(len(record["teacherPhrases"]), 2)
        self.assertEqual(
            set(record),
            {"learnerId", "source", "reviewVersion", "teacherPhrases"},
        )
        self.assertEqual(
            set(record["teacherPhrases"][0]),
            {"phraseId", "simplified", "pinyin", "japanese"},
        )
        self.assertNotIn("fieldProvenance", record["teacherPhrases"][0])
        self.assertNotIn("reviewStatus", json.dumps(projection))

    def test_partial_phrase_evidence_and_generated_fields_are_atomic(self) -> None:
        partial = self.review_artifact()
        partial["records"][0]["roleEvidence"][0]["reviewedPhraseIds"].pop()
        with self.assertRaisesRegex(ContractError, "complete ordered phrase set"):
            self.build(partial)

        generated = copy.deepcopy(self.sidecar)
        generated["records"][0]["teacherPhrases"][1]["fieldProvenance"]["japanese"][
            "provenance"
        ] = "generated"
        projection = self.build(self.review_artifact(generated), generated)
        self.assertEqual(projection["records"], [])

        missing_phrase_field = copy.deepcopy(self.sidecar)
        phrase = missing_phrase_field["records"][0]["teacherPhrases"][1]
        del phrase["pinyin"]
        del phrase["fieldProvenance"]["pinyin"]
        projection = self.build(
            self.review_artifact(missing_phrase_field),
            missing_phrase_field,
        )
        self.assertEqual(projection["records"], [])

    def test_missing_rights_and_source_evidence_fail_closed(self) -> None:
        for missing in ("rightsRef", "sourceRef"):
            with self.subTest(missing=missing):
                sidecar = copy.deepcopy(self.sidecar)
                del sidecar["records"][0]["teacherPhrases"][0]["fieldProvenance"][
                    "japanese"
                ][missing]
                with self.assertRaisesRegex(ContractError, missing):
                    self.build(self.review_artifact(sidecar), sidecar)

    def test_stale_review_and_source_versions_fail_independently(self) -> None:
        stale_review = self.review_artifact()
        stale_review["records"][0]["reviewVersion"] = "0" * 64
        with self.assertRaisesRegex(ContractError, "reviewVersion"):
            self.build(stale_review)

        stale_source = self.review_artifact()
        stale_source["records"][0]["sourceRevision"] = (
            "teacher-phrase-source-v1-" + "0" * 64
        )
        with self.assertRaisesRegex(ContractError, "sourceRevision"):
            self.build(stale_source)

    def test_visible_text_order_and_provenance_change_review_version(self) -> None:
        record = self.sidecar["records"][0]
        original = compute_review_version(record)

        text = copy.deepcopy(record)
        text["teacherPhrases"][0]["japanese"] += "。"
        self.assertNotEqual(compute_review_version(text), original)

        order = copy.deepcopy(record)
        order["teacherPhrases"].reverse()
        self.assertNotEqual(compute_review_version(order), original)

        provenance = copy.deepcopy(record)
        provenance["teacherPhrases"][0]["fieldProvenance"]["japanese"][
            "sourceRef"
        ] += ":revised"
        self.assertNotEqual(compute_review_version(provenance), original)

        source_only = copy.deepcopy(record)
        source_only["source"]["rawCell"] = "  " + source_only["source"]["rawCell"]
        source_only["teacherPhrases"][0]["sourceRange"]["start"] += 2
        source_only["teacherPhrases"][0]["sourceRange"]["end"] += 2
        self.assertEqual(compute_review_version(source_only), original)

    def test_wrong_duplicate_pending_or_negative_role_evidence_blocks(self) -> None:
        wrong = self.review_artifact()
        wrong["records"][0]["roleEvidence"][0]["role"] = "human-regional-reviewer"
        with self.assertRaisesRegex(ContractError, "role evidence"):
            self.build(wrong)

        duplicate = self.review_artifact()
        duplicate["records"][0]["roleEvidence"][1]["role"] = duplicate["records"][0][
            "roleEvidence"
        ][0]["role"]
        with self.assertRaisesRegex(ContractError, "role evidence"):
            self.build(duplicate)

        for outcome in ("not-reviewed", "needs-changes", "rejected"):
            with self.subTest(outcome=outcome):
                review = self.review_artifact()
                evidence = review["records"][0]["roleEvidence"][0]
                evidence["outcome"] = outcome
                if outcome == "not-reviewed":
                    evidence["reviewerIdentity"] = None
                    evidence["reviewDate"] = None
                    evidence["reviewVersion"] = None
                    evidence["reviewedPhraseIds"] = []
                    evidence["findings"] = None
                projection = self.build(review)
                self.assertEqual(projection["records"], [])

    def test_overall_decision_and_maintainer_action_are_distinct_gates(self) -> None:
        missing_overall = self.review_artifact()
        missing_overall["records"][0]["overallDecision"] = None
        self.assertEqual(self.build(missing_overall)["records"], [])

        missing_promotion = self.review_artifact()
        missing_promotion["records"][0]["maintainerPromotion"] = None
        self.assertEqual(self.build(missing_promotion)["records"], [])

        negative_overall = self.review_artifact()
        negative_overall["records"][0]["overallDecision"]["outcome"] = "rejected"
        self.assertEqual(self.build(negative_overall)["records"], [])

    def test_projection_is_deterministic_and_bound_to_sidecar_base(self) -> None:
        first = self.build()
        second = self.build()
        self.assertEqual(serialize_projection(first), serialize_projection(second))
        self.assertEqual(first["base"]["sidecarContractId"], self.sidecar["contractId"])
        self.assertRegex(first["base"]["sidecarSha256"], r"^[0-9a-f]{64}$")

        wrong_base = self.review_artifact()
        wrong_base["base"]["sidecarSha256"] = "0" * 64
        with self.assertRaisesRegex(ContractError, "sidecar digest"):
            self.build(wrong_base)

    def test_projection_emits_records_in_learner_manifest_order(self) -> None:
        workbook_path = self.root / "ordered.xlsx"
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "名词1"
        sheet.append(["单词", "造词/造句"])
        sheet.append(["大家", "大家好\n大家请听"])
        sheet.append(["老师", "老师好\n老师请说"])
        workbook.save(workbook_path)
        workbook.close()
        manifest = {
            "schemaVersion": 1,
            "source": {"workbookSha256": hashlib.sha256(workbook_path.read_bytes()).hexdigest()},
            "rows": [
                {
                    "learnerId": "teacher-learner-first",
                    "simplified": "大家",
                    "sourceSheet": "名词1",
                    "sourceRow": 2,
                    "example": "大家好 大家请听",
                },
                {
                    "learnerId": "teacher-learner-second",
                    "simplified": "老师",
                    "sourceSheet": "名词1",
                    "sourceRow": 3,
                    "example": "老师好 老师请说",
                },
            ],
        }
        sidecar = build_sidecar(manifest, workbook_path)
        for record in sidecar["records"]:
            for phrase in record["teacherPhrases"]:
                phrase["pinyin"] = "fixture pinyin"
                phrase["japanese"] = "fixture Japanese"
                for field in ("pinyin", "japanese"):
                    phrase["fieldProvenance"][field] = {
                        "provenance": "authored",
                        "sourceRef": f"teacher-editor:fixture:{field}",
                        "rightsRef": "teacher-owned:fixture",
                    }
        sidecar["records"].reverse()
        projection = build_promoted_projection(
            manifest,
            sidecar,
            self.review_artifact(sidecar),
            workbook_path,
        )

        self.assertEqual(
            [record["learnerId"] for record in projection["records"]],
            ["teacher-learner-first", "teacher-learner-second"],
        )

    def test_empty_production_projection_claims_no_missing_sidecar(self) -> None:
        projection = build_empty_projection(self.manifest)

        self.assertEqual(projection["records"], [])
        self.assertIsNone(projection["base"]["sidecarSha256"])
        self.assertEqual(
            projection["base"]["learnerManifestSemanticSha256"],
            self.sidecar["base"]["learnerManifestSemanticSha256"],
        )
        self.assertEqual(
            projection["base"]["workbookSha256"],
            self.sidecar["base"]["workbookSha256"],
        )

    def test_projection_rejects_boolean_sidecar_schema_version(self) -> None:
        projection = build_empty_projection(self.manifest)
        projection["base"]["sidecarSchemaVersion"] = True

        with self.assertRaisesRegex(ContractError, "sidecar schema"):
            validate_promoted_projection(projection, self.manifest)

    def test_canonical_cli_writes_checks_and_preserves_dirty_neighbors(self) -> None:
        manifest_path = self.root / "learner-manifest.json"
        output_path = self.root / "teacher-phrase-promoted.json"
        neighbor = self.root / "keep-me.txt"
        manifest_path.write_text(
            json.dumps(self.manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        neighbor.write_text("owned by another writer\n", encoding="utf-8")
        command = [
            sys.executable,
            str(REPO_ROOT / "scripts/build-teacher-phrase-projection.py"),
            "--manifest",
            str(manifest_path),
            "--output",
            str(output_path),
        ]

        subprocess.run(
            [*command, "--write", "--initialize-empty"],
            cwd=REPO_ROOT,
            check=True,
        )
        expected = serialize_projection(build_empty_projection(self.manifest))
        self.assertEqual(output_path.read_bytes(), expected)
        self.assertEqual(neighbor.read_text(encoding="utf-8"), "owned by another writer\n")
        subprocess.run([*command, "--check"], cwd=REPO_ROOT, check=True)

        promoted = serialize_projection(self.build())
        output_path.write_bytes(promoted)
        subprocess.run([*command, "--check"], cwd=REPO_ROOT, check=True)
        repeated_initialization = subprocess.run(
            [*command, "--write", "--initialize-empty"],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(repeated_initialization.returncode, 0)
        self.assertIn("already exists", repeated_initialization.stderr)
        self.assertEqual(output_path.read_bytes(), promoted)
        unsafe_write = subprocess.run(
            [*command, "--write"],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(unsafe_write.returncode, 0)
        self.assertIn("initialize-empty", unsafe_write.stderr)
        self.assertEqual(output_path.read_bytes(), promoted)

        output_path.write_text("{}\n", encoding="utf-8")
        drift = subprocess.run(
            [*command, "--check"],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(drift.returncode, 0)
        self.assertIn("failed", drift.stderr)


if __name__ == "__main__":
    unittest.main()
