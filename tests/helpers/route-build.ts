import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    routeBuildRoot: string;
  }
}

// Each Vitest invocation owns a fresh root. Only read-only route assertions use
// this output; suites that change public/ or build-time env keep separate builds.
export const routeBuildDirectory = () => join(inject('routeBuildRoot'), 'dist');
export const routeBuildArguments = () => ['astro', 'build', '--outDir', routeBuildDirectory()];

export function ensureRouteBuild(): void {
  const ready = join(inject('routeBuildRoot'), 'ready');
  if (existsSync(ready)) return;
  // Files remain serialized in vitest.config.ts: Astro also writes .astro/.
  // Mark success only after the entire build (including its guards) completes.
  console.info('[route build] Building shared fresh HTML');
  execFileSync('pnpm', routeBuildArguments(), {
    cwd: process.cwd(),
    stdio: 'pipe',
    timeout: 180_000,
  });
  writeFileSync(ready, 'ready\n');
}
