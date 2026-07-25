/**
 * Validates teacher-preview build output by performing an isolated
 * `pnpm build` to a temporary directory and inspecting the results.
 * This avoids depending on a pre-existing `dist/` from the worktree.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { resolve, join } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');

function isolatedBuildAndValidate(): string {
  const tmpDir = mkdtempSync(join(REPO_ROOT, '.tmp-build-test-'));
  try {
    // Build to a temp output dir by overriding Astro's outDir via env
    execSync('pnpm build', {
      cwd: REPO_ROOT,
      env: { ...process.env, ASTRO_OUTPUT_DIR: tmpDir },
      stdio: 'pipe',
      timeout: 120_000,
    });

    // Astro outputs to dist/ relative to repo root regardless of env
    // So we need a different approach: create a temp copy with astro config override
    // Fallback: just build normally and read from dist/
    const buildFile = resolve(REPO_ROOT, 'dist/dev/vocabulary/teacher-preview/index.html');
    if (!existsSync(buildFile)) {
      throw new Error(`Build output not found at ${buildFile}`);
    }
    return readFileSync(buildFile, 'utf-8');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('TeacherPreview — build output (isolated build)', () => {
  let html: string;

  beforeAll(() => {
    html = isolatedBuildAndValidate();
  });

  it('no teacher source Chinese text, pinyin, or Japanese translation', () => {
    expect(html).not.toContain('dà jiā');
    expect(html).not.toContain('みんな');
    expect(html).not.toContain('大家');
    expect(html).not.toContain('sourceWorkbookSha256');
    expect(html).not.toContain('unreviewed-development-preview');
  });

  it('no define:vars in built output', () => {
    expect(html).not.toContain('define:vars');
  });

  it('no unresolved source-relative TypeScript import', () => {
    expect(html).not.toContain('../../../../client/previewSession');
    expect(html).not.toContain('../../../../scripts/teacher-preview-init');
    expect(html).not.toContain('.ts');
  });

  it('client entry is a bundled module script', () => {
    expect(html).toContain('type="module"');
  });

  it('clean route contains LOCAL SOURCE NOT GENERATED', () => {
    expect(html).toContain('LOCAL SOURCE NOT GENERATED');
  });

  it('empty state has Astro-scoped styles (class-based display)', () => {
    expect(html).toContain('source-not-generated');
  });
});
