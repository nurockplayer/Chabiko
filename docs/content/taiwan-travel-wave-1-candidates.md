# Taiwan Travel Wave 1 Candidate Package

**Status:** Isolated candidate content for Issue #431. Human language,
teaching, regional, script-provenance, and source/provenance review are pending.

## Boundary

This package contains exactly `lesson-011` through `lesson-024`. It is not read
by the production lesson loader, `data/learning-paths.json`, the Taiwan Travel
assessment, or any learner route. Merging the package cannot make a lesson
learner-visible or change a production review decision.

The package owns:

- `data/content-pilots/taiwan-travel-wave-1/lessons.json` — the 14 draft lessons;
- `data/content-pilots/taiwan-travel-wave-1/graph-paths.json` — an isolated,
  typed path that reconciles the exact lesson IDs and order;
- `data/content-pilots/taiwan-travel-wave-1/review-scope.json` — the exact
  human-review scope, with every dimension initially `not-reviewed`;
- `docs/content/reviews/taiwan-travel-wave-1-v1.md` — the generated packet;
- `src/content/loadTaiwanTravelWave1ReviewScope.ts` — fail-closed package,
  graph, scope, fingerprint, and packet validation;
- `scripts/render-taiwan-travel-wave1-review-packet.ts` — the only canonical
  packet writer.

The existing golden pilot and `issue-360-launch-v1` campaign remain separate
and unchanged.

## Frozen production baseline inventory

This is reconciled evidence from the immutable authoring branch point, not a
claim that this document existed before authoring began. The frozen source for
every row is commit `5b36ad357fa220d4210cd40fafd9543f1bb23861`, path
`data/examples/valid/lessons.json`. The same path on current Wave integration
main `085518d99f740fe9a96315e4e39af66786e46792` resolves to the identical Git
blob `952696aab2893318bd7fe1c37335cf1ca6a707e1`.

The key-pattern column is the ordered `chunks[].chunk` sequence; the pain-point
column is the stored `painPointTags` array. This keeps the inventory mechanical
and avoids adding an after-the-fact interpretation of the production lessons.

| ID | Scenario | Can-Do | Core sentence | Key pattern | Pain points | Frozen source |
|---|---|---|---|---|---|---|
| `lesson-001` | food | 台湾の夜市で簡単に食べ物を注文できる | 我要這個 | 我要 + 這個 | tone | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-002` | food | 値段を尋ね、値札やレジ表示で金額を確認できる | 這個多少錢？ | 這個 + 多少 + 錢 | tone, pinyin-pronunciation | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-003` | transport | 駅やトイレなど、目的の場所がどこにあるか聞ける | 捷運站在哪裡？ | 捷運站 + 在 + 哪裡 | tone | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-004` | transport | 駅員さんや運転手さんに、行き先を伝えて移動できる | 我要去台北車站。 | 我要 + 去 + 台北車站 | tone, pinyin-pronunciation, same-kanji-different-meaning | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-005` | food | 屋台やお店で、欲しい数量を伝えて注文できる | 我要兩個。 | 我要 + 兩個 + 個 | measure-word, tone | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-006` | food | 料理の辛さを伝えて、辛くしないように注文できる | 不要辣，謝謝。 | 不要 + 辣 + 謝謝 | tone | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-007` | shopping | 買い物で、カード払いができるかどうか聞ける | 可以刷卡嗎？ | 可以 + 刷卡 + 嗎 | tone, pinyin-pronunciation | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-008` | hotel | ホテルの受付で、予約していることを伝えてチェックインできる | 我有預約。 | 我有 + 預約 | tone | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-009` | emergency | 中国語が聞き取れなかったとき、ゆっくり言い直してもらえる | 可以再說慢一點嗎？ | 再 + 說慢一點 + 嗎 | tone, pinyin-pronunciation | `5b36ad3` · `data/examples/valid/lessons.json` |
| `lesson-010` | emergency | 困ったときに、周りの人に助けを求められる | 請幫幫我。 | 請 + 幫幫 + 我 | tone | `5b36ad3` · `data/examples/valid/lessons.json` |

Reproduce the inventory from the frozen source:

```bash
rtk git show 5b36ad357fa220d4210cd40fafd9543f1bb23861:data/examples/valid/lessons.json \
  | jq -r '.lessons[] | select(.id >= "lesson-001" and .id <= "lesson-010") | [.id, .travelScenario, .canDoJa, .coreSentence, (.chunks | map(.chunk) | join(" + ")), (.painPointTags | join(", "))] | @tsv'
```

Verify the full source blob and the normalized ten-row projection against the
fixed Wave integration-main commit:

```bash
rtk git rev-parse 5b36ad357fa220d4210cd40fafd9543f1bb23861:data/examples/valid/lessons.json
rtk git rev-parse 085518d99f740fe9a96315e4e39af66786e46792:data/examples/valid/lessons.json

for ref in 5b36ad357fa220d4210cd40fafd9543f1bb23861 085518d99f740fe9a96315e4e39af66786e46792; do
  rtk git show "$ref":data/examples/valid/lessons.json \
    | jq -c '[.lessons[] | select(.id >= "lesson-001" and .id <= "lesson-010") | {id, travelScenario, canDoJa, coreSentence, chunks: [.chunks[].chunk], painPointTags}]' \
    | shasum -a 256
done
```

