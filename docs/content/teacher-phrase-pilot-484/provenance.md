# Per-field draft provenance

## Teacher source

Every `simplified` field retains the exact #478 workbook `sourceRef` and the approved [teacher-source rights evidence](https://github.com/nurockplayer/Chabiko/issues/340#issuecomment-5279951072), refreshed live during preparation. The selected raw cells and source ranges are recorded in `selection.json`; no teacher text was corrected. That permission does not assert that generated translations or script variants have been human-verified.

## Generated fields

Codex prepared 72 candidate fields (Traditional, pinyin, Japanese for 24 units) on 2026-09-05 for this user-authorized pilot. No external dictionary, translation corpus, or word-level pinyin/Japanese metadata was copied. Every generated field has a distinct `sourceRef` of the form `codex-draft:issue-484:v1:<exact phraseId>:<field>`, resolving to that phrase and field in `candidates.json`. These are attributable AI drafts, not teacher-authored or human-verified material.

Pinyin draft convention: lexical tone marks, neutral tones where written, no contextual third-tone or 一/不 sandhi respelling; years read digit by digit. Japanese meanings describe each complete source unit. Reviewers must check both the intended meaning and source suitability; a fluent translation must not hide a flawed Chinese original.

## Generated rights pending

The exact per-field `rightsRef` points here. [Issue #484](https://github.com/nurockplayer/Chabiko/issues/484) authorizes AI candidate preparation. It is not a derivative-publication license or a source-review approval. Generated-field reuse/rights and attribution remain **pending genuine human-source-reviewer verification**. The current draft must not be promoted. No external licensing claim is inferred or fabricated.

Any later rights evidence or `generated` → `verified` provenance change changes reviewVersion. Preserve this draft snapshot; prepare a new candidate with actual human verification/rights references, recompute the version and full sidecar hash, and obtain all required exact-version human evidence for that new candidate before maintainer promotion. Approval of this draft alone cannot clear the generated-field gate.
