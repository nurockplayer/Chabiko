import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLAYWRIGHT_IMAGE } from '../tests/visual/run.ts';
import { RENDERING_ENVIRONMENT_ID, VISUAL_SCHEMA_VERSION, sha256Json, validateVisualArtifacts } from './unicode_visual_contract.ts';
import { renderPinnedGlyph, TILE_BYTES } from './unicode_review_pixels.ts';
import { resolveStrictExternalPath, resolveUnicodeReviewRepositoryRoot, writeExclusiveExternalDirectory } from './unicode_review_external_io.ts';

const BROWSER = 'chromium-149.0.7827.55';
const FONT_INPUT = 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PINNED_RENDER_TIMEOUT_MS = 900_000;
const PINNED_RENDER_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const repoRoot = resolveUnicodeReviewRepositoryRoot();
const manifestPath = join(repoRoot, 'data/unicode/generated/visual-candidates.json');

export interface AuthorityGlyph { readonly id: string; readonly scalar: number; readonly derivativeSha256: string }
export interface Authority {
  readonly schemaVersion: number;
  readonly input?: Record<string, unknown>;
  readonly threshold?: Record<string, unknown>;
  readonly availability?: Record<string, unknown>;
  readonly exclusions?: Record<string, unknown>;
  readonly glyphs: readonly AuthorityGlyph[];
  readonly renderingEnvironment: Record<string, unknown>;
  readonly candidates?: readonly Record<string, unknown>[];
  readonly totals?: Record<string, unknown>;
  readonly canonicalManifestSha256?: string;
  readonly reviewPlanSha256?: string;
}
export interface RenderedGlyph { readonly scalar: number; readonly grayscaleBase64: string }
export interface RenderPayload {
  readonly schemaVersion: number;
  readonly renderingEnvironment: Record<string, unknown>;
  readonly fontChecksumSha256: string;
  readonly glyphs: readonly RenderedGlyph[];
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function loadAuthority(): Authority {
  const authorityBytes = readFileSync(manifestPath, 'utf8');
  const planBytes = readFileSync(join(repoRoot, 'data/unicode/generated/visual-review-plan.json'), 'utf8');
  const authority = JSON.parse(authorityBytes) as Authority;
  const plan = JSON.parse(planBytes) as Record<string, unknown>;
  assert(authority.schemaVersion === VISUAL_SCHEMA_VERSION, 'current glyph authority schema is unsupported');
  validateVisualArtifacts(authority, plan, repoRoot);
  assert(authority.availability?.status === 'available' && authority.renderingEnvironment, 'the #262 pinned rendering authority is unavailable');
  assert(authority.glyphs.length > 0, 'current glyph authority is empty');
  return { ...authority, canonicalManifestSha256: sha256Json(authority), reviewPlanSha256: sha256Json(plan) };
}

function renderingBinding(environment: Record<string, unknown>): void {
  assert(environment.id === RENDERING_ENVIRONMENT_ID, 'renderer returned a stale rendering environment');
  assert(environment.playwrightImage === PLAYWRIGHT_IMAGE, 'renderer returned a stale Playwright image');
  assert(environment.browser === BROWSER, 'renderer returned a stale Chromium version');
  assert(environment.fontInput === FONT_INPUT, 'renderer returned a stale font input');
}

function validatePayload(authority: Authority, payload: RenderPayload): Map<number, Uint8Array> {
  assert(payload.schemaVersion === VISUAL_SCHEMA_VERSION, 'renderer payload schema is unsupported');
  renderingBinding(payload.renderingEnvironment);
  for (const [key, value] of Object.entries(payload.renderingEnvironment)) {
    assert(JSON.stringify(authority.renderingEnvironment[key]) === JSON.stringify(value), `renderer returned rendering metadata that differs from canonical authority: ${key}`);
  }
  assert(SHA256_PATTERN.test(payload.fontChecksumSha256), 'renderer returned an invalid font checksum');
  assert(payload.fontChecksumSha256 === authority.renderingEnvironment.fontAggregateSha256, 'renderer returned a stale font checksum');
  const expected = new Map(authority.glyphs.map((glyph) => [glyph.scalar, glyph]));
  assert(payload.glyphs.length === expected.size, 'renderer payload glyph coverage is incomplete or has extras');
  const pixels = new Map<number, Uint8Array>();
  for (const glyph of payload.glyphs) {
    assert(Number.isSafeInteger(glyph.scalar) && expected.has(glyph.scalar), `renderer payload contains an unknown or duplicate scalar: ${glyph.scalar}`);
    assert(!pixels.has(glyph.scalar), `renderer payload contains a duplicate scalar: ${glyph.scalar}`);
    assert(typeof glyph.grayscaleBase64 === 'string', `renderer payload is missing pixels for U+${glyph.scalar.toString(16)}`);
    assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(glyph.grayscaleBase64), `renderer payload pixels for U+${glyph.scalar.toString(16)} are not valid base64`);
    const tile = new Uint8Array(Buffer.from(glyph.grayscaleBase64, 'base64'));
    assert(tile.byteLength === TILE_BYTES, `renderer payload pixels for U+${glyph.scalar.toString(16)} are not 64x64 grayscale`);
    assert(Buffer.from(tile).toString('base64') === glyph.grayscaleBase64, `renderer payload pixels for U+${glyph.scalar.toString(16)} are not canonical base64`);
    const expectedGlyph = expected.get(glyph.scalar)!;
    assert(sha256(tile) === expectedGlyph.derivativeSha256, `renderer payload derivative drift for ${expectedGlyph.id}`);
    pixels.set(glyph.scalar, tile);
  }
  assert(pixels.size === expected.size, 'renderer payload does not cover every current authority glyph');
  return pixels;
}

