# Chabiko Domain Glossary

## Learner

A Japanese-speaking or Japanese-literate person learning Mandarin Chinese, from beginner level through practical study and exam preparation.

## Core Learning Goal

Build durable Mandarin ability for study, assessment, and real-world use. Chabiko is not primarily a travel phrasebook.

## Exam-Oriented Learning

Structured learning aimed at measurable proficiency, including vocabulary, grammar, listening, reading, and practice relevant to Chinese-language examinations. Exam preparation is a primary product target, not a secondary edge case.

## Capability

A small, reusable, trackable unit of Mandarin ability with a specific performance mode, such as recognizing a written word, understanding a spoken word, recalling an expression, pronouncing it, understanding a grammar pattern, comprehending a sentence, or completing a communicative task. Capabilities are the canonical units mapped across lessons, exercises, scenarios, and examinations.

## Capability Mode

The kind of learner performance represented and assessed by a Capability, such as written recognition, spoken comprehension, active recall, contextual production, pronunciation, reading comprehension, or listening comprehension. Capability Mastery belongs to the specific Capability Mode being demonstrated and must not be inferred automatically from another mode.

## Capability Family

A grouping of related Capabilities that share a lexical item, grammar concept, communicative purpose, or other common learning concept while requiring different Capability Modes. A Capability Family supports navigation, recommendations, and content organization but does not own a shared Mastery Stage and does not make mastery transferable between its members.

## Selective Capability Expansion

The rule that Chabiko creates only the Capability Modes that a Lesson, Exercise, Learning Path, or examination actually teaches or assesses. The system must not generate every possible mode for every word or concept merely for model completeness.

## Lesson

A learner-facing instructional sequence that combines one or more Capabilities into a coherent learning experience. Lessons may be organized differently across paths without duplicating the underlying Capabilities.

## Exercise

An activity that teaches, rehearses, or assesses one or more Capabilities. An Exercise is not itself the canonical definition of the ability it covers.

## Mastery-Earning Exercise

An Exercise type approved to produce Learning Evidence that the Mastery Engine may use for Mastery Stage transitions. In the first version, this is limited to reliably scoreable written recognition, listening recognition, active recall with deterministic answer normalization, sentence-pattern comprehension through ordering, filling, or naturalness selection, and pronunciation discrimination such as tone or confusable-sound identification.

## Deferred Open-Ended Exercise

A free sentence-production or spoken-production Exercise type whose reliable automatic evaluation would require learner-facing AI or another runtime model service. These exercise types are outside the first-version product scope. Chabiko may still teach the underlying skills through examples and self-guided practice, but it does not submit learner responses to an AI evaluator and does not treat unscored open-ended work as Capability Mastery evidence.

## Exercise Attempt

A learner interaction with an Exercise that records the submitted response, outcome, timing, hints or assistance used, and the Capabilities assessed. An Exercise Attempt is learning evidence rather than a direct declaration that a Capability has been mastered.

## Learning Evidence

A learner-specific observation used to update Capability Mastery, including Exercise Attempts and other explicitly supported demonstrations of ability. Evidence must identify the affected Capabilities and retain enough context to interpret whether it reflects recognition, recall, comprehension, production, or another assessed skill.

## Capability Mastery

The authoritative learner-specific progress state for one Capability. Capability Mastery is derived from accumulated Learning Evidence and is reusable across Lessons and Learning Paths that reference the same Capability. Reorganizing a Lesson or entering another Learning Path must not erase valid mastery evidence. Evidence for one member of a Capability Family may influence recommendations but must not directly advance another member's Mastery Stage.

## Mastery Stage

The learner-facing level of Capability Mastery represented by exactly four ordered states: Unseen, Learning, Familiar, and Mastered. The stages communicate meaningful progress without exposing a falsely precise numeric score. Internal algorithms may use additional signals, but learner-facing mastery remains expressed through these four stages.

## Review Due

A learner-specific scheduling state indicating that a Capability should be reviewed now or soon. Review Due is independent from Mastery Stage: a Mastered Capability may become due for review without immediately being treated as unlearned, and completing an appropriate review may clear the due state without changing the visible mastery stage.

## Mastery Transition Policy

The rule that Mastery Stage changes use hysteresis rather than reacting to one Exercise Attempt. Advancement requires multiple credible successes across different times or contexts, and success achieved with hints, revealed answers, or substantial assistance may contribute less evidence. A single failure marks the Capability as Review Due without lowering its stage. Repeated recent failures may lower at most one stage at a time, and later credible evidence may advance the Capability again.

