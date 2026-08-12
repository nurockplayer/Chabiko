# Unicode Visual Candidate Contract

**Status:** Executable v1 for #262  
**Input:** `data/unicode/generated/scalar-inventory.json` from #260  
**Output:** `data/unicode/generated/{visual-candidates,visual-review-plan}.json`

## Safety boundary

This pipeline produces only provisional review candidates. A candidate reports
that the exact pinned renderer produced nearby 64-bit perceptual hashes; it
does not assert identical glyphs, meaning, pronunciation, etymology, script
equivalence, or learner suitability. Every candidate is `provisional` and
`learnerEligible: false`. No font bytes, glyph images, screenshots, network
responses, or learner-runtime data are published.

The renderer is the #259-approved pinned Playwright Chromium image. It loads
only `/usr/share/fonts/opentype/unifont/unifont.otf` through a private routed
`@font-face`, records the font-byte SHA-256, blocks every other request, and
does not permit fallback. `fc-query` must prove that the exact font cmap covers
every #260 inventory scalar before rendering begins.

## Deterministic extraction

Each scalar is rendered on a 64×64 white canvas as 48 px, weight 400 black
text. The generator records a SHA-256 of the deterministic grayscale derivative
and a 64-bit difference hash. Candidate pairs have Hamming distance at most 8,
exclude identical scalar sequences and the positionally corresponding,
non-identical scalar pairs of same-record authored Traditional–Simplified
evidence from #260, and are ordered by `(distance, leftScalar, rightScalar)`.

`visual-review-plan.json` partitions that order into immutable, disjoint batches
of at most 50 candidate IDs. It repeats each candidate checksum so a later
review owner can detect stale or substituted candidate data. Every candidate
appears in exactly one batch; the aggregate index remains serialized for a
future follow-up, while output ownership is one path per batch.

## Canonical workflow

```bash
pnpm exec node scripts/generate_unicode_visual_candidates.ts --write
pnpm exec node scripts/generate_unicode_visual_candidates.ts --check
pnpm test:visual
```

The first two commands run in the pinned Linux/amd64 renderer container. The
`--check` command regenerates both JSON files and requires byte identity; it
fails for stale inventory bytes, a changed font checksum or cmap, missing
coverage, malformed candidates, stale batch checksums, non-disjoint batches,
or changed rendering output. `pnpm test:visual` runs the same internal check in
the existing pinned visual CI environment.

If the pinned renderer itself is unavailable or its Unifont cmap cannot cover
the complete inventory, generation publishes a strictly empty `unavailable`
artifact with the fixed non-claiming reason. It carries no rendering metadata,
glyphs, or candidates; therefore it cannot be mistaken for visual evidence.
This fallback is not used by the committed #262 artifact, which is required to
be `available` and non-empty.

Publication stages only the two owned JSON files beneath
`data/unicode/generated/` and then replaces them transactionally. If either
replacement fails, prior bytes are restored; unrelated dirty files are never
enumerated, removed, or overwritten.

## Impact Map

### Writers

- `scripts/generate_unicode_visual_candidates.ts` is the only writer for the
  two #262 generated JSON files.
- Focused tests write only their own temporary directory and remove only that
  directory.

### Consumers

- `scripts/unicode_visual_contract.ts` validates input checksum, glyph coverage,
  hashes, threshold/order/exclusions, candidate checksums, and batch ownership.
- `tests/unicode-visual-candidates.test.ts` checks the executable contract,
  malformed/stale artifacts, rollback, and CI wiring.
- `tests/visual/run.ts` invokes the internal byte-identity gate in visual CI.
- There is no learner UI, loader, API, font/runtime consumer, or review-promotion
  consumer in #262.

### Legacy paths and boundaries

- #260's source manifest, scalar inventory, and mechanical records are
  read-only inputs; #262 has no legacy writer or compatibility path.
- Git tracks metadata only: neither font bytes nor rendered pixels are written.
- The generator owns exactly the two named generated files; staging is private
  to their directory and cleanup never prunes other paths.

### Rights and provenance

- #259 authorizes the pinned Playwright image's Unifont input for mechanical
  extraction and screenshot evidence; this issue records its byte checksum but
  does not redistribute it.
- The artifact records the image digest, Chromium version, font identity/checksum,
  canvas conditions, #260 scalar-inventory checksum, threshold, and exclusions.
