import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  packageManager: string;
  scripts: Record<string, string>;
};
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('pnpm toolchain policy', () => {
  it('pins pnpm 12 consistently without lifecycle enforcement or other lockfiles', () => {
    expect(manifest.packageManager).toBe('pnpm@12.11.2');
    expect(manifest.scripts).not.toHaveProperty('preinstall');
    for (const script of ['install', 'postinstall', 'prepare']) {
      expect(manifest.scripts).not.toHaveProperty(script);
    }
    for (const path of ['package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
      expect(existsSync(path), path).toBe(false);
    }
    expect(readFileSync('Dockerfile', 'utf8')).toContain('corepack prepare pnpm@12.11.2 --activate');
    expect(readFileSync('AGENTS.md', 'utf8')).toContain('Use pnpm 12.11.2');
    expect(readFileSync('README.md', 'utf8')).toContain('PNPM_VERSION=12.11.2');
  });

  it('keeps only esbuild and sharp allowed to run dependency builds', () => {
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toBe(
      'allowBuilds:\n  esbuild: true\n  sharp: true\n',
    );
  });

  it('records the package manager separately from application dependency resolutions', () => {
    const documents = readFileSync('pnpm-lock.yaml', 'utf8').split(/^---\s*$/m).filter((doc) => doc.trim());
    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatch(/packageManagerDependencies:\s+pnpm:\s+specifier: 12\.11\.2\s+version: 12\.11\.2/);
    expect(documents[1]).toContain("lockfileVersion: '9.0'");
    expect(documents[1]).not.toContain('packageManagerDependencies:');
  });

  it('uses the verified setup action and preserves explicit frozen installs and Node 24', () => {
    const jobs = workflow.split(/^ {2}(?=[a-z][\w-]*:\s*$)/m).slice(1);
    const pnpmJobs = jobs.filter((job) => /run: pnpm /.test(job));
    expect(pnpmJobs).toHaveLength(3);
    for (const job of pnpmJobs) {
      expect(job).toContain('uses: pnpm/setup@a0881977cd8ea73b1ed212236c99ca10dcc80cf4 # v3.1.1');
      expect(job).toMatch(/with:\s+version: 12\.11\.2\s+install: false\s+node-version-file: false/);
      expect(job).toContain('node-version: "24"');
    }
    expect(workflow).not.toContain('pnpm/action-setup');
    expect(workflow).toContain('run: pnpm install --frozen-lockfile');
    expect(workflow).toContain('name: Reject non-pnpm lockfiles');
  });
});
