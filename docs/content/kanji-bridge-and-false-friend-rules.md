# Kanji-Bridge and False-Friend Rules

**Status:** Draft for #16
**Last updated:** 2026-08-06
**Based on:** #14 Japanese-Native Pain-Point Taxonomy, #18 Dual-Script and Regional Variant Strategy
**Alignment:** Phase 1 strategy and content pipeline; see `docs/strategy/learning-and-motivation-strategy.md`

---

## 1. Purpose

Japanese native speakers already recognize many Chinese characters through kanji. Chabiko deliberately uses that familiarity as a **learning bridge** that reduces entry friction and builds early confidence. A bridge is a *teaching aid*, never a claim about language history, pronunciation identity, or full meaning equivalence.

This document is the repository contract for when and how a kanji bridge may be shown. It is **conservative by design**: the product goal is to give learners useful, travel-usable Mandarin without teaching them confident mistakes.

### Status of This Document

- This draft is **provisional**. Its examples become authoritative per-example only after independent human linguistic review (see `docs/content/content-review-workflow.md`).
- Nothing in this document authorizes production content, schema, validator, route, UI, package, or dependency changes.

---

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Kanji bridge** | Any learner-facing note that connects a Japanese kanji form or meaning to a Chinese character, word, or pronunciation. |
| **On-yomi bridge** | A bridge note that points out that a Chinese reading sounds like a Japanese on-yomi reading of a kanji. |
| **False friend** | A word written with characters that exist in Japanese but has a different meaning in Chinese. |
| **Similarity type** | The controlled label on a vocabulary entry describing the bridge type. The schema allows exactly `false-friend`, `partial-overlap`, `same-meaning`, or `none` (see `docs/content/content-model-draft.md`). |
| **Caution copy** | Learner-facing warning text attached to a risky example. It must be specific, actionable, and in Japanese, and must not be a generic "be careful" placeholder. |

---

## 3. Bridge Categories

### 3.1 Visual-Form Bridges

A visual-form bridge says "this Chinese character looks like a kanji you already know." It is the safest category because it makes no meaning or sound claim.

- Scope: comment on the **shape** only (same form, close form, or form that must be distinguished).
- Safe example: 台湾 — Japanese 台湾 uses the same characters as Simplified 台湾 (台, 湾). The Traditional form is 台灣, where 灣 is the full Traditional form of 湾; learners recognize the shape and learn the script difference.
- Every Traditional ↔ Simplified ↔ Japanese form difference is governed by the Traditional/Simplified rules in section 5.
- A visual bridge may only add meaning content if a meaning bridge rule (section 3.2) also applies to that entry.

**Rule:** A visual-form bridge never implies "same word." It only says "you can recognize the shape."

### 3.2 Meaning Bridges

A meaning bridge says "the Chinese word uses the kanji's common meaning, so you can guess the meaning."

- Allowed when a **meaning overlap is confirmed** and the overlap is the point of the note.
- Requirement: every meaning-bridge entry must still carry pinyin, a Japanese gloss, a tone note, and review/source metadata (see `docs/content/content-model-draft.md`). A bridge never replaces pronunciation.
- Same-meaning compounds (safe): 電話, 交通, 銀行, 便利, 安全 — the characters carry the same meaning in both languages. Caution copy is still required when the reading or tone can mislead (for example, on-yomi similarity without a confirmed pinyin similarity).
- **Partial-overlap compounds** (require caution): 勉強 (Jp "study" → Cn "forced"), 手紙 (Jp "letter" → Cn "toilet paper"). These are false friends and are governed by section 3.4.

**Rule:** A meaning bridge may be shown only when a human-reviewed source confirms the shared meaning for the specific word, or the entry is explicitly provisional (see section 8). Never generalize "kanji X means Y" from a single known word.

### 3.3 Cautious On-Yomi / Pinyin Similarity Notes

An on-yomi note says "the Chinese reading sounds a bit like the Japanese on-yomi of the same kanji." This is the **most error-prone** bridge type and is always cautious.

- Allowable: an **observation about similarity** — "xī is not far from シ" — framed as a mnemonic hint, never as a rule that the readings match.
- **Never claim**: identical pronunciation, a shared etymology, or "in Japanese this kanji reads like this, so in Chinese it must sound like this."
- Because on-yomi and pinyin diverged independently, even a true sound resemblance is only a memory hook; the pinyin must be taught as the primary reading.

**Mandatory caution copy:** any on-yomi similarity note must state, in Japanese, that the Chinese sound is a different reading and must be learned as itself.

Example:

> **日本語の「電話（デンワ）」と中国語の「電話（diànhuà）」は、音が少し似ているだけで発音は別物。中国語では「ディエンフア（diànhuà）」と覚えよう。日本語の「デンワ」のままでは通じない。音の似た感じは覚え方のヒントにだけ使い、正しい発音の代わりにしてはいけない。

### 3.4 Same-Kanji Different Meaning or Usage

False friends and diverged kanji are the core risk area for Japanese learners. Two controlled taxonomy tags exist for these (see `docs/content/japanese-native-pain-point-taxonomy.md`):

- `kanji-false-friend` — a compound with a different meaning (手紙, 大丈夫, 勉強, 汽車, 新聞, 娘).
- `same-kanji-different-meaning` — a single kanji with a diverged meaning (走, 湯, 本, 床).
- `same-kanji-different-usage` — same meaning, different grammar/behavior (有 / 有る, where Chinese 有 is possessive-focused while Japanese 有る expresses existence).

**Rules:**

1. Every false-friend entry **must** carry explicit, specific caution copy: the Japanese meaning, the Chinese meaning, and why the confusion is dangerous in a real sentence.
2. Do not tag a word as a false friend when the meanings are actually the same or close (安全, 社会, 文化 are **not** false friends).
3. Same-kanji-different-usage notes must be about grammar/behavior, not meaning.

### 3.5 Japanese Forms Not Standard in Chinese

Japanese kanji include shinjitai forms and wasei kango (Japanese-made compounds) that do not exist in standard Chinese, as well as characters whose shape or meaning is not standard in Chinese.

- If the learner's Japanese form has **no standard Chinese form**, no visual bridge may be shown for that form. Show the Chinese form instead, and add a note that the Japanese form is not used.
- If the learner's Japanese form **looks like** a Chinese form but differs (発 → 發/发, 広 → 廣/广, 楽 → 樂/乐), teach the Traditional/Simplified difference explicitly and warn that the shinjitai shape is not used in Chinese.

**Rule:** A kanji bridge is never shown with a Japanese form that is not standard in Chinese.

### 3.6 Traditional / Simplified Differences

Governed by `docs/content/dual-script-and-regional-variant-strategy.md`. For bridges specifically:

- Taiwan path content is Traditional-first; HSK / school / general Mandarin content may be Simplified-first.
- The bridge may be shown for either script form, but must be explicit about which form it refers to (欢迎 vs 歡迎 vs 歓迎 are three different shapes).
- Production display only ever uses `authored` / `verified` script forms. A `generated` form may be used in authoring/preview, never in learner-facing production display.
- Never claim at runtime that Traditional ↔ Simplified conversion is identity; runtime conversion is editorial-only and its output must be human-verified before it reaches learners.
- A shinjitai form that happens to equal a Simplified form (体 = 体) is a coincidence of shape, not evidence of script policy; the note must say "Japanese shinjitai 体 equals Simplified 体; the Traditional form is 體."

### 3.7 Unsupported Etymological Claims

A kanji bridge is a **teaching device**, not a linguistic claim.

- Never claim shared etymology, a shared origin, or "this is the same word in both languages" without a reliable, citable source.
- Never present an on-yomi/pinyin resemblance as historical derivation.
- In practice, this means: do not write "同源" / "same origin," do not claim "identical pronunciation," and do not claim full semantic equivalence — unless a source is recorded in the entry's `source` metadata and the claim has passed review.
- When uncertain, show a caution or omit the bridge (see section 7).

---

## 4. When Caution Is Mandatory

Caution copy (in Japanese) is mandatory for **every risky example** below. A risky example is one where a Japanese learner's default assumption would lead to a wrong meaning, a wrong reading, or a wrong script form.

Caution is mandatory when **any** of these is true:

1. The word is a `false-friend` or `same-kanji-different-meaning` entry.
2. The entry uses a `partial-overlap` similarity type.
3. The bridge is an on-yomi/pinyin similarity note (section 3.3).
4. The characters differ between Japanese, Traditional, and Simplified (section 3.6).
5. The learner could mispronounce the word by applying Japanese on-yomi.
6. The Taiwan usage differs from the Mainland usage the learner may know (governed by `taiwan-mainland-usage` in the taxonomy).

Caution copy must be **specific**: name the Japanese assumption, the Chinese reality, and the concrete consequence (a wrong word in a real sentence). Generic warnings such as "注意してください" alone are not enough.

---

## 5. When No Bridge Should Be Shown

Omit the bridge entirely when any of the following holds:

1. **No reliable evidence.** The meaning, reading, or etymology claim cannot be supported by a source or review. (Section 3.7.)
2. **Misleading similarity.** The characters look alike but the meaning differs and the learner cannot safely guess it. Better to show the Chinese word as new vocabulary with a caution, not as a "bridge."
3. **Japanese-only form.** The Japanese form is not standard in Chinese (section 3.5) and no clean comparison is possible.
4. **No overlap.** The kanji carries a meaning in Japanese that does not transfer at all; teaching it as a bridge would teach the wrong meaning.
5. **Pronunciation trap.** The on-yomi/pinyin resemblance is likely to make the learner mispronounce the word (section 3.3).
6. **Wrong script frame.** The comparison would require showing a `generated` script form in a production context (section 3.6).
7. **The entry is `reviewStatus: draft` with a meaning claim.** Meaning claims in a draft are allowed only when explicitly marked provisional and review-pending (section 8).

When no bridge should be shown, the entry may still be shown as plain vocabulary with pinyin and a Japanese gloss — omitting a bridge is not omitting the word.

---

## 6. Examples (Bridge Allowed)

At least ten examples. Each example records a similarity type from the controlled set (`same-meaning`, `partial-overlap`, `false-friend`, `none` — see `docs/content/content-model-draft.md`) and, where the example is risky, the mandatory caution copy.

> **Example status:** The examples below are **draft / provisional**. Each becomes authoritative only after independent human linguistic review. None of them, by themselves, authorizes a production entry.

1. **電話 / 电话** — `same-meaning` compound. Same characters and same meaning as Japanese 電話. Not risky, so caution copy is optional; pinyin is still required (diànhuà).
   - Note: the Chinese reading must not be guessed from Japanese 電話 (でんわ).
2. **交通 / 交通** — `same-meaning` compound. Same meaning as Japanese 交通 (jiāotōng). Not risky; caution optional.
3. **銀行 / 银行** — `same-meaning` compound. Same meaning as Japanese 銀行 (yínháng). Not risky; caution optional.
4. **安全 / 安全** — `same-meaning`. Same meaning in both languages (ānquán). Not a false friend. Caution optional.
5. **台灣 / 台湾** — `same-meaning` for 台; the full form differs: Japanese 台湾 and Simplified 台湾 use the same 湾, while the Traditional form is 台灣. **Caution mandatory** (category 4): 日本語の「台湾」は簡体字「台湾」と同形。台湾の繁体字表記は「台灣」。(Táiwān.)
6. **歡迎 / 欢迎** — `partial-overlap` visual bridge. Japanese 歓迎 → Traditional 歡迎 vs Simplified 欢迎. **Caution mandatory** (category 4): 日本の「歓迎」の「歓」は中国語では使われない。正しい形は「歡迎」（繁体）「欢迎」（简体）。(huānyíng, "welcome".)
7. **樂 / 楽** — `partial-overlap` visual bridge. Japanese shinjitai 楽 vs Traditional 樂 vs Simplified 乐. **Caution mandatory** (category 4): 日本語の「楽」の形は中国語では使われない。正しい形は「樂」（繁体）「乐」（简体）。読みは文脈で変わる——「快樂/快乐」では lè（楽しさ）、「音樂/音乐」では yuè（音楽）。(lè / yuè.)
8. **發 / 发** — `partial-overlap` visual bridge. Japanese 発 vs Traditional 發 vs Simplified 发. **Caution mandatory** (category 4): 日本語の「発」の形は中国語では使われない。正しい形は「發」（繁体）「发」（简体）。読みは fā。(fā.)
9. **体 = 体** — `same-meaning` visual bridge with a script caveat. Japanese shinjitai 体 coincides with Simplified 体. **Caution mandatory** (category 4): 日本の新字体「体」は簡体字「体」と同形だが、繁体字では「體」。読みは tǐ。(tǐ.)
10. **捷運 / 捷运** — `same-meaning` region-specific. Taiwan word for MRT (jiéyùn), distinct from Mainland 地铁 (dìtiě). **Caution mandatory** (category 6): 台湾では地下鉄を「捷運」と呼ぶ。中国本土では「地铁（dìtiě）」なので混同しないこと。読み jié は日本語の「捷（ショウ）」と異なる。(jiéyùn.)
11. **熱 / 热** — `partial-overlap` visual bridge. Japanese 熱 and Traditional 熱 use the same form; Simplified is 热. **Caution mandatory** (category 4): 日本の「熱」は繁体字「熱」と同形。簡体字は「热」なので混同しないこと。(rè, "hot/heat".)
12. **便利 / 便利** — `same-meaning` + cautious on-yomi similarity note (section 3.3). Japanese 便利 (べんり) and Chinese 便利 (biànlì) share the meaning "convenient". **Caution mandatory** (category 3): 意味は同じ「べんり」だが、発音は似ているだけで別物。ベンリではなく「ビエンリー（biànlì）」と覚える。音の似た感じは覚え方のヒントにだけ使い、正しい発音の代わりにしてはいけない。

