#!/usr/bin/env python3
"""Generate or drift-check the Issue #260 mechanical Unicode dataset."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from unicode_contract import (
    ContractError,
    extract_dataset,
    publish_dataset,
    serialize_json,
    validate_dataset,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / 'data/unicode/source-manifest.json'
DEFAULT_OUTPUT_DIR = REPO_ROOT / 'data/unicode/generated'


def main() -> int:
    parser = argparse.ArgumentParser(description='Extract the deterministic #260 Unicode dataset')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true', help='transactionally publish both generated files')
    mode.add_argument('--check', action='store_true', help='fail if committed output differs from a fresh extraction')
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument('--repo-root', type=Path, default=REPO_ROOT)
    args = parser.parse_args()
    try:
        inventory, records = extract_dataset(args.manifest, repo_root=args.repo_root)
        validate_dataset(args.manifest, inventory, records, repo_root=args.repo_root)
        if args.write:
            publish_dataset(args.output_dir, inventory, records)
            print(json.dumps({
                'uniqueHanScalars': inventory['totals']['uniqueHanScalars'],
                'occurrences': inventory['totals']['occurrences'],
                'records': records['totals']['records'],
            }, ensure_ascii=False, sort_keys=True))
            return 0
        for filename, payload in (
            ('scalar-inventory.json', inventory),
            ('mechanical-records.json', records),
        ):
            path = args.output_dir / filename
            if not path.is_file() or path.read_bytes() != serialize_json(payload):
                raise ContractError(f'generated output drift: {path}')
        print('Unicode generated data is current')
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as error:
        print(f'Unicode extraction failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
