import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_PHRASEBOOK_PATH = 'data/examples/valid/phrasebook.json';
const DEFAULT_DIALOG_PATH = 'data/examples/valid/phrasebook-dialogs.json';

/** The frozen first-release phrasebook size: exactly 30 phrases and 6 dialogs. */
export const PHRASEBOOK_PHRASE_COUNT = 30;
export const PHRASEBOOK_DIALOG_COUNT = 6;

/**
 * Controlled scenario order (#236). The source files are NOT authored in this
 * order (phrase-001/002 come first in phrasebook.json), so the loader/surface
 * must present scenarios in exactly this order while preserving the relative
 * source order of phrases/dialogs within each scenario.
 */
export const PHRASEBOOK_SCENARIOS = [
  'airport',
  'transport',
  'food',
  'shopping',
  'hotel',
  'emergency',
] as const;

export type PhrasebookScenario = (typeof PHRASEBOOK_SCENARIOS)[number];

/** Per-form provenance. */
export type PhrasebookFormStatus = 'authored' | 'verified' | 'generated';

export type PhrasebookReviewStatus = 'draft' | 'reviewed' | 'published';

export type PhrasebookSpeaker = 'learner' | 'partner';

export interface PhrasebookSource {
  type: string;
  note?: string;
}

/**
 * The learner-surface shape for one phrasebook phrase. Maps only the fields the
 * surface consumes; nothing is fabricated or converted. `simplified` is
 * optional exactly as the content model defines it (available where both forms
 * exist), and `source` is optional (a draft record may carry no source yet).
 */
export interface PhrasebookPhrase {
  id: string;
  scenario: PhrasebookScenario;
  traditional: string;
  traditionalStatus: PhrasebookFormStatus;
  simplified?: string;
  simplifiedStatus?: PhrasebookFormStatus;
  pinyin: string;
  japanese: string;
  usageNotesJa: string;
  painPointTags?: string[];
  reviewStatus: PhrasebookReviewStatus;
  source?: PhrasebookSource;
}

/** One conversation turn inside a phrasebook dialog. */
export interface PhrasebookDialogTurn {
  speaker: PhrasebookSpeaker;
  traditional: string;
  traditionalStatus: PhrasebookFormStatus;
  simplified?: string;
  simplifiedStatus?: PhrasebookFormStatus;
  pinyin: string;
  japanese: string;
}

/** The learner-surface shape for one phrasebook dialog. */
export interface PhrasebookDialog {
  id: string;
  scenario: PhrasebookScenario;
  turns: readonly PhrasebookDialogTurn[];
  relatedPhraseIds: readonly string[];
  reviewStatus: PhrasebookReviewStatus;
  source?: PhrasebookSource;
}

export interface PhrasebookData {
  phrases: readonly PhrasebookPhrase[];
  dialogs: readonly PhrasebookDialog[];
}

/** One controlled scenario rendered by the surface, in controlled order. */
export interface PhrasebookScenarioGroup {
  scenario: PhrasebookScenario;
  phrases: readonly PhrasebookPhrase[];
  dialog: PhrasebookDialog | null;
}

const PHRASE_REQUIRED_FIELDS = [
  'traditional',
  'pinyin',
  'japanese',
  'usageNotesJa',
] as const;

const TURN_REQUIRED_FIELDS = ['traditional', 'pinyin', 'japanese'] as const;

