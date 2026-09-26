import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildGlyphPack,
  type Authority,
  type RenderPayload,
  parseOutputArgument,
} from '../scripts/export_unicode_review_glyphs';
import { decodePinnedGlyphPng } from '../scripts/unicode_review_pixels';
import { resolveUnicodeReviewRepositoryRoot } from '../scripts/unicode_review_external_io';
import { sha256Json } from '../scripts/unicode_visual_contract';

const roots: string[] = [];
const image = 'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';
const linuxCiExportTimeoutMs = 900_000;
const pinnedPnpmCommand = ['pnpm@10.33.0'];
const canonicalJsonPaths = [
  'data/unicode/source-manifest.json',
  'data/unicode/generated/scalar-inventory.json',
  'data/unicode/generated/mechanical-records.json',
  'data/unicode/generated/visual-candidates.json',
  'data/unicode/generated/visual-review-plan.json',
] as const;
interface SourceManifest { readonly sources: readonly { readonly path: string }[] }
interface CanonicalGlyph { readonly id: string; readonly scalar: number; readonly derivativeSha256: string }
interface CanonicalManifest { readonly renderingEnvironment: Record<string, unknown>; readonly glyphs: readonly CanonicalGlyph[] }
interface IndexGlyph { readonly glyphRef: string; readonly scalar: number; readonly derivativeSha256: string; readonly relativePath: string; readonly pngSha256: string }
interface PackIndex { readonly authority: { readonly manifestSha256: string; readonly reviewPlanSha256: string }; readonly renderingEnvironment: Record<string, unknown>; readonly fontChecksumSha256: string; readonly glyphs: readonly IndexGlyph[] }
const environment = { id: 'playwright-chromium-unifont-v1', playwrightImage: image, browser: 'chromium-149.0.7827.55', fontInput: 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular' };
function sha(tile: Uint8Array): string { return createHash('sha256').update(tile).digest('hex'); }
function tile(seed: number): Uint8Array { const value = new Uint8Array(4096); value.fill(seed); return value; }
function canonicalSourcePaths(repository: string): string[] {
  const manifest = JSON.parse(readFileSync(join(repository, 'data/unicode/source-manifest.json'), 'utf8')) as SourceManifest;
  return [...new Set([
    ...canonicalJsonPaths,
    ...manifest.sources.map((source) => source.path),
  ])];
}
function snapshotCanonicalSourceBytes(repository: string): Map<string, Buffer> {
  const paths = canonicalSourcePaths(repository);
  for (const path of paths) expect(existsSync(join(repository, path)), `canonical source path does not exist: ${path}`).toBe(true);
  return new Map<string, Buffer>(paths.map((path): [string, Buffer] => [path, readFileSync(join(repository, path))]));
}
function fixture(): { authority: Authority; payload: RenderPayload; tiles: Uint8Array[] } {
  const tiles = [tile(17), tile(29)];
  const glyphs = tiles.map((pixels, index) => ({ id: `u${(0x4e00 + index).toString(16)}`, scalar: 0x4e00 + index, derivativeSha256: sha(pixels) }));
  return { authority: { schemaVersion: 1, glyphs, renderingEnvironment: { ...environment, fontAggregateSha256: 'f'.repeat(64) } }, payload: { schemaVersion: 1, renderingEnvironment: environment, fontChecksumSha256: 'f'.repeat(64), glyphs: glyphs.map((glyph, index) => ({ scalar: glyph.scalar, grayscaleBase64: Buffer.from(tiles[index]).toString('base64') })) }, tiles };
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('#477 canonical external glyph exporter', () => {
  it('builds one PNG per authority glyph and a binding index', () => {
    const { authority, payload, tiles } = fixture();
    const pack = buildGlyphPack(authority, payload);
    expect(pack.files.map((file) => file.relativePath)).toEqual(['index.json', 'glyphs/u4e00.png', 'glyphs/u4e01.png']);
    expect(decodePinnedGlyphPng(pack.files[1].contents as Uint8Array, sha(tiles[0]))).toEqual(tiles[0]);
    const index = JSON.parse(pack.files[0].contents as string);
    expect(index.glyphs).toHaveLength(2);
    expect(index.renderingEnvironment).toEqual(authority.renderingEnvironment);
    expect(index.fontChecksumSha256).toBe('f'.repeat(64));
  });

  it('fails closed for incomplete, duplicate, unknown, or drifted payloads', () => {
    const { authority, payload } = fixture();
    expect(() => buildGlyphPack(authority, { ...payload, glyphs: payload.glyphs.slice(0, 1) })).toThrow(/incomplete|extras/i);
    expect(() => buildGlyphPack(authority, { ...payload, glyphs: [...payload.glyphs, payload.glyphs[0]] })).toThrow(/incomplete|duplicate/i);
    expect(() => buildGlyphPack(authority, { ...payload, glyphs: payload.glyphs.map((glyph) => glyph.scalar === 0x4e00 ? { ...glyph, grayscaleBase64: Buffer.from(tile(31)).toString('base64') } : glyph) })).toThrow(/drift/i);
    expect(() => buildGlyphPack(authority, { ...payload, renderingEnvironment: { ...environment, browser: 'stale' } })).toThrow(/Chromium/i);
  });

  it('fails closed when canonical rendering authority metadata is stale or malformed', () => {
    const { authority, payload } = fixture();
    expect(() => buildGlyphPack({ ...authority, renderingEnvironment: { ...authority.renderingEnvironment, browser: 'stale' } }, payload)).toThrow(/Chromium|canonical authority/i);
    expect(() => buildGlyphPack({ ...authority, renderingEnvironment: { ...environment } }, payload)).toThrow(/font checksum/i);
  });

  it('binds a complete canonical rendering environment into the pack index', () => {
    const { authority, payload } = fixture();
    const renderingEnvironment = {
      ...authority.renderingEnvironment,
      reference: 'docs/content/unicode-rendering-inventory.md#pinned-reference-renderer',
      canvas: { width: 64, height: 64, fontSizePx: 48, weight: 400, grayscale: 'integer-rec601', background: 'white', foreground: 'black' },
    };
    const pack = buildGlyphPack({ ...authority, renderingEnvironment }, payload);
    expect(JSON.parse(pack.files[0].contents as string).renderingEnvironment).toEqual(renderingEnvironment);
  });

  it('publishes through the real CLI argument boundary with path safety before Docker', () => {
    const script = resolve('scripts/export_unicode_review_glyphs.ts');
    const repository = resolveUnicodeReviewRepositoryRoot();
    const inRepo = spawnSync('corepack', [...pinnedPnpmCommand, 'exec', 'node', script, '--output', join(repository, 'unsafe-export')], { encoding: 'utf8' });
    expect(inRepo.status).not.toBe(0);
    expect(`${inRepo.stdout}${inRepo.stderr}`).toMatch(/outside every worktree|outside this worktree/i);
    const root = mkdtempSync(join(tmpdir(), 'chabiko-glyph-export-'));
    roots.push(root);
    const collision = join(root, 'existing');
    writeFileSync(collision, 'keep');
    const collided = spawnSync('corepack', [...pinnedPnpmCommand, 'exec', 'node', script, '--output', collision], { encoding: 'utf8' });
    expect(collided.status).not.toBe(0);
    expect(readFileSync(collision, 'utf8')).toBe('keep');
    const neighbour = join(root, 'neighbour.txt');
    writeFileSync(neighbour, 'preserve');
    expect(parseOutputArgument(['--output', join(root, 'fresh')])).toBe(join(root, 'fresh'));
    expect(existsSync(neighbour)).toBe(true);
    expect(readdirSync(root)).toContain('neighbour.txt');
  });

  it('accepts a payload over 1 MiB through the Docker command boundary before semantic validation', () => {
    const root = mkdtempSync(join(tmpdir(), 'chabiko-glyph-export-buffer-'));
    roots.push(root);
    const fakeDocker = join(root, 'docker');
    writeFileSync(fakeDocker, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ schemaVersion: 0, padding: "x".repeat(2 * 1024 * 1024) }));\n');
    chmodSync(fakeDocker, 0o755);
    const output = join(root, 'pack');
    const result = spawnSync('corepack', [...pinnedPnpmCommand, 'exec', 'node', resolve('scripts/export_unicode_review_glyphs.ts'), '--output', output], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ''}` },
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/renderer payload schema is unsupported/);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/ENOBUFS|maxBuffer/i);
  });

  const hostOnly = process.platform !== 'linux' || process.env.CI !== 'true';
  (hostOnly ? it.skip : it)('runs the real full 1854 glyph export in Linux CI (SKIPPED locally: requires Linux CI; Docker/renderer failures fail)', { timeout: linuxCiExportTimeoutMs }, () => {
    const root = mkdtempSync(join(tmpdir(), 'chabiko-glyph-export-live-'));
    roots.push(root);
    const repository = resolveUnicodeReviewRepositoryRoot();
    const before = snapshotCanonicalSourceBytes(repository);
    const output = join(root, 'pack');
    const result = spawnSync('corepack', [...pinnedPnpmCommand, 'exec', 'node', resolve('scripts/export_unicode_review_glyphs.ts'), '--output', output], { encoding: 'utf8', timeout: linuxCiExportTimeoutMs });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const after = snapshotCanonicalSourceBytes(repository);
    expect(after).toEqual(before);

    const canonicalManifest = JSON.parse(before.get('data/unicode/generated/visual-candidates.json')!.toString('utf8')) as CanonicalManifest;
    const canonicalPlan = JSON.parse(before.get('data/unicode/generated/visual-review-plan.json')!.toString('utf8')) as Record<string, unknown>;
    const index = JSON.parse(readFileSync(join(output, 'index.json'), 'utf8')) as PackIndex;
    expect(index.authority.manifestSha256).toBe(sha256Json(canonicalManifest));
    expect(index.authority.reviewPlanSha256).toBe(sha256Json(canonicalPlan));
    expect(index.renderingEnvironment).toEqual(canonicalManifest.renderingEnvironment);
    expect(index.fontChecksumSha256).toBe(canonicalManifest.renderingEnvironment.fontAggregateSha256);

    const canonicalById = new Map<string, CanonicalGlyph>(canonicalManifest.glyphs.map((glyph): [string, CanonicalGlyph] => [glyph.id, glyph]));
    const indexById = new Map<string, IndexGlyph>(index.glyphs.map((glyph): [string, IndexGlyph] => [glyph.glyphRef, glyph]));
    expect(indexById.size).toBe(canonicalById.size);
    expect(new Set(readdirSync(join(output, 'glyphs')))).toEqual(new Set([...canonicalById.keys()].map((id) => `${id}.png`)));
    for (const [id, canonicalGlyph] of canonicalById) {
      const entry = indexById.get(id);
      expect(entry).toBeDefined();
      if (!entry) throw new Error(`export index is missing glyph ${id}`);
      expect(entry.scalar).toBe(canonicalGlyph.scalar);
      expect(entry.derivativeSha256).toBe(canonicalGlyph.derivativeSha256);
      expect(entry.relativePath).toBe(`glyphs/${id}.png`);
      const png = readFileSync(join(output, entry.relativePath));
      expect(sha(png)).toBe(entry.pngSha256);
      expect(sha(decodePinnedGlyphPng(png, canonicalGlyph.derivativeSha256))).toBe(canonicalGlyph.derivativeSha256);
    }
  });
});
