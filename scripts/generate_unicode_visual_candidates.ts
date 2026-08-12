import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { PLAYWRIGHT_IMAGE } from '../tests/visual/run.ts';
import {
  MAX_HAMMING_DISTANCE,
  RENDERING_ENVIRONMENT_ID,
  VISUAL_SCHEMA_VERSION,
  buildReviewBatches,
  hammingDistance64,
  sha256Json,
  validateVisualArtifacts,
} from './unicode_visual_contract.ts';

const repoRoot = process.cwd();
const candidatesPath = join(repoRoot, 'data/unicode/generated/visual-candidates.json');
const reviewPlanPath = join(repoRoot, 'data/unicode/generated/visual-review-plan.json');
const inventoryPath = join(repoRoot, 'data/unicode/generated/scalar-inventory.json');
const mechanicalPath = join(repoRoot, 'data/unicode/generated/mechanical-records.json');
const fontPath = '/usr/share/fonts/opentype/unifont/unifont.otf';
const fontUrl = 'http://visual-font.local/unifont.otf';
const fontFamily = 'Chabiko Unicode Candidate Font';

export class RendererUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RendererUnavailableError';
  }
}

export function mapRendererOperationError(
  error: unknown,
  operation: 'launch' | 'page',
): Error {
  if (error instanceof RendererUnavailableError) return error;
  const message = (error as Error).message;
  if (operation === 'launch' || /browser has been closed|target page, context or browser has been closed|protocol error/i.test(message)) {
    return new RendererUnavailableError(`pinned renderer operation failed: ${message}`);
  }
  return error as Error;
}

function sha256(bytes: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertFontCoverage(scalars: number[], charsetOutput: string): void {
  const ranges = charsetOutput.trim().split(/\s+/).filter(Boolean).map((range) => {
    const [start, end = start] = range.split('-').map((part) => Number.parseInt(part, 16));
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      throw new Error(`malformed fc-query charset range '${range}'`);
    }
    return [start, end] as const;
  });
  const missing = scalars.filter((scalar) => !ranges.some(([start, end]) => scalar >= start && scalar <= end));
  if (missing.length) {
    throw new Error(`pinned font lacks inventory coverage for ${missing.length} scalars: ${missing.slice(0, 10).map((scalar) => `U+${scalar.toString(16).toUpperCase()}`).join(', ')}`);
  }
}

function assertInventoryCoverage(scalars: number[]): void {
  const result = spawnSync('fc-query', ['--format=%{charset}', fontPath], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new RendererUnavailableError(`cannot inspect pinned font coverage with fc-query: ${result.error?.message ?? result.stderr}`);
  }
  try {
    assertFontCoverage(scalars, result.stdout);
  } catch (error) {
    throw new RendererUnavailableError((error as Error).message);
  }
}