const VALID_FORM_STATUSES = new Set<string>(['authored', 'verified', 'generated']);
const VALID_REVIEW_STATUSES = new Set<string>(['draft', 'reviewed', 'published']);
const SCENARIO_SET = new Set<string>(PHRASEBOOK_SCENARIOS);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  return Object.freeze(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isScenario(value: unknown): value is PhrasebookScenario {
  return typeof value === 'string' && SCENARIO_SET.has(value);
}

function requireFormStatus(
  record: Record<string, unknown>,
  field: string,
  prefix: string,
): PhrasebookFormStatus {
  assert(
    typeof record[field] === 'string' && VALID_FORM_STATUSES.has(record[field]),
    `${prefix} has invalid ${field} '${String(record[field])}'`,
  );
  return record[field] as PhrasebookFormStatus;
}

function requireReviewStatus(
  record: Record<string, unknown>,
  field: string,
  prefix: string,
): PhrasebookReviewStatus {
  assert(
    typeof record[field] === 'string' && VALID_REVIEW_STATUSES.has(record[field]),
    `${prefix} has invalid ${field} '${String(record[field])}'`,
  );
  return record[field] as PhrasebookReviewStatus;
}

function parseSource(value: unknown, prefix: string): PhrasebookSource {
  assert(value !== null && typeof value === 'object', `${prefix} has an invalid source`);
  const source = value as Record<string, unknown>;
  assert(
    isNonEmptyString(source.type),
    `${prefix} source has a missing or empty 'type'`,
  );
  return {
    type: source.type as string,
    ...(source.note !== undefined && isNonEmptyString(source.note)
      ? { note: source.note as string }
      : {}),
  };
}

/** Read + JSON-parse a collection at `path`, asserting `{key: [...]}` shape. */
function loadCollection(path: string, key: string): unknown[] {
  const raw = readFileSync(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse ${key} at ${path}: not valid JSON`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>)[key])
  ) {
    throw new Error(
      `Invalid ${key} structure at ${path}: expected {${key}: [...]}`,
    );
  }
  return (parsed as Record<string, unknown>)[key] as unknown[];
}

function parsePhrases(records: unknown[]): PhrasebookPhrase[] {
  assert(
    records.length === PHRASEBOOK_PHRASE_COUNT,
    `phrasebook corpus must contain exactly ${PHRASEBOOK_PHRASE_COUNT} phrases, got ${records.length}`,
  );

  const seenIds = new Set<string>();
  const phrases: PhrasebookPhrase[] = [];
  for (const [index, record] of records.entries()) {
    assert(record !== null && typeof record === 'object', `phrasebook[${index}] is not an object`);
    const item = record as Record<string, unknown>;
    const id = item.id;
    assert(isNonEmptyString(id), `phrasebook[${index}] has a missing or empty id`);
    assert(!seenIds.has(id), `duplicate phrasebook id '${id}'`);
    seenIds.add(id);

    const prefix = `phrasebook[${index}] ('${id}')`;
    assert(isScenario(item.scenario), `${prefix} has invalid scenario '${String(item.scenario)}'`);
    for (const field of PHRASE_REQUIRED_FIELDS) {
      assert(
        isNonEmptyString(item[field]),
        `${prefix} has a missing or empty '${field}'`,
      );
    }
    const traditionalStatus = requireFormStatus(item, 'traditionalStatus', prefix);

    let simplified: string | undefined;
    let simplifiedStatus: PhrasebookFormStatus | undefined;
    if (item.simplified === undefined) {
      assert(
        item.simplifiedStatus === undefined,
        `${prefix} has simplifiedStatus without a simplified form`,
      );
    } else {
      assert(
        isNonEmptyString(item.simplified),
        `${prefix} has an empty simplified form`,
      );
      simplified = item.simplified as string;
      simplifiedStatus = requireFormStatus(item, 'simplifiedStatus', prefix);
    }

    const reviewStatus = requireReviewStatus(item, 'reviewStatus', prefix);

    if (item.painPointTags !== undefined) {
      assert(
        Array.isArray(item.painPointTags) &&
          (item.painPointTags as unknown[]).every((tag) => isNonEmptyString(tag)),
        `${prefix} has invalid painPointTags`,
      );
    }

    phrases.push({
      id,
      scenario: item.scenario as PhrasebookScenario,
      traditional: item.traditional as string,
      traditionalStatus,
      ...(simplified !== undefined && simplifiedStatus !== undefined
        ? { simplified, simplifiedStatus }
        : {}),
      pinyin: item.pinyin as string,
      japanese: item.japanese as string,
      usageNotesJa: item.usageNotesJa as string,
      ...(item.painPointTags !== undefined
        ? { painPointTags: item.painPointTags as string[] }
        : {}),
      reviewStatus,
      ...(item.source !== undefined ? { source: parseSource(item.source, prefix) } : {}),
    });
  }
  return phrases;
}

function parseTurn(value: unknown, prefix: string): PhrasebookDialogTurn {
  assert(value !== null && typeof value === 'object', `${prefix} is not an object`);
  const turn = value as Record<string, unknown>;
  assert(
    turn.speaker === 'learner' || turn.speaker === 'partner',
    `${prefix} has invalid speaker '${String(turn.speaker)}'`,
  );
  for (const field of TURN_REQUIRED_FIELDS) {
    assert(
      isNonEmptyString(turn[field]),
      `${prefix} has a missing or empty '${field}'`,
    );
  }
  const traditionalStatus = requireFormStatus(turn, 'traditionalStatus', prefix);

  let simplified: string | undefined;
  let simplifiedStatus: PhrasebookFormStatus | undefined;
  if (turn.simplified === undefined) {
    assert(
      turn.simplifiedStatus === undefined,
      `${prefix} has simplifiedStatus without a simplified form`,
    );
  } else {
    assert(
      isNonEmptyString(turn.simplified),
      `${prefix} has an empty simplified form`,
    );
    simplified = turn.simplified as string;
    simplifiedStatus = requireFormStatus(turn, 'simplifiedStatus', prefix);
  }

  return {
    speaker: turn.speaker as PhrasebookSpeaker,
    traditional: turn.traditional as string,
    traditionalStatus,
    ...(simplified !== undefined && simplifiedStatus !== undefined
      ? { simplified, simplifiedStatus }
      : {}),
    pinyin: turn.pinyin as string,
    japanese: turn.japanese as string,
  };
}

function parseDialogs(
  records: unknown[],
  phrases: readonly PhrasebookPhrase[],
): PhrasebookDialog[] {
  assert(
    records.length === PHRASEBOOK_DIALOG_COUNT,
    `phrasebook dialog corpus must contain exactly ${PHRASEBOOK_DIALOG_COUNT} dialogs, got ${records.length}`,
  );

  const phraseScenarioById = new Map<string, PhrasebookScenario>(
    phrases.map((phrase) => [phrase.id, phrase.scenario]),
  );
  const seenIds = new Set<string>();
  const dialogs: PhrasebookDialog[] = [];
  for (const [index, record] of records.entries()) {
    assert(record !== null && typeof record === 'object', `phrasebookDialogs[${index}] is not an object`);
    const item = record as Record<string, unknown>;
    const id = item.id;
    assert(isNonEmptyString(id), `phrasebookDialogs[${index}] has a missing or empty id`);
    assert(!seenIds.has(id), `duplicate phrasebook dialog id '${id}'`);
    seenIds.add(id);

    const prefix = `phrasebookDialogs[${index}] ('${id}')`;
    assert(isScenario(item.scenario), `${prefix} has invalid scenario '${String(item.scenario)}'`);
    const scenario = item.scenario as PhrasebookScenario;

    assert(
      Array.isArray(item.turns) && item.turns.length >= 1,
      `${prefix} must have at least one turn`,
    );
    const turns = (item.turns as unknown[]).map((turn, turnIndex) =>
      parseTurn(turn, `${prefix} turn[${turnIndex}]`),
    );

    assert(
      Array.isArray(item.relatedPhraseIds) && item.relatedPhraseIds.length >= 1,
      `${prefix} must have at least one relatedPhraseId`,
    );
    const relatedPhraseIds: string[] = [];
    const seenRelated = new Set<string>();
    for (const relatedId of item.relatedPhraseIds as unknown[]) {
      assert(
        isNonEmptyString(relatedId),
        `${prefix} has an invalid relatedPhraseId`,
      );
      assert(
        !seenRelated.has(relatedId),
        `${prefix} has a duplicate relatedPhraseId '${relatedId}'`,
      );
      seenRelated.add(relatedId);
      const refScenario = phraseScenarioById.get(relatedId);
      assert(
        refScenario !== undefined,
        `${prefix} references missing phrase '${relatedId}'`,
      );
      assert(
        refScenario === scenario,
        `${prefix} references cross-scenario phrase '${relatedId}' (${refScenario}, expected ${scenario})`,
      );
      relatedPhraseIds.push(relatedId);
    }

    const reviewStatus = requireReviewStatus(item, 'reviewStatus', prefix);

    dialogs.push({
      id,
      scenario,
      turns: deepFreeze(turns),
      relatedPhraseIds: deepFreeze(relatedPhraseIds),
      reviewStatus,
      ...(item.source !== undefined ? { source: parseSource(item.source, prefix) } : {}),
    });
  }
  return dialogs;
}

/**
 * Load the phrasebook corpus for the learner surface at `/phrasebook/`.
 *
 * Deterministic and fail-closed: throws on a missing/unparseable file, an
 * invalid document structure, a count that is not exactly
 * {@link PHRASEBOOK_PHRASE_COUNT} phrases and {@link PHRASEBOOK_DIALOG_COUNT}
 * dialogs, a duplicate id, an invalid scenario, a missing/empty required field,
 * an invalid form or review status, a malformed dialog turn, or a
 * `relatedPhraseId` that is missing or points to a different scenario's phrase.
 * The returned records are deeply frozen; each call parses fresh JSON and
 * returns independent references.
 *
 * The loader performs no runtime script conversion and never fabricates or
 * converts content: it maps only the surface's consumed fields verbatim.
 *
 * @param phraseFilePath  optional override for the phrase collection
 *   (defaults to `data/examples/valid/phrasebook.json`).
 * @param dialogFilePath  optional override for the dialog collection
 *   (defaults to `data/examples/valid/phrasebook-dialogs.json`).
 */
export function loadPhrasebook(
  phraseFilePath?: string,
  dialogFilePath?: string,
): PhrasebookData {
  const phrasePath =
    phraseFilePath ?? resolve(process.cwd(), DEFAULT_PHRASEBOOK_PATH);
  const dialogPath = dialogFilePath ?? resolve(process.cwd(), DEFAULT_DIALOG_PATH);

  const rawPhrases = loadCollection(phrasePath, 'phrasebook');
  const rawDialogs = loadCollection(dialogPath, 'phrasebookDialogs');

  const phrases = deepFreeze(parsePhrases(rawPhrases)) as readonly PhrasebookPhrase[];
  const dialogs = deepFreeze(parseDialogs(rawDialogs, phrases)) as readonly PhrasebookDialog[];

  return { phrases, dialogs };
}

/**
 * Production-eligibility gate for one phrasebook phrase (content-review
 * contract per the #236 owner decision / #349 kanji-bridge precedent):
 * a phrase may be shown to learners only when a human reviewer has approved
 * its record (`reviewed`/`published`) AND its path-default (Traditional)
 * script form is authored or verified AND, when a Simplified form is present,
 * that form is authored or verified too. `generated`-only forms and `draft`
 * review status are never learner-facing; they may exist in the corpus as
 * authoring/review material awaiting the review-promotion workflow.
 */
export function isPhrasebookProductionEligible(
  phrase: PhrasebookPhrase,
): boolean {
  return (
    (phrase.reviewStatus === 'reviewed' || phrase.reviewStatus === 'published') &&
    (phrase.traditionalStatus === 'authored' ||
      phrase.traditionalStatus === 'verified') &&
    (phrase.simplified === undefined ||
      phrase.simplifiedStatus === 'authored' ||
      phrase.simplifiedStatus === 'verified')
  );
}

/**
 * Production-eligibility gate for one phrasebook dialog (content-review
 * contract per the #236 owner decision / #349 precedent). Script forms are
 * per-turn: every PRESENT form of every turn must be authored or verified.
 * `generated`-only forms and `draft` review status are never learner-facing.
 */
export function isPhrasebookDialogProductionEligible(
  dialog: PhrasebookDialog,
): boolean {
  if (dialog.reviewStatus !== 'reviewed' && dialog.reviewStatus !== 'published') {
    return false;
  }
  return dialog.turns.every(
    (turn) =>
      (turn.traditionalStatus === 'authored' ||
        turn.traditionalStatus === 'verified') &&
      (turn.simplified === undefined ||
        turn.simplifiedStatus === 'authored' ||
        turn.simplifiedStatus === 'verified'),
  );
}

/**
 * The deterministic, source-order-preserving eligible subset for the learner
 * route at `/phrasebook/`. Fails closed: records that are not human-reviewed
 * or whose script forms are not independently authored/verified stay out of
 * the learner surface (the route renders a truthful pending state for them).
 * The full {@link loadPhrasebook} validation contract (exact 30 phrases + 6
 * dialogs, controlled scenario ordering, same-scenario references, deep
 * freeze) is unchanged — this only filters its result.
 */
export function loadEligiblePhrasebook(
  phraseFilePath?: string,
  dialogFilePath?: string,
): PhrasebookData {
  const data = loadPhrasebook(phraseFilePath, dialogFilePath);
  return {
    phrases: data.phrases.filter(isPhrasebookProductionEligible),
    dialogs: data.dialogs.filter(isPhrasebookDialogProductionEligible),
  };
}

/**
 * Group the loaded corpus into the six controlled scenarios in
 * {@link PHRASEBOOK_SCENARIOS} order, preserving relative source order of
 * phrases within each scenario. Each scenario carries its dialog (or `null`).
 * The result is deterministic and deeply frozen.
 */
export function groupPhrasebookByScenario(
  data: PhrasebookData,
): readonly PhrasebookScenarioGroup[] {
  const phrasesByScenario = new Map<PhrasebookScenario, PhrasebookPhrase[]>();
  for (const scenario of PHRASEBOOK_SCENARIOS) phrasesByScenario.set(scenario, []);
  for (const phrase of data.phrases) {
    const group = phrasesByScenario.get(phrase.scenario) ?? [];
    group.push(phrase);
    phrasesByScenario.set(phrase.scenario, group);
  }

  const dialogByScenario = new Map<PhrasebookScenario, PhrasebookDialog>();
  for (const dialog of data.dialogs) {
    if (!dialogByScenario.has(dialog.scenario)) {
      dialogByScenario.set(dialog.scenario, dialog);
    }
  }

  const groups = PHRASEBOOK_SCENARIOS.map((scenario) => ({
    scenario,
    phrases: phrasesByScenario.get(scenario) ?? [],
    dialog: dialogByScenario.get(scenario) ?? null,
  }));
  return deepFreeze(groups) as readonly PhrasebookScenarioGroup[];
}
