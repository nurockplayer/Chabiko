import encounterData from '../../data/small-talk/encounters.json' with { type: 'json' };
import type {
  ConversationMove,
  ConversationOutcome,
  SmallTalkEncounterDocument,
  TopicDepth,
} from '../types/smallTalkEncounter';

const MOVES = new Set<ConversationMove>([
  'REACT', 'ANSWER', 'ADD', 'INVITE', 'CONNECT', 'NAVIGATE', 'REPAIR', 'CALIBRATE',
]);
const OUTCOMES = new Set<ConversationOutcome>(['CONTINUE', 'REPAIR', 'CLOSE', 'STALL']);
const DEPTHS = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as const;
const DEPTH_SET = new Set<TopicDepth>(DEPTHS);
const CHALLENGE_BANDS = new Set(['beginner', 'intermediate', 'advanced']);
const REVIEW_KEYS = [
  'traditionalMandarin', 'pinyin', 'japanese', 'socialPragmatics', 'seasonalClaims',
] as const;
const CHALLENGE_KEYS = [
  'band', 'cuePredictability', 'responseFreedom', 'initiativeBurden', 'listeningBurden',
  'discourseBurden', 'repairBurden', 'pragmaticBurden', 'partnerVariability',
] as const;
const EVIDENCE_DIMENSIONS = new Set([
  'contingency', 'contribution', 'reciprocity', 'continuation', 'repair-resilience',
  'pragmatic-fit',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_KINDS = new Set([
  'product-authority', 'official-date', 'official-cultural-reference',
]);
const OFFICIAL_FACTUAL_SOURCE_KINDS = new Set([
  'official-date', 'official-cultural-reference',
]);
const FROZEN_DGPA_2026_DATE_SOURCE = {
  id: 'dgpa-2026-calendar',
  kind: 'official-date',
  title: '中華民國一百一十五年政府行政機關辦公日曆表',
  publisher: '行政院人事行政總處',
  url: 'https://www.dgpa.gov.tw/information?pid=12573&uid=41',
  retrievedAt: '2026-08-31',
  supports: '2026 Mid-Autumn Festival date and government-calendar scope',
} as const;
const FROZEN_TAIWAN_TOURISM_CULTURAL_SOURCE = {
  id: 'taiwan-tourism-traditional-festivals',
  kind: 'official-cultural-reference',
  title: 'Traditional Festivals: Mid-Autumn Festival',
  publisher: 'Tourism Administration, Republic of China (Taiwan)',
  url: 'https://eng.taiwan.net.tw/m1.aspx?sNo=0002020',
  retrievedAt: '2026-08-31',
  supports: 'Reference support for mooncakes and a non-universal family-or-friends barbecue hook',
} as const;
const FROZEN_OFFICIAL_SOURCES = new Map<string, Readonly<Record<string, string>>>([
  [FROZEN_DGPA_2026_DATE_SOURCE.id, FROZEN_DGPA_2026_DATE_SOURCE],
  [FROZEN_TAIWAN_TOURISM_CULTURAL_SOURCE.id, FROZEN_TAIWAN_TOURISM_CULTURAL_SOURCE],
]);
const FROZEN_SEASONAL_CLAIM_SOURCE_IDS = new Map([
  ['mid-autumn-date-2026', FROZEN_DGPA_2026_DATE_SOURCE.id],
  ['mid-autumn-barbecue-varies', FROZEN_TAIWAN_TOURISM_CULTURAL_SOURCE.id],
]);
const FROZEN_SEASONAL_DEFINITION_ID = 'mid-autumn-festival';
const EXPECTED_FAMILY_IDS = ['weekend-baseline', 'mid-autumn-2026-transfer'] as const;
const EXPECTED_ENCOUNTER_IDS = [
  ['weekend-micro', 'weekend-medium'],
  ['mid-autumn-2026-medium'],
] as const;
const EXPECTED_ROOT_BEAT_IDS = [
  [
    { start: 'weekend-micro-opening', replay: 'weekend-micro-brief-replay' },
    { start: 'weekend-medium-opening', replay: 'weekend-medium-home-replay' },
  ],
  [
    { start: 'mid-autumn-opening', replay: 'mid-autumn-low-interest-replay' },
  ],
] as const;

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function requireNonEmptyArray(value: unknown, path: string): unknown[] {
  const array = requireArray(value, path);
  if (array.length === 0) throw new Error(`${path} must not be empty`);
  return array;
}

function requireString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return value;
}

function requireIsoDate(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new Error(`${path}.${key} must be an ISO date`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new Error(`${path}.${key} must be an ISO date`);
  }
  return value;
}

function requireOneOf<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: ReadonlySet<T>,
  path: string,
  label: string,
): T {
  const value = record[key];
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw new Error(`${path}.${key} must be ${label}`);
  }
  return value as T;
}

