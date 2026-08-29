import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PHRASEBOOK_SCENARIOS,
  type PhrasebookData,
  type PhrasebookDialog,
  type PhrasebookDialogTurn,
  type PhrasebookFormStatus,
  type PhrasebookPhrase,
  type PhrasebookReviewStatus,
  type PhrasebookScenario,
  type PhrasebookScenarioGroup,
  type PhrasebookSource,
  type PhrasebookSpeaker,
} from '../types/phrasebook';

export { PHRASEBOOK_SCENARIOS };
export type {
  PhrasebookData,
  PhrasebookDialog,
  PhrasebookDialogTurn,
  PhrasebookFormStatus,
  PhrasebookPhrase,
  PhrasebookReviewStatus,
  PhrasebookScenario,
  PhrasebookScenarioGroup,
  PhrasebookSource,
  PhrasebookSpeaker,
} from '../types/phrasebook';

const DEFAULT_PHRASEBOOK_PATH = 'data/examples/valid/phrasebook.json';
const DEFAULT_DIALOG_PATH = 'data/examples/valid/phrasebook-dialogs.json';

/** The frozen first-release phrasebook size: exactly 30 phrases and 6 dialogs. */
export const PHRASEBOOK_PHRASE_COUNT = 30;
export const PHRASEBOOK_DIALOG_COUNT = 6;

type CanonicalPhraseTuple = readonly [id: string, scenario: PhrasebookScenario];
type CanonicalDialogTuple = readonly [
  id: string,
  scenario: PhrasebookScenario,
  relatedPhraseIds: readonly string[],
];

/**
 * The exact first-release corpus, in canonical source order. The tuple
 * metadata freezes each record's scenario and dialog references as well as
 * its ID, so a replacement or relocation cannot pass by matching only a
 * count, ID, or scenario set.
 */
export const PHRASEBOOK_CANONICAL_PHRASE_MANIFEST = [
  ['phrase-001', 'food'],
  ['phrase-002', 'transport'],
  ['phrase-airport-001', 'airport'],
  ['phrase-airport-002', 'airport'],
  ['phrase-airport-003', 'airport'],
  ['phrase-airport-004', 'airport'],
  ['phrase-airport-005', 'airport'],
  ['phrase-food-002', 'food'],
  ['phrase-food-003', 'food'],
  ['phrase-food-004', 'food'],
  ['phrase-food-005', 'food'],
  ['phrase-transport-002', 'transport'],
  ['phrase-transport-003', 'transport'],
  ['phrase-transport-004', 'transport'],
  ['phrase-transport-005', 'transport'],
  ['phrase-shopping-001', 'shopping'],
  ['phrase-shopping-002', 'shopping'],
  ['phrase-shopping-003', 'shopping'],
  ['phrase-shopping-004', 'shopping'],
  ['phrase-shopping-005', 'shopping'],
  ['phrase-hotel-001', 'hotel'],
  ['phrase-hotel-002', 'hotel'],
  ['phrase-hotel-003', 'hotel'],
  ['phrase-hotel-004', 'hotel'],
  ['phrase-hotel-005', 'hotel'],
  ['phrase-emergency-001', 'emergency'],
  ['phrase-emergency-002', 'emergency'],
  ['phrase-emergency-003', 'emergency'],
  ['phrase-emergency-004', 'emergency'],
  ['phrase-emergency-005', 'emergency'],
] as const satisfies readonly CanonicalPhraseTuple[];

export const PHRASEBOOK_CANONICAL_DIALOG_MANIFEST = [
  [
    'dialog-transport-001',
    'transport',
    ['phrase-002', 'phrase-transport-002', 'phrase-transport-005'],
  ],
  [
    'dialog-airport-001',
    'airport',
    ['phrase-airport-001', 'phrase-airport-004', 'phrase-airport-005'],
  ],
  [
    'dialog-food-001',
    'food',
    ['phrase-001', 'phrase-food-003', 'phrase-food-005'],
  ],
  [
    'dialog-shopping-001',
    'shopping',
    ['phrase-shopping-001', 'phrase-shopping-003', 'phrase-shopping-005'],
  ],
  [
    'dialog-hotel-001',
    'hotel',
    ['phrase-hotel-001', 'phrase-hotel-003', 'phrase-hotel-005'],
  ],
  [
    'dialog-emergency-001',
    'emergency',
    ['phrase-emergency-001', 'phrase-emergency-002', 'phrase-emergency-005'],
  ],
] as const satisfies readonly CanonicalDialogTuple[];

export const PHRASEBOOK_CANONICAL_PHRASE_IDS =
  PHRASEBOOK_CANONICAL_PHRASE_MANIFEST.map(([id]) => id);
export const PHRASEBOOK_CANONICAL_DIALOG_IDS =
  PHRASEBOOK_CANONICAL_DIALOG_MANIFEST.map(([id]) => id);

const CANONICAL_PHRASE_IDS = new Set<string>(PHRASEBOOK_CANONICAL_PHRASE_IDS);
const CANONICAL_DIALOG_IDS = new Set<string>(PHRASEBOOK_CANONICAL_DIALOG_IDS);

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

