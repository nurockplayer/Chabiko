# Unicode Visual Review v0.2.1 Harness

Issue #477 implements deterministic controller tooling for the frozen #338
v0.2.1 review contract. It does not generate a sealed calibration key, inspect
pixels as a reviewer, infer a visual outcome, or authorize learner content by
writing a JSON file.

This is a controller-facing technical document. All paths below are examples
and must be absolute paths outside every worktree for this repository.

## Current status and hard boundary

No actual v0.2.1 calibration has been performed. A real calibration still
requires all of the following:

- a sealed external 72-item key made by the authorized calibration authority;
- a trusted vision-capable reviewer path that has received the current pinned
  pixels under the blind schema;
- complete current original glyph inputs and their validated #262 authority;
- real Reviewer A results and their transport receipt.

Synthetic fixtures only exercise parser, binding, and failure behavior. They
are not visual inspection, calibration evidence, a substitute key, or #338
acceptance evidence. Historical diagnostic labels and perceptual metadata are
not input to this harness.

The workflow adapter below is deterministic controller tooling. It still cannot
replace the external key, external pixel review, or a current trusted transport
receipt with a local fixture or a persisted PASS record.

## Trust boundaries

| Boundary | Trusted input | Prohibited disclosure or substitution |
| --- | --- | --- |
| Canonical authority | Current validated #262 generated manifest, plan, and renderer contract | Old diagnostic labels, candidate heuristics, or a caller-created authority |
| Controller inputs | External original pinned glyph PNGs and controller identifiers | Repository paths, arbitrary bytes, duplicate candidate/control identities |
| Reviewer bundle | Opaque `pairRef`, `pairs/<pairRef>.png` only | Candidate IDs, glyph text or code points, checksums, source heuristics, expected outcomes, key classes, namespace salt, sidecar |
| Controller sidecar | Candidate/checksum/batch/evidence bindings | Delivery to the blind reviewer before classification |
| Sealed key | External calibration authority | Harness-generated labels or reuse of pre-v0.2.1 diagnostic labels |
| Vision receipt | Trusted transport attestation bound to exact pixels and results | A non-vision model, OCR, text reconstruction, or a claim without pixel evidence |
| Authorization | In-memory evaluator-issued capability | Persisted PASS JSON, a JSON clone, a caller-built object, or a replay binding |

Every external read and output must use an absolute path outside this repository
and every worktree of this repository. Outputs are exclusive: the tooling will
not overwrite an existing artifact or reuse an existing output directory.

Workflow destinations are also role-isolated before any journal mutation. Every
known wave reviewer directory, controller directory, and journal directory must
be pairwise disjoint; a common external parent with sibling paths is allowed.
They must also be disjoint from the stored calibration reviewer/controller
directories. A status JSON may not be inside any immutable reviewer/controller
artifact directory or journal. A Reviewer B or Pass B subset directory may not
overlap any of those roots, the status file, or a controller input, key,
descriptor, sidecar, or contract. These checks prevent controller records from
being written into pixels-and-opaque-refs-only reviewer trees.

## Pixels and opaque evidence artifacts

The controller decodes external source PNGs to exact pinned 64×64 grayscale
tiles and checks their expected derivative SHA-256 values. It renders a fixed
128×64 grayscale comparison PNG from two verified tiles. The PNG decoder and
renderer reject malformed chunks, checksum failures, unexpected dimensions,
unsupported transparency/color handling, decompression defects, and derivative
checksum mismatch.

`buildBlindEvidenceArtifacts` derives each `pairRef` from the protocol version,
the controller-only namespace salt, and the controller-side binding. It sorts
both `reviewerBundle.items` and `controllerSidecar.entries` by that opaque ref.
The ordering prevents caller ordering from revealing a calibration class or
sentinel position. The same namespace salt and the same controller inputs yield
the same refs and artifact order; the salt itself never appears in the reviewer
bundle.

`validateAuthoritativeBlindEvidenceArtifacts` accepts controller inputs in any
order. It rederives a unique ref for every input, requires exact one-to-one
coverage of sidecar entries and local PNGs, and verifies each stored PNG against
the re-rendered bytes. It rejects duplicate inputs, omitted entries, unmatched
PNGs, stale sidecars, reordered bundle/sidecar artifacts, and malformed refs.