function requireUniqueId(
  record: Record<string, unknown>,
  path: string,
  seen: Set<string>,
  label: string,
): string {
  const id = requireString(record, 'id', path);
  if (seen.has(id)) throw new Error(`${path}.id duplicates ${label} '${id}'`);
  seen.add(id);
  return id;
}

function requireStringRefs(value: unknown, path: string): string[] {
  const refs = requireNonEmptyArray(value, path);
  const seen = new Set<string>();
  return refs.map((ref, index) => {
    if (typeof ref !== 'string' || ref.trim() === '') {
      throw new Error(`${path}[${index}] must be a non-empty string`);
    }
    if (seen.has(ref)) throw new Error(`${path}[${index}] duplicates '${ref}'`);
    seen.add(ref);
    return ref;
  });
}

function validateMovePattern(value: unknown, path: string): ConversationMove[] {
  return requireNonEmptyArray(value, path).map((move, index) => {
    if (typeof move !== 'string' || !MOVES.has(move as ConversationMove)) {
      throw new Error(`${path}[${index}] must be a known Move`);
    }
    return move as ConversationMove;
  });
}

function containsMovePatternInOrder(
  candidate: readonly ConversationMove[],
  required: readonly ConversationMove[],
): boolean {
  let requiredIndex = 0;
  for (const move of candidate) {
    if (move === required[requiredIndex]) requiredIndex += 1;
  }
  return requiredIndex === required.length;
}

function validateLocalizedText(value: unknown, path: string): void {
  const text = requireRecord(value, path);
  requireString(text, 'traditional', path);
  requireString(text, 'pinyin', path);
  requireString(text, 'japanese', path);
  if (text.simplifiedStatus !== 'unavailable') {
    throw new Error(`${path}.simplifiedStatus must be 'unavailable' for v0 Traditional-only content`);
  }
  const provenance = requireRecord(text.provenance, `${path}.provenance`);
  for (const key of ['traditional', 'pinyin', 'japanese']) {
    if (provenance[key] !== 'generated') {
      throw new Error(`${path}.provenance.${key} must remain 'generated' until human review`);
    }
  }
}

function validateReview(value: unknown, path: string): void {
  const review = requireRecord(value, path);
  if (review.reviewStatus !== 'draft') throw new Error(`${path}.reviewStatus must remain 'draft'`);
  if (review.contentOrigin !== 'ai-assisted-draft') {
    throw new Error(`${path}.contentOrigin must truthfully identify the AI-assisted draft`);
  }
  const dimensions = requireRecord(review.dimensions, `${path}.dimensions`);
  for (const key of REVIEW_KEYS) {
    if (dimensions[key] !== 'not-reviewed') {
      throw new Error(`${path}.dimensions.${key} must remain 'not-reviewed' until human review`);
    }
  }
}

function validateChallenge(value: unknown, path: string): void {
  const challenge = requireRecord(value, path);
  for (const key of CHALLENGE_KEYS) {
    requireOneOf(challenge, key, CHALLENGE_BANDS, path, 'a known challenge band');
  }
}

