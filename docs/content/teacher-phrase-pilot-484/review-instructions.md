# Genuine human review instructions

Status: **HUMAN_GATE**. No role has reviewed any candidate. Model audits and deterministic tests are preparation evidence only. Start with `reviewer-packet.md`; `candidates.json` has the exact per-field provenance and `selection.json` preserves the source-only identities frozen before enrichment in commit `d1bee2e`.

## Required roles and response

- `human-language-reviewer`: Mandarin meaning/pinyin and natural Japanese meaning. Explicitly cover both languages; identity must identify a real person with appropriate competence.
- `human-script-verifier`: Simplified/Traditional equivalence, script correctness, regional readings and pinyin conventions.
- `human-teaching-reviewer`: beginner suitability, contextual meaning, social/pragmatic tone and whole-cell suitability.
- `human-source-reviewer`: workbook/source identity, sourceRevision, exact per-field generation/source/rights evidence and permission to publish derivatives.

Each real reviewer should return: role, identity, ISO date, learnerId, exact reviewVersion, complete ordered phrase IDs, accepted/needs-changes/rejected outcome, concrete findings/corrections, minutes spent, and whether this packet was understandable without engineering help. Source review also binds sourceRevision. Copy exact IDs/versions from `human-review.json`; do not invent a reviewer identity or date. Unreviewed roles remain `not-reviewed` with null attribution/version/findings and empty reviewed IDs. Maintainer overall acceptance and explicit promotion are separate actions, both currently null.

For **each 名词2 cell** (251 and 272), explicitly choose **accept whole cell as one learner phrase unit** or **reject the cell as unsuitable for promotion under the current contract**. Record this in the `human-teaching-reviewer` findings and set that role's outcome accordingly. Do not mark a rejected or segmentation-dependent cell accepted. If internal segmentation is needed, keep the cell rejected, record the need as pilot evidence/follow-up and leave the exact selection unchanged. No substitutions to reach 12 promoted cells. There is no new segmentation or suitability schema in #484.

## Source issues to inspect (AI preparation flags, not human findings)

- 名词2:251 `帮你找好对象`: candidate Japanese takes `好对象` as a good romantic partner; `找好` may instead indicate completing the search. Confirm intended meaning from teacher context, whether the fragment is suitable as a whole unit, and social appropriateness. Do not silently decide the ambiguity in the source layer.
- 名词2:272 `这是代表2020年的词`: year-specific context and the referent of `这` are unspecified. Confirm whether one whole learner unit is useful without invented context. The year is preserved exactly.
- 形容词2:3 `好棒啊！！日本队有得分了。`: check naturalness/regional suitability of `有得分了`; it is not rewritten as `又得分了`. The entire first LF unit, including both punctuation-delimited clauses, stays one unit.
- 动词2:3 `我是爷爷奶奶把我养大的`: check the marked/awkward `是…把…` construction. Japanese expresses the apparent intended meaning; that does not certify the Chinese as suitable. Preserve the source and reject if necessary.
- 名词1:3 `我们是人`: assess practical/contextual teaching value rather than changing an odd source merely because translation is possible.
- The pinyin uses lexical tones, neutral syllables where shown, and digit-by-digit year readings. Verify regional preferences (for example `知道`) and word spacing. No inferred spoken recording or phonetic equivalence claim is made.

## Exact-version semantics and next action

This packet freezes **generated** candidates. Even all-positive human comments on this version cannot directly promote them: #479 rejects generated learner-visible fields. After genuine review, a maintainer may apply only approved corrections and actual human verification/rights references to a new candidate; changing text or any field provenance (including `generated` → `verified`) changes reviewVersion. Recompute the full sidecar digest and obtain all required role decisions for that final exact version. Never copy old approvals onto a changed version. Preserve this historical frozen draft; do not overwrite it or run `--freeze` over human evidence.

A rejected/partial/stale cell remains on raw `example`; it is not replaced. Once exact accepted role evidence, overall acceptance and explicit maintainer promotion actually exist, follow [the canonical #479 workflow](../../../scripts/build-teacher-phrase-projection.md). No production promotion command is authorized by this pending packet alone.

## Preparation / deterministic check

```bash
uv run --locked python scripts/teacher_phrase_pilot.py --check
uv run --locked python scripts/teacher_phrase_pilot.py --check --workbook /absolute/path/to/canonical-workbook.xlsx
uv run --locked python tests/python/test_teacher_phrase_pilot.py
```

Offline `--check` verifies frozen bytes, versions, provenance and pending evidence. The workbook-backed check additionally reselects from the complete canonical corpus, validates raw/base identity, applies exactly 12 overlays and proves zero promotion. To reproduce the full #478 candidate sidecar for future review, add `--materialize-sidecar /absolute/path/outside/repository/new-sidecar.json` to the workbook-backed check. Output must not already exist; no production or neighboring file is overwritten. The sidecar contains all source-only coverage required by #478 but only these 12 cells are enriched.

Initial preparation used `--freeze --workbook ...` once, after selection freeze and candidate checks; it refuses existing review artifacts. Later corrections require a new review preparation, not rewriting this frozen HUMAN_GATE snapshot.

## Measured pilot evidence

12 selected cells, 24 source units, 72 AI-generated candidate fields. Human corrections, whole-cell accept/reject outcomes, reviewer effort, packet clarity, final suitability and next-wave size are **unmeasured/pending**. Do not infer zero corrections from no review. Any next-wave recommendation must wait for measured review evidence; no bulk enrichment is authorized.
