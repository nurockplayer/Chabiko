import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadSmallTalkEncounterDocument,
  validateSmallTalkEncounterDocument,
} from '../src/content/loadSmallTalkEncounters';
import type { SmallTalkEncounterDocument } from '../src/types/smallTalkEncounter';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function cloneDocument(): Mutable<SmallTalkEncounterDocument> {
  return structuredClone(loadSmallTalkEncounterDocument()) as Mutable<SmallTalkEncounterDocument>;
}

function cloneRawDocument(): Mutable<SmallTalkEncounterDocument> {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'data/small-talk/encounters.json'), 'utf8'),
  ) as Mutable<SmallTalkEncounterDocument>;
}

describe('Small Talk Lab authored encounter contract', () => {
  it('loads exactly the baseline and seasonal transfer families', () => {
    const document = loadSmallTalkEncounterDocument();

    expect(document.schemaVersion).toBe(1);
    expect(document.families.map((family) => family.id)).toEqual([
      'weekend-baseline',
      'mid-autumn-2026-transfer',
    ]);
    expect(document.families[0].encounters.map((encounter) => encounter.scale)).toEqual([
      'micro',
      'medium',
    ]);
    expect(document.families[1].encounters.map((encounter) => encounter.scale)).toEqual([
      'medium',
    ]);
    expect(document.families[1].seasonal?.occurrence).toMatchObject({
      startDate: '2026-09-25',
      endDate: '2026-09-25',
      eventTimeZone: 'Asia/Taipei',
      displayTimeZone: 'Asia/Tokyo',
      sourceRefIds: ['dgpa-2026-calendar'],
    });
    expect(document.families[1].encounters[0].beats[0].partnerCue.text).toMatchObject({
      traditional: '我還沒決定中秋節要不要回家。',
      pinyin: 'Wǒ hái méi juédìng Zhōngqiū Jié yào bú yào huí jiā.',
      japanese: '中秋節に実家へ帰るか、まだ決めていないんだ。',
    });
  });

  it('freezes strategy variation, one repair opportunity, and truthful draft review state', () => {
    const document = loadSmallTalkEncounterDocument();
    const encounters = document.families.flatMap((family) => family.encounters);
    const strategies = encounters.flatMap((encounter) =>
      encounter.beats.flatMap((beat) => beat.strategies),
    );

    expect(encounters.every((encounter) => encounter.capability === 'KEEP_GOING')).toBe(true);
    expect(
      encounters.every((encounter) =>
        encounter.targetMovePattern.join(' -> ') === 'REACT -> ADD -> INVITE'),
    ).toBe(true);
    expect(
      encounters.every((encounter) =>
        encounter.beats.some(
          (beat) => beat.strategies.filter((strategy) => strategy.fit === 'acceptable').length >= 2,
        ),
      ),
    ).toBe(true);
    expect(strategies.filter((strategy) => strategy.branch.outcome === 'REPAIR')).toHaveLength(1);
    expect(strategies.some((strategy) => strategy.branch.outcome === 'STALL')).toBe(true);
    expect(document.families.every((family) => family.review.reviewStatus === 'draft')).toBe(true);
    expect(
      document.families.every((family) =>
        Object.values(family.review.dimensions).every((status) => status === 'not-reviewed'),
      ),
    ).toBe(true);
  });

  it('models each v0 Beat as one cue-specific atomic opportunity', () => {
    const document = loadSmallTalkEncounterDocument();
    const encounters = document.families.flatMap((family) => family.encounters);

    for (const encounter of encounters) {
      expect(encounter.replay.start.beatId).not.toBe(encounter.start.beatId);
      expect(encounter.beats.every((beat) => beat.partnerCue.id.length > 0)).toBe(true);
      expect(encounter.start).not.toHaveProperty('cueId');
      expect(encounter.replay.start).not.toHaveProperty('cueId');
      expect(
        encounter.beats.every((beat) =>
          beat.strategies.every((strategy) =>
            strategy.branch.kind !== 'beat' || !('cueId' in strategy.branch),
          ),
        ),
      ).toBe(true);
    }
  });

  it('fails closed on an unknown Move identifier', () => {
    const invalid = cloneDocument();
    (invalid.families[0].encounters[0].beats[0].targetMovePattern as string[])[0] = 'PRAISE';

    expect(() => validateSmallTalkEncounterDocument(invalid)).toThrow(
      "families[0].encounters[0].beats[0].targetMovePattern[0] must be a known Move",
    );
  });

  it('fails closed on unknown outcomes and broken Beat references', () => {
    const unknownOutcome = cloneDocument();
    const outcomeBranch = unknownOutcome.families[0].encounters[0].beats[0].strategies[0].branch;
    (outcomeBranch as { outcome: string }).outcome = 'PASS';
    expect(() => validateSmallTalkEncounterDocument(unknownOutcome)).toThrow(
      'branch.outcome must be a known outcome',
    );

    const brokenBeat = cloneDocument();
    const beatBranch = brokenBeat.families[0].encounters[1].beats[0].strategies[0].branch;
    if (beatBranch.kind !== 'beat') throw new Error('test fixture must use a Beat branch');
    beatBranch.beatId = 'missing-beat';
    expect(() => validateSmallTalkEncounterDocument(brokenBeat)).toThrow(
      "references unknown Beat 'missing-beat'",
    );
  });

  it('rejects the legacy plural cue and cue-addressed graph shape', () => {
    const pluralCue = cloneRawDocument() as unknown as {
      families: Array<{ encounters: Array<{ beats: Array<Record<string, unknown>> }> }>;
    };
    const pluralBeat = pluralCue.families[0].encounters[0].beats[0];
    pluralBeat.partnerCues = [pluralBeat.partnerCue];
    delete pluralBeat.partnerCue;
    expect(() => validateSmallTalkEncounterDocument(pluralCue)).toThrow(
      '.partnerCues is not valid for an atomic v0 Beat',
    );

    const missingCue = cloneRawDocument() as unknown as {
      families: Array<{ encounters: Array<{ beats: Array<Record<string, unknown>> }> }>;
    };
    delete missingCue.families[0].encounters[0].beats[0].partnerCue;
    expect(() => validateSmallTalkEncounterDocument(missingCue)).toThrow(
      '.partnerCue must be an object',
    );

    const cueAddressedRoot = cloneRawDocument() as unknown as {
      families: Array<{ encounters: Array<{ start: Record<string, unknown> }> }>;
    };
    cueAddressedRoot.families[0].encounters[0].start.cueId = 'legacy-cue';
    expect(() => validateSmallTalkEncounterDocument(cueAddressedRoot)).toThrow(
      '.start.cueId is not valid in the Beat-only graph',
    );

    const cueAddressedBranch = cloneRawDocument() as unknown as {
      families: Array<{
        encounters: Array<{
          beats: Array<{ strategies: Array<{ branch: Record<string, unknown> }> }>;
        }>;
      }>;
    };
    cueAddressedBranch.families[0].encounters[1].beats[0].strategies[0].branch.cueId =
      'legacy-cue';
    expect(() => validateSmallTalkEncounterDocument(cueAddressedBranch)).toThrow(
      '.branch.cueId is not valid in the Beat-only graph',
    );
  });

  it('fails closed on missing learner language, provenance, review, or invalid depth', () => {
    const missingJapanese = cloneDocument();
    missingJapanese.families[0].encounters[0].beats[0].partnerCue.text.japanese = '';
    expect(() => validateSmallTalkEncounterDocument(missingJapanese)).toThrow(
      '.text.japanese must be a non-empty string',
    );

    const missingProvenance = cloneDocument();
    delete (missingProvenance.families[0].encounters[0].beats[0].partnerCue.text as Partial<
      Mutable<SmallTalkEncounterDocument['families'][number]['encounters'][number]['beats'][number]['partnerCue']['text']>
    >).provenance;
    expect(() => validateSmallTalkEncounterDocument(missingProvenance)).toThrow(
      '.text.provenance must be an object',
    );

    const unsupportedProvenance = cloneDocument();
    unsupportedProvenance.families[0].encounters[0].beats[0].partnerCue.text.provenance.traditional =
      'authored';
    expect(() => validateSmallTalkEncounterDocument(unsupportedProvenance)).toThrow(
      ".text.provenance.traditional must remain 'generated' until human review",
    );

    const missingReview = cloneDocument();
    delete (missingReview.families[0] as Partial<Mutable<SmallTalkEncounterDocument['families'][number]>>)
      .review;
    expect(() => validateSmallTalkEncounterDocument(missingReview)).toThrow(
      'families[0].review must be an object',
    );

    const unsupportedReview = cloneDocument();
    unsupportedReview.families[0].review.dimensions.japanese = 'accepted';
    expect(() => validateSmallTalkEncounterDocument(unsupportedReview)).toThrow(
      ".review.dimensions.japanese must remain 'not-reviewed' until human review",
    );

    const invertedDepth = cloneDocument();
    invertedDepth.families[0].encounters[0].depth = { min: 'D5', max: 'D1' };
    expect(() => validateSmallTalkEncounterDocument(invertedDepth)).toThrow(
      'depth.min must not exceed depth.max',
    );
  });

  it('fails closed when a seasonal occurrence lacks dated source metadata', () => {
    const missingDate = cloneDocument();
    const seasonal = missingDate.families[1].seasonal;
    if (!seasonal) throw new Error('test fixture must be seasonal');
    seasonal.occurrence.startDate = '';
    expect(() => validateSmallTalkEncounterDocument(missingDate)).toThrow(
      'seasonal.occurrence.startDate must be an ISO date',
    );

    const unknownSource = cloneDocument();
    const occurrence = unknownSource.families[1].seasonal?.occurrence;
    if (!occurrence) throw new Error('test fixture must be seasonal');
    occurrence.sourceRefIds = ['missing-source'];
    expect(() => validateSmallTalkEncounterDocument(unknownSource)).toThrow(
      "seasonal.occurrence.sourceRefIds[0] references unknown source 'missing-source'",
    );

    const impossibleDate = cloneDocument();
    const impossibleOccurrence = impossibleDate.families[1].seasonal?.occurrence;
    if (!impossibleOccurrence) throw new Error('test fixture must be seasonal');
    impossibleOccurrence.startDate = '2026-02-30';
    expect(() => validateSmallTalkEncounterDocument(impossibleDate)).toThrow(
      'seasonal.occurrence.startDate must be an ISO date',
    );

    const nonOfficialDateSource = cloneDocument();
    const nonOfficialOccurrence = nonOfficialDateSource.families[1].seasonal?.occurrence;
    if (!nonOfficialOccurrence) throw new Error('test fixture must be seasonal');
    nonOfficialOccurrence.sourceRefIds = ['issue-459-seasonal-contract'];
    expect(() => validateSmallTalkEncounterDocument(nonOfficialDateSource)).toThrow(
      'seasonal.occurrence.sourceRefIds must include an official-date source',
    );

    const mismatchedOccurrenceYear = cloneDocument();
    const mismatchedOccurrence = mismatchedOccurrenceYear.families[1].seasonal?.occurrence;
    if (!mismatchedOccurrence) throw new Error('test fixture must be seasonal');
    mismatchedOccurrence.startDate = '2027-09-15';
    mismatchedOccurrence.endDate = '2027-09-15';
    mismatchedOccurrence.visibleFrom = '2027-08-16';
    mismatchedOccurrence.visibleUntil = '2027-09-15';
    expect(() => validateSmallTalkEncounterDocument(mismatchedOccurrenceYear)).toThrow(
      'seasonal.occurrence startDate and endDate must match occurrence.year',
    );

    const sameYearDateDrift = cloneDocument();
    const driftedOccurrence = sameYearDateDrift.families[1].seasonal?.occurrence;
    if (!driftedOccurrence) throw new Error('test fixture must be seasonal');
    driftedOccurrence.startDate = '2026-09-26';
    driftedOccurrence.endDate = '2026-09-26';
    driftedOccurrence.visibleUntil = '2026-09-26';
    expect(() => validateSmallTalkEncounterDocument(sameYearDateDrift)).toThrow(
      "seasonal.occurrence startDate and endDate must remain '2026-09-25'",
    );

    const claimWithoutFactualSource = cloneDocument();
    const seasonalClaim = claimWithoutFactualSource.families[1].seasonal?.claims[0];
    if (!seasonalClaim) throw new Error('test fixture must include a seasonal claim');
    seasonalClaim.sourceRefIds = ['issue-459-seasonal-contract'];
    expect(() => validateSmallTalkEncounterDocument(claimWithoutFactualSource)).toThrow(
      'seasonal.claims[0].sourceRefIds must include an official factual source',
    );

    const swappedClaimSources = cloneDocument();
    const swappedClaims = swappedClaimSources.families[1].seasonal?.claims;
    if (!swappedClaims) throw new Error('test fixture must include seasonal claims');
    swappedClaims[0].sourceRefIds = ['taiwan-tourism-traditional-festivals'];
    swappedClaims[1].sourceRefIds = ['dgpa-2026-calendar'];
    expect(() => validateSmallTalkEncounterDocument(swappedClaimSources)).toThrow(
      'seasonal.claims[0].sourceRefIds must include an official-date source',
    );
  });

  it('requires exactly one bounded repair and rejects cyclic branch graphs', () => {
    const noRepair = cloneDocument();
    const removedRepairStrategy = noRepair.families[1].encounters[0].beats[1].strategies[0];
    removedRepairStrategy.movePattern = ['INVITE'];
    removedRepairStrategy.branch = structuredClone(
      noRepair.families[1].encounters[0].beats[1].strategies[1].branch,
    );
    noRepair.families[1].encounters[0].beats.splice(2, 1);
    expect(() => validateSmallTalkEncounterDocument(noRepair)).toThrow(
      'document must contain exactly one REPAIR branch; found 0',
    );

    const repairWithoutMove = cloneDocument();
    const repairStrategy = repairWithoutMove.families[1].encounters[0].beats[1].strategies[0];
    repairStrategy.movePattern = ['INVITE'];
    expect(() => validateSmallTalkEncounterDocument(repairWithoutMove)).toThrow(
      'movePattern must include REPAIR for a REPAIR outcome',
    );

    const repairMoveWithoutOutcome = cloneDocument();
    repairMoveWithoutOutcome.families[0].encounters[0].beats[0].strategies[0].movePattern = [
      'REPAIR',
      'INVITE',
    ];
    expect(() => validateSmallTalkEncounterDocument(repairMoveWithoutOutcome)).toThrow(
      'branch.outcome must be REPAIR when movePattern includes REPAIR',
    );

    const nonRepairIntoRepairReturn = cloneDocument();
    const nonRepairBranch =
      nonRepairIntoRepairReturn.families[1].encounters[0].beats[0].strategies[0].branch;
    if (nonRepairBranch.kind !== 'beat') throw new Error('test fixture must use a Beat branch');
    nonRepairBranch.beatId = 'mid-autumn-repair-return';
    expect(() => validateSmallTalkEncounterDocument(nonRepairIntoRepairReturn)).toThrow(
      'repair-return Beat must be entered by a REPAIR outcome',
    );

    const cyclic = cloneDocument();
    cyclic.families[0].encounters[1].beats[1].strategies[0].branch = {
      kind: 'beat',
      outcome: 'CONTINUE',
      beatId: 'weekend-medium-opening',
    };
    expect(() => validateSmallTalkEncounterDocument(cyclic)).toThrow(
      "beats contains a cycle at 'weekend-medium-opening'",
    );
  });

  it('fails closed when strategy fit contradicts its deterministic outcome', () => {
    const acceptableStall = cloneDocument();
    acceptableStall.families[0].encounters[0].beats[0].strategies[0].branch.outcome = 'STALL';
    expect(() => validateSmallTalkEncounterDocument(acceptableStall)).toThrow(
      'branch.outcome must not be STALL when fit is acceptable',
    );

    const stallProneContinue = cloneDocument();
    stallProneContinue.families[0].encounters[0].beats[0].strategies[2].branch.outcome = 'CONTINUE';
    expect(() => validateSmallTalkEncounterDocument(stallProneContinue)).toThrow(
      'branch.outcome must be STALL when fit is stall-prone',
    );
  });

  it('requires the evergreen baseline to retain a deliberate STALL contrast', () => {
    const noBaselineStall = cloneDocument();
    for (const encounter of noBaselineStall.families[0].encounters) {
      for (const beat of encounter.beats) {
        for (const strategy of beat.strategies) {
          if (strategy.branch.outcome === 'STALL') {
            strategy.fit = 'acceptable';
            strategy.branch.outcome = 'CONTINUE';
          }
        }
      }
    }

    expect(() => validateSmallTalkEncounterDocument(noBaselineStall)).toThrow(
      'evergreen-baseline family must contain at least one STALL branch',
    );
  });

  it('requires replay to start from a distinct Beat', () => {
    const replayWithoutVariation = cloneDocument();
    const encounter = replayWithoutVariation.families[0].encounters[0];
    encounter.replay.start = { ...encounter.start };

    expect(() => validateSmallTalkEncounterDocument(replayWithoutVariation)).toThrow(
      'replay.start must differ from start',
    );
  });

  it('uses initial and replay starts as the authorized graph roots', () => {
    const replayRootOnly = cloneRawDocument();
    expect(() => validateSmallTalkEncounterDocument(replayRootOnly)).not.toThrow();

    const unreachable = cloneRawDocument();
    const encounter = unreachable.families[0].encounters[0];
    const orphan = structuredClone(encounter.beats[1]);
    orphan.id = 'weekend-micro-orphan';
    encounter.beats.push(orphan);

    expect(() => validateSmallTalkEncounterDocument(unreachable)).toThrow(
      "beats contains unreachable Beat 'weekend-micro-orphan'",
    );
  });

  it('rejects initial and replay roots that bypass REPAIR entry semantics', () => {
    const invalidInitialRoot = cloneRawDocument();
    const initialEncounter = invalidInitialRoot.families[1].encounters[0];
    initialEncounter.start = {
      beatId: 'mid-autumn-repair-return',
    };
    expect(() => validateSmallTalkEncounterDocument(invalidInitialRoot)).toThrow(
      'start must target a conversation Beat',
    );

    const invalidReplayRoot = cloneRawDocument();
    const replayEncounter = invalidReplayRoot.families[1].encounters[0];
    replayEncounter.replay.start = {
      beatId: 'mid-autumn-repair-return',
    };
    expect(() => validateSmallTalkEncounterDocument(invalidReplayRoot)).toThrow(
      'replay.start must target a conversation Beat',
    );
  });

  it('runs the canonical CLI against valid and invalid files without touching neighbours', () => {
    const valid = spawnSync(
      'node',
      ['scripts/validate-small-talk-encounters.ts', '--check', 'data/small-talk/encounters.json'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(valid.status, valid.stderr).toBe(0);
    expect(valid.stdout).toContain('Small Talk Encounter contract valid');

    const ownedDirectory = mkdtempSync(join(tmpdir(), 'chabiko-small-talk-'));
    try {
      const invalidPath = join(ownedDirectory, 'invalid.json');
      const neighbourPath = join(ownedDirectory, 'developer-owned.txt');
      const invalid = cloneDocument();
      (invalid.families[0].encounters[0].targetMovePattern as string[])[0] = 'PRAISE';
      writeFileSync(invalidPath, JSON.stringify(invalid), 'utf8');
      writeFileSync(neighbourPath, 'preserve', 'utf8');

      const result = spawnSync(
        'node',
        ['scripts/validate-small-talk-encounters.ts', '--check', invalidPath],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('targetMovePattern[0] must be a known Move');
      expect(readFileSync(neighbourPath, 'utf8')).toBe('preserve');
    } finally {
      rmSync(ownedDirectory, { recursive: true, force: true });
    }
  });
});
