import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

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
    const bExport = join(fixture.external, 'wave-1-b-export');
    const bResumed = invoke('resume', join(fixture.external, 'b-resume-status.json'), ['--reviewer-output', bExport]);
    expect(bResumed.status, bResumed.output).toBe(0);
    const bSubset = JSON.parse(readFileSync(join(bExport, 'reviewer-subset.json'), 'utf8'));
    expect(Object.keys(bSubset).sort()).toEqual(['items', 'protocolVersion']);
    expect(JSON.stringify(bSubset)).not.toContain('visualOutcome');
    expect(bSubset.items.map((item: { pairRef: string }) => item.pairRef)).toEqual([manifestEntry.pairRef]);

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
    const passBExport = join(fixture.external, 'wave-1-pass-b-export');
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