## Evidence Evaluation

The deterministic process that converts a learner response into standardized Learning Evidence, including assessed Capabilities, outcome, error categories, assistance used, and the kind of ability demonstrated. Learner responses are evaluated only by versioned, reproducible rules defined for the Exercise type. AI may help author or review those rules offline, but no runtime AI evaluator processes an individual learner response or directly assigns a Mastery Stage.

## Mastery Engine

The deterministic, versioned rule system that is solely authorized to update Mastery Stage and Review Due from standardized Learning Evidence under the Mastery Transition Policy. The same inputs and rule version must produce the same transition result, and rule changes must be testable. Only approved deterministic evaluators may produce mastery-eligible evidence; AI must not evaluate individual learner attempts, bypass the engine, or override its result.

## Lesson Completion

A learner-facing progress state for one Lesson, derived from the Lesson's required Capabilities, required Exercises, and any lesson-specific completion rules. Lesson Completion supports navigation, motivation, and course presentation, but is not the authoritative measure of whether the learner possesses the underlying abilities.

## Cross-Path Progress Reuse

The product rule that valid Capability Mastery earned through one Learning Path is recognized by every other Learning Path that references the same Capability. A path may still require its own lesson-specific activity, but it must not treat already demonstrated shared ability as entirely unknown.

## Learning Path

An ordered view over shared Capabilities and Lessons for a particular learner goal. Chabiko supports both capability-oriented paths and exam-oriented paths without duplicating the underlying curriculum.

## Capability-Oriented Path

A Learning Path organized around durable language ability, such as pronunciation, vocabulary, grammar, listening, reading, conversation, or practical scenarios.

## Exam Path

A Learning Path that maps shared Capabilities to the scope, level, and task types of a named Chinese-language examination. An Exam Path does not own a separate copy of the curriculum.

## Exam Path Priority

The order in which full exam-oriented experiences are developed. The first complete Exam Path is the Japanese Chinese Proficiency Test (中国語検定), followed by HSK. TOCFL may receive Assessment Mappings before it receives a complete learner-facing Exam Path.

## Assessment Mapping

The relationship between a Capability and one or more examination levels, syllabi, or task types. Assessment Mapping may change when an examination changes without redefining the underlying language ability.

## Application Scenario

A concrete situation in which learners can use what they study. Taiwan travel is the leading early application scenario because it gives Japanese learners an accessible, motivating place to apply Mandarin in practice.

## Taiwan Travel Path

A practical Learning Path built around Taiwan travel situations. It supports the core Mandarin curriculum by turning learned language into concrete tasks; it does not define the full scope of Chabiko.

## Shared Mandarin Core

The region-independent language ability represented by a Capability before a Learning Path selects a regional standard. It captures shared meaning and transferable ability without pretending that all vocabulary, pronunciation, or usage is identical across regions.

## Language Variant

A regional standard of Mandarin that governs natural vocabulary, pronunciation, usage, examples, and accepted answers. Chabiko initially distinguishes Mainland Mandarin and Taiwan Mandarin. A Language Variant is not merely a writing-system conversion.

## Path Language Standard

The Language Variant designated as authoritative for a Learning Path. 中国語検定 and HSK paths use Mainland Mandarin as their standard; the Taiwan Travel Path uses Taiwan Mandarin. The designated standard controls default wording, pronunciation, audio, and answer evaluation.

## Regional Realization

A reviewed regional expression of a shared Capability, including the natural word form, pronunciation, usage notes, and examples for a specific Language Variant. Regional Realizations may share meaning while differing substantially in wording or sound.

## Script Variant

The Traditional or Simplified written form of Chinese content. Script Variant describes orthography only and must not be used as a substitute for Language Variant. Automatic character conversion cannot determine natural regional vocabulary or pronunciation.

## Display Script Preference

A learner-facing preference that controls whether Chinese text is rendered in Simplified or Traditional characters without changing the active Language Variant, pronunciation, vocabulary standard, audio, examples, or accepted answers.

## Language Standard Selection

The choice of Mainland Mandarin or Taiwan Mandarin as the learner's active regional standard. It is independent from Display Script Preference and is normally inherited from the selected Learning Path rather than changed by the ordinary script toggle.

## AI-Managed Content

Structured learning content generated or maintained by approved internal AI agents, including scheduled GitHub Actions using models such as Gemini or DeepSeek. This AI use belongs to the offline content pipeline and does not expose an AI service to learners.

## No Learner-Facing AI

