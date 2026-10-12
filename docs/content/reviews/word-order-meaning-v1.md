# Word-order meaning v1 — teacher review packet

**Candidate provenance: AI-generated (`generated`), unreviewed. Every proposed meaning and alternative below must not be used in production until a named human language reviewer approves the exact field values under [content-review-workflow.md](../content-review-workflow.md). No row is approved, reviewed, or published by this packet. Engineering/model review cannot replace human language approval.**

**Scope:** [Issue #512](https://github.com/nurockplayer/Chabiko/issues/512); [#509 F2](https://github.com/nurockplayer/Chabiko/issues/509).
**Source:** `data/examples/valid/practice.json` at `f897c367b41553cf714a3108a42ffe01c8962fd5`, all 22 `type: "word-order"` items in source order.
**Related proposal:** [word-order-meaning-contract.md](../word-order-meaning-contract.md).

Chinese canonical answers are existing source evidence, reproduced unchanged. Chunks below are the actual `tokenizeAnswer` output in canonical order: individual Unicode code points, including punctuation, because these answers contain no spaces. They are not newly authored word/phrase boundaries. Existing record `reviewStatus` and `sourceLesson` metadata are unchanged.

## Instructions for the human reviewer

Approve meanings and alternatives separately. Check Japanese clarity for beginners, exact target meaning, natural Taiwan Mandarin, and use of every chunk exactly once with identical punctuation. A grammatical sentence with a different meaning is not acceptable. `[]` means no alternative proposed, not proof that no natural alternative exists. Add an order only if confident; do not infer approval from a blank column or from an existing lesson review.

Use `accepted`, `rejected`, or `needs-changes`, separately labeled for `meaningJa` and `acceptableAnswersTraditional`, in the decision column. Enter the exact final meaning and exact approved alternatives (`[]` if explicitly approving none), plus your identity and actual ISO date. Blank reviewer cells are intentionally pending. These rows alone are incomplete review evidence until the artifact fields below are completed; field-level versions must bind the final approved values as specified by the proposed contract.

## Candidate items

| ID | Chunks (canonical order) | `correctAnswerTraditional` (source) | Candidate `meaningJa` | Candidate `acceptableAnswersTraditional` | Rationale / review warning | Decision | Corrected meaning | Approved alternatives | Reviewer | Date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| practice-002 | `["我","明","天","去","台","北"]` | 我明天去台北 | 私は明日台北に行きます。 | `["明天我去台北"]` | Time before the subject retains the destination and future-time meaning; teacher must confirm Taiwan naturalness. | | | | | |
| practice-006 | `["我","要","這","個"]` | 我要這個 | これをください。 | `[]` | Request for the nearby item in a buying/ordering context; confirm request wording for 要. | | | | | |
| practice-007 | `["我","要","那","個"]` | 我要那個 | あれをください。 | `[]` | Request for a more distant item; teacher should confirm Japanese demonstrative choice in the lesson context. | | | | | |
| practice-008 | `["這","個","多","少","錢","？"]` | 這個多少錢？ | これはいくらですか？ | `[]` | Price question about the nearby item; preserve the question mark as a chunk. | | | | | |
| practice-009 | `["那","個","多","少","錢","？"]` | 那個多少錢？ | あれはいくらですか？ | `[]` | Price question about the indicated distant item; review demonstrative context. | | | | | |
| practice-010 | `["捷","運","站","在","哪","裡","？"]` | 捷運站在哪裡？ | MRTの駅はどこですか？ | `[]` | Uses Taiwan's MRT context; verify that MRT is clear enough for a Japanese beginner. | | | | | |
| practice-011 | `["廁","所","在","哪","裡","？"]` | 廁所在哪裡？ | トイレはどこですか？ | `[]` | Direct location question with familiar Japanese travel wording. | | | | | |
| practice-012 | `["我","要","去","台","北","車","站","。"]` | 我要去台北車站。 | 台北駅に行きたいです。 | `[]` | Destination plus intent; 要 can express intent rather than a literal wish. Confirm the chosen Japanese reading. | | | | | |
| practice-013 | `["我","要","去","廁","所","。"]` | 我要去廁所。 | トイレに行きたいです。 | `[]` | Intent to go to the restroom; confirm desire versus immediate intention in context. | | | | | |
| practice-014 | `["我","要","兩","個","。"]` | 我要兩個。 | 2つください。 | `[]` | Ordering quantity with an implicit object; avoid adding an item absent from the Chinese target. | | | | | |
| practice-015 | `["我","要","一","個","。"]` | 我要一個。 | 1つください。 | `[]` | Same ordering frame with one item; confirm request reading and generic Japanese counter. | | | | | |
| practice-016 | `["我","要","三","個","。"]` | 我要三個。 | 3つください。 | `[]` | Same ordering frame with three items; no invented object or unit. | | | | | |
| practice-017 | `["不","要","辣","，","謝","謝","。"]` | 不要辣，謝謝。 | 辛くしないでください。ありがとうございます。 | `[]` | Food-ordering request followed by thanks; confirm that 辣 is represented accurately without promising absence of spices. | | | | | |
| practice-018 | `["我","不","要","辣","。"]` | 我不要辣。 | 辛くしないでください。 | `[]` | Natural Japanese request in the ordering context; confirm the first-person preference implied by 我不要. | | | | | |
| practice-019 | `["可","以","刷","卡","嗎","？"]` | 可以刷卡嗎？ | カードで払えますか？ | `[]` | Payment availability question; does not add a specific card network or debit/credit restriction. | | | | | |
| practice-020 | `["可","以","刷","卡","。"]` | 可以刷卡。 | カードで払えます。 | `[]` | Declarative payment availability, distinct from the preceding question. | | | | | |
| practice-021 | `["我","有","預","約","。"]` | 我有預約。 | 予約しています。 | `[]` | Existing appointment/reservation; do not add a hotel, restaurant, or booking time. | | | | | |
| practice-022 | `["你","好","，","我","有","預","約","。"]` | 你好，我有預約。 | こんにちは。予約しています。 | `[]` | Greeting followed by reservation statement; preserve both clauses and punctuation. | | | | | |
| practice-023 | `["可","以","再","說","慢","一","點","嗎","？"]` | 可以再說慢一點嗎？ | もう一度、少しゆっくり話してもらえますか？ | `[]` | 再 adds repetition and 慢一點 adds slower speech. Teacher should check the existing 說慢一點 wording; this packet neither corrects the source nor proposes an uncertain reorder. | | | | | |
| practice-024 | `["可","以","再","說","一","次","嗎","？"]` | 可以再說一次嗎？ | もう一度言ってもらえますか？ | `[]` | Repetition request without adding a slower-speech requirement. | | | | | |
| practice-025 | `["請","幫","幫","我","。"]` | 請幫幫我。 | 助けてください。 | `[]` | Reduplicated 幫 softens the request; keep both identical chunks. Teacher must confirm general help context rather than infer emergency instructions. | | | | | |
| practice-026 | `["請","幫","我","。"]` | 請幫我。 | 助けてください。 | `[]` | Direct help request without reduplication; same concise Japanese meaning does not merge the two record identities. | | | | | |

## Human review artifact — pending, to be completed by the reviewer

All evidence cells remain empty. Completion must follow the required artifact fields in the content review workflow §3. Separate scopes/outcomes are required even when the same person reviews both fields. Any regional/teaching reviewer needed for a disputed item must leave separately attributed evidence; no role is inferred from the maintainer role.

| Artifact field | Human entry |
| --- | --- |
| Reviewer identity | |
| Reviewer role | |
| Review date (YYYY-MM-DD) | |
| Reviewed items and fields (exact IDs, paths, final values) | |
| Review version (commit/file hash and per-field content versions) | |
| Overall outcome (accepted / rejected / needs-changes) | |
| Approval scope and outcome per field (learner-facing strings, Taiwan usage, teaching accuracy where applicable) | |
| Unresolved issues (explicitly list, or explicitly record none) | |
| Blocked content (exact IDs/fields, or explicitly record none) | |
| Review artifact path/URL and notes | |

Changing a meaning, alternative set, canonical answer, chunks, or source context invalidates the affected approval under the proposed contract and workflow §7. New evidence must match the final content. Maintainer selection and authorized implementation are later steps; this packet grants neither record-level status promotion nor publication.
