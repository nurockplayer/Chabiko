import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildGoldenSetReviewPacket,
  fingerprintGoldenContentRecord,
  loadGoldenSetReviewPacket,
  renderGoldenSetReviewPacket,
  GOLDEN_SET_REVIEW_PACKET_PATH,
  GOLDEN_SET_SCOPE_ID,
  GOLDEN_SET_SCOPE_PATH,
} from '../src/content/loadGoldenSetReviewScope';
import { buildLearningContentGraph } from '../src/content/loadLearningContentGraph';
import { loadHskVocabulary } from '../src/content/loadHskVocabulary';
import { loadLessons } from '../src/content/loadLessons';
import { TEACHER_REVIEW_CAMPAIGN_ID } from '../src/domain/teacherReview';
import type { LearningContentPath } from '../src/types/learningContent';
import type { GoldenSetReviewScopeManifest } from '../src/content/loadGoldenSetReviewScope';

const scopePath = resolve(process.cwd(), GOLDEN_SET_SCOPE_PATH);

function loadManifest(): GoldenSetReviewScopeManifest {
  return JSON.parse(readFileSync(scopePath, 'utf8')) as GoldenSetReviewScopeManifest;
}

function buildPilotGraph(paths: readonly LearningContentPath[]) {
  return buildLearningContentGraph({
    lessons: loadLessons(
      resolve(process.cwd(), 'data/content-pilots/taiwan-travel-golden/lessons.json'),
    ).lessons,
    vocabulary: [],
    hskVocabulary: loadHskVocabulary(
      resolve(process.cwd(), 'data/content-pilots/hsk-golden/vocabulary.json'),
    ).vocabulary,
    phrases: [],
    roleplayCards: [],
    paths,
  });
}

