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

## Canonical glyph export and deterministic boundary

Before creating controller input, export the current #262 authority's pinned
glyph PNGs to a fresh external directory:

```bash
pnpm exec node scripts/export_unicode_review_glyphs.ts \
  --output /absolute/external/v021-glyph-pack
```

The output contains `index.json` and one `glyphs/<glyphRef>.png` per current
authority glyph. The index binds the current manifest and review-plan
checksums, rendering environment, font checksum, scalar, derivative checksum,
PNG path, and PNG checksum. The exporter validates the current authority and
the complete pinned payload before writing. It invokes the pinned Docker
renderer when no payload is supplied; the Docker image, browser, font input,
64×64 grayscale tiles, and derivative checksums are fixed by the #262
authority. The output directory must be absolute, outside this repository and
all of its worktrees, fresh, and exclusive. The exporter does not modify
canonical source files and does not send glyphs to a reviewer.

Use absolute paths into this pack when creating the controller-owned bundle
input. `index.json` is an export manifest; it is not itself a bundle input.
The bundle command then deterministically decodes the supplied PNGs, verifies
their authority derivative checksums, renders the comparison PNGs, and writes
the blind reviewer bundle and controller sidecar to separate fresh external
directories.

The deterministic boundary ends at pixel reproduction. Exporting glyphs,
decoding and validating PNGs, rendering comparison artifacts, deriving opaque
references, ordering artifacts, replaying the current authority, and checking
all hashes are local deterministic controller operations. A genuine sealed
72-item calibration key, a trusted vision-capable Reviewer A/B or Pass B
classification, and their transport receipts remain external evidence. A
fixture, OCR result, text reconstruction, local model, generated label, or
persisted PASS JSON cannot substitute for that evidence or authorize learner
content.

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

Before publishing either PASS or FAIL, the command resolves every role path
and proves the output is disjoint from both reviewer and controller artifact
directories and all input files. Malformed context descriptors, unsafe or
relative paths, and role overlaps exit without creating an output; an unsafe
preflight never leaves a machine-readable FAIL behind. Once that path
preflight succeeds, ordinary invalid evidence or key contents produce a
machine-readable FAIL at the safe external destination.

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
The workflow `recover` callback semantically replays the journal, verifies
every stored wave, and checks every recorded subset root against all permanent
roles before the journal API removes the held lock or matching partial event.
Any semantic or recorded-root rejection preserves those owned artifacts for a
later safe retry.

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
# Create a new journal after recalibration replay succeeds. `init` creates the
# marker, events directory, and initialization event through the journal's
# exclusive append path.
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

Journal I/O failures are not evidence-validation failures. A failed append
before commit leaves the pending stage and journal tip unchanged; it does not
invalidate otherwise valid A, B, or Pass B evidence. After any write error,
replay the workflow before retrying, because an error after commit can leave a
valid event already recorded.

Every command preflights its required flags and fresh external status/subset
output before mutating the journal. `plan` writes its journal event before
artifact publication. `resume` may publish only the current pending wave when
**both** its reviewer and controller directories are absent. During a pending
Reviewer B or Pass B stage, it exports the recorded pending opaque subset
without appending a duplicate prepare event. If either A artifact directory is
present alone, or any stored artifact is partial or differs from replay, the
adapter preserves it and stops; it never overwrites or cleans it.

Every Reviewer B and Pass B plan must record a canonical absolute external
subset root. Preparation resolves path aliases before persistence. Replay
rejects noncanonical stored spellings, including symlink and `..` aliases,
so isolation checks compare canonical roots and controller destinations. All
recorded B and Pass B roots must also be pairwise disjoint, across pending and
terminal waves. Direct preparation rejects an identical or nested root before
appending; semantic replay rejects overlapping recorded roots before returning
state, publishing status, reconstructing a subset, or cleaning a stopped writer.
A pathless legacy transition is not a writable replay path: current workflow
replay rejects it before a command can advance the journal. Before any command
can append another event, the adapter rechecks every recorded subset export,
including exports from terminal waves, against the original immutable prepared
pair-reference set, replayed manifest and PNG bytes, and complete file
inventory. A wholly absent export may be reconstructed only by `resume` for
the current resumable stage, at that exact recorded root; this includes a
manifest-only export whose prepared reference set is empty. A missing export
from an advanced or terminal wave, or any partial, unexpected, or drifted
export, fails closed and preserves the recorded root.

```bash
pnpm exec node scripts/run_unicode_review_workflow_v021.ts resume \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/resume-subset-status.json
```

When a pending subset export was registered but its directory is absent, the
command above recreates it at the recorded path. Supplying
`--reviewer-output` is optional and, if supplied, must name that same recorded
path; it cannot redirect recovery to a new directory.

`recover` is the sole journal-recovery command. Use it only after a writer is
provably stopped:

```bash
pnpm exec node scripts/run_unicode_review_workflow_v021.ts recover \
  --descriptor /absolute/external/v021-workflow-descriptor.json \
  --output /absolute/external/recover-status.json
```

