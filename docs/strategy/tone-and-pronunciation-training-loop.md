# Mandarin Tone and Pronunciation Training Loop (v1)

**Status:** Design for #15
**Last updated:** 2026-07-15
**Alignment:** Phase 3 plan 03-05; P1 (Taiwan Travel Learner) primary persona
**Research basis:** Zhu & Zhang (2012), Shu & Mok (2024), Wu et al. (2024), So & Best (2010), phonetic contrast analyses of Japanese-Mandarin L2 acquisition. See §10 for full references.

---

## 1. Purpose

This document defines the v1 pronunciation training loop for Japanese speakers learning Mandarin in Chabiko. It covers:

1. The five-step speech-learning loop.
2. The first tone/pinyin contrasts to support in v1, prioritised by Japanese-native interference severity.
3. At least three practice item formats implementable with structured content and local state only.
4. How Japanese-native interference patterns are addressed explicitly.
5. How practice items connect to lessons, vocabulary, and Travel Quest.
6. What can be implemented without speech recognition.

Speech recognition, native audio production pipelines, pitch tracking, and advanced phonetics curricula are explicitly out of scope for v1 (see §7).

---

## 2. The Pronunciation Practice Loop

Each pronunciation exercise follows a five-step loop. Steps 1–3 are receptive (noticing and discriminating); steps 4–5 are productive (shadowing with self-check). This order mirrors the listening-before-production principle in `docs/strategy/learning-and-motivation-strategy.md`.

### 2.1 Loop Steps

| Step | Name | What the learner does | Required technology |
|------|------|----------------------|--------------------|
| 1 | **Notice** | Sees a Chinese word/phrase with pinyin, hears (or sees a tone contour visual of) its sound. A short Japanese note flags what a Japanese speaker might flatten or confuse. | Tone contour graphic (SVG/CSS); structured pinyin metadata |
| 2 | **Compare** | Sees a side-by-side contrast: the target sound vs a Japanese‑speaker‑specific trap (e.g., zhēn vs zēn, T2 麻 vs T3 馬). A Japanese explanation describes the acoustic difference. | Structured minimal-pair data; Japanese explanation text |
| 3 | **Discriminate** | Hears or sees a pinyin/tone prompt and selects the correct answer from distractors. Immediate feedback: correct/incorrect with explanation. | Structured multiple‑choice items; local correctness state |
| 4 | **Shadow** | Sees the target word with pinyin and tone contour. Learner speaks aloud (unrecorded — self-monitored). A checklist of "what to listen for in your own voice" appears, written for Japanese speakers. | Tone contour graphic; Japanese‑language self-check prompts |
| 5 | **Retry** | If the learner answered incorrectly in step 3, the same item reappears with a stronger hint (e.g., tone contour highlighted, narrower distractor set). After two consecutive correct answers, the item is promoted to `confident` in local state. | Local progress state (new / learning / shaky / confident per item) |

### 2.2 Loop Variant for Lesson Integration

When a pronunciation item appears inside a lesson (as part of the `soundFocus` section), steps 1–2 are integrated into the lesson flow, and steps 3–5 are available as an inline mini-practice expandable section. See §6 for connection rules.

---

## 3. v1 Tone and Pinyin Contrasts

The pronunciation target for v1 is Taiwan Guoyu (臺灣國語). Tone contours follow Taiwan‑practiced patterns (e.g., fewer neutral‑tone reductions than Mainland Putonghua). Initial/final inventories are shared between Taiwan and Mainland Mandarin; the contrasts below apply regardless of regional variant.

The following contrasts are selected for v1 based on (a) severity of Japanese-native interference supported by acquisition research, and (b) frequency in beginner travel vocabulary. They are ordered by priority.

### 3.1 Tone Contrasts