The two `rev-parse` commands each print
`952696aab2893318bd7fe1c37335cf1ca6a707e1`. The two normalized projections
each print
`2f209a1c0cbbce66ecf4fed7c8cc708b8236ee6cd68ded60911f53f89a9da250`.
The projection includes exactly the fields represented by the inventory table;
the matching full-file blob IDs additionally cover fields outside it.

## Coverage

| IDs | Scenario | New sub-tasks |
|---|---|---|
| `lesson-011`–`lesson-012` | airport (2) | Report damaged checked baggage and ask staff to inspect; report checked baggage has not appeared |
| `lesson-013`–`lesson-014` | transport (2) | Confirm a vehicle reaches a destination; ask where to transfer |
| `lesson-015`–`lesson-017` | food (3) | Ask for a table; ask about peanuts; ask to pack leftovers |
| `lesson-018`–`lesson-019` | shopping (2) | Ask to try on clothing; request a receipt |
| `lesson-020`–`lesson-021` | hotel (2) | Ask about luggage storage; report an unusable room key |
| `lesson-022`–`lesson-023` | emergency (2) | Report separation from a companion; ask someone to call an ambulance |
| `lesson-024` | social (1) | Give a short name-and-origin introduction |

Every candidate includes the canonical lesson-loop step 9 as a short Japanese
`reviewHookJa`. Each hook names a real `第N課` in the production or Wave-1
package and says which phrase or contrast will return there. The Wave loader
requires all 14 hooks to be non-empty and distinct, and the focused test
resolves every referenced lesson ID before packet construction. The shared
lesson contract keeps this field optional for the existing production lessons;
when present, the shared TypeScript loader and Python schema both reject an
empty or malformed value.

The lesson-only `social` scenario is intentionally not added to phrasebook,
dialog, roleplay, vocabulary, sentence, or practice scenario vocabularies.

## Deterministic review contract

Each lesson fingerprint is:

```text
sha256(stableStringify(recordWithoutTopLevelReviewStatus))
```

Changing learner content, script provenance, teaching notes, or other semantic
fields changes the fingerprint. The top-level workflow transition is excluded
so a future authorized status change does not pretend to create a new content
version. The packet review version also binds the manifest, review dimensions,
typed graph relations, exact record references, source path, and per-record
fingerprints.

The resolver fails closed on wrong count/order/scenario coverage, duplicate or
stale references, production ID overlap, non-draft records, malformed rich
lesson sections, unusable prompts, source-path drift, unsupported review
role outcomes, and generated packet drift. Per-role outcomes use the
canonical `accepted`, `rejected`, `needs-changes`, and `not-reviewed` values.
They remain separate from the packet's top-level overall decision and cannot
independently authorize promotion.

## Reviewer role authorization

The manifest freezes the following ordered required-role matrix from the
canonical workflow. Missing, extra, duplicated, or reordered roles fail
closed.

| Dimension | Required reviewer roles, in order |
|---|---|
| Natural Taiwan Mandarin | `human-language-reviewer`, `human-regional-reviewer` |
| Natural Japanese explanation | `human-language-reviewer` |
| Lesson loop and travel usefulness | `human-teaching-reviewer` |
| Pinyin and pronunciation guidance | `human-language-reviewer`, `human-teaching-reviewer` |
| Kanji bridge accuracy | `human-teaching-reviewer` |
| Review prompt quality | `human-teaching-reviewer` |
| Graph, identity, order, and scope correctness | `maintainer` |
| Source and script provenance correctness | `human-source-reviewer`, `human-script-verifier` |

Every dimension also carries one `reviewerEvidence` entry per required role,
in the same order. Each row owns its outcome independently; there is no shared
dimension outcome that can contradict the required roles. Checked-in entries
use `not-reviewed` with null identity, date, and findings because no human
review has occurred. An `accepted`, `rejected`, or `needs-changes` row requires
complete identity, a valid ISO date, and findings; a `not-reviewed` row must
remain empty. Mixed outcomes in a multi-role dimension are retained and remain
non-promotable. Even when every required role is accepted, promotion still
requires a separate overall accepted decision and maintainer action. A global
reviewer identity does not substitute for per-role evidence. These fields
participate in the packet `reviewVersion`; they do not change lesson
fingerprints.

## Canonical rebuild

From the repository root:

```bash
node scripts/render-taiwan-travel-wave1-review-packet.ts
```

The command validates the complete package before overwriting exactly the
owned Markdown packet. Its focused test runs the real command twice in a
temporary directory, confirms byte-for-byte idempotence, and removes only that
test-created directory.

Run focused validation with:

```bash
pnpm exec vitest run tests/taiwan-travel-wave1-candidates.test.ts
uv run python scripts/validate-content-schema.py --check data/content-pilots/taiwan-travel-wave-1/lessons.json
```

Technical validation is not human approval. All records stay `draft`, example
script forms stay `generated`, and the generated packet keeps every review
role truthfully `not-reviewed` while providing fillable per-role and overall
outcome fields for humans reviewing its exact versions.
