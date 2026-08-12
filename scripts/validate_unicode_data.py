#!/usr/bin/env python3
"""Validate committed Issue #260 Unicode outputs against their immutable sources."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from unicode_contract import ContractError, validate_dataset


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / 'data/unicode/source-manifest.json'
DEFAULT_INVENTORY = REPO_ROOT / 'data/unicode/generated/scalar-inventory.json'
DEFAULT_RECORDS = REPO_ROOT / 'data/unicode/generated/mechanical-records.json'


def _read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise ContractError(f'{path} must contain a JSON object')
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate the #260 Unicode dataset')
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--inventory', type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument('--records', type=Path, default=DEFAULT_RECORDS)
    parser.add_argument('--repo-root', type=Path, default=REPO_ROOT)
    args = parser.parse_args()
    try:
        inventory = _read_json(args.inventory)
        records = _read_json(args.records)
        validate_dataset(args.manifest, inventory, records, repo_root=args.repo_root)
        print('Unicode dataset is valid')
        return 0
    except (ContractError, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(f'Unicode validation failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
