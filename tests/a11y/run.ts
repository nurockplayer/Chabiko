import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PLAYWRIGHT_IMAGE =
  'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';

const STORE_VOLUME = 'chabiko-a11y-pnpm-store-v1';

/**
 * Run the accessibility suite inside the pinned Playwright container, the same
 * way tests/visual/run.ts runs the visual suite. The container installs
 * dependencies from the frozen lockfile (including @axe-core/playwright) and
 * executes the axe + keyboard-flow specs against a freshly built preview.
 */
export function buildDockerArgs(workingDirectory: string): string[] {
  // The bind-mounted /work is a Git checkout owned by the host runner, while
  // git inside the container runs as a different UID. Without this, `git
  // ls-files` in the production corpus loader's tracked-asset validation aborts
  // with "dubious ownership"; the fail-closed check itself stays untouched.
  const playwrightCommand = [
    'set -euo pipefail',
    'git config --global --add safe.directory /work',
    'corepack pnpm config set store-dir /pnpm/store',
    'corepack pnpm install --frozen-lockfile',
    'corepack pnpm exec playwright test --config=playwright.a11y.config.ts',
  ].join('\n');

  return [
    'run',
    '--rm',
    '--init',
    '--platform=linux/amd64',
    '--ipc=host',
    '--mount',
    `type=bind,source=${workingDirectory},target=/work`,
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

export function runA11yTests(
  workingDirectory = process.cwd(),
): number {
  const result = spawnSync('docker', buildDockerArgs(workingDirectory), {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entryPoint === import.meta.url) {
  process.exitCode = runA11yTests();
}