async function collectRendererPixels(scalars: number[]) {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-lcd-text', '--font-render-hinting=none', '--force-color-profile=srgb'],
    });
  } catch (error) {
    throw mapRendererOperationError(error, 'launch');
  }
  try {
    const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', reducedMotion: 'reduce' });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.href === fontUrl) {
        return route.fulfill({ path: fontPath, contentType: 'font/otf' });
      }
      return route.abort('blockedbyclient');
    });
    await page.setContent(`<style>@font-face{font-family:'${fontFamily}';font-style:normal;font-weight:400;font-display:block;src:url(${fontUrl}) format('opentype')}html,body{margin:0;background:#fff}canvas{display:block}</style><canvas width="64" height="64"></canvas>`);
    const pixels = await page.evaluate(async (values) => {
      const canvas = document.querySelector('canvas')!;
      const context = canvas.getContext('2d', { alpha: false })!;
      const output: Array<{ scalar: number; grayscaleBase64: string; faceCount: number }> = [];
      for (const scalar of values) {
        const character = String.fromCodePoint(scalar);
        const faces = await document.fonts.load('400 48px "Chabiko Unicode Candidate Font"', character);
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 64, 64);
        context.fillStyle = '#000';
        context.font = '400 48px "Chabiko Unicode Candidate Font"';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(character, 32, 32);
        const rgba = context.getImageData(0, 0, 64, 64).data;
        const grayscale = Array.from({ length: 4096 }, (_, index) => {
          const offset = index * 4;
          return Math.floor((299 * rgba[offset] + 587 * rgba[offset + 1] + 114 * rgba[offset + 2] + 500) / 1000);
        });
        output.push({ scalar, grayscaleBase64: btoa(String.fromCharCode(...grayscale)), faceCount: faces.length });
      }
      return output;
    }, scalars);
    const missing = pixels.filter((item) => item.faceCount === 0).map((item) => item.scalar);
    if (missing.length) throw new RendererUnavailableError(`pinned font lacks ${missing.length} inventory scalars: ${missing.slice(0, 10).map((value) => `U+${value.toString(16).toUpperCase()}`).join(', ')}`);
    return pixels;
  } catch (error) {
    throw mapRendererOperationError(error, 'page');
  } finally {
    await browser?.close();
  }
}

async function renderGlyphs(scalars: number[]) {
  if (!existsSync(fontPath)) throw new RendererUnavailableError(`pinned container font is unavailable: ${fontPath}`);
  const fontChecksumSha256 = sha256(readFileSync(fontPath));
  assertInventoryCoverage(scalars);
  const pixels = await collectRendererPixels(scalars);
  return {
    fontChecksumSha256,
    glyphs: pixels.map(({ faceCount: _faceCount, grayscaleBase64, ...item }) => {
      const grayscale = Buffer.from(grayscaleBase64, 'base64');
      const averages: number[] = [];
      for (let row = 0; row < 8; row += 1) for (let column = 0; column < 9; column += 1) {
        const x0 = Math.floor(column * 64 / 9);
        const x1 = Math.floor((column + 1) * 64 / 9);
        let sum = 0;
        let count = 0;
        for (let y = row * 8; y < (row + 1) * 8; y += 1) for (let x = x0; x < x1; x += 1) {
          sum += grayscale[y * 64 + x];
          count += 1;
        }
        averages.push(Math.floor(sum / count));
      }
      let bits = 0n;
      for (let row = 0; row < 8; row += 1) for (let column = 0; column < 8; column += 1) {
        bits = (bits << 1n) | BigInt(averages[row * 9 + column] < averages[row * 9 + column + 1] ? 1 : 0);
      }
      return {
        id: `u${item.scalar.toString(16).padStart(4, '0')}`,
        ...item,
        derivativeSha256: sha256(grayscale),
        perceptualHash64: bits.toString(16).padStart(16, '0'),
      };
    }),
  };
}

