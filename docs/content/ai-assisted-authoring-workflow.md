# AI-Assisted Authoring Workflow

**Status:** Draft for #119
**Last updated:** 2026-07-24
**Alignment:** #6 Content Outcome, #11 Human Content Review, #18 Dual-Script and Regional Variant Strategy

---

## 1. Purpose

本文件定義 Chabiko 的 AI-assisted content authoring pipeline，從 source specification 到 final engineering review。每個階段有明確的 owner、deliverable 與 quality gate，任何單一模型或個人不得跳過階段或合併角色。

### Related Documents

| Document | Relationship |
|----------|--------------|
| [content-model-draft.md](content-model-draft.md) | 定義 executable schema、provenance fields 與 reviewStatus values |
| [dual-script-and-regional-variant-strategy.md](dual-script-and-regional-variant-strategy.md) | 定義 script form 與 regional usage 策略 |
| [japanese-native-pain-point-taxonomy.md](japanese-native-pain-point-taxonomy.md) | 定義 controlled pain-point taxonomy，於 content review 時套用 |

---

## 2. Seven-Stage Pipeline

### Stage 1: Source Specification

**Owner:** Maintainer / PM

在模型產生任何內容前，maintainer 或 PM 必須提供完整的 source specification：

- **Learner context** — 精確 persona、日語程度（CEFR／概略等級）、target path
- **Scenario scope** — 單一有邊界的 scenario 或 content outcome，非開放式領域
- **Record count** — 要求的 candidate 或 record 數量
- **Schema constraints** — 當前 executable schema 版本與相關 controlled values
- **Deduplication guard** — 需先檢視既有相關內容再建立新項目
- **Script policy** — Taiwan-first 或 Simplified-first，依 [#18](dual-script-and-regional-variant-strategy.md)
- **Coverage matrix** — 必要的 topic、scenario 或 linguistic feature
- **Prohibitions** — out-of-scope fields、unsafe domains、unsupported certainty claims
- **Initial status** — 輸出內容應使用的 provenance 與 reviewStatus 值

模型不得在生成過程中選擇新的 product scope、schema、scenario set 或 publication policy。

### Stage 2: Gemini Candidate Generation

**Owner:** Gemini

Gemini 僅負責 candidate content 的 ideation 與 language analysis。其輸出受 Stage 1 specification 約束，且必須保持在外於 production data 的位置。

每個 candidate 在適用時必須包含：

- Traditional Chinese candidate
- Simplified Chinese candidate
- Tone-marked pinyin candidate
- Natural Japanese explanation
- Usage context
- Taiwan/Mainland usage difference candidate（僅在教學上有用時）
- Fallback or recovery use（必要時）
- Ambiguity、confidence 或 review warnings
- Coverage rationale

**Output status：** Gemini 輸出必須使用 `draft` 狀態，不得對任何內容指派 `reviewed` 或 `published`。

**Delivery：** Gemini 輸出儲存在 repository 外部或 non-production branch，不得提交至 production content files。

### Stage 3: Maintainer Selection and Canonical Freeze

**Owner:** Maintainer / PM

Maintainer 或 PM 必須：

1. 從 Gemini candidates 中選擇要實作的精確 records
2. 處理 duplicates 與 coverage gaps
3. 凍結 canonical learner-facing strings（Traditional、Simplified、pinyin、Japanese）
4. 標記需要 human language review 的欄位
5. 建立或更新一份 DeepSeek Flash 可執行的 implementation issue

**Canonical freeze rules：**

- 凍結後的 implementation issue 是 repository 變更的唯一 source of truth
- 原始 Gemini output 不是 source of truth
- 所有 content-selection 與 product decisions 必須在 issue 到達 DeepSeek Flash 前解決
- Issue 必須包含精確的 canonical strings，不得僅參照外部輸出

### Stage 4: DeepSeek Flash Implementation

**Owner:** DeepSeek Flash（`deepseek-v4-flash`）

DeepSeek Flash 僅負責機械性的 repository implementation：

- 將 frozen records 精確寫入允許的 content files
- 保留 canonical strings，除非發現客觀可證明的缺陷
- 套用既有的 schema、IDs、statuses、provenance 與 controlled values
- 執行所有必要的 validators 與 repository checks
- 避免無關的 content expansion、rewriting、refactors 或 UI 工作

**Hard stop conditions：**

DeepSeek Flash 必須停止並回報 blocker，當：

- Canonical issue 與 executable schema 衝突
- Frozen specification 遺漏必要欄位
- Frozen content 無法在不修改的前提下通過 validation

上述情況發生時，Flash 將問題退回 maintainer（Stage 3）並附上具體衝突。Flash 不得自行修正 schema 衝突或填補未指定的欄位。

### Stage 5: DeepSeek Pro Reviewer

**Owner:** DeepSeek Pro reviewer subagent（`deepseek-v4-pro`）

獨立的 read-only reviewer 必須審查完整 diff，檢查以下項目：

- Issue-scope compliance
- Schema 與 provenance 正確性
- Chinese、pinyin 與 Japanese 跨欄位一致性
- 明顯的 Taiwan/Mainland usage mismatch
- 無根據的 certainty 或 invented claims
- Duplicate 或 over-broad content
- 不正確的 status promotion
- 缺少 validation evidence

**Completion gate：**

> `No blocking findings.`

此 verdict 僅代表 reviewer 在 diff 中未發現 blocking issue，不等於 native-speaker certification，也不得自動將 content status 改為 `reviewed` 或 `published`。

**Reviewer constraints：**

- Read-only：不得編輯檔案或核准 human provenance
- 每個 cycle 一次 review：修正 blocker 後執行一次全新 review
- 不得將 content status promotion 至 `draft` 以外

### Stage 6: Human Language Review and Publication Status

**Owner:** Human language reviewer

AI-authored content 以 `draft` 狀態開始，除非 maintainer 已提供 pre-reviewed canonical text。Model-to-model review 本身不能建立 human review provenance。

**Human review triggers（在 promotion 至 `reviewed` 或 `published` 前必要）：**

| Category | Examples |
|----------|----------|
| Medical | 感冒、藥局、醫院 等 |
| Emergency | 救命、報警、火災 |
| Police / immigration | 護照、簽證、報案 |
| Legal / financial dispute | 罰款、契約、糾紛 |
| Culturally sensitive | 政治、宗教、族群 等 |
| Pronunciation-sensitive | Minimal pairs that change meaning |
| Regional usage | Taiwan/Mainland vocabulary choices |
| Script provenance | Any `generated` → `verified` promotion |

**Provenance recording：**

Human reviewer identity 或 review artifact 必須依 [#11](https://github.com/nurockplayer/chabiko/issues/11) 記錄後，才能進行 status promotion。

### Stage 7: Final Engineering Review

**Owner:** Codex

Codex 保留給 PR merge 前的最終獨立審查。Codex 審查 repository correctness 與 integration risk，不取代 human language approval。

Codex 必須確認：

- 未在允許 scope 之外修改 production content、schema、UI、runtime AI integration、dependency 或 unrelated behavior
- 所有 validation commands 通過
- Reviewer verdict（`No blocking findings.`）存在於 PR 中

Codex findings 改變 semantics、specification 或 public contract 時，需要修正並重新審查後才能 merge。

---

## 3. Responsibility Matrix

| Role | Owns | Deliverable | Must not do |
|------|------|-------------|-------------|
| **Gemini** | Candidate generation, alternatives, coverage analysis, language warnings | Bounded candidate set with coverage rationale and warnings | Write production files, assign final review status, invent product scope |
| **Maintainer / PM** | Record selection, canonical string freeze, exact issue contract | Frozen implementation issue with exact canonical content | Delegate unresolved content choices to implementation agent |
| **DeepSeek Flash** | Mechanical implementation and validation | Validated content files matching frozen specification | Select content, broaden scope, self-certify language review, silently fix schema conflicts |
| **DeepSeek Pro reviewer** | Read-only blocking review | `No blocking findings.` verdict or list of blockers | Edit files, approve human provenance, publish content, claim native-speaker authority |
| **Human language reviewer** | Language, regional, cultural, and risk-sensitive approval | `reviewed` status assignment with reviewer identity | Be replaced by model consensus; approve without verification |
| **Codex** | Final PR engineering review | Independent engineering review verdict | Serve as the sole content-language authority |

---

## 4. Prompt Templates and Checklists

### 4.1 Gemini Candidate-Generation Prompt Template

> **Template only.** Replace `{{PLACEHOLDER}}` values before use. Do not submit this template with example content filled in.

~~~
You are generating candidate content for Chabiko, a Chinese-learning app for Japanese speakers.

## Learner Context
- Persona: {{PERSONA_NAME}}
- Japanese proficiency: {{PROFICIENCY_LEVEL}}
- Target path: {{PATH_NAME}} (Traditional-first or Simplified-first per path default)

## Scenario
- Topic: {{TOPIC}}
- Outcome: {{DESIRED_OUTCOME}}
- Requested candidate count: {{COUNT}}

## Schema Constraints
- Content type: {{VOCABULARY|SENTENCE|PHRASEBOOK|PRACTICE}}
- reviewStatus: "draft" only. Do not assign "reviewed" or "published".
- Provenance: Use "generated" for all generated fields unless provided as canonical.

## Deduplication
Review the following existing content before generating:
{{EXISTING_IDS_OR_PATHS}}

Do not generate duplicates of existing content.

## Coverage Matrix
{{REQUIRED_COVERAGE}}

## Prohibitions
- Do not generate claims about medical efficacy, safety, or legal procedures
- Do not invent pinyin or pronunciation that you cannot verify
- Do not assign "reviewed" or "published" as reviewStatus
- Do not choose or expand the product scope

## Output Format
For each candidate, include where applicable:
1. Traditional Chinese string
2. Simplified Chinese string
3. Tone-marked pinyin
4. Natural Japanese explanation
5. Usage context
6. Taiwan/Mainland difference note (only when pedagogically useful)
7. Fallback or recovery use note
8. Ambiguity, confidence, or review warning
9. Coverage rationale

Output as a JSON array of candidate objects. Do not write to any file.
~~~

### 4.2 Maintainer Canonical-Freeze Checklist

~~~markdown
## Pre-Freeze Checklist

- [ ] Learner context confirmed — persona, proficiency, and target path match the content outcome
- [ ] Gemini candidates reviewed — duplicates and low-quality candidates rejected
- [ ] Exact record count decided
- [ ] Canonical strings frozen:
  - [ ] No unresolved transliteration or translation
  - [ ] Taiwan/Mainland usage resolved per dual-script strategy
  - [ ] Script form provenance decision made per record
- [ ] Schema compliance verified — frozen strings fit existing schema and controlled values
- [ ] Deduplication confirmed — no overlap with existing published or in-progress content
- [ ] Coverage gaps resolved — required scenarios are covered or explicitly deferred
- [ ] Initial status assigned — reviewStatus = "draft"; provenance = "generated" unless human-supplied
- [ ] Implementation issue created — contains exact canonical content, not Gemini output references
- [ ] Human review fields flagged — content requiring human language review is marked

## Gate
Do not proceed to Stage 4 if any checkbox is unchecked.
~~~

### 4.3 DeepSeek Flash Implementation Prompt Template

> **Template only.** Replace `{{PLACEHOLDER}}` values before use. Do not submit this template with real content filled in.

~~~
You are implementing frozen canonical content in the Chabiko repository.

## Source of Truth
- Implementation issue: {{ISSUE_REFERENCE}}
- Content file: {{TARGET_FILE}}

## Task
Write the exact frozen records from the implementation issue into the target content file.

## Rules
1. Preserve canonical strings exactly. Do not rephrase, rewrite, select characters, or fill gaps.
2. Apply existing schema. Use controlled values, required fields, and valid statuses.
3. Set reviewStatus to "draft". Do not assign "reviewed" or "published".
4. Set provenance to "generated" for all generated fields unless the issue explicitly supplies "authored" or "verified".
5. Do not expand scope. Do not add related content, cross-references, or bonus entries.
6. Validate. Run the required validators after writing.
7. Report blockers. If the frozen specification conflicts with the schema or leaves a required field unresolved, stop and report the exact conflict.

## Prohibited
- Do not select content, choose scenarios, or make product decisions
- Do not self-certify language review
- Do not change reviewStatus or provenance beyond what the issue specifies
- Do not add unrelated content, refactor existing files, or modify UI
~~~

### 4.4 DeepSeek Pro Reviewer Checklist

~~~
## Review Scope
- Current diff: {{DIFF_REFERENCE}}
- Issue: {{ISSUE_REFERENCE}}
- Changed files: {{FILES}}

## Review Checklist

### Issue-Scope Compliance
- [ ] All changes are within the issue scope
- [ ] No unrelated files were modified
- [ ] No UI, schema, validator, package, CI, or runtime integration changes (unless explicitly in scope)

### Schema and Provenance
- [ ] All new records use valid controlled values
- [ ] reviewStatus is "draft" (not "reviewed" or "published") unless the issue supplied human-reviewed canonical strings
- [ ] Script provenance fields (traditionalStatus/simplifiedStatus) are correct and non-contradictory
- [ ] Required fields are present and non-empty

### Cross-Field Consistency
- [ ] Traditional, Simplified, pinyin, and Japanese strings are internally consistent
- [ ] No obvious Taiwan/Mainland usage mismatch
- [ ] Pinyin matches the Chinese text (no invented readings)

### Content Integrity
- [ ] No unsupported certainty or invented claims
- [ ] No duplicate records (compared to existing content)
- [ ] No over-broad or out-of-scope content

### Validation
- [ ] Repository validators pass on the changed files
- [ ] No validation was skipped or suppressed

## Verdict
If any finding is blocking, list each with its file, line, and reason.
Otherwise, report exactly:

No blocking findings.

This verdict confirms no blocking issue was found. It is not a native-speaker certification and does not change content status.
~~~

---

## 5. Status Transitions

### 5.1 reviewStatus Values

| Status | Meaning | Eligible assignor |
|--------|---------|-------------------|
| `draft` | Initial or in-progress. Not production-ready. | Any model or maintainer |
| `reviewed` | Human language reviewer has approved. Ready for path assignment. | Human reviewer only |
| `published` | Live in production for a specific path. | Maintainer / PM |

### 5.2 Allowed Transitions

`draft` --(human reviewer)--> `reviewed` --(maintainer)--> `published`
`draft` --(maintainer)--> `reviewed` (when canonical strings are pre-reviewed)
`reviewed` --(human edits)--> `draft` (revision opens in new cycle)

### 5.3 Forbidden Transitions

- `draft` --(any model)--> `reviewed` — Model-to-model review cannot promote
- `draft` --(any model)--> `published` — No model may publish
- `draft` --(DeepSeek Pro reviewer)--> `reviewed` — Reviewer is read-only; verdict is not approval
- `reviewed` --(any model)--> `published` — Publication requires human action

### 5.4 Script Provenance Transitions

| From | To | By | Result |
|------|----|----|--------|
| `generated` | `verified` | Human verifier | Allowed |
| `generated` | `verified` | Any model | Forbidden — verification requires human judgment |
| `generated` | `authored` | Any actor | Forbidden — "authored" implies original human authorship |
| `verified` | `draft` | Human editor | Allowed — re-edited content re-enters as draft |
| `unavailable` | `authored` | Human author | Allowed |
| `unavailable` | `verified` | Any actor | Forbidden — must be authored or generated first |

---

## 6. Failure Behavior

### 6.1 Ambiguous or Conflicting Model Outputs

| Situation | Behavior |
|-----------|----------|
| Two Gemini runs produce different candidates for the same specification | Maintainer selects or merges in Stage 3. Both outputs remain drafts. |
| DeepSeek Flash cannot parse the frozen specification | Stop. Report exact conflict to maintainer (Stage 3). Do not guess. |
| DeepSeek Pro reviewer disagrees with another model's output | Reviewer lists specific blockers. Flash fixes blockers; reviewer re-checks. If unresolved, escalate to maintainer. |

### 6.2 Required Fields Missing

| Situation | Behavior |
|-----------|----------|
| Gemini omits a required field from the template | Stage 2 output is incomplete. Maintainer rejects or supplements in Stage 3. |
| Frozen specification lacks a required schema field | Flash reports blocker to maintainer. Specification updated in Stage 3 before re-implementation. |
| Validator detects missing fields after Flash implementation | Flash fixes or reports schema conflict. If schema is correct and specification was wrong, return to Stage 3. |

### 6.3 Human Review Unavailable

| Situation | Behavior |
|-----------|----------|
| No human reviewer is available for a required-review category | Content remains `draft`. Must not be promoted to `reviewed` or `published`. |
| Human review is partially available (some fields reviewed, others not) | Only reviewed fields may be promoted. Unreviewed fields stay `draft`. |
| Deferred human review becomes available later | Content may be promoted after review is recorded. No back-dating of review dates. |

### 6.4 Validator Failures

| Situation | Behavior |
|-----------|----------|
| Validator fails after Flash implementation | Flash fixes the issue and re-runs validation. If the fix requires changing frozen canonical strings, return to Stage 3. |
| Validator passes but reviewer identifies a semantic issue | Reviewer lists the blocker. Flash fixes (if mechanical) or escalates to maintainer (if requires content decision). |
| Validator itself has a bug | Report the validator bug separately. Do not bypass validation. Do not modify the validator as part of content work. |

---

## 7. Key Boundaries

- **Gemini output** is never a production candidate artifact. It must be selected and frozen by a maintainer before implementation.
- **DeepSeek Flash** must not select characters, rephrase, or fill unspecified content. It implements frozen canonical strings verbatim.
- **DeepSeek Pro `No blocking findings.`** confirms no blocking issue in the diff. It does not equal human language approval and does not change content status.
- **AI-to-AI review** alone cannot promote content to `reviewed` or `published`. Human approval is required.
- **Templates** in this document use `{{PLACEHOLDER}}` syntax. They are workflow artifacts, not production content generators.

---

*This document is part of the Chabiko content architecture. It should be reviewed when model capabilities change, when new content types are added, or when human review capacity changes.*
