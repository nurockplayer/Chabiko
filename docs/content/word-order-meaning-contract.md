# Word-order meaning contract proposal — Issue #512

**Status:** Preparation only; proposed contract, not adopted implementation or language approval.
**Baseline:** `f897c367b41553cf714a3108a42ffe01c8962fd5`.
**Source of truth:** [#512](https://github.com/nurockplayer/Chabiko/issues/512), [#509 F2](https://github.com/nurockplayer/Chabiko/issues/509), and the owner's preparation instructions.

The change would give learners a Japanese target meaning and accept human-approved alternative orders. The [teacher packet](reviews/word-order-meaning-v1.md) contains generated, unreviewed candidates for all 22 current items. Neither document authorizes production use. Follow the [content review workflow](content-review-workflow.md) and [AI-assisted authoring workflow](ai-assisted-authoring-workflow.md); model review never supplies human approval.

## Impact Map — Japanese meaning cues and reviewed alternative orders

This follows the [playbook template](../engineering/cross-cutting-change-playbook.md). Future implementation crosses data/metadata, validators, runtime consumers, and generated provenance. The inventory below freezes the observed baseline; unresolved adoption decisions at the end block implementation, not this preparation packet.

### Writers

- Human authors and issue-scoped mechanical edits own `data/examples/valid/practice.json`. Repository search found no generator/importer that writes this bundle. Future edits must preserve IDs, order, canonical answers, distractors, tags, record `reviewStatus`, and `sourceLesson` except for separately authorized changes.
- Human lesson authors own `data/examples/valid/lessons.json`; `lesson-001`–`lesson-010` core sentences/examples and review status determine the eligible source-backed set. `loadWordOrderPractice.ts` derives eligibility in memory; it does not write records.
- `tests/word-order-practice-route.test.ts` and `tests/practice-source-reconciliation.test.ts` write practice/lesson JSON only in owned temporary directories. Domain/lifecycle tests create in-memory items and serialized DOM fixtures.
- Humans maintain the Unicode source allowlist/checksums in `data/unicode/source-manifest.json`. `scripts/sync-teacher-phrase-unicode-source.py` is also a manifest writer, scoped to the teacher-phrase source; preserve that entry and every unrelated source.
- Derived writers: `scripts/extract_unicode_data.py` writes `data/unicode/generated/{scalar-inventory,mechanical-records}.json`; `scripts/generate_unicode_visual_candidates.ts` writes `{visual-candidates,visual-review-plan}.json` in that directory. Neither writes practice records. This preparation changes none of those inputs or outputs.

### Consumers

- Runtime chain: `src/content/loadWordOrderPractice.ts` → `src/domain/wordOrderPractice.ts` (`WordOrderItem`, tokenizer, shuffle, grading/state) → `src/pages/practice/word-order/index.astro` → `src/components/WordOrderPractice.astro` (session serialization/markup) → `src/client/wordOrderPractice.ts` (deserialization, task, feedback, keyboard/focus lifecycle).
- Source reconciliation reads `src/content/loadLessons.ts`, `src/types/lesson.ts`, and the lesson bundle. Current production contains legacy `practice-002` plus 21 mechanically eligible, deduplicated lesson-backed targets (`practice-006`–`practice-026`). All 22 practice records currently have `reviewStatus: "draft"`; this loader does not gate them on record-level publication status. Preserve that reality without granting new fields approval from it.
- Shared bundle consumer: `src/content/loadTonePractice.ts` filters tone items; new fields must be word-order-only and leave tone parsing unchanged. The learning-content graph currently has no standalone practice-record kind; no graph/API/storage extension is proposed.
- Executable schema: `scripts/validate-content-schema.py`, including `SCHEMAS["practice"]`, answer-language, source-lesson, review-status, and generated-content checks plus embedded self-tests. No `schemas/` directory exists at the baseline. New keys are currently rejected as unknown fields.
- Other content validators: `scripts/validate-pain-points.py` recursively checks tags; `scripts/validate-script-status.py` checks applicable script/target provenance. Neither constitutes human approval. `scripts/validate-content.sh` orchestrates those gates; `.github/workflows/ci.yml` and `scripts/validation/{classify,run}.ts` select/run them.
- Direct regression consumers: `tests/word-order-practice-{domain,lifecycle,route}.test.ts`, `tests/practice-source-reconciliation.test.ts`, `tests/tone-practice-route.test.ts`, `tests/navigation-foundation.test.ts`, `tests/direction-c-production-ui.test.ts`, and `tests/a11y/header-containment.a11y.spec.ts`.
- Unicode consumers: `data/unicode/source-manifest.json` checksum-pins the entire practice file and selects its answer/prompt fields. `scripts/{unicode_contract,extract_unicode_data,validate_unicode_data}.py` reconcile it with mechanical artifacts; `tests/unicode-contract.test.ts` and `tests/python/test_unicode_contract.py` cover that contract. Downstream `scripts/{generate_unicode_visual_candidates,unicode_visual_contract}.ts` and `tests/unicode-visual-candidates.test.ts` bind visual artifacts to the inventory checksum. Review/export tooling consumes the resulting visual plan; rebuilding is not a human review action.

### Legacy paths

- `practice-002` must remain the single non-source-backed exception; do not invent a `sourceLesson` for it. Its `distractorsTraditional` are distractors, never an alternative-answer allowlist.
- Keep raw `correctAnswerTraditional` normalization into the domain item; generic `correctAnswer`/`distractors` and Japanese answer fields remain forbidden on word-order records.
- Keep strict reconciliation for default production and paired practice/lesson fixtures, and loose filtering for an explicit one-file fixture. Optional-field eligibility must fail closed in both seams.
- Current chunks come from `tokenizeAnswer`: whitespace-delimited tokens if present, otherwise individual Unicode code points, including punctuation. All 22 current answers are unspaced. Do not substitute lesson linguistic chunks or change tokenization in #512.

### Canonical workflow

1. Named human review → maintainer selection/freeze of exact strings and evidence in the owning implementation issue → synchronized data/schema/loader/domain/serialization/UI changes. There is no practice-record rebuild or migration command: the JSON is manually maintained.
2. Content checks: `pnpm validate:content` (includes validator self-tests and checks the practice bundle). Focused check: `uv run --locked python scripts/validate-content-schema.py --check data/examples/valid/practice.json`.
3. Any future practice-file edit requires a reviewed source-manifest checksum update. Under [the Unicode contract](unicode-record-contract.md), rebuild with `uv run --locked python scripts/extract_unicode_data.py --write`, then `--check`, then `uv run --locked python scripts/validate_unicode_data.py`. Do not run write commands during preparation.
4. A changed inventory also invalidates downstream checksum pins. Under [the visual candidate contract](unicode-visual-candidate-contract.md), the canonical commands are `pnpm exec node scripts/generate_unicode_visual_candidates.ts --write` and `--check`, using its pinned renderer. Obtain owner scope before these generated changes; do not refresh or transplant human decisions onto a changed plan.
5. `pnpm build` rebuilds the static page/session payload, not source content. Future implementation runs `pnpm validate` at its classifier-required tier; data/schema/UI changes require T3. Retain CLI/self-test coverage for any documented rebuild changed by implementation. This preparation runs only lint and applicable document checks.

### Boundaries

- Preparation writes only this document and the teacher packet. No production data, source, schemas, validators, tests, package metadata, lockfiles, external resources, or deployment changes; no GitHub mutations.
- Future data changes must synchronize all listed consumers. A stale Unicode checksum is a blocker, not permission to bypass the guard or silently expand into generated review work.
- Preserve `.gitignore`, build hooks, deployment gates, and existing `dist/assets/dev` pruning. The static build owns ignored `dist/`/`.astro/` output; it must not rewrite canonical practice JSON, review packets, or human evidence.
- Stage explicit task files. Test cleanup may remove only files/directories created by that test. No corpus pruning, destructive migration, broad reset, or cleanup of neighboring developer files.

### Rights / provenance

- Existing Chinese strings are copied exactly from repository-controlled data. New Japanese meanings and the one proposed alternative are AI-generated candidates (`generated`, unreviewed), with no imported dictionary, teaching material, audio, images, dependency, or new license claim.
- Human approval requires identity, role, date, exact reviewed version/items, outcome, scope, unresolved issues, and blocked content under the review workflow §3. Scope must explicitly name each approved field, language naturalness/meaning, and Taiwan usage of alternatives. Field approval does not promote record `reviewStatus`, source-lesson status, script provenance, or publication eligibility.

### Clean / dirty environment

| Environment / failure | Required behavior for future implementation |
| --- | --- |
| Clean checkout, both optional fields absent | Same 22-item loading, generic prompt, canonical grading, shuffle and lifecycle as today. |
| Clean checkout, valid human evidence for one or both fields | Enable each field independently; preserve source reconciliation and deterministic unsolved presentation. |
| Missing/unreviewed/malformed/stale optional-field evidence | Ignore that extension at runtime, omit it from the learner payload, and retain baseline behavior for that field. Authoring validation rejects malformed evidence or a stale claimed approval. |
| Missing/duplicate targets, changed source text/status, malformed canonical record | Existing strict production reconciliation still fails; optional fields never repair or mask base drift. |
| Dirty practice bundle or stale Unicode source checksum | Validators/rebuild fail before publication; no auto-repair, source overwrite, or inferred approval. |
| Unrelated local files or partially failed rebuild | Preserve neighboring files and human evidence; use existing transactional rollback for generated outputs. Test cleanup touches only owned temporary fixtures. |

## Proposed additive data contract

Only `type: "word-order"` may carry these optional fields:

| Field | Contract |
| --- | --- |
| `meaningJa?: string` | Non-empty, trimmed Japanese target meaning; no markup, answer transcription, or new Chinese target. Omission preserves today's prompt. |
| `acceptableAnswersTraditional?: string[]` | Exact Traditional strings; `[]` means no proposed alternatives. Every entry differs from the canonical answer and every other entry, uses precisely the canonical chunks with multiplicities, and rejoins with its original separator. Preserve punctuation; no added/removed/replaced characters, normalization, paraphrase, or substring grading. Human review must also establish the same target meaning, not merely grammaticality. |
| `fieldReviews?: object` | Only optional keys `meaningJa` and `acceptableAnswersTraditional`, each using the exact review shape below. Evidence for an absent field is invalid. A present field without evidence is unreviewed. |

Proposed review shape (a type specification, not populated approval):

```typescript
type FieldReview =
  | {
      status: 'unreviewed';
      reviewer: null;
      reviewerRole: null;
      date: null;
      artifact: null;
      reviewVersion: null;
    }
  | {
      status: 'human-reviewed';
      reviewer: string;
      reviewerRole: 'human-language-reviewer';
      date: string; // Actual ISO calendar date: YYYY-MM-DD.
      artifact: string; // Repository artifact path/anchor or durable review URL.
      reviewVersion: string; // sha256:<64 lowercase hexadecimal digits>.
    };

type FieldReviews = {
  meaningJa?: FieldReview;
  acceptableAnswersTraditional?: FieldReview;
};
```

Unknown review keys, null data fields, blank identity/artifact, invalid dates, incomplete attributed approval, and invented evidence fail authoring validation. `human-reviewed` can be recorded only from an actual named human's accepted artifact; the enum is not proof by itself. Rejected/needs-changes fields remain `unreviewed`, with findings retained in the artifact.

Bind approval to exact content: compute `reviewVersion` as `sha256:` plus SHA-256 of UTF-8 `JSON.stringify` of this ordered tuple (no normalization):

```text
[
  "word-order-meaning-v1", id, correctAnswerTraditional,
  canonicalChunkTexts, separator,
  sourceLesson ? [sourceLesson.lessonId, sourceLesson.field, sourceLesson.reviewStatus] : null,
  fieldName, fieldValue,
  fieldName === "acceptableAnswersTraditional" ? (meaningJa ?? null) : null
]
```

`fieldValue` is the exact meaning string or entire ordered alternatives array. Approval of the list covers precisely that set; adding, deleting, reordering, or editing an entry requires a new list review. A meaning change invalidates both its approval and alternatives approval; canonical/chunk/source-context drift invalidates both. Metadata and document formatting are outside this digest. The artifact must identify the record, field, exact approved value and this version, alongside its review commit/file version. Do not reset or promote existing record `reviewStatus` to approve the added fields; existing base-content review/invalidation policies still apply to any base edits.

## Fail-closed runtime and UI

- The loader is the approval boundary: expose `meaningJa` only for a valid, version-matching `fieldReviews.meaningJa.status === "human-reviewed"`; expose alternatives only for the equivalent list approval. Project only eligible values into `WordOrderItem` and the serialized session; unreviewed values/evidence must not leak into page attributes, HTML, or client state.
- The two gates are independent. Meaning-only approval changes the task text and keeps canonical-only grading. Alternatives-only approval adds those answers and leaves the generic prompt. Record `reviewStatus`, a lesson's approval, model consensus, or an engineering verdict cannot activate either field.
- Grading preserves the existing canonical index-order check and all-chunks-once requirement. For eligible alternatives, additionally compare the assembled sentence exactly against the approved strings. Account for repeated chunk texts without inventing unique text tokens; partial, missing, reused, or extra chunks stay invalid. Do not turn an unreviewed candidate into a distractor or hint.
- An initial shown order must not visibly equal the canonical answer or any enabled alternative. Keep deterministic ordering; reject an impossible unsolved item rather than present an approved answer already arranged.
- Reuse the current task paragraph immediately above the answer well/drop zone. Exact proposed learner copy: `この意味の文を作りましょう：{meaningJa}`. Example: 「この意味の文を作りましょう：私は明日台北に行きます。」. Without an eligible meaning, retain `promptJa` exactly: 「正しい語順に並べ替えてください」.
- Follow [A1 Editorial Calm](../design/reference-family-389.md): current prompt typography, ink, spacing, wrapping, and native chunk buttons; no new panel, animation, or controls. Long Japanese text wraps without clipping at 320px/375px and desktop in both themes. Clear/update the task on next/completion/restart so the prior meaning never survives on the next item. Keep current feedback, canonical answer reveal, focus, and retry behavior. Near-miss rule feedback is deferred.

## Future implementation tests and completion evidence

These are requirements, not tests executed during preparation. The implementation report must fill the playbook's Requirement → Diff → Test Evidence matrix with observed results.

| Frozen requirement | Future diff surface | Required evidence |
| --- | --- | --- |
| Optional schema and field review | Practice JSON; Python schema and self-tests | Old records pass; types, empty strings, unknown/non-word-order fields, nulls, incomplete identity/role/date/artifact, and stale digest claims fail. Generated candidates do not gain approval. |
| Exact chunk permutations | Validator and domain tests | Reject duplicates/canonical duplicate, changed/missing/extra chunks, altered punctuation/separator, and normalization tricks; cover spaced fixtures and repeated `幫`/`謝` code points. Language equivalence remains a human check. |
| Loader fail-closed | Loader; route/source-reconciliation tests | Test both fixture seams and default loading; test independently approved meaning/list, missing metadata, unreviewed, wrong role, malformed, and stale metadata. Preserve IDs/order/count and all existing source-drift failures. |
| Negative unreviewed-field regression | Loader → component payload → client → grading | With generated meaning and `明天我去台北` plus unreviewed or absent reviews, task/payload match baseline and that order stays incorrect. Record-level `reviewed`/`published` or reviewed source metadata cannot bypass the gate. |
| Approved alternative grading | Domain and lifecycle tests | Canonical and approved `明天我去台北` succeed; unlisted orders fail; partial/repeated selection fails; retry/next/restart and attempt counting remain correct. Shuffle never starts with any accepted sentence. |
| Task rendering and lifecycle | Component, controller, route tests | Exact Japanese copy above the well; safe text rendering; no unreviewed string in serialized payload/DOM; per-item updates and completion clearing. No extra focus stops or answer disclosure. |
| UI containment/accessibility | Browser visual/a11y evidence | 320px, 375px, desktop; light/dark; long meanings, punctuation and buttons visible without overlap/truncation; keyboard Enter/Space, accessible names, focus, feedback and navigation. |
| Rebuild/provenance/dirty safety | Unicode manifest, mechanical and downstream artifacts | CLI self-tests and byte-identity checks; stale checksum fails; source/selector provenance consistent; unrelated files survive; failed publication restores owned outputs. Any changed plan keeps human review gates intact. |

Future data/schema/UI implementation requires classifier-selected full validation and independent exact-head engineering review of this entire surface. Neither replaces the teacher's field-level artifact.

## Owner decisions before implementation

1. Adopt or revise the proposed `fieldReviews` shape/version binding, and name the human language reviewer. No candidate is approved by this packet.
2. Freeze the teacher's exact meanings/alternatives. In particular, resolve request-versus-desire wording for `要`, contextual objects in quantity items, and the baseline naturalness of `practice-023`; a canonical Chinese correction would invalidate lesson/source reconciliation and needs separately frozen scope.
3. Authorize the necessary Unicode checksum/mechanical/downstream rebuild scope. Decide whether its allowlist should also extract the new optional `meaningJa` (`ja`) and alternatives (`zh-Hant`) with `optional: true`; the present selectors do not include them. Freeze that choice before production changes and preserve all existing checksum guards and human-review boundaries.
