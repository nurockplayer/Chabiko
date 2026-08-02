# ADR 0002: Public-by-Link Teacher Preview Route

## Status

Accepted (product-owner decision, Issue #191).

## Context

The complete teacher-vocabulary preview at `/vocabulary/basic/preview/` must be
usable by the teacher for remote review. The Cloudflare Pages deployment is
intentionally a publicly accessible test/review site reachable by direct URL
from any device. An earlier review cycle had restricted teacher-image
derivatives to a local-only boundary that did not satisfy this remote-review
workflow.

## Decision

The teacher preview route is deployed as public-by-link:

- The test site is intentionally accessible to anyone who has the URL.
- No authentication, password, IP allowlist, or other access restriction is
  required.
- The workbook preview corpus and teacher-provided preview derivatives may be
  deployed for remote teacher review.
- Keep `noindex` to avoid intentional search-engine discovery, but do not treat
  `noindex` as access control.
- Original teacher source PNG files remain outside Git; only deterministic
  review derivatives are tracked and deployed.
- Teacher-mapped rows must use the teacher-provided images rather than
  unnecessary AI replacements.

## Rights

The teacher created the teacher-provided source images and commissioned Chabiko
to produce teaching-material images from them. Production learner use on the
Chabiko learner route is part of that original commission scope, not a separate
or later grant. The canonical teacher-image package rights are recorded in
`data/teacher-vocabulary-preview/teacher-image-rights.json`.

The product owner attested in
[Issue #191 comment 5156051087](https://github.com/nurockplayer/Chabiko/issues/191#issuecomment-5156051087)
that the teacher created the source images and consented to Chabiko publicly
deploying deterministic derivatives on the public-by-link review/test site,
with originals kept outside Git, no broader relicensing, and no attribution
requirement. All 19 production teacher-provided illustration records reference
this attestation.

[Issue #191 comment 5157871811](https://github.com/nurockplayer/Chabiko/issues/191#issuecomment-5157871811)
is a supplementary record (not a new grant) clarifying the original commission:
the teacher explicitly consented to Chabiko using and publicly deploying
deterministic derivatives of those images **as learning materials on the
production learner route**, including `/vocabulary/basic/`. This applies to the
canonical teacher-image package and its 1,131 teacher-preview derivatives, and
is **limited to use within Chabiko**: it does not grant broader relicensing or
redistribution rights.

## Consequences

- Teacher review works from any device without local setup.
- A reviewer must not reintroduce a local-only publication boundary based solely
  on the route being publicly reachable.
- The production learner route may use the teacher-provided deterministic
  derivatives as learning materials within Chabiko, per the original commission
  and its recorded production-learner-use scope.
- Broader relicensing or redistribution outside Chabiko remains out of scope
  unless a new explicit product-owner decision records it.
- Any contrary change requires a new explicit product-owner decision.