Note: examples 5, 6, 7, 8, 9, 10, 11, 12 are risky (script or on-yomi or regional) and each carries the mandatory caution copy; examples without an explicit caution block (1, 2, 3, 4) are non-risky because their meanings are the same and their readings are taught primarily from pinyin.

---

## 7. Counterexamples (Bridge Not Allowed)

At least five counterexamples. These are the cases where a bridge must **not** be shown, or must be shown only as a warning.

1. **手紙 / 手纸** — `false-friend`. Japanese 手紙 = "letter"; Chinese 手紙 = "toilet paper." **Caution mandatory.** A bridge here would teach the wrong meaning; only a warning is allowed. (This is a *false-friend* entry, not a same-meaning entry.)
2. **大丈夫 / 大丈夫** — `false-friend`. Japanese 大丈夫 = "okay / no problem"; Chinese 大丈夫 = "a strong man". **Caution mandatory.** A bridge that says "this is the word for okay" would be wrong.
3. **勉強 / 勉强** — `false-friend`. Japanese 勉強 = "study"; Chinese 勉強 = "forced / reluctant." **Caution mandatory.** A bridge that says "this means study" would be wrong.
4. **新聞 / 新闻** — `false-friend`. Japanese 新聞 = "newspaper"; Chinese 新聞 = "news" (a newspaper is 報紙/报纸). **Caution mandatory.** The meaning overlap is partial and the Chinese usage must be taught, not assumed.
5. **走 / 走** — `same-kanji-different-meaning`. Japanese 走 = "run"; Chinese 走 = "walk." **Caution mandatory.** A bridge that says "this kanji means run" would be wrong.

Each counterexample above must carry explicit, specific caution copy in production. None of these five may be shown as a positive "bridge" that transfers the Japanese meaning.

---

## 8. Evidence, Provenance, and Review Status

### Evidence

- A meaning or reading claim requires a reliable source recorded in the entry's `source` metadata (see `docs/content/content-model-draft.md`). Dictionaries, standards, and reviewed corpus entries qualify; unsourced model inference does not.
- On-yomi/pinyin similarity notes are observational and must not cite a shared etymology.

### Provenance and Script

- Chinese content carries per-form script provenance (`traditionalStatus` / `simplifiedStatus`); only `authored` / `verified` forms are production-eligible. See `docs/content/content-model-draft.md`.
- No unreviewed runtime Traditional ↔ Simplified conversion for production display.

### Review Status

- This document and every example are **draft / provisional** until reviewed by a human language reviewer.
- A `draft` entry may carry a meaning bridge only when it is explicitly marked provisional and review-pending; the release rule in section 6 makes each example authoritative only after review.
- Promotion `draft → reviewed → published` follows `docs/content/content-review-workflow.md`. No model-to-model review establishes human approval provenance.

---

## 9. Cross-References

- `docs/content/content-model-draft.md` — executable schema, `similarityType` values, `painPointTags`, provenance fields, `reviewStatus` values.
- `docs/content/japanese-native-pain-point-taxonomy.md` — controlled tags `kanji-false-friend`, `same-kanji-different-meaning`, `same-kanji-different-usage`, `traditional-simplified`, `taiwan-mainland-usage`.
- `docs/content/dual-script-and-regional-variant-strategy.md` — script form and regional usage policy that governs every bridge display.
- `docs/content/content-review-workflow.md` — review status transitions and human language review requirements.
- `docs/strategy/learning-and-motivation-strategy.md` — the product strategy that motivated the kanji-bridge and on-yomi-bridge cards.

---

## 10. Rule Summary

| Rule | Category |
|------|----------|
| A bridge is a teaching aid, never a linguistic claim. | General |
| Visual bridges comment on shape only unless a meaning rule applies. | 3.1 |
| Meaning bridges require a confirmed overlap and still require pinyin + gloss + tone note. | 3.2 |
| On-yomi/pinyin notes are observations only; never claim identity or shared etymology. | 3.3 |
| False friends require explicit, specific caution copy; never transfer the Japanese meaning. | 3.4 |
| Japanese forms not standard in Chinese are never shown as a bridge. | 3.5 |
| Bridges respect Traditional/Simplified policy and per-form provenance. | 3.6 |
| Unsupported etymological claims are forbidden; uncertainty means caution or omission. | 3.7 |
| Caution is mandatory for every risky example. | 4 |
| No bridge when evidence is missing, similarity misleads, or the word is Japanese-only. | 5 |
| All examples remain provisional until human linguistic review. | 6, 8 |

---

*This document is part of the Chabiko content architecture (#16). It should be reviewed when the content schema is implemented (#2) and whenever new false friends or bridge types are identified through content authoring.*
