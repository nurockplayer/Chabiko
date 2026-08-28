import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTaiwanTravelWave1ReviewPacket,
  fingerprintTaiwanTravelWave1Lesson,
  loadTaiwanTravelWave1ReviewPacket,
  renderTaiwanTravelWave1ReviewPacket,
  TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS,
  TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
  TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
  TAIWAN_TRAVEL_WAVE1_PACKET_PATH,
  TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION,
  TAIWAN_TRAVEL_WAVE1_SCOPE_ID,
  TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
  type TaiwanTravelWave1ReviewScopeManifest,
  type TaiwanTravelWave1SourceBundle,
} from '../src/content/loadTaiwanTravelWave1ReviewScope';
import type { Lesson } from '../src/types/lesson';

const root = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;
}

function loadManifest(): TaiwanTravelWave1ReviewScopeManifest {
  return readJson<TaiwanTravelWave1ReviewScopeManifest>(
    TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
  );
}

function loadSourceBundle(): TaiwanTravelWave1SourceBundle {
  const lessons = readJson<{ lessons: Lesson[] }>(
    TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
  ).lessons;
  const paths = readJson<{ paths: TaiwanTravelWave1SourceBundle['paths'] }>(
    TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
  ).paths;
  const productionLessons = readJson<{ lessons: Lesson[] }>(
    'data/examples/valid/lessons.json',
  ).lessons;
  return { lessons, paths, productionLessons };
}

function build(
  mutateManifest?: (manifest: TaiwanTravelWave1ReviewScopeManifest) => void,
  mutateSources?: (sources: TaiwanTravelWave1SourceBundle) => void,
) {
  const manifest = structuredClone(loadManifest());
  const sources = structuredClone(loadSourceBundle());
  mutateManifest?.(manifest);
  mutateSources?.(sources);
  return buildTaiwanTravelWave1ReviewPacket(manifest, sources);
}