The product boundary that learner actions must not trigger runtime AI or model-service calls. Chabiko does not provide an AI tutor, learner chat, per-user content generation, AI answer scoring, or AI feedback on individual responses. The learner-facing application consumes published structured content, static media, and deterministic evaluation rules; AI is limited to internal content authoring, criticism, maintenance, and repository workflows.

## Human-Reviewed Content

Content that an authorized human has explicitly reviewed and approved. Human-Reviewed Content is protected from all automated semantic modification until a human explicitly removes or supersedes that approval.

## Human-Checked

A human review level confirming that an authorized person has inspected and accepted a Reviewable Content Node within a stated Review Scope. Human-Checked content receives a Review Lock but does not claim specialist or professional authority.

## Expert-Reviewed

A higher human review level confirming that a Reviewer with recognized competence in the applicable Review Scope has inspected and accepted a Reviewable Content Node. Expert-Reviewed status records the scope of expertise and supersedes Human-Checked status for that scope without erasing earlier Review History.

## Reviewable Content Node

The smallest independently reviewable and lockable unit of structured content. A node may be a core meaning, regional realization, example, explanation, exercise, or assessment mapping. Review status belongs to the node rather than automatically applying to the entire parent record.

## Node-Level Review Lock

A Review Lock applied to a specific Reviewable Content Node. Locked sibling nodes remain protected while unlocked sibling nodes in the same vocabulary entry, lesson, exercise, or other parent object remain eligible for automated maintenance.

## Review Lock

The protection applied to Human-Reviewed Content. Automated agents may report suspected problems with locked content, but must not edit, replace, delete, regenerate, or indirectly invalidate the locked material.

## Revision Proposal

A separate candidate replacement for a Human-Reviewed Content Node. Automated agents may create a Revision Proposal when they suspect locked content is wrong or outdated, but the proposal must not alter the active reviewed version before human approval.

## Revision Decision

The human action that resolves a Revision Proposal by accepting it, rejecting it, editing and accepting it, or marking it as requiring no change. Acceptance supersedes the previous reviewed version and creates a newly reviewed version.

## Review History

The auditable record of human review and revision decisions for a Reviewable Content Node. It records the reviewer, decision time, reason, previous version, accepted version, supporting sources when applicable, and whether each decision was Human-Checked or Expert-Reviewed.

## Reviewer

An authorized human who may approve content only within explicitly assigned Review Scopes. Being a Reviewer does not imply authority over every language variant, explanation language, linguistic field, or examination mapping.

## Review Scope

A named area of review authority, such as Taiwan Mandarin, Mainland Mandarin, Japanese Explanation, Pronunciation, Grammar, 中国語検定 Mapping, or HSK Mapping. A review decision is valid only for scopes assigned to the Reviewer.

## Scoped Review Status

The review state attached to a Reviewable Content Node for one specific Review Scope. A node may be AI-managed, Human-Checked, or Expert-Reviewed for one scope while holding a different state for another scope.

## Verification Over Origin

The product principle that learner-facing trust is based on whether content has been verified, not on whether it was written by a human or generated by AI. Unreviewed content is the ordinary default state and receives no origin badge. Human-Checked and Expert-Reviewed status may be shown as additional trust signals.

## Learner-Facing Verification Signal

A visible indicator that content has received Human-Checked or Expert-Reviewed status for a relevant Review Scope. Chabiko does not display an AI-generated badge for ordinary content. Verification signals must not imply that unlabelled content is invalid, only that it has not received the corresponding human review level.

## Automated Publication Gate

The automated quality threshold that AI-Managed Content must pass before it becomes publicly visible. Human review is not required for publication, but the content must satisfy all applicable structural, linguistic, safety, consistency, and provenance checks defined for its content type and Language Variant.

## Published AI-Managed Content

AI-Managed Content that has passed the Automated Publication Gate and is eligible for learner-facing use without a Human-Checked or Expert-Reviewed badge. Publication does not add a Review Lock and does not prevent approved automated agents from continuing to inspect and improve the content.

## Publication Failure

The state of content that fails one or more mandatory checks in the Automated Publication Gate. Failed content must remain unpublished or be withdrawn from learner-facing use until a later revision passes the required checks.

## Authoring Agent

The approved AI role responsible for generating new AI-Managed Content and applying semantic revisions to unlocked content. The initial planned Authoring Agent is DeepSeek, but the role is defined independently from any specific model provider.

## Critic Agent

An independent AI role responsible for adversarially reviewing content produced by the Authoring Agent. The Critic Agent identifies linguistic, pedagogical, regional, assessment, safety, and consistency problems but does not directly publish content. The initial planned Critic Agent is Gemini.

