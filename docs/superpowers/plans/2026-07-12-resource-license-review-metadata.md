# Resource License Review Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus PR #37 to resource license-review metadata validation only.

**Architecture:** Retain the resource schema's review metadata fields and one resource-specific metadata validator. Reuse `_check_resource_url` for `licenseUrl`, adding only hostname validation already used by `url` and `canonicalUrl`. Remove permission policy fields, `_check_resource_policy`, duplicate-ID collection state, and their fixtures/tests so this PR stays a first slice of #36.

**Tech Stack:** Python 3.14+, `uv`, standard library `datetime` and `urllib.parse`, JSON fixtures, Markdown.

## Global Constraints

- Keep only `licenseName`, `licenseUrl`, `attributionRequired`, `reviewedBy`, and `reviewedDate` from the new metadata fields.
- Do not create a new PR or merge; update existing draft PR #37 only.
- `licenseUrl` requires non-empty `licenseName` and passes the same scheme/hostname validation as `url` and `canonicalUrl`.
- `attributionRequired=True` requires non-empty `attributionInstructions`.
- `reviewedDate` requires non-empty `reviewedBy`; approved/rejected resource reviews require both fields; dates must be real ISO `YYYY-MM-DD` calendar dates.
- An explicitly present `attributionRequired` must be a real boolean; reject `null`, integers, and strings.
- Existing candidate registry records without all optional metadata remain valid.
- Remove permission fields/policy, duplicate-ID handling, and related tests/fixtures. Do not change unrelated code.

---

### Task 1: Add failing metadata-slice tests

**Files:**
- Modify: `scripts/validate-content-schema.py`

- [ ] Add tests for `licenseUrl` without `licenseName`, invalid `licenseUrl` hostname, `reviewedDate` without reviewer, approved/rejected review without both metadata fields, invalid dates (`2026-02-29`, `2026-13-01`, `20260712`), and present non-booleans for `attributionRequired` (`None`, `1`, `"true"`).
- [ ] Run `uv run python scripts/validate-content-schema.py` and confirm each new behavior test fails because no metadata validator enforces it yet.

### Task 2: Implement minimal metadata validation and remove deferred policy

**Files:**
- Modify: `scripts/validate-content-schema.py`

- [ ] Add `licenseUrl` to `_check_resource_url`.
- [ ] Replace `_check_resource_policy` with `_check_resource_review_metadata`, enforcing the exact rules in Global Constraints with `date.fromisoformat` plus an exact `YYYY-MM-DD` round-trip.
- [ ] Keep `attributionRequired` as the only optional boolean and reject every present non-`bool` value.
- [ ] Remove permission fields, policy tests, and duplicate-resource-ID code/tests; register only retained metadata tests.
- [ ] Run the validator until all tests pass.

### Task 3: Refocus fixtures, documentation, and PR body

**Files:**
- Modify: `data/examples/valid/resources.json`
- Delete: `data/examples/invalid/17-resource-policy-conflict.json`
- Delete: `data/examples/invalid/18-resource-duplicate-ids.json`
- Modify: `docs/content/content-model-draft.md`
- Update: GitHub PR #37 body

- [ ] Remove permission fields from the valid fixture while retaining a valid metadata example.
- [ ] Document only the retained metadata rules and URL behavior.
- [ ] Validate the candidate registry and all valid fixtures; confirm removed invalid fixtures no longer exist.
- [ ] Update PR #37 body to use `Refs #36`, list deferred permission policy and duplicate-ID work, remove `Closes #36`, and state exact commands/results.

### Task 4: Verify and publish the refocused branch

- [ ] Run all three validator suites, all valid bundle checks, and `rtk git diff --check`.
- [ ] Confirm `origin/main...HEAD` changes only the validator, valid resource fixture, and content-model documentation.
- [ ] Commit scoped changes, push the existing `codex/resource-license-guardrails` branch with `--force-with-lease` if history changed, and verify PR #37 remains draft with the updated body.
