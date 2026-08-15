/**
 * Teacher-review portal domain (Issue #363).
 *
 * Pure, environment-agnostic review logic for the bounded #360 human-review
 * thin slice at `/teacher-review`. No Node, no browser, no runtime service
 * dependency: callers (the Astro page, the Pages Functions, and tests) pass
 * the parsed content records and a `sha256` primitive, and this module
 * resolves the exact #360 launch target, computes deterministic semantic
 * fingerprints over review-relevant content, validates human decisions, and
 * builds the repository-standard review artifact.
 *
 * Invariants (Issue #363 / #360):
 * - The portal records HUMAN decisions only. Nothing here can manufacture an
 *   Accept decision; every accepted record requires a persisted decision that
 *   was written by an Access-authenticated, eligible reviewer.
 * - The resolver resolves the exact target (24 draft phrases, 6 draft dialogs,
 *   6 draft launch roleplay cards) and FAILS CLOSED on drift instead of
 *   silently redefining the campaign.
 * - Fixture/test-only roleplay records (e.g. `roleplay-fixture-transport-001`)
 *   are never part of the launch target.
 * - A decision is bound to the exact semantic version of the reviewed record:
 *   a review-relevant content change invalidates the stored decision
 *   (fingerprint mismatch); formatting-only source changes do not.
 */

// ---------------------------------------------------------------------------
// Campaign constants (#363, exact #360 target at issue creation)
// ---------------------------------------------------------------------------

export const TEACHER_REVIEW_CAMPAIGN_ID = 'issue-360-launch-v1';
export const TEACHER_REVIEW_PHRASE_COUNT = 24;
export const TEACHER_REVIEW_DIALOG_COUNT = 6;
export const TEACHER_REVIEW_ROLEPLAY_COUNT = 6;
export const TEACHER_REVIEW_TOTAL_COUNT = 36;

/** Controlled scenario order for the teacher-review flow. */
export const TEACHER_REVIEW_SCENARIOS = [
  'airport',
  'transport',
  'food',
  'shopping',
  'hotel',
  'emergency',
] as const;
export type TeacherReviewScenario = (typeof TEACHER_REVIEW_SCENARIOS)[number];

export type ReviewOutcome = 'accepted' | 'needs_changes';
export type ReviewRecordType = 'phrase' | 'dialog' | 'roleplay';

export const REVIEW_OUTCOMES: readonly ReviewOutcome[] = [
  'accepted',
  'needs_changes',
];