It invokes the explicit journal recovery API with a pre-cleanup semantic
validation callback. For a nonempty journal, that callback replays the exact
workflow, validates every stored wave artifact, and verifies recorded subset
roots from pending and terminal waves against their immutable prepared refs,
exact bytes, and complete inventory, as well as against every permanent role,
before the API removes the held lock or matching partial event. Recovery writes
status only after cleanup succeeds.
If the current active wave has neither artifact directory, recovery permits
the validated plan to remain unpublished; a subsequent `resume` recreates its
exact artifacts. A partially present pair, damaged artifact, or missing
terminal-wave output still rejects recovery before cleanup.
For an exact empty journal, there are no stored waves to replay; after the
stopped-writer cleanup, recovery performs the same calibration-first
initialization path.

Initialization has a separate boundary. Calibration is replayed before any
journal mutation. `init` either creates a fresh external root or resumes only
an exact protocol-valid zero-event root with no lock or unknown entries; it
appends the initialization event using the expected zero tip. Nonempty,
foreign, or dirty roots fail closed without deletion or modification. If an
initializer stops while holding the journal lock, `recover` first proves that
owner is gone and validates/reclaims only the owned lock and temporary event.
When recovery leaves an exact empty journal, it performs the same
calibration-first initialization; when events exist, it reads and replays the
existing workflow. Neither command clears a live or unverified lock.

Reviewer B and Pass B subset exports have persistent registration and recovery
semantics. `prepare-b` and `prepare-pass-b` require a fresh absolute external
`--reviewer-output`. The command first appends a journal event recording the
exact subset root and pair references, then publishes only
`reviewer-subset.json` and the selected stored PNGs. The recorded root is
included in workflow status and remains permanently fenced after finalization.
Every later status output, wave reviewer/controller root, journal, calibration
artifact root, controller input, descriptor, command submission, and newly
requested subset destination must be disjoint from every recorded subset root,
including roots from terminal waves. This role isolation is checked before any
new journal mutation.

The canonical absolute root and prepared reference set are mandatory for every
new B or Pass B plan. A historical event without that root cannot be resumed or
written through the current workflow path. Before state advances, and again
before stopped-writer recovery removes its lock or partial event, every
recorded subset root is revalidated, including terminal-wave roots. The check
uses deterministic replay of the original wave artifacts and requires the
original manifest, selected PNG bytes, and exact inventory.

Each stored subset must contain exactly its manifest and selected PNG files:
unexpected files, symlinks, or directories (including empty nested
directories) make replay fail closed. The command preserves the recorded root
and does not overwrite or clean a partial or drifted export.

If subset publication fails after registration, the status file is not written
and the journal retains the registered path. `resume` reconstructs a wholly
absent registered pending subset only at that exact path; a zero-reference
subset is still reconstructed as its manifest-only export. If the directory
exists, `resume` checks its complete file set and every byte against
deterministic replay; it never overwrites, cleans, or redirects a partial or
drifted export. A missing subset from an advanced or terminal wave fails closed
instead. `--reviewer-output`, when supplied to `resume`, must match the
recorded path. These rules apply equally to Reviewer B and Pass B; they
preserve blind subset isolation while making an interrupted export
restart-safe.

Partial Pass B completion changes the pending work list, not the registered
export or its immutable prepared pair-reference set. Resume verifies or
recreates the complete originally prepared subset at its original path, then
uses the journal's already-ingested results to exclude completed references
from the pending list. Those references are never requested again merely
because the process restarted.

## Requirement, implementation, and evidence matrix

