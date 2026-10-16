import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GlobalSetupContext } from 'vitest/node';

export default function setup({ provide }: GlobalSetupContext) {
  // Build lazily so focused unit/affected runs do not pay for an Astro build.
  const root = mkdtempSync(join(tmpdir(), 'chabiko-vitest-build-'));
  provide('routeBuildRoot', root);
  return () => rmSync(root, { recursive: true, force: true });
}