function validateDepth(value: unknown, path: string): void {
  const depth = requireRecord(value, path);
  const min = requireOneOf(depth, 'min', DEPTH_SET, path, 'a known Topic Depth');
  const max = requireOneOf(depth, 'max', DEPTH_SET, path, 'a known Topic Depth');
  if (DEPTHS.indexOf(min) > DEPTHS.indexOf(max)) {
    throw new Error(`${path}.min must not exceed depth.max`);
  }
}

function validateEvidence(value: unknown, path: string): void {
  const evidence = requireRecord(value, path);
  const dimensions = requireStringRefs(evidence.dimensions, `${path}.dimensions`);
  for (const [index, dimension] of dimensions.entries()) {
    if (!EVIDENCE_DIMENSIONS.has(dimension)) {
      throw new Error(`${path}.dimensions[${index}] must be a known evidence dimension`);
    }
  }
  requireString(evidence, 'decisiveMomentJa', path);
  requireString(evidence, 'explanationJa', path);
  requireString(evidence, 'nextMoveJa', path);
}

function validateSourceRefs(value: unknown, path: string): Map<string, string> {
  const sourceIds = new Set<string>();
  const sourceIndex = new Map<string, string>();
  for (const [index, sourceValue] of requireNonEmptyArray(value, path).entries()) {
    const sourcePath = `${path}[${index}]`;
    const source = requireRecord(sourceValue, sourcePath);
    const sourceId = requireUniqueId(source, sourcePath, sourceIds, 'source');
    const sourceKind = requireOneOf(
      source,
      'kind',
      SOURCE_KINDS,
      sourcePath,
      'a known source kind',
    );
    sourceIndex.set(sourceId, sourceKind);
    requireString(source, 'title', sourcePath);
    requireString(source, 'publisher', sourcePath);
    const url = requireString(source, 'url', sourcePath);
    if (!URL.canParse(url) || !url.startsWith('https://')) {
      throw new Error(`${sourcePath}.url must be an HTTPS URL`);
    }
    requireIsoDate(source, 'retrievedAt', sourcePath);
    requireString(source, 'supports', sourcePath);
    const frozenSource = FROZEN_OFFICIAL_SOURCES.get(sourceId);
    if (frozenSource) {
      for (const [key, expectedValue] of Object.entries(frozenSource)) {
        if (source[key] !== expectedValue) {
          throw new Error(
            `${path} entry '${sourceId}' must match the frozen official source metadata`,
          );
        }
      }
    }
    const rights = requireRecord(source.rights, `${sourcePath}.rights`);
    if (rights.allowedUse !== 'reference-only' || rights.copiedText !== false) {
      throw new Error(`${sourcePath}.rights must remain reference-only with copiedText=false`);
    }
  }
  return sourceIndex;
}

function requireSourceRefsResolve(
  value: unknown,
  path: string,
  sourceIndex: ReadonlyMap<string, string>,
): string[] {
  const refs = requireStringRefs(value, path);
  for (const [index, ref] of refs.entries()) {
    if (!sourceIndex.has(ref)) {
      throw new Error(`${path}[${index}] references unknown source '${ref}'`);
    }
  }
  return refs;
}