| Priority | Contrast | Why | Research basis | Example pairs |
|----------|----------|-----|----------------|---------------|
| P1 | T2 (rising) vs T3 (dipping) | Most confusable pair for Japanese speakers; both have dipping/rising contours that Japanese pitch‑accent does not distinguish | Zhu & Zhang (2012) — Japanese learners' lowest discrimination accuracy on T2 vs T3; confusion driven by turning‑point position and ΔF0 | 麻 má (T2) vs 馬 mǎ (T3); 十 shí vs 屎 shǐ; 什麼 shénme vs 怎麼 zěnme |
| P2 | T1 (high level) vs T4 (falling) | Confusable pair for Japanese speakers; both end in a falling pitch range that Japanese L1 pitch‑accent does not clearly separate | So & Best (2010) — Japanese speakers confuse T1/T4 in perception, consistent with L1 pitch‑accent transfer; Wu et al. (2024) — Japanese speakers produce narrower F0 range overall, reducing contour distinctiveness | 媽 mā (T1) vs 罵 mà (T4); 書 shū vs 樹 shù |
| P3 | T3 sandhi (3‑3 → 2‑3) | Japanese speakers over‑apply or ignore tone sandhi; both error patterns cause comprehension breakdown | Shu & Mok (2024) — Japanese learners overgeneralise T3 sandhi under influence of L1 pitch‑accent patterns | 你好 nǐ hǎo → ní hǎo; 很好 hěn hǎo → hén hǎo |
| P4 | T1 vs T2 | Less confusable than T2/T3 but still worth covering with high‑frequency travel vocabulary | General L2 Mandarin tone acquisition literature | 喝 hē (T1) vs 和 hé (T2); 通 tōng (T1) vs 同 tóng (T2) |

### 3.2 Pinyin Consonant Contrasts

| Priority | Contrast | Why | Research basis | Example pairs |
|----------|----------|-----|----------------|---------------|
| P1 | zh/z, ch/c, sh/s | Japanese lacks retroflex series entirely; learners merge zh/z, ch/c, sh/s into alveolar | Multiple phonetic contrast analyses of Japanese L1 phonology | 紙 zhǐ vs 子 zǐ; 吃 chī vs 次 cì; 是 shì vs 四 sì |
| P2 | j/q/x vs zh/ch/sh | Japanese palatalises /s, ts/ before /i/, merging the j/q/x and zh/ch/sh series in perception | Phoneme‑inventory comparison (Japanese has [tɕ, dʑ, ɕ] as allophones of /t, d, s/ before /i/) | 七 qī vs 吃 chī; 西 xī vs 師 shī |
| P3 | r (retroflex) | Mandarin /ʐ/ or /ɻ/ has no Japanese equivalent; learners substitute Japanese flap /ɾ/ | Phonetic contrast analysis — Japanese lacks retroflex | 日 rì; 人 rén; 熱 rè |
| P4 | Aspiration: b/p, d/t, g/k | Japanese contrasts are voicing‑based; Mandarin aspiration contrast is non‑native and often merged | L2 phonology — aspiration is a non‑native category for Japanese speakers | 爸 bà vs 怕 pà; 大 dà vs 踏 tà |

### 3.3 Pinyin Vowel/Nasal Contrasts

| Contrast | Why | Example pairs |
|----------|-----|---------------|
| -in vs -ing | Japanese does not distinguish these codas; learners neutralise both to /iɴ/ | 今 jīn vs 靜 jìng; 賓 bīn vs 冰 bīng |
| -en vs -eng | Same neutralisation pattern | 很 hěn vs 恆 héng; 門 mén vs 夢 mèng |

These vowel/coda contrasts are v1 stretch goals — included only if the first six consonant and tone contrasts are fully covered.

### 3.4 High-Frequency Beginner Words for Tone Discrimination

These words should appear as the first tone‑discrimination practice items because they are (a) frequent in travel contexts and (b) differ only by tone, making them ideal minimal pairs:

| Word pair | Tone difference | Travel relevance |
|-----------|----------------|------------------|
| 買 mǎi / 賣 mài | T3 vs T4 | Shopping (buy vs sell) |
| 東西 dōngxī / 東西 dōngxi | T1‑T1 vs T1‑neutral | Direction vs "thing" |
| 湯 tāng / 燙 tàng | T1 vs T4 | Food (soup vs hot) |
| 飽 bǎo / 包 bāo | T3 vs T1 | Food (full vs wrap) |
| 點 diǎn / 店 diàn | T3 vs T4 | Ordering (a little vs shop) |

