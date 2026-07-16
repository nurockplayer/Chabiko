# Resource License Policy Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the resource schema and validator with explicit license-policy permissions, review workflow metadata, cross-field guardrails, URL host validation, and duplicate resource-ID detection.

**Architecture:** Keep the existing zero-dependency, single-file Python validator as the executable contract. Add the new resource fields as optional schema fields, isolate policy rules in a dedicated `_check_resource_policy` validator, and perform duplicate-ID checks at resource-collection scope in `validate_bundle`. Update one valid fixture and two invalid fixtures so the CLI path exercises the new contract without changing existing candidate-resource semantics.

**Tech Stack:** Python 3.14+, `uv`, standard-library `urllib.parse`, JSON fixtures, Markdown content-model documentation.

## Global Constraints

- Use `uv run python` for every Python validation command.
- Do not add a dependency; URL parsing must use the Python standard library.
- Preserve all existing resource entries and their `needs-review` / `reference-only` / `candidate` conservative defaults.
- Production-import permission is never allowed to become true for `unknown`, `needs-review`, or `prohibited` license statuses.
- Existing resource records remain valid when the new optional fields are absent.
- Keep the change within GitHub Issue #36; do not modify UI, CI, package-manager files, or external resource content.

---

### Task 1: Extend the resource schema with policy and review fields

**Files:**
- Modify: `scripts/validate-content-schema.py:437-465`
- Test: `scripts/validate-content-schema.py` resource tests near `_minimal_resource`

**Interfaces:**
- Consumes: existing `SCHEMAS["resource"]` field lists and controlled vocabularies.
- Produces: optional resource fields with exact names and Python types:
  `productionImportAllowed`, `commercialUseAllowed`, `modificationAllowed`,
  `redistributionAllowed`, `attributionRequired`, `licenseName`, `licenseUrl`,
  `reviewedBy`, and `reviewedDate`.

- [ ] **Step 1: Add a valid optional-field fixture case**

Extend `_minimal_resource()` with no new defaults; add a focused test that passes all optional fields explicitly:

```python
def test_resource_policy_fields_valid():
    record = _minimal_resource(
        productionImportAllowed=False,
        commercialUseAllowed=False,
        modificationAllowed=False,
        redistributionAllowed=False,
        attributionRequired=True,
        attributionInstructions="Credit the source owner.",
        licenseName="Example License",
        licenseUrl="https://example.org/license",
        reviewedBy="content-reviewer",
        reviewedDate="2026-07-12",
    )
    _assert_no_errors(validate_single(record, "resource"), "resource_policy_fields_valid")
```

- [ ] **Step 2: Run the focused baseline test command**

Run: `uv run python scripts/validate-content-schema.py`

Expected: the new test fails with an `unknown field` error for the first new field.

- [ ] **Step 3: Add the nine fields to the resource schema optional list and type map**

Add these exact entries to `SCHEMAS["resource"]["optional"]` and `field_types`:

```python
"productionImportAllowed", "commercialUseAllowed",
"modificationAllowed", "redistributionAllowed",
"attributionRequired", "licenseName", "licenseUrl",
"reviewedBy", "reviewedDate",
```

Use `bool` for the five `*Allowed` / `attributionRequired` fields and `str` for the four metadata fields. Keep `attributionInstructions` as the existing optional string.

- [ ] **Step 4: Run the validator self-tests**

Run: `uv run python scripts/validate-content-schema.py`

Expected: all tests pass, including `test_resource_policy_fields_valid`.

- [ ] **Step 5: Commit the schema-only change**

Run: `git add scripts/validate-content-schema.py && git commit -m "feat: extend resource policy schema"`

Expected: one commit containing only the validator schema and its focused valid-field test.

### Task 2: Add cross-field resource policy validation

**Files:**
- Modify: `scripts/validate-content-schema.py` near `_check_resource_url` and the resource `extra_validators` list
- Test: `scripts/validate-content-schema.py` resource tests near `test_resource_policy_fields_valid`

**Interfaces:**
- Consumes: the optional policy fields from Task 1 and existing `licenseStatus`, `allowedUse`, and `reviewStatus` values.
- Produces: `_check_resource_policy(record: dict, path: str) -> list[str]`, registered after `_check_resource_url`.

- [ ] **Step 1: Write failing tests for every policy rule**

Add these cases:

