# Golden-set teacher-review scope

`golden-content-pilot-v1` is a separate, non-runtime review scope for the
first calibrated content set:

- 4 Taiwan Travel lesson-loop records;
- 14 independently authored, rights-safe synthetic HSK-shaped vocabulary
  records; and
- the collection-qualified graph references that reuse those HSK objects in
  both pilot path views.

The scope is compatible with the existing #360 decision vocabulary
(`accepted` / `needs_changes`) and SHA-256 semantic fingerprint approach, but
it is not the `issue-360-launch-v1` campaign. It has no D1 namespace, portal
route, or API writer yet. The fixed #360 target remains exactly 24 phrases, 6
dialogs, and 6 launch roleplay cards; its records, fingerprints, decisions,
and campaign configuration are not changed by this scope.

## Source and review version

`data/content-pilots/golden-review-scope.json` is the only scope manifest. The
loader in `src/content/loadGoldenSetReviewScope.ts` resolves every reference
through the settled content graph and fails closed on stale, duplicate, or
malformed references. Each fingerprint is:

```text
sha256(stableStringify(recordWithoutTopLevelReviewStatus))
```

Only the top-level workflow state is excluded. Learner-facing fields, script
provenance, source metadata, and graph-facing fields remain review-relevant.
The packet's `reviewVersion` is a deterministic digest of the scope contract,
review dimensions, source paths, collection-qualified references, and those
record fingerprints. It is not a human approval and is not a substitute for a
commit or review artifact.

The review packet is rendered by `renderGoldenSetReviewPacket()` and validated
by:

```bash
pnpm exec vitest run tests/golden-set-review-scope.test.ts
```

The rendered template deliberately leaves reviewer identity, role, date,
outcome, unresolved issues, and blocked content for a human reviewer. The
repository currently records `pending-human-review`, `decisionCount: 0`, and
`promotionAllowed: false`.

## Review dimensions

| Dimension | Required role(s) | Records |
|---|---|---|
| Natural Taiwan Mandarin | `human-language-reviewer`, `human-regional-reviewer` | Lessons and HSK-shaped vocabulary |
| Natural Japanese explanation | `human-language-reviewer` | Lessons and HSK-shaped vocabulary |
| Usefulness for Japanese learners | `human-teaching-reviewer` | Lessons and HSK-shaped vocabulary |
| Taiwan regional and cultural accuracy | `human-regional-reviewer` | Lessons and HSK-shaped vocabulary |
| Teaching progression | `human-teaching-reviewer` | Lessons |
| Dialogue naturalness | `human-language-reviewer` | Not applicable: no dialogue records are included |
| Exercise quality | `human-teaching-reviewer` | Lessons |
| Graph and cross-link correctness | `maintainer` | Lessons and HSK-shaped vocabulary |
| Source and provenance correctness | `human-source-reviewer`, `human-script-verifier` | Lessons and HSK-shaped vocabulary |

The human artifact must follow
`docs/content/content-review-workflow.md`: identity, role, ISO date, exact
items, exact review version, outcome, approval scope, unresolved issues, and
blocked content. A reviewer may cover more than one role, but must record each
role separately. The maintainer does not replace language, regional, teaching,
source, or script review.

## Rights, state, and promotion guard

All 18 records remain `reviewStatus: "draft"`. The HSK-shaped records use
`source.type: "synthetic-pilot"`, make no official HSK membership claim, and
keep Traditional headwords unavailable. Their synthetic examples remain draft
and do not use restricted HSK source material. Issue #81 remains the blocker
for any real HSK source import, derivation, or production claim.

Graph indexing and cross-track reuse do not promote content or alter
provenance. The packet does not write content, `reviewStatus`, provenance,
teacher decisions, or D1. Promotion requires a completed human artifact,
resolved blocked items, and a separate maintainer action. The existing #360
portal also remains subject to its live deployment requirements (Cloudflare
Access, D1, and eligible-reviewer configuration); this repository artifact
must not be reported as browser-portal readiness.

## Bounded Taiwan expansion: scenarios 5–10

Expansion starts only after the golden packet has a real human artifact and
the four pilot lessons have been calibrated. It is six bounded authoring
cycles, not a bulk generation job:

1. **Scenario 5 — shopping:** author one lesson-loop record using the pilot
   shape, then add its graph/path reference and review-packet entry.
2. **Scenario 6 — emergency:** author one lesson-loop record with explicit
   safety wording and the same review/provenance gates.
3. **Scenarios 7–10:** do not invent a new scenario taxonomy in the content
   wave. Select four additional scenarios from an approved product/teacher
   backlog, one at a time, before authoring them. The current canonical
   scenario set establishes airport, transport, food, shopping, hotel, and
   emergency; it does not authorize four additional labels by itself.

Each cycle has the same dependency order: author the lesson and examples;
validate the lesson loop and graph references; preserve draft/provenance
state; append the exact records to a new review-scope version; obtain the
applicable human language/regional/teaching/source review; then perform the
maintainer promotion decision. A changed source record or learner-facing path
membership creates a new review version and invalidates prior fingerprints.
The next production expansion should therefore open only after the golden-set
review owner supplies the approved scenario names for slots 7–10.
