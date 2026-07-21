# Prototype Content Fixture

> Part of Issue #56 — defines the shared content that each prototype direction (#57, #58, #59) must render.
> This fixture is extracted from the production `data/examples/valid/lessons.json` and `data/examples/valid/hsk-vocabulary.json`.
> Prototypes must not modify these data files; they may reference or duplicate the content below for their demo pages.
> Date: 2026-07-21

## 1. Home-Path Card/List

### Lesson list item

Each prototype must display at least one learning-path list item that matches this content:

```json
{
  "number": 1,
  "titleJa": "夜市で注文してみよう",
  "canDoJa": "台湾の夜市で簡単に食べ物を注文できる",
  "exampleTraditional": "我要這個"
}
```

The lesson list item must show:
- A lesson number badge (circle or numbered indicator)
- The lesson title (`titleJa`)
- The can-do description (`canDoJa`)
- An optional Traditional Chinese example phrase

### Path card (goal-path slot)

```json
{
  "pathLabel": "台湾旅行で使える中国語",
  "lessonCount": 3,
  "status": "active"
}
```

And one disabled/planned path:

```json
{
  "pathLabel": "HSK対策",
  "status": "pending"
}
```

## 2. Lesson Phrase with Pinyin and Japanese Explanation

### Core sentence

| Field | Value |
|-------|-------|
| Traditional Chinese | 我要這個 |
| Pinyin | wǒ yào zhège |
| Japanese explanation | これをください |

### Chunk breakdown

| Chunk | Pinyin | Meaning | Notes (optional) |
|-------|--------|---------|------------------|
| 我要 | wǒ yào | 私は〜が欲しい | 日本語の「欲しい」と違い、中国語では「要」が意志を表す |
| 這個 | zhège | これ | 「這」＝これ、「個」＝量詞。指差しで使う |

### Example sentence

| Field | Value |
|-------|-------|
| Traditional Chinese | 我要那個 |
| Pinyin | wǒ yào nàge |
| Japanese | それをください |

### Sound focus

| Field | Value |
|-------|-------|
| Item | 要 yào |
| Note (Japanese) | 第四声。yào は「ヤオ」と伸ばさず、短く急降下。 |

### Kanji bridge note

| Field | Value |
|-------|-------|
| Kanji | 要 |
| Japanese reading | よう |
| Note (Japanese) | 日本語の「要る（いる）」に近いが、中国語では欲求・意思を表す |

## 3. Quiz Prompt

### Prompt

| Field | Value |
|-------|-------|
| Prompt (Japanese) | 「我要這個」はどういう意味？ |
| Correct answer | これをください |
| Distractor A | 私は〜が欲しい |
| Distractor B | これはいくらですか |
| Distractor C | どこにありますか *(prototype-specific — not in production data; added for a 3-choice layout)* |

### Correct feedback

```text
正解！
```

### Incorrect feedback

```text
不正解。
正解：これをください
```

## 4. Correct / Incorrect Feedback UI States

### Correct state
- Visual indicator: green checkmark or equivalent positive signal
- Text: 「正解！」in Japanese
- After correct answer: advance to next question or show completion state after 1200 ms (prototype may use animation or instant transition)

### Incorrect state
- Visual indicator: red or muted signal
- Text: 「不正解。」followed by 「正解：{correctAnswer}」
- After incorrect: show correct answer for 2000 ms, then advance

### Completion state (all questions answered correctly)
- Icon: ✔
- Text (Japanese): 「練習完了！レッスンをクリアしました。」

## 5. Vocabulary Flashcard (HSK 1)

| Field | Value |
|-------|-------|
| Simplified Chinese | 我 |
| Pinyin | wǒ |
| Japanese | 私 |
| Traditional Chinese | 我 |

### Session setup defaults
- Session size options: 10 words / 20 words
- Study direction options: 中国語 → 日本語 / 日本語 → 中国語
- Default: 10 words, 中国語 → 日本語

## 6. Layout Reference Dimensions

Prototype pages must be delivered at these viewport dimensions:

| Device | Viewport |
|--------|----------|
| Mobile | 390×844 px |
| Desktop | 1440×900 px |

## Usage Notes for Prototype Tickets

1. All text content must use exactly the Japanese strings above for learner-facing labels. Prototypes may add English in code comments or documentation but not in the rendered UI.
2. Chunk breakdown may be rendered as a definition list, table, or card layout — choose whatever best fits the direction.
3. Sound focus and kanji bridge notes are optional content; include them if they help demonstrate the direction's completeness.
4. The distractor C ("どこにありますか") is prototype-only — it is not present in the production data. Use it to demonstrate a three-choice layout; remove it if the prototype uses exactly two distractors to match production.
5. Flashcard content is from HSK 1 vocabulary. Prototypes may use any single HSK 1 entry they choose; the entry above (「我」) is the canonical example.