## Bundle command

The only current bundle command is:

```bash
pnpm exec node scripts/run_unicode_review_v021.ts bundle \
  --input /absolute/external/v021-bundle-input.json \
  --reviewer-output /absolute/external/v021-reviewer-output \
  --controller-output /absolute/external/v021-controller-output \
  --namespace-salt <64-lowercase-hex>
```

`--namespace-salt` is optional. If omitted, the controller generates a fresh
32-byte salt. The reviewer and controller output directories must be distinct,
non-nested, fresh, and external. The input file may not be nested in either
output directory.

The controller-only input schema is exactly one object with `items`. Each item
is one of these exact shapes:

```json
{
  "purpose": "manifest",
  "candidateId": "controller-owned-candidate-id",
  "leftGlyphPngPath": "/absolute/external/left.png",
  "rightGlyphPngPath": "/absolute/external/right.png"
}
```

```json
{
  "purpose": "external-control",
  "controllerControlId": "controller-owned-control-id",
  "leftGlyphRef": "canonical-left-glyph-ref",
  "rightGlyphRef": "canonical-right-glyph-ref",
  "leftGlyphPngPath": "/absolute/external/left.png",
  "rightGlyphPngPath": "/absolute/external/right.png"
}
```

The command writes these separate artifact sets:

- reviewer directory: `reviewer-bundle.json` and `pairs/<pairRef>.png`;
- controller directory: `controller-sidecar.json`.

Only the reviewer directory may be sent to a blind reviewer. The reviewer
bundle has the exact shape below and contains no controller metadata:

```json
{
  "protocolVersion": "unicode-visual-v0.2.1",
  "items": [
    { "pairRef": "pair-24-lowercase-hex", "pixelPath": "pairs/pair-24-lowercase-hex.png" }
  ]
}
```

The sidecar additionally records controller-only candidate/checksum/batch or
control/glyph-derivative bindings, the namespace salt, the canonical authority
checksums, each rendered PNG checksum, and the reviewer bundle checksum.

## Calibration context, key, and submission

`calibrate` never rebuilds a bundle. It loads the stored external artifacts and
replays their authority binding from original source PNGs. Its descriptor has
these exact keys:

```json
{
  "inputPath": "/absolute/external/v021-bundle-input.json",
  "reviewerBundlePath": "/absolute/external/v021-reviewer-output/reviewer-bundle.json",
  "controllerSidecarPath": "/absolute/external/v021-controller-output/controller-sidecar.json",
  "contractPath": "/absolute/external/v021-review-contract.json"
}
```

The contract file has exactly:

```json
{
  "rubricVersion": "unicode-visual-v0.2.1",
  "promptChecksumSha256": "64-lowercase-hex",
  "renderingEvidenceChecksumSha256": "64-lowercase-hex",
  "reviewerModelVersion": "trusted-reviewer-model-version",
  "transportContractChecksumSha256": "64-lowercase-hex",
  "visionCapabilityEvidenceRef": "trusted-external-attestation-reference"
}
```

The sealed key remains external and has exactly:

```json
{
  "protocolVersion": "unicode-visual-v0.2.1",
  "reviewerBundleChecksumSha256": "64-lowercase-hex",
  "contract": { "...": "exact review contract above" },
  "items": [
    {
      "pairRef": "pair-24-lowercase-hex",
      "class": "strong-positive | strong-negative | hard-probe | relation-trap",
      "expectedOutcome": "confusable | not-confusable | borderline"
    }
  ]
}
```

It must contain exactly 72 unique refs: 20 strong positives, 20 strong
negatives, 24 hard probes, and 8 relation traps. Strong positives must expect
`confusable`; strong negatives must expect `not-confusable`; each hard probe
must bind a canonical manifest entry. The harness does not contain a
key-generation feature.

The external Reviewer A submission has exactly `results` and `receipt`:

