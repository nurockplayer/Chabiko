# UI audit #509 follow-up

Implementation handoff, 2026-10-16. Baseline: live `main` and this worktree both
at `5f630b0efc0b651a8c7ea1673dc29917530cb407`. The baseline production build was
walked in Chromium in the repository-pinned Playwright container at 375 × 812
and 320 × 812. This is agent heuristic verification, not human research or an
independent review.

Live `main` advanced to `85c4026b512efa732c99e5d733497de8baf435ff` during
validation (#528, HSK teacher-review workbook tooling). The comparison contains
no learner UI changes or overlap with this patch; the worktree was not rebased.

| Finding | Disposition | Evidence or change |
| --- | --- | --- |
| F1: tone answer leak | Already fixed | Contour appears before answering; its prompt does not name the answer. Choices remain in canonical tone order. |
| F2: word-order meaning | Already fixed | Japanese target meaning and the provisional AI-content disclosure are present. The existing journey test checks the alternative `明天我去台北`. |
| F3: study action below fold | Already fixed | The reveal button is visible without scrolling at both phone widths. |
| F4: session progress | Already fixed | Study, teacher quiz, travel quiz, tones, and word order have meters. |
| F5: abrupt feedback | Existing scoped fix retained | Study and lesson feedback use restrained motion with a no-preference gate. Additional decorative motion on every practice surface is not needed for this outcome. |
| F6: path list inset | Already fixed | Path and readiness lists reset their UA padding; no horizontal overflow in the phone walkthrough. |
| F7: disappearing lesson feedback | Already fixed | Wrong-answer feedback remains after 2.3 seconds, until retry. Correct completion links to lesson 002. |
| F8: header density and theme label | Fixed here | Phone label remains accessible but is visually hidden; select options identify the script setting. Moon/sun icons replace single-kanji theme labels, with dynamic accessible names and tooltips. All controls retain 44px targets. |
| F9: unavailable-login notice | Already fixed | Guest study does not display the account notice. |
| F10: first-visit Home | Completed here | Existing Japanese start labels were correct; the English label still said CONTINUE and no word was shown. Home now previews the first manifest word, pinyin, and existing meanings. A rated but not yet mastered vocabulary item also selects the continuation state. |
| F11: reveal and quiz readability | Fixed in part | Explicit workbook sense bullets become separate list items, preserving internal punctuation. Quiz rows have equal height without hiding any answer text. Phrase pinyin is deliberately unchanged: the active manifest has only word pinyin and the promoted phrase projection has no records. No draft sidecar is imported and no pinyin is invented. |
| F12: readiness and counts | Completed here | Compact readiness meters precede the path cards; the Taiwan path has an early link to them. The Taiwan note derives the 35-item breakdown (24 lessons, 4 words, 7 phrases) from the path data and explains Home's 24-lesson count. It explicitly states that the route's word/phrase completion is not recorded. Readiness also states that unsupported phrase evidence prevents reaching ready. The repeated Taiwan script introduction was already removed. |
| F13: kanji dead end | Already fixed | The pending page links directly to lesson 001's kanji section. |
| F14: reduced-motion scope | Already fixed | A component practice choice has computed transition duration `1e-05s` under reduced motion at both widths. |

Recommendations R1, R3, R4, R8, and R10 were already addressed; R2 and R5–R7 are covered by
this follow-up with the phrase-pinyin limitation above. R9/pronunciation and HSK
pages/components are outside this task. The separate word-level segmentation
proposal remains unimplemented; this change does not author new Chinese chunks
or broaden alternative-answer judgments.

The path and readiness denominators, progress storage keys, content IDs,
content review status, and pronunciation internals are unchanged. No dependencies
were added. Changes are left uncommitted for the lead's review and delivery.

## Validation and remaining integration issue

- Host validation used Node 24.15.0 and pnpm 12.11.2. Final lint, typecheck
  (zero errors/warnings, four existing hints), and production build passed.
- Eleven focused Vitest files passed: 204 tests covering dashboard state,
  Japanese sense parsing, vocabulary reveal/lifecycle/script preferences,
  path readiness, route rendering, and shared presentation contracts.
- `pnpm test:visual:update`: 221 passed, eight HSK dev-server failures after
  a shared-module hot reload during the run. All eight passed in the subsequent
  stable full verification. Inspected changed captures in both themes;
  restored three unrelated vocabulary raster-noise updates. No small-talk
  baselines changed. The 16 HSK snapshot updates reflect the shared header;
  HSK pages/components were not edited.
- `pnpm test:visual`: 228 passed, one two-pixel comparison failure in
  `dark-completion-768x1024.png`. The differences were rounding at card
  corners. The exact case then passed 3/3 isolated runs with unchanged
  expectations and tolerances. Unicode visual artifacts also passed their
  currency check. This is not an all-green full-suite result.
- `pnpm test:a11y`: the first run had two `target-size` failures on HSK 2's
  `#btn-reset-progress` at 320px. The 117 × 21px button sat under the
  compact sticky header after reveal. Resolved by the lead in this branch:
  a 44px `min-height` on `.flashcard-reset-btn` (still honoring `hidden`) and a
  global `scroll-padding-top` so focused elements clear the sticky header.
  Final result on latest `main`: `pnpm test:a11y` 92 passed and
  `pnpm test:visual` 229 passed after the baseline update.

Logs are available locally at `/tmp/chabiko-ux-{unit,unit-adjacent,visual-update,visual-verify,visual-retry,a11y,baseline-a11y}.log`.
The baseline experiment used an isolated temporary source copy and did not
alter the worktree or Git metadata. `.astro/dev.json` was removed after Docker
runs. The temporary preview and Ego TaskSpace were closed.
