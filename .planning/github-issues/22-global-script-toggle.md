## Goal

Add a global Chinese script display toggle that lets learners switch Simplified / Traditional display without changing the Japanese UI or losing path context.

## Scope

- Add a visible Simplified / Traditional display toggle in the learner-facing UI.
- Respect path-based defaults from #17.
- Persist the learner's chosen display mode locally where appropriate.
- Make pages render the selected script for lessons, vocabulary, phrasebook entries, and practice prompts where both forms exist.
- Define fallback behavior when one script form is missing.
- Keep Japanese UI and explanations unchanged by the script toggle.

## Out of scope

- Translating Japanese UI.
- Runtime unreviewed script conversion for production content.
- User accounts or cloud sync.
- Full Mainland-Mandarin curriculum.

## Acceptance criteria

- [ ] Learner can switch between Simplified and Traditional display where both forms exist.
- [ ] The selected script display persists locally where appropriate.
- [ ] Path defaults are respected before the learner manually changes the setting.
- [ ] Taiwan travel path defaults to Traditional display.
- [ ] HSK, school, or general Mandarin paths can default to Simplified display.
- [ ] Japanese UI and explanations do not change when the Chinese script display changes.
- [ ] Fallback behavior is documented for missing script fields.

## Related issues

- #2 content schemas and resource registry
- #7 learner-facing pages
- #17 goal-based learning paths
- #18 dual-script and Taiwan/Mainland variant strategy
