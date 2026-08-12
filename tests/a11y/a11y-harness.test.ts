import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { A11Y_CASES, A11Y_SURFACES, A11Y_THEMES } from './matrix';
import { buildDockerArgs, PLAYWRIGHT_IMAGE } from './run';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('accessibility suite harness contract', () => {
  it('defines the complete 12-case matrix (2 themes x 6 surfaces)', () => {
    expect(A11Y_THEMES).toEqual(['light', 'dark']);
    expect(A11Y_SURFACES).toEqual([
      'home',
      'lesson-reading',
      'practice-unanswered',
      'practice-correct',
      'practice-incorrect',
      'completion',
    ]);
    expect(A11Y_CASES).toHaveLength(12);
    expect(new Set(A11Y_CASES.map((a11yCase) => a11yCase.caseName)).size).toBe(12);
  });

  it('runs via a pinned Playwright image and the frozen lockfile', () => {
    expect(packageJson.scripts['test:a11y']).toBe('node tests/a11y/run.ts');

    const args = buildDockerArgs('/repo');
    expect(args).toContain(PLAYWRIGHT_IMAGE);
    expect(PLAYWRIGHT_IMAGE).toContain('@sha256:');
    const command = args.at(-1) as string;
    expect(command).toContain('pnpm install --frozen-lockfile');
    expect(command).toContain('--config=playwright.a11y.config.ts');
    // The bind-mounted checkout is owned by the host, so the container must
    // declare it safe before git ls-files runs during the Astro build.
    expect(command).toContain('git config --global --add safe.directory /work');
    expect(command.indexOf('safe.directory /work')).toBeLessThan(
      command.indexOf('playwright test'),
    );
  });

  it('mounts the git common directory for a linked worktree checkout', () => {
    // In a Coordinator-created linked worktree the .git file points outside the
    // bind-mounted /work, so the containerized Astro build (which runs
    // validateLearnerManifest's git ls-files) needs the common git directory
    // mounted. Mirrors tests/visual/run.ts.
    const args = buildDockerArgs('/repo', '/host/.git');
    expect(args).toContain('type=bind,source=/host/.git,target=/host/.git');
  });

  it('omits the git mount when no common directory is supplied', () => {
    const args = buildDockerArgs('/repo');
    expect(args).not.toContain('target=/host/.git');
    expect(args.some((a) => a.startsWith('type=bind,source=/host'))).toBe(false);
  });

  it('wires the accessibility suite into CI without introducing snapshot updates', () => {
    expect(workflow).toContain('name: Accessibility');
    expect(workflow).toContain('run: pnpm test:a11y');
    expect(workflow).not.toContain('run: pnpm test:a11y:update');
  });
});
