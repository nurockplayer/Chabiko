#!/usr/bin/env bash
# Content-validation gate (T3) and the affected validator for content/data
# changes (T1). Mirrors the CI `content` job exactly, so the same checks run
# locally via `pnpm validate:content` and in CI without drift.
#
# 1. Validator self-tests prove each validator's own behavior (per AGENTS.md:
#    documented workflow commands must assert their own behavior).
# 2. Checked-in content is validated against the pain-point / script-status /
#    content-schema contracts, and the learner manifest is drift-gated
#    (byte-identical to a fresh generation from the preview corpus).
set -euo pipefail

uv run --locked python scripts/validate-pain-points.py
uv run --locked python scripts/validate-script-status.py
uv run --locked python scripts/validate-content-schema.py

# Byte-identity drift gate: fails if the committed learner manifest does not
# match a fresh generation from the preview corpus.
uv run --locked python scripts/build-teacher-learner-manifest.py --test

# Validate checked-in content.
for f in data/examples/valid/*.json; do
  uv run --locked python scripts/validate-pain-points.py --check "$f"
  uv run --locked python scripts/validate-script-status.py --check "$f"
  uv run --locked python scripts/validate-content-schema.py --check "$f"
done

# Roleplay card per-scenario files (Issue #243): the ownership boundary
# (file name → card scenario) is enforced by --check.
for f in data/roleplay/*.json; do
  uv run --locked python scripts/validate-content-schema.py --check "$f"
done
