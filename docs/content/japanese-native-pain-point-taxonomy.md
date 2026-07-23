# Japanese-Native Pain-Point Taxonomy

**Status:** Draft for #14
**Last updated:** 2026-07-14
**Based on:** #13 Japanese Learner Personas and JTBD
**Alignment:** P1 赴台旅行準備者 primary persona, P2 台灣文化與日常實用中文初學者 and P3 學校／大學／HSK 補強者 secondary personas; v1 scope per REQUIREMENTS.md POS-02

---

## 1. Overview

This taxonomy defines a controlled list of pain-point tags for content metadata in Chabiko. Every tag represents a specific category of difficulty that Japanese native speakers face when learning Mandarin Chinese.

These tags allow lessons, vocabulary entries, phrasebook items, and practice content to be consistently annotated, filtered, and reviewed. They are **not** a replacement for inline explanations — they are metadata that enables content discovery, cross-linking, and quality review.

### Design Principles

- **Japanese-native specific:** Each tag must describe a difficulty rooted in the Japanese learner's L1 (native language) background. Generic "Chinese is hard" categories do not belong.
- **Controlled, not freeform:** Tags are drawn from this taxonomy only. Ad-hoc tagging is not allowed.
- **Optional metadata:** Not every content item needs a tag. Missing tags are not an error.
- **No over-tagging:** A tag should only be applied when the content item actively addresses or illustrates that pain point. Incidental presence of a feature does not warrant a tag.
- **Review-gated:** Tags are applied during content review, not during initial drafting.

### Relationship to Personas

| Persona | Most Relevant Pain Points |
|---------|---------------------------|
| P1: 赴台旅行準備者 | tone, pinyin-pronunciation, kanji-false-friend, same-kanji-different-meaning, traditional-simplified, taiwan-mainland-usage |
| P2: 台灣文化與日常實用中文初學者 | tone, pinyin-pronunciation, kanji-false-friend, same-kanji-different-meaning, same-kanji-different-usage, traditional-simplified, taiwan-mainland-usage |
| P3: 學校／大學／HSK 補強者 | tone, pinyin-pronunciation, kanji-false-friend, word-order, measure-word, aspect-particle, complement, traditional-simplified |
| P4: 接客／工作情境學習者 | tone, pinyin-pronunciation, taiwan-mainland-usage, traditional-simplified |
| P5: 中長期留學／居住準備者 | tone, pinyin-pronunciation, word-order, complement, traditional-simplified |
| P6: 中文媒體／粉絲文化理解者 | kanji-false-friend, same-kanji-different-meaning, same-kanji-different-usage, traditional-simplified, taiwan-mainland-usage |

---

## 2. Controlled Tag Definitions

### 2.1 tone

| Field | Content |
|-------|---------|
| **Definition** | Mandarin tones (四聲) that do not exist in Japanese. This tag applies when the content highlights or practices a specific tonal distinction. |
| **How Japanese learners misunderstand** | Japanese is pitch-accent, not tonal. Speakers tend to flatten all tones or substitute a level pitch. 3rd tone (214) is especially hard — learners often produce a falling tone without the rise. Tone sandhi (e.g., 3-3 → 2-3) is typically ignored. |
| **When to use** | The content item explicitly illustrates a tone pattern, contrasts minimal pairs (e.g., 媽/麻/馬/罵, 買/賣), or includes a tone drill. |
| **When NOT to use** | The content merely contains a word with a tone. Almost every word has a tone — tagging all of them would make the tag meaningless. Only use when the tone is the pedagogical focus. |
| **Applicable content types** | lesson (soundFocus section), vocabulary (toneNote field), practice (tone discrimination exercise) |
| **Review notes** | Check that the tone note is actionable for a Japanese speaker, not a generic "this word has tone X." A good tone note explains what a Japanese speaker would likely flatten or confuse. |

### 2.2 pinyin-pronunciation