async function generate() {
  const inventoryBytes = readFileSync(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  const mechanical = JSON.parse(readFileSync(mechanicalPath, 'utf8'));
  const authoredPairKeys = mechanical.records
    .filter((record: any) => record.category === 'traditional-simplified')
    .flatMap((record: any) => {
      if (record.leftScalars.length !== record.rightScalars.length) {
        throw new Error(`cannot derive scalar exclusions from unequal authored pair '${record.id}'`);
      }
      return record.leftScalars
        .map((leftScalar: number, index: number) => [leftScalar, record.rightScalars[index]] as const)
        .filter(([leftScalar, rightScalar]: readonly [number, number]) => leftScalar !== rightScalar)
        .map(([leftScalar, rightScalar]: readonly [number, number]) => [leftScalar, rightScalar].sort((a, b) => a - b).join(':'));
    })
    .filter((value: string, index: number, values: string[]) => values.indexOf(value) === index)
    .sort((a: string, b: string) => a.localeCompare(b));
  let rendered: Awaited<ReturnType<typeof renderGlyphs>>;
  try {
    rendered = await renderGlyphs(inventory.scalars.map((row: any) => row.scalar));
  } catch (error) {
    if (!(error instanceof RendererUnavailableError)) throw error;
    const candidates = {
      schemaVersion: VISUAL_SCHEMA_VERSION,
      input: { scalarInventoryPath: 'data/unicode/generated/scalar-inventory.json', scalarInventorySha256: sha256(inventoryBytes), scalarCount: inventory.scalars.length },
      renderingEnvironment: null,
      threshold: { algorithm: 'dhash-64', maximumHammingDistance: MAX_HAMMING_DISTANCE, ordering: ['distance', 'leftScalar', 'rightScalar'] },
      availability: { status: 'unavailable', reason: 'pinned renderer unavailable or lacks complete inventory coverage' },
      exclusions: { identicalScalarSequences: true, authoredTraditionalSimplifiedPairKeys: authoredPairKeys },
      glyphs: [],
      candidates: [],
      totals: { glyphs: 0, candidates: 0 },
    };
    const reviewPlan = {
      schemaVersion: VISUAL_SCHEMA_VERSION,
      candidateManifestPath: 'data/unicode/generated/visual-candidates.json',
      candidateManifestSha256: sha256Json(candidates),
      ordering: ['distance', 'leftScalar', 'rightScalar'],
      maximumBatchSize: 50,
      aggregateIndexOwner: 'serialized-follow-up-only',
      batches: [],
      totals: { candidates: 0, batches: 0 },
    };
    validateVisualArtifacts(candidates, reviewPlan, repoRoot);
    return [serialize(candidates), serialize(reviewPlan)] as const;
  }
  const excluded = new Set(authoredPairKeys);
  const candidateRows: any[] = [];
  for (let leftIndex = 0; leftIndex < rendered.glyphs.length; leftIndex += 1) {
    const left = rendered.glyphs[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < rendered.glyphs.length; rightIndex += 1) {
      const right = rendered.glyphs[rightIndex];
      const leftScalar = Math.min(left.scalar, right.scalar);
      const rightScalar = Math.max(left.scalar, right.scalar);
      if (excluded.has(`${leftScalar}:${rightScalar}`)) continue;
      const distance = hammingDistance64(left.perceptualHash64, right.perceptualHash64);
      if (distance > MAX_HAMMING_DISTANCE) continue;
      const row: any = {
        id: `visual-u${leftScalar.toString(16).padStart(4, '0')}-u${rightScalar.toString(16).padStart(4, '0')}`,
        leftScalar,
        rightScalar,
        leftGlyphRef: `u${leftScalar.toString(16).padStart(4, '0')}`,
        rightGlyphRef: `u${rightScalar.toString(16).padStart(4, '0')}`,
        leftPerceptualHash64: left.scalar === leftScalar ? left.perceptualHash64 : right.perceptualHash64,
        rightPerceptualHash64: right.scalar === rightScalar ? right.perceptualHash64 : left.perceptualHash64,
        distance,
        renderingEnvironmentRefs: [RENDERING_ENVIRONMENT_ID],
        reviewStatus: 'provisional',
        learnerEligible: false,
        cautionJa: null,
      };
      row.checksumSha256 = sha256Json({ ...row, checksumSha256: undefined });
      candidateRows.push(row);
    }
  }
  candidateRows.sort((a, b) => a.distance - b.distance || a.leftScalar - b.leftScalar || a.rightScalar - b.rightScalar);
  const candidates = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    input: { scalarInventoryPath: 'data/unicode/generated/scalar-inventory.json', scalarInventorySha256: sha256(inventoryBytes), scalarCount: inventory.scalars.length },
    renderingEnvironment: {
      id: RENDERING_ENVIRONMENT_ID,
      reference: 'docs/content/unicode-rendering-inventory.md#pinned-reference-renderer',
      playwrightImage: PLAYWRIGHT_IMAGE,
      browser: 'chromium-149.0.7827.55',
      fontInput: 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular',
      fontAggregateSha256: rendered.fontChecksumSha256,
      canvas: { width: 64, height: 64, fontSizePx: 48, weight: 400, grayscale: 'integer-rec601', background: 'white', foreground: 'black' },
    },
    threshold: { algorithm: 'dhash-64', maximumHammingDistance: MAX_HAMMING_DISTANCE, ordering: ['distance', 'leftScalar', 'rightScalar'] },
    availability: { status: 'available', reason: null },
    exclusions: { identicalScalarSequences: true, authoredTraditionalSimplifiedPairKeys: authoredPairKeys },
    glyphs: rendered.glyphs,
    candidates: candidateRows,
    totals: { glyphs: rendered.glyphs.length, candidates: candidateRows.length },
  };
  const reviewPlan = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    candidateManifestPath: 'data/unicode/generated/visual-candidates.json',
    candidateManifestSha256: sha256Json(candidates),
    ordering: ['distance', 'leftScalar', 'rightScalar'],
    maximumBatchSize: 50,
    aggregateIndexOwner: 'serialized-follow-up-only',
    batches: buildReviewBatches(candidateRows),
    totals: { candidates: candidateRows.length, batches: Math.ceil(candidateRows.length / 50) },
  };
  validateVisualArtifacts(candidates, reviewPlan, repoRoot);
  return [serialize(candidates), serialize(reviewPlan)] as const;
}