```json
{
  "results": [
    { "pairRef": "pair-24-lowercase-hex", "visualOutcome": "confusable | not-confusable | borderline" }
  ],
  "receipt": {
    "protocolVersion": "unicode-visual-v0.2.1",
    "role": "reviewer-a",
    "reviewerSessionId": "fresh-session-id",
    "reviewerIndependenceContextId": "review-context-id",
    "reviewerModelVersion": "trusted-reviewer-model-version",
    "visionCapabilityEvidenceRef": "trusted-external-attestation-reference",
    "rubricVersion": "unicode-visual-v0.2.1",
    "promptChecksumSha256": "64-lowercase-hex",
    "renderingEvidenceChecksumSha256": "64-lowercase-hex",
    "transportProfileChecksumSha256": "64-lowercase-hex",
    "reviewerBundleChecksumSha256": "64-lowercase-hex",
    "items": [
      { "pairRef": "pair-24-lowercase-hex", "evidenceChecksumSha256": "64-lowercase-hex" }
    ],
    "resultsChecksumSha256": "64-lowercase-hex"
  }
}
```

Pass A results accept no prose, relation field, unknown ref, duplicate, or
extra property. The receipt must cover the exact required entry subset and
their evidence checksums. Reviewer B uses the same result/receipt schema with
`role: "reviewer-b"`; it receives only the exact A-positive manifest subset
under a fresh session and independent context. A full mixed A bundle may include
controls; controls never receive B or Pass B descriptions.

Pass B is controller-side input shaped as `result` plus a `role: "pass-b"`
receipt. Its result is exactly:

```json
{
  "pairRef": "pair-24-lowercase-hex",
  "observableDifference": {
    "region": "upper | lower | left | right | center | whole",
    "feature": "stroke | dot | hook | line | shape | enclosure",
    "contrast": "present | absent | longer | shorter | open | closed | curved | straight"
  }
}
```

Only A+B `confusable` manifest records with this receipt can reach the fixed
Japanese caution renderer. Every other state, including `borderline`,
`not-confusable`, malformed, stale, partial, unsupported, unreviewed, or a
hard-probe override remains learner-excluded.

## Calibration command and result semantics

The only current calibration command is:

```bash
pnpm exec node scripts/run_unicode_review_v021.ts calibrate \
  --context /absolute/external/v021-review-context.json \
  --sealed-key /absolute/external/v021-sealed-calibration-key.json \
  --submission /absolute/external/v021-reviewer-a-submission.json \
  --output /absolute/external/v021-calibration-output.json
```

The command writes a new external JSON object with `evaluation` and
`replayBinding`; it exits nonzero for any FAIL. A PASS evaluation reports
observed strong-positive exact count, strong-negative exact count,
strong-negative `confusable` count, zero structurally permitted relation
leakage, a per-outcome confusion matrix, raw agreement, hard-probe production
outcomes, and canonical candidate/checksum `borderline` overrides.

Freeze gates are unchanged: strong positives >=19/20, strong negatives >=19/20,
zero strong-negative `confusable`, and zero relation leakage. A validation
failure before evaluation has `metrics.evaluated: false` and null metrics; it
does not fabricate a leakage count or agreement value.

A PASS JSON and its serializable `replayBinding` are evidence records only.
They are never a production authorization. `authorizeCalibration` issues the
actual authorization only in memory after it revalidates the exact authority,
bundle, sidecar, pixels, contract, key, results, and receipt. JSON cloning or
caller-created objects cannot reproduce that capability. Replaying an action
must reload the original sources and compare all replay fingerprints; it must
not trust a stored PASS output.

## Hash and journal conventions

All `*Sha256` fields are lowercase 64-character SHA-256 values. Core JSON
bindings, including reviewer-bundle, key/result/receipt binding, evaluation,
and replay fingerprints, use SHA-256 of `JSON.stringify(value) + "\n"` with
the exact parsed structure and property insertion order used by the controller.
The result receipt checksum is computed from the parsed `results` array by this
same convention. A `pairRef` is different: it is the first 24 hexadecimal
characters of SHA-256 over the protocol version, a newline, the namespace salt,
another newline, and the exact JSON controller-side pair binding.