| Field | Content |
|-------|---------|
| **Definition** | Pinyin initial/final sounds that Japanese speakers systematically mispronounce due to L1 interference. |
| **How Japanese learners misunderstand** | Japanese lacks the following distinctions that Mandarin requires: zh/ch/sh vs z/c/s, r (日), j/q/x, and the contrast between -in/-ing, -en/-eng. Japanese also devoices or palatalizes certain sounds differently. Aspiration (送氣) is weakly distinguished. |
| **When to use** | The content contrasts a difficult pinyin pair, provides explicit pronunciation guidance for a sound not found in Japanese, or flags a common mispronunciation. |
| **When NOT to use** | The content simply includes pinyin — this is almost all Chinese content. Only add this tag when pronunciation is the explicit teaching point. |
| **Applicable content types** | lesson (soundFocus section), vocabulary (toneNote or caution field), practice (pronunciation discrimination), phrasebook (phonetic notes for travel phrases) |
| **Review notes** | Verify the pronunciation note is framed from Japanese phonology (e.g., "日本語の「シ」と違って、中国語の xī は舌を歯茎に近づけて出す"), not from English phonology. |

### 2.3 kanji-false-friend

| Field | Content |
|-------|---------|
| **Definition** | A word written with characters that exist in Japanese but has a completely different meaning in Chinese. |
| **How Japanese learners misunderstand** | Learners assume the Chinese word means what the identical Japanese word means. Common examples: 大丈夫 (Jp: "okay" → Cn: "strong man"), 手紙 (Jp: "letter" → Cn: "toilet paper"), 勉強 (Jp: "study" → Cn: "forced"), 汽車 (Jp: "train" → Cn: "car/automobile"), 娘 (Jp: "daughter" → Cn: "mother"), 新聞 (Jp: "newspaper" → Cn: "news"). |
| **When to use** | The vocabulary entry or sentence contains a word that is a known kanji false friend. The content should explicitly warn about the meaning difference. |
| **When NOT to use** | The characters happen to look similar but the learner wouldn't likely assume the Japanese meaning. The word exists in Chinese only (e.g., 台灣／台湾 — same meaning). |
| **Applicable content types** | vocabulary (caution field), sentence (notesJa field), lesson (kanjiBridgeNotes section), phrasebook |
| **Review notes** | Verify the caution is specific: explain the Japanese meaning, the Chinese meaning, and why the confusion is problematic in context. Avoid vague "be careful" notes without explanation. |

### 2.4 same-kanji-different-meaning

| Field | Content |
|-------|---------|
| **Definition** | A single character exists in both Japanese and Chinese but has diverged in meaning or connotation. |
| **How Japanese learners misunderstand** | The learner assigns the Japanese meaning to the character when reading Chinese. Examples: 食 (Jp: "meal/eat" — same in Cn), but 走 (Jp: "run" → Cn: "walk"), 本 (Jp: "book" → Cn: "origin/root/classifier"), 湯 (Jp: "hot water/bath" → Cn: "soup"), 床 (Jp: "floor/bed" → Cn: "bed"). |
| **When to use** | The character's Chinese meaning differs enough from its Japanese meaning that the learner's assumption would lead to misunderstanding a sentence. |
| **When NOT to use** | The meaning overlap is very close and the context disambiguates (e.g., 大きい／大 in size contexts). Minor connotation shifts that don't affect comprehension. |
| **Applicable content types** | vocabulary (caution field), lesson (kanjiBridgeNotes section), practice (character recognition) |
| **Review notes** | Distinguish from kanji-false-friend: this tag is for individual characters, not compound words. Ensure the explanation focuses on the meaning divergence, not just a one-to-one translation. |

### 2.5 same-kanji-different-usage

| Field | Content |
|-------|---------|
| **Definition** | A character or word exists in both languages with similar meaning but different grammatical behavior, collocation, or register. |
| **How Japanese learners misunderstand** | The learner uses the word with Japanese-style grammar (e.g., Japanese word order within a phrase, wrong particle equivalent, wrong transitivity). Examples: Japanese 有る (ある, existence) vs Chinese 有 (yoǔ, possession) — learners may confuse the grammar pattern. Adverb placement differences. |
| **When to use** | A word's Chinese usage pattern (grammar, transitivity, required particles) differs from its Japanese counterpart despite similar meaning. |
| **When NOT to use** | The usage is the same in both languages. The difference is purely about meaning (use same-kanji-different-meaning instead). |
| **Applicable content types** | lesson (chunks section, coreSentence), vocabulary (caution field), practice (sentence-building) |
| **Review notes** | Focus on grammatical pattern differences, not meaning. Use a Chinese sentence vs Japanese sentence side-by-side when possible. |

