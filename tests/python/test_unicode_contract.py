#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.unicode_contract import (
    ContractError,
    RENDERING_ENVIRONMENT_REFS,
    extract_dataset,
    publish_dataset,
    scalar_values,
    serialize_json,
    validate_dataset,
    validate_record,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def deterministic_record_id(category: str, left: list[int], right: list[int]) -> str:
    seed = json.dumps([category, left, right], ensure_ascii=True, separators=(',', ':'))
    return f"unicode-{category}-{hashlib.sha256(seed.encode('ascii')).hexdigest()[:16]}"


class UnicodeContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        self.source_path = self.root / 'data/source.json'
        self.source_path.write_text(
            json.dumps(
                {
                    'rows': [
                        {
                            'id': 'same',
                            'traditional': '骨',
                            'traditionalStatus': 'authored',
                            'simplified': '骨',
                            'simplifiedStatus': 'verified',
                            'japanese': '骨',
                            'japaneseOptions': ['学', '骨'],
                        },
                        {
                            'id': 'pair',
                            'traditional': '學',
                            'traditionalStatus': 'authored',
                            'simplified': '学',
                            'simplifiedStatus': 'verified',
                            'japanese': '学ぶ',
                        },
                        {'id': 'compat', 'japanese': '\uf900'},
                        {'id': 'variation', 'traditional': '神\ufe00'},
                    ]
                },
                ensure_ascii=False,
                indent=2,
            ) + '\n',
            encoding='utf-8',
        )
        manifest_dir = self.root / 'data/unicode'
        manifest_dir.mkdir()
        self.manifest_path = manifest_dir / 'source-manifest.json'
        self.manifest_path.write_text(
            json.dumps(
                {
                    'schemaVersion': 1,
                    'manifestId': 'test-unicode-sources-v1',
                    'unicodeVersion': unicodedata.unidata_version,
                    'sources': [
                        {
                            'id': 'fixture',
                            'path': 'data/source.json',
                            'sha256': sha256(self.source_path),
                            'format': 'json',
                            'textFields': [
                                {'field': 'traditional', 'language': 'zh-Hant'},
                                {'field': 'simplified', 'language': 'zh-Hans'},
                                {'field': 'japanese', 'language': 'ja'},
                                {'field': 'japaneseOptions', 'language': 'ja'},
                            ],
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ) + '\n',
            encoding='utf-8',
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def extract(self):
        return extract_dataset(self.manifest_path, repo_root=self.root)

    def validate_extracted_record(self, record, inventory, *, evidence=None, expected_provenance=None):
        evidence_by_id = evidence or {item['id']: item for item in inventory['evidence']}
        validate_record(
            record,
            evidence=evidence_by_id,
            expected_provenance=expected_provenance or record['provenance'],
        )

    def test_committed_manifest_covers_all_known_production_loader_sources(self) -> None:
        manifest = json.loads(
            (REPO_ROOT / 'data/unicode/source-manifest.json').read_text(encoding='utf-8')
        )
        actual = {source['path'] for source in manifest['sources']}
        required = {
            'data/examples/valid/lessons.json',
            'data/examples/valid/vocabulary.json',
            'data/examples/valid/hsk-vocabulary.json',
            'data/examples/valid/phrasebook.json',
            'data/examples/valid/practice.json',
            'data/learning-paths.json',
            'data/teacher-vocabulary-preview/learner-manifest.json',
            'data/teacher-vocabulary-preview/teacher-phrase-promoted.json',
            'data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json',
            'data/travel-quest-readiness.json',
        }
        self.assertEqual(required - actual, set())

    def test_teacher_learner_visible_sources_are_directly_allowlisted(self) -> None:
        manifest = json.loads(
            (REPO_ROOT / 'data/unicode/source-manifest.json').read_text(encoding='utf-8')
        )
        learner = next(
            source for source in manifest['sources']
            if source['id'] == 'production-learner-manifest-v1'
        )
        promoted = next(
            source for source in manifest['sources']
            if source['id'] == 'teacher-phrase-promoted-v1'
        )

        self.assertIn({'field': 'example', 'language': 'zh-Hans'}, learner['textFields'])
        self.assertEqual(
            promoted['textFields'],
            [
                {'field': 'simplified', 'language': 'zh-Hans'},
                {'field': 'traditional', 'language': 'zh-Hant', 'optional': True},
                {'field': 'japanese', 'language': 'ja'},
            ],
        )
        self.assertIs(promoted['allowEmptyRecords'], True)
        self.assertNotIn(
            'data/teacher-vocabulary-preview/teacher-phrase-authoring.json',
            {source['path'] for source in manifest['sources']},
        )

        inventory, _ = extract_dataset(
            REPO_ROOT / 'data/unicode/source-manifest.json',
            repo_root=REPO_ROOT,
        )
        example_evidence = [
            item for item in inventory['evidence']
            if item['sourceId'] == 'production-learner-manifest-v1'
            and item['field'] == 'example'
        ]
        self.assertEqual(len(example_evidence), 532)
        self.assertTrue(all(item['language'] == 'zh-Hans' for item in example_evidence))
        self.assertTrue(all(item['jsonPointer'].endswith('/example') for item in example_evidence))
        self.assertFalse(any(
            item['sourcePath'].endswith('teacher-phrase-authoring.json')
            for item in inventory['evidence']
        ))

    def test_explicit_empty_projection_is_allowed_but_nonempty_stale_fields_fail(self) -> None:
        self.source_path.write_text(
            json.dumps({'records': []}, ensure_ascii=False) + '\n',
            encoding='utf-8',
        )
        manifest = json.loads(self.manifest_path.read_text(encoding='utf-8'))
        manifest['sources'][0] = {
            'id': 'empty-projection',
            'path': 'data/source.json',
            'sha256': sha256(self.source_path),
            'format': 'json',
            'allowEmptyRecords': True,
            'textFields': [
                {'field': 'simplified', 'language': 'zh-Hans'},
                {'field': 'traditional', 'language': 'zh-Hant'},
                {'field': 'japanese', 'language': 'ja'},
            ],
        }
        self.manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8',
        )
        inventory, _ = self.extract()
        self.assertEqual(inventory['evidence'], [])

        self.source_path.write_text(
            json.dumps(
                {'records': [{'simplified': '大家好', 'japanese': 'こんにちは'}]},
                ensure_ascii=False,
            ) + '\n',
            encoding='utf-8',
        )
        manifest['sources'][0]['sha256'] = sha256(self.source_path)
        self.manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8',
        )
        with self.assertRaisesRegex(ContractError, 'stale text fields.*traditional'):
            self.extract()

        manifest['sources'][0]['textFields'][1]['optional'] = True
        self.manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8',
        )
        inventory, _ = self.extract()
        self.assertEqual(
            [item['field'] for item in inventory['evidence']],
            ['simplified', 'japanese'],
        )

    def test_lessons_review_hooks_are_selected_and_extracted(self) -> None:
        manifest = json.loads(
            (REPO_ROOT / 'data/unicode/source-manifest.json').read_text(encoding='utf-8')
        )
        lessons_source = next(
            source for source in manifest['sources'] if source['id'] == 'lessons-v1'
        )
        self.assertIn(
            {'field': 'reviewHookJa', 'language': 'ja'},
            lessons_source['textFields'],
        )

        inventory, _ = extract_dataset(
            REPO_ROOT / 'data/unicode/source-manifest.json',
            repo_root=REPO_ROOT,
        )
        hooks = [
            item for item in inventory['evidence']
            if item['sourceId'] == 'lessons-v1'
            and item['field'] == 'reviewHookJa'
        ]
        self.assertEqual(len(hooks), 14)
        self.assertTrue(all(item['language'] == 'ja' for item in hooks))
        self.assertTrue(all(item['jsonPointer'].endswith('/reviewHookJa') for item in hooks))
        hook_text = ''.join(item['text'] for item in hooks)
        self.assertIn('復', hook_text)
        self.assertIn('装', hook_text)

    def test_production_practice_answer_evidence_uses_explicit_languages(self) -> None:
        inventory, _ = extract_dataset(
            REPO_ROOT / 'data/unicode/source-manifest.json',
            repo_root=REPO_ROOT,
        )
        evidence = [
            item for item in inventory['evidence']
            if item['sourceId'] == 'practice-v1'
        ]
        by_field: dict[str, list[dict]] = {}
        for item in evidence:
            by_field.setdefault(item['field'], []).append(item)

        self.assertNotIn('correctAnswer', by_field)
        self.assertNotIn('distractors', by_field)
        self.assertTrue(by_field['correctAnswerTraditional'])
        self.assertTrue(by_field['distractorsTraditional'])
        self.assertTrue(by_field['correctAnswerJa'])
        self.assertTrue(by_field['distractorsJa'])
        self.assertTrue(all(
            item['language'] == 'zh-Hant'
            for field in ('correctAnswerTraditional', 'distractorsTraditional')
            for item in by_field[field]
        ))
        self.assertTrue(all(
            item['language'] == 'ja'
            for field in ('correctAnswerJa', 'distractorsJa')
            for item in by_field[field]
        ))
        target = next(
            item for item in by_field['correctAnswerTraditional']
            if item['text'] == '我要這個'
        )
        self.assertEqual(target['language'], 'zh-Hant')
        self.assertFalse(any(
            item['language'] == 'ja' and item['text'] == target['text']
            for item in evidence
        ))

    def test_rendering_environment_registry_refs_resolve_to_stable_document_anchors(self) -> None:
        self.assertNotEqual(RENDERING_ENVIRONMENT_REFS, frozenset())
        for ref in RENDERING_ENVIRONMENT_REFS:
            path_text, separator, anchor = ref.partition('#')
            self.assertEqual(separator, '#')
            self.assertNotEqual(anchor, '')
            document = (REPO_ROOT / path_text).read_text(encoding='utf-8')
            self.assertIn(f'id="{anchor}"', document)

    def test_scalar_values_reconstruct_non_bmp_text_and_reject_surrogates(self) -> None:
        text = chr(0xD840) + chr(0xDC00) + '骨'
        # Python literals can contain a surrogate pair, but the contract accepts
        # Unicode scalar values only; callers must supply the reconstructed text.
        with self.assertRaisesRegex(ContractError, 'surrogate'):
            scalar_values(text)
        scalar_text = '\U00020000骨'
        values = scalar_values(scalar_text)
        self.assertEqual(values, [0x20000, 0x9AA8])
        self.assertEqual(''.join(chr(value) for value in values), scalar_text)

        escaped_pair = json.loads(r'"\ud840\udc00"')
        self.assertEqual(scalar_values(escaped_pair), [0x20000])
        for escaped_lone in (r'"\ud840"', r'"\udc00"'):
            with self.assertRaisesRegex(ContractError, 'surrogate'):
                scalar_values(json.loads(escaped_lone))
        with self.assertRaises(json.JSONDecodeError):
            json.loads(r'"\u12G4"')

        contract_doc = (REPO_ROOT / 'docs/content/unicode-record-contract.md').read_text(encoding='utf-8')
        self.assertIn('valid JSON surrogate pair', contract_doc)

    def test_extraction_covers_same_scalar_pairs_authored_pairs_compatibility_and_vs(self) -> None:
        inventory, records = self.extract()
        categories = {record['category'] for record in records['records']}
        self.assertEqual(
            categories,
            {
                'exact-same-scalar',
                'traditional-simplified',
                'compatibility-normalization',
                'variation-sequence',
            },
        )
        self.assertIn(0x9AA8, [row['scalar'] for row in inventory['scalars']])
        option_evidence = [
            item for item in inventory['evidence']
            if item['field'] == 'japaneseOptions'
        ]
        self.assertEqual([item['jsonPointer'] for item in option_evidence], [
            '/rows/0/japaneseOptions/0',
            '/rows/0/japaneseOptions/1',
        ])
        compatibility = next(
            record for record in records['records']
            if record['category'] == 'compatibility-normalization'
        )
        self.assertEqual(compatibility['leftScalars'], [0xF900])
        self.assertEqual(compatibility['rightScalars'], [0x8C48])
        variation = next(
            record for record in records['records']
            if record['category'] == 'variation-sequence'
        )
        self.assertEqual(variation['leftScalars'], [0x795E, 0xFE00])
        self.assertEqual(variation['rightScalars'], [0x795E])
        for record in records['records']:
            self.assertEqual(record['reviewStatus'], 'mechanical')
            self.assertFalse(record['learnerEligible'])
            self.assertEqual(record['renderingEnvironmentRefs'], [])

    def test_nfc_nfkc_and_scalar_reconstruction_are_validated(self) -> None:
        inventory, records = self.extract()
        record = records['records'][0]
        self.validate_extracted_record(record, inventory)
        bad = copy.deepcopy(record)
        bad['leftNfkcScalars'] = [0]
        with self.assertRaisesRegex(ContractError, 'NFKC'):
            self.validate_extracted_record(bad, inventory)
        bad = copy.deepcopy(record)
        bad['leftScalars'] = [0x41]
        with self.assertRaisesRegex(ContractError, 'reconstruct'):
            self.validate_extracted_record(bad, inventory)

    def test_status_eligibility_caution_and_environment_refs_fail_closed(self) -> None:
        inventory, records = self.extract()
        base = next(
            record for record in records['records']
            if record['category'] == 'traditional-simplified'
            and record['leftScalars'] != record['rightScalars']
        )
        bad = copy.deepcopy(base)
        bad['learnerEligible'] = True
        with self.assertRaisesRegex(ContractError, 'reviewed'):
            self.validate_extracted_record(bad, inventory)
        bad['reviewStatus'] = 'reviewed'
        with self.assertRaisesRegex(ContractError, 'cautionJa'):
            self.validate_extracted_record(bad, inventory)
        bad['cautionJa'] = '簡体字と繁体字の形が異なります。'
        self.validate_extracted_record(bad, inventory)
        same_text_pair = next(
            record for record in records['records']
            if record['category'] == 'traditional-simplified'
            and record['leftScalars'] == record['rightScalars']
        )
        same_text_pair = copy.deepcopy(same_text_pair)
        same_text_pair['reviewStatus'] = 'reviewed'
        same_text_pair['learnerEligible'] = True
        with self.assertRaisesRegex(ContractError, 'cautionJa'):
            self.validate_extracted_record(same_text_pair, inventory)
        stale = copy.deepcopy(base)
        stale['renderingEnvironmentRefs'] = ['missing-environment']
        with self.assertRaisesRegex(ContractError, 'rendering environment'):
            self.validate_extracted_record(stale, inventory)

    def test_category_semantics_provenance_and_pair_statuses_fail_closed(self) -> None:
        inventory, records = self.extract()
        exact = next(record for record in records['records'] if record['category'] == 'exact-same-scalar')
        for false_category in ('compatibility-normalization', 'variation-sequence'):
            bad = copy.deepcopy(exact)
            bad['category'] = false_category
            bad['id'] = deterministic_record_id(false_category, bad['leftScalars'], bad['rightScalars'])
            with self.assertRaisesRegex(ContractError, 'category|compatibility|variation'):
                self.validate_extracted_record(bad, inventory)

        unequal = copy.deepcopy(exact)
        unequal['rightText'] = '學'
        unequal['rightScalars'] = [0x5B78]
        unequal['rightNfcScalars'] = [0x5B78]
        unequal['rightNfkcScalars'] = [0x5B78]
        unequal['id'] = deterministic_record_id(
            unequal['category'], unequal['leftScalars'], unequal['rightScalars']
        )
        with self.assertRaisesRegex(ContractError, 'exact-same-scalar'):
            self.validate_extracted_record(unequal, inventory)

        bad_provenance = copy.deepcopy(exact)
        expected = copy.deepcopy(exact['provenance'])
        bad_provenance['provenance']['sourceManifestSha256'] = '0' * 64
        with self.assertRaisesRegex(ContractError, 'provenance'):
            self.validate_extracted_record(
                bad_provenance,
                inventory,
                expected_provenance=expected,
            )

        pair = next(
            record for record in records['records']
            if record['category'] == 'traditional-simplified'
            and record['leftScalars'] != record['rightScalars']
        )
        evidence = {item['id']: copy.deepcopy(item) for item in inventory['evidence']}
        for ref in pair['evidenceRefs']:
            evidence[ref]['scriptStatus'] = 'generated'
        with self.assertRaisesRegex(ContractError, 'authored|verified|pair'):
            self.validate_extracted_record(pair, inventory, evidence=evidence)

    def test_category_evidence_refs_must_support_every_mechanical_claim(self) -> None:
        inventory, records = self.extract()
        evidence = {item['id']: item for item in inventory['evidence']}

        exact = next(record for record in records['records'] if record['category'] == 'exact-same-scalar')
        scalar = exact['leftScalars'][0]
        japanese_only = next(
            item for item in inventory['evidence']
            if item['language'] == 'ja' and scalar in item['scalars']
        )
        bad_exact = copy.deepcopy(exact)
        bad_exact['evidenceRefs'] = [japanese_only['id']]
        with self.assertRaisesRegex(ContractError, 'Chinese|Japanese|evidence'):
            self.validate_extracted_record(bad_exact, inventory)

        unrelated = next(
            item for item in inventory['evidence']
            if scalar not in item['scalars']
        )
        bad_exact['evidenceRefs'] = [unrelated['id']]
        with self.assertRaisesRegex(ContractError, 'contain|evidence'):
            self.validate_extracted_record(bad_exact, inventory)

        for category in ('compatibility-normalization', 'variation-sequence'):
            record = copy.deepcopy(next(item for item in records['records'] if item['category'] == category))
            record['evidenceRefs'] = [unrelated['id']]
            with self.assertRaisesRegex(ContractError, 'contain|evidence'):
                self.validate_extracted_record(record, inventory)

        pair = next(
            record for record in records['records']
            if record['category'] == 'traditional-simplified'
        )
        bad_pair = copy.deepcopy(pair)
        bad_pair['evidenceRefs'].append(unrelated['id'])
        with self.assertRaisesRegex(ContractError, 'pair|evidence'):
            self.validate_extracted_record(bad_pair, inventory)

    def test_manifest_checksum_is_immutable_and_outputs_are_deterministic(self) -> None:
        first = self.extract()
        second = self.extract()
        self.assertEqual(serialize_json(first[0]), serialize_json(second[0]))
        self.assertEqual(serialize_json(first[1]), serialize_json(second[1]))
        self.source_path.write_text('{}\n', encoding='utf-8')
        with self.assertRaisesRegex(ContractError, 'checksum'):
            self.extract()

    def test_dataset_reconciles_occurrences_evidence_and_unique_ids(self) -> None:
        inventory, records = self.extract()
        validate_dataset(self.manifest_path, inventory, records, repo_root=self.root)
        duplicate = copy.deepcopy(records)
        duplicate['records'].append(copy.deepcopy(duplicate['records'][0]))
        with self.assertRaisesRegex(ContractError, 'duplicate record id'):
            validate_dataset(self.manifest_path, inventory, duplicate, repo_root=self.root)
        stale = copy.deepcopy(records)
        stale['records'][0]['evidenceRefs'] = ['missing-evidence']
        with self.assertRaisesRegex(ContractError, 'evidence'):
            validate_dataset(self.manifest_path, inventory, stale, repo_root=self.root)
        duplicate_evidence = copy.deepcopy(inventory)
        duplicate_evidence['evidence'].append(copy.deepcopy(duplicate_evidence['evidence'][0]))
        with self.assertRaisesRegex(ContractError, 'duplicate evidence id'):
            validate_dataset(self.manifest_path, duplicate_evidence, records, repo_root=self.root)
        malformed_evidence = copy.deepcopy(inventory)
        malformed_evidence['evidence'][0]['scalars'] = [0xD800]
        with self.assertRaisesRegex(ContractError, 'surrogate|reconstruct'):
            validate_dataset(self.manifest_path, malformed_evidence, records, repo_root=self.root)

    def test_transaction_rolls_back_all_outputs_after_partial_publication(self) -> None:
        inventory, records = self.extract()
        output_dir = self.root / 'published'
        output_dir.mkdir()
        inventory_path = output_dir / 'scalar-inventory.json'
        records_path = output_dir / 'mechanical-records.json'
        inventory_path.write_bytes(b'old-inventory\n')
        records_path.write_bytes(b'old-records\n')
        unrelated_path = output_dir / 'developer-notes.txt'
        unrelated_path.write_bytes(b'preserve me\n')

        def fail_after_first_replace(replaced: int) -> None:
            if replaced == 1:
                raise RuntimeError('injected publication failure')

        with self.assertRaisesRegex(RuntimeError, 'injected'):
            publish_dataset(
                output_dir,
                inventory,
                records,
                after_replace=fail_after_first_replace,
            )
        self.assertEqual(inventory_path.read_bytes(), b'old-inventory\n')
        self.assertEqual(records_path.read_bytes(), b'old-records\n')
        self.assertEqual(unrelated_path.read_bytes(), b'preserve me\n')

    def test_documented_cli_write_check_and_validator_contract(self) -> None:
        output_dir = self.root / 'generated'
        common = [
            '--manifest', str(self.manifest_path),
            '--repo-root', str(self.root),
            '--output-dir', str(output_dir),
        ]
        write = subprocess.run(
            [sys.executable, 'scripts/extract_unicode_data.py', *common, '--write'],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(write.returncode, 0, write.stderr)
        self.assertTrue((output_dir / 'scalar-inventory.json').is_file())
        self.assertTrue((output_dir / 'mechanical-records.json').is_file())
        check = subprocess.run(
            [sys.executable, 'scripts/extract_unicode_data.py', *common, '--check'],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(check.returncode, 0, check.stderr)
        validate = subprocess.run(
            [
                sys.executable,
                'scripts/validate_unicode_data.py',
                '--manifest', str(self.manifest_path),
                '--repo-root', str(self.root),
                '--inventory', str(output_dir / 'scalar-inventory.json'),
                '--records', str(output_dir / 'mechanical-records.json'),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(validate.returncode, 0, validate.stderr)
        (output_dir / 'mechanical-records.json').write_text('{}\n', encoding='utf-8')
        drift = subprocess.run(
            [sys.executable, 'scripts/extract_unicode_data.py', *common, '--check'],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(drift.returncode, 0)
        self.assertIn('drift', drift.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
