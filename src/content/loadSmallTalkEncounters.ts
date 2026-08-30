import encounterData from '../../data/small-talk/encounters.json' with { type: 'json' };
import type {
  ContentProvenance,
  ConversationMove,
  ConversationOutcome,
  ReviewDimensionStatus,
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
const PROVENANCE = new Set<ContentProvenance>(['generated', 'authored', 'verified']);
const REVIEW_DIMENSIONS = new Set<ReviewDimensionStatus>([
  'not-reviewed', 'needs-changes', 'accepted',
]);
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
const EXPECTED_FAMILY_IDS = ['weekend-baseline', 'mid-autumn-2026-transfer'] as const;
const EXPECTED_ENCOUNTER_IDS = [
  ['weekend-micro', 'weekend-medium'],
  ['mid-autumn-2026-medium'],
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
  if (
    typeof value !== 'string' ||
    !ISO_DATE.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
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
    requireOneOf(provenance, key, PROVENANCE, `${path}.provenance`, 'known provenance');
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
    requireOneOf(dimensions, key, REVIEW_DIMENSIONS, `${path}.dimensions`, 'a known review status');
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

function validateSourceRefs(value: unknown, path: string): Set<string> {
  const sourceIds = new Set<string>();
  const sourceKinds = new Set([
    'product-authority', 'official-date', 'official-cultural-reference',
  ]);
  for (const [index, sourceValue] of requireNonEmptyArray(value, path).entries()) {
    const sourcePath = `${path}[${index}]`;
    const source = requireRecord(sourceValue, sourcePath);
    requireUniqueId(source, sourcePath, sourceIds, 'source');
    requireOneOf(source, 'kind', sourceKinds, sourcePath, 'a known source kind');
    requireString(source, 'title', sourcePath);
    requireString(source, 'publisher', sourcePath);
    const url = requireString(source, 'url', sourcePath);
    if (!URL.canParse(url) || !url.startsWith('https://')) {
      throw new Error(`${sourcePath}.url must be an HTTPS URL`);
    }
    requireIsoDate(source, 'retrievedAt', sourcePath);
    requireString(source, 'supports', sourcePath);
    const rights = requireRecord(source.rights, `${sourcePath}.rights`);
    if (rights.allowedUse !== 'reference-only' || rights.copiedText !== false) {
      throw new Error(`${sourcePath}.rights must remain reference-only with copiedText=false`);
    }
  }
  return sourceIds;
}

function requireSourceRefsResolve(value: unknown, path: string, sourceIds: Set<string>): void {
  for (const [index, ref] of requireStringRefs(value, path).entries()) {
    if (!sourceIds.has(ref)) {
      throw new Error(`${path}[${index}] references unknown source '${ref}'`);
    }
  }
}

function validateSeasonal(value: unknown, path: string, sourceIds: Set<string>): void {
  const seasonal = requireRecord(value, path);
  requireString(seasonal, 'definitionId', path);
  const occurrencePath = `${path}.occurrence`;
  const occurrence = requireRecord(seasonal.occurrence, occurrencePath);
  if (occurrence.year !== 2026) throw new Error(`${occurrencePath}.year must be 2026`);
  const startDate = requireIsoDate(occurrence, 'startDate', occurrencePath);
  const endDate = requireIsoDate(occurrence, 'endDate', occurrencePath);
  const visibleFrom = requireIsoDate(occurrence, 'visibleFrom', occurrencePath);
  const visibleUntil = requireIsoDate(occurrence, 'visibleUntil', occurrencePath);
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
  requireSourceRefsResolve(occurrence.sourceRefIds, `${occurrencePath}.sourceRefIds`, sourceIds);
  const claimIds = new Set<string>();
  for (const [claimIndex, claimValue] of requireNonEmptyArray(
    seasonal.claims,
    `${path}.claims`,
  ).entries()) {
    const claimPath = `${path}.claims[${claimIndex}]`;
    const claim = requireRecord(claimValue, claimPath);
    requireUniqueId(claim, claimPath, claimIds, 'seasonal claim');
    requireString(claim, 'claimJa', claimPath);
    requireString(claim, 'scopeNoteJa', claimPath);
    requireSourceRefsResolve(claim.sourceRefIds, `${claimPath}.sourceRefIds`, sourceIds);
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
): string {
  const start = requireRecord(value, path);
  const beatId = requireString(start, 'beatId', path);
  const cueId = requireString(start, 'cueId', path);
  const beat = beats.get(beatId);
  if (!beat) throw new Error(`${path} references unknown Beat '${beatId}'`);
  const cueExists = requireArray(beat.partnerCues, `${path}.partnerCues`).some(
    (cue) => requireRecord(cue, `${path}.cue`).id === cueId,
  );
  if (!cueExists) throw new Error(`${path} references unknown cue '${cueId}'`);
  return beatId;
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
    const sourceIds = validateSourceRefs(family.sourceRefs, `${familyPath}.sourceRefs`);
    validateReview(family.review, `${familyPath}.review`);
    if (expectedKind === 'seasonal-transfer') {
      validateSeasonal(family.seasonal, `${familyPath}.seasonal`, sourceIds);
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

      let encounterHasVariation = false;
      for (const [beatIndex, beatValue] of beatValues.entries()) {
        const beatPath = `${encounterPath}.beats[${beatIndex}]`;
        const beat = requireRecord(beatValue, beatPath);
        if (beat.kind !== 'conversation' && beat.kind !== 'repair-return') {
          throw new Error(`${beatPath}.kind must be a known Beat kind`);
        }
        requireString(beat, 'opportunityJa', beatPath);
        validateMovePattern(beat.targetMovePattern, `${beatPath}.targetMovePattern`);
        const cueIds = new Set<string>();
        for (const [cueIndex, cueValue] of requireNonEmptyArray(
          beat.partnerCues,
          `${beatPath}.partnerCues`,
        ).entries()) {
          const cuePath = `${beatPath}.partnerCues[${cueIndex}]`;
          const cue = requireRecord(cueValue, cuePath);
          requireUniqueId(cue, cuePath, cueIds, 'cue');
          requireOneOf(
            cue,
            'stance',
            new Set(['cooperative', 'brief', 'misunderstanding', 'repair-support']),
            cuePath,
            'a known stance',
          );
          validateLocalizedText(cue.text, `${cuePath}.text`);
        }
        const strategies = requireNonEmptyArray(beat.strategies, `${beatPath}.strategies`);
        const strategyIds = new Set<string>();
        let acceptableCount = 0;
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
          if (fit === 'acceptable') acceptableCount += 1;
          validateMovePattern(strategy.movePattern, `${strategyPath}.movePattern`);
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
          if (outcome === 'REPAIR') repairBranches += 1;
          if (branch.kind === 'beat') {
            const targetBeatId = requireString(branch, 'beatId', branchPath);
            const targetBeat = beats.get(targetBeatId);
            if (!targetBeat) throw new Error(`${branchPath} references unknown Beat '${targetBeatId}'`);
            const targetCueId = requireString(branch, 'cueId', branchPath);
            const targetCueExists = requireArray(
              targetBeat.partnerCues,
              `${encounterPath}.${targetBeatId}.partnerCues`,
            ).some(
              (cue) => requireRecord(cue, `${encounterPath}.${targetBeatId}.cue`).id === targetCueId,
            );
            if (!targetCueExists) throw new Error(`${branchPath} references unknown cue '${targetCueId}'`);
            if (outcome === 'REPAIR' && targetBeat.kind !== 'repair-return') {
              throw new Error(`${branchPath} REPAIR must target a repair-return Beat`);
            }
            if (outcome === 'CLOSE' || outcome === 'STALL') {
              throw new Error(`${branchPath} ${outcome} must be terminal`);
            }
          } else if (branch.kind === 'terminal') {
            if (outcome === 'REPAIR') throw new Error(`${branchPath} REPAIR must target a Beat`);
            validateLocalizedText(branch.partnerReply, `${branchPath}.partnerReply`);
          } else {
            throw new Error(`${branchPath}.kind must be 'beat' or 'terminal'`);
          }
          validateEvidence(strategy.evidence, `${strategyPath}.evidence`);
        }
        if (acceptableCount >= 2) encounterHasVariation = true;
      }
      if (!encounterHasVariation) {
        throw new Error(`${encounterPath} must expose at least two acceptable authored strategies`);
      }

      const startBeatId = validateStart(encounter.start, `${encounterPath}.start`, beats);
      const replay = requireRecord(encounter.replay, `${encounterPath}.replay`);
      requireString(replay, 'modifierJa', `${encounterPath}.replay`);
      validateStart(replay.start, `${encounterPath}.replay.start`, beats);

      const passportPath = `${encounterPath}.passportProjection`;
      const passport = requireRecord(encounter.passportProjection, passportPath);
      requireString(passport, 'situationJa', passportPath);
      requireString(passport, 'capabilityJa', passportPath);
      requireString(passport, 'limitationJa', passportPath);
      if (passport.evidenceStage !== 'supported') {
        throw new Error(`${passportPath}.evidenceStage must be 'supported'`);
      }

      const visited = new Set<string>();
      assertAllBranchesClose(startBeatId, beats, new Set(), visited, encounterPath);
      if (visited.size !== beats.size) {
        const unreachable = [...beats.keys()].find((beatId) => !visited.has(beatId));
        throw new Error(`${encounterPath}.beats contains unreachable Beat '${unreachable}'`);
      }
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