export function publishTransactionally(
  paths: readonly [string, string],
  outputs: readonly [string, string],
  replace: (from: string, to: string) => void = renameSync,
): void {
  const prior = paths.map((path) => existsSync(path) ? readFileSync(path) : null);
  const staging = mkdtempSync(join(dirname(paths[0]), '.unicode-visual-stage-'));
  try {
    const staged = outputs.map((bytes, index) => {
      const path = join(staging, `${index}.json`);
      writeFileSync(path, bytes);
      return path;
    });
    try {
      staged.forEach((path, index) => replace(path, paths[index]));
    } catch (error) {
      prior.forEach((bytes, index) => bytes === null ? rmSync(paths[index], { force: true }) : writeFileSync(paths[index], bytes));
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function runPinned(mode: '--write' | '--check'): never {
  const command = ['set -euo pipefail', 'corepack pnpm config set store-dir /pnpm/store', 'corepack pnpm install --frozen-lockfile', `corepack pnpm exec node scripts/generate_unicode_visual_candidates.ts --internal ${mode}`].join('\n');
  const result = spawnSync('docker', ['run', '--rm', '--init', '--platform=linux/amd64', '--ipc=host', '--mount', `type=bind,source=${repoRoot},target=/work`, '--mount', 'type=volume,source=chabiko-visual-pnpm-store-v1,target=/pnpm/store', '--mount', 'type=volume,target=/work/node_modules', '--workdir=/work', '--env=CI=1', PLAYWRIGHT_IMAGE, 'bash', '-lc', command], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

async function main() {
  const args = process.argv.slice(2);
  const internal = args[0] === '--internal';
  const mode = (internal ? args[1] : args[0]) as '--write' | '--check';
  if (!['--write', '--check'].includes(mode)) throw new Error('Usage: generate_unicode_visual_candidates.ts [--write|--check]');
  if (!internal) runPinned(mode);
  const outputs = await generate();
  if (mode === '--write') {
    publishTransactionally([candidatesPath, reviewPlanPath], outputs);
    console.log('Unicode visual candidates published');
    return;
  }
  const current = [readFileSync(candidatesPath, 'utf8'), readFileSync(reviewPlanPath, 'utf8')];
  if (current[0] !== outputs[0] || current[1] !== outputs[1]) throw new Error('Unicode visual candidate artifacts are stale');
  console.log('Unicode visual candidate artifacts are current');
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entryPoint === import.meta.url) {
  await main();
}
