/**
 * Validates teacher-preview build output.
 * Builds into a unique test-owned output, verifies it, then cleans up only that
 * output. This avoids stale results without touching developer-owned dist/ data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const DEV_ROOT = resolve(REPO_ROOT, 'public/assets/dev');
const DEV_SOURCE_DIR = resolve(DEV_ROOT, 'teacher-vocabulary-preview');
// Unique per-run marker so the test never collides with developer-owned files.
const TEST_MARKER = `chabiko-preview-test-${process.pid}-${Date.now()}`;
const BUILD_PARENT = resolve(REPO_ROOT, 'dist');
const BUILD_DIST = resolve(BUILD_PARENT, TEST_MARKER);
const BUILD_FILE = resolve(BUILD_DIST, 'dev/vocabulary/teacher-preview/index.html');
const BUILD_PREVIEW_FILE = resolve(BUILD_DIST, 'vocabulary/basic/preview/index.html');
const BUILD_LEARNER_FILE = resolve(BUILD_DIST, 'vocabulary/basic/index.html');
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
  let buildParentCreated = false;

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

    // Run a fresh build in a unique output directory. Record parent ownership
    // so cleanup never removes a pre-existing developer directory.
    buildParentCreated = !existsSync(BUILD_PARENT);
    execSync(`pnpm build --outDir ${BUILD_DIST}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 120_000,
    });

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
    // Remove only this test's unique build output.
    if (existsSync(BUILD_DIST)) {
      rmSync(BUILD_DIST, { recursive: true, force: true });
    }
    if (buildParentCreated && existsSync(BUILD_PARENT)) {
      try {
        rmdirSync(BUILD_PARENT);
      } catch {
        // Another developer-owned output appeared; leave the parent intact.
      }
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
    const devDir = resolve(BUILD_DIST, 'assets/dev');
    const trackedTeacherDir = resolve(BUILD_DIST, 'assets/vocabulary/teacher-preview/teacher');
    const aiDir = resolve(BUILD_DIST, 'assets/vocabulary/teacher-preview/ai');
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
      (row: { image: { assetPath: string } }) => !existsSync(resolve(BUILD_DIST, row.image.assetPath.replace(/^\//, ''))),
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
    const bundle = readFileSync(
      resolve(BUILD_DIST, bundleMatch![1].replace(/^\//, '')),
      'utf-8',
    );
    for (const token of OBSOLETE_TOKENS) expect(bundle).not.toContain(token);
  });

  it('wire the full production corpus into the built learner route', () => {
    const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/teacher-vocabulary-preview/learner-manifest.json'), 'utf8'));
    const eligible = manifest.totals.eligible;
    expect(eligible).toBeGreaterThan(20);

    expect(existsSync(BUILD_LEARNER_FILE)).toBe(true);
    const learnerHtml = readFileSync(BUILD_LEARNER_FILE, 'utf-8');

    // The full opaque learner-ID list is present in the route's data attribute.
    const idsAttr = learnerHtml.match(/data-basic-vocabulary-ids="([^"]*)"/);
    expect(idsAttr).not.toBeNull();
    const ids = JSON.parse(idsAttr![1].replace(/&quot;/g, '"'));
    expect(ids).toHaveLength(eligible);
    expect(new Set(ids).size).toBe(eligible);

    // Every referenced learner asset exists in the built dist/.
    const renderPayload = learnerHtml.match(/<script type="application\/json" id="basic-vocabulary-data">([\s\S]*?)<\/script>/);
    expect(renderPayload).not.toBeNull();
    const payload = JSON.parse(renderPayload![1]);
    expect(payload.totalCount).toBe(eligible);
    for (const assetPath of Object.values(payload.render as Record<string, { assetPath: string }>)) {
      expect(
        existsSync(resolve(BUILD_DIST, assetPath.assetPath.replace(/^\//, ''))),
        `missing ${assetPath.assetPath}`,
      ).toBe(true);
    }

    // The route shows the total corpus size separately from the session size.
    expect(learnerHtml).toContain(`全${eligible}語`);
    expect(learnerHtml).toContain('data-basic-vocabulary-session-size="10"');
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
    const cssDir = resolve(BUILD_DIST, '_astro');
    expect(existsSync(cssDir)).toBe(true);
    const cssFiles = readdirSync(cssDir).filter((file) => file.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);

    const matchingCss = cssFiles
      .map((file) => readFileSync(join(cssDir, file), 'utf-8'))
      .find((css) => css.includes('flashcard--hidden'));
    expect(matchingCss).toBeDefined();
    // Must contain a selector with both class scoped and hidden.
    expect(matchingCss).toMatch(/\.flashcard\[data-astro-cid-[\w]+\]\.flashcard--hidden/);
    expect(matchingCss).not.toMatch(/[^.\]]\.flashcard--hidden\{/);
  });
});

/**
 * Account-sync release acceptance — Domain 9 (deployment/rollback).
 *
 * Builds the static site with public Supabase config plus decoy secret env vars
 * present, then verifies:
 *   1. the auth callback / basic vocabulary / words routes build and carry their
 *      account-sync markers;
 *   2. the PUBLIC_ values are inlined into the client bundle (they are public by
 *      design);
 *   3. no decoy secret value, no credential-shaped token, and no non-PUBLIC
 *      credential env name appears anywhere in the build output.
 *
 * This must live inside this single-build file (sequential describes) because
 * concurrent `astro build` runs race on the shared `.astro/.prerender/` cache.
 */