The external journal is separate. It uses recursively key-sorted canonical JSON
with exactly one trailing newline, SHA-256 content checksums, monotonically
increasing sequence numbers, and a previous-digest chain. An event content
checksum hashes canonical `{ payload, previousDigest, sequence }`; its digest
hashes the canonical record body containing that checksum. Its external root
contains a marker, an `events` directory, and an exclusive lock. Initialize,
load, append with the expected tip, and recovery functions validate the full
chain. Recovery is permitted only for a provably stopped owned writer with a
valid journal; unknown files, a live writer, or a changed owner fail closed.

## Workflow command and descriptor

Every workflow command reloads the original calibration context, sealed key,
and Reviewer A calibration submission, then calls `authorizeCalibration` again.
The calibration output JSON is never accepted as authorization. It also reloads
every recorded wave's manifest-only source input and compares the persisted
reviewer bundle, controller sidecar, and every reviewer PNG byte-for-byte with
the deterministic replay before consuming it.

The workflow descriptor is an external JSON object with these exact keys:

```json
{
  "calibrationContextPath": "/absolute/external/v021-review-context.json",
  "sealedKeyPath": "/absolute/external/v021-sealed-calibration-key.json",
  "calibrationSubmissionPath": "/absolute/external/v021-reviewer-a-submission.json",
  "journalPath": "/absolute/external/v021-workflow-journal",
  "waves": [
    {
      "waveId": "wave-001",
      "inputPath": "/absolute/external/wave-001-manifest-input.json",
      "reviewerOutputPath": "/absolute/external/wave-001-reviewer",
      "controllerOutputPath": "/absolute/external/wave-001-controller"
    }
  ]
}
```

`waves` must contain every historical and currently planned wave, plus any wave
that may be selected by `plan`. A wave input has the `bundle` input envelope
with `items`, but every item must be a `manifest` item; it must not duplicate
sentinels or external controls. The workflow derives its 4/4/4 sentinels from
the revalidated original calibration context. To add a later wave, create a
fresh external descriptor containing both the prior entries and the new entry;
the journal remains immutable.

All commands use this form, with a fresh external JSON status path:

```bash
pnpm exec node scripts/run_unicode_review_workflow_v021.ts <command> \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/fresh-status.json
```

The exact lifecycle is:

```bash
# Create a new empty journal after recalibration replay succeeds.
pnpm exec node scripts/run_unicode_review_workflow_v021.ts init \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/init-status.json

# Append one immutable plan and exclusively publish its A artifact pair.
pnpm exec node scripts/run_unicode_review_workflow_v021.ts plan \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --wave-id wave-001 --output /absolute/external/plan-status.json

# Revalidate all published artifacts. If the current pending A artifact pair is
# wholly absent after an interrupted plan, exclusively publish it from replay.
pnpm exec node scripts/run_unicode_review_workflow_v021.ts resume \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/resume-status.json

pnpm exec node scripts/run_unicode_review_workflow_v021.ts ingest-a \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --submission /absolute/external/wave-001-reviewer-a.json \
  --output /absolute/external/a-status.json

pnpm exec node scripts/run_unicode_review_workflow_v021.ts prepare-b \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --reviewer-output /absolute/external/wave-001-reviewer-b \
  --output /absolute/external/b-prepare-status.json

pnpm exec node scripts/run_unicode_review_workflow_v021.ts ingest-b \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --submission /absolute/external/wave-001-reviewer-b.json \
  --output /absolute/external/b-status.json

pnpm exec node scripts/run_unicode_review_workflow_v021.ts prepare-pass-b \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --reviewer-output /absolute/external/wave-001-pass-b \
  --output /absolute/external/pass-b-prepare-status.json

pnpm exec node scripts/run_unicode_review_workflow_v021.ts ingest-pass-b \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --submission /absolute/external/wave-001-pass-b.json \
  --output /absolute/external/pass-b-status.json

pnpm exec node scripts/run_unicode_review_workflow_v021.ts finalize \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/finalize-status.json
```