describe('Taiwan Travel Wave 1 candidate package', () => {
  it('reconciles exact IDs, order, draft state, scenarios, and production isolation', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();

    expect(packet.scopeId).toBe(TAIWAN_TRAVEL_WAVE1_SCOPE_ID);
    expect(packet.records.map((record) => record.lesson.id)).toEqual([
      ...TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS,
    ]);
    expect(packet.records).toHaveLength(14);
    expect(packet.records.every((record) => record.lesson.reviewStatus === 'draft')).toBe(true);
    expect(packet.scenarioDistribution).toEqual(
      TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION,
    );
    expect(packet.productionLinked).toBe(false);
    expect(packet.promotionAllowed).toBe(false);
    expect(packet.decisionCount).toBe(0);
  });

  it('keeps every rich lesson complete and every prompt mechanically unambiguous', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();

    for (const { lesson } of packet.records) {
      expect(lesson.sections?.length).toBeGreaterThanOrEqual(2);
      expect(lesson.chunks.length).toBeGreaterThanOrEqual(3);
      expect(lesson.soundFocus.length).toBeGreaterThanOrEqual(2);
      expect(lesson.examples?.length).toBeGreaterThanOrEqual(2);
      expect(lesson.reviewPrompts.length).toBeGreaterThanOrEqual(2);
      for (const prompt of lesson.reviewPrompts) {
        expect(prompt.promptJa.trim()).not.toBe('');
        expect(prompt.answerJa.trim()).not.toBe('');
        expect(prompt.distractorsJa?.length).toBeGreaterThanOrEqual(2);
        expect(new Set(prompt.distractorsJa).size).toBe(prompt.distractorsJa?.length);
        expect(prompt.distractorsJa).not.toContain(prompt.answerJa);
      }
      for (const example of lesson.examples ?? []) {
        const value = example as unknown as Record<string, unknown>;
        expect(value.traditionalStatus).toBe('generated');
        expect(value.simplifiedStatus).toBe('generated');
      }
    }
  });

  it('fails closed on wrong order, duplicate source IDs, stale graph refs, and production overlap', async () => {
    await expect(
      build(undefined, ({ lessons }) => lessons.reverse()),
    ).rejects.toThrow(/lesson order/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[1] = structuredClone(lessons[0]);
      }),
    ).rejects.toThrow(/duplicate content ref/);

    await expect(
      build(undefined, ({ paths }) => {
        paths[0].members[0] = {
          collection: 'lessons',
          type: 'lesson',
          id: 'lesson-does-not-exist',
        };
      }),
    ).rejects.toThrow(/stale member/);

    await expect(
      build(undefined, ({ lessons, productionLessons }) => {
        productionLessons.push(structuredClone(lessons[0]));
      }),
    ).rejects.toThrow(/overlaps production/);
  });

  it('rejects duplicate Can-Dos and core sentences within or before the wave', async () => {
    await expect(
      build(undefined, ({ lessons, productionLessons }) => {
        lessons[0].canDoJa = productionLessons[0].canDoJa;
      }),
    ).rejects.toThrow(/duplicates a production Can-Do/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[1].coreSentence = lessons[0].coreSentence;
      }),
    ).rejects.toThrow(/duplicate candidate core sentence/);
  });

  it('fails closed on malformed, duplicate, stale, and source-path-drifted review refs', async () => {
    await expect(
      build((manifest) => {
        manifest.records[0].type = 'vocabulary' as 'lesson';
      }),
    ).rejects.toThrow(/collection\/type mismatch/);

    await expect(
      build((manifest) => {
        manifest.records[1] = structuredClone(manifest.records[0]);
      }),
    ).rejects.toThrow(/duplicate record/);

    await expect(
      build((manifest) => {
        manifest.records[0].id = 'lesson-does-not-exist';
      }),
    ).rejects.toThrow(/stale record reference/);

    await expect(
      build((manifest) => {
        manifest.records[0].sourcePath = 'data/examples/valid/lessons.json';
      }),
    ).rejects.toThrow(/unexpected source path/);
  });

  it('rejects scenario, review-state, and prompt-quality drift', async () => {
    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].travelScenario = 'food';
      }),
    ).rejects.toThrow(/scenario distribution/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].reviewStatus = 'reviewed';
      }),
    ).rejects.toThrow(/must remain draft/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].reviewPrompts[0].distractorsJa = [
          lessons[0].reviewPrompts[0].answerJa,
          lessons[0].reviewPrompts[0].answerJa,
        ];
      }),
    ).rejects.toThrow(/unambiguous distractors/);
  });

  it('binds semantic content to deterministic review versions and rejects graph drift', async () => {
    const first = await loadTaiwanTravelWave1ReviewPacket();
    const second = await loadTaiwanTravelWave1ReviewPacket();
    expect(second).toEqual(first);
    expect(first.reviewVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(first.records.every((record) => /^[0-9a-f]{64}$/.test(record.fingerprint))).toBe(true);

    const statusChanged = {
      ...first.records[0].lesson,
      reviewStatus: 'reviewed',
    };
    expect(await fingerprintTaiwanTravelWave1Lesson(statusChanged)).toBe(
      first.records[0].fingerprint,
    );

    const contentChanged = await build(undefined, ({ lessons }) => {
      lessons[0].titleJa += '（変更）';
    });
    expect(contentChanged.records[0].fingerprint).not.toBe(
      first.records[0].fingerprint,
    );
    expect(contentChanged.reviewVersion).not.toBe(first.reviewVersion);

    await expect(
      build(undefined, ({ paths }) => {
        paths[0].members = [...paths[0].members].reverse();
      }),
    ).rejects.toThrow(/graph member order/);
  });

  it('renders the exact committed pending-human-review packet', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const rendered = renderTaiwanTravelWave1ReviewPacket(packet);
    const committed = readFileSync(resolve(root, TAIWAN_TRAVEL_WAVE1_PACKET_PATH), 'utf8');

    expect(rendered).toBe(committed);
    expect(rendered).toContain('**Overall review outcome:** pending-human-review');
    expect(rendered).toContain('**Reviewer identity:** {{HUMAN_REVIEWER_IDENTITY}}');
    expect(rendered).toContain('human language, teaching, and regional review remain pending');
    for (const record of packet.records) {
      expect(rendered).toContain(record.lesson.id);
      expect(rendered).toContain(record.fingerprint);
    }
  });

  it('rebuild command writes only its target and is idempotent', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'chabiko-wave1-review-'));
    const outputPath = join(temporaryDirectory, 'packet.md');
    try {
      execFileSync(
        resolve(root, 'node_modules/.bin/vite-node'),
        [
          'scripts/render-taiwan-travel-wave1-review-packet.ts',
          '--root',
          root,
          '--output',
          outputPath,
        ],
        { cwd: root, stdio: 'pipe' },
      );
      const first = readFileSync(outputPath, 'utf8');
      execFileSync(
        resolve(root, 'node_modules/.bin/vite-node'),
        [
          'scripts/render-taiwan-travel-wave1-review-packet.ts',
          '--root',
          root,
          '--output',
          outputPath,
        ],
        { cwd: root, stdio: 'pipe' },
      );
      expect(readFileSync(outputPath, 'utf8')).toBe(first);
      expect(first).toBe(
        readFileSync(resolve(root, TAIWAN_TRAVEL_WAVE1_PACKET_PATH), 'utf8'),
      );
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
