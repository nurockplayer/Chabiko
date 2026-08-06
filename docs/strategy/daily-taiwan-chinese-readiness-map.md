# Daily Taiwan Chinese → Travel Quest Readiness Map

**Status:** Product contract for #20
**Last updated:** 2026-08-06
**Alignment:** MOTIV-01, MOTIV-02, MOTIV-03; Phase 3 plan 03-04
**Readiness contract:** `data/travel-quest-readiness.json` (schemaVersion 1, from #232 / aca0c508)

This document defines how Daily Taiwan Chinese content reinforces the frozen
Travel Quest v1 readiness targets. It is the single source of truth for the
Daily → readiness mapping. Issue #234 consumes this mapping without another
approval gate.

---

## 1. Purpose

Daily Taiwan Chinese is a short, recurring format that keeps Japanese learners
returning between lessons. This map defines, per supported daily-content type:

- a stable type ID and its Japanese learner label;
- which readiness targets the type may affect, and with what effect;
- the exact evidence required for a counting effect;
- duplicate/repeat, and missing/unavailable/changed-target behavior;
- at least one counting and one non-counting example.

The mapping is additive to the merged readiness domain. It does not change the
frozen target definitions in `data/travel-quest-readiness.json`, the fixed
evidence-type contract (`TravelQuestEvidenceType`), or any evidence key format
(`type:id`). It never adds persistence, UI, or a new storage key.

## 2. Readiness Contract This Map Rests On

The frozen readiness targets and their declared required evidence are:

| Target ID | Japanese label | Declared required evidence (evidence key) |
|-----------|----------------|--------------------------------------------|
| `navigate-arrival` | 到着して動ける | `completed-lesson-practice:lesson-003`, `completed-phrase-practice:phrase-transport-arrival`, `completed-roleplay-rehearsal:roleplay-transport-guide` |
| `order-and-pay` | 注文して支払う | `completed-lesson-practice:lesson-001`, `completed-lesson-practice:lesson-002`, `completed-phrase-practice:phrase-order-pay`, `completed-roleplay-rehearsal:roleplay-order-food`, `completed-vocabulary-session:teacher-star-1-bdc7865a507e` |
| `stay-and-ask` | 宿泊して尋ねる | `completed-lesson-practice:lesson-003`, `completed-phrase-practice:phrase-hotel-checkin`, `completed-roleplay-rehearsal:roleplay-hotel-checkin` |
| `recover-and-get-help` | 聞き直して助けを求める | `completed-phrase-practice:phrase-recover-help`, `completed-roleplay-rehearsal:roleplay-recover-help` |

Evidence keys use the canonical `type:id` format from
`src/domain/travelQuestReadiness.ts`. A target is `ready` only when every
declared required evidence key is complete. The denominator is fixed and never
shrinks.

## 3. Effect Model

Three effects are defined, and nothing else:

| Effect | Meaning | Counts toward readiness? |
|--------|---------|--------------------------|
| **grant** | The daily action completes one exact declared required evidence key of an eligible target (`type:id`). It is single-shot per key: the key is added at most once, so repeated exposure can never exceed the fixed required-evidence count. | Yes — adds the exact key to the completed set. |
| **reinforce** | The daily action keeps an already-granted evidence key active for retention, or exercises scenario vocabulary without being the canonical evidence source. It never adds a new key by itself and never moves a target to `ready` on its own. | Bounded — confirms/refreshes existing keys only; adds no new numerator progress. |
| **no effect** | The daily action produces no evidence signal: passive view/open, informational-only content, content with no eligible target, draft/provisional content, or unavailable/technically invalid content. | No. |

Reinforcement is bounded by construction: because it never introduces a new
completed key, no amount of repetition can raise a numerator or reach `ready`.
Grant is bounded by key deduplication: a key that is already complete adds
nothing on repeat.

## 4. Supported Daily-Content Types

The five daily-content formats below are defined in
`docs/strategy/learning-and-motivation-strategy.md` (Content Formats and the
Daily Taiwan Chinese core item). Four of them carry a readiness effect and are
fully mapped in §4.1–§4.4 with stable type IDs — the contract #234 consumes.
`tone-tale` is deliberately unmapped for readiness (§4.5): it always has
`no effect`, so #234 must never wire it to readiness.

### 4.1 `daily-phrase-card` — 「今日のフレーズカード」

**Definition:** the canonical Daily Taiwan Chinese item — one useful phrase,
one Japanese explanation, one pronunciation/tone point, one Taiwan
travel/culture note, and one instant practice prompt. Scenario-tagged
(airport / transport / food / hotel / emergency).

**Eligible readiness targets:** all four, restricted by the card's scenario:

| Card scenario | Eligible target IDs |
|---------------|---------------------|
| airport / transport | `navigate-arrival` |
| food | `order-and-pay` |
| hotel | `stay-and-ask` |
| emergency / recovery | `recover-and-get-help` |

**Effect:**

- **grant** — only when the card is `reviewed` (mastery-grade) AND its instant
  practice is the canonical completion action for a declared
  `completed-phrase-practice:{id}` reference of an eligible target.
- **reinforce** — when the card is `reviewed` and scenario-matches an eligible
  target but is not the canonical evidence source for that target, or when it
  is the canonical evidence source for an already-complete key.
- **no effect** — passive view/open (no practice completed), draft/provisional
  cards, or cards with no eligible target (e.g., a shopping-only card when
  `order-and-pay` is the only food target).

**Exact evidence required for grant:**

| Card maps to | Exact evidence key |
|--------------|--------------------|
| `navigate-arrival` | `completed-phrase-practice:phrase-transport-arrival` |
| `order-and-pay` | `completed-phrase-practice:phrase-order-pay` |
| `stay-and-ask` | `completed-phrase-practice:phrase-hotel-checkin` |
| `recover-and-get-help` | `completed-phrase-practice:phrase-recover-help` |

**Duplicate/repeat behavior:** completing the same card twice produces the same
key once; the second completion is a reinforce, not a second grant. Multiple
cards that grant the same key deduplicate to one completed key. Numerator can
never exceed the declared required-evidence count for the target.

**Missing/unavailable/changed-target behavior:** if the referenced phrase id is
missing, unavailable, technically invalid, or no longer a declared required
evidence reference for the target, the card grants nothing (falls to no
effect). A target that changes its evidence set never shrinks its denominator.

**Examples:**

- Counting: a `reviewed` transport-scenario card 「請問捷運站怎麼走？」 whose
  instant practice completes `completed-phrase-practice:phrase-transport-arrival`
  → grants `navigate-arrival`.
- Non-counting: the learner opens the same card but never completes the instant
  practice prompt → passive view, no effect.

### 4.2 `onyomi-bridge-card` — 「漢字ブリッジカード」

**Definition:** a vocabulary similarity bridge card with Traditional Chinese,
pinyin, Japanese reading/explanation, similarity type, example sentence, tone
note, caution/false-friend note, scenario tag, and review/source metadata.

**Eligible readiness targets:** only targets whose declared required evidence
includes a `completed-vocabulary-session:{id}` reference. Today that is exactly
one target:

| Target ID | Evidence reference |
|-----------|--------------------|
| `order-and-pay` | `completed-vocabulary-session:teacher-star-1-bdc7865a507e` (朋友) |

A bridge card whose vocabulary id is not a declared evidence reference of any
target is ineligible for grant.

**Effect:**

- **grant** — only when the card is `reviewed` AND its vocabulary session is the
  canonical completion action for `completed-vocabulary-session:teacher-star-1-bdc7865a507e`
  on `order-and-pay`.
- **reinforce** — when the card is `reviewed` and its vocabulary belongs to an
  eligible target's scenario (e.g., ordering/food vocabulary for `order-and-pay`)
  but is not the canonical evidence source.
- **no effect** — passive view, draft/provisional cards, or cards whose
  vocabulary id is ineligible.

**Exact evidence required for grant:**

| Card maps to | Exact evidence key |
|--------------|--------------------|
| `order-and-pay` | `completed-vocabulary-session:teacher-star-1-bdc7865a507e` |

**Duplicate/repeat behavior:** the vocabulary session key is single-shot; repeat
sessions of the same vocabulary id do not add a second key. No target can receive
more than one completed key per declared evidence reference.

**Missing/unavailable/changed-target behavior:** if the vocabulary id is
missing, unavailable, invalid, or removed from the target's declared evidence,
the card grants nothing (no effect). Denominator never shrinks.

**Examples:**

- Counting: a `reviewed` 朋友 bridge card completes
  `completed-vocabulary-session:teacher-star-1-bdc7865a507e` → grants
  `order-and-pay`.
- Non-counting: a bridge card for a vocabulary entry that no target references
  (e.g., a restaurant sign word not in any evidence set) → no effect.

### 4.3 `phrase-theater` — 「フレーズ劇場」

**Definition:** a short 3-5 turn dialogue with setting, characters,
tap-to-reveal pinyin and Japanese explanation, a cultural note, related
vocabulary, and a practice prompt.

**Eligible readiness targets:** all four, by the dialogue's scenario tag
(airport / transport / food / hotel / emergency), matched as in §4.1.

**Effect:**

- **reinforce** — when the dialogue is `reviewed` and scenario-matches an
  eligible target. A theater is never the canonical source of a
  `completed-roleplay-rehearsal:{id}` reference (that evidence belongs to
  dedicated roleplay rehearsal, not daily dialogues), so it never grants.
- **no effect** — passive viewing, draft/provisional dialogues, or dialogues
  with no eligible target.

**Exact evidence required:** none. Reinforcement adds no new completed key.

**Duplicate/repeat behavior:** repeated viewing of the same dialogue is pure
reinforce; because reinforce introduces no new key, repetition cannot create
unbounded progress.

**Missing/unavailable/changed-target behavior:** a dialogue whose scenario has
no eligible target, or whose related vocabulary no longer resolves, has no
effect. It never shrinks any denominator.

**Examples:**

- Counting (bounded reinforcement): a `reviewed` transport dialogue about
  finding the MRT platform reinforces `navigate-arrival` while the learner
  retains `completed-phrase-practice:phrase-transport-arrival`.
- Non-counting: the learner opens the dialogue without engaging any practice
  prompt → passive view, no effect.

### 4.4 `culture-bite` — 「カルチャーひとくちメモ」

**Definition:** a short Japanese note about a Taiwan custom, place, food, or
travel behavior, with 3-5 Chinese terms embedded. Informational plus embedded
scenario vocabulary.

**Eligible readiness targets:** all four, only when the embedded terms include a
vocabulary id that is a declared evidence reference of a target. Today that is
`order-and-pay` via `completed-vocabulary-session:teacher-star-1-bdc7865a507e`
(朋友), or scenario vocabulary that reinforces an eligible target's phrase
practice.

**Effect:**

- **reinforce** — when the bite is `reviewed` and its embedded terms include
  vocabulary in an eligible target's scenario (retention support; never the
  canonical grant source).