function validateSeasonal(
  value: unknown,
  path: string,
  sourceIndex: ReadonlyMap<string, string>,
): void {
  const seasonal = requireRecord(value, path);
  const definitionId = requireString(seasonal, 'definitionId', path);
  if (definitionId !== FROZEN_SEASONAL_DEFINITION_ID) {
    throw new Error(`${path}.definitionId must remain '${FROZEN_SEASONAL_DEFINITION_ID}'`);
  }
  const occurrencePath = `${path}.occurrence`;
  const occurrence = requireRecord(seasonal.occurrence, occurrencePath);
  const occurrenceYear = occurrence.year;
  if (occurrenceYear !== 2026) throw new Error(`${occurrencePath}.year must be 2026`);
  const startDate = requireIsoDate(occurrence, 'startDate', occurrencePath);
  const endDate = requireIsoDate(occurrence, 'endDate', occurrencePath);
  const visibleFrom = requireIsoDate(occurrence, 'visibleFrom', occurrencePath);
  const visibleUntil = requireIsoDate(occurrence, 'visibleUntil', occurrencePath);
  if (
    !startDate.startsWith(`${occurrenceYear}-`) ||
    !endDate.startsWith(`${occurrenceYear}-`)
  ) {
    throw new Error(`${occurrencePath} startDate and endDate must match occurrence.year`);
  }
  if (startDate !== '2026-09-25' || endDate !== '2026-09-25') {
    throw new Error(`${occurrencePath} startDate and endDate must remain '2026-09-25'`);
  }
  if (startDate > endDate) throw new Error(`${occurrencePath}.startDate must not exceed endDate`);
  if (visibleFrom > startDate || visibleUntil < endDate) {
    throw new Error(`${occurrencePath} visibility must contain the occurrence`);
  }
  if (occurrence.eventTimeZone !== 'Asia/Taipei') {
    throw new Error(`${occurrencePath}.eventTimeZone must be 'Asia/Taipei'`);
  }
  if (occurrence.displayTimeZone !== 'Asia/Tokyo') {
    throw new Error(`${occurrencePath}.displayTimeZone must be 'Asia/Tokyo'`);
  }
  if (occurrence.phase !== 'anticipation' || occurrence.dateStatus !== 'verified') {
    throw new Error(`${occurrencePath} must be a verified anticipation occurrence`);
  }
  if (visibleUntil > endDate) {
    throw new Error(`${occurrencePath} anticipation visibility must end with the occurrence`);
  }
  const occurrenceSourceRefs = requireSourceRefsResolve(
    occurrence.sourceRefIds,
    `${occurrencePath}.sourceRefIds`,
    sourceIndex,
  );
  if (!occurrenceSourceRefs.some((sourceRef) => sourceIndex.get(sourceRef) === 'official-date')) {
    throw new Error(`${occurrencePath}.sourceRefIds must include an official-date source`);
  }
  if (!occurrenceSourceRefs.includes(FROZEN_DGPA_2026_DATE_SOURCE.id)) {
    throw new Error(
      `${occurrencePath}.sourceRefIds must include the frozen '${FROZEN_DGPA_2026_DATE_SOURCE.id}' source`,
    );
  }
  const claimIds = new Set<string>();
  const claims = requireNonEmptyArray(
    seasonal.claims,
    `${path}.claims`,
  ).map((claimValue, claimIndex) => {
    const claimPath = `${path}.claims[${claimIndex}]`;
    const claim = requireRecord(claimValue, claimPath);
    const claimId = requireUniqueId(claim, claimPath, claimIds, 'seasonal claim');
    return { claim, claimId, claimPath };
  });
  if (
    claimIds.size !== FROZEN_SEASONAL_CLAIM_SOURCE_IDS.size ||
    [...FROZEN_SEASONAL_CLAIM_SOURCE_IDS.keys()].some((claimId) => !claimIds.has(claimId))
  ) {
    throw new Error(`${path}.claims must contain the exact frozen claim ID set`);
  }
  for (const { claim, claimId, claimPath } of claims) {
    requireString(claim, 'claimJa', claimPath);
    requireString(claim, 'scopeNoteJa', claimPath);
    const claimSourceRefs = requireSourceRefsResolve(
      claim.sourceRefIds,
      `${claimPath}.sourceRefIds`,
      sourceIndex,
    );
    if (
      !claimSourceRefs.some((sourceRef) =>
        OFFICIAL_FACTUAL_SOURCE_KINDS.has(sourceIndex.get(sourceRef) ?? ''))
    ) {
      throw new Error(`${claimPath}.sourceRefIds must include an official factual source`);
    }
    const expectedSourceId = FROZEN_SEASONAL_CLAIM_SOURCE_IDS.get(claimId);
    if (expectedSourceId === undefined || !claimSourceRefs.includes(expectedSourceId)) {
      throw new Error(
        `${claimPath}.sourceRefIds must include the frozen '${expectedSourceId}' source`,
      );
    }
  }
}

