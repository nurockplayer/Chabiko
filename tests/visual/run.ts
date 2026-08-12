import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type VisualRunMode = 'verify' | 'update';

export const PLAYWRIGHT_IMAGE =
  'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';

const STORE_VOLUME = 'chabiko-visual-pnpm-store-v1';

function snapshotMode(mode: VisualRunMode): 'none' | 'all' {
  return mode === 'update' ? 'all' : 'none';
}

export function buildDockerArgs(
  mode: VisualRunMode,
  workingDirectory: string,
  commonGitDirectory?: string,
): string[] {
  // The bind-mounted /work is a Git checkout owned by the host runner, while
  // git inside the container runs as a different UID. Without this, `git
  // ls-files` in the production corpus loader's tracked-asset validation aborts
  // with "dubious ownership"; the fail-closed check itself stays untouched.
  const playwrightCommand = [
    'set -euo pipefail',
    'git config --global --add safe.directory /work',
    'corepack pnpm config set store-dir /pnpm/store',
    'corepack pnpm install --frozen-lockfile',
    'corepack pnpm exec playwright test --config=playwright.visual.config.ts ' +
      `--update-snapshots=${snapshotMode(mode)}`,
    ...(mode === 'verify'
      ? ['corepack pnpm exec node scripts/generate_unicode_visual_candidates.ts --internal --check']
      : []),
  ].join('\n');

  return [
    'run',
    '--rm',
    '--init',
    '--platform=linux/amd64',
    '--ipc=host',
    '--mount',
    `type=bind,source=${workingDirectory},target=/work`,
    ...(commonGitDirectory
      ? ['--mount', `type=bind,source=${commonGitDirectory},target=${commonGitDirectory}`]
      : []),
    '--mount',
    `type=volume,source=${STORE_VOLUME},target=/pnpm/store`,
    '--mount',
    'type=volume,target=/work/node_modules',
    '--workdir=/work',
    '--env=CI=1',
    PLAYWRIGHT_IMAGE,
    'bash',
    '-lc',
    playwrightCommand,
  ];
}

function resolveCommonGitDirectory(workingDirectory: string): string {
  const result = spawnSync(
    'git',
    ['-C', workingDirectory, 'rev-parse', '--git-common-dir'],
    { encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `cannot resolve the visual checkout git metadata: ${result.error?.message ?? result.stderr}`,
    );
  }
  const directory = result.stdout.trim();
  if (!directory) throw new Error('git returned an empty common directory');
  return isAbsolute(directory) ? directory : resolve(workingDirectory, directory);
}

export function runVisualTests(
  mode: VisualRunMode,
  workingDirectory = process.cwd(),
): number {
  const result = spawnSync('docker', buildDockerArgs(
    mode,
    workingDirectory,
    resolveCommonGitDirectory(workingDirectory),
  ), {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function parseMode(value: string | undefined): VisualRunMode {
  if (value === 'verify' || value === 'update') return value;
  throw new Error('Usage: node tests/visual/run.ts <verify|update>');
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entryPoint === import.meta.url) {
  process.exitCode = runVisualTests(parseMode(process.argv[2]));
}
