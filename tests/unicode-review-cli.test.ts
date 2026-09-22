import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { appendUnicodeReviewJournalEvent, loadUnicodeReviewJournal } from '../scripts/unicode_review_journal';

const sourceRoot = resolve(process.cwd());
const temporaryRoots: string[] = [];

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value: unknown): string {
  return sha256(`${JSON.stringify(value)}\n`);
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  return Uint8Array.from([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
  const out = new Uint8Array(12 + data.byteLength);
  out.set(uint32(data.byteLength), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.byteLength);
  out.set(uint32(crc32(crcInput)), 8 + data.byteLength);
  return out;
}

function pinnedGlyphPng(tile: Uint8Array): Uint8Array {
  const raw = new Uint8Array(64 * 65);
  for (let row = 0; row < 64; row += 1) raw.set(tile.subarray(row * 64, (row + 1) * 64), row * 65 + 1);
  const ihdr = Uint8Array.from([...uint32(64), ...uint32(64), 8, 0, 0, 0, 0]);
  const chunks = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array()),
  ];
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const png = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return png;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createFixture(): {
  readonly root: string;
  readonly repository: string;
  readonly external: string;
  readonly script: string;
  readonly input: string;
  readonly candidateId: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-unicode-cli-'));
  temporaryRoots.push(root);
  const repository = join(root, 'fixture-repository');
  const external = join(root, 'external');
  mkdirSync(join(repository, 'scripts'), { recursive: true });
  mkdirSync(join(repository, '.git'));
  mkdirSync(external);
  mkdirSync(join(external, 'caller-cwd'));
  writeJson(join(repository, 'package.json'), { type: 'module' });
  for (const file of [
    'run_unicode_review_v021.ts',
    'run_unicode_review_workflow_v021.ts',
    'unicode_review_cli_context.ts',
    'unicode_review_external_io.ts',
    'unicode_review_journal.ts',
    'unicode_review_pixels.ts',
    'unicode_review_v021.ts',
    'unicode_visual_contract.ts',
    'unicode_review_workflow.ts',
  ]) {
    copyFileSync(join(sourceRoot, 'scripts', file), join(repository, 'scripts', file));
  }

  const left = new Uint8Array(64 * 64).fill(255);
  const right = Uint8Array.from(left);
  right[0] = 0;
  const leftGlyph = { id: 'u4e00', scalar: 0x4e00, perceptualHash64: '0000000000000000', derivativeSha256: sha256(left) };
  const rightGlyph = { id: 'u4e01', scalar: 0x4e01, perceptualHash64: '0000000000000001', derivativeSha256: sha256(right) };
  const inventory = { scalars: [{ scalar: leftGlyph.scalar }, { scalar: rightGlyph.scalar }] };
  const inventoryPath = join(repository, 'data/unicode/generated/scalar-inventory.json');
  writeJson(inventoryPath, inventory);
  writeJson(join(repository, 'data/unicode/generated/mechanical-records.json'), { records: [] });
  const candidate = {
    id: 'visual-u4e00-u4e01',
    leftScalar: leftGlyph.scalar,
    rightScalar: rightGlyph.scalar,
    leftGlyphRef: leftGlyph.id,
    rightGlyphRef: rightGlyph.id,
    leftPerceptualHash64: leftGlyph.perceptualHash64,
    rightPerceptualHash64: rightGlyph.perceptualHash64,
    distance: 1,
    renderingEnvironmentRefs: ['playwright-chromium-unifont-v1'],
    reviewStatus: 'provisional',
    learnerEligible: false,
    cautionJa: null,
    checksumSha256: '',
  };
  candidate.checksumSha256 = sha256Json({ ...candidate, checksumSha256: undefined });
  const candidates = {
    schemaVersion: 1,
    input: {
      scalarInventoryPath: 'data/unicode/generated/scalar-inventory.json',
      scalarInventorySha256: sha256(readFileSync(inventoryPath)),
      scalarCount: inventory.scalars.length,
    },
    renderingEnvironment: {
      id: 'playwright-chromium-unifont-v1',
      reference: 'docs/content/unicode-rendering-inventory.md#pinned-reference-renderer',
      playwrightImage: 'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48',
      browser: 'chromium-149.0.7827.55',
      fontInput: 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular',
      fontAggregateSha256: 'a'.repeat(64),
      canvas: { width: 64, height: 64, fontSizePx: 48, weight: 400, grayscale: 'integer-rec601', background: 'white', foreground: 'black' },
    },
    threshold: { algorithm: 'dhash-64', maximumHammingDistance: 8, ordering: ['distance', 'leftScalar', 'rightScalar'] },
    availability: { status: 'available', reason: null },
    exclusions: { identicalScalarSequences: true, authoredTraditionalSimplifiedPairKeys: [] },
    glyphs: [leftGlyph, rightGlyph],
    candidates: [candidate],
    totals: { glyphs: 2, candidates: 1 },
  };
  const candidatePath = join(repository, 'data/unicode/generated/visual-candidates.json');
  writeJson(candidatePath, candidates);
  writeJson(join(repository, 'data/unicode/generated/visual-review-plan.json'), {
    schemaVersion: 1,
    candidateManifestPath: 'data/unicode/generated/visual-candidates.json',
    candidateManifestSha256: sha256Json(candidates),
    ordering: ['distance', 'leftScalar', 'rightScalar'],
    maximumBatchSize: 50,
    aggregateIndexOwner: 'serialized-follow-up-only',
    batches: [{
      id: 'unicode-visual-review-0001',
      candidateIds: [candidate.id],
      candidateChecksumsSha256: [candidate.checksumSha256],
      outputPath: 'data/unicode/reviews/unicode-visual-review-0001.json',
    }],
    totals: { candidates: 1, batches: 1 },
  });
  const leftPng = join(external, 'left.png');
  const rightPng = join(external, 'right.png');
  writeFileSync(leftPng, pinnedGlyphPng(left));
  writeFileSync(rightPng, pinnedGlyphPng(right));
  const input = join(external, 'bundle-input.json');
  writeJson(input, {
    items: [{
      purpose: 'manifest',
      candidateId: candidate.id,
      leftGlyphPngPath: leftPng,
      rightGlyphPngPath: rightPng,
    }],
  });
  return { root, repository, external, script: join(repository, 'scripts/run_unicode_review_v021.ts'), input, candidateId: candidate.id };
}

function runBundle(script: string, args: readonly string[], cwd: string) {
  const result = spawnSync(process.execPath, [script, 'bundle', ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function bitDistance(left: bigint, right: bigint): number {
  let value = left ^ right;
  let distance = 0;
  while (value !== 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

function calibrationHashes(count: number): readonly bigint[] {
  const hashes: bigint[] = [];
  let state = 0x9e3779b97f4a7c15n;
  const mask = (1n << 64n) - 1n;
  while (hashes.length < count) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    if (hashes.every((hash) => bitDistance(hash, state) >= 12)) hashes.push(state);
  }
  return hashes;
}

function calibrationClass(index: number): 'strong-positive' | 'strong-negative' | 'hard-probe' | 'relation-trap' {
  if (index < 20) return 'strong-positive';
  if (index < 40) return 'strong-negative';
  if (index < 64) return 'hard-probe';
  return 'relation-trap';
}

function expectedOutcome(kind: ReturnType<typeof calibrationClass>): 'confusable' | 'not-confusable' | 'borderline' {
  if (kind === 'strong-positive') return 'confusable';
  if (kind === 'strong-negative') return 'not-confusable';
  return kind === 'hard-probe' ? 'confusable' : 'borderline';
}

function createCalibrationFixture() {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-unicode-calibration-cli-'));
  temporaryRoots.push(root);
  const repository = join(root, 'fixture-repository');
  const external = join(root, 'external');
  mkdirSync(join(repository, 'scripts'), { recursive: true });
  mkdirSync(join(repository, '.git'));
  mkdirSync(external);
  mkdirSync(join(external, 'caller-cwd'));
  writeJson(join(repository, 'package.json'), { type: 'module' });
  for (const file of [
    'run_unicode_review_v021.ts',
    'run_unicode_review_workflow_v021.ts',
    'unicode_review_cli_context.ts',
    'unicode_review_external_io.ts',
    'unicode_review_journal.ts',
    'unicode_review_pixels.ts',
    'unicode_review_v021.ts',
    'unicode_visual_contract.ts',
    'unicode_review_workflow.ts',
  ]) {
    copyFileSync(join(sourceRoot, 'scripts', file), join(repository, 'scripts', file));
  }

  const hashes = calibrationHashes(72);
  const glyphs: Array<Record<string, unknown>> = [];
  const scalars: Array<Record<string, number>> = [];
  const candidateRows: Array<Record<string, unknown>> = [];
  const inputItems: Array<Record<string, string>> = [];
  const specs: Array<{ candidateId: string; controllerControlId: string | null; class: ReturnType<typeof calibrationClass>; expectedOutcome: ReturnType<typeof expectedOutcome> }> = [];
  for (let index = 0; index < 72; index += 1) {
    const leftScalar = 0x4e00 + index * 2;
    const rightScalar = leftScalar + 1;
    const leftTile = new Uint8Array(64 * 64).fill(index * 2);
    const rightTile = new Uint8Array(64 * 64).fill(index * 2 + 1);
    const leftId = `u${leftScalar.toString(16)}`;
    const rightId = `u${rightScalar.toString(16)}`;
    const leftHash = hashes[index].toString(16).padStart(16, '0');
    const rightHash = (hashes[index] ^ 1n).toString(16).padStart(16, '0');
    const leftPath = join(external, `glyph-${index}-left.png`);
    const rightPath = join(external, `glyph-${index}-right.png`);
    writeFileSync(leftPath, pinnedGlyphPng(leftTile));
    writeFileSync(rightPath, pinnedGlyphPng(rightTile));
    glyphs.push(
      { id: leftId, scalar: leftScalar, perceptualHash64: leftHash, derivativeSha256: sha256(leftTile) },
      { id: rightId, scalar: rightScalar, perceptualHash64: rightHash, derivativeSha256: sha256(rightTile) },
    );
    scalars.push({ scalar: leftScalar }, { scalar: rightScalar });
    const candidate = {
      id: `visual-u${leftScalar.toString(16)}-u${rightScalar.toString(16)}`,
      leftScalar,
      rightScalar,
      leftGlyphRef: leftId,
      rightGlyphRef: rightId,
      leftPerceptualHash64: leftHash,
      rightPerceptualHash64: rightHash,
      distance: 1,
      renderingEnvironmentRefs: ['playwright-chromium-unifont-v1'],
      reviewStatus: 'provisional',
      learnerEligible: false,
      cautionJa: null,
      checksumSha256: '',
    };
    candidate.checksumSha256 = sha256Json({ ...candidate, checksumSha256: undefined });
    candidateRows.push(candidate);
    const kind = calibrationClass(index);
    const controllerControlId = kind === 'hard-probe' ? null : `fixture-control-${index}`;
    inputItems.push(controllerControlId === null
      ? { purpose: 'manifest', candidateId: candidate.id, leftGlyphPngPath: leftPath, rightGlyphPngPath: rightPath }
      : { purpose: 'external-control', controllerControlId, leftGlyphRef: leftId, rightGlyphRef: rightId, leftGlyphPngPath: leftPath, rightGlyphPngPath: rightPath });
    specs.push({ candidateId: candidate.id, controllerControlId, class: kind, expectedOutcome: expectedOutcome(kind) });
  }
  const inventory = { scalars };
  const inventoryPath = join(repository, 'data/unicode/generated/scalar-inventory.json');
  writeJson(inventoryPath, inventory);
  writeJson(join(repository, 'data/unicode/generated/mechanical-records.json'), { records: [] });
  const candidates = {
    schemaVersion: 1,
    input: { scalarInventoryPath: 'data/unicode/generated/scalar-inventory.json', scalarInventorySha256: sha256(readFileSync(inventoryPath)), scalarCount: scalars.length },
    renderingEnvironment: {
      id: 'playwright-chromium-unifont-v1', reference: 'docs/content/unicode-rendering-inventory.md#pinned-reference-renderer',
      playwrightImage: 'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48', browser: 'chromium-149.0.7827.55',
      fontInput: 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular', fontAggregateSha256: 'a'.repeat(64),
      canvas: { width: 64, height: 64, fontSizePx: 48, weight: 400, grayscale: 'integer-rec601', background: 'white', foreground: 'black' },
    },
    threshold: { algorithm: 'dhash-64', maximumHammingDistance: 8, ordering: ['distance', 'leftScalar', 'rightScalar'] },
    availability: { status: 'available', reason: null }, exclusions: { identicalScalarSequences: true, authoredTraditionalSimplifiedPairKeys: [] },
    glyphs, candidates: candidateRows, totals: { glyphs: glyphs.length, candidates: candidateRows.length },
  };
  const candidatePath = join(repository, 'data/unicode/generated/visual-candidates.json');
  writeJson(candidatePath, candidates);
  const batches = Array.from({ length: Math.ceil(candidateRows.length / 50) }, (_, index) => {
    const entries = candidateRows.slice(index * 50, (index + 1) * 50);
    const id = `unicode-visual-review-${String(index + 1).padStart(4, '0')}`;
    return { id, candidateIds: entries.map((entry) => entry.id), candidateChecksumsSha256: entries.map((entry) => entry.checksumSha256), outputPath: `data/unicode/reviews/${id}.json` };
  });
  writeJson(join(repository, 'data/unicode/generated/visual-review-plan.json'), {
    schemaVersion: 1, candidateManifestPath: 'data/unicode/generated/visual-candidates.json', candidateManifestSha256: sha256Json(candidates),
    ordering: ['distance', 'leftScalar', 'rightScalar'], maximumBatchSize: 50, aggregateIndexOwner: 'serialized-follow-up-only', batches,
    totals: { candidates: candidateRows.length, batches: batches.length },
  });
  const input = join(external, 'calibration-input-grouped.json');
  writeJson(input, { items: inputItems });
  return { repository, external, script: join(repository, 'scripts/run_unicode_review_v021.ts'), input, specs };
}

function runCalibration(script: string, args: readonly string[], cwd: string) {
  const result = spawnSync(process.execPath, [script, 'calibrate', ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function createCalibrationCommandFixture() {
  const fixture = createCalibrationFixture();
  const input = fixture.input;
  const reviewerOutput = join(fixture.external, 'reviewer');
  const controllerOutput = join(fixture.external, 'controller');
  const bundle = runBundle(fixture.script, ['--input', input, '--reviewer-output', reviewerOutput, '--controller-output', controllerOutput, '--namespace-salt', 'e'.repeat(64)], join(fixture.external, 'caller-cwd'));
  expect(bundle.status, bundle.output).toBe(0);
  const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
  const contract = {
    rubricVersion: 'unicode-visual-v0.2.1', promptChecksumSha256: 'b'.repeat(64), renderingEvidenceChecksumSha256: sidecar.renderingEvidenceChecksumSha256,
    reviewerModelVersion: 'trusted-vision-model-1', transportContractChecksumSha256: 'c'.repeat(64), visionCapabilityEvidenceRef: 'external-attestation:trusted-vision-transport',
  };
  const contractPath = join(fixture.external, 'review-contract.json');
  const descriptorPath = join(fixture.external, 'review-context.json');
  writeJson(contractPath, contract);
  writeJson(descriptorPath, { inputPath: input, reviewerBundlePath: join(reviewerOutput, 'reviewer-bundle.json'), controllerSidecarPath: join(controllerOutput, 'controller-sidecar.json'), contractPath });
  type CalibrationSidecarEntry = { readonly purpose: string; readonly candidateId?: string; readonly controllerControlId?: string; readonly pairRef: string };
  const entryBySource = new Map<string, CalibrationSidecarEntry>(sidecar.entries.map((entry: CalibrationSidecarEntry): [string, CalibrationSidecarEntry] => {
    const source = entry.purpose === 'manifest' ? entry.candidateId : entry.controllerControlId;
    expect(source).toBeDefined();
    return [source as string, entry];
  }));
  const items = fixture.specs.map((spec) => ({ pairRef: entryBySource.get(spec.controllerControlId ?? spec.candidateId)!.pairRef, class: spec.class, expectedOutcome: spec.expectedOutcome }));
  const key = { protocolVersion: 'unicode-visual-v0.2.1', reviewerBundleChecksumSha256: sidecar.reviewerBundleChecksumSha256, contract, items };
  const results = items.map(({ pairRef, expectedOutcome }) => ({ pairRef, visualOutcome: expectedOutcome }));
  const receipt = {
    protocolVersion: 'unicode-visual-v0.2.1', role: 'reviewer-a', reviewerSessionId: 'calibration-reviewer-a', reviewerIndependenceContextId: 'calibration-context-a',
    reviewerModelVersion: contract.reviewerModelVersion, visionCapabilityEvidenceRef: contract.visionCapabilityEvidenceRef, rubricVersion: contract.rubricVersion,
    promptChecksumSha256: contract.promptChecksumSha256, renderingEvidenceChecksumSha256: contract.renderingEvidenceChecksumSha256,
    transportProfileChecksumSha256: contract.transportContractChecksumSha256, reviewerBundleChecksumSha256: sidecar.reviewerBundleChecksumSha256,
    items: sidecar.entries.map((entry: { pairRef: string; evidenceChecksumSha256: string }) => ({ pairRef: entry.pairRef, evidenceChecksumSha256: entry.evidenceChecksumSha256 })),
    resultsChecksumSha256: sha256Json(results),
  };
  const keyPath = join(fixture.external, 'sealed-key.json');
  const submissionPath = join(fixture.external, 'submission.json');
  writeJson(keyPath, key);
  writeJson(submissionPath, { results, receipt });
  return { ...fixture, reviewerOutput, sidecar, descriptorPath, keyPath, submissionPath, key };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
});

describe('#477 Unicode review bundle CLI', () => {
  it('runs the documented command against a self-owned canonical fixture with deterministic opaque outputs', () => {
    const fixture = createFixture();
    const salt = 'a'.repeat(64);
    const firstReviewer = join(fixture.external, 'reviewer-first');
    const firstController = join(fixture.external, 'controller-first');
    const first = runBundle(fixture.script, [
      '--input', fixture.input,
      '--reviewer-output', firstReviewer,
      '--controller-output', firstController,
      '--namespace-salt', salt,
    ], join(fixture.external, 'caller-cwd'));
    expect(first.status, first.output).toBe(0);
    const reviewerBundle = readFileSync(join(firstReviewer, 'reviewer-bundle.json'), 'utf8');
    const controllerSidecar = readFileSync(join(firstController, 'controller-sidecar.json'), 'utf8');
    expect(reviewerBundle).toContain('pair-');
    expect(reviewerBundle).not.toContain(fixture.candidateId);
    expect(reviewerBundle).not.toContain(salt);
    expect(controllerSidecar).toContain(fixture.candidateId);
    expect(controllerSidecar).toContain(salt);
    expect(existsSync(join(firstReviewer, 'pairs'))).toBe(true);

    const secondReviewer = join(fixture.external, 'reviewer-second');
    const secondController = join(fixture.external, 'controller-second');
    const second = runBundle(fixture.script, [
      '--input', fixture.input,
      '--reviewer-output', secondReviewer,
      '--controller-output', secondController,
      '--namespace-salt', salt,
    ], join(fixture.external, 'caller-cwd'));
    expect(second.status).toBe(0);
    expect(readFileSync(join(secondReviewer, 'reviewer-bundle.json'), 'utf8')).toBe(reviewerBundle);
    expect(readFileSync(join(secondController, 'controller-sidecar.json'), 'utf8')).toBe(controllerSidecar);

    const rerun = runBundle(fixture.script, [
      '--input', fixture.input,
      '--reviewer-output', firstReviewer,
      '--controller-output', firstController,
      '--namespace-salt', salt,
    ], join(fixture.external, 'caller-cwd'));
    expect(rerun.status).not.toBe(0);
    expect(readFileSync(join(firstReviewer, 'reviewer-bundle.json'), 'utf8')).toBe(reviewerBundle);
  });

  it('rejects malformed arguments, controller input, repository aliases, and aliased output roots before writing', () => {
    const fixture = createFixture();
    const reviewerOutput = join(fixture.external, 'reviewer');
    const controllerOutput = join(fixture.external, 'controller');
    const unknown = runBundle(fixture.script, ['--unknown', 'value'], fixture.external);
    expect(unknown.status).not.toBe(0);
    expect(unknown.output).toMatch(/unknown argument/i);

    writeJson(fixture.input, { items: [{ purpose: 'manifest', candidateId: fixture.candidateId, leftGlyphPngPath: join(fixture.external, 'left.png'), rightGlyphPngPath: join(fixture.external, 'right.png'), forbidden: 'controller-marker' }] });
    const malformed = runBundle(fixture.script, ['--input', fixture.input, '--reviewer-output', reviewerOutput, '--controller-output', controllerOutput], fixture.external);
    expect(malformed.status).not.toBe(0);
    expect(malformed.output).not.toContain('controller-marker');
    expect(existsSync(reviewerOutput)).toBe(false);
    expect(existsSync(controllerOutput)).toBe(false);

    const repoAlias = join(fixture.external, 'repository-alias');
    symlinkSync(fixture.repository, repoAlias, 'dir');
    const dangerous = runBundle(fixture.script, ['--input', join(repoAlias, 'data/unicode/generated/visual-candidates.json'), '--reviewer-output', reviewerOutput, '--controller-output', controllerOutput], fixture.external);
    expect(dangerous.status).not.toBe(0);
    expect(dangerous.output).toMatch(/worktree|repository/i);

    const outputParent = join(fixture.external, 'output-parent');
    mkdirSync(outputParent);
    const outputAlias = join(fixture.external, 'output-alias');
    symlinkSync(outputParent, outputAlias, 'dir');
    const aliased = runBundle(fixture.script, [
      '--input', fixture.input,
      '--reviewer-output', join(outputParent, 'reviewer'),
      '--controller-output', join(outputAlias, 'reviewer'),
    ], fixture.external);
    expect(aliased.status).not.toBe(0);
    expect(aliased.output).toMatch(/distinct|non-nested/i);
    expect(existsSync(join(outputParent, 'reviewer'))).toBe(false);
  });

  it('authorizes an externally bound 72-item calibration and serializes only replay evidence', () => {
    const fixture = createCalibrationCommandFixture();
    const output = join(fixture.external, 'calibration-pass.json');
    const result = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', output], join(fixture.external, 'caller-cwd'));
    expect(result.status, result.output).toBe(0);
    const record = JSON.parse(readFileSync(output, 'utf8'));
    expect(Object.keys(record).sort()).toEqual(['evaluation', 'replayBinding']);
    expect(record.evaluation.pass).toBe(true);
    expect(record.evaluation.metrics.evaluated).toBe(true);
    expect(record.replayBinding).not.toBeNull();
    expect(JSON.stringify(record)).not.toContain('evaluator-only');
    expect(JSON.stringify(record)).not.toContain('strong-positive');
    const reviewerOrder = JSON.parse(readFileSync(join(fixture.reviewerOutput, 'reviewer-bundle.json'), 'utf8')).items
      .map((item: { pairRef: string }) => fixture.sidecar.entries.find((entry: { pairRef: string }) => entry.pairRef === item.pairRef).candidateId);
    expect(reviewerOrder).not.toEqual(fixture.specs.map((spec) => spec.candidateId));
  });

  it('writes non-authoritative machine FAIL records for stale key contracts and missing context pixels', () => {
    const fixture = createCalibrationCommandFixture();
    const staleKey = { ...fixture.key, contract: { ...fixture.key.contract, promptChecksumSha256: '0'.repeat(64) } };
    writeJson(fixture.keyPath, staleKey);
    const staleOutput = join(fixture.external, 'calibration-stale-key.json');
    const stale = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', staleOutput], join(fixture.external, 'caller-cwd'));
    expect(stale.status).not.toBe(0);
    const staleRecord = JSON.parse(readFileSync(staleOutput, 'utf8'));
    expect(staleRecord).toMatchObject({ evaluation: { pass: false, metrics: { evaluated: false, rawAgreement: null } }, replayBinding: null });
    expect(staleRecord.evaluation.calibrationResultChecksumSha256).toMatch(/^[0-9a-f]{64}$/);

    writeJson(fixture.keyPath, fixture.key);
    const stored = JSON.parse(readFileSync(join(fixture.reviewerOutput, 'reviewer-bundle.json'), 'utf8'));
    rmSync(join(fixture.reviewerOutput, stored.items[0].pixelPath));
    const missingOutput = join(fixture.external, 'calibration-missing-png.json');
    const missing = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', missingOutput], join(fixture.external, 'caller-cwd'));
    expect(missing.status).not.toBe(0);
    const missingRecord = JSON.parse(readFileSync(missingOutput, 'utf8'));
    expect(missingRecord).toMatchObject({ evaluation: { pass: false, metrics: { evaluated: false, strongPositiveExact: null, confusionMatrix: null }, calibrationResultChecksumSha256: null }, replayBinding: null });
  });

  it('refuses calibration output inside reviewer or controller artifact directories before writing', () => {
    const fixture = createCalibrationCommandFixture();
    const treeRootBefore = readdirSync(fixture.reviewerOutput).sort();
    const pairsBefore = readdirSync(join(fixture.reviewerOutput, 'pairs')).sort();
    const controllerOutput = join(fixture.external, 'controller');
    const controllerBefore = readdirSync(controllerOutput).sort();
    const treeRoot = join(fixture.reviewerOutput, 'calibration-output.json');
    const direct = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', treeRoot], join(fixture.external, 'caller-cwd'));
    expect(direct.status).not.toBe(0);
    expect(direct.output).toMatch(/calibration output must be disjoint from the reviewer bundle tree/i);
    expect(existsSync(treeRoot)).toBe(false);

    const nested = join(fixture.reviewerOutput, 'pairs', 'calibration-output.json');
    const nestedResult = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', nested], join(fixture.external, 'caller-cwd'));
    expect(nestedResult.status).not.toBe(0);
    expect(existsSync(nested)).toBe(false);
    expect(readdirSync(fixture.reviewerOutput).sort()).toEqual(treeRootBefore);
    expect(readdirSync(join(fixture.reviewerOutput, 'pairs')).sort()).toEqual(pairsBefore);

    const controllerNested = join(controllerOutput, 'nested', 'calibration-output.json');
    const controllerResult = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', controllerNested], join(fixture.external, 'caller-cwd'));
    expect(controllerResult.status).not.toBe(0);
    expect(controllerResult.output).toMatch(/calibration output must be disjoint from the controller artifact directory/i);
    expect(existsSync(controllerNested)).toBe(false);
    expect(readdirSync(controllerOutput).sort()).toEqual(controllerBefore);
  });

  it('does not publish a FAIL record when a sealed key or submission overlaps the blind tree', () => {
    const fixture = createCalibrationCommandFixture();
    const movedKey = join(fixture.reviewerOutput, 'sealed-key.json');
    copyFileSync(fixture.keyPath, movedKey);
    const keyOutput = join(fixture.external, 'calibration-key-overlap.json');
    const keyResult = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', movedKey, '--submission', fixture.submissionPath, '--output', keyOutput], join(fixture.external, 'caller-cwd'));
    expect(keyResult.status).not.toBe(0);
    expect(keyResult.output).toMatch(/sealed calibration key must be disjoint from the reviewer bundle tree/);
    expect(existsSync(keyOutput)).toBe(false);

    const movedSubmission = join(fixture.reviewerOutput, 'submission.json');
    copyFileSync(fixture.submissionPath, movedSubmission);
    const submissionOutput = join(fixture.external, 'calibration-submission-overlap.json');
    const submissionResult = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', movedSubmission, '--output', submissionOutput], join(fixture.external, 'caller-cwd'));
    expect(submissionResult.status).not.toBe(0);
    expect(submissionResult.output).toMatch(/calibration submission must be disjoint from the reviewer bundle tree/);
    expect(existsSync(submissionOutput)).toBe(false);
    expect(readdirSync(fixture.reviewerOutput)).not.toContain('calibration-submission-overlap.json');
  });

  it('does not publish a FAIL record when a context role resolves inside the blind reviewer tree', () => {
    const fixture = createCalibrationCommandFixture();
    const descriptor = JSON.parse(readFileSync(fixture.descriptorPath, 'utf8'));
    writeJson(fixture.descriptorPath, { ...descriptor, controllerSidecarPath: join(fixture.reviewerOutput, 'moved-controller-sidecar.json') });
    const output = join(fixture.external, 'calibration-context-overlap.json');
    const result = runCalibration(fixture.script, ['--context', fixture.descriptorPath, '--sealed-key', fixture.keyPath, '--submission', fixture.submissionPath, '--output', output], join(fixture.external, 'caller-cwd'));
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/context controller sidecar must be disjoint from the reviewer bundle tree/);
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(fixture.reviewerOutput)).not.toContain('calibration-context-overlap.json');
  });

  it('does not publish into the blind tree before malformed role paths are rejected', () => {
    const fixture = createCalibrationCommandFixture();
    const reviewerBefore = readdirSync(fixture.reviewerOutput).sort();
    const malformedContext = join(fixture.external, 'malformed-review-context.json');
    writeFileSync(malformedContext, '{"unexpected":true}\n');
    const cases = [
      ['relative sealed key', fixture.descriptorPath, 'relative-key.json', fixture.submissionPath],
      ['relative submission', fixture.descriptorPath, fixture.keyPath, 'relative-submission.json'],
      ['malformed context', malformedContext, fixture.keyPath, fixture.submissionPath],
    ] as const;
    for (const [label, context, sealedKey, submission] of cases) {
      const output = join(fixture.reviewerOutput, `${label.replaceAll(' ', '-')}.json`);
      const result = runCalibration(fixture.script, ['--context', context, '--sealed-key', sealedKey, '--submission', submission, '--output', output], join(fixture.external, 'caller-cwd'));
      expect(result.status, `${label}: ${result.output}`).not.toBe(0);
      expect(existsSync(output), label).toBe(false);
    }
    expect(readdirSync(fixture.reviewerOutput).sort()).toEqual(reviewerBefore);
  });

});

function runWorkflow(script: string, command: string, args: readonly string[], cwd: string) {
  const result = spawnSync(process.execPath, [script, command, ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function workflowReceipt(
  role: 'reviewer-a' | 'reviewer-b' | 'pass-b',
  contract: Record<string, string>,
  sidecar: { reviewerBundleChecksumSha256: string; entries: Array<{ pairRef: string; evidenceChecksumSha256: string }> },
  results: unknown,
  refs: readonly string[],
) {
  return {
    protocolVersion: 'unicode-visual-v0.2.1',
    role,
    reviewerSessionId: `workflow-${role}-session`,
    reviewerIndependenceContextId: `workflow-${role}-context`,
    reviewerModelVersion: contract.reviewerModelVersion,
    visionCapabilityEvidenceRef: contract.visionCapabilityEvidenceRef,
    rubricVersion: contract.rubricVersion,
    promptChecksumSha256: contract.promptChecksumSha256,
    renderingEvidenceChecksumSha256: contract.renderingEvidenceChecksumSha256,
    transportProfileChecksumSha256: contract.transportContractChecksumSha256,
    reviewerBundleChecksumSha256: sidecar.reviewerBundleChecksumSha256,
    items: sidecar.entries.filter((entry) => refs.includes(entry.pairRef)).map((entry) => ({ pairRef: entry.pairRef, evidenceChecksumSha256: entry.evidenceChecksumSha256 })),
    resultsChecksumSha256: sha256Json(results),
  };
}

describe('#477 Unicode review workflow CLI', () => {
  it('replays a calibrated synthetic wave through independent review and exports only blind subsets', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));

    const initialized = invoke('init', join(fixture.external, 'init.json'));
    expect(initialized.status, initialized.output).toBe(0);
    const planned = invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']);
    expect(planned.status, planned.output).toBe(0);
    const originalBundle = readFileSync(join(reviewerOutput, 'reviewer-bundle.json'));
    writeFileSync(join(reviewerOutput, 'reviewer-bundle.json'), '{"tampered":true}\n');
    const tampered = invoke('resume', join(fixture.external, 'tampered.json'));
    expect(tampered.status, tampered.output).not.toBe(0);
    expect(existsSync(join(fixture.external, 'tampered.json'))).toBe(false);
    writeFileSync(join(reviewerOutput, 'reviewer-bundle.json'), originalBundle);
    const rejectEmptyDirectory = (artifactRoot: string, label: string, extra: readonly string[] = []) => {
      const emptyDirectory = join(artifactRoot, 'unexpected-empty-directory');
      const output = join(fixture.external, `${label}-empty-directory-status.json`);
      const eventBytes = () => readdirSync(join(journal, 'events')).sort().map((name) => [name, readFileSync(join(journal, 'events', name))]);
      const before = eventBytes();
      mkdirSync(emptyDirectory);
      const rejected = invoke('resume', output, extra);
      expect(rejected.status, rejected.output).not.toBe(0);
      expect(rejected.output).toMatch(/unexpected empty directory/);
      expect(existsSync(output)).toBe(false);
      expect(existsSync(emptyDirectory)).toBe(true);
      expect(eventBytes()).toEqual(before);
      rmSync(emptyDirectory, { recursive: true });
    };
    rejectEmptyDirectory(reviewerOutput, 'reviewer');
    rejectEmptyDirectory(controllerOutput, 'controller');
    const resumed = invoke('resume', join(fixture.external, 'resume.json'));
    expect(resumed.status, resumed.output).toBe(0);

    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const manifestEntry = sidecar.entries.find((entry: { purpose: string }) => entry.purpose === 'manifest');
    const aResults = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' : 'not-confusable' }));
    const aSubmission = { results: aResults, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, aResults, aResults.map((result: { pairRef: string }) => result.pairRef)) };
    const aPath = join(fixture.external, 'wave-1-a.json');
    writeJson(aPath, aSubmission);
    const aIngest = invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', aPath]);
    expect(aIngest.status, aIngest.output).toBe(0);

    const blockedBParent = join(fixture.external, 'blocked-b-export');
    mkdirSync(blockedBParent);
    chmodSync(blockedBParent, 0o500);
    const bPrepared = invoke('prepare-b', join(fixture.external, 'b-prepare-status.json'), ['--reviewer-output', join(blockedBParent, 'subset')]);
    chmodSync(blockedBParent, 0o700);
    expect(bPrepared.status, bPrepared.output).not.toBe(0);
    expect(existsSync(join(fixture.external, 'b-prepare-status.json'))).toBe(false);
    const bExport = join(blockedBParent, 'subset');
    const bResumed = invoke('resume', join(fixture.external, 'b-resume-status.json'), ['--reviewer-output', bExport]);
    expect(bResumed.status, bResumed.output).toBe(0);
    const bSubset = JSON.parse(readFileSync(join(bExport, 'reviewer-subset.json'), 'utf8'));
    expect(Object.keys(bSubset).sort()).toEqual(['items', 'protocolVersion']);
    expect(JSON.stringify(bSubset)).not.toContain('visualOutcome');
    expect(bSubset.items.map((item: { pairRef: string }) => item.pairRef)).toEqual([manifestEntry.pairRef]);
    rejectEmptyDirectory(bExport, 'reviewer-b', ['--reviewer-output', bExport]);

    const bResults = [{ pairRef: manifestEntry.pairRef, visualOutcome: 'confusable' }];
    const bPath = join(fixture.external, 'wave-1-b.json');
    writeJson(bPath, { results: bResults, receipt: workflowReceipt('reviewer-b', fixture.key.contract, sidecar, bResults, [manifestEntry.pairRef]) });
    const bIngest = invoke('ingest-b', join(fixture.external, 'b-status.json'), ['--submission', bPath]);
    expect(bIngest.status, bIngest.output).toBe(0);

    const blockedPassBParent = join(fixture.external, 'blocked-pass-b-export');
    mkdirSync(blockedPassBParent);
    chmodSync(blockedPassBParent, 0o500);
    const passBPrepared = invoke('prepare-pass-b', join(fixture.external, 'pass-b-prepare-status.json'), ['--reviewer-output', join(blockedPassBParent, 'subset')]);
    chmodSync(blockedPassBParent, 0o700);
    expect(passBPrepared.status, passBPrepared.output).not.toBe(0);
    expect(existsSync(join(fixture.external, 'pass-b-prepare-status.json'))).toBe(false);
    const passBExport = join(blockedPassBParent, 'subset');
    const passBResumed = invoke('resume', join(fixture.external, 'pass-b-resume-status.json'), ['--reviewer-output', passBExport]);
    expect(passBResumed.status, passBResumed.output).toBe(0);
    expect(JSON.parse(readFileSync(join(passBExport, 'reviewer-subset.json'), 'utf8')).items.map((item: { pairRef: string }) => item.pairRef)).toEqual([manifestEntry.pairRef]);

    const result = { pairRef: manifestEntry.pairRef, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' } };
    const passBPath = join(fixture.external, 'wave-1-pass-b.json');
    writeJson(passBPath, { result, receipt: workflowReceipt('pass-b', fixture.key.contract, sidecar, result, [manifestEntry.pairRef]) });
    const passBIngest = invoke('ingest-pass-b', join(fixture.external, 'pass-b-status.json'), ['--submission', passBPath]);
    expect(passBIngest.status, passBIngest.output).toBe(0);
    const finalized = invoke('finalize', join(fixture.external, 'finalize.json'));
    expect(finalized.status, finalized.output).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.external, 'finalize.json'), 'utf8')).promotions).toHaveLength(1);
    const recoveredFinal = invoke('resume', join(fixture.external, 'finalize-resume.json'));
    expect(recoveredFinal.status, recoveredFinal.output).toBe(0);
    const recoveredFinalStatus = JSON.parse(readFileSync(join(fixture.external, 'finalize-resume.json'), 'utf8'));
    expect(recoveredFinalStatus.promotions).toHaveLength(1);
    expect(recoveredFinalStatus.recordedWaves[0].reviewerBundleChecksumSha256).toBe(sidecar.reviewerBundleChecksumSha256);
  });

  it('resumes a partial Pass B wave against its immutable prepared subset', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: JSON.parse(readFileSync(fixture.input, 'utf8')).items.filter((item: { purpose: string }) => item.purpose === 'manifest').slice(0, 2) });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    const initialized = invoke('init', join(fixture.external, 'init.json'));
    expect(initialized.status, initialized.output).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);

    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const manifestRefs = sidecar.entries.filter((entry: { purpose: string }) => entry.purpose === 'manifest').map((entry: { pairRef: string }) => entry.pairRef);
    expect(manifestRefs).toHaveLength(2);
    const aResults = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' : 'not-confusable' }));
    const aPath = join(fixture.external, 'wave-1-a.json');
    writeJson(aPath, { results: aResults, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, aResults, aResults.map((result: { pairRef: string }) => result.pairRef)) });
    expect(invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', aPath]).status).toBe(0);
    const bSubset = join(fixture.external, 'wave-1-b');
    expect(invoke('prepare-b', join(fixture.external, 'b-prepare-status.json'), ['--reviewer-output', bSubset]).status).toBe(0);
    const bResults = manifestRefs.map((pairRef: string) => ({ pairRef, visualOutcome: 'confusable' }));
    const bPath = join(fixture.external, 'wave-1-b.json');
    writeJson(bPath, { results: bResults, receipt: workflowReceipt('reviewer-b', fixture.key.contract, sidecar, bResults, manifestRefs) });
    expect(invoke('ingest-b', join(fixture.external, 'b-status.json'), ['--submission', bPath]).status).toBe(0);
    const passBSubset = join(fixture.external, 'wave-1-pass-b');
    expect(invoke('prepare-pass-b', join(fixture.external, 'pass-b-prepare-status.json'), ['--reviewer-output', passBSubset]).status).toBe(0);
    const preparedSubset = readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8');

    const firstResult = { pairRef: manifestRefs[0], observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' } };
    const firstPassB = join(fixture.external, 'wave-1-pass-b-first.json');
    writeJson(firstPassB, { result: firstResult, receipt: workflowReceipt('pass-b', fixture.key.contract, sidecar, firstResult, [manifestRefs[0]]) });
    expect(invoke('ingest-pass-b', join(fixture.external, 'pass-b-first-status.json'), ['--submission', firstPassB]).status).toBe(0);
    const journalBeforeResume = readdirSync(join(journal, 'events')).sort().map((file) => [file, readFileSync(join(journal, 'events', file), 'utf8')]);

    const retained = join(fixture.external, 'pass-b-retained-resume.json');
    expect(invoke('resume', retained, ['--reviewer-output', passBSubset]).status).toBe(0);
    expect(JSON.parse(readFileSync(retained, 'utf8'))).toMatchObject({ activeStage: 'pass-b-pending' });
    expect(readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8')).toBe(preparedSubset);
    expect(readdirSync(join(journal, 'events')).sort().map((file) => [file, readFileSync(join(journal, 'events', file), 'utf8')])).toEqual(journalBeforeResume);

    rmSync(passBSubset, { recursive: true, force: true });
    const recreated = join(fixture.external, 'pass-b-recreated-resume.json');
    expect(invoke('resume', recreated, ['--reviewer-output', passBSubset]).status).toBe(0);
    expect(JSON.parse(readFileSync(recreated, 'utf8'))).toMatchObject({ activeStage: 'pass-b-pending' });
    expect(readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8')).toBe(preparedSubset);
    expect(readdirSync(join(journal, 'events')).sort().map((file) => [file, readFileSync(join(journal, 'events', file), 'utf8')])).toEqual(journalBeforeResume);
  });

  it('treats recorded B and Pass B exports as immutable evidence across commands and recovery', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    const events = () => readdirSync(join(journal, 'events')).sort().map((file) => [file, readFileSync(join(journal, 'events', file), 'utf8')]);
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);
    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const manifestEntry = sidecar.entries.find((entry: { purpose: string }) => entry.purpose === 'manifest');
    const aResults = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' : 'not-confusable' }));
    const aPath = join(fixture.external, 'a.json');
    writeJson(aPath, { results: aResults, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, aResults, aResults.map((result: { pairRef: string }) => result.pairRef)) });
    expect(invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', aPath]).status).toBe(0);

    const bSubset = join(fixture.external, 'b-subset');
    expect(invoke('prepare-b', join(fixture.external, 'prepare-b.json'), ['--reviewer-output', bSubset]).status).toBe(0);
    const preparedB = readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8');
    rmSync(bSubset, { recursive: true });
    expect(invoke('resume', join(fixture.external, 'resume-b.json'), ['--reviewer-output', bSubset]).status).toBe(0);
    expect(readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8')).toBe(preparedB);

    const bResults = [{ pairRef: manifestEntry.pairRef, visualOutcome: 'confusable' }];
    const bPath = join(fixture.external, 'b.json');
    writeJson(bPath, { results: bResults, receipt: workflowReceipt('reviewer-b', fixture.key.contract, sidecar, bResults, [manifestEntry.pairRef]) });
    const assertRejectedWithoutMutation = (label: string, command: string, extra: readonly string[]) => {
      const output = join(fixture.external, `${label}.json`);
      const before = events();
      const rejected = invoke(command, output, extra);
      expect(rejected.status, rejected.output).not.toBe(0);
      expect(existsSync(output)).toBe(false);
      expect(events()).toEqual(before);
    };
    writeFileSync(join(bSubset, 'secret.txt'), 'controller secret');
    assertRejectedWithoutMutation('secret-before-ingest', 'ingest-b', ['--submission', bPath]);
    rmSync(join(bSubset, 'secret.txt'));
    writeFileSync(join(bSubset, 'reviewer-subset.json'), '{"drift":true}\n');
    assertRejectedWithoutMutation('drift-before-ingest', 'ingest-b', ['--submission', bPath]);
    writeFileSync(join(bSubset, 'reviewer-subset.json'), preparedB);
    mkdirSync(join(bSubset, 'empty'));
    assertRejectedWithoutMutation('empty-before-prepare', 'prepare-pass-b', ['--reviewer-output', join(fixture.external, 'pass-b-subset')]);
    rmSync(join(bSubset, 'empty'), { recursive: true });

    expect(invoke('ingest-b', join(fixture.external, 'b-status.json'), ['--submission', bPath]).status).toBe(0);
    const passBSubset = join(fixture.external, 'pass-b-subset');
    expect(invoke('prepare-pass-b', join(fixture.external, 'prepare-pass-b.json'), ['--reviewer-output', passBSubset]).status).toBe(0);
    const preparedPassB = readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8');
    const passBResult = { pairRef: manifestEntry.pairRef, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' } };
    const passBPath = join(fixture.external, 'pass-b.json');
    writeJson(passBPath, { result: passBResult, receipt: workflowReceipt('pass-b', fixture.key.contract, sidecar, passBResult, [manifestEntry.pairRef]) });
    writeFileSync(join(passBSubset, 'reviewer-subset.json'), '{"drift":true}\n');
    assertRejectedWithoutMutation('drift-before-pass-b-ingest', 'ingest-pass-b', ['--submission', passBPath]);
    writeFileSync(join(passBSubset, 'reviewer-subset.json'), preparedPassB);
    expect(invoke('ingest-pass-b', join(fixture.external, 'pass-b-status.json'), ['--submission', passBPath]).status).toBe(0);
    mkdirSync(join(passBSubset, 'empty'));
    assertRejectedWithoutMutation('empty-before-finalize', 'finalize', []);
    rmSync(join(passBSubset, 'empty'), { recursive: true });
    expect(invoke('finalize', join(fixture.external, 'finalize.json')).status).toBe(0);

    writeFileSync(join(passBSubset, 'reviewer-subset.json'), '{"terminal-drift":true}\n');
    const nonce = '30303030-3030-4030-8030-303030303030';
    const lock = join(journal, '.unicode-review-journal.lock');
    const partial = join(journal, 'events', `.${String(readdirSync(join(journal, 'events')).filter((entry) => entry.endsWith('.json')).length + 1).padStart(16, '0')}.json.partial-${nonce}`);
    writeFileSync(lock, `{"ownerNonce":"${nonce}","ownerPid":999999999,"protocolVersion":"unicode-review-journal-v1"}\n`);
    writeFileSync(partial, 'stopped writer partial');
    const lockBytes = readFileSync(lock, 'utf8');
    const partialBytes = readFileSync(partial, 'utf8');
    const recovery = invoke('recover', join(fixture.external, 'recover-drift.json'));
    expect(recovery.status, recovery.output).not.toBe(0);
    expect(existsSync(join(fixture.external, 'recover-drift.json'))).toBe(false);
    expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
    expect(readFileSync(partial, 'utf8')).toBe(partialBytes);
    writeFileSync(join(passBSubset, 'reviewer-subset.json'), preparedPassB);
    expect(invoke('recover', join(fixture.external, 'recover-clean.json')).status).toBe(0);
    rmSync(passBSubset, { recursive: true });
    const missingTerminal = invoke('resume', join(fixture.external, 'missing-terminal.json'));
    expect(missingTerminal.status, missingTerminal.output).not.toBe(0);
    expect(existsSync(join(fixture.external, 'missing-terminal.json'))).toBe(false);
  });

  it('recreates missing zero-ref Reviewer B and Pass B exports only through resume', () => {
    const start = (label: string, manifestOutcome: 'confusable' | 'not-confusable') => {
      const fixture = createCalibrationCommandFixture();
      const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
      const waveInput = join(fixture.external, 'wave-1-input.json');
      writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
      const descriptor = join(fixture.external, 'workflow-descriptor.json');
      const journal = join(fixture.external, 'workflow-journal');
      const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
      const controllerOutput = join(fixture.external, 'wave-1-controller');
      writeJson(descriptor, {
        calibrationContextPath: fixture.descriptorPath,
        sealedKeyPath: fixture.keyPath,
        calibrationSubmissionPath: fixture.submissionPath,
        journalPath: journal,
        waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
      });
      const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
      expect(invoke('init', join(fixture.external, `${label}-init.json`)).status).toBe(0);
      expect(invoke('plan', join(fixture.external, `${label}-plan.json`), ['--wave-id', 'wave-1']).status).toBe(0);
      const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
      const manifest = sidecar.entries.find((entry: { purpose: string }) => entry.purpose === 'manifest');
      const results = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? manifestOutcome : 'not-confusable' }));
      const aPath = join(fixture.external, `${label}-a.json`);
      writeJson(aPath, { results, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, results, results.map((result: { pairRef: string }) => result.pairRef)) });
      expect(invoke('ingest-a', join(fixture.external, `${label}-a-status.json`), ['--submission', aPath]).status).toBe(0);
      return { fixture, invoke, sidecar, manifest, reviewerOutput };
    };

    const zeroB = start('zero-b', 'not-confusable');
    const zeroBSubset = join(zeroB.fixture.external, 'zero-b-subset');
    expect(zeroB.invoke('prepare-b', join(zeroB.fixture.external, 'zero-b-prepare.json'), ['--reviewer-output', zeroBSubset]).status).toBe(0);
    const zeroBBytes = readFileSync(join(zeroBSubset, 'reviewer-subset.json'), 'utf8');
    expect(JSON.parse(zeroBBytes).items).toEqual([]);
    rmSync(zeroBSubset, { recursive: true });
    expect(zeroB.invoke('resume', join(zeroB.fixture.external, 'zero-b-resume.json'), ['--reviewer-output', zeroBSubset]).status).toBe(0);
    expect(readFileSync(join(zeroBSubset, 'reviewer-subset.json'), 'utf8')).toBe(zeroBBytes);

    const zeroPassB = start('zero-pass-b', 'confusable');
    const bSubset = join(zeroPassB.fixture.external, 'b-subset');
    expect(zeroPassB.invoke('prepare-b', join(zeroPassB.fixture.external, 'b-prepare.json'), ['--reviewer-output', bSubset]).status).toBe(0);
    const bResults = [{ pairRef: zeroPassB.manifest.pairRef, visualOutcome: 'not-confusable' }];
    const bPath = join(zeroPassB.fixture.external, 'b.json');
    writeJson(bPath, { results: bResults, receipt: workflowReceipt('reviewer-b', zeroPassB.fixture.key.contract, zeroPassB.sidecar, bResults, [zeroPassB.manifest.pairRef]) });
    expect(zeroPassB.invoke('ingest-b', join(zeroPassB.fixture.external, 'b-status.json'), ['--submission', bPath]).status).toBe(0);
    const zeroPassBSubset = join(zeroPassB.fixture.external, 'zero-pass-b-subset');
    expect(zeroPassB.invoke('prepare-pass-b', join(zeroPassB.fixture.external, 'zero-pass-b-prepare.json'), ['--reviewer-output', zeroPassBSubset]).status).toBe(0);
    const zeroPassBBytes = readFileSync(join(zeroPassBSubset, 'reviewer-subset.json'), 'utf8');
    expect(JSON.parse(zeroPassBBytes).items).toEqual([]);
    rmSync(zeroPassBSubset, { recursive: true });
    const resumed = zeroPassB.invoke('resume', join(zeroPassB.fixture.external, 'zero-pass-b-resume.json'), ['--reviewer-output', zeroPassBSubset]);
    expect(resumed.status, resumed.output).toBe(0);
    expect(JSON.parse(readFileSync(join(zeroPassB.fixture.external, 'zero-pass-b-resume.json'), 'utf8'))).toMatchObject({ activeStage: 'pass-b-pending' });
    expect(readFileSync(join(zeroPassBSubset, 'reviewer-subset.json'), 'utf8')).toBe(zeroPassBBytes);
  });

  it('persists chosen subset roots, fences later status output, and permits only the recorded resume path', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);

    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const manifestEntry = sidecar.entries.find((entry: { purpose: string }) => entry.purpose === 'manifest');
    const aResults = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' : 'not-confusable' }));
    const aPath = join(fixture.external, 'wave-1-a.json');
    writeJson(aPath, { results: aResults, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, aResults, aResults.map((result: { pairRef: string }) => result.pairRef)) });
    expect(invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', aPath]).status).toBe(0);

    const bSubset = join(fixture.external, 'wave-1-b');
    const bPrepare = invoke('prepare-b', join(fixture.external, 'b-prepare-status.json'), ['--reviewer-output', bSubset]);
    expect(bPrepare.status, bPrepare.output).toBe(0);
    const bPrepareStatus = JSON.parse(readFileSync(join(fixture.external, 'b-prepare-status.json'), 'utf8'));
    expect(bPrepareStatus.recordedSubsetRoots).toEqual([realpathSync(bSubset)]);
    expect(bPrepareStatus.recordedWaves[0].reviewerBSubsetOutputPath).toBe(realpathSync(bSubset));

    const finalizedEventsBefore = readdirSync(join(journal, 'events')).sort();
    const nestedStatus = join(bSubset, 'later-status.json');
    const fenced = invoke('resume', nestedStatus);
    expect(fenced.status, fenced.output).not.toBe(0);
    expect(fenced.output).toMatch(/disjoint/i);
    expect(existsSync(nestedStatus)).toBe(false);
    expect(readdirSync(join(journal, 'events')).sort()).toEqual(finalizedEventsBefore);

    const mismatched = invoke('resume', join(fixture.external, 'b-mismatch-status.json'), ['--reviewer-output', join(fixture.external, 'other-b')]);
    expect(mismatched.status, mismatched.output).not.toBe(0);
    expect(mismatched.output).toMatch(/recorded/i);
    expect(existsSync(join(fixture.external, 'other-b'))).toBe(false);
    expect(invoke('resume', join(fixture.external, 'b-resume-status.json'), ['--reviewer-output', bSubset]).status).toBe(0);

    const bResults = [{ pairRef: manifestEntry.pairRef, visualOutcome: 'confusable' }];
    const bPath = join(fixture.external, 'wave-1-b.json');
    writeJson(bPath, { results: bResults, receipt: workflowReceipt('reviewer-b', fixture.key.contract, sidecar, bResults, [manifestEntry.pairRef]) });
    expect(invoke('ingest-b', join(fixture.external, 'b-status.json'), ['--submission', bPath]).status).toBe(0);
    const passBSubset = join(fixture.external, 'wave-1-pass-b');
    expect(invoke('prepare-pass-b', join(fixture.external, 'pass-b-prepare-status.json'), ['--reviewer-output', passBSubset]).status).toBe(0);
    const result = { pairRef: manifestEntry.pairRef, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' } };
    const passBPath = join(fixture.external, 'wave-1-pass-b.json');
    writeJson(passBPath, { result, receipt: workflowReceipt('pass-b', fixture.key.contract, sidecar, result, [manifestEntry.pairRef]) });
    expect(invoke('ingest-pass-b', join(fixture.external, 'pass-b-status.json'), ['--submission', passBPath]).status).toBe(0);
    expect(invoke('finalize', join(fixture.external, 'finalize.json')).status).toBe(0);

    const finalStatus = JSON.parse(readFileSync(join(fixture.external, 'finalize.json'), 'utf8'));
    expect(finalStatus.recordedSubsetRoots).toEqual([realpathSync(bSubset), realpathSync(passBSubset)].sort());
    const retained = invoke('resume', join(fixture.external, 'retained-after-finalize.json'));
    expect(retained.status, retained.output).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.external, 'retained-after-finalize.json'), 'utf8')).recordedSubsetRoots).toEqual([realpathSync(bSubset), realpathSync(passBSubset)].sort());

    const recoveryNonce = '27272727-2727-4272-8272-272727272727';
    const recoveryLock = join(journal, '.unicode-review-journal.lock');
    writeFileSync(recoveryLock, `{"ownerNonce":"${recoveryNonce}","ownerPid":999999999,"protocolVersion":"unicode-review-journal-v1"}\n`);
    const recoveryPartial = join(journal, 'events', `.${String(readdirSync(join(journal, 'events')).filter((entry) => entry.endsWith('.json')).length + 1).padStart(16, '0')}.json.partial-${recoveryNonce}`);
    writeFileSync(recoveryPartial, 'stopped writer partial');
    const recoveryLockBytes = readFileSync(recoveryLock, 'utf8');
    const recoveryPartialBytes = readFileSync(recoveryPartial, 'utf8');
    const unsafeRecovery = invoke('recover', join(bSubset, 'unsafe-recover.json'));
    expect(unsafeRecovery.status, unsafeRecovery.output).not.toBe(0);
    expect(existsSync(join(bSubset, 'unsafe-recover.json'))).toBe(false);
    expect(readFileSync(recoveryLock, 'utf8')).toBe(recoveryLockBytes);
    expect(readFileSync(recoveryPartial, 'utf8')).toBe(recoveryPartialBytes);

    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: join(passBSubset, 'moved-controller') }],
    });
    const movedRole = invoke('recover', join(fixture.external, 'moved-role-recover.json'));
    expect(movedRole.status, movedRole.output).not.toBe(0);
    expect(existsSync(join(fixture.external, 'moved-role-recover.json'))).toBe(false);
    expect(readFileSync(recoveryLock, 'utf8')).toBe(recoveryLockBytes);
    expect(readFileSync(recoveryPartial, 'utf8')).toBe(recoveryPartialBytes);

    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const recoveredStoppedWriter = invoke('recover', join(fixture.external, 'recovered-stopped-writer.json'));
    expect(recoveredStoppedWriter.status, recoveredStoppedWriter.output).toBe(0);
    expect(existsSync(recoveryLock)).toBe(false);
    expect(existsSync(recoveryPartial)).toBe(false);
    const postFinalNested = join(bSubset, 'post-final-status.json');
    const postFinal = invoke('resume', postFinalNested);
    expect(postFinal.status, postFinal.output).not.toBe(0);
    expect(existsSync(postFinalNested)).toBe(false);

    const eventsBefore = readdirSync(join(journal, 'events')).sort();
    const bManifestBefore = readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8');
    const passBManifestBefore = readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8');
    const nestedWaveInput = join(bSubset, 'later-wave-input.json');
    copyFileSync(waveInput, nestedWaveInput);
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [
        { waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput },
        { waveId: 'wave-2', inputPath: nestedWaveInput, reviewerOutputPath: join(fixture.external, 'wave-2-reviewer'), controllerOutputPath: join(passBSubset, 'later-controller') },
      ],
    });
    const leakedWave = invoke('plan', join(fixture.external, 'leaked-wave-status.json'), ['--wave-id', 'wave-2']);
    expect(leakedWave.status, leakedWave.output).not.toBe(0);
    expect(leakedWave.output).toMatch(/recorded reviewer subset output|disjoint/i);
    expect(existsSync(join(fixture.external, 'leaked-wave-status.json'))).toBe(false);
    expect(existsSync(join(passBSubset, 'later-controller'))).toBe(false);
    expect(readdirSync(join(journal, 'events')).sort()).toEqual(eventsBefore);
    expect(readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8')).toBe(bManifestBefore);
    expect(readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8')).toBe(passBManifestBefore);

    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const nestedSubmission = join(passBSubset, 'later-reviewer-a.json');
    copyFileSync(aPath, nestedSubmission);
    const leakedSubmission = invoke('ingest-a', join(fixture.external, 'leaked-submission-status.json'), ['--submission', nestedSubmission]);
    expect(leakedSubmission.status, leakedSubmission.output).not.toBe(0);
    expect(leakedSubmission.output).toMatch(/recorded reviewer subset output|disjoint/i);
    expect(existsSync(join(fixture.external, 'leaked-submission-status.json'))).toBe(false);
    expect(readdirSync(join(journal, 'events')).sort()).toEqual(eventsBefore);
    expect(readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8')).toBe(bManifestBefore);
    expect(readFileSync(join(passBSubset, 'reviewer-subset.json'), 'utf8')).toBe(passBManifestBefore);
  });

  it('retries an exact empty initialization journal and recovers a stopped initializer without accepting a foreign root', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const writeDescriptor = (journalPath: string) => writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: join(fixture.external, 'wave-1-reviewer'), controllerOutputPath: join(fixture.external, 'wave-1-controller') }],
    });
    writeDescriptor(journal);
    const invoke = (command: string, output: string) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output], join(fixture.external, 'caller-cwd'));

    expect(invoke('init', join(fixture.external, 'first-init.json')).status).toBe(0);
    const initialEvent = readdirSync(join(journal, 'events'));
    expect(initialEvent).toHaveLength(1);
    unlinkSync(join(journal, 'events', initialEvent[0]));
    const retried = invoke('init', join(fixture.external, 'retry-init.json'));
    expect(retried.status, retried.output).toBe(0);
    expect(readdirSync(join(journal, 'events'))).toHaveLength(1);

    unlinkSync(join(journal, 'events', readdirSync(join(journal, 'events'))[0]));
    writeFileSync(
      join(journal, '.unicode-review-journal.lock'),
      '{"ownerNonce":"00000000-0000-4000-8000-000000000000","ownerPid":999999999,"protocolVersion":"unicode-review-journal-v1"}\n',
    );
    const recovered = invoke('recover', join(fixture.external, 'recover-init.json'));
    expect(recovered.status, recovered.output).toBe(0);
    expect(readdirSync(join(journal, 'events'))).toHaveLength(1);
    expect(existsSync(join(journal, '.unicode-review-journal.lock'))).toBe(false);

    const foreignJournal = join(fixture.external, 'foreign-journal');
    mkdirSync(foreignJournal);
    writeFileSync(join(foreignJournal, 'keep.txt'), 'preserve');
    writeDescriptor(foreignJournal);
    const foreign = invoke('init', join(fixture.external, 'foreign-init.json'));
    expect(foreign.status, foreign.output).not.toBe(0);
    expect(readFileSync(join(foreignJournal, 'keep.txt'), 'utf8')).toBe('preserve');
  });

  it('preserves a stopped workflow journal when semantic recovery replay rejects its hash-valid event', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: join(fixture.external, 'wave-1-reviewer'), controllerOutputPath: join(fixture.external, 'wave-1-controller') }],
    });
    const invoke = (command: string, output: string) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output], join(fixture.external, 'caller-cwd'));
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    appendUnicodeReviewJournalEvent(journal, loadUnicodeReviewJournal(journal).tip, { type: 'hash-valid-but-semantic-invalid' });
    const nonce = '26262626-2626-4262-8262-262626262626';
    const lock = join(journal, '.unicode-review-journal.lock');
    writeFileSync(lock, `{"ownerNonce":"${nonce}","ownerPid":999999999,"protocolVersion":"unicode-review-journal-v1"}\n`);
    const partial = join(journal, 'events', `.0000000000000003.json.partial-${nonce}`);
    writeFileSync(partial, 'unfinished recovery writer');
    const lockBytes = readFileSync(lock, 'utf8');
    const partialBytes = readFileSync(partial, 'utf8');

    const output = join(fixture.external, 'recover.json');
    const recovered = invoke('recover', output);
    expect(recovered.status, recovered.output).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
    expect(readFileSync(partial, 'utf8')).toBe(partialBytes);
  });

  it('recovers a stopped planned wave with both unpublished artifacts absent, but preserves a partial pair', () => {
    const createPlannedFixture = () => {
      const fixture = createCalibrationCommandFixture();
      const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
      const waveInput = join(fixture.external, 'wave-1-input.json');
      writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
      const descriptor = join(fixture.external, 'workflow-descriptor.json');
      const journal = join(fixture.external, 'workflow-journal');
      const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
      const controllerOutput = join(fixture.external, 'wave-1-controller');
      writeJson(descriptor, {
        calibrationContextPath: fixture.descriptorPath,
        sealedKeyPath: fixture.keyPath,
        calibrationSubmissionPath: fixture.submissionPath,
        journalPath: journal,
        waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
      });
      const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
      expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
      expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);
      return { fixture, journal, reviewerOutput, controllerOutput, invoke };
    };
    const stopWriter = (journal: string, nonce: string) => {
      const lock = join(journal, '.unicode-review-journal.lock');
      writeFileSync(lock, `{"ownerNonce":"${nonce}","ownerPid":999999999,"protocolVersion":"unicode-review-journal-v1"}\n`);
      const partial = join(journal, 'events', `.${String(readdirSync(join(journal, 'events')).filter((entry) => entry.endsWith('.json')).length + 1).padStart(16, '0')}.json.partial-${nonce}`);
      writeFileSync(partial, 'stopped writer partial');
      return { lock, partial, lockBytes: readFileSync(lock, 'utf8'), partialBytes: readFileSync(partial, 'utf8') };
    };

    const unpublished = createPlannedFixture();
    const reviewerBundle = readFileSync(join(unpublished.reviewerOutput, 'reviewer-bundle.json'), 'utf8');
    const controllerSidecar = readFileSync(join(unpublished.controllerOutput, 'controller-sidecar.json'), 'utf8');
    rmSync(unpublished.reviewerOutput, { recursive: true, force: true });
    rmSync(unpublished.controllerOutput, { recursive: true, force: true });
    const stoppedUnpublished = stopWriter(unpublished.journal, '28282828-2828-4282-8282-282828282828');
    const recoveredOutput = join(unpublished.fixture.external, 'recover.json');
    const recovered = unpublished.invoke('recover', recoveredOutput);
    expect(recovered.status, recovered.output).toBe(0);
    expect(existsSync(unpublished.reviewerOutput)).toBe(false);
    expect(existsSync(unpublished.controllerOutput)).toBe(false);
    expect(existsSync(stoppedUnpublished.lock)).toBe(false);
    expect(existsSync(stoppedUnpublished.partial)).toBe(false);

    const resumed = unpublished.invoke('resume', join(unpublished.fixture.external, 'resume.json'));
    expect(resumed.status, resumed.output).toBe(0);
    expect(readFileSync(join(unpublished.reviewerOutput, 'reviewer-bundle.json'), 'utf8')).toBe(reviewerBundle);
    expect(readFileSync(join(unpublished.controllerOutput, 'controller-sidecar.json'), 'utf8')).toBe(controllerSidecar);

    const partialPair = createPlannedFixture();
    rmSync(partialPair.controllerOutput, { recursive: true, force: true });
    const stoppedPartial = stopWriter(partialPair.journal, '29292929-2929-4292-8292-292929292929');
    const rejectedOutput = join(partialPair.fixture.external, 'recover-partial.json');
    const rejected = partialPair.invoke('recover', rejectedOutput);
    expect(rejected.status, rejected.output).not.toBe(0);
    expect(existsSync(rejectedOutput)).toBe(false);
    expect(readFileSync(stoppedPartial.lock, 'utf8')).toBe(stoppedPartial.lockBytes);
    expect(readFileSync(stoppedPartial.partial, 'utf8')).toBe(stoppedPartial.partialBytes);
    expect(existsSync(partialPair.reviewerOutput)).toBe(true);
    expect(existsSync(partialPair.controllerOutput)).toBe(false);
  });

  it('recovers an existing B subset when its active wave publication pair is absent', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);
    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const manifest = sidecar.entries.find((entry: { purpose: string }) => entry.purpose === 'manifest');
    const aResults = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' : 'not-confusable' }));
    const aPath = join(fixture.external, 'a.json');
    writeJson(aPath, { results: aResults, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, aResults, aResults.map((result: { pairRef: string }) => result.pairRef)) });
    expect(invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', aPath]).status).toBe(0);
    const bSubset = join(fixture.external, 'b-subset');
    expect(invoke('prepare-b', join(fixture.external, 'prepare-b.json'), ['--reviewer-output', bSubset]).status).toBe(0);
    const savedSubset = readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8');
    rmSync(reviewerOutput, { recursive: true });
    rmSync(controllerOutput, { recursive: true });
    const nonce = '31313131-3131-4131-8131-313131313131';
    const lock = join(journal, '.unicode-review-journal.lock');
    const partial = join(journal, 'events', `.${String(readdirSync(join(journal, 'events')).filter((entry) => entry.endsWith('.json')).length + 1).padStart(16, '0')}.json.partial-${nonce}`);
    writeFileSync(lock, `{"ownerNonce":"${nonce}","ownerPid":999999999,"protocolVersion":"unicode-review-journal-v1"}\n`);
    writeFileSync(partial, 'stopped writer partial');
    expect(invoke('recover', join(fixture.external, 'recover.json')).status).toBe(0);
    expect(existsSync(reviewerOutput)).toBe(false);
    expect(existsSync(controllerOutput)).toBe(false);
    expect(invoke('resume', join(fixture.external, 'resume.json'), ['--reviewer-output', bSubset]).status).toBe(0);
    expect(readFileSync(join(bSubset, 'reviewer-subset.json'), 'utf8')).toBe(savedSubset);
    expect(existsSync(reviewerOutput)).toBe(true);
    expect(existsSync(controllerOutput)).toBe(true);
    expect(manifest.pairRef).toBeDefined();
  });

  it('rejects workflow initialization when the external calibration no longer authorizes it', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    writeJson(fixture.keyPath, { ...fixture.key, contract: { ...fixture.key.contract, reviewerModelVersion: 'stale-reviewer' } });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: join(fixture.external, 'workflow-journal'),
      waves: [],
    });
    const output = join(fixture.external, 'init.json');
    const result = runWorkflow(workflowScript, 'init', ['--descriptor', descriptor, '--output', output], join(fixture.external, 'caller-cwd'));
    expect(result.status, result.output).not.toBe(0);
    expect(existsSync(output)).toBe(false);
  });

  it('records a strong-negative Reviewer A sentinel invalidation as a nonzero machine result', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);
    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const results = sidecar.entries.map((entry: { pairRef: string }) => ({ pairRef: entry.pairRef, visualOutcome: 'confusable' }));
    const submission = { results, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, results, results.map((result: { pairRef: string }) => result.pairRef)) };
    const submissionPath = join(fixture.external, 'wave-1-invalidating-a.json');
    const output = join(fixture.external, 'invalidated-status.json');
    writeJson(submissionPath, submission);
    const result = invoke('ingest-a', output, ['--submission', submissionPath]);
    expect(result.status, result.output).not.toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({ action: 'ingest-a', activeWaveId: null, recordedWaves: [{ waveId: 'wave-1', terminalState: 'invalidated' }] });
  });

  it('delegates malformed Reviewer B JSON to the core invalidation boundary', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);
    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const aResults = sidecar.entries.map((entry: { pairRef: string; purpose: string }) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' : 'not-confusable' }));
    const aPath = join(fixture.external, 'wave-1-a.json');
    writeJson(aPath, { results: aResults, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, aResults, aResults.map((result: { pairRef: string }) => result.pairRef)) });
    expect(invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', aPath]).status).toBe(0);
    expect(invoke('prepare-b', join(fixture.external, 'b-prepare-status.json'), ['--reviewer-output', join(fixture.external, 'b-reviewer')]).status).toBe(0);
    const malformedPath = join(fixture.external, 'wave-1-malformed-b.json');
    const rejectedOutput = join(fixture.external, 'b-rejected-status.json');
    writeJson(malformedPath, []);
    const rejected = invoke('ingest-b', rejectedOutput, ['--submission', malformedPath]);
    expect(rejected.status, rejected.output).not.toBe(0);
    expect(existsSync(rejectedOutput)).toBe(false);
    const eventNames = readdirSync(join(journal, 'events')).sort();
    const terminalEvent = JSON.parse(readFileSync(join(journal, 'events', eventNames.at(-1)!), 'utf8'));
    expect(terminalEvent.payload).toMatchObject({ type: 'wave-invalidated', waveId: 'wave-1', stage: 'b', reason: 'classification-schema-or-binding-failure', submission: null });
    expect(JSON.stringify(terminalEvent.payload)).not.toContain('results');
    const resumedOutput = join(fixture.external, 'resume-status.json');
    const resumed = invoke('resume', resumedOutput);
    expect(resumed.status, resumed.output).toBe(0);
    expect(JSON.parse(readFileSync(resumedOutput, 'utf8'))).toMatchObject({ activeWaveId: null, recordedWaves: [{ waveId: 'wave-1', terminalState: 'invalidated' }], promotions: [] });
  });

  it('rejects reviewer/container-nested status and subset destinations before journal mutation', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-1-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const reviewerOutput = join(fixture.external, 'wave-1-reviewer');
    const controllerOutput = join(fixture.external, 'wave-1-controller');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: reviewerOutput, controllerOutputPath: controllerOutput }],
    });
    const invoke = (command: string, output: string, extra: readonly string[] = []) => runWorkflow(workflowScript, command, ['--descriptor', descriptor, '--output', output, ...extra], join(fixture.external, 'caller-cwd'));
    expect(invoke('init', join(fixture.external, 'init.json')).status).toBe(0);
    expect(invoke('plan', join(fixture.external, 'plan.json'), ['--wave-id', 'wave-1']).status).toBe(0);
    const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
    const results = sidecar.entries.map((entry: { pairRef: string }) => ({ pairRef: entry.pairRef, visualOutcome: 'not-confusable' }));
    const submissionPath = join(fixture.external, 'wave-1-a.json');
    writeJson(submissionPath, { results, receipt: workflowReceipt('reviewer-a', fixture.key.contract, sidecar, results, results.map((result: { pairRef: string }) => result.pairRef)) });
    const journalEvents = () => readdirSync(join(journal, 'events')).sort();
    const beforeA = journalEvents();
    for (const [label, root] of [
      ['calibration reviewer', fixture.reviewerOutput],
      ['wave reviewer', reviewerOutput],
      ['wave controller', controllerOutput],
      ['journal', journal],
    ] as const) {
      const output = join(root, `forbidden-${label.replaceAll(' ', '-')}-status.json`);
      const rejected = invoke('ingest-a', output, ['--submission', submissionPath]);
      expect(rejected.status, rejected.output).not.toBe(0);
      expect(existsSync(output)).toBe(false);
      expect(journalEvents()).toEqual(beforeA);
    }
    const acceptedA = invoke('ingest-a', join(fixture.external, 'a-status.json'), ['--submission', submissionPath]);
    expect(acceptedA.status, acceptedA.output).toBe(0);

    const beforePrepare = journalEvents();
    for (const [label, root] of [['journal', journal], ['controller', controllerOutput], ['reviewer', reviewerOutput]] as const) {
      const subset = join(root, `forbidden-${label}-subset`);
      const rejected = invoke('prepare-b', join(fixture.external, `forbidden-${label}-prepare-status.json`), ['--reviewer-output', subset]);
      expect(rejected.status, rejected.output).not.toBe(0);
      expect(existsSync(subset)).toBe(false);
      expect(journalEvents()).toEqual(beforePrepare);
    }
    const acceptedB = invoke('prepare-b', join(fixture.external, 'b-prepare-status.json'), ['--reviewer-output', join(fixture.external, 'wave-1-b')]);
    expect(acceptedB.status, acceptedB.output).toBe(0);
  });

  it('rejects a cross-wave controller root nested in another reviewer root before initialization', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const waveInput = join(fixture.external, 'wave-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    const waveOneReviewer = join(fixture.external, 'wave-1-reviewer');
    const writeDescriptor = (waveTwoController: string) => writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [
        { waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: waveOneReviewer, controllerOutputPath: join(fixture.external, 'wave-1-controller') },
        { waveId: 'wave-2', inputPath: waveInput, reviewerOutputPath: join(fixture.external, 'wave-2-reviewer'), controllerOutputPath: waveTwoController },
      ],
    });
    writeDescriptor(join(waveOneReviewer, 'nested-controller'));
    const rejected = runWorkflow(workflowScript, 'init', ['--descriptor', descriptor, '--output', join(fixture.external, 'rejected-init.json')], join(fixture.external, 'caller-cwd'));
    expect(rejected.status, rejected.output).not.toBe(0);
    expect(existsSync(journal)).toBe(false);
    writeDescriptor(join(fixture.external, 'wave-2-controller'));
    const accepted = runWorkflow(workflowScript, 'init', ['--descriptor', descriptor, '--output', join(fixture.external, 'accepted-init.json')], join(fixture.external, 'caller-cwd'));
    expect(accepted.status, accepted.output).toBe(0);
    expect(existsSync(journal)).toBe(true);
  });

  it('rejects an artifact root that would contain a controller input before initialization', () => {
    const fixture = createCalibrationCommandFixture();
    const workflowScript = join(fixture.repository, 'scripts/run_unicode_review_workflow_v021.ts');
    const nestedReviewer = join(fixture.external, 'nested-reviewer');
    mkdirSync(nestedReviewer);
    const waveInput = join(nestedReviewer, 'wave-input.json');
    writeJson(waveInput, { items: [JSON.parse(readFileSync(fixture.input, 'utf8')).items.find((item: { purpose: string }) => item.purpose === 'manifest')] });
    const descriptor = join(fixture.external, 'workflow-descriptor.json');
    const journal = join(fixture.external, 'workflow-journal');
    writeJson(descriptor, {
      calibrationContextPath: fixture.descriptorPath,
      sealedKeyPath: fixture.keyPath,
      calibrationSubmissionPath: fixture.submissionPath,
      journalPath: journal,
      waves: [{ waveId: 'wave-1', inputPath: waveInput, reviewerOutputPath: nestedReviewer, controllerOutputPath: join(fixture.external, 'wave-1-controller') }],
    });
    const rejected = runWorkflow(workflowScript, 'init', ['--descriptor', descriptor, '--output', join(fixture.external, 'rejected-init.json')], join(fixture.external, 'caller-cwd'));
    expect(rejected.status, rejected.output).not.toBe(0);
    expect(existsSync(journal)).toBe(false);
  });
});