function assertAllBranchesClose(
  beatId: string,
  beats: Map<string, Record<string, unknown>>,
  visiting: Set<string>,
  visited: Set<string>,
  encounterPath: string,
): void {
  if (visited.has(beatId)) return;
  if (visiting.has(beatId)) throw new Error(`${encounterPath}.beats contains a cycle at '${beatId}'`);
  const beat = beats.get(beatId);
  if (!beat) throw new Error(`${encounterPath} references unknown Beat '${beatId}'`);
  visiting.add(beatId);
  for (const strategyValue of requireArray(beat.strategies, `${encounterPath}.${beatId}.strategies`)) {
    const strategy = requireRecord(strategyValue, `${encounterPath}.${beatId}.strategy`);
    const branch = requireRecord(strategy.branch, `${encounterPath}.${beatId}.strategy.branch`);
    if (branch.kind === 'beat') {
      assertAllBranchesClose(String(branch.beatId), beats, visiting, visited, encounterPath);
    }
  }
  visiting.delete(beatId);
  visited.add(beatId);
}

function validateStart(
  value: unknown,
  path: string,
  beats: Map<string, Record<string, unknown>>,
): { beatId: string } {
  const start = requireRecord(value, path);
  const beatId = requireString(start, 'beatId', path);
  if ('cueId' in start) {
    throw new Error(`${path}.cueId is not valid in the Beat-only graph`);
  }
  const beat = beats.get(beatId);
  if (!beat) throw new Error(`${path} references unknown Beat '${beatId}'`);
  if (beat.kind !== 'conversation') {
    throw new Error(`${path} must target a conversation Beat`);
  }
  return { beatId };
}

