# Unit test performance — 2026-10-16

Measurements use the same macOS machine and worktree, pnpm 12.11.2 and Node
24.15.0. The baseline is commit `5f630b0e`; the candidate is the uncommitted
change accompanying this report. These are single runs on a shared development
machine, not a controlled CI benchmark. No CI timing improvement is claimed.

## Reproduce

```sh
PATH="$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH" \
  /usr/bin/time -p pnpm test --reporter=default --reporter=json \
  --outputFile.json=/tmp/chabiko-test-after.json \
  > /tmp/chabiko-test-after.log 2>&1
```

The baseline used the identical command with `before` instead of `after`.
Wall-clock includes pnpm startup. The first baseline invocation also performed
an automatic cached pnpm install (1.8 seconds); no dependency versions changed.
Per-file timings below come from Vitest's default reporter and include hooks,
including route builds. JSON assertion spans alone can omit build hooks.

## Findings and changes

- The apparent hang after the fourth file reproduced as a long silent interval
  in `tests/validation/classifier.test.ts` (225.157 seconds). It repeatedly runs
  real nested Vitest and content-validation commands with captured output.
  The baseline completed successfully; a permanent hang was not reproduced.
- A subsequent timeout caught `assertStrictJson` waiting on a Python JSON
  parser during HSK test collection. HSK fixtures now use the existing strict
  TypeScript JSON parser in-process, with direct tests for escaped and nested
  duplicate keys, valid values and malformed JSON. The Python producer/validator
  CLI coverage still runs. The deeper cause of that child-process stall was not
  established.
- Synchronous child processes block Vitest's worker event loop, so its ordinary
  test timeout cannot interrupt them. Previously unbounded test subprocesses now
  have native child-process timeouts: usually 30 seconds, 120 seconds for nested
  validation, Python contract checks and database reset. Existing larger build
  and Linux glyph-export limits remain. The journal publisher's internal `uv`
  call is also bounded. These are command limits, not a whole-suite deadline.
- The glyph CLI tests invoke the current Node executable directly, avoiding
  Corepack/package-manager bootstrap while retaining real argument-boundary and
  full Linux CI export assertions.
- Six read-only route suites share one fresh Astro build per Vitest invocation.
  It is built lazily in a unique temporary directory, marked ready only after
  success, and deleted by global teardown. Focused non-route runs do not build.
  The two teacher/security builds retain their distinct fixtures and outputs.
- The classifier seeds its full temporary git repository once, then makes
  independent local clones. Mutable working trees and indexes remain separate.
  Virtual environments and editor caches are excluded from the source copy.
  All real affected-validation invocations and assertions remain.
- Only `unicode-review-cli.test.ts` and `unicode-review-workflow.test.ts` use a
  separate serial threads pool. Their workflow artifacts use unique temporary
  roots; neither touches Astro/public assets or the database.
  Everything else defaults to serial forks, including all Astro/public asset
  mutation and live database tests. A stale allowlist entry falls back to forks.
  Vitest 2 permits one worker per pool with `fileParallelism: false`; worker and
  module isolation remain enabled. This allows overlap without concurrent
  consumers of the protected resources.
- A file-start reporter names collected files before lengthy synchronous tests.
  The measurement command overrides it to keep before/after reporters identical.
- Fork workers disable Node's experimental Web Storage so happy-dom owns storage.
  Node 26.10.0 reproduced seven failures in `basic-vocabulary-external-clear`
  without this setting. The fix also works on the Node 24 CI runtime.

A temporary Node compilation-cache experiment showed no benefit in the initial
trial and was removed. The final measurement uses the final configuration.

## Results

| Metric | Before | After |
| --- | ---: | ---: |
| `pnpm test` wall-clock | 588.17s | 409.57s |
| Vitest duration | 583.07s | 407.79s |
| Test files passed | 147 | 147 |
| Tests passed | 2,573 | 2,573 |
| Existing skips | 22 | 22 |

Wall-clock fell by **178.60 seconds (30.4%)**.
The six route suites together fell from **39.735s to 10.115s**, including their
build hooks. Individual CPU/process-heavy files can take longer when overlapping;
this change reduces wall-clock rather than claiming every file became faster.

### Top 10 slowest files — before

| File | Seconds |
| --- | ---: |
| `tests/validation/classifier.test.ts` | 225.157 |
| `tests/unicode-review-cli.test.ts` | 113.102 |
| `tests/unicode-review-workflow.test.ts` | 40.964 |
| `tests/hsk-manifest-rebuild.test.ts` | 16.140 |
| `tests/unicode-visual-candidates.test.ts` | 12.824 |
| `tests/phrasebook-route.test.ts` | 11.464 |
| `tests/unicode-contract.test.ts` | 10.612 |
| `tests/unicode-review-journal.test.ts` | 9.984 |
| `tests/hearmandarin-hsk-foundation.test.ts` | 9.802 |
| `tests/build/teacher-preview-build.test.ts` | 8.961 |

### Top 10 slowest files — after

| File | Seconds |
| --- | ---: |
| `tests/validation/classifier.test.ts` | 250.814 |
| `tests/unicode-review-cli.test.ts` | 156.035 |
| `tests/unicode-review-workflow.test.ts` | 52.286 |
| `tests/build/teacher-preview-build.test.ts` | 15.780 |
| `tests/hearmandarin-hsk-foundation.test.ts` | 14.234 |
| `tests/unicode-visual-candidates.test.ts` | 12.304 |
| `tests/unicode-review-journal.test.ts` | 11.262 |
| `tests/phrasebook-route.test.ts` | 9.962 |
| `tests/hsk-manifest-rebuild.test.ts` | 6.681 |
| `tests/unicode-review-v021.test.ts` | 5.927 |

## Validation and limits

- Node 24: `pnpm lint` passed; `pnpm typecheck` passed with zero errors/warnings
  (four hints); the complete final `pnpm test` passed as above.
- Node 24: standalone `pnpm build` passed, generating 1,630 pages.
- `pnpm exec vitest run` focused route/glyph checks: 36 passed, one existing
  Linux-only skip. The two selected routes used one shared build.
- Focused HSK, classifier type-change and strict-JSON checks: 12 passed; the
  other 115 cases were excluded by the explicit test-name filter. The final full
  run subsequently executed all of them normally.
- Node 26.10.0: all 44 happy-dom files passed, 893 tests. This was a compatibility
  run of the entire DOM subset, not a second full suite run under Node 26.
- The 22 full-run skips are unchanged: 21 local-Supabase cases and the full Linux
  CI glyph export. Their conditional gates remain, including required-live
  fail-closed behavior. Hosted CI and those environment-dependent gates were not
  exercised here.
- No learner UI or content data changed; visual/a11y snapshots were not run.
- No dependencies, package-manager pin or lockfiles changed. Changes remain
  uncommitted for the lead's independent review and GitHub delivery.

Raw timing logs and JSON are in `/tmp/chabiko-test-before.{log,json}` and
`/tmp/chabiko-test-after.{log,json}` on this machine. The failed intermediate
experiment is retained separately as `/tmp/chabiko-test-trial.{log,json}` and is
not used as the after measurement.
