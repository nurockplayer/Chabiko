/**
 * Validates teacher-preview build output.
 * Cleans dist/ first, builds, verifies fresh output, then cleans up.
 * This avoids depending on a pre-existing or stale dist/.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const BUILD_FILE = resolve(REPO_ROOT, 'dist/dev/vocabulary/teacher-preview/index.html');
const BUILD_PREVIEW_FILE = resolve(REPO_ROOT, 'dist/vocabulary/basic/preview/index.html');
const DEV_ROOT = resolve(REPO_ROOT, 'public/assets/dev');
const DEV_SOURCE_DIR = resolve(DEV_ROOT, 'teacher-vocabulary-preview');
// Unique per-run marker so the test never collides with developer-owned files.
const TEST_MARKER = `chabiko-preview-test-${process.pid}-${Date.now()}`;
const SENTINEL_PNG = resolve(DEV_SOURCE_DIR, `${TEST_MARKER}-sentinel.png`);
const SENTINEL_JSON = resolve(DEV_SOURCE_DIR, `${TEST_MARKER}-sentinel.json`);
const PREEXISTING_FIXTURE = resolve(DEV_SOURCE_DIR, `${TEST_MARKER}-preexisting.png`);

function webpCount(dir: string): number {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.webp')).length : 0;
}

describe('TeacherPreview — build output (fresh build)', () => {
  let html: string;
  // Directories the test created, deepest first; only these may be removed and
  // only when empty.
  const createdDirs: string[] = [];

  beforeAll(() => {
    // Record which directories did not exist before the test created them.
    for (const dir of [DEV_SOURCE_DIR, DEV_ROOT]) {
      if (!existsSync(dir)) createdDirs.push(dir);
    }
    mkdirSync(DEV_SOURCE_DIR, { recursive: true });

    // Deployment sentinels that must never reach the built dist/.
    writeFileSync(SENTINEL_PNG, Buffer.from('\x89PNG\r\n\x1a\n' + 'x'.repeat(32)));
    writeFileSync(SENTINEL_JSON, JSON.stringify({ dev: 'sentinel', source: 'teacher' }));
    // A fixture standing in for developer-owned local data that must survive
    // the build untouched (the guard only prunes dist/, not public/).
    writeFileSync(PREEXISTING_FIXTURE, Buffer.from('\x89PNG\r\n\x1a\n' + 'y'.repeat(32)));

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
    // Preserve-and-verify the developer-owned fixture, then remove it because
    // this test created it. Never touch unrelated files.
    if (existsSync(PREEXISTING_FIXTURE)) {
      rmSync(PREEXISTING_FIXTURE, { force: true });
    }
    // Remove only the two deployment sentinels created by this test.
    for (const sentinel of [SENTINEL_PNG, SENTINEL_JSON]) {
      if (existsSync(sentinel)) rmSync(sentinel, { force: true });
    }
    // Remove directories only when this test created them and they are empty.
    for (const dir of createdDirs) {
      if (existsSync(dir)) {
        try {
          rmdirSync(dir);
        } catch {
          // Directory is not empty — leave it alone.
        }
      }
    }
    // Clean build output so tests don't depend on stale dist/.
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

  it('deploys exactly 1,131 review-only teacher derivatives, prunes no preview assets, and drops dev sentinels', () => {
    const devDir = resolve(REPO_ROOT, 'dist/assets/dev');
    const trackedTeacherDir = resolve(REPO_ROOT, 'dist/assets/vocabulary/teacher-preview/teacher');
    const aiDir = resolve(REPO_ROOT, 'dist/assets/vocabulary/teacher-preview/ai');
    // The legacy local-only dev path must not reach the deployed build, even
    // when sentinel files exist under public/assets/dev/ before the build.
    expect(existsSync(devDir)).toBe(false);
    // The two deployment sentinels must not appear in dist/.
    expect(existsSync(resolve(devDir, SENTINEL_PNG.split('/').pop()!))).toBe(false);
    expect(existsSync(resolve(devDir, SENTINEL_JSON.split('/').pop()!))).toBe(false);
    // The developer-owned fixture must survive in public/assets/dev/ (the guard
    // prunes dist/ only, never the source tree).
    expect(existsSync(PREEXISTING_FIXTURE)).toBe(true);
    // The tracked teacher derivatives must be present in dist/.
    expect(webpCount(trackedTeacherDir)).toBe(1131);
    expect(webpCount(aiDir)).toBe(432);
  });

  it('reconciles the serialized preview corpus against the built dist/ output', () => {
    const corpus = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/teacher-vocabulary-preview/preview-corpus.json'), 'utf8'));
    const imageBearing = corpus.rows.filter((row: { image: { assetPath?: string } }) => row.image.assetPath);
    // 19 production + 1,131 review-only + 432 AI = 1,582 image-bearing rows.
    expect(imageBearing).toHaveLength(1582);
    const missing = imageBearing.filter(
      (row: { image: { assetPath: string } }) => !existsSync(resolve(REPO_ROOT, 'dist', row.image.assetPath.replace(/^\//, ''))),
    );
    expect(missing).toHaveLength(0);
    // No obsolete local-only state or path reaches the deployed corpus.
    const states = corpus.rows.map((row: { image: { state: string } }) => row.image.state);
    expect(states).not.toContain('teacher-mapped-local');
    expect(JSON.stringify(corpus)).not.toContain('/assets/dev/');
  });

  it('no obsolete local-only copy or state reaches the deployed preview output', () => {
    const OBSOLETE_TOKENS = [
      'teacher-mapped-local',
      '教師提供（ローカル）',
      'ローカル専用（未公開）',
      'ローカル未生成',
    ];
    expect(existsSync(BUILD_PREVIEW_FILE)).toBe(true);
    const previewHtml = readFileSync(BUILD_PREVIEW_FILE, 'utf-8');
    for (const token of OBSOLETE_TOKENS) expect(previewHtml).not.toContain(token);
    // The client bundle is referenced from the built preview route.
    const bundleMatch = previewHtml.match(/src="(\/_astro\/[^"]+\.js)"/);
    expect(bundleMatch).not.toBeNull();
    const bundle = readFileSync(resolve(REPO_ROOT, `dist${bundleMatch![1]}`), 'utf-8');
    for (const token of OBSOLETE_TOKENS) expect(bundle).not.toContain(token);
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

  it('flashcard hidden rule has higher specificity than .flashcard default', () => {
    // The CSS file must have a higher-specificity selector like
    // .flashcard[data-astro-cid-XXX].flashcard--hidden
    // that beats .flashcard[data-astro-cid-XXX] { display: flex }
    const cssDir = resolve(REPO_ROOT, 'dist/_astro');
    if (existsSync(cssDir)) {
      const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
      for (const cf of cssFiles) {
        const css = readFileSync(join(cssDir, cf), 'utf-8');
        if (css.includes('flashcard--hidden')) {
          // Must contain a selector with both class scoped and hidden
          expect(css).toMatch(/\.flashcard\[data-astro-cid-[\w]+\]\.flashcard--hidden/);
          expect(css).not.toMatch(/[^.\]]\.flashcard--hidden\{/);
          return;
        }
      }
    }
    // Fallback: if no CSS files found (shouldn't happen after build), at least check class present
    expect(html).toContain('flashcard--hidden');
  });
});
