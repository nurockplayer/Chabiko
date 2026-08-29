import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VISUAL_CASES, VISUAL_STATES, VISUAL_THEMES, VISUAL_VIEWPORTS } from './matrix';
import { LEARNER_ROUTE_CASES } from './learnerRouteCases';
import { KANJI_BRIDGE_VISUAL_CASES } from './kanjiBridgeCases';
import { PHRASEBOOK_VISUAL_CASES } from './phrasebookCases';
import { TAIWAN_TRAVEL_PATH_VISUAL_CASES } from './taiwanTravelPathCases';
import { PLAYWRIGHT_IMAGE, buildDockerArgs } from './run';

const snapshotsDirectory = fileURLToPath(
  new URL('./__screenshots__/', import.meta.url),
);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('visual regression harness contract', () => {
  it('defines the complete unique 60-capture matrix', () => {
    expect(VISUAL_THEMES).toEqual(['light', 'dark']);
    expect(VISUAL_VIEWPORTS).toEqual([
      { width: 320, height: 800 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]);
    expect(VISUAL_STATES).toEqual([
      'home',
      'lesson-reading',
      'practice-unanswered',
      'practice-correct',
      'practice-incorrect',
      'completion',
    ]);
    expect(VISUAL_CASES).toHaveLength(60);
    expect(new Set(VISUAL_CASES.map((visualCase) => visualCase.snapshotName)).size).toBe(60);
  });

  it('keeps verification and intentional baseline updates separate', () => {
    expect(packageJson.scripts['test:visual']).toBe(
      'node tests/visual/run.ts verify',
    );
    expect(packageJson.scripts['test:visual:update']).toBe(
      'node tests/visual/run.ts update',
    );

    const verifyArgs = buildDockerArgs('verify', '/repo');
    const updateArgs = buildDockerArgs('update', '/repo');
    const worktreeArgs = buildDockerArgs('verify', '/repo', '/host/.git');
    expect(verifyArgs.at(-1)).toContain('--update-snapshots=none');
    expect(updateArgs.at(-1)).toContain('--update-snapshots=all');
    expect(verifyArgs).toContain(PLAYWRIGHT_IMAGE);
    expect(PLAYWRIGHT_IMAGE).toContain('@sha256:');
    expect(worktreeArgs).toContain(
      'type=bind,source=/host/.git,target=/host/.git',
    );

    // The bind-mounted checkout is owned by the host, so the container must
    // declare it safe before git ls-files runs during the Astro build.
    for (const args of [verifyArgs, updateArgs]) {
      const command = args.at(-1) as string;
      expect(command).toContain(
        'git config --global --add safe.directory /work',
      );
      expect(
        command.indexOf('safe.directory /work'),
      ).toBeLessThan(command.indexOf('playwright test'));
    }
  });

  it('commits exactly one baseline for every registered visual case', () => {
    const expectedMatrix = VISUAL_CASES.map((visualCase) => visualCase.snapshotName);
    const expectedLearner = LEARNER_ROUTE_CASES.map((learnerCase) => learnerCase.snapshotName);
    const expectedKanji = KANJI_BRIDGE_VISUAL_CASES.map(
      (kanjiCase) => kanjiCase.snapshotName,
    );
    const expectedPhrasebook = PHRASEBOOK_VISUAL_CASES.map(
      (phrasebookCase) => phrasebookCase.snapshotName,
    );
    const expected = [
      ...expectedMatrix,
      ...expectedLearner,
      ...expectedKanji,
      ...expectedPhrasebook,
      ...TAIWAN_TRAVEL_PATH_VISUAL_CASES.map(
        (visualCase) => visualCase.snapshotName,
      ),
    ].sort();
    const actual = existsSync(snapshotsDirectory)
      ? readdirSync(snapshotsDirectory)
          .filter((fileName) => fileName.endsWith('.png'))
          .sort()
      : [];
    expect(actual).toEqual(expected);

    for (const visualCase of VISUAL_CASES) {
      const png = readFileSync(
        join(snapshotsDirectory, visualCase.snapshotName),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBe(visualCase.viewport.width);
      expect(png.readUInt32BE(20)).toBe(visualCase.viewport.height);
    }

    for (const learnerCase of LEARNER_ROUTE_CASES) {
      const png = readFileSync(
        join(snapshotsDirectory, learnerCase.snapshotName),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }

    // Kanji-bridge baselines are viewport-sized top-of-page captures.
    for (const kanjiCase of KANJI_BRIDGE_VISUAL_CASES) {
      const png = readFileSync(
        join(snapshotsDirectory, kanjiCase.snapshotName),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBe(kanjiCase.viewport.width);
      expect(png.readUInt32BE(20)).toBe(kanjiCase.viewport.height);
    }

    // Phrasebook baselines are viewport-sized top-of-page captures.
    for (const phrasebookCase of PHRASEBOOK_VISUAL_CASES) {
      const png = readFileSync(
        join(snapshotsDirectory, phrasebookCase.snapshotName),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBe(phrasebookCase.viewport.width);
      expect(png.readUInt32BE(20)).toBe(phrasebookCase.viewport.height);
    }

    // Taiwan Travel baselines are top/end viewport fragments. Their widths
    // remain the configured viewport width; heights are bounded by it.
    for (const visualCase of TAIWAN_TRAVEL_PATH_VISUAL_CASES) {
      const png = readFileSync(
        join(snapshotsDirectory, visualCase.snapshotName),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBe(visualCase.viewport.width);
      expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(44);
      expect(png.readUInt32BE(20)).toBeLessThanOrEqual(
        visualCase.viewport.height,
      );
    }
  });

  it('runs verification, never baseline updates, in CI', () => {
    expect(workflow).toContain('run: pnpm test:visual');
    expect(workflow).not.toContain('run: pnpm test:visual:update');
  });
});