export function validateSmallTalkEncounterDocument(input: unknown): SmallTalkEncounterDocument {
  const document = requireRecord(input, 'document');
  if (document.schemaVersion !== 1) throw new Error('document.schemaVersion must be 1');
  const families = requireArray(document.families, 'families');
  if (families.length !== 2) throw new Error('families must contain exactly two Encounter families');

  const familyIds = new Set<string>();
  const encounterIds = new Set<string>();
  let repairBranches = 0;

  for (const [familyIndex, familyValue] of families.entries()) {
    const familyPath = `families[${familyIndex}]`;
    const family = requireRecord(familyValue, familyPath);
    const familyId = requireUniqueId(family, familyPath, familyIds, 'family');
    if (familyId !== EXPECTED_FAMILY_IDS[familyIndex]) {
      throw new Error(`${familyPath}.id must be '${EXPECTED_FAMILY_IDS[familyIndex]}'`);
    }
    const expectedKind = familyIndex === 0 ? 'evergreen-baseline' : 'seasonal-transfer';
    if (family.kind !== expectedKind) throw new Error(`${familyPath}.kind must be '${expectedKind}'`);
    requireString(family, 'titleJa', familyPath);
    const sourceIndex = validateSourceRefs(family.sourceRefs, `${familyPath}.sourceRefs`);
    validateReview(family.review, `${familyPath}.review`);
    let familyStallBranches = 0;
    if (expectedKind === 'seasonal-transfer') {
      validateSeasonal(family.seasonal, `${familyPath}.seasonal`, sourceIndex);
    } else if (family.seasonal !== undefined) {
      throw new Error(`${familyPath}.seasonal is only valid for the seasonal-transfer family`);
    }

    const encounters = requireNonEmptyArray(family.encounters, `${familyPath}.encounters`);
    const expectedScales = familyIndex === 0 ? ['micro', 'medium'] : ['medium'];
    if (
      encounters.length !== expectedScales.length ||
      encounters.some(
        (value, index) =>
          requireRecord(value, `${familyPath}.encounters[${index}]`).scale !== expectedScales[index],
      )
    ) {
      throw new Error(`${familyPath}.encounters has the wrong Micro/Medium fixture set`);
    }

    for (const [encounterIndex, encounterValue] of encounters.entries()) {
      const encounterPath = `${familyPath}.encounters[${encounterIndex}]`;
      const encounter = requireRecord(encounterValue, encounterPath);
      const encounterId = requireUniqueId(encounter, encounterPath, encounterIds, 'encounter');
      if (encounterId !== EXPECTED_ENCOUNTER_IDS[familyIndex][encounterIndex]) {
        throw new Error(
          `${encounterPath}.id must be '${EXPECTED_ENCOUNTER_IDS[familyIndex][encounterIndex]}'`,
        );
      }
      if (encounter.capability !== 'KEEP_GOING') {
        throw new Error(`${encounterPath}.capability must be 'KEEP_GOING'`);
      }
      requireString(encounter, 'missionJa', encounterPath);
      requireString(encounter, 'premiseJa', encounterPath);
      requireString(encounter, 'settingJa', encounterPath);
      const targetPattern = validateMovePattern(
        encounter.targetMovePattern,
        `${encounterPath}.targetMovePattern`,
      );
      if (targetPattern.join(',') !== 'REACT,ADD,INVITE') {
        throw new Error(`${encounterPath}.targetMovePattern must be REACT -> ADD -> INVITE`);
      }
      validateChallenge(encounter.challenge, `${encounterPath}.challenge`);
      validateDepth(encounter.depth, `${encounterPath}.depth`);
      requireOneOf(
        encounter,
        'sensitivity',
        new Set(['low', 'contextual']),
        encounterPath,
        'a known sensitivity',
      );
      const participants = requireArray(encounter.participants, `${encounterPath}.participants`);
      if (
        participants.length !== 2 ||
        requireRecord(participants[0], `${encounterPath}.participants[0]`).role !== 'learner' ||
        requireRecord(participants[1], `${encounterPath}.participants[1]`).role !== 'partner'
      ) {
        throw new Error(`${encounterPath}.participants must contain learner then partner`);
      }
      for (const [participantIndex, participantValue] of participants.entries()) {
        const participantPath = `${encounterPath}.participants[${participantIndex}]`;
        const participant = requireRecord(participantValue, participantPath);
        requireString(participant, 'id', participantPath);
        requireString(participant, 'labelJa', participantPath);
      }
      const relationship = requireRecord(encounter.relationship, `${encounterPath}.relationship`);
      if (relationship.familiarity !== 'acquaintance' || relationship.power !== 'peer') {
        throw new Error(`${encounterPath}.relationship must remain acquaintance peers`);
      }

      const beats = new Map<string, Record<string, unknown>>();
      const beatValues = requireNonEmptyArray(encounter.beats, `${encounterPath}.beats`);
      for (const [beatIndex, beatValue] of beatValues.entries()) {
        const beatPath = `${encounterPath}.beats[${beatIndex}]`;
        const beat = requireRecord(beatValue, beatPath);
        const beatId = requireString(beat, 'id', beatPath);
        if (beats.has(beatId)) throw new Error(`${beatPath}.id duplicates Beat '${beatId}'`);
        beats.set(beatId, beat);
      }

      const acceptableCountsByBeat = new Map<string, number>();
      const qualifyingAcceptableCountsByBeat = new Map<string, number>();
      for (const [beatIndex, beatValue] of beatValues.entries()) {
        const beatPath = `${encounterPath}.beats[${beatIndex}]`;
        const beat = requireRecord(beatValue, beatPath);
        if (beat.kind !== 'conversation' && beat.kind !== 'repair-return') {
          throw new Error(`${beatPath}.kind must be a known Beat kind`);
        }
        requireString(beat, 'opportunityJa', beatPath);
        const beatTargetPattern = validateMovePattern(
          beat.targetMovePattern,
          `${beatPath}.targetMovePattern`,
        );
        if ('partnerCues' in beat) {
          throw new Error(`${beatPath}.partnerCues is not valid for an atomic v0 Beat`);
        }
        const cuePath = `${beatPath}.partnerCue`;
        const cue = requireRecord(beat.partnerCue, cuePath);
        requireString(cue, 'id', cuePath);
        requireOneOf(
          cue,
          'stance',
          new Set(['cooperative', 'brief', 'misunderstanding', 'repair-support']),
          cuePath,
          'a known stance',
        );
        validateLocalizedText(cue.text, `${cuePath}.text`);
        const strategies = requireNonEmptyArray(beat.strategies, `${beatPath}.strategies`);
        const strategyIds = new Set<string>();
        let acceptableCount = 0;
        let qualifyingAcceptableCount = 0;
        for (const [strategyIndex, strategyValue] of strategies.entries()) {
          const strategyPath = `${beatPath}.strategies[${strategyIndex}]`;
          const strategy = requireRecord(strategyValue, strategyPath);
          requireUniqueId(strategy, strategyPath, strategyIds, 'strategy');
          requireString(strategy, 'labelJa', strategyPath);
          const fit = requireOneOf(
            strategy,
            'fit',
            new Set(['acceptable', 'stall-prone']),
            strategyPath,
            'a known fit',
          );
          const movePattern = validateMovePattern(
            strategy.movePattern,
            `${strategyPath}.movePattern`,
          );
          if (fit === 'acceptable') acceptableCount += 1;
          if (
            fit === 'acceptable' &&
            containsMovePatternInOrder(movePattern, beatTargetPattern) &&
            containsMovePatternInOrder(movePattern, targetPattern)
          ) {
            qualifyingAcceptableCount += 1;
          }
          for (const [realizationIndex, realization] of requireNonEmptyArray(
            strategy.realizations,
            `${strategyPath}.realizations`,
          ).entries()) {
            validateLocalizedText(realization, `${strategyPath}.realizations[${realizationIndex}]`);
          }
          const branchPath = `${strategyPath}.branch`;
          const branch = requireRecord(strategy.branch, branchPath);
          const outcome = requireOneOf(
            branch,
            'outcome',
            OUTCOMES,
            branchPath,
            'a known outcome',
          );
          if (outcome === 'STALL') familyStallBranches += 1;
          if (fit === 'stall-prone' && outcome !== 'STALL') {
            throw new Error(`${strategyPath}.branch.outcome must be STALL when fit is stall-prone`);
          }
          if (fit === 'acceptable' && outcome === 'STALL') {
            throw new Error(`${strategyPath}.branch.outcome must not be STALL when fit is acceptable`);
          }
          if (movePattern.includes('REPAIR') && outcome !== 'REPAIR') {
            throw new Error(
              `${strategyPath}.branch.outcome must be REPAIR when movePattern includes REPAIR`,
            );
          }
          if (outcome === 'REPAIR') {
            repairBranches += 1;
            if (!movePattern.includes('REPAIR')) {
              throw new Error(`${strategyPath}.movePattern must include REPAIR for a REPAIR outcome`);
            }
          }
          if (branch.kind === 'beat') {
            if ('partnerReply' in branch) {
              throw new Error(`${branchPath}.partnerReply is not valid when kind is beat`);
            }
            if ('cueId' in branch) {
              throw new Error(`${branchPath}.cueId is not valid in the Beat-only graph`);
            }
            const targetBeatId = requireString(branch, 'beatId', branchPath);
            const targetBeat = beats.get(targetBeatId);
            if (!targetBeat) throw new Error(`${branchPath} references unknown Beat '${targetBeatId}'`);
            if (outcome === 'REPAIR' && targetBeat.kind !== 'repair-return') {
              throw new Error(`${branchPath} REPAIR must target a repair-return Beat`);
            }
            if (targetBeat.kind === 'repair-return' && outcome !== 'REPAIR') {
              throw new Error(`${branchPath} repair-return Beat must be entered by a REPAIR outcome`);
            }
            if (outcome === 'CLOSE' || outcome === 'STALL') {
              throw new Error(`${branchPath} ${outcome} must be terminal`);
            }
          } else if (branch.kind === 'terminal') {
            if ('beatId' in branch) {
              throw new Error(`${branchPath}.beatId is not valid when kind is terminal`);
            }
            if (outcome === 'REPAIR') throw new Error(`${branchPath} REPAIR must target a Beat`);
            validateLocalizedText(branch.partnerReply, `${branchPath}.partnerReply`);
          } else {
            throw new Error(`${branchPath}.kind must be 'beat' or 'terminal'`);
          }
          validateEvidence(strategy.evidence, `${strategyPath}.evidence`);
        }
        const validatedBeatId = requireString(beat, 'id', beatPath);
        acceptableCountsByBeat.set(validatedBeatId, acceptableCount);
        qualifyingAcceptableCountsByBeat.set(validatedBeatId, qualifyingAcceptableCount);
      }

      const start = validateStart(encounter.start, `${encounterPath}.start`, beats);
      const replay = requireRecord(encounter.replay, `${encounterPath}.replay`);
      requireString(replay, 'modifierJa', `${encounterPath}.replay`);
      const replayStart = validateStart(replay.start, `${encounterPath}.replay.start`, beats);
      if (replayStart.beatId === start.beatId) {
        throw new Error(`${encounterPath}.replay.start must differ from start`);
      }
      const expectedRoots = EXPECTED_ROOT_BEAT_IDS[familyIndex]?.[encounterIndex];
      if (
        expectedRoots === undefined ||
        start.beatId !== expectedRoots.start ||
        replayStart.beatId !== expectedRoots.replay
      ) {
        throw new Error(`${encounterPath}.start and replay.start must match the frozen v0 root Beats`);
      }
      if (
        acceptableCountsByBeat.get(start.beatId) !==
        qualifyingAcceptableCountsByBeat.get(start.beatId)
      ) {
        throw new Error(
          `${encounterPath}.start Beat acceptable strategies must all realize their target Moves`,
        );
      }
      if (
        acceptableCountsByBeat.get(replayStart.beatId) !==
        qualifyingAcceptableCountsByBeat.get(replayStart.beatId)
      ) {
        throw new Error(
          `${encounterPath}.replay.start Beat acceptable strategies must all realize their target Moves`,
        );
      }
      if ((qualifyingAcceptableCountsByBeat.get(start.beatId) ?? 0) < 2) {
        throw new Error(
          `${encounterPath}.start Beat must expose at least two acceptable strategies that realize its target Moves`,
        );
      }
      if ((qualifyingAcceptableCountsByBeat.get(replayStart.beatId) ?? 0) < 2) {
        throw new Error(
          `${encounterPath}.replay.start Beat must expose at least two acceptable strategies that realize its target Moves`,
        );
      }

      const passportPath = `${encounterPath}.passportProjection`;
      const passport = requireRecord(encounter.passportProjection, passportPath);
      requireString(passport, 'situationJa', passportPath);
      requireString(passport, 'capabilityJa', passportPath);
      requireString(passport, 'limitationJa', passportPath);
      if (passport.evidenceStage !== 'supported') {
        throw new Error(`${passportPath}.evidenceStage must be 'supported'`);
      }

      const visited = new Set<string>();
      assertAllBranchesClose(start.beatId, beats, new Set(), visited, encounterPath);
      assertAllBranchesClose(replayStart.beatId, beats, new Set(), visited, encounterPath);
      if (visited.size !== beats.size) {
        const unreachable = [...beats.keys()].find((beatId) => !visited.has(beatId));
        throw new Error(`${encounterPath}.beats contains unreachable Beat '${unreachable}'`);
      }
    }
    if (familyIndex === 0 && familyStallBranches === 0) {
      throw new Error('evergreen-baseline family must contain at least one STALL branch');
    }
  }

  if (repairBranches !== 1) {
    throw new Error(`document must contain exactly one REPAIR branch; found ${repairBranches}`);
  }
  return input as SmallTalkEncounterDocument;
}

export function loadSmallTalkEncounterDocument(): SmallTalkEncounterDocument {
  return validateSmallTalkEncounterDocument(encounterData);
}