/** Upper bound for a reviewer note stored in D1. */
export const REVIEWER_NOTE_MAX_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Input record shapes (the parsed content files; only the fields the portal
// consumes are declared — nothing is fabricated or converted).
// ---------------------------------------------------------------------------

export type FormStatus = 'authored' | 'verified' | 'generated';
export type ReviewStatus = 'draft' | 'reviewed' | 'published';

export interface ReviewTurnInput {
  speaker: 'learner' | 'partner';
  traditional: string;
  traditionalStatus: FormStatus;
  simplified?: string;
  simplifiedStatus?: FormStatus;
  pinyin: string;
  japanese: string;
}

export interface ReviewSourceInput {
  type: string;
  note?: string;
}

export interface PhraseReviewInput {
  id: string;
  scenario: string;
  traditional: string;
  traditionalStatus: FormStatus;
  simplified?: string;
  simplifiedStatus?: FormStatus;
  pinyin: string;
  japanese: string;
  usageNotesJa: string;
  painPointTags?: string[];
  reviewStatus: ReviewStatus;
  source?: ReviewSourceInput;
}

export interface DialogReviewInput {
  id: string;
  scenario: string;
  turns: readonly ReviewTurnInput[];
  relatedPhraseIds: readonly string[];
  reviewStatus: ReviewStatus;
  source?: ReviewSourceInput;
}

export interface RoleplayReviewInput {
  id: string;
  scenario: string;
  titleJa: string;
  goalJa: string;
  guidanceJa: string;
  lessonRefs?: readonly string[];
  phraseRefs: readonly string[];
  allLearnerTurnsRehearsed: boolean;
  lines: readonly ReviewTurnInput[];
  reviewStatus: ReviewStatus;
  source?: ReviewSourceInput;
}

export interface TeacherReviewInputs {
  phrases: readonly PhraseReviewInput[];
  dialogs: readonly DialogReviewInput[];
  roleplayCards: readonly RoleplayReviewInput[];
}

// ---------------------------------------------------------------------------
// Resolved campaign surface
// ---------------------------------------------------------------------------

export interface PhraseReviewContent {
  traditional: string;
  simplified?: string;
  pinyin: string;
  japanese: string;
  usageNotesJa: string;
  traditionalStatus: FormStatus;
  simplifiedStatus?: FormStatus;
  painPointTags?: string[];
  source?: ReviewSourceInput;
}

export interface TurnReviewContent {
  speaker: 'learner' | 'partner';
  traditional: string;
  simplified?: string;
  pinyin: string;
  japanese: string;
  traditionalStatus: FormStatus;
  simplifiedStatus?: FormStatus;
}

export interface DialogReviewContent {
  turns: readonly TurnReviewContent[];
  relatedPhraseIds: readonly string[];
  source?: ReviewSourceInput;
}

export interface RoleplayReviewContent {
  titleJa: string;
  goalJa: string;
  guidanceJa: string;
  lessonRefs?: readonly string[];
  phraseRefs: readonly string[];
  allLearnerTurnsRehearsed: boolean;
  lines: readonly TurnReviewContent[];
  source?: ReviewSourceInput;
}

export type ReviewContent =
  | PhraseReviewContent
  | DialogReviewContent
  | RoleplayReviewContent;

/** One campaign record with its deterministic semantic fingerprint. */
export interface CampaignRecord {
  id: string;
  type: ReviewRecordType;
  scenario: TeacherReviewScenario;
  /** Review-relevant content only; never includes `reviewStatus` or raw
   * source formatting. */
  content: ReviewContent;
  /** Deterministic semantic fingerprint of `content` at resolution time. */
  fingerprint: string;
}

export interface CampaignResolution {
  campaignId: string;
  /** Deterministically ordered launch target (scenario order, then
   * phrase → dialog → roleplay within each scenario). */
  records: readonly CampaignRecord[];
  counts: {
    phrases: number;
    dialogs: number;
    roleplay: number;
  };
}

/** SHA-256 hex digest primitive; supplied by the caller (Workers Web Crypto in
 * the Pages Function, node:crypto in tests). */
export type Sha256 = (text: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Deterministic canonicalization + fingerprint
// ---------------------------------------------------------------------------

/** Stable, key-sorted JSON serialization so source whitespace/key order
 * (formatting-only changes) never affects the fingerprint. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

/** The review-relevant content object for a phrase (see docs/content/
 * content-review-workflow.md §7.1 change categories — learner-facing strings,
 * pronunciation, teaching/regional metadata, script provenance and
 * source/license are all review-relevant). */
function phraseReviewContent(input: PhraseReviewInput): PhraseReviewContent {
  return {
    traditional: input.traditional,
    simplified: input.simplified,
    pinyin: input.pinyin,
    japanese: input.japanese,
    usageNotesJa: input.usageNotesJa,
    traditionalStatus: input.traditionalStatus,
    simplifiedStatus: input.simplifiedStatus,
    painPointTags: input.painPointTags,
    source: input.source,
  };
}

function turnReviewContent(input: ReviewTurnInput): TurnReviewContent {
  return {
    speaker: input.speaker,
    traditional: input.traditional,
    simplified: input.simplified,
    pinyin: input.pinyin,
    japanese: input.japanese,
    traditionalStatus: input.traditionalStatus,
    simplifiedStatus: input.simplifiedStatus,
  };
}

function dialogReviewContent(input: DialogReviewInput): DialogReviewContent {
  return {
    turns: input.turns.map(turnReviewContent),
    relatedPhraseIds: [...input.relatedPhraseIds],
    source: input.source,
  };
}

function roleplayReviewContent(
  input: RoleplayReviewInput,
): RoleplayReviewContent {
  return {
    titleJa: input.titleJa,
    goalJa: input.goalJa,
    guidanceJa: input.guidanceJa,
    lessonRefs: input.lessonRefs ? [...input.lessonRefs] : undefined,
    phraseRefs: [...input.phraseRefs],
    allLearnerTurnsRehearsed: input.allLearnerTurnsRehearsed,
    lines: input.lines.map(turnReviewContent),
    source: input.source,
  };
}

function reviewContentFor(
  type: ReviewRecordType,
  input: PhraseReviewInput | DialogReviewInput | RoleplayReviewInput,
): ReviewContent {
  switch (type) {
    case 'phrase':
      return phraseReviewContent(input as PhraseReviewInput);
    case 'dialog':
      return dialogReviewContent(input as DialogReviewInput);
    case 'roleplay':
      return roleplayReviewContent(input as RoleplayReviewInput);
  }
}

/** A fixture/test-only roleplay record must never enter the launch target.
 * Covers the named fixture plus any id/flag the repository later uses for
 * fixture/test-only records. */
export function isFixtureRoleplayId(input: RoleplayReviewInput): boolean {
  if (input.id.toLowerCase().includes('fixture')) return true;
  if (input.id.startsWith('roleplay-fixture-')) return true;
  const record = input as unknown as Record<string, unknown>;
  if (record.fixture === true || record.kind === 'fixture') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Resolver (fail-closed #360 target)
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isScenario(value: string): value is TeacherReviewScenario {
  return (TEACHER_REVIEW_SCENARIOS as readonly string[]).includes(value);
}

/**
 * Resolve the exact #360 launch review target from parsed content records.
 *
 * Fails closed: any deviation from the contract (draft phrase/dialog counts,
 * launch roleplay card count, scenario coverage, or a fixture leaking into the
 * launch set) throws instead of silently redefining the campaign. Each record
 * receives a deterministic semantic fingerprint over its review-relevant
 * content.
 */
export async function resolveLaunchReviewTarget(
  inputs: TeacherReviewInputs,
  sha256: Sha256,
): Promise<CampaignResolution> {
  const draftPhrases = inputs.phrases.filter(
    (phrase) => phrase.reviewStatus === 'draft',
  );
  const draftDialogs = inputs.dialogs.filter(
    (dialog) => dialog.reviewStatus === 'draft',
  );
  const launchCards = inputs.roleplayCards.filter(
    (card) => !isFixtureRoleplayId(card) && card.reviewStatus === 'draft',
  );

  assert(
    draftPhrases.length === TEACHER_REVIEW_PHRASE_COUNT,
    `#360 target drift: expected ${TEACHER_REVIEW_PHRASE_COUNT} draft phrasebook phrases, got ${draftPhrases.length}. Reconcile the review campaign before continuing.`,
  );
  assert(
    draftDialogs.length === TEACHER_REVIEW_DIALOG_COUNT,
    `#360 target drift: expected ${TEACHER_REVIEW_DIALOG_COUNT} draft phrasebook dialogs, got ${draftDialogs.length}. Reconcile the review campaign before continuing.`,
  );
  assert(
    launchCards.length === TEACHER_REVIEW_ROLEPLAY_COUNT,
    `#360 target drift: expected ${TEACHER_REVIEW_ROLEPLAY_COUNT} draft launch roleplay cards, got ${launchCards.length}. Reconcile the review campaign before continuing.`,
  );

  // Every launch card must map to one of the six controlled scenarios and the
  // union of scenarios must be exactly the six — no extra, no missing.
  const launchScenarios = new Set(launchCards.map((card) => card.scenario));
  assert(
    launchScenarios.size === TEACHER_REVIEW_SCENARIOS.length,
    `#360 target drift: launch roleplay cards do not cover exactly the six controlled scenarios (${[...launchScenarios].join(', ')}).`,
  );
  for (const scenario of launchScenarios) {
    assert(
      isScenario(scenario),
      `#360 target drift: launch roleplay card has invalid scenario '${scenario}'.`,
    );
  }

  const fingerprint = async (type: ReviewRecordType, input: PhraseReviewInput | DialogReviewInput | RoleplayReviewInput) =>
    sha256(stableStringify(reviewContentFor(type, input)));

  const records: CampaignRecord[] = [];
  for (const scenario of TEACHER_REVIEW_SCENARIOS) {
    for (const phrase of draftPhrases.filter((p) => p.scenario === scenario)) {
      records.push({
        id: phrase.id,
        type: 'phrase',
        scenario,
        content: phraseReviewContent(phrase),
        fingerprint: await fingerprint('phrase', phrase),
      });
    }
    for (const dialog of draftDialogs.filter((d) => d.scenario === scenario)) {
      records.push({
        id: dialog.id,
        type: 'dialog',
        scenario,
        content: dialogReviewContent(dialog),
        fingerprint: await fingerprint('dialog', dialog),
      });
    }
    for (const card of launchCards.filter((c) => c.scenario === scenario)) {
      records.push({
        id: card.id,
        type: 'roleplay',
        scenario,
        content: roleplayReviewContent(card),
        fingerprint: await fingerprint('roleplay', card),
      });
    }
  }

  assert(
    records.length === TEACHER_REVIEW_TOTAL_COUNT,
    `#360 target drift: expected ${TEACHER_REVIEW_TOTAL_COUNT} campaign records, got ${records.length}.`,
  );

  return {
    campaignId: TEACHER_REVIEW_CAMPAIGN_ID,
    records,
    counts: {
      phrases: draftPhrases.length,
      dialogs: draftDialogs.length,
      roleplay: launchCards.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface DecisionRecord {
  campaignId: string;
  recordId: string;
  /** Semantic fingerprint of the exact reviewed record version. */
  fingerprint: string;
  outcome: ReviewOutcome;
  note: string;
  reviewerIdentity: string;
  reviewerEmail: string;
  reviewerName: string;
  reviewerRole: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

export interface DecisionInput {
  recordId: string;
  outcome: ReviewOutcome;
  note?: string;
}

/** A validated, normalized decision (note always a trimmed string). */
export interface NormalizedDecision {
  recordId: string;
  outcome: ReviewOutcome;
  note: string;
}

export type DecisionValidationResult =
  | { ok: true; decision: NormalizedDecision }
  | { ok: false; error: string };

/**
 * Validate a browser-submitted decision against the issue contract:
 * `needs_changes` requires a non-empty note; `accepted` allows an optional
 * note; notes are bounded; the record must be part of the current campaign.
 */
export function validateDecisionInput(
  input: unknown,
  records: readonly CampaignRecord[],
): DecisionValidationResult {
  if (input === null || typeof input !== 'object') {
    return { ok: false, error: 'Malformed decision payload.' };
  }
  const candidate = input as Record<string, unknown>;
  const recordId = candidate.recordId;
  const outcome = candidate.outcome;
  if (typeof recordId !== 'string' || recordId.trim().length === 0) {
    return { ok: false, error: 'Missing recordId.' };
  }
  if (typeof outcome !== 'string' || !(REVIEW_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false, error: `Invalid outcome '${String(outcome)}'.` };
  }
  const record = records.find((r) => r.id === recordId);
  if (!record) {
    return { ok: false, error: `Unknown review record '${recordId}'.` };
  }
  const rawNote = candidate.note;
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    return { ok: false, error: 'Reviewer note must be text.' };
  }
  const note = (typeof rawNote === 'string' ? rawNote : '').trim();
  if (note.length > REVIEWER_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Reviewer note is too long (max ${REVIEWER_NOTE_MAX_LENGTH} characters).`,
    };
  }
  if (outcome === 'needs_changes' && note.length === 0) {
    return {
      ok: false,
      error: 'Needs changes requires a non-empty reviewer note.',
    };
  }
  return {
    ok: true,
    decision: { recordId, outcome: outcome as ReviewOutcome, note },
  };
}

/** A persisted decision is valid for a record only when its semantic version
 * (fingerprint) still matches the current record — stale decisions never count
 * (#363 review semantics / content-review-workflow §7). */
export function isDecisionValidForRecord(
  decision: DecisionRecord,
  record: CampaignRecord,
): boolean {
  return (
    decision.campaignId === TEACHER_REVIEW_CAMPAIGN_ID &&
    decision.recordId === record.id &&
    decision.fingerprint === record.fingerprint
  );
}

export interface ReviewProgress {
  total: number;
  decided: number;
  accepted: number;
  needsChanges: number;
  unreviewed: number;
}

/** Progress counts only CURRENT-VERSION valid decisions. */
export function computeReviewProgress(
  records: readonly CampaignRecord[],
  decisions: readonly DecisionRecord[],
): ReviewProgress {
  let decided = 0;
  let accepted = 0;
  let needsChanges = 0;
  for (const record of records) {
    const decision = decisions.find(
      (d) => d.recordId === record.id && isDecisionValidForRecord(d, record),
    );
    if (!decision) continue;
    decided += 1;
    if (decision.outcome === 'accepted') accepted += 1;
    else needsChanges += 1;
  }
  return {
    total: records.length,
    decided,
    accepted,
    needsChanges,
    unreviewed: records.length - decided,
  };
}

// ---------------------------------------------------------------------------
// Persistence boundary
// ---------------------------------------------------------------------------

/** Minimal store contract so the Pages Functions (D1) and tests (in-memory)
 * share one interface. The store persists human decisions only. */
export interface TeacherReviewStore {
  listDecisions(
    campaignId: string,
    recordIds: readonly string[],
  ): Promise<DecisionRecord[]>;
  upsertDecision(decision: DecisionRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Review artifact (docs/content/content-review-workflow.md §3)
// ---------------------------------------------------------------------------

export interface ReviewArtifactParams {
  campaignId: string;
  /** The configured #360 teacher-review scope types covered by the atomic
   * v1 decision (bounded campaign configuration, not generalized RBAC). */
  scopes: readonly string[];
  reviewerRole: string;
  records: readonly CampaignRecord[];
  decisions: readonly DecisionRecord[];
  /** ISO 8601 generation timestamp. */
  generatedAt: string;
}

export interface ReviewArtifactSummary {
  overallOutcome: ReviewOutcome | 'incomplete';
  reviewEntryComplete: boolean;
  blockedRecordIds: string[];
  unresolvedNotes: string[];
}

/** Aggregate the artifact outcome truthfully. Stale decisions never count;
 * entry completion requires every current-version record to have a valid
 * decision; any `needs_changes` keeps the artifact outcome `needs-changes`
 * and identifies blocked content. Completion is never equated with PASS. */
export function summarizeReviewArtifact(
  params: ReviewArtifactParams,
): ReviewArtifactSummary {
  const decisions = params.decisions;
  const byRecord = new Map<string, DecisionRecord>();
  for (const record of params.records) {
    const valid = decisions.find((d) => isDecisionValidForRecord(d, record));
    if (valid) byRecord.set(record.id, valid);
  }

  const reviewEntryComplete =
    byRecord.size === params.records.length && params.records.length > 0;

  const blockedRecordIds = params.records
    .filter((record) => {
      const decision = byRecord.get(record.id);
      if (!decision) return true;
      return decision.outcome === 'needs_changes';
    })
    .map((record) => record.id);

  const unresolvedNotes = params.records
    .map((record) => byRecord.get(record.id))
    .filter(
      (decision): decision is DecisionRecord =>
        decision !== undefined && decision.outcome === 'needs_changes' && decision.note.length > 0,
    )
    .map((decision) => decision.note);

  const hasNeedsChanges = blockedRecordIds.some(
    (id) => byRecord.get(id)?.outcome === 'needs_changes',
  );

  const overallOutcome: ReviewArtifactSummary['overallOutcome'] =
    hasNeedsChanges
      ? 'needs_changes'
      : reviewEntryComplete
        ? 'accepted'
        : 'incomplete';

  return {
    overallOutcome,
    reviewEntryComplete,
    blockedRecordIds,
    unresolvedNotes,
  };
}

/** Build the repository-standard human-review artifact (markdown). Follows the
 * required fields of docs/content/content-review-workflow.md §3.1/§3.3 and
 * never equates entry completion with PASS. */
export function buildReviewArtifact(params: ReviewArtifactParams): string {
  const summary = summarizeReviewArtifact(params);
  const byRecord = new Map<string, DecisionRecord>();
  for (const record of params.records) {
    const valid = params.decisions.find((d) => isDecisionValidForRecord(d, record));
    if (valid) byRecord.set(record.id, valid);
  }

  const distinctReviewers = [
    ...new Map(
      [...byRecord.values()].map((decision) => [
        decision.reviewerEmail,
        decision.reviewerIdentity,
      ]),
    ).values(),
  ].join(', ');

  const versionHash = params.records
    .map((record) => `${record.id}=${record.fingerprint}`)
    .sort()
    .join('\n');

  const outcomeLabel: Record<ReviewArtifactSummary['overallOutcome'], string> = {
    accepted: 'accepted',
    needs_changes: 'needs-changes',
    incomplete: 'needs-changes',
  };

  const reviewedItems = params.records.map((record) => record.id).join(', ');
  const blockedContent =
    summary.blockedRecordIds.length > 0
      ? summary.blockedRecordIds.join(', ')
      : 'None.';
  const unresolvedIssues =
    summary.unresolvedNotes.length > 0
      ? summary.unresolvedNotes.join(' | ')
      : 'None.';
  const reviewEntryStatus = summary.reviewEntryComplete
    ? 'Complete (every current-version record has a valid decision).'
    : `Incomplete (${summary.blockedRecordIds.length} record(s) have no current valid decision). This is NOT a PASS.`;

  const scopeRows = params.scopes
    .map((scope) => {
      const outcome =
        summary.overallOutcome === 'accepted'
          ? 'accepted'
          : summary.overallOutcome === 'needs_changes'
            ? 'needs-changes'
            : 'not-reviewed';
      return `| ${scope} | ${outcome} |`;
    })
    .join('\n');

  return [
    '## Review Artifact',
    '',
    `**Campaign:** ${params.campaignId}`,
    `**Reviewer identity:** ${distinctReviewers || 'No decisions recorded yet.'}`,
    `**Reviewer role:** ${params.reviewerRole}`,
    `**Review date:** ${params.generatedAt.slice(0, 10)}`,
    `**Reviewed items:** ${reviewedItems}`,
    `**Review version:** per-record semantic fingerprints (see below)`,
    `**Overall review outcome:** ${outcomeLabel[summary.overallOutcome]}`,
    `**Review entry:** ${reviewEntryStatus}`,
    '',
    '### Approval Scope',
    '',
    '| Scope Type | Outcome |',
    '|------------|---------|',
    scopeRows,
    '',
    '### Blocked Content',
    '',
    blockedContent,
    '',
    '### Unresolved Issues',
    '',
    unresolvedIssues,
    '',
    '### Per-Record Decisions',
    '',
    '| Record | Type | Outcome | Fingerprint |',
    '|--------|------|---------|-------------|',
    ...params.records.map((record) => {
      const decision = byRecord.get(record.id);
      const outcome = decision ? decision.outcome : 'unreviewed';
      return `| ${record.id} | ${record.type} | ${outcome} | ${record.fingerprint} |`;
    }),
    '',
    '### Reviewed Content Version',
    '',
    '```text',
    versionHash,
    '```',
    '',
    '*Generated by the Chabiko teacher-review portal. Records human decisions only; never a substitute for the #360 mechanical publication phase.*',
    '',
  ].join('\n');
}