## Deterministic Validator

A non-generative check that evaluates rules with reproducible outcomes, such as schema validity, identifier integrity, required fields, pinyin format, supported Script Variants, reference integrity, Review Lock preservation, deletion eligibility, and other machine-verifiable constraints. A mandatory validator failure always blocks publication.

## Asymmetric Multi-Model Workflow

The content-maintenance workflow in which models have distinct responsibilities rather than equal votes. The default sequence is Authoring Agent, Critic Agent, Deterministic Validators, then publication. A major Critic finding returns the content to the Authoring Agent for revision; it is not resolved by majority voting.

## Content Quarantine

The unpublished state for AI-Managed Content that cannot pass the Asymmetric Multi-Model Workflow after permitted repair attempts, contains unresolved model disagreement, or otherwise lacks sufficient confidence for learner-facing use. Quarantined content must not be repeatedly published and withdrawn while agents disagree.

## Repair Attempt

One complete Authoring Agent revision followed by Critic Agent evaluation and all applicable Deterministic Validators for the same content version and failure set.

## Repair Budget

The maximum number of automatic Repair Attempts allowed before content enters Content Quarantine. The default budget is three attempts. Scheduled maintenance must skip quarantined content after the budget is exhausted rather than repeatedly consuming model calls.

## Quarantine Requeue Trigger

A substantive change that permits quarantined content to enter the workflow again. Valid triggers include a human content edit, an explicit human recheck request, a prompt or validator rule version change, an Authoring or Critic model version change, a new authoritative source, or a relevant examination or Language Variant rule update. Time passing or another hourly schedule run is not a valid trigger.

## Issue Fingerprint

A stable machine-readable identity for one detected content problem. The fingerprint is derived from the Reviewable Content Node identifier, Review Scope, normalized failure category, rule or check identifier, and applicable Language Variant. Model-written explanations, wording, confidence prose, and suggested fixes do not participate in the fingerprint.

## Issue Record

The persistent record associated with an Issue Fingerprint. Repeated detections of the same fingerprint update the existing record with occurrence count, first-seen and last-seen times, current evidence, affected content version, and resolution state instead of creating duplicate records. A resolved issue may be reopened when the same fingerprint is detected again.

## Content Source of Truth

The complete structured learning content and its authoritative version history stored in Git. Git is used to inspect, compare, and restore ordinary AI-managed content changes. Chabiko does not maintain a separate node-level revision ledger for ordinary AI edits.

## AI Change History

The ordinary history of additions and modifications made to AI-Managed Content. It is recorded through Git commits and, when used, pull-request or workflow summaries. Commit metadata may identify the responsible agent, models, broad reason, and affected nodes, but no separate Content Revision record is required.

## Stable Content Node Identity

A Reviewable Content Node identifier is persistent after creation. Approved agents may create new identifiers and modify unlocked node content, but must not rename, recycle, or replace an existing identifier merely because the content is rewritten. References, learner state, review records, and Issue Fingerprints continue to identify the original node.

## Directly Deletable Node

An unlocked Reviewable Content Node that may be permanently removed because deterministic checks confirm that it has no references from Lessons, Exercises, Assessment Mappings, or other content, no learner progress or saved state, and no Human-Checked, Expert-Reviewed, Review Lock, or Review History record.

## Deprecated Content Node

A Reviewable Content Node that is no longer offered for new learner-facing use but must retain its identifier because it is referenced, has learner progress or saved state, or has human review records. Deprecation preserves existing interpretation and history without requiring a full split, merge, or replacement-lineage system in the first version.

## Automated Content Maintenance

The recurring process by which approved AI agents inspect and directly improve AI-Managed Content. The process must preserve Review Locks, route suspected problems in locked content into Revision Proposals, distinguish editable AI-managed material from human-reviewed material before applying any change, re-run the Automated Publication Gate after every semantic revision to published content, follow the Asymmetric Multi-Model Workflow rather than model voting, enforce the Repair Budget, skip quarantined content until a valid Quarantine Requeue Trigger occurs, deduplicate recurring findings by Issue Fingerprint, preserve Stable Content Node Identity, directly delete only Directly Deletable Nodes, and deprecate protected or referenced nodes instead of removing them. Ordinary AI edits rely on Git for change history; formal node-level history is reserved for human review and Revision Decisions.

## Kanji Bridge

The deliberate use of Japanese kanji familiarity to help learners recognize and remember Mandarin vocabulary, while explicitly warning about pronunciation differences, semantic gaps, and false friends.
