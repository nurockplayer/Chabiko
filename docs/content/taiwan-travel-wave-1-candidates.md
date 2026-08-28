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
  pending human-review scope;
- `docs/content/reviews/taiwan-travel-wave-1-v1.md` — the generated packet;
- `src/content/loadTaiwanTravelWave1ReviewScope.ts` — fail-closed package,
  graph, scope, fingerprint, and packet validation;
- `scripts/render-taiwan-travel-wave1-review-packet.ts` — the only canonical
  packet writer.

The existing golden pilot and `issue-360-launch-v1` campaign remain separate
and unchanged.

## Coverage

| IDs | Scenario | New sub-tasks |
|---|---|---|
| `lesson-011`–`lesson-012` | airport (2) | Find baggage claim; report checked baggage has not appeared |
| `lesson-013`–`lesson-014` | transport (2) | Confirm a vehicle reaches a destination; ask where to transfer |
| `lesson-015`–`lesson-017` | food (3) | Ask for a table; ask about peanuts; ask to pack leftovers |
| `lesson-018`–`lesson-019` | shopping (2) | Ask to try on clothing; request a receipt |
| `lesson-020`–`lesson-021` | hotel (2) | Ask about luggage storage; report an unusable room key |
| `lesson-022`–`lesson-023` | emergency (2) | Report separation from a companion; ask someone to call an ambulance |
| `lesson-024` | social (1) | Give a short name-and-origin introduction |

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
lesson sections, unusable prompts, source-path drift, and generated packet
drift.

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
dimension pending until humans complete the artifact for its exact versions.
