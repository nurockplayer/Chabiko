# Dual-Script and Regional Variant Strategy

**Status:** Draft for #18
**Last updated:** 2026-07-10
**Based on:** #13 Japanese Learner Personas and JTBD, #14 Japanese-Native Pain-Point Taxonomy, #24 Per-Form Script Provenance, #25 Issue Index Traceability
**Alignment:** Phase 1 plan 01-04

---

## 1. Purpose

This document defines Chabiko's strategy for handling two separate but related dimensions of Chinese-language variation:

1. **Script form** — Traditional Chinese (繁體字/正體字) vs Simplified Chinese (简体字/簡体字), a difference in character shape.
2. **Regional usage** — Taiwan Guoyu (臺灣國語/台灣國語) vs Mainland Putonghua (普通話), a difference in vocabulary choice, pronunciation, and expression.

A third dimension — **product UI language** — is always Japanese-first and independent of the above two. This document explicitly separates these three concerns so that implementation decisions in later phases (#22 global script toggle, #17 learning paths) have clear boundaries.

---

## 2. Three Independent Dimensions

| Dimension | What it affects | Learner-facing behavior |
|-----------|-----------------|------------------------|
| **Script form** | Character shape: 繁體 vs 简体 (e.g., 歡迎 vs 欢迎) | Toggle changes how Chinese content is displayed. Does not change vocabulary or pronunciation. |
| **Regional usage** | Vocabulary choice and pronunciation (e.g., 計程車 vs 出租車, 捷運 vs 地鐵) | Determines which regional variant is shown on region-aware paths. Not a toggle — content is authored per region with awareness notes where useful. |
| **Product UI language** | Navigation, labels, explanations, instructions | Always Japanese. Never affected by script toggle or regional usage settings. |

### 2.1 Script Form (Traditional / Simplified)

Script form is a **display transformation of character shapes**, not a change of language or vocabulary. A word like 電腦 in Traditional is 电脑 in Simplified — same word, same pronunciation, different character shapes.

- The **global script toggle** (planned #22) switches Chinese content display between Traditional and Simplified where both forms exist in authored/verified provenance.
- The toggle affects **Chinese learner-facing content only**. Product UI (Japanese explanations, labels, navigation) remains in Japanese regardless of the toggle state.
- The toggle is a **display preference**, not a content filter. Switching to Simplified does not switch the learner to Mainland vocabulary — it merely shows the Simplified character shapes for whatever content is being viewed.
- The toggle must respect per-form provenance (see section 6). Toggling to a form with `generated` status must not be allowed in production.
- Pinyin is unaffected by the script toggle. When a content entry has separate script forms, each form's pinyin is identical (same word, same pronunciation). For entries where regional pronunciation differs (e.g., 垃圾 lèsè in Taiwan vs lājī in Mainland), the pinyin difference is a regional usage concern, not a script toggle concern — see section 2.2.

### 2.2 Regional Usage (Taiwan / Mainland)

Regional usage is a **content selection and authoring dimension**, not a display transform. A learner on the Taiwan travel path sees 計程車 (Taiwan term); a learner on the HSK path sees 出租車 (Mainland term) for the same concept.

- Regional usage is determined by **path membership and content authoring**, not by a toggle.
- One content entry may have separate Taiwan and Mainland variants, each with its own script forms, pinyin, and usage notes.
- Where useful, a content entry can display a contrastive note (e.g., "台灣說『計程車』，中國大陸說『出租車』") to build cross-variant awareness.
- Contrastive notes must not overload the learner. For P1 (Taiwan Travel Learner) on the Taiwan travel path, Mainland variants should be shown only when the learner would realistically encounter both (e.g., airport signs, hotel check-in where staff may use Mainland terms).
- Regional usage is **independent of script form**. Taiwan content is typically in Traditional script, but the two dimensions are not locked together — a Taiwan-specific vocabulary entry may have both traditional and simplified forms.

### 2.3 Product UI Language (Japanese-First)

- **Always Japanese.** Navigation labels, lesson explanations, practice instructions, error messages, and help text are in Japanese.
- The script toggle (Traditional / Simplified) must never change the UI language.
- The regional usage setting must never change the UI language.
- This is non-negotiable: Chabiko is built for Japanese speakers, not for generic Chinese learners or bilingual users.

---

## 3. Path Defaults

Each learning path can define defaults for both script form and regional usage. The defaults apply when a learner first enters the path. Manual override (see section 4) applies to **script form only** — regional usage is path-defined and cannot be toggled independently.

| Path | Default Script | Default Regional Usage | Rationale |
|------|----------------|------------------------|-----------|
| **Taiwan travel** (#6) | Traditional | Taiwan | Taiwan uses Traditional script and Taiwan-specific vocabulary. Learner needs to read real-world signs and menus. |
| **HSK / general Mandarin** | Simplified | Mainland | HSK is a Mainland China standard test; most textbooks use Simplified. Mainland vocabulary is the baseline for HSK listening/reading. |
| **School / university support** | Simplified | Mainland | Most Japanese university Mandarin courses follow PRC-based Beijing curriculum and use Simplified characters. |
| **Business / service** | Path-dependent | Path-dependent | Depends on whether the learner interacts with Taiwan-based or Mainland-based clients. Learner selects a regional-specific business path (e.g., Taiwan-business or Mainland-business). |
| **Study-abroad** | Path-dependent | Path-dependent | Simplified if studying in Mainland China, Traditional if studying in Taiwan. Regional usage follows the destination country. |

### 3.1 Path Default Interaction with Content

- Path defaults apply at the **content selection level** for regional usage and at the **display level** for script form.
- For regional usage: the path determines which variant of a vocabulary entry or phrase is shown as primary. The alternate variant, where authored, can be displayed as a secondary note.
- For script form: the path sets the initial toggle position. The learner can switch freely.
- Paths do not override provenance. A path default of Traditional still requires `authored` or `verified` Traditional content. The default only selects which qualified form to display first.

---

## 4. Manual Override vs Path Default

### 4.1 Global Script Toggle (Planned #22)

- A global toggle lets learners switch script display at any time.
- The toggle is a **learner preference**; manual choice overrides the path default (see section 4.3 for precedence).
- The toggle affects **Chinese learner-facing content only**. Product UI remains in Japanese regardless of toggle state.
- Path-switch behavior (whether toggle resets or preserves on path change) is deferred to #17/#22.

### 4.2 Regional Usage

- Regional usage is **path-defined**, not toggled. There is no global "Taiwan / Mainland" switch, and learners cannot manually override regional usage independently of path selection.
- Learners choose their regional usage context by selecting a learning path. To change regional usage, the learner selects a different path.
- Individual content items may show both variants with contrastive notes where useful, but the primary variant is determined by path membership.

### 4.3 Override Precedence

```
Learner's manual toggle choice  →  highest priority
Path default                    →  applied if learner has not made an explicit choice
App-level default               →  applied if no path default exists (currently: Traditional, since P1 is the primary persona)
```

---

## 5. Fallback Behavior

When a content record has one script form marked as `unavailable` (see #24 per-form provenance):

1. **Single-form fallback:** If the learner's current toggle or path default requests the unavailable form, the available form is shown instead with a clear annotation indicating the original script variant (e.g., "この単語は簡体字のみ利用可能です" or an icon-based indicator).

2. **Both forms unavailable:** The record must be excluded from the display. A broken entry with no displayable Chinese text must not appear.

3. **Fallback annotation requirements:**
   - Must not misrepresent provenance — a Traditional-first item shown in Simplified during fallback must carry a UI indicator that the original was Traditional.
   - When a content item is shown in the non-primary script, the annotation should indicate this is a fallback, not the authored default.

4. **Forbidden fallback targets:**
   - A form with `generated` status must never be used as a fallback target for an `unavailable` form unless it has first been promoted to `verified`.
   - A form with `unavailable` status displayed as fallback must not be used as the basis for practice scoring or assessment.

5. **No-available-form exclusion:** If the requested form is `unavailable` and the other form is also `unavailable` or `generated`, no displayable form exists. The entry must be excluded from rendering and flagged for content review.

6. **Fallback is a temporary measure** for content gaps, not a permanent display strategy. Content missing one script form should be prioritized for authoring/verification.

---

## 6. Relationship with Per-Form Provenance

The provenance system (#24) defines four statuses per script form: `authored`, `verified`, `generated`, `unavailable`. This strategy defines how those statuses interact with the toggle and path defaults.

| Provenance Status | Toggle / Display Eligibility | Path Default Eligibility |
|-------------------|------------------------------|-------------------------|
| `authored` | Full eligibility. Can be the primary display form. | Full eligibility. |
| `verified` | Full eligibility. May be the primary display form. | Full eligibility. |
| `generated` | **Not eligible** for learner-facing display. May appear in authoring previews only. | Not eligible. |
| `unavailable` | Not directly displayable. Triggers fallback (section 5). | Cannot be the default display. |

### 6.1 Toggle-Provenance Interaction

- The toggle must only switch to an `authored` or `verified` form.
- If the toggled-to form is `generated`, the toggle must remain on the current form.
- If the toggled-to form is `unavailable`, fallback rules apply (section 5).
- Provenance is authoring metadata and is independent of the toggle. A `verified` Traditional form remains `verified` even when the learner is viewing the Simplified form.

### 6.2 Path Default-Provenance Interaction

- Path defaults do not override provenance. A Traditional-first path still requires `authored`/`verified` Traditional content.
- If the path default form is `generated` or `unavailable` for a given content item, the path's default is temporarily unsatisfied, and the fallback or availability logic applies per item.
- Content review workflows should flag cases where a path's default form is missing or unverified.

---

## 7. No Unreviewed Runtime Conversion

**This is a hard rule.** Chabiko must never perform automated Traditional ↔ Simplified conversion on Chinese content for learner-facing production display.

### 7.1 What This Means

- No on-the-fly conversion library (e.g., OpenCC, TongWen, or similar) may be used to generate production learner-facing text.
- No browser-level or JavaScript-level conversion of Chinese characters for learner display.
- No CSS-level font substitution that attempts to convert between script forms.

### 7.2 What Is Allowed

- **AI-assisted or tool-assisted conversion for authoring.** An authoring script may use OpenCC or an LLM to generate a draft Simplified version from an authored Traditional version. The output is a draft that must be reviewed and promoted to `verified` before it reaches production.
- **Editorial preview.** Authoring tools and admin interfaces may show converted text to help authors decide whether to verify it.
- **Static generation at build time.** If the build process converts content and the output is reviewed before deployment, this is equivalent to authoring — the output must be stored in the content file with `verified` status.

### 7.3 Why This Rule Exists

- Automated conversion is lossy. A single character may map to multiple forms depending on context and region.
- Conversion misses vocabulary differences that are regional, not script-based (e.g., 資訊 → 信息 is not a script conversion).
- Unreviewed conversion creates a trust problem: learners cannot rely on the accuracy of the displayed Chinese text.
- The per-form provenance system (#24) depends on authorship and review — runtime conversion bypasses this entirely.

---

## 8. Implementation Boundaries

This document defines the **strategy** for dual-script and regional variant handling. It does not define the implementation. The following boundaries separate strategy from implementation:

### 8.1 What This Strategy Governs

- What the script toggle does and does not affect (section 2.1)
- How path defaults are determined (section 3)
- How manual override relates to path defaults (section 4)
- Fallback rules when a script form is unavailable (section 5)
- How provenance interacts with display (section 6)
- The no-runtime-conversion rule (section 7)

### 8.2 What This Strategy Does NOT Define (Deferred to #22)

- UI component design for the global script toggle
- Toggle placement, iconography, or interaction pattern
- Toggle persistence mechanism
- Toggle animation or transition behavior
- How the toggle communicates provenance status to the learner in the UI

### 8.3 What This Strategy Does NOT Define (Deferred to #2)

- Full executable schema for content validation
- Complete field-level validation rules for all content types
- Schema-level enforcement of provenenace constraints
- Integration of script status validation into the broader content schema

### 8.4 What This Strategy Does NOT Define (Deferred to #17)

- How learning paths are selected, created, or managed in the UI
- How path membership determines content filtering or sequencing
- How path defaults are presented to the learner during path selection
- Path switching behavior and its effect on toggle state (only the precedence rule in section 4.3 is defined here)

---

## 9. Content Examples

### 9.1 Taiwan Travel Phrase — Traditional + Taiwan Usage

```jsonc
{
  "id": "phrase-travel-001",
  "scenario": "transport",
  "traditional": "請問到台北車站要怎麼走？",
  "traditionalStatus": "authored",
  "simplified": "请问到台北车站要怎么走？",
  "simplifiedStatus": "verified",
  "pinyin": "Qǐngwèn dào Táiběi Chēzhàn yào zěnme zǒu?",
  "japanese": "台北駅までどうやって行きますか？",
  "usageNotesJa": "台湾で道を尋ねる基本的なフレーズ。",
  "painPointTags": []
}
```

**Path context:** Taiwan travel path. Default display: Traditional. Learner can toggle to Simplified to see the character comparison.

### 9.2 Taiwan-Specific Vocabulary — with Mainland Contrast

```jsonc
{
  "id": "voc-region-001",
  "traditional": "計程車",
  "traditionalStatus": "authored",
  "simplified": "计程车",
  "simplifiedStatus": "verified",
  "pinyin": "jìchéngchē",
  "japanese": "タクシー",
  "caution": "台湾で使われる表現。中国大陸では「出租車（chūzūchē）」が一般的。",
  "painPointTags": ["taiwan-mainland-usage"],
  "category": "transport"
}
```

**Path context:** Taiwan travel path shows this as primary. HSK path would use 出租車 as primary entry and show 計程車 as contrast note.

### 9.3 Universal Vocabulary — Same Script, Same Usage

```jsonc
{
  "id": "voc-common-001",
  "traditional": "謝謝",
  "traditionalStatus": "authored",
  "simplified": "谢谢",
  "simplifiedStatus": "authored",
  "pinyin": "xièxie",
  "japanese": "ありがとう",
  "category": "greeting",
  "painPointTags": []
}
```

**Path context:** No regional variant needed. Available in both scripts. Both paths show the same content with different script default.

### 9.4 Traditional-Only Content — Fallback Scenario

In this example, only the Traditional form has been authored. The Simplified form has `simplifiedStatus: "unavailable"` and `simplified` is absent, matching the content model contract.

```jsonc
{
  "id": "voc-script-fallback-001",
  "traditional": "歡迎光臨",
  "traditionalStatus": "authored",
  "simplifiedStatus": "unavailable",
  "pinyin": "huānyíng guānglín",
  "japanese": "いらっしゃいませ",
  "category": "greeting",
  "painPointTags": ["traditional-simplified"]
}
```

**Path context:** Taiwan travel path displays Traditional as default (no fallback needed). If a learner on a Simplified-default path encounters this entry and toggles to Simplified, the system shows Traditional with annotation "この単語は繁体字のみ利用可能です" — because Simplified is `unavailable`.

### 9.5 Script Contrast as Teaching Point

```jsonc
{
  "id": "lesson-script-contrast-001",
  "traditional": "體",
  "traditionalStatus": "verified",
  "simplified": "体",
  "simplifiedStatus": "verified",
  "pinyin": "tǐ",
  "japanese": "体",
  "caution": "日本の新字体「体」は簡体字と同じ形だが、繁体字では「體」。日本語の「からだ／たい」と発音が異なるので注意（tǐ）。",
  "painPointTags": ["traditional-simplified"]
}
```

**Path context:** This entry is a kanji bridge vocabulary item. The script contrast itself is the teaching point, so it appears with both forms visible simultaneously regardless of toggle state.

---

## 10. When NOT to Show Variant Information

To avoid cognitive overload, regional variant and script contrast information must not be shown indiscriminately.

### 10.1 Guidelines for Showing Variants

| Situation | Show variant info? | Rationale |
|-----------|-------------------|-----------|
| Learner on Taiwan travel path sees a Taiwan-specific term | No — this is the expected default | The term is the primary content, not a variant. No need to flag it as special. |
| Learner on Taiwan travel path encounters a Mainland term | Yes — brief contrastive note | Learner might encounter Mainland terms in airport/hotel contexts. |
| Learner on HSK path encounters a Taiwan variant | Optional — only if the Taiwan variant is commonly used in HSK listening | HSK is Mainland standard; Taiwan variants are rarely tested. |
| Universal vocabulary with no regional difference | Never | Showing both variants would be confusing noise. |
| Script form difference exists but is not the teaching point | No — let the toggle handle it | The toggle already lets learners switch. An explicit contrast note is only needed when the difference is pedagogically useful. |
| Script form difference IS the teaching point (kanji bridge, false friend) | Yes — explicit contrast | The whole point of the entry is to show the difference. Both forms should be visible. |

### 10.2 General Principle

- **Regional variant notes** should only appear when the learner would realistically encounter the other variant in their target context.
- **Script contrast notes** should only appear when the character difference affects recognition, memorization, or real-world reading.
- On path-default content (e.g., Taiwan travel → Traditional + Taiwan terms), do not annotate every entry. The path default is the expected display — annotations imply something is unusual or worth noting.
- Annotations are a **content authoring decision**, not an automatic toggle behavior. Content authors decide per entry whether a variant note is useful.

---

## 11. Relationship to Other Documents

| Document | Relationship | Action |
|----------|--------------|--------|
| `docs/content/content-model-draft.md` | Defines the per-form provenance fields (traditionalStatus/simplifiedStatus) and fallback rules. This strategy extends those rules with path-default and toggle interaction. | Reference this strategy for path-default and toggle-provenance interaction. |
| `docs/content/ai-assisted-authoring-workflow.md` | Defines the AI-assisted authoring pipeline and human review requirements for script-form provenance promotion. | Reference this strategy for human review triggers related to script and regional content. |
| `docs/product/japanese-learner-personas-and-jtbd.md` | Each persona defines script expectations and regional usage needs. Path defaults in section 3 of this strategy derive directly from persona data. | Reference this strategy for path-default definitions. |
| `.planning/REQUIREMENTS.md` | SCRIPT-01, SCRIPT-02, SCRIPT-03, PATH-02, HSK-01 are directly informed by this strategy. | SCRIPT-03 references this strategy explicitly. |
| `.planning/ROADMAP.md` | Phase 1 plan 01-04 is scoped to this strategy. Phase 3 implements the toggle (#22) based on this strategy. | This strategy is the upstream design doc for #22 toggle. |
| `docs/strategy/learning-and-motivation-strategy.md` | Learning path design (#17) should reference this strategy for script and regional default behavior. | Include cross-reference when #17 is drafted. |

---

## 12. Open Questions

The following questions should be resolved during implementation of related issues:

| Question | Owner Issue | Proposed Resolution |
|----------|-------------|--------------------|
| Should the global toggle show an indicator when the active form is a fallback (unavailable → alternative shown)? | #22 | Deferred to #22 UI design. |
| Should path selection explicitly ask the learner about regional usage preference, or derive it from the path name? | #17 | Deferred to #17 path design. |
| How should content review workflows flag entries where one script form is missing for a path that defaults to that form? | #11 | Deferred to #11 content review workflow design. |
| Should the toggle persist when switching paths? | #22 | Deferred to #22/#17 — both the persistence behavior and the "recommended" indicator are implementation decisions. |

---

*This document is part of the Chabiko content architecture (#18). It should be reviewed when the global script toggle (#22) is implemented, when learning paths (#17) are designed, and when the full content schema (#2) is drafted.*