---

## 4. Practice Item Formats

The existing content model (`docs/content/content-model-draft.md`) defines a `practice` type with a `type` field. This design adds `pinyin-contrast` and `guided-shadowing` alongside the existing `tone-discrimination` value; the content model and validator are updated in this change so authored items using these formats are accepted. A fourth format, `tone-pair-matching`, is a v1 stretch goal.

### 4.1 Tone Discrimination (`type: tone-discrimination`)

**How it works (visual-only / reference-audio ready):**
- **Visual mode** (v1, tone‑contour identification): Learner sees two contrasting syllables with pinyin and tone‑contour graphics side by side (e.g., mā with a high‑flat contour vs mà with a sharp‑falling contour). The tone marks and contour graphics are intentionally visible — the task is to **identify which contour matches a given description** ("哪個是第一声？"), not to hear the difference. This builds explicit awareness of contour shapes before audio is available.
- **Audio mode** (post‑v1, true discrimination): Learner hears a reference recording of one syllable and selects the matching contour among options. The tone marks and contours serve as answer keys only after the selection. No structural data changes needed — audio files are added as optional fields.

**Data shape:**

```jsonc
{
  "id": "tone-disc-001",
  "type": "tone-discrimination",
  "contrastId": "tone-t1-vs-t4",
  "promptJa": "「mā」と「mà」、どちらが高い平らな声調？",
  "correctAnswerJa": "mā（第一声）",
  "distractorsJa": ["mà（第四声）"],
  "toneContourId": "t1-high-flat",
  "toneContourHintJa": "第一声は高く平ら。日本語の平板なアクセントに近いが、最後まで下げない。第四声は急降下。",
  "interferenceJa": "日本語話者は第一声と第四声を平らに伸ばして区別しにくい。",
  "audioRef": null,
  "relatedVocabulary": ["voc-tone-001"],
  "painPointTags": ["tone"],
  "reviewStatus": "draft"
}
```

