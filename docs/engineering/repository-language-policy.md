# Repository Technical Language Policy

## Status

Canonical repository policy for Issue #301. This document applies to active technical artifacts and is subordinate only to a more specific current user instruction or current GitHub issue contract.

## Goal

English is the canonical language for technical artifacts so maintainers, Japanese collaborators, and coding agents share one precise engineering source of truth.

This policy changes the language of technical maintenance material only. It does not change Chabiko's learner-facing language strategy or any runtime contract.

## Canonical technical language

Use English for new or materially edited technical artifacts, including:

- code identifiers, comments, and docstrings;
- developer-facing errors and logs;
- tests and test descriptions when the text is not itself product behavior;
- architecture, API, schema, build, deployment, CI/CD, security, and maintenance documentation;
- implementation plans, Impact Maps, review findings, validation notes, and contributor instructions;
- GitHub issue and pull-request technical details;
- repository templates, automation instructions, and agent policies.

A team-facing issue or pull request may include an optional Japanese summary. The detailed technical contract, evidence, and decisions remain canonical in English.

Agent chat may follow an explicit user's language preference, but anything committed to the repository as technical source-of-truth material must follow this policy.

## Preserved non-English categories

Do not translate text merely for language consistency when language is part of product behavior or evidence. Preserve the original language where required for:

- learner-facing Japanese UI, explanations, instructions, and accessibility copy;
- Simplified or Traditional Chinese learning content;
- pinyin, kana, example sentences, pronunciation guidance, and linguistic comparison text;
- localization resources;
- language-learning fixtures, snapshots, and test data whose exact text is asserted as behavior;
- human-review artifacts that quote or evaluate learner content;
- source excerpts, proper nouns, standards, or external evidence where exact wording matters.

Technical prose surrounding those values should still be English when edited.

## Contract preservation

A language migration must not rename or reinterpret:

- routes or URLs;
- public APIs;
- schema fields or controlled values;
- database columns;
- persisted/local-storage keys;
- external integration identifiers;
- filenames or paths that are part of an established external or runtime contract.

Translate explanatory prose, not contracts. If a translation could change a public, persisted, deployment, security, or contributor contract, stop and resolve that question before editing.

## Migration policy

### Migrate now

Maintenance-critical active technical material must be English now. For Issue #301 this includes:

- `AGENTS.md`;
- `CLAUDE.md`;
- `README.md` technical/contributor guidance;
- `.github/pull_request_template.md` and active issue templates;
- `docs/engineering/account-sync-deployment-rollback.md`;
- `docs/engineering/cross-cutting-change-playbook.md`;
- `docs/engineering/frontend-interaction-evidence-playbook.md`;
- `docs/engineering/teacher-review-deployment-runbook.md`;
- `docs/design/component-contract.md`;
- `docs/design/design-contract.md`;
- `docs/design/responsive-contract.md`;
- `docs/design/figma-handoff.md`;
- this policy and its inventory.

Already-English active technical sources, such as the ADRs, visual-regression QA guide, content-review workflow, approved design direction, design brief, design-direction review, UI audit, implementation map, and active strategy contracts, require no translation.

### Touch to migrate

Legacy planning, historical research, superseded implementation notes, and other non-maintenance-critical technical material do not require repository-wide churn. When such a file is next materially edited, migrate its technical prose to English in the same bounded change unless the file is preserved historical evidence.

Historical commits, closed issues, closed pull requests, and immutable review evidence are never rewritten solely for language consistency.

Product/persona research and other documents whose primary purpose is product or learner research rather than maintenance-critical engineering are also not bulk-translated by this issue. When they are materially revised later, their technical framing may migrate to English while exact research quotations, learner-language evidence, and product-language text remain preserved as required.

## Issue #301 inventory and Impact Map

### Before-migration inventory