function parseRelatedVocabulary(
  value: unknown,
  prefix: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  assert(Array.isArray(value), `${prefix} has invalid relatedVocabulary`);
  const seen = new Set<string>();
  const references: string[] = [];
  for (const reference of value) {
    assert(
      isNonEmptyString(reference),
      `${prefix} has an invalid relatedVocabulary reference`,
    );
    assert(
      !seen.has(reference),
      `${prefix} has a duplicate relatedVocabulary reference '${reference}'`,
    );
    seen.add(reference);
    references.push(reference);
  }
  return references;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertExactCanonicalIds(
  actualIds: readonly string[],
  expectedIds: readonly string[],
  label: string,
): void {
  assert(
    actualIds.length === expectedIds.length &&
      actualIds.every((id, index) => id === expectedIds[index]),
    `${label} must match the exact canonical launch set and order`,
  );
}

function assertExactCanonicalTuples(data: PhrasebookData): void {
  assertExactCanonicalIds(
    data.phrases.map((phrase) => phrase.id),
    PHRASEBOOK_CANONICAL_PHRASE_IDS,
    'phrasebook phrases',
  );
  data.phrases.forEach((phrase, index) => {
    const [, expectedScenario] = PHRASEBOOK_CANONICAL_PHRASE_MANIFEST[index];
    assert(
      phrase.scenario === expectedScenario,
      `canonical phrase '${phrase.id}' must keep scenario '${expectedScenario}'`,
    );
  });

  assertExactCanonicalIds(
    data.dialogs.map((dialog) => dialog.id),
    PHRASEBOOK_CANONICAL_DIALOG_IDS,
    'phrasebook dialogs',
  );
  data.dialogs.forEach((dialog, index) => {
    const [, expectedScenario, expectedRelatedPhraseIds] =
      PHRASEBOOK_CANONICAL_DIALOG_MANIFEST[index];
    assert(
      dialog.scenario === expectedScenario,
      `canonical dialog '${dialog.id}' must keep scenario '${expectedScenario}'`,
    );
    assert(
      dialog.relatedPhraseIds.length === expectedRelatedPhraseIds.length &&
        dialog.relatedPhraseIds.every(
          (relatedId, relatedIndex) => relatedId === expectedRelatedPhraseIds[relatedIndex],
        ),
      `canonical dialog '${dialog.id}' must keep its exact ordered relatedPhraseIds`,
    );
  });
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
    const relatedVocabulary = parseRelatedVocabulary(
      item.relatedVocabulary,
      prefix,
    );

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
      ...(relatedVocabulary !== undefined ? { relatedVocabulary } : {}),
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
 * Load and validate the base phrasebook corpus used by learner projections,
 * including the `/phrasebook/` production and #440 prelaunch routes.
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
 * converts content: it maps the surface fields and typed relationship fields
 * verbatim.
 * Route-specific eligibility is applied by callers: `loadEligiblePhrasebook`
 * enforces the formal production review gate, while
 * `loadPrelaunchPhrasebook` enforces the exact #440 canonical projection.
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
 * The deterministic, source-order-preserving formal-production subset for
 * consumers such as lesson links. Fails closed: records that are not
 * human-reviewed or whose script forms are not independently authored/verified
 * stay out of that production projection. The `/phrasebook/` prelaunch route
 * instead uses `loadPrelaunchPhrasebook` to expose the exact #440 canonical 30
 * phrases + 6 dialogs while preserving truthful `reviewStatus` and provenance;
 * that #438 exposure override does not satisfy the still-open #360 formal-launch
 * review debt. The full {@link loadPhrasebook} validation contract (exact 30
 * phrases + 6 dialogs, controlled scenario ordering, same-scenario references,
 * deep freeze) is unchanged — this only filters its result.
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
 * Prelaunch eligibility for the exact #440 launch corpus. The #438 override
 * changes exposure eligibility only: canonical draft records may be shown,
 * while their reviewStatus, source, and per-form provenance remain verbatim.
 * Script forms still need authored/verified provenance, and the exact-ID
 * check prevents fixtures or unrelated drafts from entering this projection.
 */
export function isPhrasebookPrelaunchEligible(
  phrase: PhrasebookPhrase,
): boolean {
  return (
    CANONICAL_PHRASE_IDS.has(phrase.id) &&
    (phrase.traditionalStatus === 'authored' ||
      phrase.traditionalStatus === 'verified') &&
    (phrase.simplified === undefined ||
      phrase.simplifiedStatus === 'authored' ||
      phrase.simplifiedStatus === 'verified')
  );
}

export function isPhrasebookDialogPrelaunchEligible(
  dialog: PhrasebookDialog,
): boolean {
  return (
    CANONICAL_DIALOG_IDS.has(dialog.id) &&
    dialog.turns.every(
      (turn) =>
        (turn.traditionalStatus === 'authored' ||
          turn.traditionalStatus === 'verified') &&
        (turn.simplified === undefined ||
          turn.simplifiedStatus === 'authored' ||
          turn.simplifiedStatus === 'verified'),
    )
  );
}

/**
 * Project the exact canonical launch corpus for the prelaunch learner route.
 * `loadPhrasebook` performs the base schema/count, scenario, and reference
 * validation before this projection. This function then performs the exact
 * canonical ID/order and eligibility/count checks, so drift fails closed
 * rather than silently shrinking or replacing the learner surface.
 */
export function loadPrelaunchPhrasebook(
  phraseFilePath?: string,
  dialogFilePath?: string,
): PhrasebookData {
  const data = loadPhrasebook(phraseFilePath, dialogFilePath);
  assertExactCanonicalTuples(data);
  const phrases = data.phrases.filter(isPhrasebookPrelaunchEligible);
  const dialogs = data.dialogs.filter(isPhrasebookDialogPrelaunchEligible);
  assert(
    phrases.length === PHRASEBOOK_PHRASE_COUNT,
    `prelaunch phrasebook projection must contain exactly ${PHRASEBOOK_PHRASE_COUNT} canonical phrases, got ${phrases.length}`,
  );
  assert(
    dialogs.length === PHRASEBOOK_DIALOG_COUNT,
    `prelaunch phrasebook projection must contain exactly ${PHRASEBOOK_DIALOG_COUNT} canonical dialogs, got ${dialogs.length}`,
  );
  return { phrases, dialogs };
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