`prepare-b` accepts only A-positive manifest refs. `prepare-pass-b` accepts
only independently confirmed, non-provisional manifest refs. Each prepares one
fresh reviewer directory containing only `reviewer-subset.json` and the exact
stored `pairs/<pairRef>.png` files. Its manifest has exactly
`protocolVersion` and `items`, with opaque `pairRef` and `pixelPath` values.
It contains no full-bundle checksum, sidecar, outcome, expected answer, or
receipt. Controller status and the trusted receipt retain the original
full-bundle binding. When B has no expected refs, `ingest-b` requires a
submission file containing JSON `null`.

The controller-only status object records the action, active stage,
finalized/provisional IDs, clean initial-wave streak, terminal state and full
reviewer-bundle checksum of each recorded wave, and any finalized promotions.
A strong-negative result in `ingest-a` appends an
`invalidated` wave record, writes that status object, and exits nonzero. It is
never reported as a successful review. Schema/binding failures and any partial,
unexpected, stale, or byte-different artifact fail closed.

Every command preflights its required flags and fresh external status/subset
output before mutating the journal. `plan` writes its journal event before
artifact publication. `resume` may publish only the current pending wave when
**both** its reviewer and controller directories are absent. During a pending
Reviewer B or Pass B stage, provide a new `--reviewer-output` to `resume` and
it exports the recorded pending opaque subset without appending a duplicate
prepare event. If either A artifact directory is present alone, or any stored
artifact is partial or differs from replay, the adapter preserves it and stops;
it never overwrites or cleans it.

```bash
pnpm exec node scripts/run_unicode_review_workflow_v021.ts resume \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --reviewer-output /absolute/external/fresh-reviewer-b-or-pass-b-subset \
  --output /absolute/external/resume-subset-status.json
```

`recover` is the sole journal-recovery command. Use it only after a writer is
provably stopped:

```bash
pnpm exec node scripts/run_unicode_review_workflow_v021.ts recover \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/recover-status.json
```

It invokes the explicit journal recovery API, then replays the workflow and
validates every stored wave artifact before writing status.

## Requirement, implementation, and evidence matrix

| Requirement | Current implementation files | Focused evidence |
| --- | --- | --- |
| Blind opaque bundle and separated sidecar | `unicode_review_v021.ts`, `run_unicode_review_v021.ts` | `unicode-review-v021.test.ts`, `unicode-review-cli.test.ts` |
| Strict external path, fresh-output, and no-overwrite boundary | `unicode_review_external_io.ts`, `run_unicode_review_v021.ts` | `unicode-review-external-io.test.ts`, `unicode-review-cli.test.ts` |
| Pinned PNG decode and comparison rendering | `unicode_review_pixels.ts`, `unicode_review_cli_context.ts` | `unicode-review-pixels.test.ts`, `unicode-review-cli-context.test.ts` |
| Original-input replay and current #262 authority rebinding | `unicode_review_cli_context.ts`, `unicode_review_v021.ts` | `unicode-review-cli-context.test.ts`, `unicode-review-v021.test.ts` |
| Salted opaque ordering and exact one-to-one artifact coverage | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Strict 72-item sealed calibration and mechanical freeze gates | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Receipt-bound trusted vision submission and unavailable FAIL metrics | `unicode_review_v021.ts`, `run_unicode_review_v021.ts` | `unicode-review-v021.test.ts`, `unicode-review-cli.test.ts` |
| Opaque authorization, replay binding, and hard-probe exclusion | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Mixed A, positive-manifest B, Pass B, and fixed caution | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Immutable external journal and restart-safe chain validation | `unicode_review_journal.ts` | `unicode-review-journal.test.ts` |
| Resumable wave state, sentinel injection, A/B independence, Pass B, and promotion | `unicode_review_workflow.ts` | `unicode-review-workflow.test.ts` |
| Strict workflow descriptor, artifact byte replay, external status, subset export, and invalidation exit | `run_unicode_review_workflow_v021.ts` | `unicode-review-cli.test.ts` |

## Documentation-only verification

This document is aligned to the current core, IO, pixel, context, journal, and
CLI source interfaces. It does not claim that any external calibration, vision
transport proof, production review wave, learner promotion, or #338 freeze gate
has completed.