### 2.6 word-order

| Field | Content |
|-------|---------|
| **Definition** | Mandarin word order (SVO, time-manner-place, modifier-head, question formation) that differs from Japanese (SOV, postpositional). |
| **How Japanese learners misunderstand** | Japanese is SOV with postpositional particles and left-branching modifiers. Learners produce SOV Chinese sentences, place time phrases after the verb (following Japanese order), put prepositional phrases in the wrong position, or forget that Chinese uses SVO with no case marking. |
| **When to use** | The content explicitly teaches or practices a word-order pattern that contrasts with Japanese. For example: time-before-verb (我明天去 vs Japanese 私は明日行く — same order but different underlying rule), location-before-verb (我在台北住 vs 私は台北に住む). |
| **When NOT to use** | The Chinese word order happens to be the same as Japanese (e.g., both put the verb at the end in certain subordinate clauses — but learners don't need to be warned about these). |
| **Applicable content types** | lesson (chunks section, coreSentence), practice (sentence ordering exercise), phrasebook (grammar notes) |
| **Review notes** | The explanation should contrast with Japanese word order, not describe Chinese grammar in isolation. A pattern like "Chinese: Subject + Time + Place + Verb" should be explicitly compared to Japanese differences. |

### 2.7 measure-word

| Field | Content |
|-------|---------|
| **Definition** | Chinese measure words (量詞/量词) that differ from Japanese counter words (助数詞/量詞) in usage, scope, or mandatory status. |
| **How Japanese learners misunderstand** | Japanese has its own counter system (枚/本/匹/台 etc.) but Chinese measure words are mandatory in more contexts (every noun needs a measure word with a number). The mapping is often different: 枚 covers flat objects in both languages, but Chinese also uses 張 for many flat things that Japanese uses 枚 for. Some Chinese measure words have no Japanese equivalent (把). Learners forget the measure word entirely. |
| **When to use** | The content introduces or practices a measure word whose usage differs from the Japanese learner's expectation. |
| **When NOT to use** | The measure word usage is identical to Japanese and the learner would not struggle (rare — almost always worth noting the difference or similarity). |
| **Applicable content types** | vocabulary (when the word is a measure word), lesson (vocabulary or grammar section), practice (fill-in-the-measure-word exercise), phrasebook (when ordering/quantifying) |
| **Review notes** | Explicitly state whether the Chinese measure word maps to a Japanese counter and what the difference is. "適用範圍比日語的〜枚更窄" is more helpful than just "量詞：張." |

### 2.8 aspect-particle

| Field | Content |
|-------|---------|
| **Definition** | Chinese aspect particles (了, 過, 著/着, 在) that express temporal/aspectual information through verb suffixes or auxiliaries, contrasting with Japanese aspect (〜た, 〜ている, 〜てある, 〜てしまう). |
| **How Japanese learners misunderstand** | Learners confuse 了 with Japanese past tense 〜た, but 了 is aspect (perfective) not tense — it can appear in future contexts. They overuse 了 in all past contexts. They confuse 着/着 (continuous) with Japanese 〜ている without realizing 着/着 describes a resulting state, not progressive action. 過/过 (experiential) is usually easier but still gets confused with 了. |
| **When to use** | The content explains or contrasts Chinese aspect particle usage with Japanese aspect patterns. |
| **When NOT to use** | The particle appears in a fixed expression (e.g., 為了, 除了) where aspect analysis is not helpful. |
| **Applicable content types** | lesson (chunks section, coreSentence), practice (aspect particle selection exercise), vocabulary (when a verb's typical aspect behavior must be noted) |
| **Review notes** | The most important contrast is 了 ≠ Japanese past tense 〜た. Ensure this is explicitly stated wherever 了 is taught. |

### 2.9 complement

| Field | Content |
|-------|---------|
| **Definition** | Chinese resultative complements (補語/补语: 吃完, 聽懂, 看清楚), directional complements (進來, 上去), and potential complements (聽得懂, 起不來) — structures with no direct Japanese equivalent. |
| **How Japanese learners misunderstand** | Japanese uses compound verbs (食べ終わる, 聞き取る) and potential forms (食べられる, わかる) where Chinese uses complements. Learners either avoid complements (producing 我吃完了 as 我已經吃了 instead) or misuse the pattern (e.g., forgetting the potential complement form 得/不). Directional complements like 上來/下去 are confusing because Japanese expresses direction through verbs alone without a complement structure. |
| **When to use** | The content teaches a complement structure or contains a word/phrase whose Chinese expression uses a complement while Japanese uses a different pattern. |
| **When NOT to use** | The complement is fully lexicalized and the learner doesn't need to decompose it (e.g., 說明 already means "explain" — the 明 is not productive here for beginner purposes). |
| **Applicable content types** | lesson (chunks section, coreSentence), vocabulary (when a verb-complement pair is a vocabulary item), practice (complement gap-fill or transformation drill) |
| **Review notes** | For each complement, note whether Japanese has a similar compound verb pattern (食べ終わる → 吃完) or requires a completely different structure. |

### 2.10 traditional-simplified

| Field | Content |
|-------|---------|
| **Definition** | Content that highlights or contrasts differences between Traditional Chinese (繁體字/正體字) and Simplified Chinese (簡体字) in character forms or script representation. |
| **How Japanese learners misunderstand** | Japanese learners see shinjitai (新字体) — many characters look like Simplified but some like Traditional. A Japanese learner may confuse 発 (Jp shinjitai) with 发 (Simplified) vs 發 (Traditional), or 広 with 广 vs 廣. They may not know which script is used where, or they may assume that Japanese kanji is always interchangeable with Chinese characters. |
| **When to use** | The content explicitly shows a Traditional vs Simplified difference, or the script choice is a teaching point (e.g., "this sign in Taiwan uses Traditional 歡迎"). |
| **When NOT to use** | The content merely exists in one script or the other. Almost all Chinese content has a script form — tagging every entry would be meaningless. Only tag when the *difference* is the focus. |
| **Applicable content types** | vocabulary (traditionalStatus/simplifiedStatus fields), phrasebook (Taiwan-specific entries), practice (script matching exercise), lesson (script awareness note) |
| **Review notes** | This tag is NOT for UI language selection. It is for Chinese content script display. Verify the tag is not applied to every Traditional- or Simplified-only entry — only where the script difference itself matters. For Taiwanese content, consider pairing with taiwan-mainland-usage. |

### 2.11 taiwan-mainland-usage

| Field | Content |
|-------|---------|
| **Definition** | Content that highlights vocabulary, pronunciation, or expression differences between Taiwan Guoyu (臺灣國語/台灣國語) and Mainland Putonghua (普通話). |
| **How Japanese learners misunderstand** | Most learning resources (textbooks, apps) default to PRC Mainland Mandarin. Japanese learners may not know that Taiwan uses different words for common items (e.g., 計程車 vs 出租車, 捷運 vs 地鐵, 便當 vs 盒飯, 滑鼠 vs 鼠標). They may learn one term and be confused when encountering the other. Pronunciation differences (e.g., 垃圾 lèsè vs lājī) are also common. |
| **When to use** | The content explicitly contrasts Taiwan and Mainland vocabulary or usage, or the content is region-specific and the learner should know. |
| **When NOT to use** | The vocabulary is universal (e.g., 我, 你, 好, 謝謝) with no regional variation. Do NOT tag every Taiwan-specific entry — only those where the learner might encounter and need to distinguish from a Mainland variant. |
| **Applicable content types** | vocabulary (caution or notes field), phrasebook (when region-specific), lesson (cultural/usage note) |
| **Review notes** | This is separate from traditional-simplified. Taiwan uses Traditional script and Mainland uses Simplified script as a general rule, but the *vocabulary differences* are a separate dimension. A Taiwan phrase can be in Traditional script *and* use Taiwan vocabulary — tag both dimensions if both are relevant, or just one if only the vocabulary matters. Be precise: some items differ by word choice (計程車/出租車), others by character choice (資訊/信息), and others by pronunciation (垃圾). |

---

## 3. Applicable Content Types Summary

| Tag | lesson | vocabulary | phrasebook | practice | sentence |
|-----|--------|------------|------------|----------|----------|
| tone | ✓ | ✓ | – | ✓ | – |
| pinyin-pronunciation | ✓ | ✓ | ✓ | ✓ | – |
| kanji-false-friend | ✓ | ✓ | ✓ | – | ✓ |
| same-kanji-different-meaning | ✓ | ✓ | – | ✓ | – |
| same-kanji-different-usage | ✓ | ✓ | – | ✓ | – |
| word-order | ✓ | – | ✓ | ✓ | – |
| measure-word | ✓ | ✓ | ✓ | ✓ | – |
| aspect-particle | ✓ | – | – | ✓ | – |
| complement | ✓ | ✓ | – | ✓ | – |
| traditional-simplified | ✓ | ✓ | ✓ | ✓ | ✓ |
| taiwan-mainland-usage | ✓ | ✓ | ✓ | ✓ | – |

Legend: ✓ = applicable, – = generally not applicable

---

## 4. Field Usage in Content Model

The recommended metadata field name is `painPointTags` throughout the content model. This field is:

- **Optional**: Content items may have zero tags.
- **Controlled**: Values must be drawn from the taxonomy in section 2.
- **Array type**: Multiple tags may apply.
- **Invalid tag**: Any tag not in the controlled taxonomy (section 2) is a validation error.

Example:

```jsonc
// vocabulary entry
{
  "id": "voc-001",
  "traditional": "手紙",
  "pinyin": "shǒuzhǐ",
  "japanese": "トイレットペーパー",
  "painPointTags": ["kanji-false-friend"]
}
```

---

## 5. Review Guidance

### When to Add a Tag

- The content item actively teaches or addresses a specific Japanese-native difficulty.
- The tag helps learners discover this content item when filtering by their struggle area.
- The pain point is explicit in the content — a note, exercise, or contrast that makes the learner think about the difficulty.

### When NOT to Add a Tag

- The content item merely contains a feature (e.g., every word has a tone — do not tag tone).
- The learner would not benefit from filtering by this tag — incidental presence is not sufficient.
- Multiple tags would be technically correct but make the metadata noisy (choose the 1–2 most relevant).
- The tag duplicates what another tag already captures for this specific item.

### Avoiding Over-Tagging

- **Limit per item**: Aim for 0–3 tags per content item. If an item needs more than 3, it likely tries to teach too much at once.
- **Prefer specificity**: If a false friend also involves tones (most do), tag only `kanji-false-friend` unless the tone is an explicit teaching point.
- **Review in context**: Tags should be assessable by someone reading the content item. If the tag is not obvious from the content, it probably doesn't belong.
- **Consistency check**: Compare similar items. If one vocabulary entry has `kanji-false-friend` but an equally problematic one doesn't, either add the missing tag or remove the existing one — be consistent within categories.

### AI-Assisted Content Review

When reviewing AI-generated or AI-assisted content:

1. **Do not trust AI tag suggestions.** LLMs tend to over-tag because they see patterns everywhere. Verify each tag against the guidance in section 2.
2. **Check for generic tags.** AI often applies `tone` or `pinyin-pronunciation` to any vocabulary item. Reject these unless the content explicitly focuses on the sound.
3. **False friend hallucination.** AI may incorrectly label a word as a false friend when the Chinese and Japanese meanings are actually the same or close (e.g., 安全, 社会, 文化). Verify each claim against a reliable source.
4. **Taiwan/Mainland hallucination.** AI may guess region-specific usage without evidence. Only tag `taiwan-mainland-usage` when the regional variant is confirmed.
5. **Script over-tagging.** AI may apply `traditional-simplified` to every Traditional-only entry. Only use this tag when the script difference itself is the teaching point.

For the broader AI-assisted authoring pipeline that defines when model-generated content enters the repository, see [ai-assisted-authoring-workflow.md](ai-assisted-authoring-workflow.md).

### Taiwan/Mainland Usage and Simplified/Traditional Tagging

- These two tags are **separate dimensions**. A content item may have one, both, or neither.
- **traditional-simplified**: Use when the script form is the teaching point (e.g., "this sign uses Traditional 歡迎 in Taiwan, but you might see Simplified 欢迎 in Mainland materials").
- **taiwan-mainland-usage**: Use when the vocabulary or expression itself differs (e.g., 計程車 vs 出租車). These often correlate with script, but not always — a Taiwan-usage item is usually in Traditional script, but the tag applies to the word choice, not the script.
- **Both tags together**: When an item differs in *both* vocabulary and script, apply both. Example: 電腦 (Taiwan, Traditional "computer") vs 计算机/电脑 (Mainland, Simplified). But be precise — 便當 vs 盒飯 differs in vocabulary (taiwan-mainland-usage) and usually appears in Traditional vs Simplified respectively, but the vocabulary difference is primary.
- **Review checklist for regional content:**
  - Is the vocabulary choice distinct to Taiwan or Mainland? → `taiwan-mainland-usage`
  - Is the script form an explicit teaching point? → `traditional-simplified`
  - Is the item in Traditional script because it's Taiwanese content, but the script itself is not the focus? → Only `taiwan-mainland-usage`, not `traditional-simplified`

---

## 6. Seed Examples

### 6.1 tone

```jsonc
{
  "id": "voc-tone-001",
  "traditional": "媽",
  "simplified": "妈",
  "pinyin": "mā",
  "japanese": "お母さん",
  "toneNote": "第一声（高く平らな音）。日本語にはない調子なので、意識して高さを保つ。",
  "painPointTags": ["tone"],
  "category": "family",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-tone-002",
  "traditional": "馬",
  "simplified": "马",
  "pinyin": "mǎ",
  "japanese": "馬",
  "toneNote": "第三声（低くから上がる音）。最初にしっかり低くしてから上げる。日本語の「うま」の平板な発音とは違う。",
  "painPointTags": ["tone"],
  "category": "animal",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.2 pinyin-pronunciation

```jsonc
{
  "id": "voc-pinyin-001",
  "traditional": "四",
  "simplified": "四",
  "pinyin": "sì",
  "japanese": "四（し）",
  "toneNote": "第四声（急降下）。sì の母音は日本語の「い」より口を横に開く。",
  "painPointTags": ["pinyin-pronunciation"],
  "caution": "日本語の「し」と違って舌を歯茎につけない。si は歯を食いしばるイメージ。",
  "category": "number",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-pinyin-002",
  "traditional": "日",
  "simplified": "日",
  "pinyin": "rì",
  "japanese": "日（にち）",
  "toneNote": "第四声。r の発音は日本語の「り」の舌をさらに巻く。",
  "painPointTags": ["pinyin-pronunciation"],
  "caution": "日本語の「にち」とまったく違う発音。rì の r は舌を後ろに巻いて出す。",
  "category": "time",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.3 kanji-false-friend

```jsonc
{
  "id": "voc-falsefriend-001",
  "traditional": "手紙",
  "simplified": "手纸",
  "pinyin": "shǒuzhǐ",
  "japanese": "トイレットペーパー",
  "caution": "日本語の「手紙（てがみ）」＝ letter とは意味がまったく違う。中国語では「手に使う紙」＝ toilet paper。",
  "painPointTags": ["kanji-false-friend"],
  "similarityType": "false-friend",
  "category": "daily-necessity",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-falsefriend-003",
  "traditional": "汽車",
  "simplified": "汽车",
  "pinyin": "qìchē",
  "japanese": "自動車",
  "caution": "日本語の「汽車（きしゃ）」＝ train。中国語では「汽車」＝ car/automobile。",
  "painPointTags": ["kanji-false-friend"],
  "similarityType": "false-friend",
  "category": "transport",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.4 same-kanji-different-meaning

```jsonc
{
  "id": "voc-kanjimeaning-001",
  "traditional": "走",
  "simplified": "走",
  "pinyin": "zǒu",
  "japanese": "歩く",
  "caution": "日本語では「走る」だが、中国語では「歩く」の意味。",
  "painPointTags": ["same-kanji-different-meaning"],
  "similarityType": "partial-overlap",
  "category": "action",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-kanjimeaning-002",
  "traditional": "湯",
  "simplified": "汤",
  "pinyin": "tāng",
  "japanese": "スープ",
  "caution": "日本語の「お湯」＝ hot water。中国語の「湯」＝ soup。",
  "painPointTags": ["same-kanji-different-meaning"],
  "similarityType": "partial-overlap",
  "category": "food",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.5 same-kanji-different-usage

```jsonc
{
  "id": "voc-kanjiusage-001",
  "traditional": "有",
  "simplified": "有",
  "pinyin": "yǒu",
  "japanese": "ある／いる／持っている",
  "caution": "日本語の「有る」は存在を表すが、中国語の「有」は所有の意味が強い。日本語のように「私には兄弟がある」と言えるが、中国語では「我有兄弟」のように所有構造になる。否定は「沒有」で、日本語の「ない」とは異なり、存在と所有の否定両方に使う。",
  "painPointTags": ["same-kanji-different-usage"],
  "category": "grammar",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.6 Taiwan/Mainland usage

```jsonc
{
  "id": "voc-taiwan-003",
  "traditional": "計程車",
  "simplified": "计程车",
  "pinyin": "jìchéngchē",
  "japanese": "タクシー",
  "caution": "台湾で使われる表現。中国本土では「出租車（chūzūchē）」が一般的。",
  "painPointTags": ["taiwan-mainland-usage"],
  "category": "transport",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-taiwan-004",
  "traditional": "滑鼠",
  "simplified": "滑鼠",
  "pinyin": "huáshǔ",
  "japanese": "マウス（PC）",
  "caution": "台湾で使われる表現。中国本土では「鼠标（shǔbiāo）」が一般的。",
  "painPointTags": ["taiwan-mainland-usage"],
  "category": "technology",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-taiwan-005",
  "traditional": "便當",
  "simplified": "便当",
  "pinyin": "biàndāng",
  "japanese": "弁当",
  "caution": "台湾で使われる表現。中国本土では「盒饭（héfàn）」が一般的。日本語の「弁当」に近い。",
  "painPointTags": ["taiwan-mainland-usage"],
  "category": "food",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.7 traditional-simplified

```jsonc
{
  "id": "voc-script-001",
  "traditional": "歡迎",
  "simplified": "欢迎",
  "pinyin": "huānyíng",
  "japanese": "ようこそ",
  "caution": "台湾では繁体字「歡迎」が使われる。日本の「歓迎」と漢字は似ているが意味用法が異なる。",
  "painPointTags": ["traditional-simplified"],
  "traditionalStatus": "verified",
  "simplifiedStatus": "verified",
  "category": "greeting",
  "reviewStatus": "draft"
}
```

```jsonc
{
  "id": "voc-script-002",
  "traditional": "體",
  "simplified": "体",
  "pinyin": "tǐ",
  "japanese": "体",
  "caution": "日本の新字体「体」は簡体字と同じ形だが、繁体字では「體」。読み方は日本語の「からだ／たい」とは異なり tǐ。",
  "painPointTags": ["traditional-simplified"],
  "traditionalStatus": "verified",
  "simplifiedStatus": "verified",
  "category": "body",
  "reviewStatus": "draft"
}
```

### 6.8 word-order

```jsonc
{
  "id": "voc-wordorder-001",
  "traditional": "我明天去台北",
  "simplified": "我明天去台北",
  "pinyin": "wǒ míngtiān qù Táiběi",
  "japanese": "私は明日台北に行きます",
  "notesJa": "中国語の語順は SVO（主語＋動詞＋目的語）。日本語の SOV（主語＋目的語＋動詞）と異なり、「我台北去」にはならない。時間表現「明天」は動詞の前に置く（主語＋時間＋動詞＋目的語）。",
  "painPointTags": ["word-order"],
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.9 measure-word

```jsonc
{
  "id": "voc-measure-001",
  "traditional": "一張機票",
  "simplified": "一张机票",
  "pinyin": "yī zhāng jīpiào",
  "japanese": "航空券一枚",
  "caution": "日本語では「一枚」だが、中国語ではチケットや平らな紙類に「張」を使う。日本語の「一枚」＝薄くて平らなものに使うが、中国語の「張」は紙類、チケット、机、ベッドなど幅広い。",
  "painPointTags": ["measure-word"],
  "category": "transport",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.10 aspect-particle

```jsonc
{
  "id": "voc-aspect-001",
  "traditional": "我吃了",
  "simplified": "我吃了",
  "pinyin": "wǒ chī le",
  "japanese": "食べた（／食べてしまった）",
  "caution": "「了」は日本語の過去形「〜た」とは違う。了は完了相（perfective aspect）で、未来の完了にも使える（明天我吃了飯再去＝明日ご飯を食べてから行く）。日本語の「た」のような過去専用ではない。",
  "painPointTags": ["aspect-particle"],
  "category": "grammar",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.11 complement

```jsonc
{
  "id": "voc-complement-001",
  "traditional": "聽懂",
  "simplified": "听懂",
  "pinyin": "tīng dǒng",
  "japanese": "聞いてわかる",
  "caution": "中国語の結果補語。日本語では「聞いてわかる」のように動詞を二つ並べるか「聞き取れる」のような可能動詞で表現するが、中国語では「動詞＋補語」の形をとる。否定は「聽不懂／听不懂」。",
  "painPointTags": ["complement"],
  "category": "grammar",
    "traditionalStatus": "authored",
    "simplifiedStatus": "authored",
  "reviewStatus": "draft"
}
```

### 6.12 Multiple tags (combined)

```jsonc
{
  "id": "voc-combined-001",
  "traditional": "捷運",
  "simplified": "捷运",
  "pinyin": "jiéyùn",
  "japanese": "MRT／地下鉄",
  "caution": "台湾で「地下鉄／MRT」を指す言葉。中国本土では「地铁（dìtiě）」が一般的。発音 jié は日本語の「捷（ショウ）」と異なる。",
  "painPointTags": ["taiwan-mainland-usage", "pinyin-pronunciation"],
  "traditionalStatus": "verified",
  "simplifiedStatus": "verified",
  "category": "transport",
  "reviewStatus": "draft"
}
```

---

## 7. Tag Validation Examples (for future schema tests)

The following examples show valid vs invalid tag values for content validation:

### Valid (must pass validation)

- `"tone"`
- `"pinyin-pronunciation"`
- `"kanji-false-friend"`
- `"same-kanji-different-meaning"`
- `"same-kanji-different-usage"`
- `"word-order"`
- `"measure-word"`
- `"aspect-particle"`
- `"complement"`
- `"traditional-simplified"`
- `"taiwan-mainland-usage"`

### Invalid (must be rejected by validation)

- `"pronunciation"` — not in taxonomy; use `pinyin-pronunciation`
- `"kanji"` — ambiguous; use specific sub-category
- `"grammar"` — too broad; not a Japanese-specific pain point
- `"false-friend"` — use `kanji-false-friend`
- `"simplified"` — use `traditional-simplified`
- `"taiwan"` — use `taiwan-mainland-usage`
- `"ton"` — typo of `tone`
- `"pinyin"` — too broad; use `pinyin-pronunciation`
- `"measureword"` — use `measure-word`

---

## 8. Validation Contract (for future schema implementation)

A minimal executable validator exists at `scripts/validate-pain-points.py`. It validates `painPointTags` against the controlled taxonomy with zero dependencies (Python 3). Run with:

```bash
python3 scripts/validate-pain-points.py
```

When full schema validation is implemented (planned in #2), the following rules must hold:

1. `painPointTags` field is optional on applicable content types.
2. If present, each value must be a string matching one of the 11 controlled tags (case-sensitive, exact match).
3. Values not in the controlled list must cause a validation error.
4. `painPointTags` type must be `string[]` (or `array[string]`).
5. Empty array `[]` is treated as absent — no error.
6. Duplicate values in the array should be rejected by validation. Authoring tools may deduplicate before validation, but stored content must not contain duplicates.
7. Tag strings must be lowercase kebab-case only (e.g., `kanji-false-friend`, not `kanji_false_friend` or `KANJI_FALSE_FRIEND`).
8. The controlled list is an exhaustive allowlist: no custom or ad-hoc tags.


## 9. Content Model Wiring

See `docs/content/content-model-draft.md` for how `painPointTags` appears in each content type schema.

---

*This document is part of the Chabiko content architecture (#14). It should be reviewed when content schemas are implemented (#2) and when new pain points are identified through content authoring or user feedback.*