**Structured content requirement:** Each item stores `contrastId`, `toneContourId`, `toneContourHintJa` (Japanese explanation of the correct tone's contour), `interferenceJa` (Japanese-native interference note), `correctAnswerJa` (the correct Japanese-labelled option), and `distractorsJa` (wrong Japanese-labelled options). The tone loader normalizes these raw fields into the existing runtime `correctAnswer` and `distractors` shape. Items prompt a two-option or four-option choice between contrasting tones — both options share the same syllable and differ only by tone, and the tone‑contour graphics are part of the prompt. An optional `audioRef` field can hold a future reference‑audio file path per option.

This is a contour‑identification exercise (visual mode), not a true listening‑discrimination exercise. Only auditory mode (post‑v1, using `audioRef`) qualifies as discrimination for Travel Quest readiness purposes.

### 4.2 Pinyin Contrast (`type: pinyin-contrast`)

**How it works:**
- Learner sees two similar pinyin syllables (e.g., zhēn vs zēn) with tone marked.
- Learner identifies which syllable matches a given Japanese description, or selects the correct initial/final from options.
- A Japanese note explains the articulatory difference.

**Data shape:**

```jsonc
{
  "id": "pinyin-contrast-001",
  "type": "pinyin-contrast",
  "contrastId": "pinyin-zh-vs-z",
  "promptJa": "「知」のピンインの最初の音はどれ？",
  "correctAnswer": "zh",
  "distractors": ["z", "j"],
  "contrastNoteJa": "zh は舌を後ろに巻いて出す。日本語の「ず」とは違う。",
  "interferenceJa": "日本語には巻き舌音（zh/ch/sh）がないため、z/c/s と混同しやすい。",
  "articulationJa": "舌先を上あごの後ろに巻きつけるようにしてから離す。",
  "toneContourId": null,
  "audioRef": null,
  "relatedVocabulary": ["voc-pinyin-001"],
  "painPointTags": ["pinyin-pronunciation"],
  "reviewStatus": "draft"
}
```

**Structured content requirement:** Each item stores `contrastId`, `contrastNoteJa` (Japanese explanation of the articulatory difference from the nearest Japanese sound), `interferenceJa`, `articulationJa`, `correctAnswer` (a pinyin initial, final, or syllable), and `distractors` (confusable alternatives chosen from the Japanese‑specific confusion matrix in §3.2). `toneContourId` is optional for pinyin-only contrasts.

### 4.3 Guided Shadowing (`type: guided-shadowing`)

**How it works:**
- Learner sees a word with pinyin and a tone contour visualisation.
- A step‑by‑step Japanese shadowing guide tells the learner what to listen for in their own voice.
- The learner speaks aloud (no recording). After shadowing, they self‑assess using a checklist.

**Data shape:**

```jsonc
{
  "id": "shadow-001",
  "type": "guided-shadowing",
  "contrastId": null,
  "promptJa": "声に出して言ってみよう：「謝謝」",
  "correctAnswer": null,
  "targetTraditional": "謝謝",
  "targetTraditionalStatus": "authored",
  "targetSimplified": "谢谢",
  "targetSimplifiedStatus": "authored",
  "targetPinyin": "xièxie",
  "toneContourId": "t4-weak",
  "shadowStepsJa": [
    "1. xiè は第四声。短く急激に下げる。",
    "2. 二つ目の xie は軽声（軽く短く）。",
    "3. 日本語の「シエシエ」にならないよう、舌を歯茎に近づけて x の音を出す。"
  ],
  "selfCheckJa": [
    "☐ xiè が急降下したか？",
    "☐ 二つ目が短く軽くなったか？",
    "☐ 舌が歯茎に近づいていたか？"
  ],
  "interferenceJa": "日本語の「シエシエ」は平板で x の摩擦が弱い。",
  "articulationJa": "x は舌を歯茎に近づけて隙間から息を出す。「シ」より摩擦音が強い。",
  "audioRef": null,
  "requiredForQuest": false,
  "relatedVocabulary": ["voc-common-001"],
  "painPointTags": ["tone", "pinyin-pronunciation"],
  "reviewStatus": "draft"
}
```

**Structured content requirement:** Each item stores `targetTraditional`, `targetTraditionalStatus`, `targetPinyin`, `toneContourId`, `shadowStepsJa` (an ordered list of Japanese instructions), `selfCheckJa` (a checklist the learner ticks mentally or via UI), `interferenceJa`, and `articulationJa`. The `targetTraditional`/`targetSimplified` naming distinguishes the shadowing target from the canonical vocabulary record fields (which use `traditional`/`simplified`). When the shadowing target is a phrase, it may not correspond to a single vocabulary entry; the `target*` prefix avoids collision with vocabulary record semantics. No audio or recording is required — the learner self‑monitors. Unlike tone‑discrimination and pinyin‑contrast items, guided‑shadowing has no single correct answer — `correctAnswer` is `null`; the validator explicitly allows this for `guided-shadowing` only.

### 4.4 Tone Pair Matching (stretch goal, `type: tone-pair-matching`)

If the first three formats are fully implemented, a fourth gamified format may be added:

- Learner sees a grid of tone‑pair combinations (e.g., T1‑T1, T1‑T2, T2‑T3).
- Each cell contains a vocabulary word with that tone pair.
- The learner matches the spoken/visualised word to the correct cell.

This format requires more content authoring and is deferred to post‑v1 iteration.

---

## 5. Handling Japanese‑Native Interference

Each practice item type must explicitly encode the Japanese‑speaker‑specific difficulty, not generic pronunciation advice.

### 5.1 Required Interference Metadata

Every pronunciation practice item must include at least one of:

| Field | Purpose | Required for |
|-------|---------|--------------|
| `interferenceJa` | Explains what Japanese speakers do wrong instead | All tone and pinyin items |
| `articulationJa` | Describes how to produce the sound from a Japanese L1 starting point | pinyin‑contrast, guided‑shadowing |
| `selfCheckJa` | A Japanese‑language checklist for the learner to self‑monitor | guided‑shadowing |

### 5.2 Tone Interference

- **T2 vs T3:** Japanese speakers fail to distinguish because Japanese pitch‑accent has no contour that dips and then rises within one syllable. The practice must explicitly show the turning‑point difference: T2 rises continuously from mid to high; T3 dips from low‑mid to low then rises. Tone contour graphics must highlight the turning point (§5.4).
- **Flattening:** Japanese speakers produce level pitch instead of contour tones. Every tone‑discrimination item must include a contour visual.
- **T3 sandhi overgeneralisation:** Learners may apply 2‑3 sandhi where it does not apply, or fail to apply it where it does. Practice items covering 3‑3 sequences must show both the citation form and the sandhi form with an explanation.

### 5.3 Pinyin Interference

| Japanese L1 feature | Mandarin problem | Practice response |
|---------------------|------------------|-------------------|
| No retroflex series | zh/ch/sh → merged with z/c/s | Explicit articulatory instruction: "舌を後ろに巻く" |
| /tɕ, dʑ, ɕ/ as allophones of /t, d, s/ before /i/ | j/q/x → confused with zh/ch/sh | Contrast drills: qī vs chī, xī vs shī |
| /ɾ/ as the only liquid | r → produced as a tap | "舌を奥に巻いて、先を上顎に近づける" |
| Voicing contrast (b/p, d/t, g/k) | Aspiration not perceived | "息を強く出す（p は「プッ」と息が感じられる）" |

### 5.4 Tone Contour Visualisation

Tone contours must be represented visually for all discrimination and shadowing items. The recommended approach uses a simple time‑pitch SVG graphic:

- **X axis:** time (syllable duration).
- **Y axis:** relative pitch (high → low).
- **Line colour:** one colour per tone (T1=blue, T2=green, T3=red, T4=orange).
- **Turning point marker:** for T3, a dot at the lowest point before the rise.

Contour data can be stored as a simple coordinate array per tone pattern in the content item, eliminating any need for audio or pitch‑tracking:

```jsonc
"toneContour": [
  {"time": 0, "pitch": 0.8},
  {"time": 0.5, "pitch": 0.8},
  {"time": 1, "pitch": 0.8}
]
```

The four canonical tone shapes and common tone‑pair shapes (e.g., T3‑T3 sandhi) are authored once and referenced by `toneContourId` in practice items. Neutral‑tone (轻声) items use a separate contour preset with reduced amplitude. Contour visualisation must not rely solely on colour — each line should also use a distinct dash pattern or label for accessibility.

---

## 6. Connection to Lessons, Vocabulary, and Travel Quest

### 6.1 Lesson Connection

Pronunciation practice items connect to lessons through two mechanisms:

1. **`lesson.painPointTags` as the link source:** v1 links a lesson to practice items when they share a `painPointTags` value. `SoundFocus` remains the existing one-item structure `{ item, noteJa }`; it explains the target sound in the lesson and does not carry tags or a `contrastId`.

2. **Selection rule:** When several matching items exist, show them in authored order. The lesson author selects the intended target through the existing `soundFocus.item` and Japanese `noteJa`; no new tag or linking field is added to `SoundFocus` in v1.

### 6.2 Vocabulary Connection

- Practice items reference vocabulary entries via `relatedVocabulary` (already in the content model).
- The vocabulary detail page (planned #7) may show a "Pronunciation drill" section containing related practice items.
- Vocabulary entries with `painPointTags` including `tone` or `pinyin-pronunciation` are prioritised for practice item assignment.

### 6.3 Travel Quest Connection

- Travel Quest completion may include pronunciation practice for scenario‑key vocabulary. In v1, a passed visual-mode tone-contour item counts as **low-confidence pronunciation readiness** so a Quest remains completable without audio; post-v1 audio-mode success supersedes it as confirmed auditory discrimination. Guided-shadowing self-assessment is informational only and does not block Quest completion.
- Example: the "Night Market" Travel Quest may include tone-discrimination drills for 我要, 這個, 多少錢, 好吃, but these are non-blocking until audio-mode validation is available.
- This is a checklist in local state, not a server‑side requirement. The Quest page displays pending pronunciation practice items alongside other task types.

### 6.4 Data Flow

```text
Lesson (soundFocus + painPointTags)
    → Practice items (type: tone-discrimination / pinyin-contrast / guided-shadowing)
    → Vocabulary entries (via relatedVocabulary)
    → Travel Quest (via scenario-tagged vocabulary + discrimination‑pass criteria)
```

All links are declarative (stored in content JSON). No runtime inference is required.

---

## 7. What Can Be Implemented Without Speech Recognition

| Feature | Without speech recognition | With speech recognition (post‑v1) |
|---------|---------------------------|-----------------------------------|
| Tone discrimination | Multiple‑choice from structured items | Hear the learner's production and score accuracy |
| Pinyin contrast | Minimal‑pair identification | Detect specific initial/final errors |
| Guided shadowing | Self‑assessment checklist | Automatic scoring of shadowing attempts |
| Tone contour visualisation | Static SVG/CSS per tone pattern | Real‑time pitch overlay |
| Retry logic | Local state (shaky / confident) | Adaptive difficulty based on production accuracy |

**v1 can implement all three practice item formats, visual tone contours, lesson/vocabulary/quest linking, and retry logic using only:**
- Structured JSON content files (practice items, vocabulary, lesson metadata).
- LocalStorage for per‑item progress (new / learning / shaky / confident).
- SVG or CSS tone‑contour graphics derived from authored coordinate data.
- No audio files, no recording, no pitch detection, no server state.

---

## 8. Preliminary Content Count Estimate (Non-Binding)

The following estimate is for authoring scoping only. Implementation decisions about exact numbers belong to the content authoring issue.

| Format | Suggested minimum | Basis |
|--------|-------------------|-------|
| Tone discrimination | 12 | 4 tone contrasts × 3 minimal pairs each |
| Pinyin contrast | 15 | 5 consonant contrasts × 3 minimal pairs each |
| Guided shadowing | 8 | High‑frequency travel words and phrases |
| Total | 35 | Feasible for initial authoring |

These items are assigned to existing and planned lessons via `painPointTags` and `relatedVocabulary` cross‑links.

---

## 9. Open Questions

| Question | Owner |
|----------|-------|
| What is the exact set of tone‑contour SVG coordinate presets (canonical vs sandhi)? | Content authoring (#6 phrasebook, #4 lesson sequence) |

---

## 10. References

- So, C. K., & Best, C. T. (2010). Cross-language perception of non-native tonal contrasts: Effects of native phonological and phonetic experience. *Language and Speech*, 53(2), 273–293. https://doi.org/10.1177/0023830909357156
- Zhu, M., Zhang, K., & Yoshimoto, K. (2012). The acquisition of Mandarin tones by Japanese learners. *Proceedings of TAL 2012*, ISCA Archive. https://www.isca-archive.org/tal_2012/zhu12b_tal.html
- Wu, X., et al. (2024). Production of Mandarin tones by Japanese native speakers. *Proceedings of Speech Prosody 2024*, ISCA. https://www.isca-archive.org/speechprosody_2024/wu24b_speechprosody.html
- Shu, Y., Zhu, Y., & Mok, P. (2024). Tonal patterns of the Mandarin Third Tone Sandhi produced by Japanese-speaking L2 learners. *Proceedings of Speech Prosody 2024*, ISCA. https://www.isca-archive.org/speechprosody_2024/shu24_speechprosody.html

---

*This document is part of the Chabiko pronunciation learning architecture (#15). It should be reviewed when practice interactions (#9) and Travel Quest readiness (#12) are implemented.*