| Requirement | Current implementation files | Focused evidence |
| --- | --- | --- |
| Blind opaque bundle and separated sidecar | `unicode_review_v021.ts`, `run_unicode_review_v021.ts` | `unicode-review-v021.test.ts`, `unicode-review-cli.test.ts` |
| Strict external path, fresh-output, and no-overwrite boundary | `unicode_review_external_io.ts`, `run_unicode_review_v021.ts` | `unicode-review-external-io.test.ts`, `unicode-review-cli.test.ts` |
| Calibration unsafe-preflight no-output boundary | `run_unicode_review_v021.ts`, `unicode_review_external_io.ts` | `unicode-review-cli.test.ts`: “refuses calibration output inside reviewer or controller artifact directories before writing”; “does not publish a FAIL record when a sealed key or submission overlaps the blind tree”; “does not publish into the blind tree before malformed role paths are rejected” |
| Pinned PNG decode and comparison rendering | `unicode_review_pixels.ts`, `unicode_review_cli_context.ts` | `unicode-review-pixels.test.ts`, `unicode-review-cli-context.test.ts` |
| Original-input replay and current #262 authority rebinding | `unicode_review_cli_context.ts`, `unicode_review_v021.ts` | `unicode-review-cli-context.test.ts`, `unicode-review-v021.test.ts` |
| Salted opaque ordering and exact one-to-one artifact coverage | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Strict 72-item sealed calibration and mechanical freeze gates | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Receipt-bound trusted vision submission and unavailable FAIL metrics | `unicode_review_v021.ts`, `run_unicode_review_v021.ts` | `unicode-review-v021.test.ts`, `unicode-review-cli.test.ts` |
| Canonical pinned glyph export, complete authority coverage, and exclusive external pack output | `export_unicode_review_glyphs.ts`, `unicode_review_pixels.ts`, `unicode_review_external_io.ts` | `unicode-review-glyph-export.test.ts`: “builds one PNG per authority glyph and a binding index”; “fails closed for incomplete, duplicate, unknown, or drifted payloads”; “fails closed when canonical rendering authority metadata is stale or malformed”; “publishes through the real CLI argument boundary with path safety before Docker”; “accepts a payload over 1 MiB through the Docker command boundary before semantic validation” |
| Opaque authorization, replay binding, and hard-probe exclusion | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Mixed A, positive-manifest B, Pass B, and fixed caution | `unicode_review_v021.ts` | `unicode-review-v021.test.ts` |
| Immutable external journal, transactional stopped-writer recovery, and restart-safe chain validation | `unicode_review_journal.ts`, `run_unicode_review_workflow_v021.ts`, `unicode_review_workflow.ts` | `unicode-review-journal.test.ts`: “recovers only a provably stopped owner after validating the journal and its own temporary artifact”; “preserves owned stopped-writer artifacts when pre-cleanup recovery validation rejects the journal”; “rejects a same-sequence temporary artifact that conflicts with the committed event”; `unicode-review-cli.test.ts`: “retries an exact empty initialization journal and recovers a stopped initializer without accepting a foreign root”; “preserves a stopped workflow journal when semantic recovery replay rejects its hash-valid event”; “recovers a stopped planned wave with both unpublished artifacts absent, but preserves a partial pair” |
| Resumable wave state, sentinel injection, A/B independence, Pass B, and promotion | `unicode_review_workflow.ts` | `unicode-review-workflow.test.ts`: “persists chosen Reviewer B and Pass B subset roots and retains them after finalization”; “retains immutable prepared Pass B refs while completed results are removed from pending work”; “rejects Reviewer B and Pass B subset transitions without an absolute recorded path” |
| Canonical external subset roots at preparation and fail-closed semantic replay | `unicode_review_workflow.ts`, `unicode_review_external_io.ts` | `unicode-review-workflow.test.ts`: canonical B/Pass B API persistence; `unicode-review-cli.test.ts`: “rejects hash-valid noncanonical B and Pass B subset roots before publishing status or mutating the journal” |
| Pairwise subset-root isolation across pending and terminal waves | `unicode_review_workflow.ts` | `unicode-review-workflow.test.ts`: direct preparation rejects identical, child, and parent roots before append; `unicode-review-cli.test.ts`: hash-valid overlap fails before resume status, subset reconstruction, or stopped-writer cleanup |
| Retryable journal I/O remains separate from evidence invalidation | `unicode_review_workflow.ts`, `unicode_review_journal.ts` | `unicode-review-workflow.test.ts`: one-shot pre-commit failures preserve the tip and pending A/B/Pass B evidence, followed by identical-submission retries |
| Fresh-root workflow initialization, exact empty-journal retry/recovery, and stopped-writer recovery | `run_unicode_review_workflow_v021.ts`, `unicode_review_workflow.ts`, `unicode_review_journal.ts` | `unicode-review-cli.test.ts`: “retries an exact empty initialization journal and recovers a stopped initializer without accepting a foreign root”; `unicode-review-journal.test.ts`: “initializes one fresh external root and never overwrites a journal or dirty caller root”; “recovers only a provably stopped owner after validating the journal and its own temporary artifact” |
| Strict workflow descriptor, stored-wave replay, recorded-root role isolation, persistent B/Pass B subset registration, immutable partial Pass B resume, and invalidation exit | `run_unicode_review_workflow_v021.ts`, `unicode_review_workflow.ts`, `unicode_review_external_io.ts` | `unicode-review-cli.test.ts`: “replays a calibrated synthetic wave through independent review and exports only blind subsets”; “resumes a partial Pass B wave against its immutable prepared subset”; “treats recorded B and Pass B exports as immutable evidence across commands and recovery”; “recreates missing zero-ref Reviewer B and Pass B exports only through resume”; “persists chosen subset roots, fences later status output, and permits only the recorded resume path”; “recovers an existing B subset when its active wave publication pair is absent”; “rejects reviewer/container-nested status and subset destinations before journal mutation”; “rejects a cross-wave controller root nested in another reviewer root before initialization”; “rejects an artifact root that would contain a controller input before initialization”; `unicode-review-workflow.test.ts`: “rejects Reviewer B and Pass B subset transitions without an absolute recorded path” |

## Documentation-only verification

This document is aligned to the current core, IO, pixel, context, journal, and
CLI source interfaces. It does not claim that any external calibration, vision
transport proof, production review wave, learner promotion, or #338 freeze gate
has completed. The focused test names in the matrix identify repository
coverage; they do not create or replace external calibration, vision, or rights
evidence. The empty-journal test covers only the exact protocol-valid
zero-event retry and stopped-initializer recovery path; foreign or dirty roots
remain fail-closed.
