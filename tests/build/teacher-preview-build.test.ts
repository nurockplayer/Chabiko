/**
 * Validates teacher-preview build output.
 * Cleans dist/ first, builds, verifies fresh output, then cleans up.
 * This avoids depending on a pre-existing or stale dist/.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const BUILD_FILE = resolve(REPO_ROOT, 'dist/dev/vocabulary/teacher-preview/index.html');

describe('TeacherPreview — build output (fresh build)', () => {
  let html: string;

  beforeAll(() => {
    // Clean any stale dist/
    if (existsSync(resolve(REPO_ROOT, 'dist'))) {
      rmSync(resolve(REPO_ROOT, 'dist'), { recursive: true, force: true });
    }

    // Run fresh build
    execSync('pnpm build', { cwd: REPO_ROOT, stdio: 'pipe', timeout: 120_000 });

    // Read fresh output
    if (!existsSync(BUILD_FILE)) {
      throw new Error(`Build output not found at ${BUILD_FILE}`);
    }
    html = readFileSync(BUILD_FILE, 'utf-8');
  });

  afterAll(() => {
    // Clean up build output so tests don't depend on stale dist/
    if (existsSync(resolve(REPO_ROOT, 'dist'))) {
      rmSync(resolve(REPO_ROOT, 'dist'), { recursive: true, force: true });
    }
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

  it('empty state has source-not-generated--visible by default', () => {
    expect(html).toContain('source-not-generated--visible');
  });

  it('flashcard is hidden by default', () => {
    expect(html).toContain('flashcard--hidden');
  });
});