- **no effect** — passive reading, draft/provisional bites, or bites whose
  embedded terms reference no eligible target.

**Exact evidence required:** none. Reinforcement adds no new completed key.

**Duplicate/repeat behavior:** repeated reading of the same bite is pure
reinforce; no new key, no unbounded progress.

**Missing/unavailable/changed-target behavior:** a bite whose embedded term ids
do not resolve, or that references no eligible target, has no effect. Never
shrinks a denominator.

**Examples:**

- Counting (bounded reinforcement): a `reviewed` night-market culture bite
  embedding food vocabulary reinforces `order-and-pay` while the learner
  retains its declared evidence.
- Non-counting: a culture bite about MRT etiquette with terms that reference no
  declared evidence → no effect.

### 4.5 `tone-tale` — 「声調ストーリー」(unmapped, always no effect)

**Definition:** a short mnemonic for one sound or tone contrast. Informational;
aids the separate pronunciation track defined in
`docs/strategy/tone-and-pronunciation-training-loop.md`.

**Eligible readiness targets:** none. Tone training is a separate readiness
track (low-confidence pronunciation readiness per the pronunciation loop) and
is not one of the four frozen Travel Quest evidence types.

**Effect:** **no effect** — always. A tone tale produces no
`completed-{lesson|phrase|roleplay|vocabulary}-practice` evidence key. It is
deliberately unmapped, so no `grant` or `reinforce` case exists to count.

