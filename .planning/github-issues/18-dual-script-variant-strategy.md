## Goal

Define how Chabiko handles Simplified Chinese, Traditional Chinese, Taiwan Mandarin, Mainland Mandarin, pinyin, and Taiwan-specific usage in v1.

## Scope

- Define Chabiko's default language stance: Japanese UI and explanations first; Chinese content supports Simplified / Traditional display where both forms exist; pinyin support.
- Define path-based script defaults: Taiwan travel is Traditional-first, Taiwan-usage-first; HSK/school/general Mandarin are Simplified-first where appropriate.
- Define when and how to show Simplified/Traditional equivalents and Taiwan/Mainland usage differences.
- Define how AI-assisted conversion may be used in authoring while keeping production content reviewed (generated-only forms are not learner-facing production content).
- Create editorial rules for Taiwan-specific vocabulary, pronunciation notes, and travel phrases.

## Out of scope

- Full Mainland Mandarin curriculum.
- Zhuyin-first instruction.
- Regional dialect coverage.
- Unreviewed runtime conversion as the only source of production text.

## Acceptance criteria

- [ ] A strategy note exists for dual-script and Taiwan/Mainland handling.
- [ ] The note defines default script behavior by path.
- [ ] The note explains whether script variants are authored, verified, generated, or unavailable.
- [ ] At least five examples show how to present Simplified/Traditional or Taiwan/Mainland differences.
- [ ] Guidance explains when not to show variant information to avoid cognitive overload.
- [ ] The strategy connects to content schema, UI toggle, and review workflow.

## Related issues

- #2 content schemas and resource registry
- #6 Taiwan travel phrasebook dataset
- #11 content review workflow
- #14 Japanese-native pain-point taxonomy
- #17 goal-based learning paths
- #22 Simplified/Traditional display toggle
