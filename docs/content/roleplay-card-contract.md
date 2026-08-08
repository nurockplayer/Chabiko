# Taiwan Travel Roleplay Card Contract (Issue #243)

Executable contract for deterministic Taiwan travel roleplay cards. This file is
the human-readable contract; the executable validator in
`scripts/validate-content-schema.py` (self-tests under "Roleplay card (#243)")
is the source of truth for acceptance, and `src/types/roleplayCard.ts` is the
TypeScript type mirror.

## Purpose

Each roleplay card is a short, rehearsed Taiwan travel exchange between the
learner and a conversation partner. Cards are the material behind the
`completed-roleplay-rehearsal:{id}` readiness evidence (see
`data/travel-quest-readiness.json`), so a card is always a rehearsed exchange:
the learner performs every learner turn. Cards only reference existing
same-scenario content; they never duplicate content.

## File Boundary (the parallelization boundary)

One production card file per scenario lives under `data/roleplay/` and is the
**authoritative parallelization boundary** for the six downstream cards
(parent #19):

| File | Scenario |
|------|----------|
| `data/roleplay/food.json` | `food` |
| `data/roleplay/transport.json` | `transport` |
| `data/roleplay/hotel.json` | `hotel` |
| `data/roleplay/shopping.json` | `shopping` |
| `data/roleplay/emergency.json` | `emergency` |
| `data/roleplay/airport.json` | `airport` |

Because each card file owns exactly one scenario and is independently valid,
six downstream cards can be produced and validated in parallel without touching
the same file. A card bundle may carry the collection key `roleplayCards`; the
schema and cross-reference checks are the same whether the bundle comes from a
single per-scenario file or a combined fixture.

## Record Fields

Collection key: `roleplayCards`. Each card record contains exactly:

- `id` — stable non-empty string
- `scenario` (food / transport / hotel / shopping / emergency / airport)
- `titleJa` — non-empty Japanese title
- `goalJa` — non-empty Japanese goal (what the learner can do)
- `guidanceJa` — non-empty Japanese guidance (how to rehearse the card)
- `lessonRefs` — optional list of unique lesson `id`s from the same scenario
  (empty array is treated as absent)
- `phraseRefs` — non-empty list of unique phrasebook entry `id`s from the same
  scenario
- `allLearnerTurnsRehearsed` — must be exactly `true` (fixed contract invariant)
- `lines` — 4–8 alternating learner/partner line objects (see below)
- `reviewStatus` (draft / reviewed / published)
- `source` (optional; truthful source required for `reviewed` / `published`)

Each line contains:

- `speaker` (learner / partner)
- `traditional` (non-empty) and `traditionalStatus` (authored / verified / generated)
- `simplified` (optional) with matching `simplifiedStatus` (same rules as the
  script provenance contract in `content-model-draft.md`)
- `pinyin` (non-empty, tone-marked)
- `japanese` (non-empty, natural Japanese)

## Validation Rules

- `id`, `titleJa` / `goalJa` / `guidanceJa`, `speaker`, `traditional`, `pinyin`,
  and `japanese` are non-empty; wrong field types and unknown fields fail with
  path-specific errors.
- `scenario` and `reviewStatus` must be controlled values.
- `allLearnerTurnsRehearsed` must be exactly `true`; anything else fails.
- `lines` must contain between 4 and 8 line objects, inclusive.
- Lines must strictly alternate `learner` / `partner`, starting with `learner`
  (a rehearsed card always leads with the learner). A non-alternating or
  learner-led-missing sequence fails with a path-specific error naming the
  expected speaker.
- Per-line script provenance follows the existing #24 rules; generated script
  forms may not be paired with a `reviewed` / `published` card.
- `phraseRefs` must be non-empty and unique; `lessonRefs` (when present as a
  non-empty list) must be unique.
- Reference resolution (bundle level):
  - each `phraseRefs[j]` must resolve to an existing phrasebook phrase in the
    same scenario;
  - each `lessonRefs[j]` must resolve to an existing lesson in the same
    scenario;
  - missing (stale) and cross-scenario references fail with path-specific errors.
  - Bundles that carry no `lessons` / `phrasebook` collection resolve against
    the committed `data/examples/valid/lessons.json` and `phrasebook.json`, so
    determinism holds in every bundle.
- Duplicate card `id`s fail.
- `reviewed` / `published` require a truthful `source`.

## Determinism

IDs, speaker order, reference errors, and output order are deterministic:
validation walks the collection in file order and reports errors in
field/collection order. The committed `data/roleplay/transport.json` fixture is
the executable schema fixture and is asserted valid by the validator self-test
`test_roleplay_card_committed_fixture_valid`.
