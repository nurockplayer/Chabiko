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

  it('fails closed on an unknown Move identifier', () => {
    const invalid = cloneDocument();
    (invalid.families[0].encounters[0].beats[0].targetMovePattern as string[])[0] = 'PRAISE';

    expect(() => validateSmallTalkEncounterDocument(invalid)).toThrow(
      "families[0].encounters[0].beats[0].targetMovePattern[0] must be a known Move",
    );
  });

  it('fails closed on unknown outcomes and broken Beat or cue references', () => {
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

    const brokenCue = cloneDocument();
    const cueBranch = brokenCue.families[0].encounters[1].beats[0].strategies[0].branch;
    if (cueBranch.kind !== 'beat') throw new Error('test fixture must use a Beat branch');
    cueBranch.cueId = 'missing-cue';
    expect(() => validateSmallTalkEncounterDocument(brokenCue)).toThrow(
      "references unknown cue 'missing-cue'",
    );
  });

  it('fails closed on missing learner language, provenance, review, or invalid depth', () => {
    const missingJapanese = cloneDocument();
    missingJapanese.families[0].encounters[0].beats[0].partnerCues[0].text.japanese = '';
    expect(() => validateSmallTalkEncounterDocument(missingJapanese)).toThrow(
      '.text.japanese must be a non-empty string',
    );

    const missingProvenance = cloneDocument();
    delete (missingProvenance.families[0].encounters[0].beats[0].partnerCues[0].text as Partial<
      Mutable<SmallTalkEncounterDocument['families'][number]['encounters'][number]['beats'][number]['partnerCues'][number]['text']>
    >).provenance;
    expect(() => validateSmallTalkEncounterDocument(missingProvenance)).toThrow(
      '.text.provenance must be an object',
    );

    const missingReview = cloneDocument();
    delete (missingReview.families[0] as Partial<Mutable<SmallTalkEncounterDocument['families'][number]>>)
      .review;
    expect(() => validateSmallTalkEncounterDocument(missingReview)).toThrow(
      'families[0].review must be an object',
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
  });

  it('requires exactly one bounded repair and rejects cyclic branch graphs', () => {
    const noRepair = cloneDocument();
    const repair = noRepair.families[1].encounters[0].beats[1].strategies[0].branch;
    repair.outcome = 'CONTINUE';
    expect(() => validateSmallTalkEncounterDocument(noRepair)).toThrow(
      'document must contain exactly one REPAIR branch; found 0',
    );

    const repairWithoutMove = cloneDocument();
    const repairStrategy = repairWithoutMove.families[1].encounters[0].beats[1].strategies[0];
    repairStrategy.movePattern = ['INVITE'];
    expect(() => validateSmallTalkEncounterDocument(repairWithoutMove)).toThrow(
      'movePattern must include REPAIR for a REPAIR outcome',
    );

    const cyclic = cloneDocument();
    cyclic.families[0].encounters[1].beats[1].strategies[0].branch = {
      kind: 'beat',
      outcome: 'CONTINUE',
      beatId: 'weekend-medium-opening',
      cueId: 'weekend-medium-trip',
    };
    expect(() => validateSmallTalkEncounterDocument(cyclic)).toThrow(
      "beats contains a cycle at 'weekend-medium-opening'",
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