describe('Deployment — static account-sync routes and secret hygiene (fresh build)', () => {
  const SCAN_PARENT = resolve(REPO_ROOT, 'dist');
  const SCAN_DIST = resolve(SCAN_PARENT, `${TEST_MARKER}-scan`);
  const SCAN_CALLBACK = resolve(SCAN_DIST, 'auth/callback/index.html');
  const SCAN_BASIC = resolve(SCAN_DIST, 'vocabulary/basic/index.html');
  const SCAN_WORDS = resolve(SCAN_DIST, 'vocabulary/basic/words/index.html');

  const PUBLIC_URL = 'https://acceptance-test-project.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_acceptance_public_key_0001';
  const DECOY_SERVICE_ROLE = 'sb_secret_acceptance_service_role_0001';
  const DECOY_JWT_SECRET = 'jwt-secret-acceptance-decoy-0001';
  const DECOY_GOOGLE_CLIENT_SECRET = 'google-client-secret-decoy-0001';
  const DECOY_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.acceptance-anon-decoy';

  const savedEnv = new Map<string, string | undefined>();
  let callbackHtml: string;
  let basicHtml: string;
  let wordsHtml: string;
  let scanText = '';
  let scannedRegularFileCount = 0;
  const byteScanLeaks: string[] = [];
  let scanParentCreated = false;

  beforeAll(() => {
    // Record the prior value of every env var we set so afterAll can restore it.
    for (const name of [
      'PUBLIC_SUPABASE_URL',
      'PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_JWT_SECRET',
      'GOOGLE_CLIENT_SECRET',
      'SUPABASE_ANON_KEY',
    ]) {
      savedEnv.set(name, process.env[name]);
    }
    process.env.PUBLIC_SUPABASE_URL = PUBLIC_URL;
    process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLIC_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = DECOY_SERVICE_ROLE;
    process.env.SUPABASE_JWT_SECRET = DECOY_JWT_SECRET;
    process.env.GOOGLE_CLIENT_SECRET = DECOY_GOOGLE_CLIENT_SECRET;
    process.env.SUPABASE_ANON_KEY = DECOY_ANON_KEY;

    // The previous describe's afterAll removed dist/; build to an isolated
    // test-owned outDir so this scan never reuses stale output.
    scanParentCreated = !existsSync(SCAN_PARENT);
    execSync(`pnpm build --outDir ${SCAN_DIST}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 120_000,
    });

    if (!existsSync(SCAN_CALLBACK)) {
      throw new Error(`Callback build output not found at ${SCAN_CALLBACK}`);
    }
    callbackHtml = readFileSync(SCAN_CALLBACK, 'utf-8');
    basicHtml = readFileSync(SCAN_BASIC, 'utf-8');
    wordsHtml = readFileSync(SCAN_WORDS, 'utf-8');

    const TEXT_EXT = new Set([
      '.css',
      '.html',
      '.js',
      '.json',
      '.map',
      '.svg',
      '.txt',
      '.webmanifest',
      '.xml',
    ]);
    const texts: string[] = [];
    const forbiddenBytes = [
      ['decoy service-role secret', DECOY_SERVICE_ROLE],
      ['decoy JWT secret', DECOY_JWT_SECRET],
      ['decoy Google client secret', DECOY_GOOGLE_CLIENT_SECRET],
      ['decoy anon JWT', DECOY_ANON_KEY],
      ['service-role env name', 'SERVICE_ROLE_KEY'],
      ['Google client-secret env name', 'GOOGLE_CLIENT_SECRET'],
      ['Supabase secret-key env name', 'SUPABASE_SECRET_KEY'],
      ['JWT secret env name', 'JWT_SECRET'],
      ['legacy anon-key env name', 'SUPABASE_ANON_KEY'],
    ].map(([label, value]) => ({ label, value: Buffer.from(value) }));
    const forbiddenBytePatterns = [
      ['Supabase secret-shaped value', /sb_secret_[A-Za-z0-9_-]{12,}/],
      [
        'JWT-shaped value',
        /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]{20,})?/,
      ],
    ] as const;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const file = join(dir, entry);
        const stat = statSync(file);
        if (stat.isDirectory()) walk(file);
        else if (stat.isFile()) {
          const bytes = readFileSync(file);
          scannedRegularFileCount += 1;
          for (const forbidden of forbiddenBytes) {
            if (bytes.includes(forbidden.value)) {
              byteScanLeaks.push(
                `${file.slice(SCAN_DIST.length + 1)}: ${forbidden.label}`,
              );
            }
          }
          // latin1 preserves every byte one-to-one. Convert one file at a time
          // so long credential signatures are checked in binary/extensionless
          // artifacts without retaining the full asset corpus in memory.
          const byteText = bytes.toString('latin1');
          for (const [label, pattern] of forbiddenBytePatterns) {
            if (pattern.test(byteText)) {
              byteScanLeaks.push(`${file.slice(SCAN_DIST.length + 1)}: ${label}`);
            }
          }
          if (TEXT_EXT.has(file.slice(file.lastIndexOf('.')))) {
            texts.push(bytes.toString('utf-8'));
          }
        }
      }
    };
    walk(SCAN_DIST);
    scanText = texts.join('\n');
  });

  afterAll(() => {
    // Restore the pre-test environment.
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    // Remove only the test-owned outDir. dist/ is gitignored, but clean it up
    // so the tree is left exactly as it was found.
    if (existsSync(SCAN_DIST)) {
      rmSync(SCAN_DIST, { recursive: true, force: true });
    }
    if (scanParentCreated && existsSync(SCAN_PARENT)) {
      try {
        rmdirSync(SCAN_PARENT);
      } catch {
        // Another developer-owned output appeared; leave the parent intact.
      }
    }
  });

  it('builds the auth callback route with the account-sync markers', () => {
    expect(callbackHtml).toContain('data-supabase-auth-callback');
    expect(callbackHtml).toContain('data-supabase-auth-callback-status');
    expect(callbackHtml).toContain('aria-live="polite"');
    expect(callbackHtml).toContain('noindex');
    expect(callbackHtml).toContain('nofollow');
    expect(callbackHtml).toContain('<meta name="referrer" content="no-referrer">');
    expect(callbackHtml).toContain('type="module"');
    // No raw auth material is ever emitted into the built page.
    expect(callbackHtml).not.toMatch(/access_token|refresh_token/);
  });

  it('builds the basic vocabulary routes with account/session/catalog markers', () => {
    expect(basicHtml).toContain('data-basic-vocabulary-account');
    expect(basicHtml).toContain('data-basic-vocabulary-session');
    expect(basicHtml).toContain('id="basic-vocabulary-data"');
    expect(wordsHtml).toContain('data-basic-vocabulary-catalog');
  });

  it('inlines the public Supabase URL and publishable key (they are public)', () => {
    expect(scanText).toContain(PUBLIC_URL);
    expect(scanText).toContain(PUBLIC_KEY);
  });

  it('never embeds decoy secret values into the build output', () => {
    expect(scannedRegularFileCount).toBeGreaterThan(0);
    expect(byteScanLeaks).toEqual([]);
    expect(scanText).not.toContain(DECOY_SERVICE_ROLE);
    expect(scanText).not.toContain(DECOY_JWT_SECRET);
    expect(scanText).not.toContain(DECOY_GOOGLE_CLIENT_SECRET);
    expect(scanText).not.toContain(DECOY_ANON_KEY);
  });

  it('emits no credential-shaped tokens or non-PUBLIC credential env names', () => {
    // JWT header fragment that would appear if a token were inlined.
    expect(scanText).not.toContain('eyJ');
    // Secret credential name conventions must never appear in the output.
    expect(scanText).not.toMatch(
      /sb_secret_[A-Za-z0-9_-]{12,}/,
    );
    expect(scanText).not.toMatch(
      /SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET|SUPABASE_SECRET_KEY|JWT_SECRET|SUPABASE_ANON_KEY/,
    );
  });

  it('documents distinct exact provider and app callback allowlists', () => {
    const runbook = readFileSync(
      resolve(REPO_ROOT, 'docs/engineering/account-sync-deployment-rollback.md'),
      'utf-8',
    );
    expect(runbook).toContain(
      'https://<PROJECT_REF>.supabase.co/auth/v1/callback',
    );
    expect(runbook).toContain('Site URL：`https://chabiko.pages.dev/`');
    expect(runbook).toContain(
      'Redirect URLs 加入 exact production URL：`https://chabiko.pages.dev/auth/callback/`',
    );
    expect(runbook).toContain('production 不得使用 `*`／`**` 寬 wildcard');
    expect(runbook).toContain('這三層 allowlist');
    expect(runbook).toContain('Rollback to this deployment');
    expect(runbook).toContain('Preview deployment 不能作為 rollback target');
    expect(runbook).not.toContain('production branch 指回');
  });
});
