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

## Consequences

- Teacher review works from any device without local setup.
- A reviewer must not reintroduce a local-only publication boundary based solely
  on the route being publicly reachable.
- Any contrary change requires a new explicit product-owner decision.