| Category | Status before #301 | Action |
| --- | --- | --- |
| Root agent policies | `AGENTS.md` and `CLAUDE.md` were predominantly Traditional Chinese | Translate active technical rules to English and add this policy |
| Repository README | Already English | Add the canonical language-policy pointer; otherwise preserve content |
| Engineering playbooks/runbooks | Four active files were predominantly Traditional Chinese | Translate the active maintenance guidance to English without changing commands/contracts |
| Production design maintenance contracts | `docs/design/component-contract.md`, `design-contract.md`, `responsive-contract.md`, and `figma-handoff.md` were predominantly Traditional Chinese or mixed | Translate active component/design/responsive/handoff technical prose to English while preserving exact Japanese learner-facing strings and identifiers |
| Other active design technical sources | `approved-direction.md`, `design-brief.md`, `direction-review.md`, `ui-audit.md`, and `implementation-map.json` are already English | Preserve |
| ADRs | Active ADRs are English | Preserve |
| QA | `docs/qa/visual-regression.md` is English | Preserve |
| Content review workflow | Active workflow is English and contains learner-language examples as needed | Preserve |
| Active strategy contracts | Sampled active strategy/readiness technical contracts are English and contain Japanese learner labels where product behavior requires them | Preserve |
| GitHub issue templates | Technical fields are English | Add optional Japanese-summary field; English remains canonical |
| PR template | Mostly English with mixed Traditional-Chinese instructions/section references | Migrate technical instructions to English and add optional Japanese summary |
| Product/persona research | `docs/product/japanese-learner-personas-and-jtbd.md` is mixed/Traditional Chinese product research, not the sole source of maintenance-critical engineering information | Preserve in #301 and apply touch-to-migrate when materially revised; do not bulk-translate product research |
| `.planning/**` and historical strategy/research material | Mixed age and authority; much is legacy planning rather than current maintenance guidance | Touch-to-migrate; do not bulk-rewrite |
| Immutable browser/review evidence | May contain historical non-English annotations or learner-language evidence | Preserve as evidence; do not rewrite solely for language consistency |
| Learner/localization/content/fixtures/data | Japanese/Chinese are product behavior or learning evidence | Preserve exactly unless a content issue explicitly changes them |
| Runtime contracts | Language-independent identifiers may contain established names | No rename or reinterpretation |

### Writers

Human maintainers, issue/PR authors, coding agents, reviewers, documentation updates, and template-driven GitHub contributions write technical artifacts.

### Consumers

Maintainers, coding agents, reviewers, CI/release operators, UI implementers, and contributors consume the active policies, templates, design contracts, and runbooks.

### Legacy paths

`.planning/**`, product/research documents not serving as maintenance-critical engineering authority, historical research/draft notes, closed GitHub history, and immutable evidence remain unchanged unless a future scoped change touches them. They must not override newer active English sources under the repository source-of-truth precedence.

### Canonical workflow

1. Read the current GitHub issue and only relevant current source-of-truth files.
2. Apply English to technical prose created or materially edited by the task.
3. Preserve learner/localization language and established runtime/external identifiers.
4. Run the repository's risk-classified validation plus issue-specific documentation checks.
5. Review the exact final head for accidental product-content translation or contract drift.

### Boundaries

Issue #301 changes only policy, documentation, and GitHub templates. It must not change runtime code, learner content, schemas, routes, persisted keys, external contracts, dependencies, or generated learner data.

### Rights and provenance

No external content is imported and no rights/provenance claim is changed. Existing exact quotations, learner-language evidence, and attribution/provenance values remain in their original language when that wording is evidence.

### Clean and dirty environments

The migration performs no file cleanup, deletion, generation, or migration of runtime data. It therefore must leave unrelated working-tree files untouched and must not require a clean repository beyond normal diff isolation.

## After-migration verification

The Issue #301 pull request must verify:

- active maintenance-critical technical sources listed under **Migrate now** are English;
- repository templates allow an optional Japanese summary while keeping English technical details canonical;
- no learner-facing/localization/language-learning data was translated or removed;
- no route, API, schema, persisted key, external identifier, dependency, or runtime file changed;
- remaining non-English material is preserved product/research/evidence content or explicitly governed by touch-to-migrate rather than the sole maintenance-critical technical source.