**Exact evidence required:** none.

**Duplicate/repeat behavior:** repetition has no effect on Travel Quest
readiness; it does not and cannot create progress against any target.

**Missing/unavailable/changed-target behavior:** not applicable — there is no
eligible target to become missing or changed.

**Examples:**

- Counting: not applicable; this type has no counting case by design.
- Non-counting: reading the 「買/賣」 tone-tale mnemonic → no effect on any
  Travel Quest target.

## 5. Fixed Product Rules

Every rule below is binding and applies to all daily-content types:

1. **Passive view/open events do not count.** A grant or reinforce requires the
   mapped completion action (completing the instant practice, the vocabulary
   session, or the dialogue practice prompt). Opening, reading, or scrolling is
   `no effect`.
2. **Repeated exposure cannot create unbounded progress.** Grant is single-shot
   per evidence key; reinforce adds no new key. A numerator can never exceed the
   fixed declared required-evidence count.
3. **Draft/provisional content has `no effect` in v1.** This mapping does not
   permit any daily type to grant or reinforce from draft/provisional content.
   Grant always requires `reviewed`; reinforcement also requires `reviewed` on
   the types that can reinforce (`phrase-theater`, `culture-bite`). A draft item
   is never surfaced as reviewed mastery. (#234 therefore needs no per-entry
   opt-in flag or new schema field to enforce this rule.)
4. **Unavailable or technically invalid content grants nothing.** A missing,
   unavailable, malformed, or changed evidence reference or vocabulary id yields
   `no effect` and can never shrink a denominator.
5. **No new product machinery in this ticket.** This map adds no streak, XP,
   currency, badge, account, backend, analytics, notification, storage, schema,
   or UI. It only defines how existing readiness evidence is produced and capped.

## 6. Cross-Reference

- `docs/strategy/learning-and-motivation-strategy.md` — defines the Daily
  Taiwan Chinese format and the four content formats mapped here.
- `docs/strategy/tone-and-pronunciation-training-loop.md` — the separate
  pronunciation track; tone tales feed it, not Travel Quest readiness.
- `data/travel-quest-readiness.json` and `src/domain/travelQuestReadiness.ts` —
  the frozen targets, evidence keys, and evaluation domain (#232).