describe('golden-set teacher-review scope', () => {
  it('resolves the separate 4 + 14 review set without changing #360', async () => {
    const packet = await loadGoldenSetReviewPacket();

    expect(packet.scopeId).toBe(GOLDEN_SET_SCOPE_ID);
    expect(packet.scopeId).not.toBe(TEACHER_REVIEW_CAMPAIGN_ID);
    expect(packet.compatibleWithCampaignId).toBe(TEACHER_REVIEW_CAMPAIGN_ID);
    expect(packet.records).toHaveLength(18);
    expect(packet.records.filter((record) => record.ref.collection === 'lessons')).toHaveLength(4);
    expect(packet.records.filter((record) => record.ref.collection === 'hskVocabulary')).toHaveLength(14);
    expect(packet.records.every((record) => record.reviewStatus === 'draft')).toBe(true);
    expect(packet.records.every((record) => record.record.reviewStatus === 'draft')).toBe(true);
    expect(packet.records.every((record) => /^[0-9a-f]{64}$/.test(record.fingerprint))).toBe(true);
    expect(packet.reviewVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.decisionCount).toBe(0);
    expect(packet.promotionAllowed).toBe(false);

    const hskRecords = packet.records.filter((record) => record.ref.collection === 'hskVocabulary');
    expect(
      hskRecords.every((record) => {
        const value = record.record as unknown as Record<string, unknown>;
        const source = value.source as Record<string, unknown> | undefined;
        return (
          source?.type === 'synthetic-pilot' &&
          value.traditionalStatus === 'unavailable' &&
          !('traditional' in value)
        );
      }),
    ).toBe(true);
  });

  it('covers every requested review dimension and leaves dialogue N/A', async () => {
    const packet = await loadGoldenSetReviewPacket();
    const dimensions = new Map(packet.dimensions.map((dimension) => [dimension.id, dimension]));

    expect(dimensions.size).toBe(9);
    expect([...dimensions.keys()]).toEqual([
      'natural-taiwan-mandarin',
      'natural-japanese-explanation',
      'learner-usefulness',
      'taiwan-regional-cultural-accuracy',
      'teaching-progression',
      'dialogue-naturalness',
      'exercise-quality',
      'graph-cross-link-correctness',
      'source-provenance-correctness',
    ]);
    expect(dimensions.get('dialogue-naturalness')).toMatchObject({
      state: 'not-applicable',
      appliesTo: [],
    });
    expect(
      [...dimensions.values()]
        .filter((dimension) => dimension.id !== 'dialogue-naturalness')
        .every((dimension) => dimension.state === 'pending' && dimension.appliesTo.length > 0),
    ).toBe(true);
  });

  it('keeps reviewStatus out of fingerprints but retains provenance and content changes', async () => {
    const packet = await loadGoldenSetReviewPacket();
    const lesson = packet.records.find((record) => record.ref.collection === 'lessons');
    const hsk = packet.records.find((record) => record.ref.collection === 'hskVocabulary');
    expect(lesson).toBeDefined();
    expect(hsk).toBeDefined();
    if (!lesson || !hsk) return;

    const statusChanged = {
      ...lesson.record,
      reviewStatus: 'reviewed',
    } as typeof lesson.record;
    expect(await fingerprintGoldenContentRecord(statusChanged)).toBe(lesson.fingerprint);

    const lessonValue = lesson.record as unknown as Record<string, unknown>;
    const learnerTextChanged = {
      ...lessonValue,
      titleJa: `${String(lessonValue.titleJa)}（変更）`,
    } as typeof lesson.record;
    expect(await fingerprintGoldenContentRecord(learnerTextChanged)).not.toBe(lesson.fingerprint);

    const hskValue = hsk.record as unknown as Record<string, unknown>;
    const provenanceChanged = {
      ...hskValue,
      simplifiedStatus: 'verified',
    } as typeof hsk.record;
    expect(await fingerprintGoldenContentRecord(provenanceChanged)).not.toBe(hsk.fingerprint);
  });

  it('renders a complete pending artifact without fabricating a human decision', async () => {
    const packet = await loadGoldenSetReviewPacket();
    const rendered = renderGoldenSetReviewPacket(packet);
    const committedPacket = readFileSync(
      resolve(process.cwd(), GOLDEN_SET_REVIEW_PACKET_PATH),
      'utf8',
    );

    expect(rendered).toContain('**Reviewer identity:** {{HUMAN_REVIEWER_IDENTITY}}');
    expect(rendered).toContain('**Review date:** {{YYYY-MM-DD}}');
    expect(rendered).toContain(`**Review version:** ${packet.reviewVersion}`);
    expect(rendered).toContain('**Overall review outcome:** pending-human-review');
    expect(rendered).toContain('needs-changes maps to needs_changes');
    expect(rendered).toContain('## Unresolved Issues');
    expect(rendered).toContain('## Blocked Content');
    expect(rendered).toContain('base campaign unchanged');
    expect(rendered).toContain('never written as an accepted decision');
    for (const record of packet.records) {
      expect(rendered).toContain(record.ref.id);
      expect(rendered).toContain(record.fingerprint);
    }
    expect(rendered).toContain('`reviewStatus: "draft"`');
    expect(rendered).toContain('Issue #81');
    expect(committedPacket).toBe(rendered);
  });

  it('fails closed on stale and duplicate manifest references', async () => {
    const stale = loadManifest();
    stale.records = [
      { ...stale.records[0], id: 'pilot-does-not-exist' },
      ...stale.records.slice(1),
    ];
    await expect(buildGoldenSetReviewPacket(stale)).rejects.toThrow(
      /stale record reference 'lessons:lesson:pilot-does-not-exist'/,
    );

    const duplicate = loadManifest();
    duplicate.records = [
      duplicate.records[0],
      { ...duplicate.records[1], id: duplicate.records[0].id },
      ...duplicate.records.slice(2),
    ];
    await expect(buildGoldenSetReviewPacket(duplicate)).rejects.toThrow(
      /duplicate record 'lessons:lesson:pilot-tw-airport-gate-001'/,
    );
  });

  it('binds graph/path membership changes to a new review version', async () => {
    const manifest = loadManifest();
    const graphPathBundle = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'data/content-pilots/graph-paths.json'),
        'utf8',
      ),
    ) as { paths: LearningContentPath[] };
    const originalPacket = await buildGoldenSetReviewPacket(manifest, {
      graph: buildPilotGraph(graphPathBundle.paths),
    });
    const changedPaths = graphPathBundle.paths.map((path, index) =>
      index === 0
        ? {
            ...path,
            members: [
              ...path.members,
              {
                collection: 'hskVocabulary' as const,
                type: 'vocabulary' as const,
                id: 'pilot-hsk-010-yi',
              },
            ],
          }
        : path,
    );
    const changedPacket = await buildGoldenSetReviewPacket(manifest, {
      graph: buildPilotGraph(changedPaths),
    });

    expect(changedPacket.reviewVersion).not.toBe(originalPacket.reviewVersion);
  });
});
