# Cross-Cutting Change Playbook

This playbook defines a reusable workflow for cross-cutting changes: how to freeze the complete contract surface before implementation, produce auditable completion evidence, and have the final reviewer converge findings across the whole surface. It is independent of any specific Direction or issue.

Source: the scope of Issue #198 and the repeated review history of Issue #193 / PR #196. Incident-specific details remain in #193 and PR #196; this document preserves only reusable rules.

## 1. Cross-cutting classification triggers

Before implementation, use this checklist to determine whether a change is cross-cutting. A change that affects at least two categories is cross-cutting:

- asset paths, generated files, or migration;
- schema, state, or metadata contracts;
- generator, importer, rebuild script, or legacy compatibility paths;
- build, deployment, pruning, `.gitignore`, or cleanup behavior;
- rights, license, attribution, or provenance;
- multiple runtime consumers such as loader, UI, API, validator, and tests;
- large committed generated output.

A change that affects only one file or one local mechanism does not require an Impact Map and should use the normal lightweight workflow.

## 2. Impact Map template

Before implementation, produce a concise Impact Map and freeze every surface below. If any surface is unknown or still requires a product decision, stop and report it instead of guessing.

```text
# Impact Map — <issue title>

## Writers
- <every source that writes the affected path/data/state, including generators, importers, manual edits, and test fixtures>

## Consumers
- <every consumer that reads or depends on the path/schema/state: data files, loaders, validators, UI, APIs, tests>

## Legacy paths
- <legacy writers, old paths, compatibility layers; before removing a safety mechanism confirm no other writer still depends on it>

## Canonical workflow
- <official rebuild or migration commands and order, such as the canonical build command>

## Boundaries
- <Git, build, deployment, .gitignore, pruning, and cleanup limits; test cleanup removes only files/directories created by that test>

## Rights / provenance
- <license, attribution, and provenance requirements plus their repository source: ADR, rights record, product-owner decision>

## Clean / dirty environment
- <expected behavior and failure cases in clean and dirty environments>
```

## 3. Requirement → Diff → Test Evidence matrix

Every frozen requirement must map to a changed file/artifact, validation, and observed result in the completion report. Do not claim a requirement is complete without evidence.

```text
| # | Frozen requirement | Changed file/artifact | Validation | Observed result |
| --- | --- | --- | --- | --- |
| 1 | <contract frozen by issue> | <matching diff path or generated output> | <focused test or validation> | <pass/fail and key value> |
```

## 4. Writer / consumer / legacy-path search guidance

Before changing a cross-file contract or safety mechanism, inventory the complete surface first. Search at least for:

- **writers:** every direct writer to the affected path/data/state, including generators, importers, build integration, manual writes, and fixtures;
- **consumers:** data files, loaders, validators, UI, APIs, and tests that read or depend on the contract;
- **legacy compatibility paths:** old paths, old state, old labels, retired guards, and remaining references;
- **stale assumptions:** old assumptions about a frozen contract that may remain in documentation, ADRs, tests, or generated output.

Before removing or narrowing a safety mechanism such as a build guard, `.gitignore` rule, or validation gate, confirm that no other writer still depends on it.

## 5. Canonical workflow validation

- A documented workflow command must have a self-test that asserts the command's behavior, not only the functions it invokes.
- For generators, builds, migrations, or cleanup, validate the canonical command itself. For example, a rebuild should prove the serialized corpus and committed metadata remain consistent.
- When reuse or provenance is involved, rerunning the canonical command must not silently alter an already accepted state. For example, accepted-AI reuse must fail closed unless committed `promptDigest`, `generationRevision`, and `referenceSetIds` match the current frozen prompt contract.

## 6. Clean / dirty environment tests

Any change involving files, directories, generators, builds, migrations, or cleanup must verify both clean and dirty environments:

- **clean environment:** the canonical workflow succeeds from a fresh checkout or controlled fixture;
- **dirty environment:** when the workspace also contains another developer's files, build/prune/cleanup/migration behavior does not delete or overwrite content not owned by this change.

Cleanup rules:

- Regression-test cleanup removes only files and directories created by that test. A directory may be removed only if the test itself created it and it is empty.
- Migrations, pruners, and stale-generated-artifact cleanup may delete only when ownership is established through an explicit managed path, manifest, metadata record, or allowlist. For example, a canonical rebuild can record the paths it owns and a pruner can delete only from that list.
- Developer-owned files outside the managed set must always be preserved, even if they appear duplicated or stale.

## 7. Rights / provenance consistency

- Every committed asset and metadata record must trace its rights, license, attribution, and provenance to repository evidence such as an ADR, rights file, product-owner decision, or commit.
- Generated output, such as a preview corpus, must not contradict committed metadata or rights contracts.
- For reuse, provenance fields such as `promptDigest`, `generationRevision`, and `referenceSetIds` must match the frozen contract.

## 8. Repository-wide final reviewer checklist

The final read-only reviewer checks the complete contract surface, not only the last follow-up diff. At minimum verify:

- all known writers and consumers were inventoried and synchronized;
- no stale path, state, metadata, or documentation remains;
- the canonical rebuild/migration workflow is correct and validated;
- destructive cleanup and dirty-environment behavior are safe;
- rights/license/provenance remain consistent;
- generated output and committed metadata agree;
- negative-drift tests and fail-closed behavior exist and work.

Except for an immediate P0/P1 safety or data-loss interruption, the reviewer should complete the full contract-surface scan and aggregate all findings into one review result or follow-up plan. The coordinator then groups findings by root cause, implementation mechanism, primary changed files, and validation boundary. Only findings that meet the `Flash Task-Size Gate` merge criteria may share one bounded implementation cycle; unrelated findings are handled as separate bounded cycles on the same branch/PR.

## 9. Worked example — Issue #193 / PR #196

PR #196 went through repeated follow-ups because the initial implementation and review validated only the final asset state without first mapping the complete contract surface. The reusable lessons are:

- **Legacy writer:** `pruneLocalOnlyAssets()` removed tracked teacher derivatives during cleanup, while an old local guard omitted the legacy `public/assets/dev/` source, allowing legacy assets into deployment.
  → Inventory every writer before removing a safety mechanism. The replacement `pruneDevAssets()` removes only build-generated `dist/assets/dev/` and never touches deployable directories.
- **Schema/loader consumer:** after changing the `rights.status` contract, a learner loader still rejected the new state, or the contract added `approved` without synchronizing validator/UI behavior.
  → A cross-file contract change must update all consumers in the same change: data, loader, validator, UI, and tests.
- **Canonical rebuild command:** a documented build command omitted `--reuse-accepted-ai-assets`, causing 432 accepted AI assets to degrade back to `ai-pending` when rebuilt.
  → Self-test the canonical command itself so a rebuild cannot silently change accepted state.
- **Dirty-environment cleanup:** a build regression test deleted developer-owned dev assets from a workspace containing unrelated files.
  → Test cleanup removes only what the test created, and removes a directory only when the test created that now-empty directory.
- **Rights/provenance:** accepted-AI reuse must compare committed `promptDigest`, `generationRevision`, and `referenceSetIds` with the frozen prompt contract and fail closed when they do not match.
  → Provenance consistency with the frozen contract is part of acceptance.

Every frozen requirement must map to diff and validation evidence. Reviewing only the final state without mapping the complete surface is what allows these defects to appear one layer at a time.