export function buildGlyphPack(authority: Authority, payload: RenderPayload): { readonly files: readonly { relativePath: string; contents: string | Uint8Array }[] } {
  const pixels = validatePayload(authority, payload);
  const files: { relativePath: string; contents: string | Uint8Array }[] = [];
  const glyphIndex = authority.glyphs.map((glyph) => {
    const png = renderPinnedGlyph(pixels.get(glyph.scalar)!, glyph.derivativeSha256);
    const relativePath = `glyphs/${glyph.id}.png`;
    files.push({ relativePath, contents: png });
    return { glyphRef: glyph.id, scalar: glyph.scalar, derivativeSha256: glyph.derivativeSha256, relativePath, pngSha256: sha256(png) };
  });
  const index = {
    schemaVersion: 1,
    purpose: 'unicode-review-glyph-pixels',
    authority: { manifestSha256: authority.canonicalManifestSha256 ?? sha256Json(authority), glyphCount: authority.glyphs.length },
    renderingEnvironment: authority.renderingEnvironment,
    fontChecksumSha256: payload.fontChecksumSha256,
    glyphs: glyphIndex,
  };
  if (authority.reviewPlanSha256) {
    (index.authority as { reviewPlanSha256?: string }).reviewPlanSha256 = authority.reviewPlanSha256;
  }
  files.unshift({ relativePath: 'index.json', contents: `${JSON.stringify(index, null, 2)}\n` });
  return { files };
}

function renderInPinnedContainer(): RenderPayload {
  const result = spawnSync('docker', ['run', '--rm', '--init', '--platform=linux/amd64', '--ipc=host', '--mount', `type=bind,source=${repoRoot},target=/work`, '--mount', 'type=volume,source=chabiko-visual-pnpm-store-v1,target=/pnpm/store', '--mount', 'type=volume,target=/work/node_modules', '--workdir=/work', '--env=CI=1', PLAYWRIGHT_IMAGE, 'bash', '-lc', 'set -euo pipefail; corepack pnpm config set store-dir /pnpm/store >&2; corepack pnpm install --frozen-lockfile >&2; corepack pnpm exec node scripts/generate_unicode_visual_candidates.ts --internal-render-glyphs'], { encoding: 'utf8', maxBuffer: PINNED_RENDER_MAX_BUFFER_BYTES, stdio: ['ignore', 'pipe', 'inherit'], timeout: PINNED_RENDER_TIMEOUT_MS });
  if (result.error || result.status !== 0) throw new Error(`pinned renderer unavailable: ${result.error?.message ?? `docker exited ${result.status}`}`);
  try { return JSON.parse(result.stdout) as RenderPayload; } catch (error) { throw new Error(`pinned renderer returned invalid payload: ${error instanceof Error ? error.message : String(error)}`); }
}

export function exportGlyphPack(outputDirectory: string, payload?: RenderPayload): string {
  const output = resolveStrictExternalPath(outputDirectory, 'glyph pack output directory');
  assert(!existsSync(output), 'glyph pack output directory must not already exist');
  const authority = loadAuthority();
  const pack = buildGlyphPack(authority, payload ?? renderInPinnedContainer());
  return writeExclusiveExternalDirectory({ directory: output, files: pack.files }).directory;
}

export function parseOutputArgument(args: readonly string[]): string {
  assert(args.length === 2 && args[0] === '--output' && typeof args[1] === 'string', 'Usage: export_unicode_review_glyphs.ts --output ABSOLUTE_FRESH_EXTERNAL_DIRECTORY');
  return args[1];
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entryPoint === import.meta.url) exportGlyphPack(parseOutputArgument(process.argv.slice(2)));