```python
def test_resource_production_import_requires_approved_license():
    errs = validate_single(_minimal_resource(productionImportAllowed=True), "resource")
    _assert_has_error(errs, "productionImportAllowed", "resource_import_needs_license")

def test_resource_production_import_allowed_for_restricted_license():
    errs = validate_single(
        _minimal_resource(licenseStatus="restricted", productionImportAllowed=True),
        "resource",
    )
    _assert_no_errors(errs, "resource_import_restricted_license")

def test_resource_approved_review_requires_approved_license():
    errs = validate_single(
        _minimal_resource(reviewStatus="approved", licenseStatus="needs-review"),
        "resource",
    )
    _assert_has_error(errs, "reviewStatus", "resource_approved_review_needs_license")

def test_resource_prohibited_license_blocks_permission_flags():
    errs = validate_single(
        _minimal_resource(licenseStatus="prohibited", modificationAllowed=True),
        "resource",
    )
    _assert_has_error(errs, "modificationAllowed", "resource_prohibited_permission")

def test_resource_rejected_review_blocks_permission_flags():
    errs = validate_single(
        _minimal_resource(reviewStatus="rejected", commercialUseAllowed=True),
        "resource",
    )
    _assert_has_error(errs, "commercialUseAllowed", "resource_rejected_permission")

def test_resource_unreviewed_license_blocks_non_reference_permissions():
    errs = validate_single(
        _minimal_resource(licenseStatus="unknown", redistributionAllowed=True),
        "resource",
    )
    _assert_has_error(errs, "redistributionAllowed", "resource_unknown_permission")

def test_resource_attribution_required_needs_instructions():
    errs = validate_single(_minimal_resource(attributionRequired=True), "resource")
    _assert_has_error(errs, "attributionInstructions", "resource_attribution_instructions")
```

- [ ] **Step 2: Run the self-tests and verify the new tests fail**

Run: `uv run python scripts/validate-content-schema.py`

Expected: each new test fails because no policy validator exists yet.

- [ ] **Step 3: Implement `_check_resource_policy` with one rule per branch**

Implement these exact rules:

1. `productionImportAllowed=True` requires `licenseStatus` in `{"approved", "restricted"}`.
2. `reviewStatus="approved"` requires `licenseStatus` not in `{"unknown", "needs-review"}`.
3. `attributionRequired=True` requires a non-empty `attributionInstructions` string.
4. `licenseStatus` in `{"unknown", "needs-review", "prohibited"}` or `reviewStatus="rejected"` requires all four permission booleans to be false or absent: `productionImportAllowed`, `commercialUseAllowed`, `modificationAllowed`, and `redistributionAllowed`.
5. Do not infer permission from `allowedUse`; the explicit boolean fields are the policy source, while the existing `allowedUse` controlled vocabulary remains independently validated.

Each error must include the offending field name and the relevant status so fixture and test failures remain actionable.

- [ ] **Step 4: Register the policy validator and run tests**

Add `_check_resource_policy` to the resource `extra_validators` list after `_check_resource_url`.

Run: `uv run python scripts/validate-content-schema.py`

Expected: all existing tests and all new policy tests pass.

- [ ] **Step 5: Commit the policy validator**

Run: `git add scripts/validate-content-schema.py && git commit -m "feat: enforce resource license policy guardrails"`

Expected: one commit containing the cross-field validator and policy tests.

### Task 3: Add resource URL host and duplicate-ID validation

**Files:**
- Modify: `scripts/validate-content-schema.py` in `_check_resource_url` and `validate_bundle`
- Test: `scripts/validate-content-schema.py` resource tests

**Interfaces:**
- Consumes: resource `url` and optional `canonicalUrl` values, plus each resource collection's `id`.
- Produces: host-aware URL validation and duplicate-ID errors scoped to `resources`.

- [ ] **Step 1: Add failing tests**

Add:

```python
def test_resource_url_without_hostname_fails():
    errs = validate_single(_minimal_resource(url="https://"), "resource")
    _assert_has_error(errs, "hostname", "resource_url_no_hostname")

def test_resource_invalid_relevance_values_fail():
    for field, value in (
        ("languageRelevance", "invalid"),
        ("regionalRelevance", "invalid"),
        ("scriptRelevance", "invalid"),
    ):
        errs = validate_single(_minimal_resource(**{field: value}), "resource")
        _assert_has_error(errs, "not valid", f"resource_{field}_invalid")

def test_resource_duplicate_ids_fail():
    data = {"resources": [_minimal_resource(), _minimal_resource()]}
    errs = validate_bundle(data)
    _assert_has_error(errs, "duplicate resource id", "resource_duplicate_id")
```

- [ ] **Step 2: Run tests and verify the new coverage**

Run: `uv run python scripts/validate-content-schema.py`

Expected: the hostname and duplicate-ID tests fail before implementation; the three relevance tests pass immediately because the controlled-field mechanism already exists, proving the new coverage closes a test gap without requiring new validation logic.

- [ ] **Step 3: Implement host validation with the standard library**

Import `urlparse` from `urllib.parse`. In `_check_resource_url`, retain the existing `http://` / `https://` scheme check, then parse each non-null URL and require `parsed.hostname` to be non-empty. Catch `ValueError` from malformed URLs and report the same field-specific host error. Apply the same rule to `canonicalUrl` when present.

- [ ] **Step 4: Implement duplicate resource-ID detection**

In `validate_bundle`, before validating resource entries, maintain a `seen_resource_ids` set for the `resources` collection. For each dictionary with a string `id`, emit `root.resources[index]: duplicate resource id '<id>'` when the ID has already appeared. Do not apply this check across unrelated collections, and do not suppress the existing per-item schema errors.

- [ ] **Step 5: Run the complete validator and focused registry checks**

Run:

```bash
uv run python scripts/validate-content-schema.py
uv run python scripts/validate-content-schema.py --check data/resources/candidate-resources.json
```

Expected: all self-tests pass and the existing candidate registry exits 0.

- [ ] **Step 6: Commit URL and uniqueness validation**

Run: `git add scripts/validate-content-schema.py && git commit -m "test: validate resource URLs and duplicate IDs"`

Expected: one commit containing URL/uniqueness implementation and regression tests.

### Task 4: Update executable fixtures and content-model documentation

**Files:**
- Modify: `data/examples/valid/resources.json`
- Create: `data/examples/invalid/17-resource-policy-conflict.json`
- Create: `data/examples/invalid/18-resource-duplicate-ids.json`
- Modify: `docs/content/content-model-draft.md` Resource section near lines 205-221

**Interfaces:**
- Consumes: the final schema and policy rules from Tasks 1–3.
- Produces: reviewable examples and a documented resource contract for future authors.

- [ ] **Step 1: Add optional policy metadata to the valid fixture**

Add the nine optional fields to the existing valid resource using a conservative record: all four permission booleans false, `attributionRequired: true` with non-empty `attributionInstructions`, and string license/reviewer metadata.

- [ ] **Step 2: Add an invalid policy fixture**

Create `17-resource-policy-conflict.json` with one resource that has `licenseStatus: "needs-review"`, `productionImportAllowed: true`, and otherwise valid required fields. The CLI must reject it through `_check_resource_policy`.

- [ ] **Step 3: Add an invalid duplicate-ID fixture**

Create `18-resource-duplicate-ids.json` with two otherwise valid resource objects sharing the same `id`. The CLI must reject it with the collection-level duplicate-ID error.

- [ ] **Step 4: Document fields and guardrails**

Extend the Resource section with the nine optional fields and a short “Policy validation” subsection documenting:

- production import requires `approved` or `restricted` license status;
- approved review status cannot use `unknown` or `needs-review` license status;
- prohibited/unreviewed/rejected resources cannot grant non-reference permission flags;
- `attributionRequired` requires `attributionInstructions`;
- resource IDs must be unique within the resource registry;
- URLs must have `http`/`https` schemes and a hostname.

- [ ] **Step 5: Validate all resource fixtures**

Run:

```bash
uv run python scripts/validate-content-schema.py --check data/examples/valid/resources.json
uv run python scripts/validate-content-schema.py --check data/resources/candidate-resources.json
uv run python scripts/validate-content-schema.py --check data/examples/invalid/17-resource-policy-conflict.json
uv run python scripts/validate-content-schema.py --check data/examples/invalid/18-resource-duplicate-ids.json
```

Expected: the two valid files exit 0; the two invalid files exit 1 and print the intended guardrail error.

- [ ] **Step 6: Commit fixtures and documentation**

Run: `git add data/examples/valid/resources.json data/examples/invalid/17-resource-policy-conflict.json data/examples/invalid/18-resource-duplicate-ids.json docs/content/content-model-draft.md && git commit -m "docs: document resource license guardrails"`

Expected: one commit containing only resource examples and the content-model documentation.

### Task 5: Full verification and handoff

**Files:**
- Verify: `scripts/validate-content-schema.py`, all `data/examples/valid/*.json`, `data/resources/candidate-resources.json`

- [ ] **Step 1: Run all zero-dependency validators**

Run:

```bash
uv run python scripts/validate-pain-points.py
uv run python scripts/validate-script-status.py
uv run python scripts/validate-content-schema.py
```

Expected: all three commands exit 0.

- [ ] **Step 2: Validate every valid seed bundle**

Run each existing `data/examples/valid/*.json` file with `uv run python scripts/validate-content-schema.py --check <file>`, plus `data/resources/candidate-resources.json`.

Expected: every command exits 0.

- [ ] **Step 3: Check the diff and changed-file scope**

Run:

```bash
rtk git diff --check
rtk git status --short
```

Expected: no whitespace errors and only the validator, resource fixtures, and content-model documentation are changed by this issue.

- [ ] **Step 4: Report acceptance coverage**

Confirm in the PR description that all deferred fields are optional, existing entries remain valid, cross-field policy rules are enforced, duplicate IDs and URL hosts are checked, and valid/invalid fixtures exercise the new behavior. Explicitly state that UI, CI, package-manager changes, external data imports, and high-impact automation remain out of scope.

## Self-review checklist

- Spec coverage: Tasks 1–2 cover every deferred schema field and each cross-field guardrail; Task 3 covers URL host validation, relevance-field test coverage, and duplicate IDs; Task 4 covers fixtures and documentation; Task 5 covers all acceptance verification.
- Placeholder scan: no unresolved placeholder markers or unspecified behavior remain in the implementation steps.
- Type consistency: all new fields have explicit names/types, `_check_resource_policy` is registered in the resource schema, and collection-level duplicate detection is kept in `validate_bundle`.
- Baseline evidence: before implementation, `uv run python scripts/validate-content-schema.py` passed all 71 existing tests and the candidate registry check exited 0.
